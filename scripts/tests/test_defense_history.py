import importlib.util
from pathlib import Path
import unittest
import json
import tempfile
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('defense_data', Path(__file__).resolve().parents[1] / 'fetch_site_data.py')
data = importlib.util.module_from_spec(spec)
spec.loader.exec_module(data)


def observation(war_time, events, owner='Humans'):
    return {'war': {'time': war_time}, 'planet_events': events,
            'planets': [{'index': 246, 'currentOwner': owner}]}


def event(health=500, event_id=5717):
    return {'id': event_id, 'planetIndex': 246, 'eventType': 1, 'race': 3,
            'health': health, 'startTime': 50, 'expireTime': 500}


class DefenseHistoryTests(unittest.TestCase):
    def baseline(self):
        return data.build_defense_history({'events': []}, observation(100, [event()]), '2026-10-14T00:00:00Z')

    def test_first_snapshot_only_establishes_active_defense_baseline(self):
        self.assertEqual(self.baseline()['defenseEvents'], [])

    def test_main_carries_the_defense_baseline_to_the_next_fetch(self):
        def source(war_time, events):
            return {**observation(war_time, events), 'campaigns': [], 'assignments': None,
                    'dispatches': [], 'planets': [{'index': 246, 'name': 'PLANET_246',
                    'currentOwner': 'Humans', 'health': 1000000, 'maxHealth': 1000000}]}

        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / 'HD2-Galatic_war-Map/data.json'
            with patch.object(data, 'SITE_ROOT', folder), \
                 patch.object(data, 'fetch_official', side_effect=[source(100, [event()]), source(200, [])]), \
                 patch.object(data, 'fetch_companion', return_value=None), \
                 patch.object(data, 'fetch_hd2dev', return_value=None), \
                 patch.object(data, 'fetch_player_records', return_value=[]), \
                 patch.object(data, '_load_snapshot', return_value={}), \
                 patch.object(data, '_save_snapshot'), \
                 patch.object(data, '_save_maxh_cache'), \
                 patch.object(data, 'now_cn', side_effect=['2026-10-14T00:00:00Z', '2026-10-14T00:05:00Z']), \
                 patch.object(data.urllib.request, 'urlopen', side_effect=OSError('offline test')):
                data.main()
                data.main()
            history = json.loads(target.read_text(encoding='utf-8'))['ownership_history']
            self.assertEqual(history['events'], [])
            self.assertEqual(len(history['defenseEvents']), 1)
            self.assertEqual(history['defenseEvents'][0]['planetIndex'], 246)

    def test_early_end_while_still_human_is_recorded_without_ownership_change(self):
        history = data.build_defense_history(self.baseline(), observation(200, []), '2026-10-14T00:05:00Z')
        self.assertEqual(history['events'], [])
        self.assertEqual(len(history['defenseEvents']), 1)
        win = history['defenseEvents'][0]
        self.assertEqual((win['eventId'], win['planetIndex'], win['attacker']), (5717, 246, 'Automaton'))
        self.assertEqual(win['evidence'], 'ended_early')

    def test_zero_health_is_recorded_once_even_if_event_remains_then_disappears(self):
        history = data.build_defense_history(self.baseline(), observation(200, [event(0)]), '2026-10-14T00:05:00Z')
        self.assertEqual(history['defenseEvents'][0]['evidence'], 'health_zero')
        history = data.build_defense_history(history, observation(250, [event(0)]), '2026-10-14T00:10:00Z')
        history = data.build_defense_history(history, observation(300, []), '2026-10-14T00:15:00Z')
        self.assertEqual(len(history['defenseEvents']), 1)

    def test_loss_or_unknown_owner_never_counts_as_victory(self):
        for owner in ['Automaton', 'Unknown']:
            history = data.build_defense_history(self.baseline(), observation(200, [], owner), '2026-10-14T00:05:00Z')
            self.assertEqual(history['defenseEvents'], [])

    def test_disappearance_at_or_after_deadline_is_not_assumed_success(self):
        for war_time in [500, 600]:
            history = data.build_defense_history(self.baseline(), observation(war_time, []), '2026-10-14T00:05:00Z')
            self.assertEqual(history['defenseEvents'], [])

    def test_source_failure_and_old_war_clock_keep_the_baseline(self):
        baseline = self.baseline()
        self.assertEqual(data.build_defense_history(baseline, None, '2026-10-14T00:05:00Z'), baseline)
        self.assertEqual(data.build_defense_history(baseline, observation(100, []), '2026-10-14T00:05:00Z'), baseline)
        history = data.build_defense_history(baseline, observation(200, []), '2026-10-14T00:10:00Z')
        self.assertEqual(len(history['defenseEvents']), 1)

    def test_separate_defenses_on_same_planet_keep_both_victories(self):
        history = data.build_defense_history(self.baseline(), observation(200, []), '2026-10-14T00:05:00Z')
        history = data.build_defense_history(history, observation(250, [event(event_id=5720)]), '2026-10-14T00:10:00Z')
        history = data.build_defense_history(history, observation(300, []), '2026-10-14T00:15:00Z')
        self.assertEqual([win['eventId'] for win in history['defenseEvents']], [5717, 5720])

    def test_rolling_48h_prunes_old_victories_without_recounting_zero_health(self):
        history = data.build_defense_history(self.baseline(), observation(200, [event(0)]), '2026-10-14T00:05:00Z')
        history = data.build_defense_history(history, observation(300, [event(0)]), '2026-10-16T00:05:01Z')
        self.assertEqual(history['defenseEvents'], [])


if __name__ == '__main__':
    unittest.main()
