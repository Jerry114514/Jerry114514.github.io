# -*- coding: utf-8 -*-
"""L2 上游变更侦测（**只读**）：回答两个问题

  ① 我们**跟踪的上游页面**（wiki-link-map.js 里映射到站内页的那些）最近被改过哪些？
  ② 最新几版公告里提到的**实体名**，有哪些站内还没有？（就是"公告提到了但我们缺"）

为什么这两件事值得单独做：图鉴数据集是**手工抓的定点快照**，上游一改就悄悄过期；
而"公告提到 X 但我们没有 X"正是上一轮人工比对才发现的缺口（AR/GL-21 One-Two、G/40-K Melta Mine）——
本脚本把这个人工动作自动化。

本脚本**只读、只出报告**，不碰任何数据文件（因此可以安全地定时跑）。

用法：
  python scripts/check_upstream_changes.py                 # 打印报告
  python scripts/check_upstream_changes.py --report r.md   # 另存 markdown
  python scripts/check_upstream_changes.py --days 2        # 上游改动回看窗口（默认 1 天）
  python scripts/check_upstream_changes.py --limit 6       # 检查最近几版公告（默认 3）
"""
import argparse
import io
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

API = "https://helldivers.wiki.gg/api.php"
UA = {"User-Agent": "HD2-DataSync/1.0 (site maintainer; +https://jerry114514.github.io/)"}

# 这些容器小节下的**子标题**就是实体名（公告的写法：Primary weapons > AR/GL-21 One-Two）
ENTITY_CONTAINERS = (
    "primary weapons", "primaries", "secondary weapons", "secondaries", "throwables",
    "stratagems", "enemies", "weapons", "primaries attachments", "armor", "boosters",
    "warbonds",
)
# 明显不是实体名的标题（公告里的结构词）
NOISE = re.compile(
    r"^(changes?|problem we want to solve|intent and expectation.*|overview|fixes|balancing|"
    r"known issues|media|trivia|patch highlights|community feedback changes|general gameplay|"
    r"undocumented changes|crash fixes|misc|miscellaneous fixes|bug changes|level design changes|"
    r"mission objective changes|weapons? & stratagem fixes|enemy spawning|video|sound|ui|"
    r"terminids?|automatons?|illuminate|super earth)\s*:?\s*$", re.I)
# 型号样式：LAS-13 / AR/GL-21 / G/40 / EXO-45 / R-2124 / MD-17 / A/G-16 / CQC-9 ...
CODE = re.compile(r"\b[A-Z]{1,4}(?:/[A-Z]{1,4})?-\d{1,4}\b")
# 排除版本号小节（如 1.007.100 / February_2184）
VERSIONISH = re.compile(r"^\d+(\.\d+)+$|^[A-Z][a-z]+_\d{4}$")


def api(qs, tries=3):
    last = None
    for i in range(tries):
        try:
            raw = urllib.request.urlopen(
                urllib.request.Request(API + "?" + qs, headers=UA), timeout=45).read()
            return json.loads(raw.decode("utf-8"))
        except Exception as e:
            last = e
            time.sleep(1.5 * (i + 1))
    raise RuntimeError("API 失败 %s: %s" % (qs[:70], last))


def norm(s):
    return re.sub(r"[^a-z0-9]", "", str(s or "").lower())


def load_datasets(root):
    """把站内各数据集的实体名/英文名/id 收成一个可查询的集合。"""
    zh = os.path.join(root, "HD2_Wiki", "data", "wiki", "zh")
    known, label = set(), {}
    for fname, key in (("weapons.json", "weapons"), ("enemies.json", "enemies"),
                       ("stratagems_full.json", "stratagems"), ("boosters.json", "boosters"),
                       ("warbonds.json", "warbonds")):
        p = os.path.join(zh, fname)
        if not os.path.exists(p):
            continue
        for it in json.load(io.open(p, encoding="utf-8")).get(key) or []:
            for f in ("id", "name", "name_en", "name_zh"):
                v = norm(it.get(f))
                if v:
                    known.add(v)
                    label.setdefault(v, "%s/%s" % (fname.replace(".json", ""), it.get("id")))
    # missions 结构特殊：递归收集
    p = os.path.join(zh, "missions.json")
    if os.path.exists(p):
        def walk(o):
            if isinstance(o, dict):
                if o.get("id") and (o.get("name") or o.get("name_zh")):
                    for f in ("id", "name", "name_zh"):
                        v = norm(o.get(f))
                        if v:
                            known.add(v)
                            label.setdefault(v, "missions/%s" % o.get("id"))
                for v in o.values():
                    walk(v)
            elif isinstance(o, list):
                for v in o:
                    walk(v)
        walk(json.load(io.open(p, encoding="utf-8")))
    return known, label


def load_site_map(root):
    """wiki-link-map.js 的 site 映射：键 = 上游页面名（下划线），值 = 站内 URL。"""
    p = os.path.join(root, "HD2_Wiki", "assets", "js", "wiki-link-map.js")
    txt = io.open(p, encoding="utf-8").read()
    return {norm(k): (k, v) for k, v in re.findall(r'"([^"]+)":\s*"([^"]+)"', txt)}


