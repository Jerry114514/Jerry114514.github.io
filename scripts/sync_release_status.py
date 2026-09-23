# -*- coding: utf-8 -*-
"""按「发行日期已到」自动把战争债券 / 强化资源的 `release_status` 从 `unreleased` 翻成 `released`。

背景（2026-09-23 登记）
--------------------
「民主铁壁」上架后，站内仍标着**未发布**，强化资源的价格还是「待发布」—— 这类状态**只能靠人记得改**，
一旦忘了就会一直错下去（而且 CI 不会红，属"绿着但不对"）。本脚本把这件事变成每日自动检查。

两条规则（都只用站内已有数据，不联网、不猜）
-------------------------------------------
1. **债券**：`release_date <= 今天` ⇒ `release_status = "released"`。
   `release_date` 早已在 `warbonds.json` 里（上游 infobox 的 `date`，`YYYY-MM-DD`）。
2. **强化资源**：它所属债券已发布 ⇒ 自己也已发布；并**从债券的逐页奖励表里继承**页号与勋章价格
   （表里那一行是权威展示口径；表里价格是 `—` 时只翻状态、把"价格未知"报出来交给人补）。

三条纪律
--------
* **单向**：只翻 `unreleased → released`，**永不回退**（发行不会取消）。
* **先校验后写盘**：写盘前先验证 `json.dumps(indent=2)` 能逐字节复现原文件；CI 侧还要过
  `validate_wiki_data.py` 才提交（见 .github/workflows/sync-release-status.yml）。
* **散文不动**：`intro_zh` / `overview_zh` 里若还写着「尚未上架 / 未发布 / Unreleased」，
  只**报告**（那属人的措辞），不自动改写。

用法
----
    python scripts/sync_release_status.py                 # 应用
    python scripts/sync_release_status.py --check         # 只打印计划，不写盘
    python scripts/sync_release_status.py --today 2026-09-22   # 用指定日期（测试用）
环境变量 `RS_ROOT` 可指向别处的仓库副本（测试用）。

退出码：0 = 成功或**无事可做**；1 = 真实故障（写盘失败 / 数据格式不对）。
"""
import argparse
import datetime
import io
import json
import os
import re
import sys
import time

if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf8"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = os.environ.get("RS_ROOT") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
Z = os.path.join(ROOT, "HD2_Wiki", "data", "wiki", "zh")
WARBONDS = os.path.join(Z, "warbonds.json")
BOOSTERS = os.path.join(Z, "boosters.json")
BOOSTERS_HTML = os.path.join(ROOT, "HD2_Wiki", "boosters.html")
PRICE_TBD = "待发布"
HTML_TBD = '<span class="price tbd"><b>待发布</b></span>'
HTML_CARD_LOOKAHEAD = 900          # 卡片锚点之后多远算"这张卡内"
PROSE_NEEDLES = ("尚未上架", "未发布", "Unreleased")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def log(msg):
    print(msg, flush=True)


def load_json(path):
    with io.open(path, encoding="utf-8") as fh:
        return json.load(fh)


