# -*- coding: utf-8 -*-
"""解析战略配备页面 Detailed Weapon Statistics 区域，生成 detailed_stats 字段"""
import json, urllib.request, urllib.parse, io, sys, re, html as html_mod
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass
API = "https://helldivers.wiki.gg/api.php"
HEADERS = {"User-Agent": "Mozilla/5.0 HD2-Wiki/1.0"}

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

def parse_value(raw):
    """提取单元格纯文本值，保留单位"""
    return strip_html(raw)

# 标签 -> 字段名（基础信息）
GENERAL_MAP = {
    "Cooldown": "cooldown", "Uses": "uses", "Main Health": "main_health",
    "Main Armor": "main_armor", "Bombs": "bombs", "Salvos": "salvos",
    "Bombardment Area Size": "bombardment_area",
}
# 分组 -> 标签映射
SECTION_LABELS = {
    "Projectile": {"Mass": "mass", "Initial Velocity": "initial_velocity", "Drag Factor": "drag_factor",
                   "Gravity Factor": "gravity_factor", "Penetration Slowdown": "penetration_slowdown",
                   "Explosion On Impact": "explosion_on_impact", "Explode After": "explode_after"},
    "Damage": {"Standard": "damage_standard", "vs. Durable": "damage_durable", "Damage Element": "damage_element",
               "Inner Radius": "inner_radius", "Inner Durable": "inner_durable",
               "Outer Radius": "outer_radius", "Outer Durable": "outer_durable"},
    "Penetration": {"Direct": "pen_direct", "Slight Angle": "pen_slight_angle", "Large Angle": "pen_large_angle",
                    "Extreme Angle": "pen_extreme_angle", "AoE Effect": "pen_aoe"},
    "Special Effects": {"Demolition Force": "demolition_force", "Stagger Force": "stagger_force", "Push Force": "push_force"},
    "Area of Effect": {"Inner Radius": "radius_inner", "Outer Radius": "radius_outer", "Shockwave Radius": "radius_shockwave"},
}

def parse_range(v):
    """解析范围值如 '1199 - 0' 或 '1499 - 0' -> {min,max}"""
    m = re.match(r'^\s*([\d.]+)\s*-\s*([\d.]+)\s*$', v)
    if m:
        return {"min": float(m.group(2)), "max": float(m.group(1))}
    return v

def parse_tables(section_html):
    """从 Detailed Weapon Statistics 区域解析所有表格"""
    tables = re.findall(r'<table([^>]*)>(.*?)</table>', section_html, re.S)
    result = {"general": {}, "attacks": []}
    attack_by_id = {}
    for attrs, tbl in tables:
        cls = re.search(r'class="[^"]*attack-data-table-([a-z]+)"', attrs)
        table_type = cls.group(1) if cls else "weapon"
        table_id = None
        mid = re.search(r'id="([^"]+)"', attrs)
        if mid:
            table_id = html_mod.unescape(mid.group(1)).replace(" ", "").replace("_", "").upper()
        # 解析行
        rows = re.findall(r'<tr>(.*?)</tr>', tbl, re.S)
        header = None  # 当前分组标题 (th colspan=2)
        current_attack = None
        is_attack_table = table_type in ("projectile", "explosion", "melee", "grenade")
        if is_attack_table:
            current_attack = {"name": None, "type": table_type, "sections": {}}
        for row in rows:
            cells = re.findall(r'<(?:td|th)[^>]*>(.*?)</(?:td|th)>', row, re.S)
            if not cells: continue
            # 判断是否为分组标题 (th colspan=2)
            if '<th' in row and 'colspan' in row and len(cells) == 1:
                header = strip_html(cells[0])
                if is_attack_table and header and header not in SECTION_LABELS and current_attack and not current_attack["name"]:
                    current_attack["name"] = header
                continue
            if len(cells) < 2: continue
            label = strip_html(cells[0])
            val = parse_value(cells[1])
            if is_attack_table:
                if current_attack is not None:
                    if header in SECTION_LABELS:
                        current_attack["sections"].setdefault(header, {})[SECTION_LABELS[header].get(label, label.lower().replace(" ", "_"))] = val
                    else:
                        current_attack.setdefault("top", {})[label.lower().replace(" ", "_")] = val
            else:
                # 父表：通用信息 或 攻击列表
                if header == "Attacks":
                    result["attacks"].append({"name": label, "type": val})
                elif label in GENERAL_MAP:
                    result["general"][GENERAL_MAP[label]] = val
        if is_attack_table and current_attack:
            attack_by_id[table_id] = current_attack
    # 将攻击表数据关联到 attacks
    for a in result["attacks"]:
        clean = a["name"].lstrip("*").strip()
        key = clean.replace(" ", "").replace("_", "").upper()
        if key in attack_by_id:
            src = attack_by_id[key]
            a["data"] = src.get("sections", {})
            if src.get("top"):
                a["top"] = src["top"]
    # 清理无数据的
    result["attacks"] = [a for a in result["attacks"] if "data" in a or "top" in a]
    return result

