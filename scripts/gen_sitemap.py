#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""重新生成 sitemap.xml 的「HD2_Wiki 详情页」区块。

背景
----
HD2_Wiki 的 7 个目录页（weapons / stratagems / enemies / missions /
boosters / warbonds / mechanics）里，只有 boosters.html 把详情页链接写死在
静态 HTML 中；其余 6 页的 `?id=` 链接都是运行时 `innerHTML` 注入的，属爬虫
的「第二波」发现。missions.html 更极端：它一次只渲染一个分类，默认只暴露
`main` 分类的 10 条，另外 87 条任务详情页没有任何站内入口。

因此详情页需要靠 sitemap 兜底发现。本脚本从数据文件里的真实 id 生成这些
URL，并保证重复执行不会累积、不会重复。

用法
----
    <python> scripts/gen_sitemap.py            # 原地重写 sitemap.xml
    <python> scripts/gen_sitemap.py --check    # 只打印统计，不写文件

约定
----
* 手工维护的 <url>（站点根 / HD2 主站 / 7 个目录页 / 长文档页 / bf1 工具页等）
  原样保留，脚本只负责 BEGIN/END 注释标记之间的详情页区块；
  注意这份「手工清单」在 sitemap.xml 里，**不在本脚本里** —— 本脚本对
  BEGIN 之前的内容一个字节都不改。新增手工页请直接编辑 sitemap.xml，
  若是长文档页再登记到下面的 DOC_PAGES 以便核对；
* lastmod 取「对应数据文件」的 mtime（本地日期）——机制页取该页自己的
  `<id>.json` / `<id>_zh.json`；
* changefreq 一律 monthly、priority 一律 0.5：详情页内容随游戏版本更新，
  优先级低于 sitemap 里 0.6–0.9 的目录页；
* 输出 UTF-8 无 BOM、LF 换行（GitHub Pages 要求，BOM 会让部分解析器报错）。
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WIKI = ROOT / "HD2_Wiki"
DATA = WIKI / "data" / "wiki" / "zh"
SITEMAP = ROOT / "sitemap.xml"

BASE = "https://jerry114514.github.io/HD2_Wiki/"

BEGIN = "  <!-- BEGIN HD2_Wiki 详情页（由 scripts/gen_sitemap.py 生成，请勿手工编辑） -->"
END = "  <!-- END HD2_Wiki 详情页 -->"

CHANGEFREQ = "monthly"
PRIORITY = "0.5"


# ---------------------------------------------------------------------------
# 长文档页（站内页 ←→ 仓库 .md 源文件成对出现）—— 2026-09-20 新增
#
# contributing.html / schema.html 的正文由浏览器运行时 fetch 同源的 .md 渲染，
# 正文不落库、HTML 里没有内容，所以「改了 .md 不用重新生成 sitemap」。
# 它们的 <url> 落在 BEGIN/END 之外的手工维护区（本脚本不生成），
# 这里登记一份清单，每次运行时核对「页面在 sitemap 里 + 源 .md 存在」，
# 漏了就打印 ⚠ 提示，但**不改变退出码**、也不动 sitemap 的手工区。
# 新增同类页面时：① 编辑 sitemap.xml 手工区；② 在此追加一行。
# ---------------------------------------------------------------------------
DOC_PAGES = [
    (BASE + "contributing.html", "CONTRIBUTING.md"),
    (BASE + "schema.html", "HD2_Wiki/data/wiki/zh/SCHEMA.md"),
]


def read_json(path: Path):
    with path.open("r", encoding="utf-8-sig") as fh:
        return json.load(fh)


def mtime_date(path: Path) -> str:
    return datetime.fromtimestamp(path.stat().st_mtime).date().isoformat()


def esc(url: str) -> str:
    """XML 文本节点转义；任务详情页 URL 里的 & 必须写成 &amp;。"""
    return url.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


