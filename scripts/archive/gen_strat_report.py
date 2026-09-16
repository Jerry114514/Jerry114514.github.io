# -*- coding: utf-8 -*-
"""生成战略配备抓取报告"""
import json, io, sys, os, time
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass
BASE = r"E:\GitLoadWareHouse\Jerry114514.github.io\HD2_Wiki\data\wiki\zh"
d = json.load(open(os.path.join(BASE, "stratagems_full.json"), encoding="utf-8"))
items = d["stratagems"]
# 统计图标状态
local_icon = [s for s in items if s.get("image", "").startswith("/assets")]
ext_icon = [s for s in items if s.get("image", "").startswith("http")]
no_icon = [s for s in items if not s.get("image")]
report = {
    "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "total": len(items),
    "matched": len(items),
    "unmatched": [],
    "icon_downloaded": len(local_icon),
    "icon_external_fallback": len(ext_icon),
    "icon_missing": len(no_icon),
    "categories": {},
    "note": "图标本地下载受Wiki热链保护(HTTP 403)，保留外部URL作为回退。后续可通过代理或手动下载镜像。",
}
from collections import Counter
cats = Counter(s["category"] for s in items)
report["categories"] = dict(cats)
with open(os.path.join(BASE, "stratagems_fetch_report.json"), "w", encoding="utf-8") as f:
    json.dump(report, f, ensure_ascii=False, indent=2)
    f.write("\n")
print("报告已生成:", os.path.join(BASE, "stratagems_fetch_report.json"))
print(json.dumps(report, ensure_ascii=False, indent=2))