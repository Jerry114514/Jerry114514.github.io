#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""解析 helldivers.wiki.gg 的 Module:Data/PlanetStatistics，抽出每个星球的 regions（城市/超大型工厂）。

产出（demo 用）：HD2-Galatic_war-Map/tables/planet_regions.json
  { "source": "...", "updated_at": "...", "planets": { "<index>": { "name": "...", "sector": "...",
      "regions": [ {"name","desc","size","owner","region_type","region_faction"} ] } } }

数据说明（重要）：
  · 名字/类型/描述来自 wiki 的 Lua 数据模块（英文）—— 游戏内中文名目前**没有**公开来源，
    故中文只在 `tables/planet_regions_zh.json` 里按「星球/区域名」做覆盖（先放截图里能确认的几条）。
  · 进度（已解放 %）不在这里，属于运行时数据，由 companion 的 warStatus.planetRegions 提供。
"""
import argparse
import io
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE, "HD2-Galatic_war-Map", "tables", "planet_regions.json")
UA = {"User-Agent": "HD2-DataSync/1.0 (site maintainer; +https://jerry114514.github.io/HD2_Wiki/)"}
PAGE = "Module:Data/PlanetStatistics"


def fetch_module(refresh=False):
    """抓 Lua 模块。287 KB，实测偶发 chunked 读取超时 → 重试 3 次 + 本地缓存兜底。

    缓存只为本机反复解析方便（CI 上每次都是新环境、会走网络）；
    命中缓存时会打印提示，`--refresh` 可强制重抓。
    """
    import tempfile
    cache = os.path.join(tempfile.gettempdir(), "hd2guide", "PlanetStatistics.lua")
    if os.path.exists(cache) and not refresh:
        txt = io.open(cache, encoding="utf-8").read()
        if len(txt) > 100000:
            print("（使用本地缓存 %s，%d 字符；--refresh 可强制重抓）" % (cache, len(txt)))
            return txt
    u = "https://helldivers.wiki.gg/api.php?" + urllib.parse.urlencode(
        {"action": "parse", "page": PAGE, "prop": "wikitext", "format": "json"})
    last = None
    for attempt in range(3):
        try:
            req = urllib.request.Request(u, headers=dict(UA, Connection="close"))
            with urllib.request.urlopen(req, timeout=180) as r:
                data = r.read()
            j = json.loads(data.decode())
            if "parse" not in j:
                raise RuntimeError("取不到 %s: %s" % (PAGE, json.dumps(j, ensure_ascii=False)[:200]))
            wt = j["parse"]["wikitext"]["*"]
            os.makedirs(os.path.dirname(cache), exist_ok=True)
            io.open(cache, "w", encoding="utf-8").write(wt)
            return wt
        except Exception as e:
            last = e
            print("第 %d 次抓取失败：%s" % (attempt + 1, str(e)[:120]))
            time.sleep(3)
    if os.path.exists(cache):
        txt = io.open(cache, encoding="utf-8").read()
        print("!! 网络取不到，退回本地缓存（%d 字符）：%s" % (len(txt), last))
        return txt
    raise last


# ---------------- 极简 Lua 表解析（只覆盖该模块用到的子集） ----------------
def _skip_ws(s, i):
    while i < len(s) and s[i] in " \t\r\n":
        i += 1
    return i


def parse_value(s, i):
    """解析 Lua 值：字符串 / 数字 / 布尔 / {表}。返回 (value, new_i)。"""
    i = _skip_ws(s, i)
    if i >= len(s):
        return None, i
    c = s[i]
    if c == '"' or c == "'":
        q = c
        i += 1
        buf = []
        while i < len(s) and s[i] != q:
            if s[i] == "\\" and i + 1 < len(s):
                buf.append(s[i + 1])
                i += 2
                continue
            buf.append(s[i])
            i += 1
        return "".join(buf), i + 1
    if c == "{":
        return parse_table(s, i)
    m = re.match(r"-?\d+(?:\.\d+)?", s[i:])
    if m:
        t = m.group(0)
        return (float(t) if "." in t else int(t)), i + len(t)
    m = re.match(r"(true|false|nil)", s[i:])
    if m:
        return {"true": True, "false": False, "nil": None}[m.group(1)], i + len(m.group(1))
    # 未知 token：跳过到下一个分隔符，避免死循环
    j = i
    while j < len(s) and s[j] not in ",}":
        j += 1
    return s[i:j].strip(), j


def parse_table(s, i):
    """i 指向 '{'；返回 (dict|list, new_i)。键为标识符 -> dict；否则 list。"""
    assert s[i] == "{"
    i += 1
    items = []
    pairs = []
    is_dict = False
    while True:
        i = _skip_ws(s, i)
        if i >= len(s):
            break
        if s[i] == "}":
            i += 1
            break
        # [k] = v  或  k = v  或  纯值
        m = re.match(r"\[([^\]]+)\]\s*=", s[i:])
        m2 = re.match(r"([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)", s[i:])
        if m:
            key, i = parse_value(s, i + 1)
            i = _skip_ws(s, i)
            if i < len(s) and s[i] == "]":      # ⚠ 必须跳掉 ']'（首版漏了这一步，
                i += 1                          #   导致把嵌套表的字段当成外层键，解析出 0 个星球）
            i = _skip_ws(s, i)
            if i < len(s) and s[i] == "=":
                i += 1
            val, i = parse_value(s, i)
            pairs.append((key, val))
            is_dict = True
        elif m2:
            key = m2.group(1)
            i += m2.end()
            val, i = parse_value(s, i)
            pairs.append((key, val))
            is_dict = True
        else:
            val, i = parse_value(s, i)
            items.append(val)
        i = _skip_ws(s, i)
        if i < len(s) and s[i] == ",":
            i += 1
    if is_dict and not items:
        return dict(pairs), i
    # 混合（数值键 + 顺序值）也按 dict 处理，数值键保留
    return (dict(pairs) if pairs else items), i


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="只校验磁盘上的产物是否与上游一致")
    a = ap.parse_args()

    wt = fetch_module()
    m = re.search(r"return\s*\{", wt)
    if not m:
        print("!! 未找到 return 表")
        return 2
    root, _ = parse_table(wt, m.end() - 1)

    planets = {}
    total_regions = 0
    for idx, p in sorted(root.items(), key=lambda kv: int(kv[0]) if str(kv[0]).isdigit() else 0):
        if not isinstance(p, dict):
            continue
        regs = p.get("regions")
        if not regs:
            continue
        clean = []
        for r in (regs if isinstance(regs, list) else list(regs.values())):
            if not isinstance(r, dict) or not r.get("name"):
                continue
            clean.append({k: r.get(k) for k in ("name", "desc", "size", "owner", "region_type", "region_faction")})
        if not clean:
            continue
        planets[str(idx)] = {"name": p.get("Name"), "pagename": p.get("pagename"),
                             "sector": p.get("sector"), "regions": clean}
        total_regions += len(clean)

    doc = {
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source": "helldivers.wiki.gg :: %s（Lua 数据模块，英文原名）" % PAGE,
        "total": len(planets),
        "region_total": total_regions,
        "planets": planets,
    }
    text = json.dumps(doc, ensure_ascii=False, indent=2) + "\n"
    json.loads(text)
    old = io.open(OUT, encoding="utf-8").read() if os.path.exists(OUT) else ""
    if a.check:
        same = json.loads(old).get("planets") == planets if old else False
        print("--check: %s（有 region 的星球 %d / 区域 %d）" % ("一致" if same else "**不一致**", len(planets), total_regions))
        return 0 if same else 1
    io.open(OUT, "w", encoding="utf-8", newline="\n").write(text)
    print("有 region 的星球 %d 个，共 %d 个区域；写出 %s（%d -> %d B）" % (
        len(planets), total_regions, OUT, len(old), len(text.encode("utf-8"))))
    # 抽样：目标星球
    for want in ("198", "217", "100", "0"):
        p = planets.get(want)
        if p:
            print("  #%s %s: %s" % (want, p["name"], " | ".join(
                "%s(%s/%s)" % (r["name"], r.get("size"), r.get("region_type")) for r in p["regions"][:6])))
    return 0


if __name__ == "__main__":
    sys.exit(main())
