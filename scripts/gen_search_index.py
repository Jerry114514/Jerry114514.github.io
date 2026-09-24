#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成站内全文搜索索引（2026-09-23）。

为什么要预生成索引，而不是"每次搜索现拉全部 JSON"
--------------------------------------------------------------------------
* 首页搜索要能命中**文章里的某一段**（机制页正文、公告条目、武器简介…），
  这些内容分散在 10+ 个数据文件里（合计 ~3.2 MB，含英文主干）；
* 现拉全部文件 = 十几个请求 + 每次都重新解析；预生成 = **一次请求**、体积可控、
  且可以给每条命中附带**深链锚点**（机制小节 / 公告小节）。
* 索引是**确定性产物**（不含时间戳、键序固定），所以 diff 稳定、可以进 CI 校验。

产出（都在 `HD2_Wiki/data/wiki/zh/`）
--------------------------------------------------------------------------
* `search_index.json` —— 全文索引：`{ v, digest, count, docs: [[u,t,k,g,x], ...] }`
  `u`=URL（可含 `#anchor`）`t`=标题 `k`=板块 `g`=副标题/分组 `x`=可搜索正文（已去 HTML）
* `search_entries.json` —— 轻量条目表（同上但**不含 `x`**）：首页「🎲 开始探索（随机条目）」
  与即时标题联想用；体积小到可以随页面一起加载。

`digest` = 参与索引的**所有源文件内容**的 sha256 前 16 位 —— 数据改过但索引没重生成时可直接比对。

用法：
  python scripts/gen_search_index.py            # 生成（只在内容变化时写盘）
  python scripts/gen_search_index.py --check    # 只校验磁盘上的索引是否与数据一致（exit 1 = 过期）