# ---------------------------------------------------------------------------
# 各组详情页：(注释, 模板页, [(id, category|None, lastmod), ...])
# 顺序与 sitemap 里目录页的出现顺序一致：武器 / 战略配备 / 敌人 / 任务 /
# 强化资源 / 战争债券 / 机制。
# ---------------------------------------------------------------------------

def weapons_group():
    path = DATA / "weapons.json"
    ids = [w["id"] for w in read_json(path).get("weapons", [])]
    lm = mtime_date(path)
    return [{"comment": "武器详情 · %d 条 · 数据：data/wiki/zh/weapons.json" % len(ids),
             "tpl": "weapon.html",
             "items": [(i, None, lm) for i in ids]}]


def stratagems_group():
    path = DATA / "stratagems_full.json"
    ids = [s["id"] for s in read_json(path).get("stratagems", [])]
    lm = mtime_date(path)
    return [{"comment": "战略配备详情 · %d 条 · 数据：data/wiki/zh/stratagems_full.json" % len(ids),
             "tpl": "stratagem.html",
             "items": [(i, None, lm) for i in ids]}]


def enemies_group():
    """95 条 id 全部收录：其中 10 条 is_strain_page 的「亚阵营」页被
    enemies.html 的 `!e.is_strain_page` 过滤掉，且没有任何单位页链向它们，
    是彻底的孤岛页，只能靠 sitemap 发现。"""
    path = DATA / "enemies.json"
    enemies = read_json(path).get("enemies", [])
    lm = mtime_date(path)
    return [{"comment": "敌人详情 · %d 条（含 10 条无站内入口的亚阵营页）· 数据：data/wiki/zh/enemies.json" % len(enemies),
             "tpl": "enemy.html",
             "items": [(e["id"], None, lm) for e in enemies]}]


def missions_group():
    """105 条任务里有 8 个 id 同时挂在两个分类下（如 main + tactical），
    去重后 97 条。分类按 missions.json 的分类顺序取「主分类」，
    因为 mission.html 只把 category 用于面包屑/侧栏的「分类」字段。"""
    path = DATA / "missions.json"
    data = read_json(path)
    lm = mtime_date(path)
    seen: dict[str, str] = {}
    for cat in data.get("categories", []):
        for task in cat.get("tasks", []):
            seen.setdefault(task["id"], cat["id"])
    return [{"comment": "任务详情 · %d 条（105 条任务按 id 去重，8 条跨分类）· 数据：data/wiki/zh/missions.json" % len(seen),
             "tpl": "mission.html",
             "items": [(i, c, lm) for i, c in seen.items()]}]


def boosters_group():
    path = DATA / "boosters.json"
    ids = [b["id"] for b in read_json(path).get("boosters", [])]
    lm = mtime_date(path)
    return [{"comment": "强化资源详情 · %d 条 · 数据：data/wiki/zh/boosters.json" % len(ids),
             "tpl": "booster.html",
             "items": [(i, None, lm) for i in ids]}]


def warbonds_group():
    path = DATA / "warbonds.json"
    ids = [w["id"] for w in read_json(path).get("warbonds", [])]
    lm = mtime_date(path)
    return [{"comment": "战争债券详情 · %d 条 · 数据：data/wiki/zh/warbonds.json" % len(ids),
             "tpl": "warbond.html",
             "items": [(i, None, lm) for i in ids]}]


def mechanics_group():
    index = DATA / "mechanics" / "index.json"
    pages = read_json(index).get("pages", [])
    items = []
    for page in pages:
        pid = page["id"]
        stamps = [index]
        for suffix in (".json", "_zh.json"):
            candidate = DATA / "mechanics" / (pid + suffix)
            if candidate.exists():
                stamps.append(candidate)
        items.append((pid, None, mtime_date(max(stamps, key=lambda p: p.stat().st_mtime))))
    return [{"comment": "游戏机制详情 · %d 条 · 数据：data/wiki/zh/mechanics/*.json" % len(items),
             "tpl": "mechanic.html",
             "items": items}]


