#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""补录战略配备（2026-09-23 第二批）：CQC-20 / CQC-9 / TD-110 / M-104 + 民用两条。

为什么写成脚本而不是手改 JSON（§19.15 的教训）
--------------------------------------------------------------------------
* 数值字段**全部来自上游**：infobox（wikitext）+ 渲染后的详细数据表
  （复用 `scripts/archive/fetch_detailed_stats.py::get_detailed_stats`），不手写、不推算。
* 中文名一律有据：`terms.json` 既有口径（CQC-73 堑壕工具 → CQC-72 堑壕工具；
  FRV=快速侦察载具）或**用户给定**（TD-110 “风暴漩涡”坦克）。
* 写盘前自检：① 条目键集合/顺序必须与既有条目一致；② 必填字段齐备；
  ③ 图标 URL 必须 200 + 真图片魔数；④ `json.dumps(indent=2)` 必须能**逐字节复现**原文件的格式。

本批的分类依据（wiki.gg，2026-09-23 实测）
--------------------------------------------------------------------------
* `CQC-20 Breaching Hammer` / `CQC-9 Defoliation Tool`：Stratagems + Support Weapon Stratagems
  + Warbond Stratagems（围攻破袭者 P1 75 勋章 / 巨蟒突击兵 P2 85 勋章）
* `TD-110 Maelstrom` / `M-104 Incinerator FRV`：Stratagems + Vehicle Stratagems + Hangar Stratagems
* `CQC-72 Entrenchment Tool` / `SG-88 Break-Action Shotgun`：只属 **Civilian Stratagems**
  （全站仅此 2 条；不在 `Category:Stratagems`，无呼叫码、无战略配备图标，是地图兴趣点拾取物）
  → 按用户裁定「参考 wiki.gg」收录为**新分类 `civilian` / 民用**。

用法：
  python scripts/archive/add_stratagems.py            # dry-run：只生成预览与报告
  python scripts/archive/add_stratagems.py --apply    # 通过全部自检后写盘
