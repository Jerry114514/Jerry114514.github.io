# -*- coding: utf-8 -*-
"""抓取 Helldivers 2 任务数据（Missions 模块）— 完整版
数据源：https://helldivers.wiki.gg/wiki/Missions + 各任务详情页
输出：missions.json（categories[].tasks[]）+ fetch_reports/missions_fetch_report.json
"""
import json, urllib.request, urllib.parse, re, sys, time, html as html_mod, os
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass
API = "https://helldivers.wiki.gg/api.php"
HEADERS = {"User-Agent": "Mozilla/5.0 HD2-Wiki/1.0"}
BASE = r"E:\GitLoadWareHouse\Jerry114514.github.io\HD2_Wiki\data\wiki\zh"

# 任务名中文译名（内置；未收录的保留英文）
TRANSLATE = {
    # Main
    "Start Fuel Pumps": "启动燃料泵", "Upload Escape Pod Data": "上传逃生舱数据",
    "Terminate Illegal Broadcast": "终止非法广播", "Retrieve Essential Personnel": "营救关键人员",
    "Conduct Geological Survey": "进行地质勘探", "Spread Democracy": "传播民主",
    "Emergency Evacuation": "紧急撤离", "Launch ICBM": "发射洲际弹道导弹",
    "Retrieve Valuable Data": "取回宝贵数据", "Evacuate High-Value Assets": "撤离高价值资产",
    # Terminid
    "Restart Pumps": "重启燃料泵", "Activate TCS+ Station": "激活 TCS+ 站点",
    "Restore Air Quality": "恢复空气质量", "Extract E-711": "提取 E-711",
    "Conduct Mobile E-711 Extraction": "进行移动式 E-711 提取",
    "Eliminate Brood Commanders": "消灭巢群指挥官", "Collect Gloom-Infused Oil": "收集灰霾浸润石油",
    "Extract Research Probe Data": "提取科研探测器数据", "Collect Meteorological Data": "收集气象数据",
    "Blitz: Secure Research Site": "闪电战：守住科研站", "Deploy Dark Fluid": "部署暗流体",
    "Deactivate Terminid Control System": "关闭终结族控制系统",
    "Collect Gloom Spore Readings": "收集灰霾孢子读数", "Eradicate Terminid Swarm": "歼灭终结族虫群",
    "Activate Oil Pumps": "启动石油泵", "Activate Terminid Control System": "激活终结族控制系统",
    "Blitz Search And Destroy/Terminid": "闪电战：搜索并摧毁（终结族）",
    "Purge Hatcheries": "净化孵化巢", "Eliminate Chargers": "消灭强袭虫",
    "Destroy Spore Lung": "摧毁孢子肺", "Chart Terminid Tunnels": "测绘终结族隧道",
    "Nuke Nursery": "核平育巢", "Eliminate Bile Titans": "消灭吐酸泰坦",
    "Enable Oil Extraction": "启用石油开采", "Cleanse Infested District": "净化感染区域",
    "Eliminate Impaler": "消灭穿刺者",
    # Automaton
    "Eliminate Devastators": "消灭破坏者", "Commando: Acquire Evidence": "突击行动：获取证据",
    "Commando: Extract Intel": "突击行动：提取情报",
    "Sabotage Orgo-Plasma Synthesis": "破坏有机等离子合成",
    "Commando: Secure Black Box": "突击行动：回收黑匣子", "Sabotage Supply Bases": "破坏补给基地",
    "Annex Untapped Mineral Sites": "吞并未开采矿区", "Confiscate Assets": "没收资产",
    "Seize Industrial Complex": "占领工业综合体", "Destroy Transmission Network": "摧毁传输网络",
    "Eradicate Automaton Forces": "歼灭机器人部队",
    "Blitz Search And Destroy/Automaton": "闪电战：搜索并摧毁（机器人）",
    "Sabotage Air Base": "破坏空军基地", "Rapid Acquisition": "快速夺取",
    "Eliminate Automaton Hulks": "消灭巨型者",
    "Eliminate Automaton Factory Strider": "消灭移动工厂",
    "Halt Cyborg Production": "阻止生化人生产",
    "Neutralize Ground-to-Orbit Defenses": "瘫痪地对空防御",
    "Blitz: Destroy Bio-Processors": "闪电战：摧毁生物处理器",
    "Destroy Command Bunkers": "摧毁指挥地堡",
    # Illuminate
    "Evacuate Colonists": "撤离殖民者", "Retrieve Recon Craft Intel": "取回侦察艇情报",
    "Blitz: Destroy Illuminate Warp Ships": "闪电战：摧毁光能族跃迁舰",
    "Free Colony": "解放殖民地", "Democratize the Void": "使虚空民主化",
    "Take Down Overship": "击落主宰舰",
    "Blitz: Destroy Illuminate Warp Gateways": "闪电战：摧毁光能族跃迁门",
    "Infiltrate Illuminate Lair": "潜入光能族巢穴", "Destroy Harvesters": "摧毁收割者",
    "Repel Invasion Fleet": "击退入侵舰队", "Destroy Exospire": "摧毁外泄塔",
    "Eradicate Illuminate Forces": "歼灭光能族部队", "Extract Anomalous Material": "提取异常物质",
    "Blitz: Suppress Toxic Pollination": "闪电战：压制有毒授粉",
    "Destroy Gazer Spire": "摧毁凝视者尖塔",
    # Tactical
    "Secondary Extraction Zone": "备用撤离区", "Enemy Bio-Processors": "敌方生物处理器",
    "Anti-Air Emplacement": "防空阵地", "Raze Strategic Infrastructure": "夷平战略设施",
    "Erase Terrorist Memorials": "抹除恐怖分子纪念物",
    "Compromise Automaton Defenses": "削弱机器人防御", "Detector Tower": "侦测塔",
    "Mortar Emplacement": "迫击炮阵地", "Stratagem Jammer": "战略配备干扰器",
    "Gunship Facility": "炮艇设施", "Intercept Convoy": "拦截车队",
    "Cognitive Disruptor": "认知干扰器", "Eliminate Overseers": "消灭监督者",
    "Reinforcement Pods": "增援舱", "Mobile Radar": "移动雷达",
    "SEAF Artillery": "SEAF 火炮", "SEAF SAM Site": "SEAF 防空导弹阵地",
    "Radar Station": "雷达站", "Destroy Rogue Research Station": "摧毁失控研究站",
    "Spore Spewer": "孢子喷射者", "Retrieve Mutant Larva": "取回变异幼虫",
    "Purge Hatcheries": "净化孵化巢", "Recover Scientific Specimen": "回收科研样本",
    "Recover SSSD": "回收 SSSD", "Shrieker Nest": "尖啸者巢穴",
    "Stalker Lair": "潜行者巢穴", "Destroy High-Value Target": "摧毁高价值目标",
}

