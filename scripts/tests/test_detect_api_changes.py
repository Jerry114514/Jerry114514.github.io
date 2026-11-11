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

    def test_report_prints_beijing_time_below_utc(self):
        report = changes.render_report(
            changes.ChangeSet(), {}, {}, {}, "2026-10-28T16:30:05Z", []
        )
        lines = report.splitlines()
        utc_index = lines.index("- 检测时间（UTC）：2026-10-28T16:30:05Z")
        self.assertEqual(
            lines[utc_index + 1],
            "- 检测时间（UTC+8，北京时间）：2026-10-29 00:30:05",
        )

    def test_beijing_time_handles_bad_input(self):
        self.assertEqual(changes.beijing_time("not-a-timestamp"), "未知")
        self.assertEqual(changes.beijing_time(""), "未知")

    def test_normalizes_global_events_and_remaining_time(self):
        rows, max_id, war_time = changes.normalize_global_events(
            {
                "warStatus": {
                    "time": 1000,
                    "globalEvents": [
                        {
                            "eventId": 7,
                            "title": "INTERROGATION",
                            "message": "<i=1>Archive</i> recovered",
                            "expireTime": 1900,
                            "effectIds": [1430, 1430],
                            "planetIndices": [199],
                        }
                    ],
                }
            }
        )
        self.assertEqual(max_id, 7)
        self.assertEqual(war_time, 1000)
        self.assertEqual(rows[0]["title"], "INTERROGATION")
        self.assertEqual(rows[0]["message"], "Archive recovered")
        self.assertEqual(rows[0]["effect_ids"], [1430])
        self.assertEqual(rows[0]["remaining_seconds"], 900)

    def test_global_event_filter_skips_mo_and_detached_combatant_event(self):
        rows, _max_id, _war_time = changes.normalize_global_events(
            {
                "warStatus": {
                    "time": 1000,
                    "globalEvents": [
                        {
                            "eventId": 10,
                            "title": "BRIEFING",
                            "assignmentId32": 123,
                        },
                        {
                            "eventId": 11,
                            "effectIds": [1430],
                            "planetIndices": [],
                        },
                        {
                            "eventId": 12,
                            "title": "COMPANY MOVES",
                            "effectIds": [1431],
                            "planetIndices": [43],
                        },
                    ],
                }
            }
        )
        effects = {
            "1430": {"id": 1430, "effectType": 40},
            "1431": {"id": 1431, "effectType": 71},
        }
        selected = changes.eligible_global_events(rows, effects, 0)
        self.assertEqual([row["event_id"] for row in selected], [12])

    def test_report_renders_global_event_effects_and_planets(self):
        result = changes.ChangeSet(
            new_global_events=[
                {
                    "event_id": 1501099,
                    "title": "COMPANY MOVES",
                    "message": "Forces have moved.",
                    "flag": 0,
                    "effect_ids": [1431],
                    "planet_indices": [43],
                    "remaining_seconds": 3600,
                }
            ],
            global_events_initial=True,
        )
        report = changes.render_report(
            result,
            {"1431": {"id": 1431, "effectType": 71}},
            {"43": "NIVEL 43"},
            {},
            "2026-10-31T00:00:00Z",
            [],
            effect_cn={"1431": "星图标记"},
            planet_cn={"NIVEL 43": "尼维尔 43"},
        )
        self.assertIn("首次启用全局事件侦测", report)
        self.assertIn("`1431` — 星图标记", report)
        self.assertIn("尼维尔 43", report)

    def test_invalid_empty_effect_payload_is_rejected(self):
        with self.assertRaises(ValueError):
            changes.normalize_effects([])


if __name__ == "__main__":
    unittest.main()
