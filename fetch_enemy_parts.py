# -*- coding: utf-8 -*-
"""抓取敌人部位数据 v2（丰富格式）
为每个敌人（enemies.json 中已有条目）抓取可攻击部位列表：
part_id / name / name_en / health / armor_level / location / durable /
percent_to_main / overflow_cap / constitution / fatal / is_weak_point / image / count

- 唯一数据源：https://helldivers.wiki.gg/wiki/{EnemyName} 页面的部位数据表格
- 表头列序按实际页面动态映射（Health/AV/Location/Durable/% To Main/Overflow Cap?/Constitution/Fatal?/ExDR）
- 复数/数量引用处理：(2)/(4) 保留数量到 count，part_id 用单数化后的唯一标识
- 生成抓取报告 fetch_reports/enemies_parts_fetch_report.json
- 生成部位术语表 术语对照表_部位.md（供用户校对/填汉化）
"""
import json, urllib.request, urllib.parse, sys, re, time, html as html_mod, os
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

API = "https://helldivers.wiki.gg/api.php"
HEADERS = {"User-Agent": "Mozilla/5.0 HD2-Wiki/1.0"}
BASE = r"E:\GitLoadWareHouse\Jerry114514.github.io\HD2_Wiki\data\wiki\zh"

# 常见部位汉化（可编辑；未收录的保留英文原名，供术语表校对后补填）
CN_PART = {
    "main": "主体", "head": "头部", "helmet": "头盔", "torso": "躯干",
    "torso armor": "躯干装甲", "leg": "腿部", "legs": "腿部", "arm": "手臂",
    "arms": "手臂", "claw": "利爪", "claws": "利爪", "mandible": "大颚",
    "mandibles": "大颚", "eye": "眼睛", "eyes": "眼睛", "wing": "翅膀",
    "wings": "翅膀", "tail": "尾巴", "abdomen": "腹部", "back": "背部",
    "head armor": "头部装甲", "sac": "囊体", "bile sac": "胆液囊",
    "vent": "排气口", "turret": "炮塔", "barrel": "炮管", "cannon": "加农炮",
    "shoulder": "肩部", "pauldron": "肩甲", "pauldrons": "肩甲", "muzzle": "枪口",
    "generator": "发电机", "engine": "引擎", "thruster": "推进器", "blade": "刀刃",
    "armor": "装甲", "fabricator": "制造机", "fuel tank": "燃料箱", "fuel": "燃料箱",
    "backpack": "背包", "camera": "摄像头", "antenna": "天线", "joint": "关节",
    "leg joint": "腿部关节", "neck": "颈部", "jaw": "下颚", "mouth": "口部",
    "brain": "大脑", "orifice": "孔洞", "gland": "腺体", "artery": "动脉",
    "exposed": "暴露部位", "weak point": "弱点", "weak spot": "弱点",
    "horn": "角", "horns": "角", "spike": "尖刺", "spikes": "尖刺",
    "tentacle": "触手", "tentacles": "触手", "hand": "手", "hands": "手",
    "foot": "脚", "feet": "脚", "fin": "鳍", "fins": "鳍", "ear": "耳朵",
    "ears": "耳朵", "headlights": "车灯", "antennae": "触角", "pedipalp": "须肢",
    "pedipalps": "须肢", "shell": "甲壳", "carapace": "甲壳", "hive": "蜂巢",
    "bulwark": "盾牌", "shield": "护盾", "banner": "旗帜", "plate": "装甲板",
    "core": "核心", "power core": "动力核心", "battery": "电池", "capacitor": "电容器",
    "sensor": "传感器", "sensors": "传感器", "speaker": "扬声器", "horn(喇叭)": "喇叭",
    "intake": "进气口", "exhaust": "排气口", "booster": "助推器", "propeller": "螺旋桨",
    "rotor": "旋翼", "landing gear": "起落架", "cockpit": "座舱", "canopy": "座舱盖",
    "radar": "雷达", "dish": "天线锅", "emitter": "发射器", "lens": "透镜",
    "lenses": "透镜", "fuse": "保险丝", "wire": "电线", "cable": "电缆",
    "pipe": "管道", "pipes": "管道", "valve": "阀门", "pump": "泵",
    "tank": "罐体", "reservoir": "储液罐", "drum": "弹鼓", "magazine": "弹匣",
    "chamber": "弹膛", "breech": "炮闩", "bolt": "枪机", "slide": "套筒",
    "grip": "握把", "stock": "枪托", "trigger": "扳机", "sight": "准星",
    "scope": "瞄具", "barrel tip": "枪口", "suppressor": "消音器",
    "launcher": "发射器", "pod": "荚舱", "pods": "荚舱", "leg armor": "腿部装甲",
    "head piece": "头部组件", "face": "面部", "faceplate": "面甲", "visor": "护目镜",
    "optic": "光学组件", "crown": "头冠", "crest": "冠饰", "mane": "鬃毛",
    "gullet": "食道", "stomach": "胃部", "gut": "内脏", "intestines": "肠",
    "heart": "心脏", "lungs": "肺", "spine": "脊椎", "ribcage": "肋骨",
    "pelvis": "骨盆", "hip": "髋部", "hips": "髋部", "knee": "膝盖",
    "knees": "膝盖", "elbow": "肘部", "elbows": "肘部", "wrist": "腕部",
    "wrist": "腕部", "ankle": "踝部", "ankles": "踝部", "hoof": "蹄",
    "hooves": "蹄", "digit": "趾", "digits": "趾", "claw tip": "爪尖",
    "fang": "毒牙", "fangs": "毒牙", "stinger": "尾刺", "ovipositor": "产卵管",
    "web": "网", "silk": "丝腺", "spinneret": "纺丝器", "thorax": "胸部",
    "cephalothorax": "头胸部", "pincer": "螯", "pincers": "螯", "chelae": "螯",
    "antenna": "天线", "proboscis": "口器", "stylet": "口针", "rostrum": "喙",
    "beak": "喙", "bill": "喙", "plume": "羽饰", "frill": "褶边",
    "dorsal fin": "背鳍", "gill": "鳃", "gills": "鳃", "scale": "鳞片",
    "scales": "鳞片", "quill": "刺", "quills": "刺", "tusk": "獠牙",
    "tusks": "獠牙", "maw": "巨口", "gullet": "咽喉", "crop": "嗉囊",
    "gizzard": "砂囊", "venom sac": "毒囊", "poison sac": "毒囊",
}