"""
import argparse
import hashlib
import html
import io
import json
import os
import re
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
Z = os.path.join(BASE, "HD2_Wiki", "data", "wiki", "zh")
OUT_INDEX = os.path.join(Z, "search_index.json")
OUT_ENTRIES = os.path.join(Z, "search_entries.json")
WIKI = "https://jerry114514.github.io/HD2_Wiki/"

# 输出格式版本：改**索引的内容结构/收集规则**时必须 +1 —— 它会进 digest，
# 这样即使源数据没变，浏览器/边缘缓存里的旧索引也会立刻失效（否则最多会脏 10 分钟）。
FORMAT = 3

# 参与索引的源文件（相对仓库根）—— 顺序固定，digest 才稳定
SOURCES = [
    "HD2_Wiki/data/wiki/zh/weapons.json",
    "HD2_Wiki/data/wiki/zh/enemies.json",
    "HD2_Wiki/data/wiki/zh/stratagems_full.json",
    "HD2_Wiki/data/wiki/zh/boosters.json",
    "HD2_Wiki/data/wiki/zh/warbonds.json",
    "HD2_Wiki/data/wiki/zh/missions.json",
    "HD2_Wiki/data/wiki/zh/factions.json",
    "HD2_Wiki/data/wiki/zh/patchnotes.json",
    "HD2_Wiki/data/wiki/zh/patchnotes_zh.json",
    "HD2_Wiki/data/wiki/zh/blocks/about.json",
    "HD2_Wiki/data/wiki/zh/blocks/beginners.json",
    "HD2_Wiki/data/wiki/zh/blocks/navigation.json",
    "HD2_Wiki/data/wiki/zh/blocks/welcome.json",
    "HD2_Wiki/data/wiki/zh/blocks/news.json",
    "HD2_Wiki/data/wiki/zh/mechanics/index.json",
    "HD2_Wiki/data/wiki/zh/mechanics/damage.json",
    "HD2_Wiki/data/wiki/zh/mechanics/damage_zh.json",
    "HD2_Wiki/data/wiki/zh/mechanics/difficulty.json",
    "HD2_Wiki/data/wiki/zh/mechanics/difficulty_zh.json",
    "HD2_Wiki/data/wiki/zh/mechanics/status_effects.json",
    "HD2_Wiki/data/wiki/zh/mechanics/status_effects_zh.json",
    "HD2_Wiki/data/wiki/zh/mechanics/galactic_war.json",
    "HD2_Wiki/data/wiki/zh/mechanics/galactic_war_zh.json",
    "HD2_Wiki/data/wiki/zh/mechanics/galactic_war_history.json",
    "HD2_Wiki/data/wiki/zh/mechanics/galactic_war_history_zh.json",
    "CONTRIBUTING.md",
    "HD2_Wiki/data/wiki/zh/SCHEMA.md",
]

TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"[ \t\u00a0]+")
NL_RE = re.compile(r"\n{2,}")
MD_RE = re.compile(r"^\s{0,3}(#{1,6}\s*|[-*+]\s+|\d+\.\s+|>\s?|\|)", re.M)
CODE_RE = re.compile(r"`{1,3}")


def load_json(rel):
    with io.open(os.path.join(BASE, rel.replace("/", os.sep)), encoding="utf-8") as f:
        return json.load(f)


def load_text(rel):
    with io.open(os.path.join(BASE, rel.replace("/", os.sep)), encoding="utf-8") as f:
        return f.read()


def clean(s):
    """HTML/Markdown → 可搜索纯文本（保留中英文与数字，压掉空白）。"""
    if not isinstance(s, str):
        return ""
    s = html.unescape(s)
    s = TAG_RE.sub(" ", s)
    s = s.replace("\u200b", "")
    return WS_RE.sub(" ", s).strip()


def flatten_text(node, out, depth=0):
    """递归收集 JSON 里所有字符串（中英一起收，便于用英文也能搜到）。"""
    if isinstance(node, str):
        t = clean(node)
        if t:
            out.append(t)
    elif isinstance(node, dict):
        for k, v in node.items():
            if k in ("id", "icon", "image", "src", "color", "link", "url", "source_url",
                     "source_page", "image_local", "image_thumb", "cover", "cover_wiki",
                     "author_url", "source_title", "author", "note"):
                continue
            flatten_text(v, out, depth + 1)
    elif isinstance(node, list):
        for v in node:
            flatten_text(v, out, depth + 1)


def join_text(parts, limit=6000):
    seen = set()
    buf = []
    for p in parts:
        p = clean(p)
        if not p or p in seen:
            continue
        seen.add(p)
        buf.append(p)
    t = "\n".join(buf)
    return t[:limit]


def doc(url, title, kind, group, parts):
    """URL 一律写**相对路径**（与站内其它页面链接一致）：
    这样本地静态预览、线上、以及任何镜像域名都能直接用，不会把人踢回 github.io。"""
    return ["./" + url, clean(title), kind, clean(group), join_text(parts)]


# ---------------- 各数据集 ----------------

def docs_weapons():
    d = load_json("HD2_Wiki/data/wiki/zh/weapons.json")
    for w in d["weapons"]:
        parts = [w.get("description"), w.get("description_zh"), w.get("lore"), w.get("unlock"),
                 w.get("unlock_zh"), w.get("category"), w.get("subcategory_name")]
        parts += w.get("traits") or []
        parts += w.get("tips") or []
        for key in ("stats_short", "stats_full", "detailed_stats"):
            flatten_text(w.get(key), parts)
        yield doc("weapon.html?id=%s" % w["id"], "%s %s" % (w.get("name") or "", w.get("name_en") or ""),
                  "武器", (w.get("category_label") or w.get("category") or "") +
                  (" · " + w["subcategory_name"] if w.get("subcategory_name") else ""), parts)


def docs_enemies():
    d = load_json("HD2_Wiki/data/wiki/zh/enemies.json")
    for e in d["enemies"]:
        parts = [e.get("description"), e.get("faction_label"), e.get("strain"), e.get("category"),
                 e.get("behavior"), e.get("spawn")]
        flatten_text(e.get("body_parts"), parts)
        flatten_text(e.get("weak_points"), parts)
        flatten_text(e.get("attacks"), parts)
        flatten_text(e.get("drops"), parts)
        for g in e.get("guides") or []:
            parts.append(g.get("title"))
            parts.append(g.get("note"))
        yield doc("enemy.html?id=%s" % e["id"], "%s %s" % (e.get("name") or "", e.get("name_zh") or ""),
                  "敌人", e.get("faction_label") or e.get("faction") or "", parts)


def docs_stratagems():
    d = load_json("HD2_Wiki/data/wiki/zh/stratagems_full.json")
    for s in d["stratagems"]:
        parts = [s.get("description"), s.get("unlock"), s.get("unlock_zh"), s.get("code"),
                 s.get("cooldown"), s.get("category_label")]
        flatten_text(s.get("detailed_stats"), parts)
        yield doc("stratagem.html?id=%s" % s["id"], "%s %s" % (s.get("name") or "", s.get("name_en") or ""),
                  "战略配备", s.get("category_label") or "", parts)


def docs_boosters():
    d = load_json("HD2_Wiki/data/wiki/zh/boosters.json")
    for b in d["boosters"]:
        parts = [b.get("description"), b.get("description_zh"), b.get("overview_zh"),
                 b.get("warbond_zh"), b.get("warbond"), b.get("price_zh")]
        flatten_text(b.get("sections"), parts)
        flatten_text(b.get("tables"), parts)
        yield doc("booster.html?id=%s" % b["id"], "%s %s" % (b.get("name") or "", b.get("name_en") or ""),
                  "强化资源", b.get("warbond_zh") or "", parts)


def docs_warbonds():
    d = load_json("HD2_Wiki/data/wiki/zh/warbonds.json")
    for w in d["warbonds"]:
        parts = [w.get("name_zh"), w.get("overview_zh"), w.get("intro_zh"), w.get("type"),
                 w.get("price_zh"), w.get("release_date"), w.get("credit_claim_zh")]
        flatten_text(w.get("tables"), parts)
        yield doc("warbond.html?id=%s" % w["id"], "%s %s" % (w.get("name") or "", w.get("name_en") or ""),
                  "战争债券", w.get("type") or "", parts)


def docs_missions():
    d = load_json("HD2_Wiki/data/wiki/zh/missions.json")
    for c in d.get("categories", []):
        for t in c.get("tasks", []):
            parts = [t.get("name_zh"), t.get("name"), t.get("difficulty_zh"), t.get("faction"),
                     t.get("tactical_info_zh"), t.get("tactical_info")]
            parts += t.get("steps_zh") or []
            parts += t.get("steps") or []
            yield doc("mission.html?id=%s" % t["id"], "%s %s" % (t.get("name_zh") or t.get("name") or "",
                      ""), "任务", c.get("name") or c.get("id") or "", parts)


def docs_factions_blocks():
    f = load_json("HD2_Wiki/data/wiki/zh/factions.json")
    for x in f.get("factions", []):
        parts = [x.get("name_zh"), x.get("name"), x.get("description_zh"), x.get("description")]
        flatten_text(x.get("strains"), parts)
        yield doc("wiki.html#navigation", "%s %s" % (x.get("name_zh") or "", x.get("name") or ""),
                  "阵营", "阵营总览", parts)
    nav = load_json("HD2_Wiki/data/wiki/zh/blocks/navigation.json")
    parts = [nav.get("title"), nav.get("content")]
    flatten_text(nav.get("categories"), parts)
    yield doc("wiki.html#navigation", nav.get("title") or "全部板块", "首页", "板块导航", parts)
    for bid in ("about", "beginners", "welcome", "news"):
        try:
            b = load_json("HD2_Wiki/data/wiki/zh/blocks/%s.json" % bid)
        except Exception:
            continue
        parts = [b.get("title"), b.get("subtitle"), b.get("content")]
        flatten_text(b.get("features"), parts)
        flatten_text(b.get("sections"), parts)
        flatten_text(b.get("items"), parts)
        yield doc("wiki.html#%s" % bid, b.get("title") or bid, "首页", "首页区块", parts)


def docs_patchnotes():
    trunk = load_json("HD2_Wiki/data/wiki/zh/patchnotes.json")
    try:
        zh = {v["id"]: v for v in load_json("HD2_Wiki/data/wiki/zh/patchnotes_zh.json").get("versions_zh", [])}
    except Exception:
        zh = {}

    def walk(secs, version_id, path):
        for s in secs:
            sid = s.get("id") or ""
            head = s.get("heading") or ""
            zs = (zh.get(version_id) or {}).get("sections_zh") or []
            zmap = {z.get("id"): z for z in _flat_sections(zs)}
            z = zmap.get(sid) or {}
            parts = [z.get("heading_zh"), head]
            for it in s.get("items") or []:
                parts.append(it.get("text"))
            for it in z.get("items_zh") or []:
                parts.append(it)
            yield doc("patchnote.html?id=%s#%s" % (version_id, sid) if sid else
                      "patchnote.html?id=%s" % version_id,
                      "%s › %s" % (z.get("heading_zh") or head, path) if path else (z.get("heading_zh") or head),
                      "更新公告", version_id, parts)
            yield from walk(s.get("subsections") or [], version_id, z.get("heading_zh") or head)

    for v in trunk.get("versions", []):
        vid = v["id"]
        title_zh = (zh.get(vid) or {}).get("title_zh")
        head_parts = [v.get("title"), title_zh, v.get("release_date"), v.get("description_zh")]
        yield doc("patchnote.html?id=%s" % vid,
                  "%s %s" % (title_zh or "", v.get("title") or ""), "更新公告", vid, head_parts)
        yield from walk(v.get("sections") or [], vid, "")


def _flat_sections(secs):
    """展平小节树。

    ⚠ 必须同时认 `subsections`（主干）与 `subsections_zh`（中文覆盖）：
      2026-09-23 首版只跟着 `subsections` 递归，于是**所有嵌套小节的中文正文都没进索引**
      （公告里搜不到「掉落物位置与武器随机化」、机制页深层小节同理）——
      这类"表格/字段名不同源"的静默漏收集，只能靠"拿正文里真实的一句话去搜"验出来。
    """
    for s in secs:
        yield s
        yield from _flat_sections(s.get("subsections") or s.get("subsections_zh") or [])


def docs_mechanics():
    idx = load_json("HD2_Wiki/data/wiki/zh/mechanics/index.json")
    for page in idx.get("pages", []):
        pid = page["id"]
        try:
            trunk = load_json("HD2_Wiki/data/wiki/zh/mechanics/%s.json" % pid)
        except Exception:
            continue
        try:
            ov = load_json("HD2_Wiki/data/wiki/zh/mechanics/%s_zh.json" % pid)
        except Exception:
            ov = {}
        zh_top = {s.get("id"): s for s in _flat_sections(ov.get("sections_zh") or [])}
        title = ov.get("title_zh") or trunk.get("title") or pid
        yield doc("mechanic.html?id=%s" % pid, "%s %s" % (title, trunk.get("title") or page.get("title") or ""),
                  "游戏机制", page.get("description") or "", [page.get("description"), trunk.get("description")])
        for s in _flat_sections(trunk.get("sections") or []):
            sid = s.get("id") or ""
            z = zh_top.get(sid) or {}
            parts = [z.get("title_zh"), s.get("title"), z.get("content_zh"), z.get("paragraphs_zh"),
                     s.get("content")]
            yield doc("mechanic.html?id=%s#%s" % (pid, sid) if sid else "mechanic.html?id=%s" % pid,
                      "%s › %s" % (title, z.get("title_zh") or s.get("title") or sid),
                      "游戏机制", title, parts)


def docs_markdown():
    for rel, url, kind, title in (
            ("CONTRIBUTING.md", "contributing.html", "文档", "投稿指南"),
            ("HD2_Wiki/data/wiki/zh/SCHEMA.md", "schema.html", "文档", "数据契约 Schema")):
        txt = load_text(rel)
        body = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", txt)      # 链接留文字
        body = MD_RE.sub("", body)
        body = CODE_RE.sub(" ", body)
        yield doc(url, title, kind, "站内文档", [body])


BUILDERS = (docs_weapons, docs_enemies, docs_stratagems, docs_boosters, docs_warbonds,
            docs_missions, docs_factions_blocks, docs_patchnotes, docs_mechanics, docs_markdown)


def build():
    docs = []
    for b in BUILDERS:
        docs.extend(list(b()))
    # 去重（同 URL 只留正文最长的一条）
    best = {}
    for d in docs:
        cur = best.get(d[0])
        if cur is None or len(d[4]) > len(cur[4]):
            best[d[0]] = d
    docs = sorted(best.values(), key=lambda d: (d[2], d[1], d[0]))

    # digest 取**索引内容本身**（不是源文件字节）—— 两个理由：
    #   ① 它是前端缓存键（`?v=<digest>`），只有"内容真的变了"才该换，源文件里的
    #      `updated_at` 这类易变字段每天在动，混进哈希会让索引每轮重建 + 空提交（§11.1-8）；
    #   ② CI 的检出与我本地工作树可能因"影子历史"而字节不同（§11.1-8 的 CRLF/换行差异），
    #      按内容算哈希对两边都稳定（2026-09-24 实测：本地 `patchnotes.json` 只差一个
    #      `updated_at`，索引 docs 完全相同却算出了不同 digest）。
    h = hashlib.sha256()
    h.update(("format:%d\n" % FORMAT).encode("utf-8"))
    h.update(json.dumps(docs, ensure_ascii=False, sort_keys=True,
                        separators=(",", ":")).encode("utf-8"))
    return h.hexdigest()[:16], docs


def serialize(digest, docs):
    entries = {"v": 1, "digest": digest, "count": len(docs),
               "docs": [[d[0], d[1], d[2], d[3]] for d in docs]}
    index = {"v": 1, "digest": digest, "count": len(docs), "docs": docs}
    return (json.dumps(index, ensure_ascii=False, separators=(",", ":"), sort_keys=False) + "\n",
            json.dumps(entries, ensure_ascii=False, separators=(",", ":"), sort_keys=False) + "\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    digest, docs = build()
    idx_text, ent_text = serialize(digest, docs)
    ib, eb = idx_text.encode("utf-8"), ent_text.encode("utf-8")
    print("digest=%s docs=%d index=%.2f MB entries=%.0f KB" % (
        digest, len(docs), len(ib) / 1048576, len(eb) / 1024))
    from collections import Counter
    print("板块分布:", dict(Counter(d[2] for d in docs)))

    if a.check:
        ok = True
        for path, want in ((OUT_INDEX, ib), (OUT_ENTRIES, eb)):
            have = io.open(path, "rb").read() if os.path.exists(path) else b""
            same = have == want
            ok = ok and same
            print("  %-30s %s" % (os.path.basename(path), "一致" if same else "**过期**（需重新生成）"))
        return 0 if ok else 1

    changed = []
    for path, want in ((OUT_INDEX, ib), (OUT_ENTRIES, eb)):
        have = io.open(path, "rb").read() if os.path.exists(path) else b""
        if have != want:
            io.open(path, "wb").write(want)
            changed.append("%s (%d -> %d B)" % (os.path.basename(path), len(have), len(want)))
    print("已更新: %s" % (", ".join(changed) if changed else "无变化（跳过写盘）"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
