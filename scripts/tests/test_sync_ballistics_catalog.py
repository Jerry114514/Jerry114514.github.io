# -*- coding: utf-8 -*-
"""sync_ballistics_catalog 离线单测：单位解析 / 名称归一化 / 关联 / 失败保护"""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import sync_ballistics_catalog as sync


def mini_upstream():
    """最小上游数据：projectile 276（AR-23）、183/191（SG-20 双模式）、组件 3 条"""
    projectiles = [
        {"type": "276 <=> ProjectileType_Unknown_276", "calibre": 5.5, "mass": 4.5, "speed": 900.0,
         "drag": 0.3, "gravity_multiplier": 1.0, "life_time": 0.0, "num_projectiles": 1,
         "damage_info_type": "108 <=> DamageInfoType_Unknown_108",
         "projectile_flags_1_detail": {"inherit_velocity": 1, "ignore_terminal_velocity": 0}},
        {"type": "183 <=> ProjectileType_Unknown_183", "calibre": 10, "mass": 6.0, "speed": 385.0,
         "drag": 0.3, "gravity_multiplier": 1.0, "life_time": 0.0, "num_projectiles": 11,
         "damage_info_type": "166 <=> DamageInfoType_Unknown_166",
         "projectile_flags_1_detail": {"inherit_velocity": 1, "ignore_terminal_velocity": 0}},
        {"type": "191 <=> ProjectileType_Unknown_191", "calibre": 10, "mass": 4.5, "speed": 800.0,
         "drag": 0.3, "gravity_multiplier": 1.0, "life_time": 0.0, "num_projectiles": 20,
         "damage_info_type": "175 <=> DamageInfoType_Unknown_175",
         "projectile_flags_1_detail": {"inherit_velocity": 1, "ignore_terminal_velocity": 0}},
        {"type": "202 <=> ProjectileType_Unknown_202", "calibre": 9, "mass": 7.2, "speed": 375.0,
         "drag": 0.3, "gravity_multiplier": 1.0, "life_time": 0.0, "num_projectiles": 1,
         "damage_info_type": "61 <=> DamageInfoType_Unknown_61",
         "projectile_flags_1_detail": {"inherit_velocity": 1, "ignore_terminal_velocity": 0}},
    ]
    damages = [
        {"type": "108 <=> DamageInfoType_Unknown_108", "damage": [90, 22]},
        {"type": "166 <=> DamageInfoType_Unknown_166", "damage": [35, 10]},
        {"type": "175 <=> DamageInfoType_Unknown_175", "damage": [6, 2]},
        {"type": "61 <=> DamageInfoType_Unknown_61", "damage": [61, 12]},
    ]
    components = [
        {"0xAA1": {"hash": "1", "name": "AR-23 Liberator (Model)", "name_zh": "AR-23 解放者（主武器，模型）",
                   "projectile_type": "276 <=> ProjectileType_Unknown_276"}},
        {"0xAA2": {"hash": "2", "name": "SG-20 Halt (Model)", "name_zh": "SG-20 止息（主武器，模型）",
                   "projectile_type": "0 <=> ProjectileType_Unknown_0"}},
        {"0xAA3": {"hash": "3", "name": "P-40-K Bolt Pistol (Model)", "name_zh": "P/40K 爆弹手枪（副武器，模型）",
                   "projectile_type": "202 <=> ProjectileType_Unknown_202"}},
    ]
    return {
        "game_version": "1.007.100", "patch_date": "2026-09-22",
        "projectiles": {int(str(it["type"]).split(" ")[0]): it for it in projectiles},
        "damages": {int(str(it["type"]).split(" ")[0]): it for it in damages},
        "weapon_components": components,
        "component_meta": {},
        "ecm_entities": [], "hash_csv_rows": [["row_type", "category", "hash"]],
    }