"""
import argparse
import importlib.util
import io
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

BASE = r"E:\GitLoadWareHouse\Jerry114514.github.io"
OUT = os.path.join(BASE, "HD2_Wiki", "data", "wiki", "zh", "stratagems_full.json")
REPORT = os.path.join(os.environ.get("TEMP", "."), "hd2guide", "add_stratagems_report.txt")
UA = {"User-Agent": "HD2-DataSync/1.0 (site maintainer; +https://jerry114514.github.io/HD2_Wiki/)"}
API = "https://helldivers.wiki.gg/api.php"

ARROW = {"up": "U", "down": "D", "left": "L", "right": "R"}
CURRENCY_ZH = {"Medals": "奖章", "Requisition": "申购点",
               "Requisition Slips": "申购点", "Super Credits": "超级货币"}

# 🔴 中文名口径：前 4 条 = 用户 2026-09-23 认可（TD-110 为用户给定官方译名，见 terms.json 级别 0）；
#    后 2 条 = 按 wiki.gg 分类收录，译名沿用同型既有口径（CQC-73 堑壕工具 / 折管式霰弹枪）。
SPEC = [
    {"id": "support_cqc_20_breaching_hammer", "title": "CQC-20 Breaching Hammer",
     "name": "CQC-20 破门锤", "category": "support", "category_label": "支援武器",
     "unlock_zh": None, "description": ""},
    {"id": "support_cqc_9_defoliation_tool", "title": "CQC-9 Defoliation Tool",
     "name": "CQC-9 除叶工具", "category": "support", "category_label": "支援武器",
     "unlock_zh": None, "description": ""},
    {"id": "vehicle_td_110_maelstrom", "title": "TD-110 Maelstrom",
     "name": "TD-110 “风暴漩涡”坦克", "category": "vehicle", "category_label": "载具",
     "unlock": "Armored Eagle", "unlock_zh": "装甲雄鹰战役", "description": ""},
    {"id": "vehicle_m_104_incinerator_fast_recon_vehicle", "title": "M-104 Incinerator FRV",
     "name": "M-104 焚化者快速侦察载具", "category": "vehicle", "category_label": "载具",
     "unlock": "N/A", "unlock_zh": None, "description": ""},
    {"id": "civilian_cqc_72_entrenchment_tool", "title": "CQC-72 Entrenchment Tool",
     "name": "CQC-72 堑壕工具", "category": "civilian", "category_label": "民用",
     "unlock": "Points of Interest", "unlock_zh": "地图兴趣点拾取", "description": "",
     "icon_file": "CQC-72 Entrenchment Tool Support Render.png"},
    {"id": "civilian_sg_88_break_action_shotgun", "title": "SG-88 Break-Action Shotgun",
     "name": "SG-88 折管霰弹枪", "category": "civilian", "category_label": "民用",
     "unlock": "Points of Interest", "unlock_zh": "地图兴趣点拾取", "description": "",
     "icon_file": "SG-88 Break-Action Shotgun Support Render.png"},
]

KEY_ORDER = ["id", "name", "name_en", "category", "category_label", "code", "call_in_time",
             "cooldown", "uses", "unlock", "image", "description", "source_page",
             "detailed_stats", "icon", "unlock_zh"]


def log(msg):
    print(msg, flush=True)


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


FDS = load(os.path.join(BASE, "scripts", "archive", "fetch_detailed_stats.py"), "fds")


def api(params):
    url = API + "?" + urllib.parse.urlencode(params)
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers=UA)
            return json.loads(urllib.request.urlopen(req, timeout=45).read().decode("utf-8"))
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2)


def wikitext(title):
    d = api({"action": "parse", "page": title, "prop": "wikitext", "format": "json"})
    if "parse" not in d:
        raise RuntimeError("page not found: " + title)
    return d["parse"]["wikitext"]["*"]


def infobox_params(wt):
    """取第一个 Infobox 模板的顶层参数（大括号配平）。"""
    m = re.search(r"\{\{\s*Infobox[ _]", wt)
    if not m:
        raise RuntimeError("no infobox")
    i = m.start()
    depth = 0
    j = i
    while j < len(wt):
        if wt.startswith("{{", j):
            depth += 1
            j += 2
            continue
        if wt.startswith("}}", j):
            depth -= 1
            j += 2
            if depth == 0:
                break
            continue
        j += 1
    body = wt[i + 2:j - 2]
    parts = re.split(r"\|(?![^{]*\}\})", body)   # 顶层 | 切分
    params = {}
    for p in parts[1:]:
        if "=" in p:
            k, v = p.split("=", 1)
            params[k.strip()] = v.strip()
    return params


def clean_value(v):
    v = re.sub(r"<small>.*?</small>", "", v, flags=re.S)
    v = re.sub(r"<br\s*/?>", " ", v)
    v = re.sub(r"\[\[[^\]|]*\|([^\]]*)\]\]", r"\1", v)   # [[A|B]] -> B
    v = re.sub(r"\[\[([^\]]*)\]\]", r"\1", v)            # [[A]] -> A
    v = re.sub(r"<[^>]+>", "", v)
    return re.sub(r"\s+", " ", v).strip()


def code_from(param):
    if not param:
        return ""
    words = re.findall(r"[A-Za-z]+", param)
    return "".join(ARROW.get(w.lower(), "") for w in words if w.lower() in ARROW)


def currency_from(param):
    """{{Currency|Medals|75}} / {{Currency|Requisition|25000}} → ('75 Medals', '75 奖章')"""
    if not param:
        return None, None
    m = re.search(r"\{\{\s*[Cc]urrency\s*\|\s*([^|}]+?)\s*\|\s*([^|}]+?)\s*\}\}", param)
    if not m:
        return None, None
    unit, amount = m.group(1).strip(), m.group(2).strip()
    amount = amount.replace(",", "")
    en_unit = unit if unit.endswith("s") else unit + "s"
    return "%s %s" % (amount, en_unit), "%s %s" % (amount, CURRENCY_ZH.get(unit, unit))


def image_url(file_name):
    return "https://helldivers.wiki.gg/images/" + urllib.parse.quote(file_name.replace(" ", "_"))


def head_ok(url):
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=30) as r:
            head = r.read(8)
        if head[:4] == b"\x89PNG" or head[:4] == b"GIF8":
            return True, "PNG/GIF"
        if b"<svg" in head or head[:5] == b"<?xml":
            return True, "SVG"
        if head[:2] == b"\xff\xd8":
            return True, "JPEG"
        if head[:4] == b"RIFF":
            return True, "WEBP"
        return False, repr(head)
    except Exception as e:
        return False, repr(e)[:80]


def build_entry(s, ref_keys):
    wt = wikitext(s["title"])
    p = infobox_params(wt)
    icon_file = s.get("icon_file") or p.get("stratagem_image") or p.get("image") or ""
    icon_file = re.sub(r"^(File:|Image:)", "", icon_file).strip()
    if not icon_file:
        raise RuntimeError("no image param for " + s["title"])
    code = code_from(p.get("stratagem_code"))
    cooldown = clean_value(p.get("base_cooldown") or "") or ("—" if s["category"] == "civilian" else "无限")
    if not cooldown.endswith("s") and cooldown not in ("无限", "—"):
        cooldown += "s"
    unlock_en, unlock_zh = currency_from(p.get("unlock_cost"))
    if not unlock_en:
        unlock_en = s.get("unlock") or clean_value(p.get("source") or "") or "初始解锁"
    if s.get("unlock_zh") is not None:
        unlock_zh = s["unlock_zh"]
    entry = {
        "id": s["id"],
        "name": s["name"],
        "name_en": s["title"],
        "category": s["category"],
        "category_label": s["category_label"],
        "code": code,
        "call_in_time": None,
        "cooldown": cooldown,
        "uses": "无限",
        "unlock": unlock_en,
        "image": image_url(icon_file),
        "description": s.get("description", ""),
        "source_page": "https://helldivers.wiki.gg/wiki/" + urllib.parse.quote(s["title"].replace(" ", "_")),
        "detailed_stats": FDS.get_detailed_stats(s["title"]),
        "icon": image_url(icon_file),
        "unlock_zh": unlock_zh,
    }
    entry = {k: entry[k] for k in KEY_ORDER if k in entry}
    if list(entry.keys()) != [k for k in ref_keys if k in entry] and set(entry) != set(ref_keys):
        raise RuntimeError("%s 键集合与既有条目不一致: %s vs %s" % (s["id"], sorted(entry), sorted(ref_keys)))
    ok, kind = head_ok(entry["icon"])
    if not ok:
        raise RuntimeError("%s 图标 URL 不是真图片: %s (%s)" % (s["id"], entry["icon"], kind))
    log("  [%s] code=%-9s cooldown=%-6s unlock=%-22s icon=%s (%s)" % (
        s["id"], entry["code"] or "(无)", entry["cooldown"], entry["unlock"],
        entry["image"].split("/")[-1][:46], kind))
    return entry


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    raw = io.open(OUT, "rb").read()
    doc = json.loads(raw.decode("utf-8"))
    items = doc["stratagems"]
    ref_keys = list(items[0].keys())

    # ① 格式自检：原文件必须是 json.dumps(indent=2) + 末尾换行的产物（否则写盘会制造整档 diff）
    canon = (json.dumps(doc, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    log("格式自检：indent=2 逐字节复现原文件 = %s" % (canon == raw))
    if canon != raw:
        log("!! 原文件不是该格式，拒绝写盘（避免整档 diff 噪音）")
        return 3

    existing_ids = {s["id"] for s in items}
    existing_zh = {(s.get("name_en") or "") for s in items}
    log("现有条目 %d 条（%d 字节）" % (len(items), len(raw)))

    new_entries = []
    for s in SPEC:
        if s["id"] in existing_ids or s["title"] in existing_zh:
            log("  SKIP（已存在）: %s" % s["id"])
            continue
        new_entries.append(build_entry(s, ref_keys))

    # ② 插入：各分类块的**末尾**（保持既有按分类聚簇的顺序），民用（新分类）放最后
    for e in new_entries:
        idx = None
        for i, it in enumerate(items):
            if it.get("category") == e["category"]:
                idx = i
        if idx is None:
            items.append(e)
        else:
            items.insert(idx + 1, e)
    doc["total"] = len(items)
    doc["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    text = json.dumps(doc, ensure_ascii=False, indent=2) + "\n"
    json.loads(text)                                   # ③ 先校验后写盘

    rep = ["新增 %d 条：" % len(new_entries)]
    for e in new_entries:
        rep.append(json.dumps({k: e[k] for k in ("id", "name", "name_en", "category",
                                                 "category_label", "code", "cooldown",
                                                 "unlock", "unlock_zh")},
                              ensure_ascii=False))
        rep.append("   detailed_stats=%s attacks=%s" % (
            "有" if e["detailed_stats"] else "null",
            len((e["detailed_stats"] or {}).get("attacks") or [])))
    rep.append("total: %d -> %d" % (len(items) - len(new_entries), doc["total"]))
    io.open(REPORT, "w", encoding="utf-8").write("\n".join(rep))
    log("报告: %s" % REPORT)

    if not a.apply:
        io.open(OUT + ".preview", "w", encoding="utf-8", newline="\n").write(text)
        log("DRY-RUN：预览写到 %s.preview（未改动正式文件）" % OUT)
        return 0

    io.open(OUT, "w", encoding="utf-8", newline="\n").write(text)
    log("已写盘 %s（%d -> %d 字节）" % (OUT, len(raw), len(text.encode("utf-8"))))
    return 0


if __name__ == "__main__":
    sys.exit(main())
