# -*- coding: utf-8 -*-
"""弹道模拟器武器目录同步（HD2_Ballistics/data/equipment_catalog.json）

数据源：上游主仓库 Darctor/Helldivers2_RawData（不要用 Jerry114514 fork——已停更）。
流程：解析 main HEAD SHA → 按 SHA 下载 5 个数据文件（临时目录，不入 Git）→ 结构校验
→ 与 HD2_Wiki 装备数据关联 → 生成精简目录 + manifest → 写盘。

安全纪律：
  - 解析失败 / 结构变化 / 校验不过：exit 1，保留已有目录（绝不空文件覆盖）；
  - 新目录 ready 数低于旧目录 50% 视为异常，同样保留旧目录；
  - 关联失败一律 unresolved（列候选与原因），绝不按顺序猜测。

用法：
  python scripts/sync_ballistics_catalog.py            # 正式同步（Actions / 本地）
  python scripts/sync_ballistics_catalog.py --dry-run  # 只统计不写盘
  python scripts/sync_ballistics_catalog.py --rawdata-dir DIR
                                                       # 用本地已下载的上游文件（离线/测试），
                                                       # 仍会解析 HEAD SHA 记录版本
"""
import argparse
import csv
import hashlib
import io
import json
import os
import re
import sys
import tempfile
import time
import urllib.request

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(BASE_DIR, "HD2_Ballistics", "data")
CATALOG_FILE = os.path.join(OUT_DIR, "equipment_catalog.json")
MANIFEST_FILE = os.path.join(OUT_DIR, "rawdata_manifest.json")
ALIAS_FILE = os.path.join(OUT_DIR, "equipment_aliases.json")
GAME_TEXT_FILE = os.path.join(OUT_DIR, "game_text_names.json")
WIKI_WEAPONS = os.path.join(BASE_DIR, "HD2_Wiki", "data", "wiki", "zh", "weapons.json")
WIKI_STRATAGEMS = os.path.join(BASE_DIR, "HD2_Wiki", "data", "wiki", "zh", "stratagems_full.json")

UPSTREAM_REPO = "Darctor/Helldivers2_RawData"
UPSTREAM_FILES = [
    "Data/settings/generated_projectile_settings.json",
    "Data/settings/generated_damage_settings.json",
    "Data/entities/ProjectileWeaponComponentData.json",
    "Data/settings/EntityComponentMap.json",
    "Data/Hash.csv",
]
# 精简目录只保留目录所需字段；70MB 的 entities 原始数据不进站点仓库。
SCHEMA_VERSION = 1
MAX_TOTAL_STEPS_SAFE = 1_000_000  # 上游异常保护：items 数超过即判结构异常

EXCLUDED_CATEGORIES = {"throwables", "orbital", "eagle", "vehicle", "deployable", "backpack", "mission", "civilian"}


def log(msg):
    print(f"[ballistics-catalog] {msg}", flush=True)


