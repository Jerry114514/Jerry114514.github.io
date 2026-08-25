# -*- coding: utf-8 -*-
"""为敌人补充 image_thumb（240px 缩略图），目录页用；详情页大图继续用 image 原图。"""
import json, sys, urllib.request, time, os
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
BASE = r"E:\GitLoadWareHouse\Jerry114514.github.io\HD2_Wiki\data\wiki\zh"
H = {"User-Agent": "Mozilla/5.0 HD2-Wiki/1.0"}


def head_ok(url):
    try:
        req = urllib.request.Request(url, method="HEAD", headers=H)
        resp = urllib.request.urlopen(req, timeout=12)
        return resp.status == 200
    except Exception:
        return False


def main():
    path = os.path.join(BASE, "enemies.json")
    with open(path, encoding="utf-8") as f:
        d = json.load(f)
    es = d["enemies"]
    stats = {"thumb": 0, "keep_full": 0, "none": 0}
    for i, e in enumerate(es):
        img = e.get("image") or ""
        if not img:
            e["image_thumb"] = None
            stats["none"] += 1
            continue
        base = img.split("?")[0]
        fn = base.rsplit("/", 1)[-1]
        thumb = "https://helldivers.wiki.gg/images/thumb/%s/240px-%s" % (fn, fn)
        if head_ok(thumb):
            e["image_thumb"] = thumb
            stats["thumb"] += 1
        else:
            e["image_thumb"] = img
            stats["keep_full"] += 1
        if i % 20 == 0:
            print("  %d/%d %s" % (i, len(es), stats), flush=True)
        time.sleep(0.03)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("DONE", stats, flush=True)


if __name__ == "__main__":
    main()