def get_detailed_stats(page):
    """获取页面的 detailed_stats"""
    try:
        d = fetch_api({"action": "parse", "page": page, "prop": "text", "format": "json"})
        if "parse" not in d: return None
        html = d["parse"]["text"]["*"]
        # 定位 Detailed Weapon Statistics 区域
        start = html.find('id="Detailed_Weapon_Statistics"')
        if start < 0: return None
        h2end = html.find("</h2>", start)
        if h2end < 0: return None
        # 找下一个标题
        nxt = html.find('<h2', h2end + 5)
        if nxt > 0:
            section = html[h2end + 5:nxt]
        else:
            section = html[h2end + 5:]
        parsed = parse_tables(section)
        if not parsed["general"] and not parsed["attacks"]:
            return None
        # 构建 detailed_stats
        detailed = {"cooldown": parsed["general"].get("cooldown"),
                    "uses": parsed["general"].get("uses"),
                    "main_health": parsed["general"].get("main_health"),
                    "main_armor": parsed["general"].get("main_armor"),
                    "bombs": parsed["general"].get("bombs"),
                    "salvos": parsed["general"].get("salvos"),
                    "bombardment_area": parsed["general"].get("bombardment_area")}
        detailed = {k: v for k, v in detailed.items() if v is not None}
        attacks = []
        for a in parsed["attacks"]:
            atk = {"name": a["name"].lstrip("*").strip(), "type": a["type"].lower()}
            data = a.get("data", {})
            # projectile
            if "Projectile" in data:
                atk["projectile"] = data["Projectile"]
            # damage
            if "Damage" in data:
                dmg = dict(data["Damage"])
                # 解析范围
                for k in ("outer_radius", "outer_durable", "inner_radius"):
                    if k in dmg and isinstance(dmg[k], str) and "-" in dmg[k]:
                        dmg[k] = parse_range(dmg[k])
                atk["damage"] = dmg
            # penetration
            if "Penetration" in data:
                atk["penetration"] = data["Penetration"]
            # special effects
            if "Special Effects" in data:
                atk["special_effects"] = data["Special Effects"]
            # area of effect
            if "Area of Effect" in data:
                atk["area_of_effect"] = data["Area of Effect"]
            attacks.append(atk)
        if not attacks:
            return detailed or None
        detailed["attacks"] = attacks
        return detailed
    except Exception as e:
        print(f"  [ERR] {page}: {e}", flush=True)
        return None

if __name__ == "__main__":
    for page in ["Eagle 500kg Bomb", "Orbital 120mm HE Barrage"]:
        print(f"\n===== {page} =====")
        ds = get_detailed_stats(page)
        if ds:
            print(json.dumps(ds, ensure_ascii=False, indent=2)[:2500])
        else:
            print("  detailed_stats: None")