CATEGORY_ZH = {"main": "主要目标", "terminid": "终结族特殊任务", "automaton": "机器人特殊任务",
               "illuminate": "光能族特殊任务", "tactical": "战术目标"}

# tactical 阵营列映射
FACTION_ALIAS = {"any": "any", "automaton legion": "automatons", "the illuminate": "illuminate",
                 "terminid horde": "terminids", "super earth federation": "super_earth"}


def api(params):
    url = API + "?" + urllib.parse.urlencode(params)
    r = urllib.request.Request(url, headers=HEADERS)
    return json.loads(urllib.request.urlopen(r, timeout=25).read())


def strip_html(s):
    if not s:
        return ""
    s = re.sub(r"<br\s*/?>", " ", s)
    s = re.sub(r"<[^>]+>", " ", s)
    s = html_mod.unescape(s)
    return re.sub(r"\s+", " ", s).strip()


def parse_task_table(table_html, is_tactical):
    """解析任务表格（Icon | Name | Difficulty/Faction）"""
    tasks = []
    rows = re.findall(r"<tr>(.*?)</tr>", table_html, re.S)
    for r in rows:
        cells = re.findall(r"<(?:td|th)[^>]*>(.*?)</(?:td|th)>", r, re.S)
        if len(cells) < 3:
            continue
        name = strip_html(cells[1])
        if not name or name in ("Name",):
            continue
        href = re.search(r'href="(/wiki/[^"]+)"', cells[1])
        icon = re.search(r'src="(/images/[^"]+)"', cells[0])
        col3 = strip_html(cells[2])
        tk = {
            "name": name,
            "href": href.group(1) if href else None,
            "icon": ("https://helldivers.wiki.gg" + icon.group(1)) if icon else None,
        }
        if is_tactical:
            tk["faction_label"] = col3 or "Any"
            tk["difficulty"] = ""
        else:
            tk["difficulty"] = col3
        tasks.append(tk)
    return tasks


def slugify_task(href):
    if not href:
        return ""
    s = href.split("/wiki/")[-1]
    s = urllib.parse.unquote(s).replace("/", "_").replace("+", "_plus")
    s = s.lower().replace(" ", "_")
    s = re.sub(r"[^a-z0-9_]+", "_", s)
    return s.strip("_")