def http_get(url, token="", timeout=60):
    headers = {"User-Agent": "Jerry114514.github.io/ballistics-catalog-sync",
               "Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


# ---------------- 名称归一化 ----------------

def norm_name(name):
    """去 (Model)/(Hellpod) 后缀 + 空白归一 + 小写"""
    s = (name or "").strip().casefold()
    s = re.sub(r"\s*\((?:model|hellpod)\)\s*$", "", s, flags=re.I)
    return re.sub(r"\s+", " ", s).strip()


def norm_punct(name):
    """进一步做标点归一（P/40-K vs P-40-K），仅在精确归一未命中时使用"""
    return re.sub(r"[^a-z0-9]+", "", norm_name(name))


# ---------------- Wiki 攻击单位解析 ----------------

def parse_mass(text):
    """'4.5 g' -> 4.5（g）；'3.3 kg' -> 3300；返回克"""
    m = re.match(r"^\s*([\d.]+)\s*(g|kg)\b", (text or "").strip(), re.I)
    if not m:
        return None
    value = float(m.group(1))
    return value * 1000.0 if m.group(2).lower() == "kg" else value


def parse_speed(text):
    """'900 m/s' -> 900.0"""
    m = re.match(r"^\s*([\d.]+)\s*m/s", (text or "").strip(), re.I)
    return float(m.group(1)) if m else None


def parse_number(text):
    """'90 Ballistic' -> 90.0；'30%' -> 30.0"""
    m = re.match(r"^\s*([\d.]+)", (text or "").strip())
    return float(m.group(1)) if m else None


def parse_pellets(text):
    """'x 11' -> 11"""
    m = re.match(r"^\s*[x×]\s*([\d.]+)", (text or "").strip(), re.I)
    return int(float(m.group(1))) if m else None


# ---------------- 上游抓取与校验 ----------------

def resolve_head_sha(token):
    data = json.loads(http_get(f"https://api.github.com/repos/{UPSTREAM_REPO}/branches/main", token).decode("utf-8"))
    sha = (data.get("commit") or {}).get("sha")
    if not re.fullmatch(r"[0-9a-f]{40}", sha or ""):
        raise RuntimeError(f"上游 main HEAD SHA 解析失败: {sha!r}")
    return sha


def download_upstream(sha, cache_dir, token):
    """按 SHA 下载 5 个文件；返回 {文件名: 本地路径}"""
    os.makedirs(cache_dir, exist_ok=True)
    paths = {}
    for rel in UPSTREAM_FILES:
        base = os.path.basename(rel)
        local = os.path.join(cache_dir, f"{sha[:12]}_{base}")
        if not (os.path.exists(local) and os.path.getsize(local) > 0):
            url = f"https://raw.githubusercontent.com/{UPSTREAM_REPO}/{sha}/{rel}"
            log(f"下载 {rel} ...")
            data = http_get(url, token, timeout=180)
            with open(local, "wb") as f:
                f.write(data)
        paths[rel] = local
    return paths


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_and_validate_upstream(paths):
    """结构校验 + 解析。任何异常抛 RuntimeError（调用方 exit 1 保留旧目录）。"""
    problems = []

    def require(condition, message):
        if not condition:
            problems.append(message)

    def load_json(path):
        try:
            with open(path, encoding="utf-8") as f:
                return json.load(f)
        except Exception as error:
            raise RuntimeError(f"{os.path.basename(path)} 解析失败: {error}") from error

    proj_doc = load_json(paths["Data/settings/generated_projectile_settings.json"])
    proj_root = proj_doc[0]["ProjectileSettings"]
    proj_meta = proj_root.get("_metadata") or {}
    proj_items = proj_root.get("items") or []
    require(proj_meta.get("game_version"), "generated_projectile_settings 缺少 _metadata.game_version")
    require(proj_meta.get("patch_date"), "generated_projectile_settings 缺少 _metadata.patch_date")
    require(proj_meta.get("exported_type_count") == len(proj_items),
            f"generated_projectile_settings exported_type_count({proj_meta.get('exported_type_count')}) "
            f"!= items({len(proj_items)})")
    require(len(proj_items) < MAX_TOTAL_STEPS_SAFE, "generated_projectile_settings items 数异常")

    dmg_doc = load_json(paths["Data/settings/generated_damage_settings.json"])
    dmg_root = next((root[key] for root in dmg_doc for key in root if key == "DamageSettings"), None)
    require(dmg_root is not None, "generated_damage_settings 缺少 DamageSettings 根")
    dmg_meta = dmg_root.get("_metadata") or {}
    dmg_items = dmg_root.get("items") or []
    require(dmg_meta.get("game_version") == proj_meta.get("game_version"),
            "damage 与 projectile 的 game_version 不一致")
    require(dmg_meta.get("exported_type_count") == len(dmg_items),
            f"generated_damage_settings exported_type_count({dmg_meta.get('exported_type_count')}) "
            f"!= items({len(dmg_items)})")

    pwc_doc = load_json(paths["Data/entities/ProjectileWeaponComponentData.json"])
    pwc_meta = pwc_doc.get("_metadata") or {}
    pwc_entities = pwc_doc.get("entities") or []
    require(pwc_meta.get("game_version") == proj_meta.get("game_version"),
            "ProjectileWeaponComponentData 的 game_version 不一致")
    require(pwc_meta.get("exported_entity_count") == len(pwc_entities),
            f"ProjectileWeaponComponentData exported_entity_count({pwc_meta.get('exported_entity_count')}) "
            f"!= entities({len(pwc_entities)})")

    ecm_doc = load_json(paths["Data/settings/EntityComponentMap.json"])
    ecm_root = next((root["EntityComponentMap"] for root in ecm_doc
                     if isinstance(root, dict) and "EntityComponentMap" in root), None)
    require(ecm_root is not None, "EntityComponentMap 缺少 EntityComponentMap 根")
    require((ecm_root.get("_metadata") or {}).get("game_version") == proj_meta.get("game_version"),
            "EntityComponentMap 的 game_version 不一致")

    with open(paths["Data/Hash.csv"], encoding="utf-8-sig", newline="") as f:
        hash_rows = list(csv.reader(f))
    require(hash_rows and hash_rows[0][:3] == ["row_type", "category", "hash"],
            f"Hash.csv 表头不符合预期: {hash_rows[0][:5] if hash_rows else '空文件'}")

    if problems:
        raise RuntimeError("上游数据结构校验失败: " + "; ".join(problems))

    return {
        "game_version": proj_meta.get("game_version"),
        "patch_date": proj_meta.get("patch_date"),
        "projectiles": {int(str(it["type"]).split(" ")[0]): it for it in proj_items if it.get("type")},
        "damages": {int(str(it["type"]).split(" ")[0]): it for it in dmg_items if it.get("type")},
        "weapon_components": pwc_entities,
        "component_meta": pwc_meta,
        "ecm_entities": (ecm_root.get("entities") or []),
        "hash_csv_rows": hash_rows,
    }


# ---------------- 装备 ↔ 射弹关联 ----------------

def index_components(weapon_components):
    by_name, by_norm, by_punct = {}, {}, {}
    for entity in weapon_components:
        for _hex_key, rec in entity.items():
            name = rec.get("name") or ""
            if name:
                by_name.setdefault(name, rec)
                by_norm.setdefault(norm_name(name), rec)
                by_punct.setdefault(norm_punct(name), rec)
    return by_name, by_norm, by_punct


def find_component(wiki_name_en, by_norm, by_punct):
    """装备英文名 -> PWC 组件：精确归一优先，再标点归一。绝不按顺序猜。"""
    rec = by_norm.get(norm_name(wiki_name_en))
    if rec is not None:
        return rec, "name"
    rec = by_punct.get(norm_punct(wiki_name_en))
    if rec is not None:
        return rec, "name_punct"
    return None, None


def match_projectile_for_attack(attack, component, projectiles, damages):
    """单个 projectile 攻击 -> (projectile_type 或 None, info dict)

    确定性规则：
      1. 组件 projectile_type 非零且数值/伤害核验通过 → 直接采用；
      2. 否则全表搜索：damage_info_type 的 damage 数组 == Wiki 伤害，且 speed/mass
         与 Wiki 数值一致（容差 0.5 m/s / 0.01 g）；唯一命中 → 采用；
         多命中/零命中 → None（候选写进 info，不猜）。
    """
    proj = attack.get("projectile") or {}
    damage = attack.get("damage") or {}
    wiki_speed = parse_speed(proj.get("initial_velocity"))
    wiki_mass = parse_mass(proj.get("mass"))
    wiki_std = parse_number(damage.get("damage_standard"))
    wiki_dur = parse_number(damage.get("damage_durable"))
    want_damage = [wiki_std, wiki_dur]

    def check(item):
        info_type = int(str(item.get("damage_info_type") or "0").split(" ")[0])
        if wiki_std is not None and damages.get(info_type, {}).get("damage") != want_damage:
            return False
        speed = float(item.get("speed") or 0)
        mass = float(item.get("mass") or 0)
        if wiki_speed is not None and abs(speed - wiki_speed) > 0.5:
            return False
        if wiki_mass is not None and abs(mass - wiki_mass) > 0.01:
            return False
        return True

    component_type = int(str((component or {}).get("projectile_type") or "0").split(" ")[0])
    info = {"component_projectile_type": component_type or None,
            "wiki": {"mass_g": wiki_mass, "speed_mps": wiki_speed,
                     "damage_standard": wiki_std, "damage_durable": wiki_dur}}
    if component_type and component_type in projectiles and check(projectiles[component_type]):
        info["match"] = "component"
        return component_type, info

    candidates = sorted(n for n, item in projectiles.items() if check(item))
    info["candidates"] = candidates
    if len(candidates) == 1:
        info["match"] = "deterministic_search"
        return candidates[0], info
    if len(candidates) > 1:
        info["reason"] = f"数值与伤害匹配到 {len(candidates)} 个候选射弹，无法唯一确认"
    else:
        comp_item = projectiles.get(component_type)
        if component_type and comp_item is not None:
            info["reason"] = (
                f"组件 projectile_type={component_type} 的数值/伤害与 Wiki 攻击数值不一致"
                f"（RawData damage={damages.get(int(str(comp_item.get('damage_info_type') or '0').split(' ')[0]), {}).get('damage')}）")
        else:
            info["reason"] = "没有找到与 Wiki 数值+伤害同时匹配的射弹"
    return None, info


def apply_aliases(equipment_id, attack_name, aliases):
    """人工审核别名表：键 'equipment_id::attack_name' -> {projectile_type, note}"""
    entry = (aliases.get("aliases") or {}).get(f"{equipment_id}::{attack_name}")
    if entry and entry.get("projectile_type"):
        return int(entry["projectile_type"]), entry.get("note") or "manual alias"
    return None, None


# ---------------- 目录生成 ----------------

def build_catalog(wiki_weapons, wiki_stratagems, upstream, game_text_names, aliases):
    """纯函数：输入已解析的 wiki/rawdata/别名数据 -> catalog dict（不碰文件系统/网络）"""
    by_name, by_norm, by_punct = index_components(upstream["weapon_components"])
    projectiles, damages = upstream["projectiles"], upstream["damages"]

    game_text = {}
    for row in (game_text_names or {}).get("names") or []:
        for used_by in row.get("used_by") or []:
            game_text.setdefault(norm_name(used_by), row["zh"])
            game_text.setdefault(norm_punct(used_by), row["zh"])

    catalog = {
        "schema_version": SCHEMA_VERSION,
        "upstream": {
            "repo": UPSTREAM_REPO,
            "commit": upstream["commit"],
            "game_version": upstream["game_version"],
            "patch_date": upstream["patch_date"],
            "fetched_at": upstream["fetched_at"],
            "files": upstream["files_sha256"],
        },
        "wiki": {"weapons_updated_at": (wiki_weapons.get("updated_at") or ""),
                 "stratagems_updated_at": (wiki_stratems_updated_at(wiki_stratagems))},
        "categories": {"primary": [], "secondary": [], "support": []},
        "unresolved": [],
    }

    stats = {"ready": 0, "unsupported": 0, "unresolved": 0}
    sources = [("primary", wiki_weapons.get("weapons") or []),
               ("secondary", wiki_weapons.get("weapons") or []),
               ("support", wiki_stratagems.get("stratagems") or [])]

    for category, rows in sources:
        for equipment in rows:
            if equipment.get("category") != category or equipment.get("category") in EXCLUDED_CATEGORIES:
                continue
            attacks_all = (equipment.get("detailed_stats") or {}).get("attacks") or []
            entry = {
                "id": equipment.get("id"),
                "name": equipment.get("name"),
                "name_en": equipment.get("name_en"),
                "category": category,
                "attacks": [],
            }
            component, match_how = find_component(equipment.get("name_en"), by_norm, by_punct)
            if component is None:
                entry["reason"] = "未能在 RawData ProjectileWeaponComponentData 中找到该装备（名称归一化未命中）"
            else:
                entry["rawdata_name"] = component.get("name")
                # RawData 缺 name_zh 时用游戏文本表补充（标记来源）
                if not (component.get("name_zh") or "").strip():
                    zh = game_text.get(norm_name(equipment.get("name_en"))) \
                        or game_text.get(norm_punct(equipment.get("name_en")))
                    if zh:
                        entry["name_zh_game"] = zh
                if match_how == "name_punct":
                    entry["name_match"] = "punct_normalized"
            if not attacks_all:
                entry["status"] = "unsupported"
                entry["reason"] = "Wiki 无攻击数据"
                entry["attacks"] = []
                stats["unsupported"] += 1
            else:
                has_runnable = False
                for attack in attacks_all:
                    attack_type = attack.get("type") or "unknown"
                    attack_name = attack.get("name") or ""
                    attack_id = f"{equipment.get('id')}:{re.sub(r'[^a-z0-9]+', '-', (attack_name or 'attack').casefold()).strip('-')}"
                    if attack_type != "projectile":
                        entry["attacks"].append({
                            "id": attack_id, "name": attack_name, "kind": attack_type,
                            "status": "unsupported",
                            "reason": f"当前弹道模型不支持 {attack_type} 类攻击",
                        })
                        stats["unsupported"] += 1
                        continue
                    has_runnable = True
                    projectile_type, info = match_projectile_for_attack(attack, component, projectiles, damages)
                    alias_type, alias_note = apply_aliases(equipment.get("id"), attack_name, aliases)
                    if alias_type and (projectile_type is None or info.get("match") != "component"):
                        projectile_type = alias_type
                        info["match"] = "manual_alias"
                        info["reason"] = alias_note
                    if projectile_type is None:
                        stats["unresolved"] += 1
                        entry["attacks"].append({
                            "id": attack_id, "name": attack_name, "kind": "projectile",
                            "status": "unresolved",
                            "reason": info.get("reason") or "无法唯一确认射弹",
                            "candidates": info.get("candidates") or [],
                            "component_projectile_type": info.get("component_projectile_type"),
                            "wiki": info.get("wiki"),
                        })
                        catalog["unresolved"].append({
                            "equipment_id": equipment.get("id"),
                            "equipment_name": equipment.get("name"),
                            "attack_name": attack_name,
                            "reason": info.get("reason") or "无法唯一确认射弹",
                            "candidates": info.get("candidates") or [],
                        })
                        continue
                    stats["ready"] += 1
                    item = projectiles[projectile_type]
                    info_type = int(str(item.get("damage_info_type") or "0").split(" ")[0])
                    damage_record = damages.get(info_type) or {}
                    damage_values = damage_record.get("damage") or [None, None]
                    flags = item.get("projectile_flags_1_detail") or {}
                    wiki_check = info.get("wiki") or {}
                    mismatch = []
                    wiki_speed = wiki_check.get("speed_mps")
                    wiki_mass = wiki_check.get("mass_g")
                    if wiki_speed is not None and abs(float(item.get("speed") or 0) - wiki_speed) > 0.5:
                        mismatch.append("speed")
                    if wiki_mass is not None and abs(float(item.get("mass") or 0) - wiki_mass) > 0.01:
                        mismatch.append("mass")
                    if wiki_check.get("damage_standard") is not None and damage_values[0] != wiki_check["damage_standard"]:
                        mismatch.append("damage_standard")
                    if wiki_check.get("damage_durable") is not None and damage_values[1] != wiki_check["damage_durable"]:
                        mismatch.append("damage_durable")
                    entry["attacks"].append({
                        "id": attack_id, "name": attack_name, "kind": "projectile",
                        "status": "ready",
                        "projectile_type": projectile_type,
                        "params": {
                            "calibreMm": item.get("calibre"),
                            "massG": item.get("mass"),
                            "vConfig": item.get("speed"),
                            "dragCoeff": item.get("drag"),
                            "gravityMultiplier": item.get("gravity_multiplier"),
                            "lifeTime": item.get("life_time"),
                            "ignoreTerminalVelocity": bool(flags.get("ignore_terminal_velocity")),
                            "inheritVelocity": bool(flags.get("inherit_velocity")),
                            "numProjectiles": item.get("num_projectiles"),
                        },
                        "damage": {
                            "normal": damage_values[0],
                            "durable": damage_values[1],
                            "damage_info_type": info_type,
                            "source": "rawdata",
                        },
                        "wiki_check": {"mass_g": wiki_mass, "speed_mps": wiki_speed,
                                   "damage_standard": wiki_check.get("damage_standard"),
                                   "damage_durable": wiki_check.get("damage_durable"),
                                   "mismatches": mismatch},
                        "sources": ["wiki", "rawdata"],
                    })
                ready_count = sum(1 for a in entry["attacks"] if a.get("status") == "ready")
                unresolved_count = sum(1 for a in entry["attacks"] if a.get("status") == "unresolved")
                if ready_count:
                    entry["status"] = "ready"
                elif unresolved_count:
                    entry["status"] = "unresolved"
                    entry["reason"] = "存在无法唯一确认的射弹攻击（详见 attacks 与 unresolved 清单）"
                else:
                    entry["status"] = "unsupported"
                    entry["reason"] = entry.get("reason") or "该装备没有射弹类攻击（火焰/光束/电弧/爆炸/近战等），当前弹道模型不支持"
            catalog["categories"][category].append(entry)

    catalog["stats"] = dict(stats)
    return catalog


def wiki_stratems_updated_at(wiki_stratagems):
    return wiki_stratagems.get("updated_at") or ""


# ---------------- 主流程 ----------------

def read_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def main(argv=None):
    parser = argparse.ArgumentParser(description="同步弹道模拟器武器目录")
    parser.add_argument("--dry-run", action="store_true", help="只统计不写盘")
    parser.add_argument("--force", action="store_true", help="上游 commit 未变化也强制重新生成")
    parser.add_argument("--rawdata-dir", default="", help="本地已下载的上游文件目录（离线/测试）")
    parser.add_argument("--cache-dir", default="", help="上游下载缓存目录（默认临时目录）")
    args = parser.parse_args(argv)

    token = os.environ.get("GITHUB_TOKEN", "") or os.environ.get("GH_TOKEN", "")

    sha = resolve_head_sha(token)
    log(f"上游 {UPSTREAM_REPO} main HEAD = {sha}")

    manifest = read_json(MANIFEST_FILE) if os.path.exists(MANIFEST_FILE) else {}
    if (manifest.get("upstream") or {}).get("commit") == sha and not args.force and not args.dry_run:
        log(f"上游 commit 未变化（{sha[:12]}），目录已是最新，无事可做")
        return

    cache_dir = args.cache_dir or tempfile.mkdtemp(prefix="rawdata_")
    if args.rawdata_dir:
        paths = {rel: os.path.join(args.rawdata_dir, os.path.basename(rel)) for rel in UPSTREAM_FILES}
        missing = [rel for rel, path in paths.items() if not os.path.exists(path)]
        if missing:
            raise RuntimeError(f"--rawdata-dir 缺少文件: {missing}")
        log(f"使用本地上游文件目录: {args.rawdata_dir}")
    else:
        paths = download_upstream(sha, cache_dir, token)

    upstream = load_and_validate_upstream(paths)
    upstream["commit"] = sha
    upstream["fetched_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    upstream["files_sha256"] = {os.path.basename(rel): sha256_of(path) for rel, path in paths.items()}
    log(f"上游校验通过: game_version={upstream['game_version']} patch_date={upstream['patch_date']} "
        f"projectiles={len(upstream['projectiles'])} damages={len(upstream['damages'])} "
        f"components={len(upstream['weapon_components'])}")

    wiki_weapons = read_json(WIKI_WEAPONS)
    wiki_stratagems = read_json(WIKI_STRATAGEMS)
    game_text_names = read_json(GAME_TEXT_FILE) if os.path.exists(GAME_TEXT_FILE) else {}
    aliases = read_json(ALIAS_FILE) if os.path.exists(ALIAS_FILE) else {}

    catalog = build_catalog(wiki_weapons, wiki_stratagems, upstream, game_text_names, aliases)
    stats = catalog["stats"]
    log(f"目录统计: ready={stats['ready']} unsupported={stats['unsupported']} unresolved={stats['unresolved']}")

    old_catalog = read_json(CATALOG_FILE) if os.path.exists(CATALOG_FILE) else {}
    old_ready = ((old_catalog.get("stats") or {}).get("ready") or 0)
    if old_ready and stats["ready"] < old_ready * 0.5:
        raise RuntimeError(f"新目录 ready({stats['ready']}) 低于旧目录({old_ready})的 50%，"
                           f"疑似上游结构变化，保留旧目录并退出")
    if len(catalog["categories"]["primary"]) + len(catalog["categories"]["secondary"]) + \
            len(catalog["categories"]["support"]) == 0:
        raise RuntimeError("生成的目录没有任何装备，疑似 Wiki 数据异常，保留旧目录并退出")

    if args.dry_run:
        for category, rows in catalog["categories"].items():
            ready = sum(1 for e in rows for a in e.get("attacks", []) if a.get("status") == "ready")
            print(f"  {category}: entries={len(rows)} ready_attacks={ready}")
        if catalog["unresolved"]:
            print("  unresolved:")
            for row in catalog["unresolved"]:
                print(f"    - {row['equipment_id']} :: {row['attack_name']} — {row['reason']}"
                      + (f"（候选 {row['candidates']}）" if row.get("candidates") else ""))
        print("[dry-run] 不写盘")
        return

    os.makedirs(OUT_DIR, exist_ok=True)
    manifest = {
        "schema_version": SCHEMA_VERSION,
        "upstream": {"repo": UPSTREAM_REPO, "commit": sha,
                     "game_version": upstream["game_version"], "patch_date": upstream["patch_date"],
                     "fetched_at": upstream["fetched_at"]},
        "files": {"url_template": f"https://raw.githubusercontent.com/{UPSTREAM_REPO}/{{sha}}/{{path}}",
                  "sha256": upstream["files_sha256"],
                  "paths": UPSTREAM_FILES},
        "catalog_stats": stats,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    for path, data in ((CATALOG_FILE, catalog), (MANIFEST_FILE, manifest)):
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
            f.write("\n")
        os.replace(tmp, path)
        log(f"已写入 {path}")
    log(f"目录同步完成: ready={stats['ready']} unsupported={stats['unsupported']} unresolved={stats['unresolved']}")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        log(f"!! 同步失败，保留已有目录: {type(error).__name__}: {error}")
        sys.exit(1)
