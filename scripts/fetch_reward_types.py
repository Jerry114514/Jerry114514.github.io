#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""战役奖励 mixId → 类型明文/图标：**自动提取**，替代「人工去 hdcpn 查一眼再手写」。

背景（2026-10-13 用户提出）：
  companion 的 `episodes[].rewards` / `phases[].rewards` 只有 `{mixId, amount}`，**没有任何明文**。
  站内此前靠人工：出新战役 → 去 hdcpn 看这奖励算什么 → 手写进
  `HD2-Galatic_war-Map/data/campaign_zh.json` 的 `reward_types`；私密仓 campaign_translator.py
  还会打印「未登记的奖励 mixId（前端会没有中文名，需人工补 reward_types）」提醒。

  但这些分类本来就有一张**机器可读**的表：companion 前端 bundle 里的奖励解析函数
  （首次人工核对于 2026-09-25，见 campaign_zh.json 的 `_reward_types_doc`）。本脚本把它自动提取成
  `HD2-Galatic_war-Map/data/reward_types.json`，于是新战役不再需要人工补表。

提取口径（用**结构锚点**，不依赖压缩后的变量名 —— 换构建不会失效）：
  1. 定位奖励解析函数：`=e=>{const t=<idMap>[e];return t||(`，其后第一个分支是 `text:"Cape"`；
  2. 顺链读 `<var>.includes(e)?{id:e,text:"<类型>",icBuild:"<构建串>",icon:"<图标键>"}`
     —— 链的顺序就是 companion 的判定顺序（Cape / Body Armor / Helmet / Primary / Sidearm /
     Throwable / Stratagem / Pattern），最后是 `text:"Item"` 兜底；
  3. 每个 `<var>=[...]` 数字数组 = 该类型的 mixId 全集；
  4. 货币类（勋章/征用单/样本/超级点券）不在数组里，是对象字面量
     `{id:<n>,text:"Warbond Medal",icBuild:"…",icon:"currency.medal"}`，单独扫一遍；
  5. 都不命中 = companion 的 Item 兜底 → 本表不落条目，交给调用方走中性兜底。

失败纪律：抓不到 / 解析不出 → 抛异常，**不写文件**（保持上一版表）；
  调用方（scripts/fetch_site_data.py）捕获后继续用旧表 + 中性兜底，绝不阻断 5 分钟的数据抓取。

用法：
  python scripts/fetch_reward_types.py                 # 抓上游 → 写 data/reward_types.json
  python scripts/fetch_reward_types.py --chunk x.js    # 用本地已存的 bundle 片段（离线/测试）
  python scripts/fetch_reward_types.py --check         # 只比对，不写：与提交版不一致时退出码 1
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
import time
import urllib.error
import urllib.request

SITE_ROOT = os.path.abspath(
    os.environ.get("HD2_SITE_ROOT") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
)
DEFAULT_OUT = os.path.join(SITE_ROOT, "HD2-Galatic_war-Map", "data", "reward_types.json")
SITE_BASE = "https://helldiverscompanion.com"
UA = "Mozilla/5.0 (compatible; jerry114514-site-bot/1.0)"

# 类型明文 → 站内中文。沿用 terms.json / campaign_zh.json 既有译法，不新造词；
# 这套明文是 companion 的**闭集**（9 个分类 + 6 个货币），新增值会在这里暴露出来。
REWARD_CN = {
    "Cape": "披风",
    "Body Armor": "护甲",
    "Helmet": "头盔",
    "Primary": "主武器",
    "Sidearm": "副武器",
    "Throwable": "投掷物",
    "Stratagem": "战略配备",
    "Pattern": "涂装",
    "Item": "物品",
    "Warbond Medal": "战争债券勋章",
    "Requisition Slip": "征用单",
    "Common Sample": "普通样本",
    "Rare Sample": "稀有样本",
    "Super Sample": "超级样本",
    "Super Credit": "超级点券",
}

