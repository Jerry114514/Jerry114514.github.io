# -*- coding: utf-8 -*-
"""抓取 Helldivers Wiki 敌人数据（自动判定模式）：阵营 + 敌人 + 部位 + 图片"""
import json, urllib.request, urllib.parse, io, sys, re, time, html as html_mod, os
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass
API = "https://helldivers.wiki.gg/api.php"
HEADERS = {"User-Agent": "Mozilla/5.0 HD2-Wiki/1.0"}

# 只排除明确非敌人的前缀（Category/翻译页/旧作/彩蛋/用户页/模板）
EXCLUDE_PREFIX = ("Helldivers 1:", "April Fools/", "User:", "Category:", "Template:")
# 明确非敌人的精确标题（分类页/任务页/索引页）
EXCLUDE_EXACT = {
    "Automatons", "Enemy Classes", "Factions", "Federation of Super Earth", "Illuminate", "Terminids",
    "Cognitive Disruptor", "Destroy Rogue Research Station", "Terminate Illegal Broadcast",
    "Commando: Acquire Evidence", "Commando: Extract Intel", "Commando: Secure Black Box",
    "Ground All-Terrain Extraction Rig (GATER)", "Heavy SEAF Presence",
    "SEAF SAM Site", "Gazer", "Gazer Spire", "Lightning Spire", "Monolith", "Bunker Turret",
    "Automaton MG Emplacement", "Grounded Warp Ship", "Warp Ship", "Vox Engine",
    "The Great Host", "Strider",
}

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

def get_category_members(cat):
    titles = []
    cmcontinue = None
    while True:
        params = {"action":"query","list":"categorymembers","cmtitle":cat,"cmlimit":"100","format":"json"}
        if cmcontinue: params["cmcontinue"] = cmcontinue
        d = api(params)
        titles.extend([m["title"] for m in d.get("query",{}).get("categorymembers",[])])
        cont = d.get("continue",{}).get("cmcontinue")
        if not cont: break
        cmcontinue = cont
        time.sleep(0.2)
    return titles

def parse_enemy_infobox(html):
    result = {}
    pattern = re.compile(r'druid-label-(?:[^"\s]+)"[^>]*>([^<]*)</div>\s*<div class="druid-data[^"]*"[^>]*>(.*?)</div>\s*</div>', re.S)
    for m in pattern.finditer(html):
        label = strip_html(m.group(1))
        val = strip_html(m.group(2))
        if label and val:
            result[label] = val
    return result

def parse_body_parts(html):
    parts = []
    idx = html.find(">Part Name</th>")
    if idx < 0: return parts
    tstart = html.rfind("<table", 0, idx)
    tend = html.find("</table>", idx)
    if tstart < 0 or tend < 0: return parts
    table = html[tstart:tend]
    for row in re.findall(r'<tr>(.*?)</tr>', table, re.S):
        cells = re.findall(r'<(?:td|th)[^>]*>(.*?)</(?:td|th)>', row, re.S)
        if len(cells) < 2: continue
        name = strip_html(cells[0])
        if not name or name in ("Part Name",): continue
        health = strip_html(cells[1])
        av = strip_html(cells[2])
        img = None
        if len(cells) > 3:
            m = re.search(r'src="(/images/thumb/[^"]+)"', cells[3])
            if m:
                img = "https://helldivers.wiki.gg" + m.group(1)
            else:
                m2 = re.search(r'src="(/images/[^"]+)"', cells[3])
                if m2:
                    img = "https://helldivers.wiki.gg" + m2.group(1)
        durable = strip_html(cells[4]) if len(cells) > 4 else ""
        pct = strip_html(cells[5]) if len(cells) > 5 else ""
        parts.append({"name": name, "health": health, "armor": av, "image": img, "durable": durable, "pct_to_main": pct})
    return parts

def get_enemy_image(html):
    m = re.search(r'(/images/[A-Za-z0-9_\-%.]+_Enemy_Icon\.(?:png|jpg|webp))\??', html)
    if m: return "https://helldivers.wiki.gg" + m.group(1)
    return None

def is_enemy_page(html):
    """自动判定是否为敌人页面：有 druid-container-enemy 且有 Faction 字段"""
    if 'druid-container-enemy' not in html:
        return False
    if 'druid-label-faction' not in html and 'druid-label-Faction' not in html:
        return False
    return True

