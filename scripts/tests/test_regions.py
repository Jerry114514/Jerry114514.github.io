import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('site_data', Path(__file__).resolve().parents[1] / 'fetch_site_data.py')
data = importlib.util.module_from_spec(spec)
spec.loader.exec_module(data)

class RegionDataTests(unittest.TestCase):
    def test_join_uses_region_identity(self):
        obj = {'warInfo': {'planetRegions': [
            {'planetIndex': 1, 'regionIndex': 2, 'maxHealth': 400000, 'damageMultiplier': 2, 'flags': 1, 'regionSize': 2},
            {'planetIndex': 1, 'regionIndex': 0, 'maxHealth': 100000}]},
            'warStatus': {'planetRegions': [
                {'planetIndex': 1, 'regionIndex': 2, 'owner': 3, 'health': 123, 'isAvailable': False, 'availabilityFactor': .25},
                {'planetIndex': 1, 'regionIndex': 0, 'owner': 1, 'isAvailable': True}]}}
        rows = data.normalize_regions(obj)[1]
        self.assertEqual([r['regionIndex'] for r in rows], [0, 2])
        self.assertEqual(rows[1]['maxHealth'], 400000)
        self.assertEqual(rows[1]['damageMultiplier'], 2)
        self.assertEqual(rows[1]['availabilityFactor'], .25)
        self.assertFalse(rows[1]['isAvailable'])
        self.assertEqual(rows[1]['flags'], 1)
        self.assertIsNone(rows[0]['damageMultiplier'])

    def test_missing_info_stays_unknown(self):
        rows = data.normalize_regions({'warStatus': {'planetRegions': [{'planetIndex': 1, 'regionIndex': 0}]}})[1]
        self.assertIsNone(rows[0]['maxHealth'])
        self.assertIsNone(rows[0]['isAvailable'])
        self.assertIsNone(rows[0]['availabilityFactor'])

    def test_atomic_write_preserves_previous_snapshot_on_failure(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / 'data.json'
            data.write_json_atomic(str(target), {'value': 1})
            with self.assertRaises(TypeError):
                data.write_json_atomic(str(target), {'value': object()})
            self.assertEqual(json.loads(target.read_text()), {'value': 1})
            self.assertEqual(len(list(Path(folder).iterdir())), 1)

    def test_companion_order_has_utc_window_without_hd2dev(self):
        original = data.fetch_json
        try:
            data.fetch_json = lambda *args: {'clientTime': 1791763200000, 'warStatus': {'time': 100000}, 'majorOrders': [
                {'id32': 42, 'startTime': 13600, 'expiresIn': 86400, 'setting': {'tasks': []}}]}
            a = data.fetch_companion()['assignments']
            self.assertEqual(a['startedAt'], '2026-10-11T00:00:00Z')
            self.assertEqual(a['deadline'], '2026-10-13T00:00:00Z')
        finally:
            data.fetch_json = original

    def test_official_planet_effects_use_index_field(self):
        def fetch(url, headers, timeout):
            if url.endswith('/Status'):
                return {
                    'time': 1000,
                    'planetStatus': [{'index': 7, 'owner': 3}],
                    'planetActiveEffects': [
                        {'index': 7, 'galacticEffectId': 1402},
                        {'index': 7, 'galacticEffectId': 1403},
                    ],
                    'campaigns': [],
                    'planetEvents': [],
                }
            if url.endswith('/WarInfo'):
                return {'planetInfos': [{'index': 7, 'name': 'ZEA RUGOSIA'}]}
            return []

        with patch.object(data, 'fetch_json', side_effect=fetch):
            planets = data.fetch_official()['planets']
        self.assertEqual(planets[0]['activeEffects'], [1402, 1403])

    def test_active_effect_snapshot_is_saved_and_restores_global_zero(self):
        with tempfile.TemporaryDirectory() as folder:
            snapshot_path = str(Path(folder) / 'snapshot.json')
            source = {'planets': [
                {'index': 7, 'activeEffects': [1402, 1403]},
                {'index': 8, 'activeEffects': []},
            ]}
            with patch.object(data, 'SNAPSHOT_FILE', snapshot_path):
                data._save_snapshot(source)
                saved = json.loads(Path(snapshot_path).read_text())
            self.assertEqual(saved['activeEffects'], {'7': [1402, 1403], '8': []})

            broken = [
                {'index': 7, 'activeEffects': []},
                {'index': 8, 'activeEffects': []},
            ]
            restored = data.apply_active_effects_fallback(broken, saved)
            self.assertEqual(restored, 2)
            self.assertEqual(broken[0]['activeEffects'], [1402, 1403])

    def test_active_effect_fallback_does_not_mask_partial_changes(self):
        planets = [
            {'index': 7, 'activeEffects': [1402]},
            {'index': 8, 'activeEffects': []},
        ]
        snapshot = {'activeEffects': {'7': [1402, 1403], '8': [1234]}}
        self.assertEqual(data.apply_active_effects_fallback(planets, snapshot), 0)
        self.assertEqual(planets[0]['activeEffects'], [1402])
        self.assertEqual(planets[1]['activeEffects'], [])

if __name__ == '__main__':
    unittest.main()