def dump_bytes(obj):
    return (json.dumps(obj, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def is_numeric_price(v):
    return bool(re.match(r"^\d+$", str(v or "").strip()))


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="只打印计划，不写盘")
    ap.add_argument("--today", default=None, help="覆盖「今天」（YYYY-MM-DD，测试用）")
    args = ap.parse_args(argv)

    today = args.today or datetime.date.today().isoformat()
    if not DATE_RE.match(today):
        log("!! --today 不是 YYYY-MM-DD: %r" % today)
        return 1

    wb_raw = open(WARBONDS, "rb").read()
    bo_raw = open(BOOSTERS, "rb").read()
    wb = json.loads(wb_raw.decode("utf-8"))
    bo = json.loads(bo_raw.decode("utf-8"))
    if dump_bytes(wb) != wb_raw or dump_bytes(bo) != bo_raw:
        log("!! 数据文件不是 indent=2 + 尾换行 的规范格式 —— 先规范化再来（拒绝在非规范格式上写盘）")
        return 1

    today_str = today
    changed_wb = []
    warnings = []

    # ---------------- 规则 1：债券 ----------------
    for w in wb.get("warbonds") or []:
        if str(w.get("release_status") or "released") != "unreleased":
            continue
        rd = str(w.get("release_date") or "")
        if not DATE_RE.match(rd):
            warnings.append("%s(%s) release_status=unreleased 但 release_date=%r 不可比 —— 跳过"
                            % (w.get("id"), w.get("name"), rd))
            continue
        for field in ("intro_zh", "overview_zh"):
            txt = str(w.get(field) or "")
            if any(n in txt for n in PROSE_NEEDLES):
                warnings.append("%s 的 %s 仍写着「未上架/未发布」字样，请人工改写：%s"
                                % (w.get("id"), field, txt[:60]))
        if rd <= today_str:
            w["release_status"] = "released"
            changed_wb.append((w.get("id"), w.get("name_en"), rd))
            log("[债券] %-22s %s：release_date=%s <= %s -> released"
                % (w.get("id"), w.get("name"), rd, today_str))

    released_by_en = {str(x.get("name_en")): x for x in (wb.get("warbonds") or [])
                      if str(x.get("release_status")) == "released"}

    # ---------------- 规则 2：强化资源 ----------------
    changed_bo = []
    for b in bo.get("boosters") or []:
        if str(b.get("release_status") or "released") != "unreleased":
            continue
        w = released_by_en.get(str(b.get("warbond") or ""))
        if not w:
            continue                       # 所属债券还没发布 → 什么都不做（等它发布）
        page = price = None
        for i, t in enumerate(w.get("tables") or []):
            for row in t.get("rows") or []:
                if row and row[0] == b.get("name_en"):
                    page, price = i + 1, row[2] if len(row) > 2 else None
                    break
            if page:
                break
        b["release_status"] = "released"
        if page:
            b["warbond_page"] = page
        if is_numeric_price(price):
            b["price"] = int(price)
            b["price_zh"] = "勋章 ×%d" % int(price)
        else:
            b["price"] = None
            b["price_zh"] = PRICE_TBD
            warnings.append("%s(%s) 已随债券发布，但逐页奖励表里该行价格是 %r —— "
                            "本站改为「已发布」但价格仍为「待发布」，**需人工按条目页补价**"
                            % (b.get("id"), b.get("name"), price))
        changed_bo.append((b.get("id"), b.get("name_en"), page, price))
        log("[强化资源] %-34s %s：随债券 %s 发布 -> released（页 %s / 价格 %s）"
            % (b.get("id"), b.get("name"), w.get("name_en"), page, price))

    total = len(changed_wb) + len(changed_bo)

    # ---------------- 静态列表页的价格（boosters.html 是写死的 HTML） ----------------
    html = io.open(BOOSTERS_HTML, encoding="utf-8").read()
    html_new = html
    html_patched = []
    for bid, name_en, page, price in changed_bo:
        if not is_numeric_price(price):
            continue
        anchor = 'booster.html?id=%s"' % bid
        i = html_new.find(anchor)
        if i < 0:
            warnings.append("boosters.html 里找不到 %s 的卡片锚点（列表页没同步）" % bid)
            continue
        j = html_new.find(HTML_TBD, i)
        if j < 0 or j - i > HTML_CARD_LOOKAHEAD:
            warnings.append("boosters.html 里 %s 卡片内没有「待发布」价格（可能已手改过）" % bid)
            continue
        html_new = html_new[:j] + '<span class="price">勋章 ×<b>%d</b></span>' % int(price) + \
            html_new[j + len(HTML_TBD):]
        html_patched.append((bid, price))
        log("[静态页] boosters.html：%s -> 勋章 ×%s" % (bid, price))

    if not total:
        log("没有待更新的发行状态 —— 良性无事可做")
        print("RELEASE_SYNC=0")
        for w in warnings:
            log("[需人工] %s" % w)
        print("RELEASE_WARNINGS=%d" % len(warnings))
        return 0

    log("计划：%d 个债券、%d 个强化资源、%d 处静态页价格" % (len(changed_wb), len(changed_bo), len(html_patched)))
    if args.check:
        log("--check：未写盘")
        for w in warnings:
            log("[需人工] %s" % w)
        print("RELEASE_SYNC=%d" % total)
        print("RELEASE_WARNINGS=%d" % len(warnings))
        return 0

    ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    wb["updated_at"] = ts
    bo["updated_at"] = ts
    for path, obj, before in ((WARBONDS, wb, wb_raw), (BOOSTERS, bo, bo_raw)):
        b = dump_bytes(obj)
        json.loads(b.decode("utf-8"))          # 先校验后写盘
        if b != before:
            with open(path, "wb") as fh:
                fh.write(b)
            log("写出 %s（%d -> %d B）" % (os.path.basename(path), len(before), len(b)))
    if html_new != html:
        with open(BOOSTERS_HTML, "wb") as fh:
            fh.write(html_new.encode("utf-8"))
        log("写出 boosters.html（%d -> %d B）" % (len(html.encode("utf-8")), len(html_new.encode("utf-8"))))

    for w in warnings:
        log("[需人工] %s" % w)
    print("RELEASE_SYNC=%d" % total)
    print("RELEASE_WARNINGS=%d" % len(warnings))
    return 0


if __name__ == "__main__":
    sys.exit(main())