def parse_enemy(title):
    try:
        d = api({"action":"parse","page":title,"prop":"text","format":"json"})
        if "parse" not in d:
            return None
        html = d["parse"]["text"]["*"]
        if not is_enemy_page(html):
            return None
        info = parse_enemy_infobox(html)
        if not info.get("Faction") and not info.get("faction"):
            return None
        parts = parse_body_parts(html)
        img = get_enemy_image(html)
        return {
            "id": slugify(title),
            "name": title,
            "name_zh": "",
            "faction": normalize_faction(info.get("Faction", info.get("faction", ""))),
            "faction_label": info.get("Faction", info.get("faction", "")),
            "image": img,
            "description": info.get("Description", info.get("description", "")),
            "category": info.get("Size Class", ""),
            "health_total": info.get("Health", ""),
            "damage": info.get("Damage", ""),
            "damage_type": info.get("Damage Type", ""),
            "fire_damage_multiplier": info.get("Fire Damage Multiplier", ""),
            "stagger_threshold": info.get("Stagger Threshold", ""),
            "minimum_difficulty": info.get("Minimum Difficulty", ""),
            "body_parts": parts,
            "weak_points": [],
            "attacks": [],
            "behavior": "",
            "spawn": {"locations": [], "difficulty": info.get("Minimum Difficulty", "")},
            "drops": [],
            "source_page": "https://helldivers.wiki.gg/wiki/" + urllib.parse.quote(title.replace(" ","_")),
        }
    except Exception as e:
        print(f"  [ERR] {title}: {e}", flush=True)
        return None

def slugify(s):
    s = s.lower().replace(" ", "_").replace("/", "_")
    s = re.sub(r'[^a-z0-9_]+', '_', s)
    return s.strip("_")

def normalize_faction(f):
    fl = f.lower()
    if "terminid" in fl: return "terminids"
    if "automaton" in fl: return "automatons"
    if "illuminate" in fl: return "illuminate"
    return "unknown"

def main():
    base = r"E:\GitLoadWareHouse\Jerry114514.github.io\HD2_Wiki\data\wiki\zh"
    all_titles = get_category_members("Category:Enemies")
    # 只过滤明确非敌人前缀，其余全部尝试（自动判定）
    candidates = []
    for t in all_titles:
        if t.startswith(EXCLUDE_PREFIX): continue
        if t.endswith("/zh"): continue
        if t in EXCLUDE_EXACT: continue
        candidates.append(t)
    print(f"候选页面: {len(candidates)}", flush=True)
    enemies = []
    errors = []
    skipped = []
    for i, t in enumerate(candidates):
        e = parse_enemy(t)
        if e:
            enemies.append(e)
        else:
            # 区分：无 enemy container（跳过） vs 错误
            skipped.append(t)
        if i % 10 == 0:
            print(f"  {i}/{len(candidates)}", flush=True)
        time.sleep(0.3)
    # 输出
    factions_data = {
        "factions": [
            {"id":"terminids","name":"Terminids","name_zh":"终结族","color":"#FF4444","strains":[{"name":"Predator Strain","name_zh":"掠食者变种"},{"name":"Spore Burst Strain","name_zh":"孢子爆发变种"},{"name":"Rupture Strain","name_zh":"爆裂变种"}],"enemies":[e["id"] for e in enemies if e["faction"]=="terminids"]},
            {"id":"automatons","name":"Automatons","name_zh":"机器人","color":"#4488FF","strains":[{"name":"Jet Brigade","name_zh":"喷气旅"},{"name":"Incineration Corps","name_zh":"焚化军团"},{"name":"Cyborg Legion","name_zh":"生化人军团"}],"enemies":[e["id"] for e in enemies if e["faction"]=="automatons"]},
            {"id":"illuminate","name":"Illuminate","name_zh":"光能族","color":"#AA44FF","strains":[{"name":"Appropriators","name_zh":"掠夺者"},{"name":"VoteSnatchers","name_zh":"偷票者"},{"name":"Mindless Masses","name_zh":"无脑群氓"},{"name":"Invasion Fleet","name_zh":"入侵舰队"}],"enemies":[e["id"] for e in enemies if e["faction"]=="illuminate"]},
        ],
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    os.makedirs(base, exist_ok=True)
    with open(os.path.join(base, "factions.json"), "w", encoding="utf-8") as f:
        json.dump(factions_data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    enemies_data = {
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source": "https://helldivers.wiki.gg",
        "total": len(enemies),
        "enemies": enemies,
    }
    with open(os.path.join(base, "enemies.json"), "w", encoding="utf-8") as f:
        json.dump(enemies_data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    report = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source": "https://helldivers.wiki.gg",
        "total_factions": 3,
        "total_enemies": len(enemies),
        "enemies_with_images": sum(1 for e in enemies if e["image"]),
        "enemies_with_parts": sum(1 for e in enemies if e["body_parts"]),
        "skipped_not_enemy": skipped,
        "errors": errors,
        "warnings": [],
    }
    os.makedirs(os.path.join(base, "fetch_reports"), exist_ok=True)
    with open(os.path.join(base, "fetch_reports", "enemies_fetch_report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"\n完成: 敌人 {len(enemies)}，图片 {report['enemies_with_images']}，部位 {report['enemies_with_parts']}", flush=True)
    print(f"跳过(非敌人) {len(skipped)}，错误 {len(errors)}", flush=True)
    from collections import Counter
    print("阵营分布:", dict(Counter(e["faction"] for e in enemies)), flush=True)

if __name__ == "__main__":
    main()