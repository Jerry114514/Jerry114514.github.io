import importlib.util
from pathlib import Path
import sys
import unittest


spec = importlib.util.spec_from_file_location(
    "detect_api_changes",
    Path(__file__).resolve().parents[1] / "detect_api_changes.py",
)
changes = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = changes
spec.loader.exec_module(changes)


class ApiChangeDetectionTests(unittest.TestCase):
    def baseline(self):
        return {
            "effects": {
                "1429": {"id": 1429, "effectType": 72, "flags": 1, "values": [1]},
                "1430": {"id": 1430, "effectType": 40, "flags": 0, "values": [10]},
            },
            "planet_effects": {"43": [1429], "44": [1430]},
        }

    def test_detects_new_removed_and_changed_effect_definitions(self):
        current = {
            "1430": {"id": 1430, "effectType": 40, "flags": 1, "values": [10]},
            "1431": {"id": 1431, "effectType": 71, "flags": 0, "values": [20]},
        }
        result = changes.diff_snapshots(
            self.baseline(),
            current,
            {"43": [1429], "44": [1430]},
        )
        self.assertEqual(result.new_effects, ["1431"])
        self.assertEqual(result.removed_effects, ["1429"])
        self.assertEqual(result.removed_effect_defs["1429"]["effectType"], 72)
        self.assertEqual([row[0] for row in result.changed_effects], ["1430"])

    def test_detects_planet_effect_additions_and_removals_as_sets(self):
        current = {
            "1429": {"id": 1429, "effectType": 72, "flags": 1, "values": [1]},
            "1430": {"id": 1430, "effectType": 40, "flags": 0, "values": [10]},
        }
        result = changes.diff_snapshots(
            self.baseline(),
            current,
            {"43": [1429, 1431], "44": []},
        )
        self.assertEqual(result.planet_effects_added, {"43": [1431]})
        self.assertEqual(result.planet_effects_removed, {"44": [1430]})

    def test_normalizes_duplicate_free_effect_list(self):
        payload = [
            {"id": 1430, "effectType": 40, "values": [1]},
            {"id": "1431", "effectType": 71, "values": [2]},
        ]
        result = changes.normalize_effects(payload)
        self.assertEqual(sorted(result), ["1430", "1431"])

    def test_normalizes_planet_effects_and_names(self):
        result, names = changes.normalize_planet_effects(
            {
                "planets": [
                    {"index": 43, "name": "NIVEL 43", "activeEffects": [1431, 1430, 1431]},
                    {"index": 44, "name": "OTHER", "activeEffects": []},
                ]
            }
        )
        self.assertEqual(result, {"43": [1430, 1431], "44": []})
        self.assertEqual(names["43"], "NIVEL 43")

    def test_report_uses_fallback_effect_type_labels(self):
        effect = {"id": 1430, "effectType": 40}
        result = changes.ChangeSet(new_effects=["1430"])
        report = changes.render_report(
            result,
            {"1430": effect},
            {},
            {},
            "2026-10-28T00:00:00Z",
            [],
        )
        self.assertIn("新增的银河效果", report)
        self.assertIn("增加作战兵力", report)

    def test_invalid_empty_effect_payload_is_rejected(self):
        with self.assertRaises(ValueError):
            changes.normalize_effects([])


if __name__ == "__main__":
    unittest.main()