def collect_candidates(versions, limit):
    """从最近 N 版公告里抽出「看起来是实体名」的标题，并记录出处。"""
    out = []

    def walk(secs, vid, parent_is_container, trail):
        for s in secs:
            h = (s.get("heading") or "").strip()
            is_container = h.strip().lower().rstrip(":") in ENTITY_CONTAINERS
            is_cand = False
            if h and not VERSIONISH.match(h) and not NOISE.match(h):
                if parent_is_container:
                    is_cand = True
                elif CODE.search(h):
                    is_cand = True
            if is_cand:
                out.append({"version": vid, "name": h, "trail": trail + [h],
                            "in_container": parent_is_container})
            walk(s.get("subsections") or [], vid, is_container, trail + [h])

    for v in versions[:limit]:
        walk(v.get("sections") or [], v["id"], False, [])
    return out


def upstream_changes(days):
    """最近 days 天内上游改过的页面。"""
    d = api("action=query&list=recentchanges&rcprop=title|timestamp|user|comment|revid"
            "&rclimit=500&rcnamespace=0&format=json")
    items = d.get("query", {}).get("recentchanges", [])
    cutoff = time.time() - days * 86400
    out = []
    for r in items:
        ts = r.get("timestamp", "")
        try:
            t = time.mktime(time.strptime(ts, "%Y-%m-%dT%H:%M:%SZ")) - time.timezone
        except Exception:
            continue
        if t >= cutoff:
            out.append(r)
    return out, len(items)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    ap.add_argument("--days", type=float, default=1.0)
    ap.add_argument("--limit", type=int, default=3)
    ap.add_argument("--report", default=None)
    a = ap.parse_args()

    known, label = load_datasets(a.root)
    site_map = load_site_map(a.root)
    pn = json.load(io.open(os.path.join(a.root, "HD2_Wiki", "data", "wiki", "zh", "patchnotes.json"),
                           encoding="utf-8"))

    lines = []
    lines.append("# 上游变更侦测报告")
    lines.append("")
    lines.append("生成时间（UTC）：%s" % time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime()))
    lines.append("")

    # ---- ① 上游改动 ----
    changes, total_rc = upstream_changes(a.days)
    tracked = []
    for c in changes:
        key = norm(c.get("title"))
        if key in site_map:
            tracked.append(c)
    lines.append("## ① 我们跟踪的上游页面：最近 %g 天内有改动" % a.days)
    lines.append("")
    lines.append("（上游近 %d 条 recentchanges 中；下列是**站内已有对应页**的那些）" % total_rc)
    lines.append("")
    if tracked:
        lines.append("| 上游页面 | 站内 | 时间 | 编辑者 | 备注 |")
        lines.append("| --- | --- | --- | --- | --- |")
        for c in tracked[:60]:
            t = c.get("timestamp", "")[:16].replace("T", " ")
            lines.append("| `%s` | %s | %s | %s | %s |" % (
                c.get("title"), site_map[norm(c.get("title"))][1],
                t, c.get("user", ""), (c.get("comment") or "").replace("|", "/")[:50]))
        if len(tracked) > 60:
            lines.append("")
            lines.append("（还有 %d 条未列出）" % (len(tracked) - 60))
    else:
        lines.append("无（我们跟踪的上游页面在窗口内没有改动）")
    lines.append("")

    # ---- ② 公告提到的实体 vs 站内缺口 ----
    cands = collect_candidates(pn["versions"], a.limit)
    gaps, dupes = [], {}
    for c in cands:
        key = norm(c["name"])
        if key in known or key in site_map:
            continue
        dupes.setdefault(key, c)
    gaps = list(dupes.values())
    lines.append("## ② 最近 %d 版公告提到的实体：站内缺口" % a.limit)
    lines.append("")
    lines.append("检查了 %d 个候选名，其中站内**查不到**的如下。" % len(cands))
    lines.append("（判据：名字归一化后不在任何数据集的 id/name/name_en/name_zh 里，也不在 wiki-link-map 的站内映射里）")
    lines.append("")
    if gaps:
        lines.append("| 版本 | 名称 | 出处小节 |")
        lines.append("| --- | --- | --- |")
        for g in sorted(gaps, key=lambda x: x["version"]):
            lines.append("| %s | **%s** | %s |" % (g["version"], g["name"], " › ".join(g["trail"][:-1][-2:])))
    else:
        lines.append("无缺口 🎉")
    lines.append("")
    lines.append("> 提示：候选名的抽取规则见脚本头部（实体容器小节的子标题 + 型号样式 `[A-Z]{1,4}-\\d+`）。")
    lines.append("> 误报可能有（比如上游把机制名写成型号样式），**逐条人工确认**后再补录。")
    body = "\n".join(lines) + "\n"

    # ⚠ stdout 只打 ASCII：本脚本在 Windows/GBK 控制台与 CI 里都要能跑，
    #   中文字符（尤其 › ✅ 这类）会让 print 直接抛 UnicodeEncodeError 打断脚本。
    #   报告一律写文件（UTF-8）。
    out_path = a.report or os.path.join(a.root, "HD2_Wiki", "data", "wiki", "zh",
                                        "fetch_reports", "upstream_report.md")
    d = os.path.dirname(out_path)
    if d:                       # ⚠ 传相对文件名时 dirname 是 ''，os.makedirs('') 会抛错
        os.makedirs(d, exist_ok=True)
    io.open(out_path, "w", encoding="utf-8", newline="\n").write(body)

    print("report written: %s (%d bytes)" % (out_path, len(body.encode("utf-8"))))
    print("SECTION1_tracked_upstream_changes=%d" % len(tracked))
    print("SECTION2_gap_candidates=%d" % len(gaps))
    print("SUMMARY changes=%d gaps=%d" % (len(tracked), len(gaps)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