GROUPS = [weapons_group, stratagems_group, enemies_group,
          missions_group, boosters_group, warbonds_group, mechanics_group]


def build_block() -> tuple[str, int]:
    """返回（详情页 XML 文本, 条目数）。"""
    chunks: list[str] = [BEGIN]
    total = 0
    for factory in GROUPS:
        for group in factory():
            tpl = group["tpl"]
            chunks.append("  <!-- %s -->" % group["comment"])
            for pid, category, lastmod in group["items"]:
                url = BASE + tpl + "?id=" + pid
                if category:
                    url += "&category=" + category
                chunks.append(
                    "  <url>\n"
                    "    <loc>%s</loc>\n"
                    "    <lastmod>%s</lastmod>\n"
                    "    <changefreq>%s</changefreq>\n"
                    "    <priority>%s</priority>\n"
                    "  </url>" % (esc(url), lastmod, CHANGEFREQ, PRIORITY)
                )
                total += 1
    chunks.append(END)
    return "\n".join(chunks), total


def rebuild(text: str, block: str) -> tuple[str, int]:
    """把 block 插到 </urlset> 之前；已存在旧区块时先整体移除（幂等）。"""
    close = text.rfind("</urlset>")
    if close < 0:
        raise SystemExit("sitemap.xml 里找不到 </urlset>")

    body, tail = text[:close], text[close:]

    if BEGIN in body:
        head, _, rest = body.partition(BEGIN)
        if END not in rest:
            raise SystemExit("sitemap.xml 里 BEGIN 标记没有对应的 END 标记，请先手工修复")
        body = head
    body = body.rstrip()

    new_text = body + "\n" + block + "\n" + tail
    new_text = new_text.replace("\r\n", "\n")
    if not new_text.endswith("\n"):
        new_text += "\n"
    return new_text, new_text.count("<url>")


def check_doc_pages(sitemap_text: str) -> int:
    """核对长文档页：<url> 在 sitemap 的手工区、且源 .md 文件真实存在。

    只打印，不改退出码 —— 本脚本不负责生成手工区，发现缺失时提示人来补。
    """
    print("长文档页（站内页 ←→ 仓库 .md）：")
    missing = 0
    for url, md in DOC_PAGES:
        in_map = url in sitemap_text
        md_path = ROOT / md
        md_ok = md_path.exists()
        if not (in_map and md_ok):
            missing += 1
        print("  %s %-22s 源 .md：%s%s"
              % ("OK" if (in_map and md_ok) else "⚠ 缺",
                 url[len("https://jerry114514.github.io/"):],
                 md,
                 "" if md_ok else "（源文件不存在）"))
    if missing:
        print("  ⚠ %d 条未对齐：请把缺的 <url> 补进 sitemap.xml 的手工维护区" % missing)
    return missing


def main() -> int:
    parser = argparse.ArgumentParser(description="重新生成 sitemap.xml 的详情页区块")
    parser.add_argument("--check", action="store_true", help="只打印统计，不写文件")
    args = parser.parse_args()

    if not SITEMAP.exists():
        raise SystemExit("找不到 %s" % SITEMAP)

    original = SITEMAP.read_text(encoding="utf-8-sig")
    block, added = build_block()
    text, total = rebuild(original, block)

    print("新增详情页条目：%d" % added)
    print("sitemap <url> 总数：%d（写入前 %d）" % (total, original.count("<url>")))
    print("输出字节数：%d（写入前 %d）" % (len(text.encode("utf-8")), len(original.encode("utf-8"))))
    for factory in GROUPS:
        for group in factory():
            print("  %-28s %4d 条  lastmod=%s"
                  % (group["tpl"], len(group["items"]), group["items"][0][2]))

    check_doc_pages(text)

    if args.check:
        print("--check：未写入文件")
        return 0

    SITEMAP.write_bytes(text.encode("utf-8"))  # UTF-8 无 BOM
    print("已写入 %s" % SITEMAP)
    return 0


if __name__ == "__main__":
    sys.exit(main())
