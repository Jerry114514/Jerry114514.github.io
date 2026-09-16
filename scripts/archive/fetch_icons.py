# -*- coding: utf-8 -*-
"""为武器(weapons.json)与战略配备(stratagems_full.json)补充 icon 字段
- 武器：从页面 druid-container 信息框区域取第一张 /images/ 图片（优先文件名匹配页面标题）
- 战略配备：直接用已有的 image 字段（..._Stratagem_Icon_Background.svg），补充 icon 字段
- 若取不到则 icon=null（前端显示占位图）
- 生成抓取报告 fetch_reports/icons_fetch_report.json
"""
import json, urllib.request, urllib.parse, sys, re, time, os
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

API = "https://helldivers.wiki.gg/api.php"
HEADERS = {"User-Agent": "Mozilla/5.0 HD2-Wiki/1.0"}
BASE = r"E:\GitLoadWareHouse\Jerry114514.github.io\HD2_Wiki\data\wiki\zh"


def api(params):
    url = API + "?" + urllib.parse.urlencode(params)
    r = urllib.request.Request(url, headers=HEADERS)
    return json.loads(urllib.request.urlopen(r, timeout=20).read())


def fetch_page_html(title):
    d = api({"action": "parse", "page": title, "prop": "text", "format": "json"})
    if "parse" not in d:
        return None
    return d["parse"]["text"]["*"]


def extract_icon_from_html(html, page_title):
    """取信息框区域第一张 /images/ 图片，优先文件名匹配页面标题"""
    idx = html.find("druid-container")
    if idx < 0:
        idx = 0
    seg = html[idx:idx + 60000]
    imgs = re.findall(r'src="(/images/[^"]+)"', seg)
    if not imgs:
        return None
    slug = page_title.replace(" ", "_")
    # 优先 basename 包含页面标题（如 AR-23_Liberator_Primary_Render.png 含 AR-23_Liberator）
    for u in imgs:
        base = u.rsplit("/", 1)[-1].split("?")[0]
        if slug.lower() in base.lower():
            return "https://helldivers.wiki.gg" + u
    return "https://helldivers.wiki.gg" + imgs[0]


def normalize_icon(url):
    """非 SVG 图片统一为 240px 缩略图（Special:FilePath），避免直接引用数百 KB 的原图"""
    if not url:
        return url
    path = url.split("?")[0]
    if path.lower().endswith(".svg"):
        return url
    fn = None
    if "/thumb/" in path:
        parts = path.split("/thumb/")[1].split("/")
        for p in parts:
            if "." in p and "px-" not in p and "px_" not in p:
                fn = p
                break
        if not fn and parts:
            fn = parts[0]
    else:
        fn = path.rsplit("/", 1)[-1]
    if not fn:
        return url
    return "https://helldivers.wiki.gg/wiki/Special:FilePath/" + urllib.parse.quote(fn.replace(" ", "_")) + "?width=240"


def add_icons_weapons():
    path = os.path.join(BASE, "weapons.json")
    with open(path, encoding="utf-8") as f:
        d = json.load(f)
    ws = d["weapons"]
    report = {"ok": 0, "null": 0, "errors": [], "items": {}}
    for i, w in enumerate(ws):
        title = w.get("name_en") or w.get("name")
        if not title:
            w["icon"] = None
            report["null"] += 1
            report["items"][w["id"]] = {"status": "no_title"}
            continue
        try:
            html = fetch_page_html(title)
            if html is None:
                w["icon"] = None
                report["null"] += 1
                report["items"][w["id"]] = {"status": "parse_failed"}
            else:
                icon = extract_icon_from_html(html, title)
                w["icon"] = normalize_icon(icon)
                if icon:
                    report["ok"] += 1
                    report["items"][w["id"]] = {"status": "ok", "url": icon}
                else:
                    report["null"] += 1
                    report["items"][w["id"]] = {"status": "no_image"}
        except Exception as ex:
            w["icon"] = None
            report["null"] += 1
            report["errors"].append({"id": w["id"], "title": title, "error": str(ex)})
            report["items"][w["id"]] = {"status": "error"}
        if i % 10 == 0:
            print("  weapons %d/%d" % (i, len(ws)), flush=True)
        time.sleep(0.2)
    d["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    with open(path, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
        f.write("\n")
    return report


def add_icons_stratagems():
    path = os.path.join(BASE, "stratagems_full.json")
    with open(path, encoding="utf-8") as f:
        d = json.load(f)
    ss = d["stratagems"] if isinstance(d, dict) and "stratagems" in d else d
    report = {"ok": 0, "null": 0, "errors": [], "items": {}}
    for i, s in enumerate(ss):
        img = s.get("image")
        if img:
            s["icon"] = img
            report["ok"] += 1
            report["items"][s["id"]] = {"status": "ok", "url": img}
        else:
            title = s.get("name_en") or s.get("name") or s["id"]
            try:
                html = fetch_page_html(title)
                if html:
                    icon = extract_icon_from_html(html, title)
                    s["icon"] = icon
                    s["image"] = icon
                    if icon:
                        report["ok"] += 1
                        report["items"][s["id"]] = {"status": "ok", "url": icon}
                    else:
                        report["null"] += 1
                        report["items"][s["id"]] = {"status": "no_image"}
                else:
                    s["icon"] = None
                    report["null"] += 1
                    report["items"][s["id"]] = {"status": "parse_failed"}
            except Exception as ex:
                s["icon"] = None
                report["null"] += 1
                report["errors"].append({"id": s["id"], "title": title, "error": str(ex)})
                report["items"][s["id"]] = {"status": "error"}
        if i % 10 == 0:
            print("  strats %d/%d" % (i, len(ss)), flush=True)
        time.sleep(0.2)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
        f.write("\n")
    return report


def main():
    wrep = add_icons_weapons()
    srep = add_icons_stratagems()
    report = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source": "https://helldivers.wiki.gg",
        "weapons": wrep,
        "stratagems": srep,
    }
    os.makedirs(os.path.join(BASE, "fetch_reports"), exist_ok=True)
    with open(os.path.join(BASE, "fetch_reports", "icons_fetch_report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("武器: ok=%d null=%d err=%d" % (wrep["ok"], wrep["null"], len(wrep["errors"])), flush=True)
    print("战备: ok=%d null=%d err=%d" % (srep["ok"], srep["null"], len(srep["errors"])), flush=True)


if __name__ == "__main__":
    main()
