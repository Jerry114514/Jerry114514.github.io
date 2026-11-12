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


if __name__ == "__main__":
    unittest.main()
