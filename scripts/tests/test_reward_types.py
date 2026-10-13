#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""战役奖励类型表（scripts/fetch_reward_types.py）的离线回归。

用 scripts/tests/fixtures/companion-reward-bundle-excerpt.js（裁剪过的 companion 前端 bundle
片段）跑解析，不联网；再验证 scripts/fetch_site_data.py 的 _reward_of 取值优先级：
人工层 > 自动表 > 中性兜底。
"""

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPTS = HERE.parent
FIXTURE = HERE / "fixtures" / "companion-reward-bundle-excerpt.js"


def _load(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / ("%s.py" % name))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


frt = _load("fetch_reward_types")
site = _load("fetch_site_data")
TABLE = frt.parse_bundle(FIXTURE.read_text(encoding="utf-8"))


class ParseBundleTests(unittest.TestCase):
    """解析口径：类型明文 + 中文 + 站内图标枚举/路径。"""

    def test_cape_from_comma_declared_array(self):
        self.assertEqual(TABLE["3890208935"], {
            "en": "Cape", "cn": "披风", "icon": "cape",
            "img": "./assets/campaign/reward_cape.svg",
            "icBuild": "currency.item_cape2|#FBFAF5|0.8|0,-3",
        })

    def test_helmet_from_const_declared_array(self):
        """⚠ 2026-10-13 实测踩过：数组写在 `const Kde=[…]` 里，只认逗号声明列表会整类丢失。"""
        self.assertEqual(TABLE["1000000001"]["en"], "Helmet")
        self.assertEqual(TABLE["1000000001"]["cn"], "头盔")

    def test_stratagem_and_icon_enum(self):
        for mix in ("1618361436", "2237630340"):
            self.assertEqual(TABLE[mix]["en"], "Stratagem")
            self.assertEqual(TABLE[mix]["icon"], "stratagem")
            self.assertEqual(TABLE[mix]["img"], "./assets/campaign/reward_stratagem.svg")

    def test_currency_catalog(self):
        self.assertEqual(TABLE["897894480"]["en"], "Warbond Medal")
        self.assertEqual(TABLE["897894480"]["icon"], "medal")
        self.assertEqual(TABLE["897894480"]["img"], "./assets/campaign/reward_medal.svg")
        self.assertEqual(TABLE["3608481516"]["cn"], "征用单")
        self.assertEqual(TABLE["3608481516"]["icon"], "item")   # 站内只认 4 个图标枚举

    def test_every_branch_present_and_enums_whitelisted(self):
        labels = {v["en"] for v in TABLE.values()}
        self.assertEqual(labels, {"Cape", "Body Armor", "Helmet", "Primary", "Sidearm",
                                  "Throwable", "Stratagem", "Pattern", "Warbond Medal",
                                  "Requisition Slip"})
        self.assertTrue({v["icon"] for v in TABLE.values()} <= {"cape", "medal", "stratagem", "item"})
        for v in TABLE.values():
            self.assertTrue(v["img"].startswith("./assets/campaign/reward_"), v["img"])
            self.assertTrue(v["cn"], v)          # 明文 → 中文必须闭集覆盖

    def test_unknown_id_is_not_invented(self):
        self.assertIsNone(TABLE.get("1"))
        self.assertIsNone(TABLE.get("2237630341"))

    def test_broken_bundle_raises_instead_of_writing_half_table(self):
        with self.assertRaises(RuntimeError):
            frt.parse_bundle("const x=[1,2,3];")
        with self.assertRaises(RuntimeError):
            frt.parse_bundle('e=>{const t=nhe[e];return t||({text:"Cape"})}')

    def test_load_table_tolerates_missing_or_broken_file(self):
        self.assertEqual(frt.load_table(str(HERE / "no-such-file.json")), {})
        with tempfile.TemporaryDirectory() as folder:
            bad = Path(folder) / "reward_types.json"
            bad.write_text("{ not json", encoding="utf-8")
            self.assertEqual(frt.load_table(str(bad)), {})


class RewardResolutionTests(unittest.TestCase):
    """fetch_site_data._reward_of 的优先级：人工层 > 自动表 > 中性兜底。"""

    def setUp(self):
        self._saved = site._AUTO_REWARD_TYPES
        site._AUTO_REWARD_TYPES = TABLE
        self.addCleanup(lambda: setattr(site, "_AUTO_REWARD_TYPES", self._saved))

    def test_auto_table_fills_plaintext(self):
        r = site._reward_of({"mixId": 2237630340, "amount": 1}, {})
        self.assertEqual((r["name"], r["name_cn"], r["icon"], r["icon_img"]),
                         ("Stratagem", "战略配备", "stratagem", "./assets/campaign/reward_stratagem.svg"))

    def test_manual_layer_wins_and_can_add_detail(self):
        zh = {"reward_types": {"2237630340": {"cn": "战略配备（自定义）",
                                              "detail": "TD-110 “风暴漩涡”坦克"}}}
        r = site._reward_of({"mixId": 2237630340, "amount": 1}, zh)
        self.assertEqual(r["name"], "Stratagem")            # 未覆盖的字段仍来自自动表
        self.assertEqual(r["name_cn"], "战略配备（自定义）")
        self.assertEqual(r["detail"], "TD-110 “风暴漩涡”坦克")

    def test_manual_only_mixid_keeps_working(self):
        zh = {"reward_types": {"1234567890": {"en": "CAPE", "cn": "披风",
                                              "icon": "cape", "img": "./assets/campaign/reward_cape.svg"}}}
        r = site._reward_of({"mixId": 1234567890, "amount": 1}, zh)
        self.assertEqual(r["name_cn"], "披风")

    def test_unknown_mixid_falls_back_neutrally(self):
        r = site._reward_of({"mixId": 42, "amount": 2}, {})
        self.assertEqual((r["name"], r["name_cn"], r["icon"], r["icon_img"]),
                         ("REWARD", "", "reward", ""))
        self.assertEqual(r["amount"], 2)

    def test_medal_keeps_legacy_fallback(self):
        site._AUTO_REWARD_TYPES = {}
        r = site._reward_of({"mixId": 897894480, "amount": 45}, {})
        self.assertEqual((r["name"], r["icon"]), ("WARBOND MEDAL", "medal"))

    def test_non_dict_entry_returns_none(self):
        self.assertIsNone(site._reward_of(None, {}))

    def test_ensure_reward_types_is_noop_when_all_known(self):
        site._ensure_reward_types({"episodes": [{"rewards": [{"mixId": 2237630340}],
                                                "phases": [{"rewards": [{"mixId": 897894480}]}]}]})
        # 表里都有 → 不该改动任何东西、也不该抛错
        self.assertIn("2237630340", site._AUTO_REWARD_TYPES)


class GeneratedTableShapeTests(unittest.TestCase):
    """build_table 的落盘结构（_meta + types），供站点/校验器/人读。"""

    def test_shape(self):
        payload = frt.build_table("x.js", FIXTURE.read_text(encoding="utf-8"))
        self.assertEqual(set(payload), {"_meta", "types"})
        self.assertIn("前端 bundle", payload["_meta"]["source"])
        self.assertEqual(payload["_meta"]["count"], len(payload["types"]))
        self.assertEqual(payload["_meta"]["chunk"], "x.js")
        json.dumps(payload, ensure_ascii=False)      # 必须可序列化


if __name__ == "__main__":
    unittest.main()