# companion 图标键 → 本地图标（assets/campaign/）。
# ⚠ 没有真实矢量的类型一律用中性占位图，不拿披风/勋章冒充（campaign_zh.json._assets 的纪律）。
ICON_FILE = {
    "currency.item_cape2": "reward_cape.svg",
    "currency.item_stratagem": "reward_stratagem.svg",
    "currency.medal": "reward_medal.svg",
}
DEFAULT_ICON_FILE = "reward_item.svg"
ICON_REL_DIR = "./assets/campaign"

# 站内 index.html 的 CAMP_REWARD_KINDS / validate_wiki_data.py 的 NON_PATH_ICON_ENUMS 只认这 4 个枚举
ICON_ENUM = {"Cape": "cape", "Stratagem": "stratagem", "Warbond Medal": "medal"}
DEFAULT_ICON_ENUM = "item"

# ---- 结构锚点（换构建不失效）------------------------------------------------
_ENTRY_RE = re.compile(r"immutable/(entry/[A-Za-z0-9_.\-]+\.js)")
# chunk 互相引用的写法不止一种：`from"./chunks/x.js"`、`import("./chunks/x.js")`、
# 清单数组里的裸字符串 `"./chunks/x.js"` —— 一律按「出现 chunks/<name>.js」匹配，
# 多抓几个 404 无害，漏了就找不到（2026-10-13 实测：只认 import" 时只能扫到 3 个）。
_CHUNK_IMPORT_RE = re.compile(r"(?:\./|\.\./|immutable/)chunks/([A-Za-z0-9_\-]+\.js)")
_FN_MARK = "=e=>{const t="                      # 奖励解析函数开头
_CAPE_MARK = 'text:"Cape"'                      # 链里第一个分支
_ITEM_MARK = 'text:"Item"'                      # 兜底分支
_FN_HEAD_RE = re.compile(r"=e=>\{const t=([\w$]+)\[e\];return t\|\|\(")
_BRANCH_RE = re.compile(
    r'([\w$]+)\.includes\(e\)\?\{id:e,text:"([^"]+)",icBuild:"([^"]*)",icon:"([^"]+)"'
)
_CATALOG_RE = re.compile(r'\{id:(\d{5,}),text:"([^"]+)",icBuild:"([^"]*)",icon:"([^"]+)"')


def _get(url: str, timeout: int = 30) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", "replace")


def looks_like_reward_module(text: str) -> bool:
    head = _FN_HEAD_RE.search(text)
    return bool(head) and text.find(_CAPE_MARK, head.end()) >= 0


def discover_chunk_text(base: str = SITE_BASE, max_files: int = 60,
                        max_bytes: int = 80 * 1024 * 1024, log=print) -> tuple[str, str]:
    """顺着 SvelteKit 的入口 chunk 找含奖励分类表的那个 chunk（chunk 名带内容哈希，不能写死）。

    返回 (chunk 文件名, 文本)。找不到就抛异常 —— 调用方据此保留旧表。
    """
    html = _get(base + "/")
    entries = sorted(set(_ENTRY_RE.findall(html)))
    if not entries:
        raise RuntimeError("companion 首页里没找到 entry chunk（前端结构变了？）")

    pending: list[str] = []
    for entry in entries[:4]:
        try:
            text = _get("%s/_app/immutable/%s" % (base, entry))
        except Exception as e:              # noqa: BLE001 - 单个入口失败不影响其它入口
            log("  [skip] %s: %s" % (entry, e))
            continue
        if looks_like_reward_module(text):
            return os.path.basename(entry), text
        pending.extend(_CHUNK_IMPORT_RE.findall(text))

    seen: set[str] = set()
    total = 0
    while pending and len(seen) < max_files and total < max_bytes:
        name = pending.pop(0)
        if name in seen:
            continue
        seen.add(name)
        try:
            text = _get("%s/_app/immutable/chunks/%s" % (base, name))
        except Exception:                   # noqa: BLE001
            continue
        total += len(text)
        if looks_like_reward_module(text):
            log("  命中奖励分类 chunk：%s（已扫 %d 个 / %.1f MB）" % (name, len(seen), total / 1048576))
            return name, text
        pending.extend(n for n in _CHUNK_IMPORT_RE.findall(text) if n not in seen)

    raise RuntimeError("扫了 %d 个 chunk 仍没找到奖励分类模块（前端结构变了？）" % len(seen))


