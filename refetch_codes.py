# -*- coding: utf-8 -*-
"""重抓取缺少呼叫代码的战略配备（支援武器/背包/载具等武器型页面）"""
import json, urllib.request, urllib.parse, io, sys, re, time, os
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass
API = "https://helldivers.wiki.gg/api.php"
HEADERS = {"User-Agent": "Mozilla/5.0 HD2-Wiki/1.0"}
ARROW_DIR = {"Stratagem Arrow Up.svg":"↑","Stratagem Arrow Down.svg":"↓","Stratagem Arrow Left.svg":"←","Stratagem Arrow Right.svg":"→"}
ARROW_CODE = {"↑":"U","↓":"D","←":"L","→":"R"}
BASE = r"E:\GitLoadWareHouse\Jerry114514.github.io\HD2_Wiki\data\wiki\zh"
OUT = os.path.join(BASE, "stratagems_full.json")

def api(params):
    url = API + "?" + urllib.parse.urlencode(params)
    r = urllib.request.Request(url, headers=HEADERS)
    return json.loads(urllib.request.urlopen(r, timeout=15).read())

def extract_code(html):
    code_html = None
    row_m = re.search(r'druid-row-stratagem[^>]*>(.*?)(?=<div class="druid-row|</div>\s*</div>\s*</div>)', html, re.S)
    if row_m:
        code_html = row_m.group(1)
    else:
        m = re.search(r'druid-data-stratagem[^>]*>(.*?)</div>\s*</div>', html, re.S)
        code_html = m.group(1) if m else None
    arrows = ""
    if code_html:
        for im in re.finditer(r'<img alt="([^"]+)"', code_html):
            d = ARROW_DIR.get(im.group(1))
            if d: arrows += d
    return arrows

d = json.load(open(OUT, encoding="utf-8"))
items = d["stratagems"]
# 找出缺少代码的项目
needs = [s for s in items if not s.get("code")]
print(f"总 {len(items)}，缺少代码 {len(needs)}", flush=True)

updated = 0
for i, s in enumerate(needs):
    title = s.get("name_en") or s["id"]
    try:
        pd = api({"action":"parse","page":title,"prop":"text","format":"json"})
        if "parse" not in pd:
            print(f"  [skip] {s['id']}: page not found", flush=True)
            continue
        html = pd["parse"]["text"]["*"]
        code = extract_code(html)
        if code:
            s["code"] = code
            updated += 1
            print(f"  [OK] {s['id']}: {code}", flush=True)
        else:
            print(f"  [empty] {s['id']}", flush=True)
    except Exception as e:
        print(f"  [ERR] {s['id']}: {e}", flush=True)
    time.sleep(0.3)

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(d, f, ensure_ascii=False, indent=2)
    f.write("\n")
print(f"完成，新增代码 {updated} 个，仍缺 {sum(1 for s in items if not s.get('code'))}", flush=True)