# 复数 → 单数（用于 part_id 唯一标识）
SINGULAR = {
    "legs": "leg", "arms": "arm", "claws": "claw", "mandibles": "mandible",
    "tentacles": "tentacle", "eyes": "eye", "wings": "wing", "hands": "hand",
    "feet": "foot", "horns": "horn", "spikes": "spike", "fins": "fin",
    "ears": "ear", "antennae": "antenna", "pedipalps": "pedipalp",
    "hooves": "hoof", "fangs": "fang", "tusks": "tusk", "pincers": "pincer",
    "gills": "gills", "scales": "scale", "quills": "quill", "digits": "digit",
    "elbows": "elbow", "knees": "knee", "ankles": "ankle", "hips": "hip",
    "pods": "pod", "lenses": "lens", "sensors": "sensor", "pipes": "pipe",
}

# 弱点常见判断关键词（命中即 is_weak_point=true）
WEAK_KEYWORDS = (
    "weak point", "weak spot", "eye", "gland", "sac", "orifice", "jaw",
    "brain", "mouth", "abdomen", "vent", "artery", "exposed", "face",
)


def api(params):
    url = API + "?" + urllib.parse.urlencode(params)
    r = urllib.request.Request(url, headers=HEADERS)
    return json.loads(urllib.request.urlopen(r, timeout=20).read())


def strip_html(s):
    if not s:
        return ""
    s = re.sub(r"<br\s*/?>", " ", s)
    s = re.sub(r"<[^>]+>", " ", s)
    s = html_mod.unescape(s)
    return re.sub(r"\s+", " ", s).strip()


def slugify(s):
    s = s.lower().replace(" ", "_").replace("/", "_")
    s = re.sub(r"[^a-z0-9_]+", "_", s)
    return s.strip("_")


