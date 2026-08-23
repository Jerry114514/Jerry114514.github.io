# -*- coding: utf-8 -*-
"""获取 Helldivers Wiki.gg 武器数据并输出本地 weapons.json"""
import json, urllib.request, urllib.parse, io, sys, re, time, html as html_mod, os
# 安全配置 stdout，避免 Windows 控制台 GBK 编码报错
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

API = "https://helldivers.wiki.gg/api.php"
HEADERS = {"User-Agent": "Mozilla/5.0 HD2-Wiki/1.0 (wiki data fetcher)"}

CATEGORY_MAP = {
    "Category:Primary Weapons": "primary",
    "Category:Special Primaries": "primary",
    "Category:Secondary Weapons": "secondary",
    "Category:Special Secondaries": "secondary",
    "Category:Throwables": "throwables",
    "Category:Standard Throwables": "throwables",
    "Category:Special Throwables": "throwables",
}

SUBCATEGORY_CN = {
    "Assault Rifles": "突击步枪", "SMGs": "冲锋枪", "Submachine Guns": "冲锋枪", "Shotguns": "霰弹枪",
    "Marksman Rifles": "精确射手步枪", "Sniper Rifles": "狙击步枪",
    "Energy Weapons": "能量武器", "Crossbows": "弩", "Explosive": "爆炸武器", "Special": "特殊武器",
    "Pistols": "手枪", "Revolvers": "左轮手枪", "Grenade Pistols": "手雷手枪",
    "Grenades": "手雷", "Standard Throwables": "标准投掷物", "Special Throwables": "特殊投掷物",
    "Throwables": "投掷物", "Energy-Based": "能量武器", "Explosives": "爆炸武器",
    "Melee": "近战武器", "Special Weapons": "特殊武器",
}

PEN_MAP = {"Light": "light", "Medium": "medium", "Heavy": "heavy", "None": "none"}
LABEL_KEY = {
    "Weapon Category": "weapon_category", "Weapon Type": "weapon_type",
    "Firing Modes": "firing_modes", "Traits": "weapon_traits",
    "Standard Damage": "damage", "Armor Penetration": "penetration",
    "Fire Rate": "fire_rate", "DPS": "dps", "Capacity": "capacity",
    "Spare Mags": "spare_mags", "Ergonomics": "ergonomics", "Recoil": "recoil",
    "Reload Time": "reload_time", "Source": "source",
}

def fetch_api(params):
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=HEADERS)
    resp = urllib.request.urlopen(req, timeout=15)
    return json.loads(resp.read())

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
        params = {"action": "query", "list": "categorymembers", "cmtitle": cat, "cmlimit": "100", "format": "json"}
        if cmcontinue: params["cmcontinue"] = cmcontinue
        d = fetch_api(params)
        members = d.get("query", {}).get("categorymembers", [])
        titles.extend([m["title"] for m in members])
        cont = d.get("continue", {}).get("cmcontinue")
        if not cont: break
        cmcontinue = cont
        time.sleep(0.2)
    return titles

def sort_key(t):
    m = re.match(r'^([A-Z/]+)-?(\d+)', t)
    if m: return (m.group(1), int(m.group(2)))
    return (t, 999)

def parse_infobox(html):
    result = {}
    # 判断 infobox 类型（weapon/support/throwable 等）
    mtype = re.search(r'druid-container-([a-z]+)', html)
    result["__type"] = mtype.group(1) if mtype else "weapon"
    pattern = re.compile(
        r'druid-label-(?:[^"\s]+)"[^>]*>([^<]*)</div>\s*'
        r'<div class="druid-data druid-data-[^"]*"[^>]*>(.*?)</div>\s*</div>', re.S)
    for m in pattern.finditer(html):
        label = strip_html(m.group(1))
        val = strip_html(m.group(2))
        key = LABEL_KEY.get(label, label.lower().replace(" ", "_"))
        result[key] = val
    return result

def get_description(html):
    m = re.search(r'infobox.*?</table>', html, re.S)
    body = html[m.end():] if m else html
    p = re.search(r'<p[^>]*>(.*?)</p>', body, re.S)
    if p:
        text = strip_html(p.group(1))
        if text: return text
    p2 = re.search(r'<p[^>]*>(.*?)</p>', html, re.S)
    return strip_html(p2.group(1)) if p2 else ""

def slugify(s):
    s = s.lower().replace(" ", "_")
    s = re.sub(r'[^a-z0-9_]+', '_', s)
    return s.strip("_")