def parse_infobox(html):
    """druid infobox 字段"""
    result = {}
    pattern = re.compile(r'druid-label-(?:[^"\s]+)"[^>]*>([^<]*)</div>\s*<div class="druid-data[^"]*"[^>]*>(.*?)</div>\s*</div>', re.S)
    for m in pattern.finditer(html):
        label = strip_html(m.group(1))
        val = strip_html(m.group(2))
        if label and val:
            result[label] = val
    return result


def extract_list_block(seg):
    """提取 seg 中第一个列表（ul/ol）的完整内容（配对到对应闭合标签，处理嵌套）"""
    m = re.search(r"<(?:ul|ol)[^>]*>", seg)
    if not m:
        return None
    start = m.end()
    depth = 1
    j = start
    n = len(seg)
    while j < n and depth > 0:
        o = min([x for x in (seg.find("<ul", j), seg.find("<ol", j)) if x != -1] or [n])
        c = min([x for x in (seg.find("</ul>", j), seg.find("</ol>", j)) if x != -1] or [n])
        if c >= n:
            break
        if o < c:
            depth += 1
            j = o + 3
        else:
            depth -= 1
            j = c + 5
    return seg[start:j - 5] if j >= 5 else seg[start:]


def extract_top_items(list_html):
    """深度计数法提取顶层 <li> 内容（处理嵌套列表）"""
    items = []
    i = 0
    while i < len(list_html):
        m = re.search(r"<li>", list_html[i:])
        if not m:
            break
        start = i + m.end()
        depth = 1
        j = start
        while j < len(list_html) and depth > 0:
            o = list_html.find("<li>", j)
            c = list_html.find("</li>", j)
            if c < 0:
                break
            if o != -1 and o < c:
                depth += 1
                j = o + 4
            else:
                depth -= 1
                j = c + 5
        items.append(list_html[start:j - 5] if j >= 5 else list_html[start:])
        i = j
    return items


def parse_steps(html):
    """Objective Steps / Strategy 区块 → steps 数组（顶层 li 标题 + 子项）"""
    steps = []
    for anchor in ("Objective_Steps", "Strategy", "Mission_Walkthrough"):
        i1 = html.find('id="%s"' % anchor)
        if i1 < 0:
            continue
        i_start = html.rfind("<h", 0, i1)
        if i_start >= 0:
            i1 = i_start
        i2 = html.find("<h2", i1 + 10)
        seg = html[i1:i2 if i2 > 0 else i1 + 9000]
        if anchor == "Mission_Walkthrough":
            # 用 h3 子标题作为步骤
            sub_steps = []
            for hm in re.finditer(r"<h3[^>]*>(.*?)</h3>(.*?)(?=<h3|<h2|$)", seg, re.S):
                title = strip_html(hm.group(1))
                body = strip_html(hm.group(2))
                if title:
                    sub_steps.append(title + ("\n" + body if body else ""))
            if sub_steps:
                steps = sub_steps
                break
            continue
        m = extract_list_block(seg)
        if not m:
            # 无列表：取段落文本
            txt = strip_html(seg)
            txt = re.sub(r"^%s\s*" % anchor.replace("_", " "), "", txt, flags=re.I)
            if txt and len(txt) > 3:
                steps = [txt]
            continue
        items = extract_top_items(m)
        got = []
        for li in items:
            sub_block = extract_list_block(li)
            sub_items = []
            if sub_block:
                sub_items = [strip_html(x) for x in extract_top_items(sub_block)]
                li = li[:li.find(sub_block) - 4 if li.find(sub_block) >= 4 else 0]
            title = strip_html(li)
            if not title:
                continue
            if sub_items:
                got.append(title + "\n" + "\n".join("• " + s for s in sub_items))
            else:
                got.append(title)
        if got:
            steps = got
            break
    return steps


def parse_section_text(html, anchor):
    """通用区块文本提取（Tactical Information 等）"""
    i1 = html.find('id="%s"' % anchor)
    if i1 < 0:
        return ""
    # 回退到包含该 id 的标题标签开头，避免从标签中间切片
    i_start = html.rfind("<h", 0, i1)
    if i_start >= 0:
        i1 = i_start
    i2 = html.find("<h2", i1 + 10)
    seg = html[i1:i2 if i2 > 0 else i1 + 9000]
    txt = strip_html(seg)
    # 去掉标题本身（如 "Tactical Information" 及编辑链接残留）
    txt = re.sub(r"^%s\s*" % anchor.replace("_", " "), "", txt, flags=re.I)
    txt = re.sub(r"^\[?\s*edit\s*\|?\s*edit\s*source\s*\]?\s*", "", txt, flags=re.I)
    return txt.strip()