def parse_bundle(text: str) -> dict[str, dict]:
    """bundle 文本 → {mixId: {en, cn, icon, img, icBuild}}。结构不对就抛异常。"""
    table: dict[str, dict] = {}

    def add(mix_id, en, icon_key, ic_build):
        mix_id = str(mix_id)
        if mix_id in table:
            return                          # 先命中的优先（货币目录先扫，与前端一致）
        table[mix_id] = {
            "en": en,
            "cn": REWARD_CN.get(en, ""),
            "icon": ICON_ENUM.get(en, DEFAULT_ICON_ENUM),
            "img": "%s/%s" % (ICON_REL_DIR, ICON_FILE.get(icon_key, DEFAULT_ICON_FILE)),
            "icBuild": ic_build,
        }

    # 4) 货币目录（勋章/征用单/样本/超级点券）
    for m in _CATALOG_RE.finditer(text):
        add(m.group(1), m.group(2), m.group(4), m.group(3))

    # 1) 定位解析函数与其兜底分支。
    #    ⚠ 先找**函数开头**（正则够特异），再在它之后找分支锚点 —— 反过来写会被
    #      "注释里也写了 text:\"Cape\"" 的文本骗到（回归用例里就有这种注释）。
    head = _FN_HEAD_RE.search(text)
    if not head:
        raise RuntimeError("bundle 里没有奖励解析函数锚点 %s（前端结构变了？）" % _FN_MARK)
    fn_at = head.start()
    cape_at = text.find(_CAPE_MARK, head.end())
    if cape_at < 0:
        raise RuntimeError("bundle 里没有 %s 锚点（奖励分支结构变了？）" % _CAPE_MARK)
    item_at = text.find(_ITEM_MARK, cape_at)
    if item_at < 0:
        raise RuntimeError("bundle 里没有兜底分支 %s" % _ITEM_MARK)

    # 2)+3) 逐分支取「类型明文 + 该类型的 id 数组」
    segment = text[fn_at:item_at + 400]
    branch_count = 0
    for m in _BRANCH_RE.finditer(segment):
        var, en, ic_build, icon_key = m.group(1), m.group(2), m.group(3), m.group(4)
        # 变量可能在逗号声明列表里（`,Jde=[…]`）也可能被单独 `const Kde=[…]` 声明 →
        # 只要求「左边不是标识符字符」，别把前导分隔符写死。
        arr = re.search(r"(?<![\w$])%s=\[([\d,]+)\]" % re.escape(var), text)
        if not arr:
            raise RuntimeError("分支 %s（%s）对应的 id 数组没找到" % (var, en))
        for mix_id in arr.group(1).split(","):
            if mix_id:
                add(mix_id, en, icon_key, ic_build)
        branch_count += 1

    if branch_count < 5 or len(table) < 100:
        raise RuntimeError("分支/条目数异常（%d 分支 / %d 条），疑似解析到半截表" % (branch_count, len(table)))
    return table


