# -*- coding: utf-8 -*-
"""
gen_wiki_planet_links.py — 生成星球 → wiki.gg 中文站页面标题映射（一次性脚本）
==============================================================================
zh 站星球页标题用英文 Title Case（如 Category:Planets 下的 "Acamar IV"），
URL 形如 https://helldivers.wiki.gg/zh/wiki/Acamar_IV。

流程：枚举 zh 站 Category:Planets 全部 ns=0 成员 → 与 data.json 星球名做
规范化匹配（大写 + 空格/连字符/下划线归一）→ 未命中的再用中文名兜底比对。

输出：HD2-Galatic_war-Map/embed/wiki-planet-links.json
      { "ACAMAR IV": "Acamar IV", ... }   键=data.json 大写原名，值=zh 站规范标题
"""
import io
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_JSON = os.path.join(ROOT, "HD2-Galatic_war-Map", "data.json")
STARMAP = os.path.join(ROOT, "HD2-Galatic_war-Map", "tables", "starmap.json")
OUT_JSON = os.path.join(ROOT, "HD2-Galatic_war-Map", "embed", "wiki-planet-links.json")
API = "https://helldivers.wiki.gg/zh/api.php"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) HD2PlanetLinks/1.0"
CATEGORY = "Category:Planets"


def api(params):
    url = API + "?" + urllib.parse.urlencode(params)
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
    raise RuntimeError("API 重试耗尽")


def norm(s):
    """规范化比较键：大写、空格/下划线/连字符归一、去撇号。"""
    return re.sub(r"[\s_'\-]+", "", str(s).upper())


def main():
    # 枚举分类成员
    titles = []
    cont = None
    while True:
        params = {"action": "query", "format": "json", "list": "categorymembers",
                  "cmtitle": CATEGORY, "cmlimit": "max", "cmnamespace": "0"}
        if cont:
            params["cmcontinue"] = cont
        d = api(params)
        for cm in (d.get("query") or {}).get("categorymembers", []):
            titles.append(cm["title"])
        cont = (d.get("continue") or {}).get("cmcontinue")
        if not cont:
            break
        time.sleep(0.6)
    print(f"zh 站 {CATEGORY} 成员: {len(titles)} 个")

    data = json.load(open(DATA_JSON, encoding="utf-8"))
    star = json.load(open(STARMAP, encoding="utf-8"))
    pl_cn = star.get("planets") or {}
    names = sorted({p["name"].strip().upper() for p in (data.get("planets") or []) if p.get("name", "").strip()})

    by_norm = {}
    for t in titles:
        by_norm.setdefault(norm(t), t)

    mapping, miss = {}, []
    for n in names:
        key = norm(n)
        hit = by_norm.get(key)
        if not hit:
            # 中文名兜底（starmap 的 cn 去掉「星区」等无关后缀不会出现在星球名里，直接比）
            cn = (pl_cn.get(n) or {}).get("cn") or ""
            if cn and norm(cn) in by_norm:
                hit = by_norm[norm(cn)]
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
        print(f"未命中（前端回退 zh 站搜索链接）{len(miss)} 颗:", "、".join(miss))


if __name__ == "__main__":
    main()
