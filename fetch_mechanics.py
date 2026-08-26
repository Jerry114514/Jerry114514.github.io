# -*- coding: utf-8 -*-
"""抓取游戏机制页面（Damage / Difficulty / Status Effects / Galactic War）
输出：HD2_Wiki/data/wiki/zh/mechanics/{id}.json（章节树结构）"""
import json, urllib.request, urllib.parse, re, sys, time, html as html_mod, os
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
API = "https://helldivers.wiki.gg/api.php"
HEADERS = {"User-Agent": "Mozilla/5.0 HD2-Wiki/1.0"}
BASE = r"E:\GitLoadWareHouse\Jerry114514.github.io\HD2_Wiki\data\wiki\zh\mechanics"

PAGES = [
    ("damage", "Damage", "伤害机制", "伤害计算、穿透机制、部位破坏等核心战斗规则详解", "⚔️"),
    ("difficulty", "Difficulty", "难度系统", "难度等级、任务变化、奖励影响", "📊"),
    ("galactic_war", "Galactic War", "银河战争机制", "解放战役、防御战役、行星衰减等", "🌌"),
    ("status_effects", "Status Effects", "状态效果", "硬直、火焰、毒气、眩晕等效果详解", "🔥"),
]

def api(params):
    u = API + "?" + urllib.parse.urlencode(params)
    r = urllib.request.Request(u, headers=HEADERS)
    return json.loads(urllib.request.urlopen(r, timeout=30).read())

def strip_html(s):
    if not s: return ""
    s = re.sub(r"<br\s*/?>", " ", s)
    s = re.sub(r"<[^>]+>", " ", s)
    s = html_mod.unescape(s)
    return re.sub(r"\s+", " ", s).strip()

def clean_title(title):
    t = strip_html(title)
    t = re.sub(r"\[\s*edit(?:\s*\|?\s*edit\s*source)?\s*\]", "", t).strip()
    return t

def parse_sections(html):
    """解析 h2/h3/h4 章节树"""
    # 先找所有标题位置
    headings = []
    for m in re.finditer(r"<h([234])[^>]*>(.*?)</h\1>", html, re.S):
        raw = m.group(2)
        # 提取 id：优先从 <span class="mw-headline" id="xxx"> 取
        id_m = re.search(r'<span[^>]*\sid="([^"]+)"', raw)
        hid = id_m.group(1) if id_m else ""
        title = clean_title(raw)
        if not title or title in ("Contents", "edit", "edit source"):
            continue
        headings.append({
            "level": int(m.group(1)),
            "id": hid,
            "title": title,
            "pos": m.start(),
        })

    def slugify(s):
        s = s.lower().replace(" ", "_").replace("-", "_")
        s = re.sub(r"[^a-z0-9_\u4e00-\u9fff]+", "_", s)
        return s.strip("_")

    # 构建章节树
    def build_tree(idx, end_pos):
        items = []
        i = idx
        while i < len(headings):
            h = headings[i]
            if h["level"] == 2:
                # 取该章节的 HTML 内容（从当前 h2 到下一个 h2）
                next_pos = headings[i + 1]["pos"] if i + 1 < len(headings) else len(html)
                content = html[h["pos"]:next_pos]
                # 清理标题和编辑链接
                content = re.sub(r"<h2[^>]*>.*?</h2>", "", content, count=1, flags=re.S)
                # 构建子章节（h3/h4）
                sub = []
                j = i + 1
                while j < len(headings) and headings[j]["level"] > 2:
                    sub_h = headings[j]
                    sub_next = headings[j + 1]["pos"] if j + 1 < len(headings) and headings[j + 1]["level"] > 2 else (headings[i + 1]["pos"] if i + 1 < len(headings) else len(html))
                    sub_content = html[sub_h["pos"]:sub_next]
                    sub_content = re.sub(r"<h[34][^>]*>.*?</h[34]>", "", sub_content, count=1, flags=re.S)
                    entry = {"level": sub_h["level"], "id": sub_h["id"], "title": sub_h["title"], "content": sub_content.strip()}
                    if sub_h["level"] == 3:
                        # 检查是否有 h4 子章节
                        k = j + 1
                        while k < len(headings) and headings[k]["level"] > 3:
                            sub4 = headings[k]
                            sub4_next = headings[k + 1]["pos"] if k + 1 < len(headings) and headings[k + 1]["level"] > 3 else (headings[j + 1]["pos"] if j + 1 < len(headings) else len(html))
                            sub4_content = html[sub4["pos"]:sub4_next]
                            sub4_content = re.sub(r"<h4[^>]*>.*?</h4>", "", sub4_content, count=1, flags=re.S)
                            if "subsections" not in entry:
                                entry["subsections"] = []
                            entry["subsections"].append({"level": 4, "id": sub4["id"], "title": sub4["title"], "content": sub4_content.strip()})
                            k += 1
                        j = k
                    else:
                        j += 1
                    sub.append(entry)
                items.append({"level": 2, "id": h["id"], "title": h["title"], "content": content.strip(), "subsections": sub})
                i = j
            else:
                break
        return items, i

    root, _ = build_tree(0, len(html))
    return root

def parse_toc(sections):
    toc = []
    def walk(items):
        for s in items:
            toc.append({"level": s["level"], "id": s["id"], "title": s["title"]})
            if s.get("subsections"):
                walk(s["subsections"])
    walk(sections)
    return toc

def main():
    os.makedirs(BASE, exist_ok=True)
    index_pages = []
    for pid, en, zh, desc, icon in PAGES:
        d = api({"action": "parse", "page": en, "prop": "text", "format": "json"})
        html = d["parse"]["text"]["*"]
        sections = parse_sections(html)
        toc = parse_toc(sections)
        data = {
            "id": pid,
            "title": zh,
            "title_en": en,
            "description": desc,
            "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "sections": sections,
            "toc": toc,
            "source": "https://helldivers.wiki.gg/wiki/" + en.replace(" ", "_"),
        }
        if pid == "galactic_war":
            data["id"] = "galactic_war"
            data["title_en"] = "Galactic War"
        with open(os.path.join(BASE, pid + ".json"), "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")
        index_pages.append({"id": pid, "title": zh, "title_en": data["title_en"], "description": desc, "icon": icon})
        print("%s: %d 章节, %d 目录项" % (pid, len(sections), len(toc)), flush=True)
        time.sleep(0.5)

    # 生成 index.json
    index = {"pages": index_pages, "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    with open(os.path.join(BASE, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("完成", flush=True)

if __name__ == "__main__":
    main()