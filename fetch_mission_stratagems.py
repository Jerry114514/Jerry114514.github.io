# -*- coding: utf-8 -*-
"""抓取 Mission Stratagems 条目并合并到 stratagems_full.json"""
import json, urllib.request, urllib.parse, io, sys, re, time, html as html_mod, os
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass
API = "https://helldivers.wiki.gg/api.php"
HEADERS = {"User-Agent": "Mozilla/5.0 HD2-Wiki/1.0"}

MISSION_TITLES = [
    "Reinforce", "SoS Beacon", "Resupply", "Eagle Rearm", "NUX-223 Hellbomb",
    "SSSD Delivery", "Upload Data", "Seismic Probe", "Orbital Illumination Flare",
    "Call In Super Destroyer", "Cargo Container", "Prospecting Drill", "SEAF Artillery",
    "Super Earth Flag", "Tectonic Drill", "Reinforcement Pods", "Hive Breaker Drill",
    "Dark Fluid Vessel", "Tactical Video Camera", "Aquifer Drill"
]
# 中文名映射（用户清单 + 合理翻译）
MISSION_CN = {
    "Reinforce": "增援", "SoS Beacon": "SOS信标", "Resupply": "补给",
    "Eagle Rearm": "飞鹰重新装填", "NUX-223 Hellbomb": "NUX-223 地狱火炸弹",
    "SSSD Delivery": "SSSD运送", "Upload Data": "上传数据", "Seismic Probe": "地震探测仪",
    "Orbital Illumination Flare": "轨道照明弹", "Call In Super Destroyer": "呼叫超级驱逐舰",
    "Cargo Container": "货物集装箱", "Prospecting Drill": "勘探钻机", "SEAF Artillery": "SEAF炮兵",
    "Super Earth Flag": "超级地球旗帜", "Tectonic Drill": "构造钻机", "Reinforcement Pods": "增援舱",
    "Hive Breaker Drill": "巢穴破坏钻机", "Dark Fluid Vessel": "暗流容器", "Tactical Video Camera": "战术摄像机",
    "Aquifer Drill": "含水层钻机",
}
ARROW_DIR = {"Stratagem Arrow Up.svg":"↑","Stratagem Arrow Down.svg":"↓","Stratagem Arrow Left.svg":"←","Stratagem Arrow Right.svg":"→"}
ARROW_CODE = {"↑":"U","↓":"D","←":"L","→":"R"}

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
            a = ARROW_DIR.get(im.group(1))
            if a: arrows += a
    return arrows

def slugify(s):
    s = s.lower().replace(" ", "_")
    s = re.sub(r'[^a-z0-9_]+', '_', s)
    return s.strip("_")

def fetch_mission(title):
    try:
        d = api({"action":"parse","page":title,"prop":"text","format":"json"})
        if "parse" not in d:
            return {"error": "page not found"}
        html = d["parse"]["text"]["*"]
        mt = re.search(r'druid-container-([a-z]+)', html)
        box_type = mt.group(1) if mt else "stratagem"
        # 提取 base cooldown
        cd = re.search(r'druid-data-base[^>]*>(.*?)</div>\s*</div>', html, re.S)
        cooldown = strip_html(cd.group(1)) if cd else None
        # 呼叫代码
        arrows = extract_code(html)
        keys = "".join(ARROW_CODE.get(a,"") for a in arrows)
        # 图片
        img = re.search(r'(/images/[A-Za-z0-9_\-%.]+_Stratagem_Icon_Background\.svg)', html)
        image = "https://helldivers.wiki.gg" + img.group(1) if img else None
        return {
            "code": keys, "code_display": arrows, "cooldown": cooldown,
            "box_type": box_type, "image": image,
            "source_page": "https://helldivers.wiki.gg/wiki/" + urllib.parse.quote(title.replace(" ","_")),
        }
    except Exception as e:
        return {"error": str(e)}

def main():
    out = r"E:\GitLoadWareHouse\Jerry114514.github.io\HD2_Wiki\data\wiki\zh\stratagems_full.json"
    d = json.load(open(out, encoding="utf-8"))
    existing = {s["name_en"] for s in d["stratagems"]}
    added = []
    failed = []
    for title in MISSION_TITLES:
        if title in existing:
            print(f"[skip] {title} 已存在", flush=True)
            continue
        r = fetch_mission(title)
        time.sleep(0.3)
        if "error" in r:
            failed.append({"title": title, "error": r["error"]})
            print(f"[FAIL] {title}: {r['error']}", flush=True)
            continue
        item = {
            "id": slugify(title),
            "name": MISSION_CN.get(title, title),
            "name_en": title,
            "category": "mission",
            "category_label": "任务",
            "code": r["code"],
            "call_in_time": None,
            "cooldown": r["cooldown"] or "无限",
            "uses": "无限",
            "unlock": "任务战略配备",
            "image": r["image"],
            "description": "",
            "source_page": r["source_page"],
            "detailed_stats": None,
        }
        d["stratagems"].append(item)
        added.append(title)
        print(f"[OK] {title} code={r['code']!r} cd={r['cooldown']}", flush=True)
    d["total"] = len(d["stratagems"])
    with open(out, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"\n完成: 新增 {len(added)} 个 Mission 战略配备，总数 {d['total']}", flush=True)
    if failed:
        print("失败:", failed, flush=True)
    # 更新分类统计
    from collections import Counter
    print("分类分布:", dict(Counter(s["category"] for s in d["stratagems"])), flush=True)

if __name__ == "__main__":
    main()