def mini_wiki():
    weapons = {"updated_at": "2026-09-23T00:00:00Z", "weapons": [
        {"id": "ar_23_liberator", "name": "AR-23 解放者", "name_en": "AR-23 Liberator",
         "category": "primary", "detailed_stats": {"attacks": [
             {"name": "5.5x50mm FULL METAL JACKET P", "type": "projectile",
              "projectile": {"mass": "4.5 g", "initial_velocity": "900 m/s"},
              "damage": {"damage_standard": "90 Ballistic", "damage_durable": "22 Ballistic"}}]}},
        {"id": "sg_20_halt", "name": "SG-20 止息", "name_en": "SG-20 Halt",
         "category": "primary", "detailed_stats": {"attacks": [
             {"name": "10g FLECHETTES P", "type": "projectile",
              "projectile": {"pellets": "x 11", "mass": "6 g", "initial_velocity": "385 m/s"},
              "damage": {"damage_standard": "35 Ballistic", "damage_durable": "10 Ballistic"}},
             {"name": "10g STUN ROUNDS P", "type": "projectile",
              "projectile": {"pellets": "x 20", "mass": "4.5 g", "initial_velocity": "800 m/s"},
              "damage": {"damage_standard": "6 Ballistic", "damage_durable": "2 Ballistic"}}]}},
        {"id": "p_40k_bolt_pistol", "name": "P/40-K 爆弹手枪", "name_en": "P/40-K Bolt Pistol",
         "category": "secondary", "detailed_stats": {"attacks": [
             {"name": "9x20mm BOLT P", "type": "projectile",
              "projectile": {"mass": "7.2 g", "initial_velocity": "375 m/s"},
              "damage": {"damage_standard": "61 Ballistic", "damage_durable": "12 Ballistic"}}]}},
        {"id": "flam_like_primary", "name": "喷射样品", "name_en": "Spray Sample",
         "category": "primary", "detailed_stats": {"attacks": [
             {"name": "SPRAY JET S", "type": "spray",
              "damage": {"damage_standard": "30 Heat", "damage_durable": "10 Heat"}}]}},
    ]}
    stratagems = {"updated_at": "2026-09-23T00:00:00Z", "stratagems": [
        {"id": "support_eat_700_incendiary", "name": "EAT-700 燃烧弹发射器", "name_en": "EAT-700 Incendiary",
         "category": "support", "detailed_stats": {"attacks": [
             {"name": "25mm FLAK ROUNDS P", "type": "projectile",
              "projectile": {"mass": "300 g", "initial_velocity": "15 m/s"},
              "damage": {"damage_standard": "999 Ballistic", "damage_durable": "999 Ballistic"}}]}},
    ]}
    return weapons, stratagems


def upstream_with_files():
    return dict(mini_upstream(), commit="a" * 40, fetched_at="2026-10-24T00:00:00Z",
                files_sha256={"generated_projectile_settings.json": "x"})


class UnitParseTests(unittest.TestCase):
    def test_mass_units(self):
        self.assertEqual(sync.parse_mass("4.5 g"), 4.5)
        self.assertEqual(sync.parse_mass("3.3 kg"), 3300.0)
        self.assertEqual(sync.parse_mass("300 g"), 300.0)
        self.assertIsNone(sync.parse_mass(""))

    def test_speed_and_damage(self):
        self.assertEqual(sync.parse_speed("900 m/s"), 900.0)
        self.assertEqual(sync.parse_number("90 Ballistic"), 90.0)
        self.assertEqual(sync.parse_number("30%"), 30.0)
        self.assertIsNone(sync.parse_number("N/A"))

    def test_pellets(self):
        self.assertEqual(sync.parse_pellets("x 11"), 11)
        self.assertEqual(sync.parse_pellets("x 20"), 20)
        self.assertIsNone(sync.parse_pellets("single"))