def singular_last_word(name):
    """把最后一个词做单数化（Legs -> leg），用于 part_id"""
    words = name.split()
    if not words:
        return name
    last = words[-1]
    low = last.lower()
    if low in SINGULAR:
        words[-1] = SINGULAR[low]
    return " ".join(words)


def to_int(v):
    if not v or v.strip() in ("-", "—", "None", "N/A"):
        return None
    return int(re.sub(r"[^\d]", "", v)) if re.search(r"\d", v) else None


def parse_parts_table(html):
    """按表头动态映射列，返回部位列表；无表则返回 None"""
    idx = html.find("Part Name")
    if idx < 0:
        return None
    tstart = html.rfind("<table", 0, idx)
    tend = html.find("</table>", idx)
    if tstart < 0 or tend < 0:
        return None
    table = html[tstart:tend + 8]
    rows = re.findall(r"<tr>(.*?)</tr>", table, re.S)
    if not rows:
        return None
    hcells = re.findall(r"<(?:td|th)[^>]*>(.*?)</(?:td|th)>", rows[0], re.S)
    header = [re.sub(r"\d+$", "", strip_html(c)).strip() for c in hcells]
    col = {}
    for i, h in enumerate(header):
        hl = h.lower()
        if "name" not in col and "part" in hl:
            col["name"] = i
        elif "health" not in col and "health" in hl:
            col["health"] = i
        elif "av" not in col and hl in ("av", "armor", "armour", "armor level"):
            col["av"] = i
        elif "location" not in col and "location" in hl:
            col["location"] = i
        elif "durable" not in col and "durable" in hl:
            col["durable"] = i
        elif "pct" not in col and ("to main" in hl or "%" in hl or "main" in hl):
            col["pct"] = i
        elif "overflow" not in col and "overflow" in hl:
            col["overflow"] = i
        elif "constitution" not in col and "constitution" in hl:
            col["constitution"] = i
        elif "fatal" not in col and "fatal" in hl:
            col["fatal"] = i
        elif "exdr" not in col and "exdr" in hl:
            col["exdr"] = i
    if "name" not in col or "health" not in col:
        return None

    parts = []
    seen_ids = {}
    for row in rows[1:]:
        cells = re.findall(r"<(?:td|th)[^>]*>(.*?)</(?:td|th)>", row, re.S)
        if len(cells) < 2:
            continue

        def cell(key):
            i = col.get(key)
            if i is None or i >= len(cells):
                return ""
            return strip_html(cells[i])

        name_en = cell("name")
        if not name_en or name_en.lower() in ("part name",):
            continue

        # 部位示意图：优先 Location 列，其次 Part Name 列，再任意列（避开 AV 列的装甲图标）
        img = None
        prefer_idx = [col.get("location"), col.get("name")]
        ordered = [i for i in prefer_idx if i is not None and i < len(cells)] + \
                  [i for i in range(len(cells)) if i not in prefer_idx]
        for i in ordered:
            m = re.search(r'src="(/images/[^"]+)"', cells[i])
            if m:
                img = "https://helldivers.wiki.gg" + m.group(1)
                break

        health = to_int(cell("health"))
        armor_level = cell("av")
        location = cell("location")
        durable = cell("durable") or ""
        pct = cell("pct") or ""
        overflow = cell("overflow") or ""
        constitution = cell("constitution") or ""
        fatal_raw = (cell("fatal") or "").strip().lower()
        fatal = fatal_raw.startswith("yes") or fatal_raw in ("true", "y")

        # 数量 (N)
        count = None
        mcount = re.search(r"\((\d+)\)\s*$", name_en)
        if mcount:
            count = int(mcount.group(1))
        base_name = re.sub(r"\s*\(\d+\)\s*$", "", name_en).strip()

        # part_id：单数化 + slug
        pid = slugify(singular_last_word(base_name))
        if pid in seen_ids:
            seen_ids[pid] += 1
            pid = "%s_%d" % (pid, seen_ids[pid])
        else:
            seen_ids[pid] = 1

        # 弱点判断
        low = name_en.lower()
        is_wp = any(k in low for k in WEAK_KEYWORDS)

        # 显示名（汉化优先，未收录用英文）
        cn = CN_PART.get(pid) or CN_PART.get(base_name.lower()) or name_en

        parts.append({
            "part_id": pid,
            "name": cn,
            "name_en": name_en,
            "health": health,
            "armor_level": armor_level,
            "location": location,
            "durable": durable,
            "percent_to_main": pct,
            "overflow_cap": overflow,
            "constitution": constitution,
            "fatal": fatal,
            "is_weak_point": is_wp,
            "count": count,
            "image": img,
        })
    return parts


