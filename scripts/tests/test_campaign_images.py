import importlib.util
import os
from pathlib import Path
import sys
import unittest


ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location(
    "fetch_site_data",
    ROOT / "scripts" / "fetch_site_data.py",
)
fetch = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = fetch
spec.loader.exec_module(fetch)


class CampaignImageTests(unittest.TestCase):
    def test_companion_media_id_maps_to_news_webp(self):
        banner = fetch.campaign_banner_of(389427183)
        self.assertEqual(banner["name"], "tcsplus6")
        self.assertEqual(banner["path"], "/news/tcsplus6.webp")
        self.assertTrue(banner["url"].endswith("/news/tcsplus6.webp"))
        self.assertNotIn("local", banner)

    def test_local_media_id_has_no_remote_url(self):
        banner = fetch.campaign_banner_of(1156489171)
        self.assertEqual(banner["name"], "sereneg_containment")
        self.assertIsNone(banner["url"])
        self.assertIsNone(banner["path"])
        self.assertTrue(banner["local"])

    def test_unknown_media_id_returns_none(self):
        self.assertIsNone(fetch.campaign_banner_of(1393879354))
        self.assertIsNone(fetch.campaign_banner_of(None))
        self.assertIsNone(fetch.campaign_banner_of("nope"))

    def test_every_local_banner_ships_as_a_real_webp(self):
        for media_id, name in fetch.LOCAL_CAMPAIGN_BANNERS.items():
            path = os.path.join(fetch.CAMPAIGN_ASSET_DIR, f"banner_{name}.webp")
            self.assertTrue(os.path.exists(path), f"missing local art for {media_id}: {path}")
            with open(path, "rb") as handle:
                self.assertEqual(fetch._image_kind(handle.read(16)), "webp")

    def test_download_campaign_banner_reuses_local_file(self):
        banner = fetch.campaign_banner_of(1156489171)
        rel = fetch.download_campaign_banner(banner)
        self.assertEqual(rel, "assets/campaign/banner_sereneg_containment.webp")

    def test_download_campaign_banner_tolerates_missing_local_file(self):
        banner = {"name": "definitely_not_present", "path": None, "url": None, "local": True}
        self.assertIsNone(fetch.download_campaign_banner(banner))


if __name__ == "__main__":
    unittest.main()
