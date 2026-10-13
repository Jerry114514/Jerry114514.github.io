import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("site_data", Path(__file__).resolve().parents[1] / "fetch_site_data.py")
data = importlib.util.module_from_spec(spec)
spec.loader.exec_module(data)


def snapshot(hour, owners):
    return {"fetchedAt": f"2026-10-13T{hour:02}:00:00Z",
            "planets": [{"index": index, "currentOwner": owner} for index, owner in owners.items()]}


class OwnershipHistoryTests(unittest.TestCase):
    def test_initial_observation_is_not_a_capture(self):
        history = data.build_ownership_history({}, snapshot(0, {0: "Humans"}))
        self.assertEqual(history["events"], [])
        self.assertEqual(history["startedAt"], "2026-10-13T00:00:00Z")

    def test_previous_snapshot_seeds_first_transition(self):
        history = data.build_ownership_history(snapshot(0, {0: "Terminids"}), snapshot(1, {0: "Humans"}))
        self.assertEqual(history["events"], [{"planetIndex": 0, "fromOwner": "Terminids", "toOwner": "Humans",
            "previousSeenAt": "2026-10-13T00:00:00Z", "detectedAt": "2026-10-13T01:00:00Z"}])

    def test_reversal_keeps_both_events(self):
        a = snapshot(0, {1: "Humans", 2: "Automaton"})
        b = snapshot(1, {1: "Terminids", 2: "Automaton"})
        history = data.build_ownership_history(a, b)
        history = data.build_ownership_history(b, snapshot(2, {1: "Humans", 2: "Automaton"}), history)
        self.assertEqual([(e["fromOwner"], e["toOwner"]) for e in history["events"]],
                         [("Humans", "Terminids"), ("Terminids", "Humans")])

    def test_missing_unknown_and_new_planets_do_not_create_changes(self):
        previous = snapshot(0, {0: "Unknown", 1: "Humans", 2: "Terminids"})
        current = snapshot(1, {0: "Humans", 1: "Unknown", 3: "Automaton"})
        history = data.build_ownership_history(previous, current)
        self.assertEqual(history["events"], [])

    def test_same_or_older_snapshot_does_not_duplicate_or_rewind(self):
        a, b = snapshot(0, {0: "Humans"}), snapshot(1, {0: "Illuminate"})
        history = data.build_ownership_history(a, b)
        self.assertEqual(data.build_ownership_history(b, b, history), history)
        self.assertEqual(data.build_ownership_history(b, a, history), history)

    def test_rolling_window_prunes_old_events_but_keeps_boundary(self):
        a, b = snapshot(0, {0: "Humans"}), snapshot(1, {0: "Terminids"})
        history = data.build_ownership_history(a, b)
        current = {**b, "fetchedAt": "2026-10-15T01:00:00Z"}
        history = data.build_ownership_history(b, current, history)
        self.assertEqual(len(history["events"]), 1)
        current["fetchedAt"] = "2026-10-15T01:00:01Z"
        self.assertEqual(data.build_ownership_history(b, current, history)["events"], [])

    def test_timezone_offsets_compare_as_instants(self):
        previous = snapshot(0, {0: "Humans"})
        current = {**snapshot(1, {0: "Automaton"}), "fetchedAt": "2026-10-13T09:00:00+08:00"}
        history = data.build_ownership_history(previous, current)
        self.assertEqual(len(history["events"]), 1)
        self.assertEqual(history["events"][0]["detectedAt"], current["fetchedAt"])

    def test_checked_in_seed_has_valid_ordered_observations(self):
        seed = Path(__file__).resolve().parents[2] / "HD2-Galatic_war-Map/data/history/ownership_seed.json"
        history = json.loads(seed.read_text(encoding="utf-8"))
        def time(stamp):
            return data.datetime.fromisoformat(stamp.replace("Z", "+00:00"))
        self.assertTrue(history["lastSnapshot"]["owners"])
        self.assertEqual(history["updatedAt"], history["lastSnapshot"]["fetchedAt"])
        last = time(history["startedAt"])
        for event in history["events"]:
            self.assertIsInstance(event["planetIndex"], int)
            self.assertIn(event["fromOwner"], data.OWNER_MAP.values())
            self.assertIn(event["toOwner"], data.OWNER_MAP.values())
            self.assertNotEqual(event["fromOwner"], event["toOwner"])
            self.assertLess(time(event["previousSeenAt"]), time(event["detectedAt"]))
            self.assertLessEqual(last, time(event["detectedAt"]))
            self.assertLessEqual(time(event["detectedAt"]), time(history["updatedAt"]))
            last = time(event["detectedAt"])


if __name__ == "__main__":
    unittest.main()
