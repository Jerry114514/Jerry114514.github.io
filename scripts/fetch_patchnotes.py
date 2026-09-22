# -*- coding: utf-8 -*-
"""抓取《绝地潜兵 2》更新公告（英文主干），产出 HD2_Wiki/data/wiki/zh/patchnotes.json

上游：helldivers.wiki.gg 的 MediaWiki API（无需爬 HTML、无需登录）
  - 索引：Category:Patch Notes（截至 2026-09-22 共 95 个版本页）
  - 单页：action=parse&page=<版本号>&prop=sections|wikitext

设计要点（都是踩过坑才这么写的）：
  1. **只搬运、不改写**：上游文本原样保留，不做机器改写 —— 本项目历史上
     "没有上游依据的生成式改写" 造成过 damage 页 14 处 P0 事实错误。
  2. **id 全页去重**：上游 "Balancing" 与 "Balancing changes: …" 归一化后同名，
     会让锚点串位（§6.4 记过这个坑），故加 `-2`/`-3` 后缀。
  3. **标题集合不稳定**：旧版带 emoji（🌍 Overview / 🧠 KNOWN ISSUES），
     且 "Miscellaneous Fixes" 在 7.0.0 是二级标题 —— 所以只做前缀归一化，
     不写死标题清单，未知标题原样保留。
  4. **增量友好**：输出按版本号倒序、字段稳定；已存在的版本不重抓（除非 --refresh）。

用法：
  python scripts/fetch_patchnotes.py                # 默认取最新 10 个版本
  python scripts/fetch_patchnotes.py --limit 95      # 全量
  python scripts/fetch_patchnotes.py --refresh       # 忽略本地缓存，重抓
  python scripts/fetch_patchnotes.py --report x.txt  # 另存体检报告（UTF-8）
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
INDEX_SOURCE = "https://helldivers.wiki.gg/wiki/Category:Patch_Notes"

# 标题前缀 → 稳定 id（emoji 与大小写差异都在这里抹平）
HEADING_IDS = [
    ("patchhighlights", "patch_highlights"),
    ("communityfeedbackchanges", "community_feedback_changes"),
    ("generalgameplay", "general_gameplay"),
    ("balancing", "balancing"),
    ("knownissues", "known_issues"),
    ("undocumentedchanges", "undocumented_changes"),
    ("fixes", "fixes"),
    ("overview", "overview"),
    ("media", "media"),
    ("trivia", "trivia"),
]

ALPHA = re.compile(r"[^a-z0-9]")


def api(qs, tries=3):
    url = API + "?" + qs
    last = None
    for i in range(tries):
        try:
            raw = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=45).read()
            return json.loads(raw.decode("utf-8"))
        except Exception as e:                                   # 网络抖动重试
            last = e
            time.sleep(1.5 * (i + 1))
    raise RuntimeError("API 失败 %s: %s" % (qs[:60], last))


def norm_id(heading):
    plain = re.sub(r"[^\w\s]", "", heading, flags=re.UNICODE).strip()
    key = ALPHA.sub("", plain.lower())
    for prefix, sid in HEADING_IDS:
        if key.startswith(prefix):
            return sid
    return re.sub(r"[^a-z0-9]+", "_", plain.lower()).strip("_") or "section"


def clean(text):
    """wikitext 行 → 纯文本 + 链接 + 图片（保守：宁可少解析，也不产出错文本）。"""
    links, t = [], text
    t = re.sub(r"<ref[^>]*>.*?</ref>", "", t, flags=re.S)
    t = re.sub(r"<ref[^>]*/>", "", t)
    files = re.findall(r"\[\[(?:File|Image):([^\]\|]+)", t, flags=re.I)
    t = re.sub(r"\[\[(?:File|Image):[^\]]*\]\]", "", t, flags=re.I)

    def link(m):
        inner = m.group(1)
        target, label = (inner.split("|", 1) + [inner])[:2] if "|" in inner else (inner, inner)
        target, label = target.strip(), label.strip()
        if target.lower().startswith(("category:", "file:", "image:")):
            return ""
        links.append({"text": label, "page": target})
        return label

    t = re.sub(r"\[\[([^\]]+)\]\]", link, t)
    t = re.sub(r"\{\{\s*Update\s*\|\s*\w+\s*\|\s*([^}\|]+)\}\}", r"\1", t, flags=re.I)
    t = re.sub(r"\{\{[^{}]*\}\}", "", t)
    t = re.sub(r"<br\s*/?>", " ", t, flags=re.I)
    t = re.sub(r"<[^>]+>", "", t)
    t = t.replace("'''", "").replace("''", "")
    for a, b in (("&amp;", "&"), ("&nbsp;", " "), ("&quot;", '"'), ("&lt;", "<"),
                 ("&gt;", ">"), ("&#160;", " ")):
        t = t.replace(a, b)
    return re.sub(r"\s+", " ", t).strip(), links, files


def slugify(name):
    stem = re.sub(r"\.[A-Za-z0-9]+$", "", str(name or ""))
    return re.sub(r"[^a-z0-9]+", "_", stem.lower()).strip("_")


def parse_infobox(wt, ver):
    info = {"id": ver, "wiki_url": "https://helldivers.wiki.gg/wiki/" + urllib.parse.quote(ver)}
    m = re.search(r"\{\{Infobox Game Version(.*?)\n\}\}", wt, re.S)
    if not m:
        return info, None
    for line in m.group(1).splitlines():
        if "=" not in line:
            continue
        k, v = (x.strip() for x in line.split("=", 1))
        k = k.lstrip("|").strip()
        if k in ("title", "release_date", "release_time", "size", "blog"):
            info[{"blog": "blog_url"}.get(k, k)] = v or None
        elif k == "image":
            # ⚠ 不能叫 `image`：该键在 PATH_FIELDS 里，会被 IMG.EXISTS 当成**站内路径**解析。
            # 上游这里是维基的裸文件名（既非绝对 URL 也非站内路径），只作溯源。
            info["cover_wiki"] = v or None
        elif k in ("previous", "next"):
            mm = re.search(r"\|\s*([\d.]+)\s*\}\}", v)
            info[k] = (mm.group(1) if mm else (v.strip() or None))
    info.setdefault("title", ver)
    # 信息框封面已在站内本地化（零热链）：给出确定性的站内路径，页面无需硬编码文件名
    if info.get("cover_wiki"):
        info["image_local"] = "./assets/patchnotes/" + slugify(info["cover_wiki"]) + ".webp"
    return info, m


def parse_page(ver):
    d = api("action=parse&page=%s&prop=sections|wikitext&format=json" % urllib.parse.quote(ver))
    if "parse" not in d:
        raise RuntimeError("parse 失败: %s" % json.dumps(d, ensure_ascii=False)[:160])
    wt = d["parse"].get("wikitext", {}).get("*", "")
    info, im = parse_infobox(wt, ver)

    body = wt[im.end():] if im else wt
    body = re.sub(r"\[\[Category:[^\]]*\]\]", "", body)

    root = {"subsections": []}
    stack = [(2, root)]
    cur = None
    warnings = []

    def new_section(level, heading):
        plain = re.sub(r"^[^\w\u4e00-\u9fff]+", "", heading).strip()
        return {"id": norm_id(heading), "heading": plain, "level": level,
                "items": [], "subsections": []}

    for raw in body.splitlines():
        line = raw.rstrip()
        hm = re.match(r"^(={2,6})\s*(.+?)\s*=+\s*$", line)
        if hm:
            level = len(hm.group(1))
            node = new_section(level, hm.group(2))
            while stack and stack[-1][0] >= level:
                stack.pop()
            (stack[-1][1] if stack else root)["subsections"].append(node)
            stack.append((level, node))
            cur = node
            continue
        if not line.strip() or cur is None:
            continue
        bm = re.match(r"^([*#]+)\s*(.*)$", line)
        if bm:
            txt, links, files = clean(bm.group(2))
            if txt or files:
                cur["items"].append({"kind": "li", "depth": len(bm.group(1)) - 1,
                                     "text": txt, "links": links, "files": files})
            continue
        txt, links, files = clean(line)
        if txt:
            cur["items"].append({"kind": "p", "depth": 0, "text": txt,
                                 "links": links, "files": files})

    # --- id 全页去重（锚点唯一）---
    seen = {}

    def dedupe(secs):
        for s in secs:
            sid = s["id"]
            seen[sid] = seen.get(sid, 0) + 1
            if seen[sid] > 1:
                s["id"] = "%s-%d" % (sid, seen[sid])
            dedupe(s["subsections"])

    dedupe(root["subsections"])

    ids = []

    def collect(secs):
        for s in secs:
            ids.append(s["id"])
            collect(s["subsections"])

    collect(root["subsections"])
    if not root["subsections"]:
        warnings.append("无二级标题")
    if len(ids) != len(set(ids)):
        warnings.append("去重后仍有重复 id")
    if not info.get("release_date"):
        warnings.append("缺 release_date")

    n_items = 0

    def ci(secs):
        nonlocal n_items
        for s in secs:
            n_items += len(s["items"])
            ci(s["subsections"])

    ci(root["subsections"])
    info["sections"] = root["subsections"]
    stats = {"version": ver, "sections": len(ids), "items": n_items, "warnings": warnings}
    return info, stats


def vkey(t):
    try:
        return tuple(int(x) for x in t.split("."))
    except Exception:
        return (0,)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    ap.add_argument("--limit", type=int, default=10)
    ap.add_argument("--refresh", action="store_true", help="忽略本地已有版本，强制重抓")
    ap.add_argument("--report", default=None)
    a = ap.parse_args()

    out_path = os.path.join(a.root, "HD2_Wiki", "data", "wiki", "zh", "patchnotes.json")
    old, old_doc = {}, None
    if os.path.exists(out_path) and not a.refresh:
        try:
            old_doc = json.load(io.open(out_path, encoding="utf-8"))
            for v in old_doc["versions"]:
                old[v["id"]] = v
        except Exception as e:
            print("!! 旧文件解析失败，将全量重抓: %s" % e)
            old_doc = None

    d = api("action=query&list=categorymembers&cmtitle=Category%3APatch%20Notes&cmlimit=500&format=json")
    if "query" not in d:
        print("API 错误：%s" % json.dumps(d, ensure_ascii=False)[:300])
        return 2
    titles = sorted([x["title"] for x in d["query"]["categorymembers"]], key=vkey)
    picked = titles[-a.limit:][::-1]

    versions, stats = [], []
    for v in picked:
        if v in old:
            versions.append(old[v])
            stats.append({"version": v, "cached": True, "sections": 0, "items": 0, "warnings": []})
            continue
        try:
            info, st = parse_page(v)
            versions.append(info)
            stats.append(st)
        except Exception as e:
            print("!! %s 抓取失败: %s" % (v, e))
            stats.append({"version": v, "error": str(e)[:160], "warnings": ["抓取失败"]})

    doc = {
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source": INDEX_SOURCE,
        "total": len(versions),
        "versions": versions,
    }

    # ---- 幂等：内容没变就**不写盘**（只 updated_at 变不算变）----
    # 为什么必须这样：本脚本现在由 CI 定时跑（.github/workflows/fetch-patchnotes.yml），
    # 若每次只把 updated_at 刷新一遍就提交，会变成「每 2 小时一次空提交 + 一次 Pages 重建」，
    # 纯噪音（§11.3 的构建配额与 §11.1-8 的 diff 噪音都指向同一结论）。
    def stable(d):
        return json.dumps({k: v for k, v in d.items() if k != "updated_at"},
                          ensure_ascii=False, sort_keys=True)

    if old_doc is not None and stable(old_doc) == stable(doc):
        doc["updated_at"] = old_doc.get("updated_at") or doc["updated_at"]
        changed = False
    else:
        changed = True

    text = json.dumps(doc, ensure_ascii=False, indent=2) + "\n"
    json.loads(text)                                     # 先校验后写盘（§11.1-13）
    if changed:
        tmp = out_path + ".tmp"
        with io.open(tmp, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(text)
        os.replace(tmp, out_path)
    else:
        # 仍按旧内容序列化一次，保证下面的字节数与报告一致
        text = json.dumps(doc, ensure_ascii=False, indent=2) + "\n"

    lines = ["上游 Category:Patch Notes 共 %d 个版本；本次收录 %d 个（最新在前）\n" % (len(titles), len(versions))]
    for s in stats:
        if s.get("error"):
            lines.append("%-12s 抓取失败 %s" % (s["version"], s["error"]))
        elif s.get("cached"):
            lines.append("%-12s （沿用本地缓存）" % s["version"])
        else:
            lines.append("%-12s 小节=%-3d 条目=%-4d warnings=%s" % (
                s["version"], s["sections"], s["items"], s["warnings"] or "无"))
    lines.append("\n%s %s（%d B）" % ("写出" if changed else "内容无变化，未写盘：", out_path, len(text.encode("utf-8"))))

    # 本次**新抓到**的版本（用于 CI 判断要不要开 issue 提醒翻译）
    new_versions = [s["version"] for s in stats if not s.get("cached") and not s.get("error")]
    lines.append("NEW_VERSIONS: %s" % ",".join(new_versions))     # 机器可读，勿删

    body = "\n".join(lines)
    print(body)
    if a.report:
        with io.open(a.report, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(body + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
