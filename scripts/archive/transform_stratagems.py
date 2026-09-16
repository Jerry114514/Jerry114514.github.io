# -*- coding: utf-8 -*-
"""重构 stratagems_full.json 为维基展示结构 + 图标尝试下载(失败保留URL) + 生成报告"""
import json, urllib.request, urllib.parse, io, sys, re, time, os
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

BASE = r"E:\GitLoadWareHouse\Jerry114514.github.io"
IN_PATH = os.path.join(BASE, "HD2_Wiki", "data", "wiki", "zh", "stratagems_full.json")
OUT_DIR = os.path.join(BASE, "HD2_Wiki", "data", "wiki", "zh")
ASSET_DIR = os.path.join(BASE, "HD2_Wiki", "assets", "stratagems")
API = "https://helldivers.wiki.gg/api.php"
HEADERS = {"User-Agent": "Mozilla/5.0 HD2-Wiki/1.0 (icon fetcher)"}

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

CATEGORY_CODE = {
    "轨道": ("orbital", "轨道"), "飞鹰": ("eagle", "飞鹰"),
    "支援武器": ("support", "支援武器"), "重型支援武器": ("support", "支援武器"),
    "背包": ("backpack", "背包"), "可部署物": ("deployable", "可部署物"),
    "载具": ("vehicle", "载具"),
}

def download_img(url, dest):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        data = urllib.request.urlopen(req, timeout=12).read()
        with open(dest, "wb") as f:
            f.write(data)
        return True
    except Exception:
        return False

def main():
    d = json.load(open(IN_PATH, encoding="utf-8"))
    old_items = d["stratagems"]
    try:
        os.makedirs(ASSET_DIR, exist_ok=True)
    except Exception:
        pass

    new_items = []
    report = {"total": len(old_items), "matched": 0, "icon_downloaded": 0, "icon_failed": [], "unmatched": [], "note": "图标下载受Wiki热链保护(403)，失败时保留外部URL"}

    for i, item in enumerate(old_items):
        sid = item["id"]
        title = ID_TO_TITLE.get(sid)
        type_ch = item.get("type", "")
        cat_code, cat_label = CATEGORY_CODE.get(type_ch, ("ship", type_ch))
        code = (item.get("code") or {}).get("arrows") or ""
        img_url = item.get("image")
        icon_path = None
        if img_url:
            ext = os.path.splitext(urllib.parse.urlparse(img_url).path)[1] or ".png"
            dest = os.path.join(ASSET_DIR, sid + ext)
            if download_img(img_url, dest):
                icon_path = "/assets/stratagems/" + sid + ext
                report["icon_downloaded"] += 1
            else:
                report["icon_failed"].append(sid)
            time.sleep(0.2)
        new_item = {
            "id": sid,
            "name": item["name"],
            "name_en": title or sid,
            "category": cat_code,
            "category_label": cat_label,
            "code": code,
            "call_in_time": item.get("call_in_time"),
            "cooldown": item.get("cooldown") or "无限",
            "uses": "无限",
            "unlock": item.get("unlock_cost") or item.get("source") or "初始解锁",
            "image": icon_path or img_url,
            "description": item.get("description") or "",
            "source_page": item.get("source_page"),
        }
        new_items.append(new_item)
        report["matched"] += 1
        if i % 10 == 0:
            print(f"  处理: {i}/{len(old_items)}", flush=True)

    report["unmatched"] = [s["id"] for s in old_items if not ID_TO_TITLE.get(s["id"])]

    result = {
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source": "Helldivers Wiki.gg + community translations",
        "total": len(new_items),
        "stratagems": new_items,
    }
    with open(os.path.join(OUT_DIR, "stratagems_full.json"), "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
        f.write("\n")
    with open(os.path.join(OUT_DIR, "stratagems_fetch_report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"重构完成: {len(new_items)} 个", flush=True)
    print(f"图标本地下载: {report['icon_downloaded']}/{len(old_items)}", flush=True)
    print(f"图标失败(保留URL): {len(report['icon_failed'])}", flush=True)
    print(f"报告: {os.path.join(OUT_DIR, 'stratagems_fetch_report.json')}", flush=True)

if __name__ == "__main__":
    main()