class NameMatchingTests(unittest.TestCase):
    def setUp(self):
        self.up = upstream_with_files()
        self.by_name, self.by_norm, self.by_punct = sync.index_components(self.up["weapon_components"])

    def test_model_suffix_stripped(self):
        rec, how = sync.find_component("AR-23 Liberator", self.by_norm, self.by_punct)
        self.assertIsNotNone(rec)
        self.assertEqual(how, "name")
        self.assertEqual(rec["projectile_type"], "276 <=> ProjectileType_Unknown_276")

    def test_p40k_slash_vs_dash(self):
        """基线缺口 P/40-K：标点归一化（/ vs -）后直接命中，无需顺序猜测"""
        rec, how = sync.find_component("P/40-K Bolt Pistol", self.by_norm, self.by_punct)
        self.assertIsNotNone(rec, "P/40-K 应通过标点归一化命中 P-40-K 组件")
        self.assertEqual(how, "name_punct")
        self.assertEqual(int(str(rec["projectile_type"]).split(" ")[0]), 202)

    def test_unknown_name_returns_none(self):
        rec, how = sync.find_component("Nonexistent Weapon", self.by_norm, self.by_punct)
        self.assertIsNone(rec)
        self.assertIsNone(how)


class BuildCatalogTests(unittest.TestCase):
    def setUp(self):
        weapons, stratagems = mini_wiki()
        self.catalog = sync.build_catalog(weapons, stratagems, upstream_with_files(), {}, {"aliases": {}})
        self.by_id = {}
        for key, rows in self.catalog["categories"].items():
            for entry in rows:
                self.by_id[entry["id"]] = (key, entry)

    def test_ar23_ready_with_exact_params(self):
        _, entry = self.by_id["ar_23_liberator"]
        attack = entry["attacks"][0]
        self.assertEqual(attack["status"], "ready")
        self.assertEqual(attack["projectile_type"], 276)
        self.assertEqual(attack["params"]["calibreMm"], 5.5)
        self.assertEqual(attack["params"]["massG"], 4.5)
        self.assertEqual(attack["params"]["vConfig"], 900.0)
        self.assertEqual(attack["params"]["dragCoeff"], 0.3)
        self.assertEqual(attack["params"]["gravityMultiplier"], 1.0)
        self.assertEqual(attack["params"]["inheritVelocity"], True)
        self.assertEqual(attack["damage"]["normal"], 90)
        self.assertEqual(attack["damage"]["durable"], 22)
        self.assertEqual(entry["status"], "ready")

    def test_multi_attack_variants_resolved_independently(self):
        """SG-20 组件 projectile_type=0：两个攻击各自经伤害+数值确定性匹配，不得复用同一 type"""
        _, entry = self.by_id["sg_20_halt"]
        self.assertEqual(len(entry["attacks"]), 2)
        types = {attack["projectile_type"] for attack in entry["attacks"]}
        self.assertEqual(types, {183, 191}, "两个攻击变体必须解析到不同射弹")
        pellets = {attack["projectile_type"]: attack["params"]["numProjectiles"]
                   for attack in entry["attacks"]}
        self.assertEqual(pellets, {183: 11, 191: 20})

    def test_p40k_resolved_via_punctuation(self):
        key, entry = self.by_id["p_40k_bolt_pistol"]
        self.assertEqual(key, "secondary")
        self.assertEqual(entry["status"], "ready")
        self.assertEqual(entry["attacks"][0]["projectile_type"], 202)

    def test_non_projectile_attack_marked_unsupported(self):
        _, entry = self.by_id["flam_like_primary"]
        attack = entry["attacks"][0]
        self.assertEqual(attack["status"], "unsupported")
        self.assertEqual(attack["kind"], "spray")
        self.assertIn("不支持", attack["reason"])
        self.assertEqual(entry["status"], "unsupported")

    def test_support_unresolved_not_guessed(self):
        """EAT-700 的 Wiki 数值+伤害在 RawData 无命中：必须 unresolved 并附原因，不得猜"""
        _, entry = self.by_id["support_eat_700_incendiary"]
        attack = entry["attacks"][0]
        self.assertEqual(attack["status"], "unresolved")
        self.assertNotIn("projectile_type", attack)
        self.assertIn("reason", attack)
        rows = [row for row in self.catalog["unresolved"]
                if row["equipment_id"] == "support_eat_700_incendiary"]
        self.assertEqual(len(rows), 1)
        self.assertIn("没有找到", rows[0]["reason"])
        self.assertEqual(rows[0]["candidates"], [])

    def test_manifest_fields_required(self):
        upstream = self.catalog["upstream"]
        for key in ("repo", "commit", "game_version", "patch_date", "fetched_at", "files"):
            self.assertIn(key, upstream)
        self.assertEqual(upstream["repo"], "Darctor/Helldivers2_RawData")

    def test_wiki_supplements_add_ready_and_unsupported_entries(self):
        weapons, stratagems = mini_wiki()
        supplements = {
            "source": "test wiki",
            "items": [
                {
                    "id": "r_40_sightliner", "name": "R-40 视界者",
                    "name_en": "R-40 Sightliner", "category": "primary",
                    "wiki_source": {"game_version": "1.007.200", "revid": 1},
                    "status": "ready",
                    "attacks": [{
                        "id": "r_40:projectile", "name": "R-40 projectile",
                        "kind": "projectile", "status": "ready",
                        "params": {
                            "calibreMm": 8, "massG": 11, "vConfig": 950,
                            "dragCoeff": 0.2, "gravityMultiplier": 1,
                            "lifeTime": 0, "ignoreTerminalVelocity": False,
                            "inheritVelocity": True, "numProjectiles": 1,
                        },
                        "damage": {"normal": 350, "durable": 205},
                        "sources": ["wiki"],
                    }],
                },
                {
                    "id": "g_11_caltrops", "name": "G-11 铁蒺藜",
                    "name_en": "G-11 Caltrops", "category": "throwable",
                    "wiki_source": {"game_version": "1.007.200", "revid": 2},
                    "status": "unsupported",
                    "attacks": [{
                        "id": "g_11:explosion", "name": "G-11 explosion",
                        "kind": "explosion", "status": "unsupported",
                        "reason": "not a projectile", "sources": ["wiki"],
                    }],
                },
            ],
        }
        catalog = sync.build_catalog(
            weapons, stratagems, upstream_with_files(), {}, {"aliases": {}}, supplements)
        rows = {entry["id"]: entry for values in catalog["categories"].values() for entry in values}
        self.assertEqual(rows["r_40_sightliner"]["attacks"][0]["params"]["vConfig"], 950)
        self.assertEqual(rows["r_40_sightliner"]["attacks"][0]["damage"]["durable"], 205)
        self.assertEqual(rows["g_11_caltrops"]["category"], "throwable")
        self.assertEqual(rows["g_11_caltrops"]["status"], "unsupported")
        self.assertEqual(catalog["wiki_supplements"]["count"], 2)
        self.assertEqual(catalog["stats"], {"ready": 5, "unsupported": 2, "unresolved": 1})

    def test_wiki_supplement_never_duplicates_existing_id(self):
        weapons, stratagems = mini_wiki()
        supplements = {"items": [{
            "id": "ar_23_liberator", "category": "primary", "status": "ready",
            "attacks": [{"id": "duplicate", "kind": "projectile", "status": "unsupported"}],
        }]}
        catalog = sync.build_catalog(
            weapons, stratagems, upstream_with_files(), {}, {"aliases": {}}, supplements)
        ids = [entry["id"] for values in catalog["categories"].values() for entry in values]
        self.assertEqual(ids.count("ar_23_liberator"), 1)
        self.assertEqual(catalog["wiki_supplements"]["count"], 0)

    def test_checked_in_wiki_supplements_cover_all_five_new_items(self):
        weapons, stratagems = mini_wiki()
        supplements = json.loads(Path(sync.SUPPLEMENT_FILE).read_text(encoding="utf-8"))
        catalog = sync.build_catalog(
            weapons, stratagems, upstream_with_files(), {}, {"aliases": {}}, supplements)
        rows = {entry["id"]: entry for values in catalog["categories"].values() for entry in values}
        expected = {
            "r_40_sightliner": ("primary", "ready"),
            "p_44_mist": ("secondary", "ready"),
            "amw_20_apex": ("support", "ready"),
            "las_44_nova": ("support", "ready"),
            "g_11_caltrops": ("throwable", "unsupported"),
        }
        self.assertEqual(catalog["wiki_supplements"]["count"], 5)
        for item_id, (category, status) in expected.items():
            self.assertEqual(rows[item_id]["category"], category)
            self.assertEqual(rows[item_id]["status"], status)


