# -*- coding: utf-8 -*-
"""把武器 icon 从 Special:FilePath 换成直接可加载的 /images/ 缩略图 URL。
优先 /images/thumb/<file>/240px-<file>，HEAD 校验失败则回退 /images/<file>（原图）。
"""
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
    path = os.path.join(BASE, "weapons.json")
    with open(path, encoding="utf-8") as f:
        d = json.load(f)
    ws = d["weapons"]
    stats = {"thumb": 0, "full": 0, "keep": 0, "broken": []}
    for i, w in enumerate(ws):
        icon = w.get("icon") or ""
        if not icon:
            continue
        fn = None
        if "Special:FilePath/" in icon:
            fn = icon.split("Special:FilePath/")[1].split("?")[0]
        else:
            # 已是 /images/ 形式：取文件名
            base = icon.split("?")[0]
            if "/thumb/" in base:
                parts = base.split("/thumb/")[1].split("/")
                for p in parts:
                    if "." in p and "px-" not in p:
                        fn = p
                        break
                if not fn:
                    fn = parts[0]
            else:
                fn = base.rsplit("/", 1)[-1]
        if not fn:
            stats["keep"] += 1
            continue
        thumb = "https://helldivers.wiki.gg/images/thumb/%s/240px-%s" % (fn, fn)
        full = "https://helldivers.wiki.gg/images/%s" % fn
        if head_ok(thumb):
            w["icon"] = thumb
            stats["thumb"] += 1
        elif head_ok(full):
            w["icon"] = full
            stats["full"] += 1
        else:
            stats["keep"] += 1
            stats["broken"].append({"id": w["id"], "fn": fn})
        if i % 20 == 0:
            print("  %d/%d thumb=%d full=%d" % (i, len(ws), stats["thumb"], stats["full"]), flush=True)
        time.sleep(0.05)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("DONE", stats, flush=True)


if __name__ == "__main__":
    main()
