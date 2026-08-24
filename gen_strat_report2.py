# -*- coding: utf-8 -*-
"""生成战备抓取报告（沿用现有位置）"""
import json, io, sys, os, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
BASE = r"E:\GitLoadWareHouse\Jerry114514.github.io\HD2_Wiki\data\wiki\zh"
d = json.load(open(os.path.join(BASE, "stratagems_full.json"), encoding="utf-8"))
items = d["stratagems"]
ok = [s for s in items if s.get("detailed_stats")]
null = [s for s in items if not s.get("detailed_stats")]
report = {
    "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "total": len(items),
    "with_detailed_stats": len(ok),
    "null": len(null),
    "null_list": [s["id"] for s in null],
    "attack_type_stats": {},
    "attack_count_by_stratagem": {},
    "note": "全页扫描模式 + spray/beam/arc/damage 类型支持（2026-08-24 修复）",
}
from collections import Counter
type_counter = Counter()
for s in ok:
    atk = s["detailed_stats"].get("attacks", [])
    report["attack_count_by_stratagem"][s["id"]] = len(atk)
    for a in atk:
        type_counter[a.get("type", "?")] += 1
report["attack_type_stats"] = dict(type_counter)
with open(os.path.join(BASE, "stratagems_fetch_report.json"), "w", encoding="utf-8") as f:
    json.dump(report, f, ensure_ascii=False, indent=2)
    f.write("\n")
print("报告已生成")
print("总数:", report["total"], "有DS:", report["with_detailed_stats"], "null:", report["null"])
print("攻击类型:", report["attack_type_stats"])