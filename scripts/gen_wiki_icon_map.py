# -*- coding: utf-8 -*-
"""
gen_wiki_icon_map.py — 生成星图挂载模块用的 wiki.gg 图标规范名映射（一次性脚本）
==============================================================================
来源：scripts/archive/fetch_planet_icons.py 的目录枚举逻辑（同一套 API 与过滤规则）。

输出：HD2-Galatic_war-Map/embed/wiki-icon-map.json
      { "ACAMAR IV": "Acamar_IV_Planet_Icon.png", ... }
      键 = data.json 大写原名；值 = wiki.gg（en 站）File: 规范名（大小写敏感）。
      挂载模块用它拼 https://helldivers.wiki.gg/images/thumb/<F>/64px-<F>。

只做目录枚举，不下载图片；请求间隔 0.6s + 429 退避，避免触发 Cloudflare 限流。
"""
import io
import json
import os
import sys
import time
import urllib.parse
import urllib.request

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_JSON = os.path.join(ROOT, "HD2-Galatic_war-Map", "data.json")
OUT_JSON = os.path.join(ROOT, "HD2-Galatic_war-Map", "embed", "wiki-icon-map.json")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) HD2IconMap/1.0 (wiki.gg API catalog enum)"
GAP = 0.6


def api(params):
    url = "https://helldivers.wiki.gg/api.php?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(1, 6):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = 3.0 * attempt
                print(f"  429 限流，退避 {wait}s …")
                time.sleep(wait)
                continue
            raise
        except Exception:
            time.sleep(1.0 * attempt)
    raise RuntimeError("API 重试耗尽: " + url)


def fetch_catalog():
    catalog = {}
    letters = [chr(c) for c in range(ord("A"), ord("Z") + 1)] + ["0", "1", "2", "3"]
    for prefix in letters:
        cont = None
        while True:
            params = {"action": "query", "format": "json", "list": "allimages",
                      "aiprefix": prefix, "ailimit": 500}
            if cont:
                params["aicontinue"] = cont
            d = api(params)
            for img in (d.get("query") or {}).get("allimages", []):
                nm = img.get("name", "")
                if nm.upper().endswith("_PLANET_ICON.PNG"):
                    catalog[nm.upper()] = nm
            cont = (d.get("continue") or {}).get("aicontinue")
            if not cont:
                break
            time.sleep(GAP)
        time.sleep(GAP)
        print(f"  prefix {prefix}: 累计 {len(catalog)}")
    return catalog


def main():
    data = json.load(open(DATA_JSON, encoding="utf-8"))
    names = sorted({p["name"].strip().upper() for p in (data.get("planets") or []) if p.get("name", "").strip()})
    print(f"星球总数（去重）: {len(names)}")
    print("枚举 wiki *_Planet_Icon.png 规范名 …")
    catalog = fetch_catalog()
    print(f"目录命中: {len(catalog)} 个 Planet_Icon 文件")

    mapping = {}
    miss = []
    for n in names:
        hit = catalog.get((n.replace(" ", "_") + "_Planet_Icon.png").upper())
        if hit:
            mapping[n] = hit
        else:
            miss.append(n)
    os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8", newline="\n") as f:
        json.dump(mapping, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write("\n")
    print(f"完成: {len(mapping)} 条 → {os.path.relpath(OUT_JSON, ROOT)}")
    if miss:
        print(f"无图标（前端回退主仓本地/纯色圆点）{len(miss)} 颗:", "、".join(miss))


if __name__ == "__main__":
    main()