def _write_atomic(dest: str, payload: dict) -> None:
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    handle, temp = tempfile.mkstemp(prefix=".reward-", suffix=".json", dir=os.path.dirname(dest))
    try:
        # ⚠ newline="\n"：Windows 的文本模式会把 \n 写成 \r\n，而校验器（IMG/CR 检查）与
        #   CI（Linux）都按 LF 口径 —— 显式锁 LF，避免"本机跑一次就把整份文件变成 CRLF"。
        with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as stream:
            json.dump(payload, stream, ensure_ascii=False, indent=1)
            stream.write("\n")
        os.replace(temp, dest)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def build_table(chunk_name: str, chunk_text: str) -> dict:
    types = parse_bundle(chunk_text)
    return {
        "_meta": {
            "desc": "战役奖励 mixId → 类型明文/图标。**自动生成，勿手改**（改也下次刷新会覆盖）："
                    "跑 python scripts/fetch_reward_types.py 重新生成。",
            "source": "%s 前端 bundle 的奖励解析函数（结构锚点提取，见脚本头部说明）" % SITE_BASE,
            "method": "scripts/fetch_reward_types.py",
            "chunk": chunk_name,
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "count": len(types),
            "override": "人工补充/覆盖走 HD2-Galatic_war-Map/data/campaign_zh.json 的 reward_types"
                        "（优先级更高，可额外给 detail 说明「具体是哪件装备」——上游没有这个信息）",
        },
        "types": dict(sorted(types.items())),
    }


def load_table(path: str = DEFAULT_OUT) -> dict:
    """给 fetch_site_data.py 用：读不到就返回空表（调用方走中性兜底）。"""
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        types = data.get("types")
        return types if isinstance(types, dict) else {}
    except Exception:                       # noqa: BLE001 - 表缺失/损坏都不该影响抓取
        return {}


def refresh(out_path: str = DEFAULT_OUT, chunk_path: str | None = None,
            base: str = SITE_BASE, log=print) -> dict:
    """抓取并写出新表（原子替换）。失败抛异常且不动文件。"""
    if chunk_path:
        with open(chunk_path, encoding="utf-8", errors="replace") as f:
            chunk_name, chunk_text = os.path.basename(chunk_path), f.read()
        log("  读本地 chunk：%s" % chunk_name)
    else:
        log("  抓 companion 前端 bundle …")
        chunk_name, chunk_text = discover_chunk_text(base=base, log=log)
    payload = build_table(chunk_name, chunk_text)
    _write_atomic(out_path, payload)
    return payload


def main() -> int:
    ap = argparse.ArgumentParser(description="提取 companion 的战役奖励分类表")
    ap.add_argument("--out", default=DEFAULT_OUT, help="输出路径（默认 HD2-Galatic_war-Map/data/reward_types.json）")
    ap.add_argument("--chunk", help="改用本地已存的 bundle 文本（离线/测试用）")
    ap.add_argument("--base", default=SITE_BASE, help="companion 站点前缀")
    ap.add_argument("--check", action="store_true", help="只比对：与提交版不一致则退出码 1（不写文件）")
    args = ap.parse_args()

    if args.check:
        payload = build_table("(check)", open(args.chunk, encoding="utf-8", errors="replace").read()
                              if args.chunk else discover_chunk_text(base=args.base)[1])
        new_types = payload["types"]
        old_types = load_table(args.out)
        added = sorted(set(new_types) - set(old_types))
        removed = sorted(set(old_types) - set(new_types))
        changed = sorted(k for k in set(new_types) & set(old_types)
                         if new_types[k].get("en") != old_types[k].get("en"))
        print("上游 %d 条 / 本地 %d 条；新增 %d、消失 %d、类型变化 %d"
              % (len(new_types), len(old_types), len(added), len(removed), len(changed)))
        for k in (added + changed)[:20]:
            print("  + %s -> %s" % (k, new_types[k].get("en")))
        return 1 if (added or changed) else 0

    payload = refresh(out_path=args.out, chunk_path=args.chunk, base=args.base)
    types = payload["types"]
    counts: dict[str, int] = {}
    for v in types.values():
        counts[v["en"]] = counts.get(v["en"], 0) + 1
    print("已写出 %s：%d 条" % (os.path.relpath(args.out, SITE_ROOT), len(types)))
    for name, n in sorted(counts.items(), key=lambda kv: -kv[1]):
        print("  %-16s %d" % (name, n))
    unknown = sorted({v["en"] for v in types.values() if not v["cn"]})
    if unknown:
        print("⚠ 出现 REWARD_CN 里没有的新类型明文（请补译法）：%s" % "、".join(unknown))
    return 0


if __name__ == "__main__":
    sys.exit(main())
