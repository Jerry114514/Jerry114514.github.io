# -*- coding: utf-8 -*-
"""为所有战略配备添加 detailed_stats 字段"""
import json, io, sys, os, time, importlib.util
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

# 加载解析器模块
spec = importlib.util.spec_from_file_location("fds", r"E:\GitLoadWareHouse\Jerry114514.github.io\fetch_detailed_stats.py")
fds = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fds)

BASE = r"E:\GitLoadWareHouse\Jerry114514.github.io\HD2_Wiki\data\wiki\zh"
OUT = os.path.join(BASE, "stratagems_full.json")
d = json.load(open(OUT, encoding="utf-8"))
items = d["stratagems"]
print(f"总 {len(items)} 个，开始获取 detailed_stats...", flush=True)

ok = 0
none = 0
for i, s in enumerate(items):
    title = s.get("name_en") or s["id"]
    ds = fds.get_detailed_stats(title)
    if ds:
        s["detailed_stats"] = ds
        ok += 1
    else:
        s["detailed_stats"] = None
        none += 1
    if i % 5 == 0:
        print(f"  {i}/{len(items)} (ok={ok}, none={none})", flush=True)
    time.sleep(0.3)

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(d, f, ensure_ascii=False, indent=2)
    f.write("\n")
print(f"完成: 有detailed_stats={ok}, null={none}", flush=True)