def gen_glossary(all_parts):
    """生成 术语对照表_部位.md，供用户校对/填汉化"""
    lines = [
        "# Helldivers 2 敌人部位术语对照表（送审版）",
        "> 版本：v1.0 送审 · " + time.strftime("%Y-%m-%d"),
        "> 数据源：helldivers.wiki.gg",
        "> 用途：enemies.json body_parts 的 name 字段汉化",
        "",
        "说明：自动汉化的常见部位已填入「中文」列；未收录的保留英文，请在「中文」列填写后告知应用。",
        "",
        "| 英文（name_en） | 中文（name） | part_id | 出现敌人数 | 备注 |",
        "|------|------|------|------|------|",
    ]
    stats = {}
    for pid, name_en, name in all_parts:
        key = name_en
        if key not in stats:
            stats[key] = {"pid": pid, "cn": name, "enemies": 0, "auto": name != name_en}
        stats[key]["enemies"] += 1
    for name_en, s in sorted(stats.items(), key=lambda x: x[1]["enemies"], reverse=True):
        note = "自动汉化" if s["auto"] else "待填"
        lines.append("| %s | %s | %s | %d | %s |" % (name_en, s["cn"], s["pid"], s["enemies"], note))
    lines.append("")
    with open(os.path.join(BASE, "术语对照表_部位.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def main():
    data_path = os.path.join(BASE, "enemies.json")
    with open(data_path, encoding="utf-8") as f:
        d = json.load(f)
    enemies = d["enemies"]
    print("敌人总数:", len(enemies), flush=True)

    report = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source": "https://helldivers.wiki.gg",
        "total_enemies": len(enemies),
        "enemies_with_parts": 0,
        "total_parts": 0,
        "results": {},
        "errors": [],
        "header_variants": {},
    }
    all_parts = []
    for i, e in enumerate(enemies):
        title = e["name"]
        try:
            res = api({"action": "parse", "page": title, "prop": "text", "format": "json"})
            if "parse" not in res:
                report["results"][e["id"]] = {"status": "parse_failed"}
                report["errors"].append({"id": e["id"], "name": title, "error": "no parse result"})
                e["body_parts"] = []
                time.sleep(0.25)
                continue
            html = res["parse"]["text"]["*"]
            parts = parse_parts_table(html)
            if parts is None:
                report["results"][e["id"]] = {"status": "no_table", "name": title}
                e["body_parts"] = []
            else:
                e["body_parts"] = parts
                report["enemies_with_parts"] += 1
                report["total_parts"] += len(parts)
                report["results"][e["id"]] = {"status": "ok", "name": title, "parts": len(parts)}
                all_parts.extend((p["part_id"], p["name_en"], p["name"]) for p in parts)
        except Exception as ex:
            report["results"][e["id"]] = {"status": "error", "name": title}
            report["errors"].append({"id": e["id"], "name": title, "error": str(ex)})
            e["body_parts"] = []
        if i % 10 == 0:
            print("  %d/%d" % (i, len(enemies)), flush=True)
        time.sleep(0.25)

    d["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    with open(data_path, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
        f.write("\n")

    os.makedirs(os.path.join(BASE, "fetch_reports"), exist_ok=True)
    with open(os.path.join(BASE, "fetch_reports", "enemies_parts_fetch_report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
        f.write("\n")

    gen_glossary(all_parts)

    from collections import Counter
    st = Counter(r["status"] for r in report["results"].values())
    print("完成: with_parts=%d total_parts=%d status=%s" % (
        report["enemies_with_parts"], report["total_parts"], dict(st)), flush=True)
    if report["errors"]:
        print("错误:", len(report["errors"]), flush=True)
        for er in report["errors"][:20]:
            print("  ", er, flush=True)


if __name__ == "__main__":
    main()
