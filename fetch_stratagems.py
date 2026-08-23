# -*- coding: utf-8 -*-
"""抓取 Helldivers Wiki.gg 战略配备补充数据，与现有翻译库合并"""
import json, urllib.request, urllib.parse, io, sys, re, time, html as html_mod, os
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

API = "https://helldivers.wiki.gg/api.php"
HEADERS = {"User-Agent": "Mozilla/5.0 HD2-Wiki/1.0 (stratagem fetcher)"}

# id -> Wiki 页面标题 映射（从 Category:Stratagems/Support/Backpacks 推断）
ID_TO_TITLE = {
    "orbital_120mm_he_barrage": "Orbital 120mm HE Barrage",
    "orbital_380mm_he_barrage": "Orbital 380mm HE Barrage",
    "orbital_napalm_barrage": "Orbital Napalm Barrage",
    "orbital_gatling_barrage": "Orbital Gatling Barrage",
    "orbital_gas_strike": "Orbital Gas Strike",
    "orbital_walking_barrage": "Orbital Walking Barrage",
    "orbital_laser": "Orbital Laser",
    "orbital_railcannon_strike": "Orbital Railcannon Strike",
    "orbital_smoke_strike": "Orbital Smoke Strike",
    "orbital_ems_strike": "Orbital EMS Strike",
    "orbital_airburst_strike": "Orbital Airburst Strike",
    "orbital_precision_strike": "Orbital Precision Strike",
    "eagle_110mm_rocket_pods": "Eagle 110mm Rocket Pods",
    "eagle_500kg_bomb": "Eagle 500kg Bomb",
    "eagle_napalm_airstrike": "Eagle Napalm Airstrike",
    "eagle_strafing_run": "Eagle Strafing Run",
    "eagle_smoke_strike": "Eagle Smoke Strike",
    "eagle_airstrike": "Eagle Airstrike",
    "eagle_cluster_bomb": "Eagle Cluster Bomb",
    "support_40_k_thermal_gun": "40-K Meltagun",
    "support_apw_1_anti_materiel_rifle": "APW-1 Anti-Materiel Rifle",
    "support_arc_3_arc_thrower": "ARC-3 Arc Thrower",
    "support_cqc_1_outcast": "CQC-1 One True Flag",
    "support_eat_17_expendable_anti_tank": "EAT-17 Expendable Anti-Tank",
    "support_eat_411_leveller": "EAT-411 Leveller",
    "support_eat_700_incendiary": "EAT-700 Expendable Napalm",
    "support_flam_40_flamethrower": "FLAM-40 Flamethrower",
    "support_gl_21_grenade_launcher": "GL-21 Grenade Launcher",
    "support_gl_52_conciliator": "GL-52 De-Escalator",
    "support_las_98_laser_cannon": "LAS-98 Laser Cannon",
    "support_las_99_quasar_cannon": "LAS-99 Quasar Cannon",
    "support_m_105_stalwart": "M-105 Stalwart",
    "support_mg_206_heavy_machine_gun": "MG-206 Heavy Machine Gun",
    "support_mg_43_machine_gun": "MG-43 Machine Gun",
    "support_mgx_42_bullet_storm": "MGX-42 Bullet Storm",
    "support_mls_4x_commando": "MLS-4X Commando",
    "support_ms_11_missile_silo": "MS-11 Solo Silo",
    "support_plas_45_epoch": "PLAS-45 Epoch",
    "support_rs_422_railgun": "RS-422 Railgun",
    "support_spear": "S-11 Speargun",
    "support_tx_41_sterilizer": "TX-41 Sterilizer",
    "heavy_support_ac_8_autocannon": "AC-8 Autocannon",
    "heavy_support_b_flam_80_flamer": "B/FLAM-80 Cremator",
    "heavy_support_faf_14_spear": "FAF-14 Spear",
    "heavy_support_gl_28_belt_fed_grenade_launcher": "GL-28 Belt-Fed Grenade Launcher",
    "heavy_support_gr_8_recoilless_rifle": "GR-8 Recoilless Rifle",
    "heavy_support_m_1000_hmg": "M-1000 Maxigun",
    "heavy_support_sta_x3_wasp_launcher": "StA-X3 W.A.S.P. Launcher",
    "heavy_support_rl_77_airburst_rocket_launcher": "RL-77 Airburst Rocket Launcher",
    "vehicle_exo_45_patriot_exosuit": "EXO-45 Patriot Exosuit",
    "vehicle_exo_49_emancipator_exosuit": "EXO-49 Emancipator Exosuit",
    "vehicle_exo_51_lumberjack_exosuit": "EXO-51 Lumberer Exosuit",
    "vehicle_exo_55_breakthrough_exosuit": "EXO-55 Breakthrough Exosuit",
    "vehicle_m_102_gunner_fast_recon_vehicle": "M-102 Gunner FRV",
    "vehicle_m_103_supply_fast_recon_vehicle": "M-103 Supply FRV",
    "vehicle_td_220_bastion_mk_xvi": "TD-220 Bastion MK XVI",
    "deployable_gatling_sentry": "A/G-16 Gatling Sentry",
    "deployable_anti_tank_mines": "MD-17 Anti-Tank Mines",
    "deployable_at_emplacement": "E/AT-12 Anti-Tank Emplacement",
    "deployable_anti_personnel_mines": "MD-6 Anti-Personnel Minefield",
    "deployable_machine_gun_sentry": "A/MG-43 Machine Gun Sentry",
    "deployable_grenadier_defense_wall": "E/GL-21 Grenadier Battlement",
    "deployable_gas_mines": "MD-8 Gas Mines",
    "deployable_laser_sentry": "A/LAS-98 Laser Sentry",
    "deployable_flame_sentry": "A/FLAM-40 Flame Sentry",
    "deployable_rocket_sentry": "A/MLS-4X Rocket Sentry",
    "deployable_incendiary_mines": "MD-I4 Incendiary Mines",
    "deployable_tesla_tower": "A/ARC-3 Tesla Tower",
    "deployable_gas_mortar_sentry": "A/GM-17 Gas Mortar Sentry",
    "deployable_ems_mortar_sentry": "A/M-23 EMS Mortar Sentry",
    "deployable_autocannon_sentry": "A/AC-8 Autocannon Sentry",
    "deployable_mortar_sentry": "A/M-12 Mortar Sentry",
    "deployable_hmg_emplacement": "E/MG-101 HMG Emplacement",
    "deployable_shield_generator_relay": "FX-12 Shield Generator Relay",
    "backpack_ax_ar_23_guard_dog": "AX/AR-23 Guard Dog",
    "backpack_ax_arc_3_k_9": "AX/ARC-3 K-9",
    "backpack_ax_flam_75_hot_dog": "AX/FLAM-75 Hot Dog",
    "backpack_ax_las_5_guard_dog_rover": "AX/LAS-5 Rover",
    "backpack_ax_tx_13_purifier": "AX/TX-13 Dog Breath",
    "backpack_b_1_supply_pack": "B-1 Supply Pack",
    "backpack_b_100_portable_hellbomb": "B-100 Portable Hellbomb",
    "backpack_b_md_c4_pack": "B/MD C4 Pack",
    "backpack_lift_182_teleport_pack": "LIFT-182 Warp Pack",
    "backpack_lift_850_jump_pack": "LIFT-850 Jump Pack",
    "backpack_lift_860_hover_pack": "LIFT-860 Hover Pack",
    "backpack_sh_20_ballistic_shield_backpack": "SH-20 Ballistic Shield Backpack",
    "backpack_sh_32_shield_generator_pack": "SH-32 Shield Generator Pack",
    "backpack_sh_51_directional_shield": "SH-51 Directional Shield",
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

# 箭头方向映射
ARROW_DIR = {
    "Stratagem Arrow Up.svg": "↑",
    "Stratagem Arrow Down.svg": "↓",
    "Stratagem Arrow Left.svg": "←",
    "Stratagem Arrow Right.svg": "→",
}
ARROW_CODE = {"↑": "U", "↓": "D", "←": "L", "→": "R"}

def parse_stratagem(html):
    result = {}
    infobox_t = re.search(r'druid-container-([a-z]+)', html)
    result["__type"] = infobox_t.group(1) if infobox_t else "stratagem"
    # 解析所有 label/data
    pattern = re.compile(
        r'druid-label-(?:[^"\s]+)"[^>]*>([^<]*)</div>\s*'
        r'<div class="druid-data druid-data-[^"]*"[^>]*>(.*?)</div>\s*</div>', re.S)
    for m in pattern.finditer(html):
        label = strip_html(m.group(1))
        val = strip_html(m.group(2))
        key = label.lower().replace(" ", "_")
        result[key] = val
    # 单独解析战略配备代码（箭头由 <img alt> 编码）
    # 优先匹配 druid-row-stratagem（武器型页面），否则匹配 druid-data-stratagem
    code_html = None
    row_m = re.search(r'druid-row-stratagem[^>]*>(.*?)(?=<div class="druid-row|</div>\s*</div>\s*</div>)', html, re.S)
    if row_m:
        code_html = row_m.group(1)
    else:
        code_html = re.search(r'druid-data-stratagem[^>]*>(.*?)</div>\s*</div>', html, re.S)
        code_html = code_html.group(1) if code_html else None
    arrows = ""
    if code_html:
        for im in re.finditer(r'<img alt="([^"]+)"', code_html):
            d = ARROW_DIR.get(im.group(1))
            if d: arrows += d
    result["_code_arrows"] = arrows
    result["_code_keys"] = "".join(ARROW_CODE.get(a, "") for a in arrows)
    return result

def get_image(html, page):
    """提取页面主图/战略配备图标 URL"""
    m = re.search(r'(/images/[A-Za-z0-9_\-%.]+\.(?:svg|png))', html)
    return "https://helldivers.wiki.gg" + m.group(1) if m else None

def fetch_stratagem(page):
    try:
        d = fetch_api({"action": "parse", "page": page, "prop": "text", "format": "json"})
        if "parse" not in d:
            return {"error": "page not found", "_found": False}
        html = d["parse"]["text"]["*"]
        info = parse_stratagem(html)
        # 放宽判定：有任一战略配备/武器字段即视为找到
        if not (info.get("stratagem_code") or info.get("base_cooldown") or info.get("permit_type") or info.get("unlock_cost") or info.get("source") or info.get("unlock_level")):
            return {"error": "no stratagem infobox", "_found": False}
        return {
            "_found": True,
            "call_in_code": info.get("_code_arrows", ""),
            "call_in_keys": info.get("_code_keys", ""),
            "call_in_time": info.get("call_in_time", ""),
            "cooldown": info.get("base_cooldown", ""),
            "permit_type": info.get("permit_type", ""),
            "traits": info.get("traits", ""),
            "unlock_level": info.get("unlock_level", ""),
            "unlock_cost": info.get("unlock_cost", ""),
            "source": info.get("source", ""),
            "image": get_image(html, page),
            "source_page": "https://helldivers.wiki.gg/wiki/" + urllib.parse.quote(page.replace(" ", "_")),
        }
    except Exception as e:
        return {"error": str(e), "_found": False}

def main():
    base = os.path.dirname(os.path.abspath(__file__))
    strat_path = os.path.join(base, "HD2-Galatic_war-Map", "tables", "stratagems.json")
    if not os.path.exists(strat_path):
        strat_path = os.path.join(base, "tables", "stratagems.json")
    out_dir = os.path.join(base, "HD2_Wiki", "data", "wiki", "zh")
    out_path = os.path.join(out_dir, "stratagems_full.json")

    translations = json.load(open(strat_path, encoding="utf-8"))
    print(f"加载翻译库: {len(translations)} 个战略配备", flush=True)

    merged = []
    unmatched = []
    for i, trans in enumerate(translations):
        sid = trans["id"]
        title = ID_TO_TITLE.get(sid)
        if not title:
            unmatched.append({"id": sid, "reason": "no title mapping"})
            merged.append(trans)
            continue
        wiki = fetch_stratagem(title)
        time.sleep(0.3)
        if not wiki.get("_found"):
            unmatched.append({"id": sid, "reason": wiki.get("error", "not found"), "title": title})
            merged.append(trans)
            continue
        # 合并：保留翻译库字段 + 补充 Wiki 字段
        item = dict(trans)
        item.update({
            "code": {"display": wiki["call_in_code"], "arrows": wiki["call_in_keys"], "pc_keys": wikikeys(wiki["call_in_keys"])},
            "call_in_time": wiki["call_in_time"] or None,
            "cooldown": wiki["cooldown"] or None,
            "permit_type": wiki["permit_type"] or None,
            "traits": [t.strip() for t in re.split(r'[•,]', wiki["traits"]) if t.strip()] if wiki["traits"] else [],
            "unlock_level": wiki["unlock_level"] or None,
            "unlock_cost": wiki["unlock_cost"] or None,
            "source": wiki["source"] or None,
            "image": wiki["image"],
            "source_page": wiki["source_page"],
        })
        merged.append(item)
        if i % 10 == 0:
            print(f"  处理: {i}/{len(translations)}", flush=True)

    cats = {"primary": 0}
    result = {
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source": "Helldivers Wiki.gg + community translations",
        "total": len(merged),
        "matched": len(merged) - len(unmatched),
        "unmatched": unmatched,
        "stratagems": merged,
    }
    os.makedirs(out_dir, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"\n已输出: {out_path}", flush=True)
    print(f"总数: {len(merged)}，匹配: {len(merged)-len(unmatched)}，未匹配: {len(unmatched)}", flush=True)
    if unmatched:
        print("未匹配列表:", flush=True)
        for u in unmatched:
            print(f"  {u['id']}: {u.get('reason')}", flush=True)

def wikikeys(arrows):
    # ↑→→ -> W D D 等 PC 按键
    m = {"U": "W", "D": "S", "L": "A", "R": "D"}
    return " ".join(m.get(a, a) for a in arrows)

if __name__ == "__main__":
    main()