#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""修 weapons.json 的 description 抓取残留（2026-09-23）。

背景（SCHEMA §8 / 交接文档 §0.5 P2）：
  · 33 条 `description` 是 Attachments 表说明 `Any math should be done on values listed…`
  · 38 条 `description` 是版本号戳（如 `1.005.002 2026-01-22`）
  · 41 条 `description_zh` 是照着上面那段残留逐句翻译出来的（"任何计算都应基于…"）
canonical：`description` = 上游 `{{Quote|…|Armory Description}}` 英文原文；
          `description_zh` = 该原文的中文（本站译文，需人工/机器翻译后回填）。

用法：
  python scripts/archive/fix_weapon_descriptions.py --scan     # 体检 + 抽取英文原文 → 报告
  python scripts/archive/fix_weapon_descriptions.py --apply --zh <译文json>   # 回填（英文 + 中文）
译文 json 结构：{ "<weapon id>": "中文", ... }
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
WP = os.path.join(BASE, "HD2_Wiki", "data", "wiki", "zh", "weapons.json")
T = os.environ.get("TEMP", ".")
REPORT = os.path.join(T, "hd2guide", "weapon_desc_report.txt")
SPEC = os.path.join(T, "hd2guide", "weapon_desc_spec.json")
UA = {"User-Agent": "HD2-DataSync/1.0 (site maintainer; +https://jerry114514.github.io/HD2_Wiki/)"}
API = "https://helldivers.wiki.gg/api.php"

BAD_PATTERNS = [
    re.compile(r"Any math should be done", re.I),
    re.compile(r"^\s*[\d.]+\s+\d{4}-\d{2}-\d{2}\s*$"),
]
BAD_ZH = re.compile(r"任何计算|详细武器统计")


def log(m):
    print(m, flush=True)


def api(params):
    url = API + "?" + urllib.parse.urlencode(params)
    for i in range(3):
        try:
            return json.loads(urllib.request.urlopen(
                urllib.request.Request(url, headers=UA), timeout=45).read().decode("utf-8"))
        except Exception:
            if i == 2:
                raise
            time.sleep(2)


def armory_quote(title):
    """取 `{{Quote|…|Armory Description}}`（也接受 Ship Management Terminal 等其它来源标签）。"""
    d = api({"action": "parse", "page": title, "prop": "wikitext", "format": "json"})
    if "parse" not in d:
        return None, None
    wt = d["parse"]["wikitext"]["*"]
    m = re.search(r"\{\{\s*Quote\s*\|(.+?)\}\}", wt, re.S)
    if not m:
        return None, None
    body = m.group(1)
    parts = body.rsplit("|", 1)
    text = parts[0]
    label = parts[1].strip() if len(parts) > 1 else ""
    text = re.sub(r"\[\[[^\]|]*\|([^\]]*)\]\]", r"\1", text)
    text = re.sub(r"\[\[([^\]]*)\]\]", r"\1", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"\{\{[^}]*\}\}", "", text)
    return re.sub(r"\s+", " ", text).strip(), label


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scan", action="store_true")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--zh", default=None)
    ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()

    raw = io.open(WP, "rb").read()
    doc = json.loads(raw.decode("utf-8"))
    if (json.dumps(doc, ensure_ascii=False, indent=2) + "\n").encode("utf-8") != raw:
        log("!! 文件不是 indent=2 格式，拒绝写盘")
        return 3

    weapons = doc["weapons"]
    bad = []
    for w in weapons:
        d = (w.get("description") or "").strip()
        if any(p.search(d) for p in BAD_PATTERNS):
            bad.append(w)
    log("weapons 总数 %d；description 命中残留模式的 %d 条" % (len(weapons), len(bad)))
    zh_bad = [w["id"] for w in weapons if BAD_ZH.search(w.get("description_zh") or "")]
    log("description_zh 命中残留译文的 %d 条" % len(zh_bad))

    cache = os.path.join(T, "hd2guide", "wq")
    os.makedirs(cache, exist_ok=True)
    out = []
    got = miss = 0
    todo = bad[:a.limit] if a.limit else bad
    for i, w in enumerate(todo):
        title = w.get("name_en") or w["id"]
        cp = os.path.join(cache, re.sub(r"[^\w.-]", "_", title) + ".txt")
        if os.path.exists(cp):
            q = json.loads(io.open(cp, encoding="utf-8").read())
        else:
            try:
                text, label = armory_quote(title)
            except Exception as e:
                text, label = None, "ERR:%r" % (e,)
            q = {"en": text, "label": label}
            io.open(cp, "w", encoding="utf-8").write(json.dumps(q, ensure_ascii=False))
            time.sleep(0.8)
        rec = {"id": w["id"], "name_en": title, "name": w.get("name"),
               "old_description": w.get("description", ""),
               "old_description_zh": w.get("description_zh", ""),
               "quote_en": q["en"], "label": q["label"]}
        out.append(rec)
        if q["en"]:
            got += 1
        else:
            miss += 1
        if (i + 1) % 10 == 0:
            log("  %d/%d（有原文 %d / 缺 %d）" % (i + 1, len(todo), got, miss))

    io.open(SPEC, "w", encoding="utf-8").write(json.dumps(out, ensure_ascii=False, indent=1))
    rep = ["命中 %d 条；抽取到上游 Armory Description/Quote 的 %d 条，未取到 %d 条" % (len(todo), got, miss),
           "报告：%s" % SPEC, ""]
    for r in out:
        rep.append("%-26s | %-42s | %s" % (r["id"], (r["quote_en"] or "(无)")[:42], r["label"]))
    io.open(REPORT, "w", encoding="utf-8").write("\n".join(rep))
    log("报告 %s" % REPORT)

    if a.scan:
        return 0

    if not a.zh:
        log("!! --apply 需要 --zh <译文json>")
        return 2
    zh = json.loads(io.open(a.zh, encoding="utf-8").read())
    fixed_en = fixed_zh = 0
    for r in out:
        w = next((x for x in weapons if x["id"] == r["id"]), None)
        if w is None or not r["quote_en"]:
            continue
        w["description"] = r["quote_en"]
        fixed_en += 1
        z = (zh.get(r["id"]) or "").strip()
        if z:
            w["description_zh"] = z
            fixed_zh += 1
    text = json.dumps(doc, ensure_ascii=False, indent=2) + "\n"
    json.loads(text)
    io.open(WP, "w", encoding="utf-8", newline="\n").write(text)
    log("已写盘：description 修 %d 条 / description_zh 修 %d 条（%d -> %d 字节）" % (
        fixed_en, fixed_zh, len(raw), len(text.encode("utf-8"))))
    return 0


if __name__ == "__main__":
    sys.exit(main())
