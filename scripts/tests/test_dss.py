import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('dss_site_data', Path(__file__).resolve().parents[1] / 'fetch_site_data.py')
data = importlib.util.module_from_spec(spec)
spec.loader.exec_module(data)


class DssDataTests(unittest.TestCase):
    def station(self):
        return {'id32': 749875195, 'planetIndex': 246, 'currentElectionEndWarTime': 84011990,
                'tacticalActions': [{'id32': 4091660627, 'name': 'EAGLE STORM', 'status': 1,
                'effectIds': [1425, 1212, 1216], 'cost': [{'itemMixId': 3992382197,
                'targetValue': 86400, 'currentValue': 38824.844,
                'maxDonationAmount': 75, 'maxDonationPeriodSeconds': 86400}]}]}

    def test_preserves_resource_identity_limits_precision_and_timestamp(self):
        dss = data.normalize_dss(self.station(), 84000000, 1791943118205, 'official')
        self.assertEqual(dss['id32'], 749875195)
        self.assertEqual(dss['tacticalActions'][0]['id32'], 4091660627)
        cost = dss['tacticalActions'][0]['cost'][0]
        self.assertEqual(cost['itemMixId'], 3992382197)
        self.assertEqual(cost['current'], 38824.844)
        self.assertEqual(cost['maxDonation'], 75)
        self.assertEqual(cost['maxDonationPeriodSec'], 86400)
        self.assertEqual(dss['donationUpdatedAtMs'], 1791943118205)

    def test_old_donation_clock_is_not_replaced_by_new_station_clock(self):
        old = data.normalize_dss(self.station(), 800, 100000, 'companion')
        new = {'clientTimeMs': 999999, 'currentWarTime': 900, 'planetIndex': 246}
        restored = data.restore_dss_actions(new, old)
        self.assertEqual(restored['clientTimeMs'], 999999)
        self.assertEqual(restored['donationUpdatedAtMs'], 100000)
        self.assertEqual(restored['donationSource'], 'snapshot')
        self.assertNotIn('tacticalActions', new)

    def test_legacy_snapshot_retains_its_old_clock_and_missing_clock_is_unknown(self):
        old = {'clientTimeMs': 12345, 'tacticalActions': []}
        self.assertEqual(data.restore_dss_actions({}, old)['donationUpdatedAtMs'], 12345)
        self.assertIsNone(data.restore_dss_actions({}, {'tacticalActions': []})['donationUpdatedAtMs'])

    def test_companion_reuses_normalization_without_faking_missing_client_time(self):
        obj = {'spaceStations': [self.station()], 'warStatus': {'time': 1000}}
        with patch.object(data, 'fetch_json', return_value=obj):
            result = data.fetch_companion()['dss']
        self.assertEqual(result['tacticalActions'][0]['cost'][0]['itemMixId'], 3992382197)
        self.assertIsNone(result['donationUpdatedAtMs'])

    def test_official_fetches_station_detail_and_retains_metadata_on_failure(self):
        calls = []
        fail_detail = False

        def fetch(url, headers, timeout):
            calls.append(url)
            if '/SpaceStation/' in url:
                if fail_detail:
                    raise RuntimeError('detail unavailable')
                return self.station()
            if url.endswith('/Status'):
                return {'time': 1000, 'spaceStations': [{'id32': 749875195, 'planetIndex': 246}]}
            if '/Assignment/' in url or '/NewsFeed/' in url:
                return []
            return {}

        with patch.object(data, 'fetch_json', side_effect=fetch), patch.object(data.time, 'time', return_value=2000):
            result = data.fetch_official()['dss']
            self.assertIn(f'{data.OFFICIAL_API}/api/SpaceStation/{data.WAR_ID}/749875195', calls)
            self.assertEqual(result['donationSource'], 'official')
            self.assertEqual(result['donationUpdatedAtMs'], 2000000)
            self.assertEqual(result['tacticalActions'][0]['cost'][0]['maxDonation'], 75)
            fail_detail = True
            result = data.fetch_official()['dss']
            self.assertEqual(result['planetIndex'], 246)
            self.assertEqual(result['tacticalActions'], [])
            self.assertIsNone(result['donationUpdatedAtMs'])


if __name__ == '__main__':
    unittest.main()
