# -*- coding: utf-8 -*-
"""merge_translations.py 的 tasks 合并与兼容性测试（离线，临时目录）"""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import merge_translations as mt

TASKS = {
    "id32": 568917260, "source": "arrowhead_official",
    "source_version": "2026-10-24T12:12:24Z",
    "progress_semantics": "progress[i] 为该任务当前计数（2026-10-24 官方接口实测核对）",
    "items": [
        {"index": 0, "action": "击杀", "faction_name": "终结族", "goal": 300000000,
         "progress": 528355,
         "requirement": {"type": "equipment", "id": 3827587060, "en": "HMG EMPLACEMENT",
                         "name": "重机枪部署支架", "name_source": "site_terms(short_form)"}},
        {"index": 1, "action": "击杀", "faction_name": "光能者", "goal": 65000000,
         "progress": 278513,
         "requirement": {"type": "equipment", "id": 376960160, "en": "Anti-Materiel Rifle",
                         "name": "反器材步枪", "name_source": "site_terms(prefix_stripped)"}},
        {"index": 2, "action": "击杀", "faction_name": "机器人", "goal": 50000000,
         "progress": 28927,
         "requirement": {"type": "equipment", "id": 2197477188, "en": "ORBITAL RAILCANNON STRIKE",
                         "name": "轨道炮攻击", "name_source": "site_terms"}},
    ],
}


class MergeTranslationsTests(unittest.TestCase):
    def _run_merge(self, data, trans):
        """在临时目录里跑一次文件级合并（mock 路径，不碰仓库文件）"""
        with tempfile.TemporaryDirectory() as tmp:
            data_p = Path(tmp) / "data.json"
            trans_p = Path(tmp) / "TransNews.json"
            data_p.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
            trans_p.write_text(json.dumps(trans, ensure_ascii=False), encoding="utf-8")
            with patch.object(mt, "DATA_FILE", str(data_p)), \
                 patch.object(mt, "TRANS_FILE", str(trans_p)):
                mt.main()
            return json.loads(data_p.read_text(encoding="utf-8"))

    def test_tasks_merged_with_chinese_names(self):
        data = {"major_order": {"id32": 568917260, "translated_brief": "旧简报"}, "news": []}
        trans = {"mo_brief": {"id32": 568917260, "title": "重要指令",
                              "original": "Kill...", "translated": "击杀指定敌人……",
                              "translated_at": "2026-10-24T12:12:24Z", "text_source": "official_zh"},
                 "items": [], "tasks": TASKS}
        out = self._run_merge(data, trans)
        tasks = out["major_order"]["tasks"]
        self.assertEqual(tasks["items"][0]["requirement"]["name"], "重机枪部署支架")
        self.assertEqual(tasks["items"][1]["requirement"]["name"], "反器材步枪")
        self.assertEqual(tasks["items"][2]["requirement"]["name"], "轨道炮攻击")
        self.assertEqual(out["major_order"]["translated_brief"], "击杀指定敌人……")

    def test_legacy_transnews_without_tasks_still_compatible(self):
        """旧 TransNews（无 tasks 键）：major_order 结构保持旧四键，无 tasks"""
        data = {"major_order": {"id32": 1, "translated_brief": "旧"}, "news": []}
        trans = {"mo_brief": {"id32": 1, "title": "重要指令", "original": "EN", "translated": "官中",
                              "translated_at": "t"}, "items": [{"id": 2, "translated": "新闻"}]}
        out = self._run_merge(data, trans)
        self.assertNotIn("tasks", out["major_order"])
        # 旧四键必须完整保留（text_source 等附加元数据允许存在，消费方按需读取）
        for key in ("title", "brief", "translated_brief", "translated_at"):
            self.assertIn(key, out["major_order"])
        self.assertEqual(out["news"], [{"id": 2, "translated": "新闻"}])

    def test_cross_order_tasks_not_merged(self):
        data = {"major_order": {"id32": 42, "translated_brief": "新指令简报"}, "news": []}
        trans = {"mo_brief": {"id32": 42, "translated": "新简报"}, "items": [],
                 "tasks": {"id32": 568917260, "items": TASKS["items"]}}
        out = self._run_merge(data, trans)
        self.assertNotIn("tasks", out["major_order"], "跨指令旧 tasks 不得合并到新指令")

    def test_matching_prev_tasks_reused_when_new_tasks_stale(self):
        prev_tasks = {"id32": 42, "items": TASKS["items"]}
        data = {"major_order": {"id32": 42, "tasks": prev_tasks}, "news": []}
        trans = {"mo_brief": {"id32": 42, "translated": "新简报"}, "items": [],
                 "tasks": {"id32": 568917260, "items": TASKS["items"]}}
        out = self._run_merge(data, trans)
        self.assertEqual(out["major_order"]["tasks"]["id32"], 42)

    def test_mismatched_prev_tasks_not_reused(self):
        data = {
            "major_order": {
                "id32": 42,
                "tasks": {"id32": 41, "items": TASKS["items"]},
            },
            "news": [],
        }
        trans = {"mo_brief": {"id32": 42, "translated": "新简报"}, "items": [],
                 "tasks": {"id32": 568917260, "items": TASKS["items"]}}
        out = self._run_merge(data, trans)
        self.assertNotIn("tasks", out["major_order"],
                         "旧 tasks 自身也不匹配当前 MO 时必须降级，不能沿用")

    def test_transnews_missing_degrades_cleanly(self):
        with tempfile.TemporaryDirectory() as tmp:
            data_p = Path(tmp) / "data.json"
            data_p.write_text(json.dumps({"major_order": {"translated_brief": "旧"}, "news": []},
                                         ensure_ascii=False), encoding="utf-8")
            with patch.object(mt, "DATA_FILE", str(data_p)), \
                 patch.object(mt, "TRANS_FILE", str(Path(tmp) / "missing.json")):
                mt.main()
            out = json.loads(data_p.read_text(encoding="utf-8"))
        self.assertEqual(out["major_order"]["translated_brief"], "")
        self.assertEqual(out["news"], [])


if __name__ == "__main__":
    unittest.main()
