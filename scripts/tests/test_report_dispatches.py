import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("report_dispatches", Path(__file__).resolve().parents[1] / "fetch_report_dispatches.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ReportDispatchesTests(unittest.TestCase):
    def test_existing_site_translation_avoids_another_request(self):
        self.assertEqual(module.missing_ids({"dispatches": [{"id": 1}], "news": [{"id": 1, "translated": "站点汉化"}]}, {}, {}), set())

    def test_official_english_does_not_count_as_chinese(self):
        self.assertEqual(module.missing_ids({"dispatches": [{"id": 1}]}, {}, {"dispatches": [{"id": 1, "official_zh": False, "translated": "English only"}]}), {"1"})

    def test_local_translation_and_official_texts_can_complete_coverage(self):
        self.assertEqual(module.missing_ids({"dispatches": [{"id": 1}, {"id": 2}]}, {"items": [{"id": 1, "translated": "汉化"}]}, {"dispatches": [{"id": 2, "official_zh": True, "translated": "官方简中"}]}), set())

    def test_language_header_alone_cannot_admit_english_rows(self):
        rows = module.extract([{"id": 1, "message": "<span>ENGLISH</span>"}, {"id": 2, "message": "<span>保卫超级地球</span>"}, {"id": "bad", "message": "中文"}])
        self.assertEqual([row["id"] for row in rows], [2])

    def test_bad_api_shape_is_reported(self):
        with self.assertRaises(ValueError):
            module.extract({"error": "unavailable"})


if __name__ == "__main__":
    unittest.main()
