import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]
TABLES = ROOT / "HD2-Galatic_war-Map" / "tables"


class Effect1219Tests(unittest.TestCase):
    def test_planetary_regen_adjustment_uses_equivalent_resistance(self):
        values = json.loads((TABLES / "effect_values.json").read_text(encoding="utf-8"))
        details = json.loads((TABLES / "galactic_effects.json").read_text(encoding="utf-8"))
        names = json.loads((TABLES / "effect_id_cn.json").read_text(encoding="utf-8"))
        variables = json.loads((TABLES / "hd2_variables.json").read_text(encoding="utf-8"))

        count = values["effects"]["1219"]["v"][0]
        equivalent = count / 10_000
        self.assertEqual(count, -10_000)
        self.assertEqual(equivalent, -1.0)
        self.assertEqual(details["1219"]["name"], "Planetary regen adjustment")
        self.assertIn("每小时回复星球血量 -10,000", details["1219"]["description_cn"])
        self.assertIn("理论抵抗度 -1.00%", details["1219"]["description_cn"])
        self.assertEqual(names["1219"], "星球抵抗度调整")
        combat = next(row for row in variables["categories"]
                      if row["key"] == "combat_restriction")
        entry = next(row for row in combat["entries"] if 1219 in row["effect_ids"])
        self.assertEqual(entry["cn"], "星球抵抗度调整")

    def test_official_effectid_corrections_are_synchronized(self):
        names = json.loads((TABLES / "effect_id_cn.json").read_text(encoding="utf-8"))
        details = json.loads((TABLES / "galactic_effects.json").read_text(encoding="utf-8"))
        variables = json.loads((TABLES / "hd2_variables.json").read_text(encoding="utf-8"))

        self.assertEqual(len(names), 235)
        expected = {
            "12": "额外奖励",
            "71": "情报包裹遭泄露",
            "113": "充足治疗剂",
            "121": "市场崩溃",
            "1137": "军械库扩充：RS-422 磁轨炮",
            "1178": "武器试验",
            "1186": "轻度“阴霾”笼罩",
            "1187": "“阴霾”",
            "1188": "重度“阴霾”笼罩",
            "1222": "再生覆盖",
            "1303": "爆裂虫族变种",
            "1395": "终结族遏制体系+",
            "1400": "超级地球武装部队驻守",
            "1402": "无票者变种",
        }
        for effect_id, chinese in expected.items():
            self.assertEqual(names[effect_id], chinese)

        self.assertEqual(details["1222"]["name"], "Regen Override")
        self.assertIn("地下破土而出", details["1303"]["description_cn"])
        self.assertIn("大量蹂躏者", details["1359"]["description_cn"])

        entries = [
            entry
            for category in variables["categories"]
            for entry in category.get("entries", [])
        ]
        rupture = next(entry for entry in entries if 1303 in entry["effect_ids"])
        self.assertEqual(rupture["cn"], "爆裂虫族变种")
        devastator = next(
            entry for entry in entries if entry["key"] == "Devastator Surge"
        )
        self.assertEqual(devastator["cn"], "蹂躏者激增")
        hulk = next(entry for entry in entries if entry["key"] == "Hulk Surge")
        self.assertEqual(hulk["cn"], "巨型者激增")
        tcs = next(
            entry
            for entry in entries
            if entry["key"] == "TERMINID CONTROL SYSTEM +"
        )
        self.assertEqual(tcs["cn"], "终结族遏制体系+")


if __name__ == "__main__":
    unittest.main()
