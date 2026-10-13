import importlib.util
from pathlib import Path
import unittest
import json
import tempfile
from unittest.mock import patch
from datetime import datetime, timedelta, timezone

spec = importlib.util.spec_from_file_location("site_data", Path(__file__).resolve().parents[1] / "fetch_site_data.py")
data = importlib.util.module_from_spec(spec)
spec.loader.exec_module(data)

def record(minutes, count=10):
    return {"timestamp": (datetime(2026, 10, 13, tzinfo=timezone.utc) + timedelta(minutes=minutes)).isoformat(),
            "totalPlayers": count, "impactMultiplier": .02,
            "factions": {"Humans": 1, "Terminids": count-1, "Automatons": 0, "Illuminate": 0}}

class PlayerHistoryTests(unittest.TestCase):
    def test_invalid_old_and_new_timestamps_do_not_discard_valid_frames(self):
        bad = [{**record(0), "timestamp": value} for value in ["", None, 123, "not-a-date",
               "2026-10-13T00:00:00", "2026-10-13"]] + [{"totalPlayers": 10}]
        for old, new in [(bad + [record(0)], [record(15)]), ([record(0)], bad + [record(15)])]:
            history = data.merge_player_history({"history": old}, new)
            self.assertEqual([r["timestamp"] for r in history["history"]], [record(0)["timestamp"], record(15)["timestamp"]])

    def test_missing_timestamp_in_one_upstream_frame_keeps_the_other_frames(self):
        rows = [{"totalPlayerCount": 99}, {"timestampUtc": record(15)["timestamp"], "totalPlayerCount": 12}]
        with patch.object(data, "fetch_json", return_value={"data": rows}):
            history = data.merge_player_history({"history": []}, data.fetch_player_records())
        self.assertEqual(len(history["history"]), 1)
        self.assertEqual(history["history"][0]["totalPlayers"], 12)

    def test_null_or_missing_statistics_are_numeric_zero_in_all_views(self):
        for values in [{}, {"totalPlayerCount": None, "impactMultiplier": None,
                           "playerCountHumans": None, "playerCountTerminids": None}]:
            with patch.object(data, "fetch_json", return_value={"data": [{"timestampUtc": record(0)["timestamp"], **values}]}):
                latest = data.merge_player_history({"history": []}, data.fetch_player_records())["history"][-1]
            self.assertEqual(latest["totalPlayers"], 0)
            self.assertEqual(latest["impactMultiplier"], 0)
            distribution = data.distribution_from_record(latest)
            self.assertEqual([distribution[k] for k in ["total","humans","terminids","automatons","illuminate"]], [0]*5)
        old = {**record(0), "totalPlayers": None, "impactMultiplier": None, "factions": {"Humans": None}}
        latest = data.merge_player_history({"history": [old]}, [])["history"][-1]
        self.assertEqual(latest["totalPlayers"], 0)
        self.assertEqual(latest["impactMultiplier"], 0)
        self.assertEqual(data.distribution_from_record(latest)["humans"], 0)

    def test_main_writes_fresh_war_data_despite_bad_old_and_new_timestamps(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / "HD2-Galatic_war-Map/data.json"
            hist_path = target.parent / "data/history/player_distribution.json"
            hist_path.parent.mkdir(parents=True)
            hist_path.write_text(json.dumps({"history": [{**record(0), "timestamp": ""}, record(0)]}), encoding="utf-8")
            with patch.object(data,"SITE_ROOT",folder), \
                 patch.object(data,"fetch_official",return_value={"planets": [],"campaigns": [],"dispatches": []}), \
                 patch.object(data,"fetch_companion",return_value=None), \
                 patch.object(data,"fetch_hd2dev",return_value=None), \
                 patch.object(data,"fetch_player_records",return_value=[{**record(5), "timestamp": None},record(15)]), \
                 patch.object(data,"_load_snapshot",return_value={}), \
                 patch.object(data,"_save_snapshot"):
                data.main()
            result=json.loads(target.read_text(encoding="utf-8"))
            history=json.loads(hist_path.read_text(encoding="utf-8"))
            self.assertIn("fetchedAt",result)
            self.assertEqual(result["player_distribution"]["updatedAt"],record(15)["timestamp"])
            self.assertEqual(len(history["history"]),2)

    def test_main_uses_one_request_for_distribution_impact_and_backfill(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / "HD2-Galatic_war-Map/data.json"
            target.parent.mkdir()
            stats = [{"timestampUtc": record(i)["timestamp"], "totalPlayerCount": 20+i,
                      "playerCountHumans": 1, "playerCountTerminids": 19+i, "impactMultiplier": .03}
                     for i in [0,15,30]]
            fresh = {"planets": [],"campaigns": [],"dispatches": []}
            with patch.object(data,"SITE_ROOT",folder), \
                 patch.object(data,"fetch_official",return_value=fresh), \
                 patch.object(data,"fetch_companion",return_value=None), \
                 patch.object(data,"fetch_hd2dev",return_value=None), \
                 patch.object(data,"fetch_json",return_value={"data":stats}) as fetch, \
                 patch.object(data,"_load_snapshot",return_value={}), \
                 patch.object(data,"_save_snapshot"):
                data.main()
            fetch.assert_called_once()
            result=json.loads(target.read_text(encoding="utf-8"))
            history=json.loads((target.parent/"data/history/player_distribution.json").read_text(encoding="utf-8"))
            self.assertEqual(len(history["history"]),3)
            latest=history["history"][-1]
            self.assertEqual(result["player_distribution"]["updatedAt"],latest["timestamp"])
            self.assertEqual(result["player_distribution"]["total"],latest["totalPlayers"])
            self.assertEqual(result["impactMultiplier"],latest["impactMultiplier"])

    def test_fetch_once_supplies_players_and_impact_from_one_frame(self):
        rows = [{"timestampUtc": record(0)["timestamp"], "totalPlayerCount": 12,
                 "playerCountHumans": 2, "playerCountTerminids": 10, "impactMultiplier": .03}]
        with patch.object(data, "fetch_json", return_value={"data": rows}) as fetch:
            history = data.merge_player_history({"history": []}, data.fetch_player_records())
        fetch.assert_called_once()
        latest = history["history"][-1]
        self.assertEqual(data.distribution_from_record(latest)["total"], 12)
        self.assertEqual(latest["impactMultiplier"], .03)

    def test_all_missing_frames_are_backfilled_and_sorted(self):
        history = data.merge_player_history({"history": [record(0)]}, [record(45),record(15),record(30)])
        self.assertEqual([r["timestamp"] for r in history["history"]], [record(i)["timestamp"] for i in [0,15,30,45]])

    def test_older_response_keeps_newest_local_frame(self):
        history = data.merge_player_history({"history": [record(60, 20)]}, [record(0)])
        self.assertEqual(history["history"][-1]["totalPlayers"], 20)
        self.assertEqual(data.distribution_from_record(history["history"][-1])["updatedAt"], record(60)["timestamp"])

    def test_repeated_and_equivalent_timezone_frames_are_not_duplicated(self):
        old = record(0)
        new = {**old, "timestamp": "2026-10-13T08:00:00+08:00", "totalPlayers": 20}
        history = data.merge_player_history({"history": [old]}, [new,new])
        self.assertEqual(len(history["history"]),1)
        self.assertEqual(history["history"][0]["totalPlayers"],20)

    def test_network_failure_retains_existing_statistical_cohort(self):
        with patch.object(data,"fetch_json", side_effect=TimeoutError("fixture timeout")):
            history = data.merge_player_history({"history": [record(0)]}, data.fetch_player_records())
        latest = history["history"][-1]
        self.assertEqual(latest["impactMultiplier"], .02)
        self.assertEqual(data.distribution_from_record(latest)["total"], 10)

    def test_retention_uses_newest_frames_not_insertion_order(self):
        history = data.merge_player_history({"history": []}, [record(i) for i in reversed(range(400))])
        self.assertEqual(len(history["history"]),288)
        self.assertEqual(history["history"][0]["timestamp"],record(112)["timestamp"])
        self.assertEqual(history["history"][-1]["timestamp"],record(399)["timestamp"])

if __name__ == "__main__":
    unittest.main()
