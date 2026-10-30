import importlib.util
import unittest
from pathlib import Path


def load(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).resolve().parents[1] / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


site = load("fetch_site_data")
baseline = load("fetch_report_baseline")


class ReportDataTests(unittest.TestCase):
    def test_environment_retains_unknown_instead_of_inventing_no_hazards(self):
        rows = site.report_environment_profiles([{"index": 1, "biome": {"name": "Plains"}}, {"index": 2, "hazards": []}])
        self.assertIsNone(rows["1"]["hazards"])
        self.assertEqual(rows["2"]["hazards"], [])
        self.assertEqual(rows["1"]["biome"], "Plains")

    def test_environment_uses_same_existing_api_observation(self):
        row = site.report_environment_profiles([{"index": 2, "biome": "Boneyard", "hazards": [{"name": "Blizzards"}, "Ion Storms", None]}])["2"]
        self.assertEqual(row, {"biome": "Boneyard", "hazards": ["Blizzards", "Ion Storms"]})

    def test_baseline_rejects_stale_snapshot(self):
        with self.assertRaises(ValueError):
            baseline.baseline_payload({"fetchedAt": "2026-10-30T08:00:00Z"}, {"fetchedAt": "2026-10-28T08:00:00Z", "planets": []})

    def test_baseline_preserves_snapshot_identity_and_only_needed_planet_fields(self):
        previous = {"fetchedAt": "2026-10-29T08:00:00Z", "planets": [{"index": 1, "currentOwner": "Humans", "health": 100, "unused": "not part of comparison"}]}
        result = baseline.baseline_payload({"fetchedAt": "2026-10-30T08:00:00Z"}, previous)
        self.assertEqual(result["fetchedAt"], previous["fetchedAt"])
        self.assertEqual(result["planets"][0], {"index": 1, "currentOwner": "Humans", "health": 100})


if __name__ == "__main__":
    unittest.main()