class UpstreamValidationTests(unittest.TestCase):
    def _write(self, directory, name, content):
        path = Path(directory) / name
        path.write_text(content, encoding="utf-8")
        return str(path)

    def _valid_files(self, directory):
        proj = [{"ProjectileSettings": {"_metadata": {"game_version": "1.007.100", "patch_date": "2026-09-22",
                 "exported_type_count": 1}, "items": [{"type": "276 <=> X", "calibre": 5.5}]}}]
        dmg = [{"DamageArmorAngles": {"items": []}},
               {"DamageSettings": {"_metadata": {"game_version": "1.007.100", "patch_date": "2026-09-22",
                "exported_type_count": 1}, "items": [{"type": "108 <=> X", "damage": [90, 22]}]}}]
        pwc = {"_metadata": {"game_version": "1.007.100", "exported_entity_count": 1}, "entities": [{}]}
        ecm = [{"EntityComponentMap": {"_metadata": {"game_version": "1.007.100"}, "entities": []}}]
        return {
            "proj": self._write(directory, "generated_projectile_settings.json", json.dumps(proj)),
            "dmg": self._write(directory, "generated_damage_settings.json", json.dumps(dmg)),
            "pwc": self._write(directory, "ProjectileWeaponComponentData.json", json.dumps(pwc)),
            "ecm": self._write(directory, "EntityComponentMap.json", json.dumps(ecm)),
            "csv": self._write(directory, "Hash.csv", "row_type,category,hash\n1,x,2\n"),
        }

    def test_valid_upstream_passes(self):
        with tempfile.TemporaryDirectory() as tmp:
            files = self._valid_files(tmp)
            paths = {"Data/settings/generated_projectile_settings.json": files["proj"],
                     "Data/settings/generated_damage_settings.json": files["dmg"],
                     "Data/entities/ProjectileWeaponComponentData.json": files["pwc"],
                     "Data/settings/EntityComponentMap.json": files["ecm"],
                     "Data/Hash.csv": files["csv"]}
            data = sync.load_and_validate_upstream(paths)
            self.assertEqual(data["game_version"], "1.007.100")

    def test_broken_json_raises(self):
        with tempfile.TemporaryDirectory() as tmp:
            files = self._valid_files(tmp)
            Path(files["proj"]).write_text("{broken", encoding="utf-8")
            paths = {"Data/settings/generated_projectile_settings.json": files["proj"],
                     "Data/settings/generated_damage_settings.json": files["dmg"],
                     "Data/entities/ProjectileWeaponComponentData.json": files["pwc"],
                     "Data/settings/EntityComponentMap.json": files["ecm"],
                     "Data/Hash.csv": files["csv"]}
            with self.assertRaises(RuntimeError):
                sync.load_and_validate_upstream(paths)

    def test_count_mismatch_raises(self):
        with tempfile.TemporaryDirectory() as tmp:
            files = self._valid_files(tmp)
            doc = json.loads(Path(files["proj"]).read_text(encoding="utf-8"))
            doc[0]["ProjectileSettings"]["_metadata"]["exported_type_count"] = 999
            Path(files["proj"]).write_text(json.dumps(doc), encoding="utf-8")
            paths = {"Data/settings/generated_projectile_settings.json": files["proj"],
                     "Data/settings/generated_damage_settings.json": files["dmg"],
                     "Data/entities/ProjectileWeaponComponentData.json": files["pwc"],
                     "Data/settings/EntityComponentMap.json": files["ecm"],
                     "Data/Hash.csv": files["csv"]}
            with self.assertRaises(RuntimeError):
                sync.load_and_validate_upstream(paths)

    def test_version_mismatch_raises(self):
        with tempfile.TemporaryDirectory() as tmp:
            files = self._valid_files(tmp)
            dmg = json.loads(Path(files["dmg"]).read_text(encoding="utf-8"))
            dmg[1]["DamageSettings"]["_metadata"]["game_version"] = "1.006.301"
            Path(files["dmg"]).write_text(json.dumps(dmg), encoding="utf-8")
            paths = {"Data/settings/generated_projectile_settings.json": files["proj"],
                     "Data/settings/generated_damage_settings.json": files["dmg"],
                     "Data/entities/ProjectileWeaponComponentData.json": files["pwc"],
                     "Data/settings/EntityComponentMap.json": files["ecm"],
                     "Data/Hash.csv": files["csv"]}
            with self.assertRaises(RuntimeError):
                sync.load_and_validate_upstream(paths)

    def test_main_failure_keeps_old_catalog(self):
        """上游数据损坏：main 抛错且旧目录文件原样保留（不用空/残缺数据覆盖）"""
        with tempfile.TemporaryDirectory() as tmp:
            old = {"schema_version": 1, "categories": {"primary": [], "secondary": [], "support": []},
                   "stats": {"ready": 91}}
            catalog_file = Path(tmp) / "catalog.json"
            manifest_file = Path(tmp) / "manifest.json"
            catalog_file.write_text(json.dumps(old), encoding="utf-8")
            broken = Path(tmp) / "broken_proj.json"
            broken.write_text("{broken", encoding="utf-8")
            with mock.patch.object(sync, "CATALOG_FILE", str(catalog_file)), \
                 mock.patch.object(sync, "MANIFEST_FILE", str(manifest_file)), \
                 mock.patch.object(sync, "resolve_head_sha", return_value="b" * 40), \
                 mock.patch.object(sync, "download_upstream",
                                   return_value={"Data/settings/generated_projectile_settings.json": str(broken),
                                                 "Data/settings/generated_damage_settings.json": str(broken),
                                                 "Data/entities/ProjectileWeaponComponentData.json": str(broken),
                                                 "Data/settings/EntityComponentMap.json": str(broken),
                                                 "Data/Hash.csv": str(broken)}),                  mock.patch("sys.argv", ["sync_ballistics_catalog.py"]):
                with self.assertRaises(RuntimeError):
                    sync.main([])   # main 直接抛错（包装在 __main__ 层统一 exit 1）
            self.assertEqual(json.loads(catalog_file.read_text(encoding="utf-8")), old,
                             "失败时旧目录必须原样保留")
            self.assertFalse(manifest_file.exists(), "失败时不得写新 manifest")

    def test_same_commit_short_circuits(self):
        with tempfile.TemporaryDirectory() as tmp:
            old = {"schema_version": 1, "upstream": {"commit": "c" * 40}, "stats": {"ready": 91}}
            catalog_file = Path(tmp) / "catalog.json"
            manifest_file = Path(tmp) / "manifest.json"
            manifest_file.write_text(json.dumps({"upstream": {"commit": "c" * 40}}), encoding="utf-8")
            catalog_file.write_text(json.dumps(old), encoding="utf-8")
            with mock.patch.object(sync, "CATALOG_FILE", str(catalog_file)), \
                 mock.patch.object(sync, "MANIFEST_FILE", str(manifest_file)), \
                 mock.patch.object(sync, "SUPPLEMENT_FILE", str(Path(tmp) / "missing-supplements.json")), \
                 mock.patch.object(sync, "resolve_head_sha", return_value="c" * 40), \
                 mock.patch.object(sync, "download_upstream",
                                   side_effect=AssertionError("同 commit 不得重新下载")),                  mock.patch("sys.argv", ["sync_ballistics_catalog.py"]):
                sync.main([])   # 无事可做，正常返回
            self.assertEqual(json.loads(catalog_file.read_text(encoding="utf-8")), old)


if __name__ == "__main__":
    unittest.main()