def main():
    d = api({"action": "parse", "page": "Missions", "prop": "text", "format": "json"})
    html = d["parse"]["text"]["*"]

    def seg_between(a_marker, b_marker):
        i = html.find(a_marker)
        if i < 0:
            return ""
        j = html.find(b_marker, i + 1)
        return html[i:j if j > 0 else i + 90000]

    categories_spec = [
        ("main",       'id="Main_Objectives"',      'id="Terminid_Specific"',    False),
        ("terminid",   'id="Terminid_Specific"',    'id="Automaton_Specific"',   False),
        ("automaton",  'id="Automaton_Specific"',   'id="Illuminate_Specific"',  False),
        ("illuminate", 'id="Illuminate_Specific"',  'id="Tactical_Objectives"',  False),
        ("tactical",   'id="Tactical_Objectives"',  'id="Mission_Result"',       True),
    ]
    all_tasks = []
    for cid, a, b, is_tac in categories_spec:
        seg = seg_between(a, b)
        t = re.search(r"<table.*?</table>", seg, re.S)
        tasks = parse_task_table(t.group(0), is_tac) if t else []
        for tk in tasks:
            tk["category"] = cid
            tk["id"] = slugify_task(tk["href"])
            tk["name_zh"] = TRANSLATE.get(tk["name"], "")
            if is_tac:
                tk["faction"] = FACTION_ALIAS.get(tk["faction_label"].lower(), tk["faction_label"].lower())
            else:
                tk["faction"] = "any"
            all_tasks.append(tk)
        print("%s: %d 任务" % (cid, len(tasks)), flush=True)

    # 抓详情页
    report = {"total": len(all_tasks), "ok": 0, "no_steps": [], "errors": []}
    for i, tk in enumerate(all_tasks):
        title = tk["name"]
        try:
            rd = api({"action": "parse", "page": title, "prop": "text", "format": "json"})
            if "parse" not in rd:
                raise RuntimeError("no parse")
            ph = rd["parse"]["text"]["*"]
            info = parse_infobox(ph)
            steps = parse_steps(ph)
            tac = parse_section_text(ph, "Tactical_Information")
            tk["time_limit"] = info.get("Time Limit", "")
            if not tk["difficulty"]:
                tk["difficulty"] = (info.get("Minimum Difficulty", "") + " to " + info.get("Maximum Difficulty", "")).strip(" to ")
            tk["steps"] = steps
            tk["tactical_info"] = tac
            if not steps:
                report["no_steps"].append(tk["id"])
            report["ok"] += 1
        except Exception as ex:
            tk["steps"] = []
            tk["tactical_info"] = ""
            tk["time_limit"] = ""
            report["errors"].append({"id": tk["id"], "name": title, "error": str(ex)})
        if i % 10 == 0:
            print("  详情 %d/%d" % (i, len(all_tasks)), flush=True)
        time.sleep(0.25)

    # 组装输出
    cats_out = []
    for cid, name in [("main", "Main Objectives"), ("terminid", "Terminid Specific"),
                      ("automaton", "Automaton Specific"), ("illuminate", "Illuminate Specific"),
                      ("tactical", "Tactical Objectives")]:
        tasks = [tk for tk in all_tasks if tk["category"] == cid]
        tasks_sorted = sorted(tasks, key=lambda x: x["name"].lower())
        cats_out.append({
            "id": cid, "name": name, "name_zh": CATEGORY_ZH[cid],
            "tasks": [{k: v for k, v in tk.items() if k != "category" and k != "href"} for tk in tasks_sorted],
        })

    data = {
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source": "https://helldivers.wiki.gg/wiki/Missions",
        "categories": cats_out,
    }
    os.makedirs(BASE, exist_ok=True)
    with open(os.path.join(BASE, "missions.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")

    report["timestamp"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    os.makedirs(os.path.join(BASE, "fetch_reports"), exist_ok=True)
    with open(os.path.join(BASE, "fetch_reports", "missions_fetch_report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print("完成: ok=%d 无步骤=%d 错误=%d" % (report["ok"], len(report["no_steps"]), len(report["errors"])), flush=True)
    if report["errors"]:
        for er in report["errors"][:15]:
            print("  ERR", er, flush=True)
    if report["no_steps"]:
        print("  无步骤:", report["no_steps"], flush=True)


if __name__ == "__main__":
    main()