def get_weapon(page):
    """获取单个武器页面并提取数据"""
    try:
        d = fetch_api({"action": "parse", "page": page, "prop": "text", "format": "json"})
        html = d["parse"]["text"]["*"]
        info = parse_infobox(html)
        # 无 weapon_category 时为抛投物/支援武器，用 __type 判断
        box_type = info.get("__type", "weapon")
        if not info.get("weapon_category") and box_type not in ("throwable", "support"):
            return None
        cat = "primary"
        cat_str = info.get("weapon_category", "")
        if "Secondary" in cat_str or box_type == "secondary":
            cat = "secondary"
        elif "Throwable" in cat_str or box_type == "throwable":
            cat = "throwables"
        elif "Support" in cat_str or box_type == "support":
            cat = "support"
        name_en = page
        subcat_raw = info.get("weapon_type", "")
        subcat = subcat_raw if subcat_raw else "Throwables"
        dm = re.match(r'([\d,.]+)', info.get("damage", ""))
        damage = float(dm.group(1).replace(",", "")) if dm else None
        dam_type = re.search(r'([A-Za-z]+)$', info.get("damage", ""))
        dam_type = dam_type.group(1).strip() if dam_type else None
        fr = re.match(r'([\d,.]+)', info.get("fire_rate", ""))
        fire_rate = int(float(fr.group(1).replace(",", ""))) if fr else None
        rc = re.match(r'([\d,.]+)', info.get("recoil", ""))
        recoil = float(rc.group(1).replace(",", "")) if rc else None
        cap = re.match(r'([\d,.]+)', info.get("capacity", ""))
        capacity = int(float(cap.group(1).replace(",", ""))) if cap else None
        sm = re.match(r'([\d,.]+)', info.get("spare_mags", ""))
        spare = int(float(sm.group(1).replace(",", ""))) if sm else None
        pen = PEN_MAP.get(info.get("penetration", "").strip(), "light")
        modes_raw = info.get("firing_modes", "")
        modes = [m.strip() for m in re.split(r'[•·]', modes_raw) if m.strip()] if modes_raw else []
        traits_raw = info.get("weapon_traits", "") or info.get("throwable_traits", "")
        traits = [t.strip() for t in re.split(r'[•,;]', traits_raw) if t.strip()] if traits_raw else []
        unlock = info.get("source", "") or info.get("cost", "")
        description = get_description(html)
        ergo = info.get("ergonomics", "")
        dps = info.get("dps", "").split("•")[0].strip().replace(",", "") if info.get("dps") else ""
        return {
            "id": slugify(name_en), "name": name_en, "name_en": name_en, "category": cat,
            "subcategory": slugify(subcat), "subcategory_name": SUBCATEGORY_CN.get(subcat, subcat),
            "stats_short": {"damage": damage, "capacity": capacity, "penetration": pen},
            "stats_full": {
                "damage": damage, "damage_type": dam_type, "capacity": capacity,
                "fire_rate": fire_rate, "recoil": recoil, "penetration": pen,
                "reserve_ammo": spare, "fire_modes": modes,
                "ergonomics": int(float(ergo.replace(",", ""))) if ergo else None,
                "reload_time": info.get("reload_time", ""),
                "dps": int(float(dps)) if dps.isdigit() else None,
            },
            "traits": traits, "unlock": unlock, "description": description,
            "lore": "", "variants": [], "tips": [], "related": {},
            "source_url": "https://helldivers.wiki.gg/wiki/" + urllib.parse.quote(page.replace(" ", "_")),
        }
    except Exception as e:
        print(f"  [FAIL] {page}: {e}", flush=True)
        return None

def main():
    out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "HD2_Wiki", "data", "wiki", "zh", "weapons.json")
    if not os.path.exists(os.path.dirname(out_path)):
        out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "wiki", "zh", "weapons.json")

    print("=== 获取武器列表 ===", flush=True)
    all_titles = {}
    for cat, code in CATEGORY_MAP.items():
        titles = get_category_members(cat)
        for t in titles:
            all_titles[t] = code
        print(f"  {cat}: {len(titles)}", flush=True)
        time.sleep(0.3)

    weapons_raw = sorted(all_titles.items(), key=lambda x: sort_key(x[0]))
    print(f"\n=== 总计 {len(weapons_raw)} 个武器（去重前） ===", flush=True)

    weapons = []
    for i, (title, cat) in enumerate(weapons_raw):
        if i % 10 == 0:
            print(f"  抓取中: {i}/{len(weapons_raw)}", flush=True)
        if title.startswith("Category:") or title.startswith("User:") or title.startswith("Helldivers Wiki:") or title.startswith("April Fools/") or ("/" in title and not title.startswith("CQC")):
            continue
        w = get_weapon(title)
        if w:
            w["category"] = cat
            weapons.append(w)
        time.sleep(0.4)

    cats = {"primary": 0, "secondary": 0, "throwables": 0, "support": 0}
    for w in weapons:
        cats[w["category"]] = cats.get(w["category"], 0) + 1

    result = {
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source": "Helldivers Wiki.gg",
        "total": len(weapons),
        "categories": {
            "primary": {"name": "主武器", "name_en": "Primary Weapons", "count": cats.get("primary", 0)},
            "secondary": {"name": "副武器", "name_en": "Secondary Weapons", "count": cats.get("secondary", 0)},
            "throwables": {"name": "投掷物", "name_en": "Throwables", "count": cats.get("throwables", 0)},
            "support": {"name": "支援武器", "name_en": "Support Weapons", "count": cats.get("support", 0)},
        },
        "weapons": weapons,
    }
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"\n已输出: {out_path}", flush=True)
    print(f"武器总数: {len(weapons)}，分类: {cats}", flush=True)

if __name__ == "__main__":
    main()