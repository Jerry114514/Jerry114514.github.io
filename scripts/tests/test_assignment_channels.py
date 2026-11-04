import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "fetch_site_data_channels", ROOT / "scripts" / "fetch_site_data.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class AssignmentChannelTest(unittest.TestCase):
    def test_normalize_keeps_strategic_assignment_and_clock(self):
        raw = {
            "id32": 3504692473,
            "startTime": 85856280,
            "expiresIn": 315706,
            "progress": [0, 0, 0, 0],
            "setting": {
                "overrideTitle": "STRATEGIC THREAT",
                "overrideBrief": "Investigate TCS+ breach reports.",
                "tasks": [{"type": 13}] * 4,
                "rewards": [],
            },
        }
        out = MODULE.normalize_assignment(raw, clock=1793740000, war_now=85857000)
        self.assertEqual(out["id"], 3504692473)
        self.assertEqual(out["title"], "STRATEGIC THREAT")
        self.assertEqual(len(out["tasks"]), 4)
        self.assertTrue(out["startedAt"].endswith("Z"))
        self.assertTrue(out["deadline"].endswith("Z"))
        self.assertEqual(out["rewards"], [])


if __name__ == "__main__":
    unittest.main()
