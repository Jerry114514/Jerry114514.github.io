# -*- coding: utf-8 -*-
"""扫描战略配备页面的独立 status 状态区块，写入 status_effects"""
import json, urllib.request, urllib.parse, io, sys, re, time, html as html_mod, os
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass
API = "https://helldivers.wiki.gg/api.php"
HEADERS = {"User-Agent": "Mozilla/5.0 HD2-Wiki/1.0"}
BASE = r"E:\GitLoadWareHouse\Jerry114514.github.io\HD2_Wiki\data\wiki\zh"
OUT = os.path.join(BASE, "stratagems_full.json")

def api(params):
    url = API + "?" + urllib.parse.urlencode(params)
    r = urllib.request.Request(url, headers=HEADERS)
    return json.loads(urllib.request.urlopen(r, timeout=15).read())

def strip_html(s):
    if not s: return ""
    s = re.sub(r'<br\s*/?>', ' ', s)
    s = re.sub(r'<[^>]+>', ' ', s)
    s = html_mod.unescape(s)
    return re.sub(r'\s+', ' ', s).strip()

def parse_status_tables(html):
    """解析页面所有 attack-data-table-status 表"""
    results = []
    for m in re.finditer(r'<table([^>]*)>(.*?)</table>', html, re.S):
        attrs, body = m.group(1), m.group(2)
        if 'attack-data-table-status' not in attrs:
            continue
        mid = re.search(r'id="([^"]+)"', attrs)
        name = html_mod.unescape(mid.group(1)) if mid else "Status"
        # 解析行
        header = None
        entry = {"name": name, "stats": {}}
        for row in re.findall(r'<tr>(.*?)</tr>', body, re.S):
            cells = re.findall(r'<(?:td|th)[^>]*>(.*?)</(?:td|th)>', row, re.S)
            if not cells: continue
            if '<th' in row and 'colspan' in row and len(cells) == 1:
                header = strip_html(cells[0])
                continue
            if len(cells) < 2: continue
            label = strip_html(cells[0])
            val = strip_html(cells[1])
            if header == "Status":
                entry["stats"][label.lower().replace(" ", "_")] = val
            elif header == "Damage":
                entry.setdefault("damage", {})[label.lower().replace(" ", "_")] = val
            elif header == "Penetration":
                entry.setdefault("penetration", {})[label.lower().replace(" ", "_")] = val
            elif header == "Special Effects":
                entry.setdefault("special_effects", {})[label.lower().replace(" ", "_")] = val
        results.append(entry)
    return results

def main():
    d = json.load(open(OUT, encoding="utf-8"))
    items = d["stratagems"]
    updated = 0
    for i, s in enumerate(items):
        title = s.get("name_en") or s["id"]
        try:
            pd = api({"action":"parse","page":title,"prop":"text","format":"json"})
            if "parse" not in pd:
                continue
            html = pd["parse"]["text"]["*"]
            stats = parse_status_tables(html)
            if stats:
                # 关联：合并到 status_effects（保留已有的）
                se = s.get("status_effects")
                if isinstance(se, dict) and "damage" in se and "name" not in se:
                    # 已是单状态对象格式，转数组
                    s["status_effects"] = [se]
                    se = s["status_effects"]
                elif not isinstance(se, list):
                    se = []
                    s["status_effects"] = se
                for st in stats:
                    # 避免重复
                    if any(x.get("name") == st["name"] for x in se):
                        continue
                    se.append(st)
                    updated += 1
            if i % 10 == 0:
                print(f"  {i}/{len(items)}", flush=True)
        except Exception as e:
            print(f"  [ERR] {title}: {e}", flush=True)
        time.sleep(0.3)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"完成: 新增 {updated} 个状态效果关联", flush=True)
    # 统计
    has_se = [s["id"] for s in items if s.get("status_effects")]
    print("含 status_effects 的战略配备:", len(has_se), flush=True)

if __name__ == "__main__":
    main()