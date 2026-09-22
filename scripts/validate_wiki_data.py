#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
HD2 中文维基 · 数据校验器（独立可复用）
================================================================================

单一职责：把 `HD2_Wiki/data/wiki/zh/` 与 `HD2-Galatic_war-Map/` 下的**社区可编辑
数据文件**逐条按 `HD2_Wiki/data/wiki/zh/SCHEMA.md` 校验，发现任何问题就以**非零
退出码**结束，让 CI（`.github/workflows/validate-data.yml`）变红。

设计目标（2026-09 定稿）
------------------------
1. **零依赖**：只用 Python 标准库，`python3 scripts/validate_wiki_data.py` 即可跑。
2. **可整体搬走**：本文件不 import 仓库内任何其它模块、不假设仓库布局固定；
   未来数据拆到独立仓库时，直接 `cp scripts/validate_wiki_data.py <新仓库>/scripts/`
   即可，用 `--wiki-dir` / `--map-dir` 指路径。
3. **不静默通过**：任何检查项失败 → 退出码 1。**没有「绿着但坏了」**：
   已知的历史例外不隐藏，而是写进 `KNOWN` 基线表并单独列出，
   基线数量只允许减少、不允许增加 —— 新增同类问题一律报错。
4. **报告面向非技术投稿者**：`文件:行 [JSON 路径] 原因 → 建议修法`，
   并按数据集汇总。

用法
----
    python scripts/validate_wiki_data.py                # 在仓库根目录跑
    python scripts/validate_wiki_data.py --strict       # 忽略基线，全部当错误
    python scripts/validate_wiki_data.py --list-checks  # 打印检查项清单
    python scripts/validate_wiki_data.py --report out.txt
    python scripts/validate_wiki_data.py \
        --wiki-dir  <数据仓库>/data/wiki/zh \
        --map-dir   <数据仓库>/map \
        --wiki-web-root <站点>/HD2_Wiki \
        --map-web-root  <站点>/HD2-Galatic_war-Map

退出码
------
    0 = 全部通过（含仅有基线项）
    1 = 存在校验失败
    2 = 用法 / 环境错误（例如目录不存在）

作用域（重要）
--------------
`HD2_Wiki/data/wiki/zh/**` 是 SCHEMA.md 管辖的**社区可编辑数据集**，规则最严。
`HD2-Galatic_war-Map/tables/**` 是**星图引擎自己的镜像表**（上游抓取），不属于
SCHEMA 管辖：顶层允许数组，`icon` 允许 wiki.gg 绝对 URL。详见下方
`TOP_MAY_BE_ARRAY` / `is_wiki_data()` 处的注释。

修订记录：首轮自测暴露的 5 个缺陷（2026-09）
--------------------------------------------
本文件第一版**从未跑过坏样本**，真数据全绿并不代表它有效。造坏样本自测后发现：

1. **`Finding.render()` 在报错时崩溃**（最严重）：一半调用点传的是路径**元组**，
   而 `render()` 用 `" [%s]" % self.path` 格式化 —— 元组被当成参数列表，
   抛 `TypeError: not all arguments converted during string formatting`。
   后果：真数据全绿（没有 error 要渲染），但**一旦发现问题就崩掉、产不出报告**，
   CI 只会看到一个语焉不详的非零退出码。
   → 修：`Finding.__init__` 统一把元组路径过 `jp()`。
2. **跨盘 `os.path.relpath` 崩溃**：`--root` 与 `--wiki-web-root` 不在同一盘符
   （Windows：C: vs E:）时抛 `ValueError`，报告生成阶段整个挂掉。
   → 修：新增 `safe_relpath()`，跨盘退化为绝对路径。
3. **跨文件引用按文件名排序边读边查 → 整类静默跳过**：`warbonds.json` 排在
   `weapons.json` **之前**，于是 `kind="weapon"` 的 `reward_refs` 永远拿不到
   `weapons.json` 的 id 集合，**整类引用从不校验**（写坏也不报错）。
   → 修：`check_wiki_files()` / `check_map_files()` 改为两遍扫描
   （先全部读取解析，再统一检查）。
4. **`ID.UNIQUE` 基线被绕过**：`check_ids_for` / `check_mission_task_dups` 直接调
   `rep.add()`，没走基线感知的 `self.add()`，于是 SCHEMA §2.1/§7.6 已登记的
   missions 8 处跨分类重复被当成 8 条错误（真数据被误判为红）。
   另外 `check_id_sets()` 在 `main()` 里晚于 `flush_aggregates()` 调用，
   id 类基线永远结算不到。→ 修：统一走 `self.add()`，并把 `check_id_sets()`
   移进 `run()` 的 `flush_aggregates()` 之前。
5. **作用域越界导致 90 条误报**：把 SCHEMA 的「顶层必须是对象」「icon 必须站内
   相对路径」套到了 `HD2-Galatic_war-Map/tables/stratagems.json`（顶层是 89 项
   数组、icon 全为 wiki.gg 绝对 URL）上。→ 修：见「作用域」。

自测方式（改本文件后请照做）：把数据复制到临时目录 → 逐例改坏 → 断言
**非零退出**且报错文案命中；纯跑真数据全绿**不能**证明校验器有效。
"""

from __future__ import annotations

import argparse
import bisect
import collections
import io
import json
import os
import re
import sys
from urllib.parse import unquote

# ---------------------------------------------------------------------------
# 常量 / 检查项登记
# ---------------------------------------------------------------------------

EXIT_OK, EXIT_FAIL, EXIT_USAGE = 0, 1, 2

CHECKS = [
    ("JSON.PARSE", "JSON 可解析（严格：无尾逗号、无注释、无 NaN/Infinity、无重复键）"),
    ("JSON.ENCODING", "UTF-8 无 BOM、LF 换行（GitHub 网页编辑器可编辑的前提）"),
    ("JSON.TOTAL", "顶层 total == 主集合长度"),
    ("ID.FORMAT", "条目 id 为小写 snake_case（mechanics 小节 id 用锚点字符集）"),
    ("ID.UNIQUE", "同一数据集内 id 唯一（missions 按分类内唯一）"),
    ("ID.SPACE", "共享 id 空间一致（loadout ⊆ stratagems_full）；跨数据集重名提示"),
    ("SCHEMA.TOP", "顶层必填字段齐备且类型正确"),
    ("SCHEMA.FIELDS", "条目级必填字段齐备（按 SCHEMA 各数据集约定）"),
    ("SCHEMA.TYPES", "枚举 / 布尔 / 数值字段类型与取值合法"),
    ("SCHEMA.ZHPAIR", "X 与 X_zh 成对出现时 JSON 类型一致（SCHEMA §5.1）"),
    ("SCHEMA.DATE", "updated_at 为 ISO8601（YYYY-MM-DD 或秒级 UTC）"),
    ("MECH.TRUNK", "mechanics 主干：sections 展平数 == toc 数、小节 id 唯一、level ∈ {2,3,4}"),
    ("MECH.PAIRING", "mechanics 覆盖：每个中文小节都有显式 id/target_id、能命中主干、同文件内声明唯一"),
    ("MECH.EXTRA", "mechanics 覆盖：不得出现主干没有的小节（zhOnly 会挂到页尾）"),
    ("REF.REWARD_REFS", "warbonds.reward_refs 的 kind/id 必须存在于目标数据集，键必须逐字等于奖励名"),
    ("REF.FACTION", "factions.enemies 必须存在于 enemies.json"),
    ("REF.TERMS", "terms.json：en 唯一、en/zh/source 非空、rejected[].zh != zh"),
    ("IMG.EXISTS", "icon/image/img/src 必须是非空、真实存在的站内相对路径（wiki 数据另禁热链）"),
    ("GUIDES.FIELDS", "enemies.guides[]（一图流）必填字段、src 前缀、source_url 必须是外站 http(s)"),
    ("PATCH.PAIRING", "patchnotes_zh 覆盖：小节 id 必须命中主干、子节同序、节内条目数必须相等（索引配对）"),
    ("PATCH.FIELDS", "patchnotes 主干：版本 id 为点分数字、title/release_date 齐备、blog_url 为外站 http(s)"),
    ("PATCH.SECTION", "patchnotes 主干：小节 id 合法且全页唯一（锚点不串位）"),
    ("LINK.EXISTS", "blocks/index 的 .html 链接目标必须真实存在"),
]

# ---------------------------------------------------------------------------
# 已知历史例外（基线）
# ---------------------------------------------------------------------------
# 用法：KEY = (校验项, 仓库相对路径) → (允许数量上限, 依据)
# 数量**超过**上限 → 错误；**减少**（说明有人修好了）→ 打印提示，不报错。
# 想在 CI 里看到全部问题：--strict

KNOWN = {
    ("IMG.HOTLINK", "HD2_Wiki/data/wiki/zh/weapons.json"): (
        89, "SCHEMA §8：weapons.json 的 icon 仍引 wiki.gg 绝对 URL，登记为「未迁移」"),
    ("IMG.HOTLINK", "HD2_Wiki/data/wiki/zh/stratagems_full.json"): (
        109, "SCHEMA §8：stratagems_full.json 的 icon 仍引 wiki.gg 绝对 URL，登记为「未迁移」"),
    ("IMG.HOTLINK", "HD2_Wiki/data/wiki/zh/loadout.json"): (
        89, "SCHEMA §8：loadout.json 的 icon 仍引 wiki.gg 绝对 URL，登记为「未迁移」"),
    ("IMG.HOTLINK", "HD2_Wiki/data/wiki/zh/missions.json"): (
        104, "SCHEMA §8：missions.json 的 icon 仍引 wiki.gg 绝对 URL，登记为「未迁移」"),
    ("ID.UNIQUE", "HD2_Wiki/data/wiki/zh/missions.json"): (
        8, "SCHEMA §2.1/§7.6：同一任务同时挂在「主体目标」与「战术目标」两个分类下，"
           "id 在分类内唯一、跨分类重复；mission.html 取后命中者。新增重复即报错"),
}

# 非路径的 icon 取值白名单（emoji / 枚举），不算死链
NON_PATH_ICON_ENUMS = {"medal", "cape"}

# 禁止站内图片热链的字段：icon 必须站内相对路径（SCHEMA §1）
ICON_MUST_BE_LOCAL = ("icon",)

PATH_FIELDS = ("icon", "image", "img", "image_thumb", "src", "thumbnail", "cover", "image_local")
LINK_FIELDS = ("link",)
IMG_SRC_RE = re.compile(r"<img\b[^>]*?\bsrc\s*=\s*[\"']([^\"']+)[\"']", re.I | re.S)
SCHEME_RE = re.compile(r"^(?:[a-zA-Z][a-zA-Z0-9+.\-]*:|//|#|data:|mailto:|javascript:)")
GLOB_RE = re.compile(r"[*?]")
SNAKE_RE = re.compile(r"^[a-z0-9_]+$")
ANCHOR_RE = re.compile(r"^[A-Za-z0-9._-]+$")
ISO_RE = re.compile(r"^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}Z?)?$")
HEX_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")
WIKI_URL_RE = re.compile(r"^https://helldivers\.wiki\.gg/wiki/")

# ---------------------------------------------------------------------------
# 数据集登记：文件 → 主集合 JSON 路径 → 条目必填字段
# ---------------------------------------------------------------------------

Z = "HD2_Wiki/data/wiki/zh/"
M = "HD2-Galatic_war-Map/"

# enemies.json 的 guides[]（一图流攻略图，SCHEMA §7.4.1，2026-09-21 登记）
# 注意：`src` 已经在 PATH_FIELDS 里，所以**图片文件是否存在**由 IMG.EXISTS 负责；
# GUIDES.FIELDS 补的是 IMG.EXISTS 管不到的部分（必填字段、站内前缀、外站 source_url 白名单）。
# `source_url` / `author_url` 都是**外站页面 URL**（视频页 / 作者主页），键名既不在
# PATH_FIELDS（不做站内存在性检查）也不在 ICON_MUST_BE_LOCAL（不判热链），
# 所以天然不会被 IMG.EXISTS / IMG.HOTLINK 判成死链 —— 无需额外豁免，只做字符串类型检查。
GUIDES_FILE = Z + "enemies.json"
GUIDES_SRC_PREFIX = "./assets/enemy-guides/"
GUIDES_REQUIRED = ("src", "title", "author", "source_url")
GUIDES_OPTIONAL = ("note", "author_url", "source_title")

# patchnotes.json / patchnotes_zh.json（更新公告，SCHEMA §7.13，2026-09-22 登记）
# 主干是**机器抓取**的上游文本（scripts/fetch_patchnotes.py），中文覆盖按「小节 id」对齐、
# 节内条目**按索引一一对应** —— 这是本项目头一次用索引配对，所以校验器**强制长度相等**：
# 上游一改条目数就立刻报错，而不是静默错位（§6.4 有过「点 A 锚点显示 B 内容」的教训）。
PATCH_TRUNK = Z + "patchnotes.json"
PATCH_ZH = Z + "patchnotes_zh.json"
PATCH_VERSION_RE = re.compile(r"^\d+(\.\d+)+$")
PATCH_ASSET_PREFIX = "./assets/patchnotes/"
PATCH_SECTION_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]*$")
# 更新名尾部的「: 7.1.0」/「：7.1.0」后缀（中英冒号都要认）
PATCH_SUFFIX_RE = re.compile(r"[:：]\s*([\d.]+)\s*$")


# ---------------------------------------------------------------------------
# 作用域：哪些规则管哪些文件
# ---------------------------------------------------------------------------
# `HD2_Wiki/data/wiki/zh/**` 是 SCHEMA.md 管辖的**社区可编辑数据集**，规则最严
# （icon 必须站内相对路径、顶层必须是对象……）。
#
# `HD2-Galatic_war-Map/tables/**` 是**星图引擎自己的镜像表**（上游 game data /
# wiki.gg 抓取，见 .github/workflows/sync-tables.yml），不属于 SCHEMA 管辖：
#   * 顶层允许是数组（实测 `tables/stratagems.json` 就是 89 项的数组）；
#   * `icon` 允许是 wiki.gg 绝对 URL（实测 `tables/stratagems.json` 89 处全为绝对 URL，
#     与同一目录的 `strat_icons.json` 的值形态一致）。
# 对这些文件只做「JSON 语法 / 编码 / 结构」校验，不做 SCHEMA 的站内路径与热链规则——
# 否则真数据会被判红（2026-09 实测：曾误报 90 条）。
#
# `M/data/campaign_zh.json` 与 `M/banner.json` 是**人工维护**的中文化层，仍按对象校验。

# 顶层允许是数组的前缀（星图镜像表）
TOP_MAY_BE_ARRAY = (M + "tables/",)


def is_wiki_data(relpath):
    """该文件是否受 SCHEMA.md 管辖（决定是否启用站内路径 / 热链规则）。"""
    return relpath.startswith(Z)


def top_may_be_array(relpath):
    return relpath.startswith(TOP_MAY_BE_ARRAY)

# 顶层必填字段
REQUIRED_TOP = {
    Z + "weapons.json": ["updated_at", "source", "total", "weapons"],
    Z + "enemies.json": ["updated_at", "source", "total", "enemies"],
    Z + "stratagems_full.json": ["updated_at", "source", "total", "stratagems"],
    Z + "boosters.json": ["updated_at", "source", "total", "boosters"],
    Z + "warbonds.json": ["updated_at", "source", "total", "warbonds"],
    Z + "loadout.json": ["updated_at", "source", "total", "types", "stratagems"],
    Z + "missions.json": ["updated_at", "source", "categories"],
    Z + "factions.json": ["updated_at", "factions", "super_earth"],
    Z + "index.json": ["id", "title", "subtitle", "blocks", "updated_at"],
    Z + "terms.json": ["updated_at", "source", "total", "terms"],
    Z + "blocks/about.json": ["id", "title", "content", "features", "updated_at"],
    Z + "blocks/beginners.json": ["id", "title", "sections", "updated_at"],
    Z + "blocks/navigation.json": ["id", "title", "categories", "updated_at"],
    Z + "blocks/welcome.json": ["id", "type", "title", "subtitle", "content", "buttons", "updated_at"],
    Z + "mechanics/index.json": ["pages", "updated_at"],
    M + "data/campaign_zh.json": ["_meta", "status", "reward_types", "episodes", "factions"],
    M + "banner.json": ["items"],
}

# total 检查：文件 → (total 字段, 主集合 JSON 路径)
TOTAL_CHECK = {
    Z + "weapons.json": ("weapons",),
    Z + "enemies.json": ("enemies",),
    Z + "stratagems_full.json": ("stratagems",),
    Z + "boosters.json": ("boosters",),
    Z + "warbonds.json": ("warbonds",),
    Z + "loadout.json": ("stratagems",),
    Z + "terms.json": ("terms",),
}

# 条目必填字段：文件 → (具名集合的 JSON 路径, 必填字段)
REQUIRED_ITEMS = {
    Z + "weapons.json": (("weapons",), [
        "id", "name", "name_en", "category", "subcategory", "subcategory_name",
        "stats_short", "stats_full", "traits", "unlock", "description", "lore",
        "variants", "tips", "related", "source_url", "detailed_stats", "icon",
    ]),
    Z + "enemies.json": (("enemies",), [
        "id", "name", "name_zh", "faction", "faction_label", "image", "description",
        "category", "health_total", "damage", "damage_type", "fire_damage_multiplier",
        "stagger_threshold", "minimum_difficulty", "body_parts", "weak_points",
        "attacks", "behavior", "spawn", "drops", "source_page", "strain", "image_thumb",
    ]),
    Z + "stratagems_full.json": (("stratagems",), [
        "id", "name", "name_en", "category", "category_label", "code", "call_in_time",
        "cooldown", "uses", "unlock", "image", "description", "source_page",
        "detailed_stats", "icon",
    ]),
    Z + "boosters.json": (("boosters",), [
        "id", "name", "name_en", "icon", "warbond", "warbond_zh", "warbond_page",
        "warbond_color", "price", "price_zh", "description", "description_zh",
        "overview_zh", "sections", "tables", "related", "source_url",
    ]),
    Z + "warbonds.json": (("warbonds",), [
        "id", "name", "name_en", "name_zh_tbd", "icon", "type", "price", "price_zh",
        "release_date", "release_status", "pages", "credit_claim", "credit_claim_zh",
        "overview_zh", "intro_zh", "tables", "source_url",
    ]),
    Z + "loadout.json": (("stratagems",), [
        "id", "name", "type", "stats", "bonus", "subtag", "icon",
    ]),
    Z + "missions.json": (("categories",), ["id", "name", "name_zh", "tasks"]),
    Z + "factions.json": (("factions",), ["id", "name", "name_zh", "color", "strains", "enemies"]),
    Z + "terms.json": (("terms",), ["en", "zh", "source"]),
    Z + "mechanics/index.json": (("pages",), ["id", "title", "title_en", "description", "icon"]),
    M + "data/campaign_zh.json": (("_episodes",), ["title"]),
}

# 嵌套集合的必填字段（父集合路径, 子集合键, 字段）
NESTED_REQUIRED = [
    (Z + "missions.json", ("categories",), "tasks",
     ["id", "name", "name_zh", "icon", "difficulty", "difficulty_zh", "faction",
      "time_limit", "steps", "steps_zh", "tactical_info", "tactical_info_zh"]),
    (Z + "enemies.json", ("enemies",), "body_parts",
     ["part_id", "name", "name_en", "health", "armor_level", "location", "durable",
      "percent_to_main", "overflow_cap", "constitution", "fatal", "is_weak_point",
      "count", "image", "armor_level_zh"]),
]

# 具名集合的 id 检查
ID_SETS = [
    (Z + "weapons.json", ("weapons",), "weapons"),
    (Z + "enemies.json", ("enemies",), "enemies"),
    (Z + "stratagems_full.json", ("stratagems",), "stratagems_full"),
    (Z + "boosters.json", ("boosters",), "boosters"),
    (Z + "warbonds.json", ("warbonds",), "warbonds"),
    (Z + "loadout.json", ("stratagems",), "loadout"),
    (Z + "factions.json", ("factions",), "factions"),
    (Z + "mechanics/index.json", ("pages",), "mechanics/index"),
]

MECH_DIR = Z + "mechanics/"
MECH_COVERAGE = {
    "damage": "damage_zh.json",
    "difficulty": "difficulty_zh.json",
    "galactic_war": "galactic_war_zh.json",
    "galactic_war_history": "galactic_war_history_zh.json",
    "status_effects": "status_effects_zh.json",
}

# ---------------------------------------------------------------------------
# 结果收集
# ---------------------------------------------------------------------------


class Finding(object):
    __slots__ = ("check", "severity", "file", "line", "path", "what", "fix")

    def __init__(self, check, severity, file, path, what, fix, line=None):
        self.check = check
        self.severity = severity          # error | baseline | info
        self.file = file
        # 调用方有两种写法：走 Validator.add() 的传的是 jp() 之后的字符串，
        # 直接走 Report.add() 的传的是路径元组（如 ("weapons", 5, "id")）。
        # 这里统一成字符串 —— 否则 render() 里的 " %s" % tuple 会在**报错时**
        # 抛 TypeError 让校验器整个崩掉（2026-09 自测发现：19 条错误路径全部崩）。
        if isinstance(path, (tuple, list)):
            path = jp(tuple(path))
        self.path = path or ""
        self.what = what
        self.fix = fix
        self.line = line

    def render(self):
        loc = self.file
        if self.line:
            loc += ":%d" % self.line
        p = (" [%s]" % self.path) if self.path else ""
        return "%s%s %s\n      → 建议：%s" % (loc, p, self.what, self.fix)


class Report(object):
    def __init__(self):
        self.findings = []

    def add(self, check, file, path, what, fix, line=None):
        self.findings.append(Finding(check, "error", file, path, what, fix, line))

    def add_baseline(self, check, file, path, what, fix, line=None):
        self.findings.append(Finding(check, "baseline", file, path, what, fix, line))

    def add_info(self, check, file, what, fix=""):
        self.findings.append(Finding(check, "info", file, "", what, fix))

    @property
    def errors(self):
        return [f for f in self.findings if f.severity == "error"]

    @property
    def baselines(self):
        return [f for f in self.findings if f.severity == "baseline"]

    @property
    def infos(self):
        return [f for f in self.findings if f.severity == "info"]


# ---------------------------------------------------------------------------
# 位置索引：为 JSON 路径提供行号（仅用于报告；失败则退化为「无行号」）
# ---------------------------------------------------------------------------


class Locator(object):
    def __init__(self, text):
        self.t = text
        self.n = len(text)
        self.nl = [i for i, c in enumerate(text) if c == "\n"]
        self.i = 0

    def _line(self, pos):
        return bisect.bisect_right(self.nl, pos) + 1

    def _ws(self):
        t, n = self.t, self.n
        i = self.i
        while i < n and t[i] in " \t\r\n":
            i += 1
        self.i = i

    def _str(self):
        t, n = self.t, self.n
        i = self.i + 1
        while i < n:
            c = t[i]
            if c == "\\":
                i += 2
                continue
            if c == '"':
                self.i = i + 1
                return
            i += 1
        raise ValueError("unterminated string")

    def _value(self):
        self._ws()
        if self.i >= self.n:
            raise ValueError("eof")
        start = self.i
        c = self.t[self.i]
        if c == "{":
            return self._obj(start)
        if c == "[":
            return self._arr(start)
        if c == '"':
            self._str()
            return {"line": self._line(start), "t": "v"}
        i = self.i
        while i < self.n and self.t[i] not in ",]} \t\r\n":
            i += 1
        self.i = i
        return {"line": self._line(start), "t": "v"}

    def _obj(self, start):
        node = {"line": self._line(start), "t": "o", "k": []}
        self.i += 1
        self._ws()
        if self.t[self.i] == "}":
            self.i += 1
            return node
        while True:
            self._ws()
            ks = self.i
            self._str()
            key = json.loads(self.t[ks:self.i])
            self._ws()
            self.i += 1                      # ':'
            child = self._value()
            node["k"].append((key, child))
            self._ws()
            ch = self.t[self.i]
            self.i += 1
            if ch == "}":
                return node

    def _arr(self, start):
        node = {"line": self._line(start), "t": "a", "i": []}
        self.i += 1
        self._ws()
        if self.t[self.i] == "]":
            self.i += 1
            return node
        while True:
            node["i"].append(self._value())
            self._ws()
            ch = self.t[self.i]
            self.i += 1
            if ch == "]":
                return node

    def build(self):
        self.i = 0
        return self._value()


def line_for(tree, path):
    node = tree
    for seg in path:
        if node is None:
            return None
        if isinstance(seg, int):
            if node.get("t") != "a" or seg >= len(node["i"]):
                return None
            node = node["i"][seg]
        else:
            if node.get("t") != "o":
                return None
            for k, ch in node["k"]:
                if k == seg:
                    node = ch
                    break
            else:
                return None
    return node.get("line")


# ---------------------------------------------------------------------------
# 读取 / 遍历工具
# ---------------------------------------------------------------------------


class DupKeyError(ValueError):
    pass


def _pairs(pairs):
    seen = collections.Counter(k for k, _ in pairs)
    dups = [k for k, c in seen.items() if c > 1]
    if dups:
        raise DupKeyError("重复的对象键：%s" % ", ".join(repr(d) for d in dups))
    return collections.OrderedDict(pairs)


def _bad_const(name):
    raise ValueError("非标准 JSON 常量 %s（JSON 规范不允许 NaN/Infinity，请改用 null）" % name)


def load_json(text):
    return json.loads(text, object_pairs_hook=_pairs, parse_constant=_bad_const)


def dig(obj, path):
    """按路径取值；任何一级缺失返回 _MISSING。"""
    cur = obj
    for seg in path:
        if isinstance(seg, int):
            if not isinstance(cur, list) or seg >= len(cur):
                return _MISSING
            cur = cur[seg]
        else:
            if not isinstance(cur, dict) or seg not in cur:
                return _MISSING
            cur = cur[seg]
    return cur


class _Missing(object):
    def __repr__(self):
        return "<missing>"


_MISSING = _Missing()


def walk_strings(obj, path=()):
    """产出 (path_tuple, 字符串值)。"""
    if isinstance(obj, dict):
        for k, v in obj.items():
            for r in walk_strings(v, path + (k,)):
                yield r
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            for r in walk_strings(v, path + (i,)):
                yield r
    elif isinstance(obj, str):
        yield path, obj


def safe_relpath(path, root):
    """os.path.relpath 的 Windows 跨盘安全版（E: 与 C: 之间会抛 ValueError）。

    报告里只想显示一个短路径；跨盘时退化为绝对路径也比整个校验器崩掉强。
    """
    try:
        return os.path.relpath(path, root)
    except ValueError:
        return path


def jp(path):
    """JSON 指针风格的可读路径。"""
    out = "$"
    for seg in path:
        out += ("[%d]" % seg) if isinstance(seg, int) else ("." + seg)
    return out


def is_local_path(v):
    return not SCHEME_RE.match(v)


def strip_query(v):
    for ch in ("#", "?"):
        i = v.find(ch)
        if i >= 0:
            v = v[:i]
    return v


# ---------------------------------------------------------------------------
# 校验器
# ---------------------------------------------------------------------------


class Validator(object):
    def __init__(self, opts, rep):
        self.o = opts
        self.rep = rep
        self.baseline_hits = collections.Counter()
        self.texts = {}          # 仓库相对路径 → 文本
        self.locs = {}           # 仓库相对路径 → Locator 树（或 None）
        self.values = {}         # 仓库相对路径 → 解析结果
        self.parsed_ok = set()

    # ---- 基础设施 ---------------------------------------------------------

    def rel(self, abspath, base):
        return safe_relpath(abspath, self.o.root).replace("\\", "/")

    def read(self, relpath):
        """读取并缓存；返回 (text, ok)。"""
        if relpath in self.texts:
            return self.texts[relpath], relpath in self.parsed_ok
        abspath = os.path.join(self.o.root, relpath.replace("/", os.sep))
        try:
            with open(abspath, "rb") as fh:
                raw = fh.read()
        except OSError as e:
            self.rep.add("JSON.PARSE", relpath, "", "读取失败：%s" % e, "确认文件存在且可读")
            self.texts[relpath] = ""
            return "", False

        # 编码 / 换行
        if raw[:3] == b"\xef\xbb\xbf":
            self.rep.add("JSON.ENCODING", relpath, "",
                         "文件带 UTF-8 BOM",
                         "用「UTF-8（无 BOM）」重新保存；GitHub 网页编辑器不会写 BOM")
        if b"\r" in raw:
            self.rep.add("JSON.ENCODING", relpath, "",
                         "包含 CR（Windows 换行 CRLF）",
                         "改为 LF 换行：`python scripts/validate_wiki_data.py --fix-hint`，"
                         "或编辑器里设 End of Line = LF")
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError as e:
            self.rep.add("JSON.ENCODING", relpath, "",
                         "不是合法的 UTF-8：%s" % e,
                         "以 UTF-8 保存（不要用 GBK/ANSI）")
            self.texts[relpath] = ""
            return "", False

        self.texts[relpath] = text

        # 解析
        try:
            obj = load_json(text)
        except DupKeyError as e:
            self.rep.add("JSON.PARSE", relpath, "", str(e),
                         "同一对象里不能出现两个同名键；删除其中一个")
            return text, False
        except ValueError as e:
            line = None
            m = re.search(r"line (\d+)", str(e))
            if m:
                line = int(m.group(1))
            self.rep.add("JSON.PARSE", relpath, "",
                         "JSON 解析失败：%s" % e,
                         "常见原因：结尾多逗号、缺右括号、用了中文引号、"
                         "单引号、注释（JSON 不支持注释）", line)
            return text, False

        self.values[relpath] = obj
        self.parsed_ok.add(relpath)
        try:
            loc = Locator(text)
            self.locs[relpath] = loc.build()
        except Exception:
            self.locs[relpath] = None
        return text, True

    def line(self, relpath, path):
        return line_for(self.locs.get(relpath), path)

    def add(self, check, relpath, path, what, fix):
        line = self.line(relpath, path) if path else None
        # 基线判定
        key = (check, relpath)
        if key in KNOWN and not self.o.strict:
            self.baseline_hits[key] += 1
            self.rep.add_baseline(check, relpath, jp(path), what, fix, line)
        else:
            self.rep.add(check, relpath, jp(path), what, fix, line)

    def add_agg(self, check, relpath, what, fix):
        """聚合项：超过基线上限才报错。"""
        key = (check, relpath)
        cnt = self.baseline_hits[key]
        limit, why = KNOWN[key]
        if cnt > limit:
            self.rep.add(check, relpath, "",
                         "%s（%d 处；已登记的基线上限为 %d）" % (what, cnt, limit),
                         fix)
        elif cnt < limit:
            self.rep.add_info(check, relpath,
                              "%s：现 %d 处，基线登记为 %d 处（比基线更少，"
                              "可顺手把 KNOWN 表里的 %d 下调）" % (why, cnt, limit, cnt))

    # ---- 主流程 -----------------------------------------------------------

    def run(self):
        self.check_wiki_files()
        self.check_map_files()
        self.check_mechanics()
        self.check_patchnotes()
        # 必须在 flush_aggregates 之前：id 类检查也会命中 KNOWN 基线，
        # 若放在 main() 里晚于 flush_aggregates()，基线计数永远不会被结算
        #（2026-09 修正：曾因此把 missions.json 已登记的 8 处跨分类重复报成错误）。
        self.check_id_sets()
        self.flush_aggregates()

    def wiki_json_files(self):
        base = os.path.join(self.o.wiki_dir)
        out = []
        for dp, dn, fn in os.walk(base):
            dn[:] = sorted(d for d in dn if d not in ("node_modules", ".git", "fetch_reports"))
            for f in sorted(fn):
                if f.endswith(".json") and not f.endswith(".min.json"):
                    ab = os.path.join(dp, f)
                    out.append(self.rel(ab, self.o.root))
        return sorted(out)

    def map_json_files(self):
        out = []
        td = os.path.join(self.o.map_dir, "tables")
        if os.path.isdir(td):
            for f in sorted(os.listdir(td)):
                if f.endswith(".json") and not f.endswith(".min.json"):
                    out.append(self.rel(os.path.join(td, f), self.o.root))
        for extra in ("data/campaign_zh.json", "banner.json"):
            ab = os.path.join(self.o.map_dir, extra.replace("/", os.sep))
            if os.path.exists(ab):
                out.append(self.rel(ab, self.o.root))
        return sorted(set(out))

    def check_wiki_files(self):
        files = self.wiki_json_files()
        # 第一遍：全部读取 + 解析。跨文件引用（warbonds.reward_refs → weapons/
        # stratagems_full/boosters、factions.enemies → enemies）必须能拿到**所有**
        # 解析结果；若边读边查，"warbonds.json" 排在 "weapons.json" 之前，目标数据集
        # 尚未解析，于是 kind="weapon" 的 reward_refs **整类静默跳过不校验**
        #（2026-09 自测发现：故意写坏 reward_refs 的 weapon id，校验器仍然全绿）。
        for relpath in files:
            self.read(relpath)
        # 第二遍：检查
        for relpath in files:
            if relpath not in self.parsed_ok:
                continue
            self.check_top(relpath)
            self.check_items(relpath)
            self.check_nested(relpath)
            self.check_terms(relpath)
            self.check_reward_refs(relpath)
            self.check_factions(relpath)
            self.check_promoted_types(relpath)
            self.check_paths(relpath, self.o.wiki_web_root)
            self.check_guides(relpath)
            self.check_links(relpath, self.o.wiki_web_root)

    def check_map_files(self):
        files = self.map_json_files()
        for relpath in files:
            self.read(relpath)
        for relpath in files:
            if relpath not in self.parsed_ok:
                continue
            self.check_top(relpath)
            self.check_promoted_types(relpath)
            self.check_paths(relpath, self.o.map_web_root)
            self.check_campaign(relpath)

    # ---- 各检查项 ---------------------------------------------------------

    def check_top(self, relpath):
        obj = self.values[relpath]
        if not isinstance(obj, dict):
            if isinstance(obj, list) and top_may_be_array(relpath):
                # 星图镜像表（tables/*.json）顶层就是数组，合法
                return
            if isinstance(obj, list):
                self.rep.add("SCHEMA.TOP", relpath, "",
                             "顶层必须是 JSON 对象（{...}），当前是数组（[...]，%d 项）"
                             % len(obj),
                             "按 SCHEMA.md §2 用 { } 包住最外层，主集合放在具名键下")
            else:
                self.rep.add("SCHEMA.TOP", relpath, "",
                             "顶层必须是 JSON 对象（{...}），当前是 %s" % type(obj).__name__,
                             "用 { } 包住最外层（SCHEMA §2）")
            return
        for k in REQUIRED_TOP.get(relpath, []):
            if k not in obj:
                self.rep.add("SCHEMA.TOP", relpath, (k,),
                             "缺少顶层必填字段 %r" % k,
                             "按 SCHEMA.md §2 / §7 补上该字段")
        if "updated_at" in obj and isinstance(obj["updated_at"], str):
            if not ISO_RE.match(obj["updated_at"]):
                self.rep.add("SCHEMA.DATE", relpath, ("updated_at",),
                             "updated_at 不是 ISO8601：%r" % obj["updated_at"],
                             "canonical 写法 YYYY-MM-DDTHH:MM:SSZ（UTC 秒级）")
        # total
        spec = TOTAL_CHECK.get(relpath)
        if spec and isinstance(obj.get("total"), int):
            arr = obj.get(spec[0])
            if isinstance(arr, list) and obj["total"] != len(arr):
                self.rep.add("JSON.TOTAL", relpath, ("total",),
                             "total = %d，但 %s 数组长度 = %d" % (obj["total"], spec[0], len(arr)),
                             "把 total 改成数组实际长度（目录页计数以此为准）")

    def check_items(self, relpath):
        spec = REQUIRED_ITEMS.get(relpath)
        if not spec:
            return
        obj = self.values[relpath]

        if relpath == M + "data/campaign_zh.json":
            eps = obj.get("episodes")
            if isinstance(eps, dict):
                for k, v in eps.items():
                    if not isinstance(v, dict) or not v.get("title"):
                        self.rep.add("SCHEMA.FIELDS", relpath, ("episodes", k),
                                     "战役 %s 缺少非空 title" % k,
                                     "按 SCHEMA §7.13 补 `title`（中文战役名）")
            return

        path, fields = spec
        items = dig(obj, path)
        if not isinstance(items, list):
            return
        for i, it in enumerate(items):
            if not isinstance(it, dict):
                self.rep.add("SCHEMA.FIELDS", relpath, path + (i,),
                             "元素必须是对象", "用 { ... } 书写条目")
                continue
            for f in fields:
                if f not in it:
                    self.rep.add("SCHEMA.FIELDS", relpath, path + (i,),
                                 "条目 %r 缺少必填字段 %r" % (it.get("id") or it.get("en") or it.get("name") or i, f),
                                 "按 SCHEMA.md 第 3 节 / 第 7 节补齐 %r" % f)

    def check_nested(self, relpath):
        obj = self.values[relpath]
        for file_, path, childkey, fields in NESTED_REQUIRED:
            if file_ != relpath:
                continue
            parents = dig(obj, path)
            if not isinstance(parents, list):
                continue
            for i, p in enumerate(parents):
                if not isinstance(p, dict):
                    continue
                kids = p.get(childkey)
                if not isinstance(kids, list):
                    continue
                for j, k in enumerate(kids):
                    if not isinstance(k, dict):
                        continue
                    for f in fields:
                        if f not in k:
                            label = k.get("id") or k.get("part_id") or j
                            self.rep.add("SCHEMA.FIELDS", relpath, path + (i, childkey, j),
                                         "%s[%d].%s 下的条目 %r 缺少必填字段 %r"
                                         % (".".join(str(s) for s in path), i, childkey, label, f),
                                         "按 SCHEMA.md 第 6/7 节补齐；enemies 部位用 part_id")

    # --- id 相关 ---

    def check_ids_for(self, relpath, path, label):
        obj = self.values[relpath]
        items = dig(obj, path)
        if not isinstance(items, list):
            return
        seen = {}
        for i, it in enumerate(items):
            if not isinstance(it, dict):
                continue
            v = it.get("id")
            if not isinstance(v, str) or not v:
                self.add("ID.FORMAT", relpath, path + (i,),
                         "%s 第 %d 项的 id 缺失或不是字符串（%r）" % (label, i, v),
                         "每个条目必须有 string 类型的 id，小写 snake_case，例如 ar_2_coyote")
                continue
            if not SNAKE_RE.match(v):
                self.add("ID.FORMAT", relpath, path + (i, "id"),
                         "%s 的 id %r 不是小写 snake_case" % (label, v),
                         "只允许小写字母、数字、下划线：把连字符改成下划线、去掉大写与空格")
            if v in seen:
                self.add("ID.UNIQUE", relpath, path + (i, "id"),
                         "%s 内 id %r 重复（第 %d 项与第 %d 项）" % (label, v, seen[v], i),
                         "同一数据集内 id 必须唯一：改掉其中一个，或确认是否重复粘贴")
            else:
                seen[v] = i

    def check_id_sets(self):
        for relpath, path, label in ID_SETS:
            if relpath in self.parsed_ok:
                self.check_ids_for(relpath, path, label)
        # missions：分类内唯一 + tasks 内唯一
        rel = Z + "missions.json"
        if rel in self.parsed_ok:
            self.check_ids_for(rel, ("categories",), "missions.categories")
            obj = self.values[rel]
            for i, c in enumerate(obj.get("categories", [])):
                if not isinstance(c, dict):
                    continue
                self.check_ids_for(rel, ("categories", i, "tasks"),
                                   "missions.categories[%d].tasks" % i)
            self.check_mission_task_dups(rel, obj)
        # 共享 id 空间
        rel_l = Z + "loadout.json"
        rel_s = Z + "stratagems_full.json"
        if rel_l in self.parsed_ok and rel_s in self.parsed_ok:
            lo = {x.get("id") for x in self.values[rel_l].get("stratagems", []) if isinstance(x, dict)}
            sf = {x.get("id") for x in self.values[rel_s].get("stratagems", []) if isinstance(x, dict)}
            for missing in sorted(lo - sf):
                self.add("ID.SPACE", rel_l, ("stratagems",),
                         "loadout 的 id %r 在 stratagems_full.json 中不存在" % missing,
                         "两个文件共用同一 id 空间（SCHEMA §2.1）：先在 stratagems_full.json 建条目")
        # 跨数据集重名（提示级）
        spaces = {}
        for relpath, path, label in ID_SETS:
            if relpath not in self.parsed_ok:
                continue
            ids = {x.get("id") for x in dig(self.values[relpath], path) or []
                   if isinstance(x, dict) and isinstance(x.get("id"), str)}
            if ids:
                spaces[label] = ids
        names = sorted(spaces)
        dup_pairs = []
        for a in range(len(names)):
            for b in range(a + 1, len(names)):
                ov = spaces[names[a]] & spaces[names[b]]
                if ov:
                    dup_pairs.append((names[a], names[b], sorted(ov)[:5]))
        if dup_pairs:
            self.rep.add_info("ID.SPACE",
                              "（跨数据集）",
                              "不同数据集出现同名 id（不一定是错，详情页 URL 带数据集前缀）：%s"
                              % "; ".join("%s ∩ %s = %s" % p for p in dup_pairs))

    def check_mission_task_dups(self, rel, obj):
        byid = collections.defaultdict(list)
        for c in obj.get("categories", []):
            if not isinstance(c, dict):
                continue
            for t in c.get("tasks", []) or []:
                if isinstance(t, dict) and isinstance(t.get("id"), str):
                    byid[t["id"]].append(c.get("id"))
        for tid, cats in sorted(byid.items()):
            if len(cats) > 1:
                self.add("ID.UNIQUE", rel, ("categories",),
                         "任务 id %r 同时出现在分类 %s 下" % (tid, cats),
                         "mission.html 按 id 查任务时只保留最后一个命中；"
                         "若确为「同一任务挂多个分类」，请在 KNOWN 表登记，否则请改名")

    # --- terms ---

    def check_terms(self, relpath):
        if relpath != Z + "terms.json":
            return
        obj = self.values[relpath]
        terms = obj.get("terms")
        if not isinstance(terms, list):
            return
        seen = {}
        for i, t in enumerate(terms):
            if not isinstance(t, dict):
                continue
            for f in ("en", "zh", "source"):
                v = t.get(f)
                if not isinstance(v, str) or not v.strip():
                    self.rep.add("REF.TERMS", relpath, ("terms", i, f),
                                 "术语第 %d 项（en=%r）的 %s 为空或不是字符串"
                                 % (i, t.get("en"), f),
                                 "en / zh / source 三者必须都是非空字符串（SCHEMA §7.12）")
            en = t.get("en")
            if isinstance(en, str):
                if en in seen:
                    self.rep.add("REF.TERMS", relpath, ("terms", i, "en"),
                                 "术语英文键 %r 重复（第 %d 项与第 %d 项）" % (en, seen[en], i),
                                 "同一 en 只能有一条；不同写法合并进同一条并在 note 里说明")
                else:
                    seen[en] = i
            rej = t.get("rejected")
            if isinstance(rej, list):
                for j, r in enumerate(rej):
                    if isinstance(r, dict) and r.get("zh") == t.get("zh"):
                        self.rep.add("REF.TERMS", relpath, ("terms", i, "rejected", j),
                                     "rejected 里的 %r 与 zh 相同（等于没淘汰）" % r.get("zh"),
                                     "rejected 只放**被淘汰**的写法；与 zh 相同的请删掉")

    # --- 引用完整性 ---

    def check_reward_refs(self, relpath):
        if relpath != Z + "warbonds.json":
            return
        obj = self.values[relpath]
        targets = {}
        for rel, path, kind in ((Z + "weapons.json", ("weapons",), "weapon"),
                                (Z + "stratagems_full.json", ("stratagems",), "stratagem"),
                                (Z + "boosters.json", ("boosters",), "booster")):
            if rel in self.parsed_ok:
                targets[kind] = {x.get("id") for x in dig(self.values[rel], path) or []
                                 if isinstance(x, dict)}
            else:
                targets[kind] = None
        for i, w in enumerate(obj.get("warbonds", [])):
            if not isinstance(w, dict):
                continue
            rr = w.get("reward_refs")
            if not isinstance(rr, dict):
                continue
            rows = set()
            for t in w.get("tables", []) or []:
                if isinstance(t, dict):
                    for r in t.get("rows", []) or []:
                        if isinstance(r, list) and r:
                            rows.add(r[0])
            for k, v in rr.items():
                if not isinstance(v, dict):
                    continue
                if k not in rows:
                    self.rep.add("REF.REWARD_REFS", relpath, ("warbonds", i, "reward_refs", k),
                                 "键 %r 不是该债券任何 tables[].rows[i][0] 的值" % k,
                                 "键必须与奖励英文名**逐字一致**（SCHEMA §7.2）")
                kind = v.get("kind")
                if kind not in ("weapon", "stratagem", "booster"):
                    self.rep.add("REF.REWARD_REFS", relpath, ("warbonds", i, "reward_refs", k, "kind"),
                                 "kind = %r 不在 {weapon, stratagem, booster} 内" % kind,
                                 "改成三者之一")
                    continue
                pool = targets.get(kind)
                if pool is not None and v.get("id") not in pool:
                    self.rep.add("REF.REWARD_REFS", relpath,
                                 ("warbonds", i, "reward_refs", k, "id"),
                                 "id %r 在对应数据集（%s）中不存在" % (v.get("id"), kind),
                                 "改成目标数据集中真实存在的 id；匹配不上就不要登记（保持纯文本）")

    def check_factions(self, relpath):
        if relpath != Z + "factions.json":
            return
        if Z + "enemies.json" not in self.parsed_ok:
            return
        obj = self.values[relpath]
        pool = {x.get("id") for x in self.values[Z + "enemies.json"].get("enemies", [])
                if isinstance(x, dict)}
        def scan(path, ids):
            for e in ids or []:
                if e not in pool:
                    self.rep.add("REF.FACTION", relpath, path,
                                 "引用不存在的敌人 id %r" % e,
                                 "改为 enemies.json 中真实存在的 id")
        for i, f in enumerate(obj.get("factions", [])):
            if isinstance(f, dict):
                scan(("factions", i, "enemies"), f.get("enemies"))
        se = obj.get("super_earth")
        if isinstance(se, dict):
            scan(("super_earth", "enemies"), se.get("enemies"))

    # --- 枚举 / 类型 ---

    def check_promoted_types(self, relpath):
        obj = self.values[relpath]

        def each(rel, path):
            if rel != relpath:
                return
            items = dig(obj, path)
            if isinstance(items, list):
                for i, it in enumerate(items):
                    if isinstance(it, dict):
                        yield i, it

        for i, w in each(Z + "warbonds.json", ("warbonds",)):
            if w.get("type") not in ("Standard", "Premium", "Legendary"):
                self.rep.add("SCHEMA.TYPES", relpath, ("warbonds", i, "type"),
                             "type = %r 不在 {Standard, Premium, Legendary} 内" % w.get("type"),
                             "按 SCHEMA §7.2 使用英文枚举值")
            if not isinstance(w.get("name_zh_tbd"), bool):
                self.rep.add("SCHEMA.TYPES", relpath, ("warbonds", i, "name_zh_tbd"),
                             "name_zh_tbd 必须是 JSON 布尔（true/false），当前 %r" % w.get("name_zh_tbd"),
                             "不要写 \"true\" 字符串")
            if isinstance(w.get("pages"), int) and isinstance(w.get("tables"), list) \
                    and w["pages"] != len(w["tables"]):
                self.rep.add("SCHEMA.TYPES", relpath, ("warbonds", i, "pages"),
                             "pages = %d，但 tables 有 %d 个元素（一页一表）" % (w["pages"], len(w["tables"])),
                             "补齐/删除逐页奖励表，使元素个数 == pages")
            for j, t in enumerate(w.get("tables", []) or []):
                if not isinstance(t, dict):
                    continue
                if t.get("headers") != ["奖励", "类型", "勋章价格"]:
                    self.rep.add("SCHEMA.TYPES", relpath, ("warbonds", i, "tables", j, "headers"),
                                 "headers 不是 [\"奖励\",\"类型\",\"勋章价格\"]（当前 %r）" % (t.get("headers"),),
                                 "逐页奖励表的列头固定三列（SCHEMA §7.2）")
                for k, r in enumerate(t.get("rows", []) or []):
                    if not isinstance(r, list) or len(r) != 3:
                        self.rep.add("SCHEMA.TYPES", relpath,
                                     ("warbonds", i, "tables", j, "rows", k),
                                     "数据行必须恒为 3 个元素（当前 %s）"
                                     % (len(r) if isinstance(r, list) else type(r).__name__),
                                     "奖励引用只能走 reward_refs，禁止往行里追加第 4 个元素")

        for i, w in each(Z + "warbonds.json", ("warbonds",)):
            pass
        for i, b in each(Z + "boosters.json", ("boosters",)):
            c = b.get("warbond_color")
            if not isinstance(c, str) or not HEX_RE.match(c):
                self.rep.add("SCHEMA.TYPES", relpath, ("boosters", i, "warbond_color"),
                             "warbond_color = %r 不是 #RRGGBB" % (c,),
                             "写成 6 位十六进制，例如 #6C7A89")
        for i, s in each(Z + "loadout.json", ("stratagems",)):
            st = s.get("stats")
            if not isinstance(st, list) or len(st) != 4 or \
                    not all(isinstance(x, (int, float)) and not isinstance(x, bool) for x in st):
                self.rep.add("SCHEMA.TYPES", relpath, ("stratagems", i, "stats"),
                             "stats 必须是 4 个数字的数组（当前 %r）" % (st,),
                             "四维评分，缺一维就用 0，不要写 null")
        for relpath2 in (Z + "warbonds.json", Z + "boosters.json", Z + "weapons.json",
                         Z + "stratagems_full.json", Z + "enemies.json", Z + "missions.json"):
            if relpath2 != relpath:
                continue
            for path, v in walk_strings(obj):
                if path and path[-1] == "release_status":
                    if v not in ("released", "unreleased"):
                        self.rep.add("SCHEMA.TYPES", relpath, path,
                                     "release_status = %r 不是 released / unreleased" % v,
                                     "缺省视为 released，不必书写；未发布写 \"unreleased\"")

        # X / X_zh 类型一致
        if relpath in (Z + "boosters.json", Z + "warbonds.json", Z + "enemies.json",
                       Z + "weapons.json", Z + "stratagems_full.json", Z + "missions.json"):
            TH = {"string": str, "number": (int, float), "boolean": bool,
                  "array": list, "object": dict, "null": type(None)}
            def walk_pairs(node, path=()):
                if isinstance(node, dict):
                    for k, v in node.items():
                        if k.endswith("_zh") and k[:-3] in node:
                            a, b = node[k[:-3]], v
                            ta, tb = TH.get(type(a).__name__), TH.get(type(b).__name__)
                            if ta and tb and ta is not tb and not (
                                    isinstance(a, (int, float)) and isinstance(b, (int, float))):
                                self.rep.add("SCHEMA.ZHPAIR", relpath, path + (k,),
                                             "%s 与 %s 的 JSON 类型不一致（%s vs %s）"
                                             % (k[:-3], k, type(a).__name__, type(b).__name__),
                                             "`_zh` 字段必须与主字段同结构、同语义（SCHEMA §5.1）")
                        walk_pairs(v, path + (k,))
                elif isinstance(node, list):
                    for i, v in enumerate(node):
                        walk_pairs(v, path + (i,))
            walk_pairs(obj)

    # --- 图片 / 链接 ---

    def check_paths(self, relpath, web_root):
        obj = self.values[relpath]

        def resolve(v):
            p = strip_query(v)
            p = unquote(p)
            if os.path.isabs(p):
                return None
            return os.path.normpath(os.path.join(web_root, p.replace("/", os.sep)))

        # 1) 具名路径字段
        def walk(node, path=()):
            if isinstance(node, dict):
                for k, v in node.items():
                    if isinstance(v, str) and k in PATH_FIELDS:
                        self.path_value(relpath, path + (k,), k, v, web_root, resolve)
                    walk(v, path + (k,))
            elif isinstance(node, list):
                for i, v in enumerate(node):
                    walk(v, path + (i,))
        walk(obj)

        # 2) 正文 HTML 里的 <img src="...">
        for path, s in walk_strings(obj):
            if "<img" not in s:
                continue
            for m in IMG_SRC_RE.finditer(s):
                src = m.group(1)
                if not is_local_path(src):
                    continue
                if src.startswith("/"):
                    self.rep.add("IMG.EXISTS", relpath, path,
                                 "<img src=%r> 是站点根绝对路径，站内图片必须用相对路径" % src,
                                 "改成 ./assets/... 形式（SCHEMA §1 / §9 第 6 条）")
                    continue
                if GLOB_RE.search(src):
                    continue
                target = resolve(src)
                if target is None:
                    continue
                if not os.path.exists(target):
                    self.rep.add("IMG.EXISTS", relpath, path,
                                 "<img src=%r> 指向的文件不存在（解析到 %s）"
                                 % (src, safe_relpath(target, self.o.root)),
                                 "把图片放进站内并改成正确的相对路径，不要热链外站")

    def path_value(self, relpath, path, field, v, web_root, resolve):
        # 空值：既不是相对路径也不是枚举，一定会渲染成破图，必须报错
        if not v.strip():
            self.rep.add("IMG.EXISTS", relpath, path,
                         "%s 是空字符串" % field,
                         "填站内相对路径 ./assets/<数据集>/<文件名>；"
                         "确实没有图片就删掉该字段（不要留 \"\"）")
            return
        # 站内路径 / 热链规则只约束 SCHEMA 管辖的 wiki 数据
        enforce_local = is_wiki_data(relpath)
        if not is_local_path(v):
            if field in ICON_MUST_BE_LOCAL and enforce_local:
                self.add("IMG.HOTLINK", relpath, path,
                         "%s 用了外站绝对 URL（%s…）" % (field, v[:60]),
                         "icon 必须用站内相对路径 ./assets/...（SCHEMA §1）；"
                         "把图片下载进站内再引用")
            return
        if v.startswith("/"):
            self.rep.add("IMG.EXISTS", relpath, path,
                         "%s = %r 是站点根绝对路径" % (field, v),
                         "改成相对路径 ./assets/...（静态站没有站点根路由）")
            return
        if GLOB_RE.search(v):
            return
        if not (v.startswith("./") or v.startswith("../") or "/" in v or "." in v):
            # 裸词：emoji 或枚举
            if v in NON_PATH_ICON_ENUMS:
                return
            if not re.search(r"[A-Za-z0-9]", v):
                return                       # emoji / 图形字符
            if field in ICON_MUST_BE_LOCAL and enforce_local:
                self.rep.add("IMG.EXISTS", relpath, path,
                             "%s = %r 既不是站内相对路径也不是允许的枚举值" % (field, v),
                             "emoji 可直接用；图片请写 ./assets/<数据集>/<文件名>")
            return
        target = resolve(v)
        if target is None:
            return
        if not os.path.exists(target):
            self.rep.add("IMG.EXISTS", relpath, path,
                         "%s = %r 指向的文件不存在（解析到 %s）"
                         % (field, v, safe_relpath(target, self.o.root)),
                         "确认文件已随 PR 提交，路径大小写与文件名逐字一致；"
                         "文件名含空格/撇号时 src 里保留百分号写法，磁盘上存解码后的真名")

    # --- 一图流攻略图（enemies.guides，SCHEMA §7.4.1） ---

    def check_guides(self, relpath):
        """enemies.json 的 guides[] 结构检查（2026-09-21 新增）。

        `src` 已在 PATH_FIELDS 里，所以**图片文件是否存在**由 IMG.EXISTS 负责；
        这里补的是它覆盖不到的三件事：
          ① 必填字段齐备（缺 src = 页面破图，缺 title = 图没有标题）；
          ② src 必须是 ./assets/enemy-guides/ 下的**站内相对路径**
             —— 外站 URL 会被 IMG.EXISTS 静默放过（path_value 只对
             ICON_MUST_BE_LOCAL 里的 icon 报热链），必须在这里拦住；
          ③ source_url **本来就该是外站**（原图出处），只校验它是 http(s) 绝对 URL，
             绝不套用 icon 的站内规则（否则会误伤）；
          ④ `author_url` / `source_title` 是**可选**字段（作者主页、出处标题），
             `author_url` 同为外站页面 URL，同样只做字符串类型检查、**不做站内存在性检查**。
        """
        if relpath != GUIDES_FILE:
            return
        obj = self.values[relpath]
        for i, e in enumerate(obj.get("enemies", [])):
            if not isinstance(e, dict) or "guides" not in e:
                continue
            label = e.get("id") or e.get("name") or i
            path = ("enemies", i, "guides")
            guides = e.get("guides")
            if not isinstance(guides, list):
                self.rep.add("GUIDES.FIELDS", relpath, path,
                             "%s 的 guides 不是数组（当前 %s）"
                             % (label, type(guides).__name__),
                             "按 SCHEMA §7.4.1 写成 [{ src, title, author, source_url, note }]，"
                             "可选 author_url / source_title")
                continue
            if not guides:
                self.rep.add("GUIDES.FIELDS", relpath, path,
                             "%s 的 guides 是空数组" % label,
                             "没有一图流就删掉整个字段 —— 空数组在数据里表达不了「有/没有」"
                             "两种状态，前端按「有该字段」判定")
            for j, g in enumerate(guides):
                gp = path + (j,)
                if not isinstance(g, dict):
                    self.rep.add("GUIDES.FIELDS", relpath, gp,
                                 "%s 的第 %d 个 guide 不是对象" % (label, j),
                                 "用 { ... } 书写")
                    continue
                for f in GUIDES_REQUIRED:
                    if f not in g:
                        self.rep.add("GUIDES.FIELDS", relpath, gp,
                                     "%s 的第 %d 个 guide 缺少必填字段 %r" % (label, j, f),
                                     "按 SCHEMA §7.4.1 补齐 %s"
                                     "（author 图上没署名就写空串 \"\"，不许编造）" % f)
                for f in GUIDES_REQUIRED + GUIDES_OPTIONAL:
                    if f in g and not isinstance(g[f], str):
                        self.rep.add("GUIDES.FIELDS", relpath, gp + (f,),
                                     "%s 必须是字符串（当前 %s）" % (f, type(g[f]).__name__),
                                     "按 SCHEMA §7.4.1 统一用字符串")
                src = g.get("src")
                if isinstance(src, str) and src and not src.startswith(GUIDES_SRC_PREFIX):
                    self.rep.add("GUIDES.FIELDS", relpath, gp + ("src",),
                                 "src = %r 不是 %s 下的站内相对路径" % (src[:60], GUIDES_SRC_PREFIX),
                                 "一图流必须先本地化：存成 %s<敌人 id>_<序号>.webp 再用相对路径引用，"
                                 "禁止热链外站（SCHEMA §1 / §7.4.1）" % GUIDES_SRC_PREFIX)
                s = g.get("source_url")
                if isinstance(s, str) and s and not s.startswith(("http://", "https://")):
                    self.rep.add("GUIDES.FIELDS", relpath, gp + ("source_url",),
                                 "source_url = %r 不是 http(s) 绝对 URL" % s[:60],
                                 "source_url 是原图出处，必须是外站绝对 URL（本字段不适用站内规则）")
                t = g.get("title")
                if isinstance(t, str) and not t.strip():
                    self.rep.add("GUIDES.FIELDS", relpath, gp + ("title",),
                                 "%s 的第 %d 个 guide 的 title 是空字符串" % (label, j),
                                 "写「<站内敌人中文名> 一图流」")
                a, n = g.get("author"), g.get("note")
                if isinstance(a, str) and not a.strip() \
                        and not (isinstance(n, str) and n.strip()):
                    self.rep.add("GUIDES.FIELDS", relpath, gp + ("note",),
                                 "%s 的第 %d 个 guide 既没有署名（author 为空串）也没有 note"
                                 % (label, j),
                                 "署名不可省：author 照抄图上作者名；确实查不到就在 note 里写明"
                                 "「已获作者授权转载（作者署名待补）」")

    def check_links(self, relpath, web_root):
        obj = self.values[relpath]

        def walk(node, path=()):
            if isinstance(node, dict):
                for k, v in node.items():
                    if isinstance(v, str) and k in LINK_FIELDS:
                        self.link_value(relpath, path + (k,), v, web_root)
                    walk(v, path + (k,))
            elif isinstance(node, list):
                for i, v in enumerate(node):
                    walk(v, path + (i,))
        walk(obj)

    def link_value(self, relpath, path, v, web_root):
        if not is_local_path(v) or not v:
            return
        target_name = strip_query(v.split("#")[0])
        if not target_name.endswith((".html", ".htm")):
            return
        if "/" in target_name:
            target = os.path.normpath(os.path.join(web_root, target_name.replace("/", os.sep)))
        else:
            target = os.path.normpath(os.path.join(web_root, target_name))
        if not os.path.exists(target):
            self.rep.add("LINK.EXISTS", relpath, path,
                         "链接 %r 指向的页面不存在（解析到 %s）"
                         % (v, safe_relpath(target, self.o.root)),
                         "改成站内真实存在的 .html 文件名")

    # --- 更新公告（patchnotes）---

    def check_patchnotes(self):
        if PATCH_TRUNK not in self.parsed_ok:
            return
        trunk = self.values[PATCH_TRUNK]
        versions = trunk.get("versions")
        if not isinstance(versions, list):
            self.rep.add("PATCH.PAIRING", PATCH_TRUNK, ("versions",),
                         "versions 不是数组", "见 SCHEMA §7.13")
            return

        seen_ver, trunk_ids = set(), set()
        for i, v in enumerate(versions):
            p = ("versions", i)
            vid = v.get("id")
            if not isinstance(vid, str) or not PATCH_VERSION_RE.match(vid):
                self.rep.add("PATCH.PAIRING", PATCH_TRUNK, p + ("id",),
                             "版本 id %r 不是点分数字（如 1.007.100）" % (vid,),
                             "版本号直接取上游页面标题，不做改写")
            if vid in seen_ver:
                self.rep.add("PATCH.PAIRING", PATCH_TRUNK, p + ("id",),
                             "版本 id %r 重复" % (vid,), "同一版本只能出现一次")
            seen_ver.add(vid)
            trunk_ids.add(vid)
            for f in ("title", "release_date"):
                if not isinstance(v.get(f), str) or not v.get(f).strip():
                    self.rep.add("PATCH.FIELDS", PATCH_TRUNK, p + (f,),
                                 "缺少 %s（上游信息框应恒有）" % f, "重跑 fetch_patchnotes.py")
            bref = v.get("blog_url")
            if bref is not None and (not isinstance(bref, str) or not bref.startswith("http")):
                self.rep.add("PATCH.FIELDS", PATCH_TRUNK, p + ("blog_url",),
                             "blog_url = %r 不是外站 http(s) URL" % (bref,),
                             "官方公告链接必须是绝对 URL；没有就省略该字段")
            # 小节 id 唯一（锚点不能撞）
            flat, ids = [], []

            def walk(secs, path):
                for j, s in enumerate(secs or []):
                    sid = s.get("id")
                    ids.append(sid)
                    flat.append((path + (j,), s))
                    walk(s.get("subsections") or [], path + (j, "subsections"))
            walk(v.get("sections") or [], p + ("sections",))
            for k, sid in enumerate(ids):
                if not isinstance(sid, str) or not PATCH_SECTION_ID_RE.match(sid):
                    self.rep.add("PATCH.SECTION", PATCH_TRUNK, flat[k][0] + ("id",),
                                 "小节 id %r 非法（只允许小写字母/数字/下划线/连字符）" % (sid,),
                                 "由 fetch_patchnotes.py 的前缀归一化 + 全页去重生成")
                if ids.count(sid) > 1:
                    self.rep.add("PATCH.SECTION", PATCH_TRUNK, flat[k][0] + ("id",),
                                 "小节 id %r 在全页重复" % (sid,),
                                 "锚点会串位；抓取器有 -2/-3 去重，若出现说明被手工改过")
                    break

        # --- 中文覆盖 ---
        if PATCH_ZH not in self.parsed_ok:
            return
        zh = self.values[PATCH_ZH]
        zvers = zh.get("versions_zh")
        if not isinstance(zvers, list):
            self.rep.add("PATCH.PAIRING", PATCH_ZH, ("versions_zh",),
                         "versions_zh 不是数组", "见 SCHEMA §7.13")
            return
        by_id = {v.get("id"): v for v in versions}
        for i, zv in enumerate(zvers):
            p = ("versions_zh", i)
            vid = zv.get("id")
            if vid not in by_id:
                self.rep.add("PATCH.PAIRING", PATCH_ZH, p + ("id",),
                             "覆盖里的版本 %r 在主干中不存在" % (vid,),
                             "只允许覆盖主干已有的版本；新增版本请先跑抓取器")
                continue
            bsecs = {s.get("id"): s for s in by_id[vid].get("sections") or []}

            # mt：机翻标记（私密仓 translate_patchnotes.yml 写入）；只校验类型，
            # 「人删掉 mt = 已校对」是约定，不在这里强制
            if "mt" in zv and not isinstance(zv.get("mt"), bool):
                self.rep.add("PATCH.FIELDS", PATCH_ZH, p + ("mt",),
                             "mt = %r 不是布尔值" % (zv.get("mt"),),
                             "机翻标记只接受 true/false；人工校对完成后删掉该字段")

            # title_zh：官方中文更新名；版本号后缀必须与主干 title 一致（防手抄错）
            tz = zv.get("title_zh")
            if tz is not None:
                if not isinstance(tz, str) or not tz.strip():
                    self.rep.add("PATCH.FIELDS", PATCH_ZH, p + ("title_zh",),
                                 "title_zh 不是非空字符串", "更新名中文；没有官方译名就省略该字段")
                else:
                    btitle = str(by_id[vid].get("title") or "")
                    # ⚠ 必须用 search 而不是 match：模式是从冒号开始的「后缀」，
                    #   而 match 锚定串首，会永远不命中 → 两边都 None → 静默通过
                    #   （这正是 2026-09-22 坏样本测试抓出来的）。
                    bsuf = PATCH_SUFFIX_RE.search(btitle)
                    zsuf = PATCH_SUFFIX_RE.search(tz.strip())
                    bver = bsuf.group(1) if bsuf else None
                    zver = zsuf.group(1) if zsuf else None
                    if bver != zver:
                        self.rep.add("PATCH.FIELDS", PATCH_ZH, p + ("title_zh",),
                                     "版本号后缀与主干不一致：主干 title=%r（后缀 %r）vs title_zh=%r（后缀 %r）"
                                     % (btitle, bver, tz, zver),
                                     "title_zh 只把更新名换成官方中文，版本号后缀必须逐字保留")

            def cmp(secs_zh, pool, path):
                for j, s in enumerate(secs_zh or []):
                    sp = path + (j,)
                    sid = s.get("id")
                    if sid not in pool:
                        self.rep.add("PATCH.PAIRING", PATCH_ZH, sp + ("id",),
                                     "覆盖小节 id=%r 在主干中不存在" % (sid,),
                                     "按主干小节 id 对齐（SCHEMA §7.13）")
                        continue
                    b = pool[sid]
                    bitems = b.get("items") or []
                    iz = s.get("items_zh")
                    if not bitems:
                        # 主干该小节没有条目（纯容器节，只有子节）：约定**可省略** items_zh
                        if iz is not None and (not isinstance(iz, list) or len(iz) != 0):
                            self.rep.add("PATCH.PAIRING", PATCH_ZH, sp + ("items_zh",),
                                         "主干该小节没有条目，但 items_zh 给了 %s" % (type(iz).__name__,),
                                         "省略 items_zh，或给空数组 []")
                    elif not isinstance(iz, list):
                        self.rep.add("PATCH.PAIRING", PATCH_ZH, sp + ("items_zh",),
                                     "items_zh 不是数组（主干有 %d 条）" % len(bitems),
                                     "按主干条目顺序逐条补译文")
                    elif len(iz) != len(bitems):
                        self.rep.add("PATCH.PAIRING", PATCH_ZH, sp + ("items_zh",),
                                     "条目数不等：主干 %d vs 中文 %d（索引配对会整体错位）"
                                     % (len(bitems), len(iz)),
                                     "按主干条目顺序逐条补译文；数量不等一律视为错误")
                    else:
                        for k, t in enumerate(iz):
                            if not isinstance(t, str) or not t.strip():
                                self.rep.add("PATCH.PAIRING", PATCH_ZH, sp + ("items_zh", k),
                                             "第 %d 条译文为空" % k, "补齐译文或先删掉该小节覆盖")
                    bsubs = {x.get("id"): x for x in b.get("subsections") or []}
                    if [x.get("id") for x in s.get("subsections_zh") or []] != \
                       [x.get("id") for x in b.get("subsections") or []]:
                        self.rep.add("PATCH.PAIRING", PATCH_ZH, sp + ("subsections_zh",),
                                     "子节顺序/集合与主干不一致：主干 %s vs 覆盖 %s"
                                     % ([x.get("id") for x in b.get("subsections") or []],
                                        [x.get("id") for x in s.get("subsections_zh") or []]),
                                     "子节必须与主干同序同集合")
                    cmp(s.get("subsections_zh"), bsubs, sp + ("subsections_zh",))

            cmp(zv.get("sections_zh"), bsecs, p + ("sections_zh",))

    # --- mechanics ---

    def check_mechanics(self):
        d = os.path.join(self.o.wiki_dir, "mechanics")
        if not os.path.isdir(d):
            return
        for trunk_id, zh_name in sorted(MECH_COVERAGE.items()):
            trunk_rel = MECH_DIR + trunk_id + ".json"
            zh_rel = MECH_DIR + zh_name
            if trunk_rel not in self.parsed_ok:
                continue
            trunk = self.values[trunk_rel]
            tr_sections = trunk.get("sections")
            if not isinstance(tr_sections, list):
                continue
            flat = []
            self.flatten(tr_sections, ("sections",), flat)
            # 锚点 id
            ids = [s.get("id") for s in flat]
            for idx, s in enumerate(flat):
                p = s["__path"]
                sid = s.get("id")
                if not isinstance(sid, str) or not ANCHOR_RE.match(sid):
                    self.rep.add("MECH.TRUNK", trunk_rel, p + ("id",),
                                 "小节 id %r 缺失或含非法字符" % sid,
                                 "只用 [A-Za-z0-9._-]，中文标题不要拿来当 id（SCHEMA §5.2.5）")
                if s.get("level") not in (2, 3, 4):
                    self.rep.add("MECH.TRUNK", trunk_rel, p + ("level",),
                                 "level = %r 不是 2/3/4" % s.get("level"),
                                 "h2 → level 2，h3 → 3，h4 → 4")
                for k in ("title", "content"):
                    if k not in s:
                        self.rep.add("MECH.TRUNK", trunk_rel, p,
                                     "小节缺少 %r" % k, "主干小节必须有 level/id/title/content")
            dup = [k for k, c in collections.Counter(i for i in ids if isinstance(i, str)).items() if c > 1]
            for k in dup:
                self.rep.add("MECH.TRUNK", trunk_rel, ("sections",),
                             "锚点 id %r 重复" % k,
                             "同一页内锚点 id 必须唯一，否则 TOC 会指错（SCHEMA §5.2.5）")
            toc = trunk.get("toc") or []
            if len(toc) != len(flat):
                self.rep.add("MECH.TRUNK", trunk_rel, ("toc",),
                             "toc 有 %d 项，但 sections 展平后是 %d 节" % (len(toc), len(flat)),
                             "toc 必须与主干小节一一对应（SCHEMA §10 第 9 条）")
            for j, t in enumerate(toc):
                if isinstance(t, dict) and isinstance(t.get("id"), str) and t["id"] not in set(ids):
                    self.rep.add("MECH.TRUNK", trunk_rel, ("toc", j, "id"),
                                 "toc 项 %r 在主干小节里找不到" % t["id"],
                                 "toc 的 id 必须与某个主干小节 id 相同")

            if zh_rel not in self.parsed_ok:
                self.rep.add("MECH.PAIRING", zh_rel, "",
                             "主干 %s 存在，但覆盖文件缺失" % trunk_rel,
                             "补上 %s，或在 SCHEMA §7.7 的已登记数据集表里登记" % zh_name)
                continue
            zh = self.values[zh_rel]
            zh_secs = zh.get("sections_zh")
            if zh_secs is None:
                self.rep.add("MECH.PAIRING", zh_rel, "",
                             "缺少 sections_zh", "覆盖文件顶层必须是 { title_zh?, description_zh?, sections_zh[] }")
                continue
            trunk_ids = set(ids)
            self.check_coverage(zh_rel, zh_secs, ("sections_zh",), trunk_ids, trunk_id)
            self.check_coverage_id_dups(zh_rel, zh_secs, ("sections_zh",), trunk_id)

    def check_coverage_id_dups(self, zh_rel, secs, path, trunk_id):
        """同一个覆盖文件里两节声明了同一个主干 id → 后者静默顶掉前者，必须报错。"""
        seen = {}

        def rec(ss, p):
            for i, s in enumerate(ss):
                if not isinstance(s, dict):
                    continue
                want = s.get("target_id") or s.get("id")
                if isinstance(want, str) and want:
                    if want in seen:
                        self.rep.add(
                            "MECH.PAIRING", zh_rel, p + (i, "id"),
                            "覆盖文件里 %r 被声明了两次（本处与 %s）——"
                            "后一节会在合并时静默顶掉前一节"
                            % (want, ".".join(str(x) for x in seen[want])),
                            "一个主干小节只能覆盖一次；把重复的那节改成它真正对应的主干 id，"
                            "或删掉多余的一节")
                    else:
                        seen[want] = p + (i, "id")
                if isinstance(s.get("subsections_zh"), list):
                    rec(s["subsections_zh"], p + (i, "subsections_zh"))
        rec(secs, path)

    def flatten(self, secs, path, acc):
        for i, s in enumerate(secs):
            if not isinstance(s, dict):
                continue
            s2 = dict(s)
            s2["__path"] = path + (i,)
            acc.append(s2)
            sub = s.get("subsections")
            if isinstance(sub, list):
                self.flatten(sub, path + (i, "subsections"), acc)

    def check_coverage(self, zh_rel, secs, path, trunk_ids, trunk_id):
        for i, s in enumerate(secs):
            if not isinstance(s, dict):
                self.rep.add("MECH.PAIRING", zh_rel, path + (i,),
                             "覆盖小节必须是对象", "用 { ... } 书写")
                continue
            p = path + (i,)
            want = s.get("target_id") or s.get("id")
            if not isinstance(want, str) or not want:
                self.rep.add("MECH.PAIRING", zh_rel, p,
                             "覆盖小节 %r 没有显式 id / target_id，只能靠序号配对"
                             % (s.get("title_zh") or "(无标题)"),
                             "写上 \"id\": \"<主干小节 id>\" —— 序号配对在多译/漏译一节后"
                             "会整体错位（SCHEMA §5.2.2 / §5.2.4）")
            elif want not in trunk_ids:
                self.rep.add("MECH.EXTRA", zh_rel, p + ("id",),
                             "覆盖小节的 id %r 在主干 %s.json 中不存在" % (want, trunk_id),
                             "改成主干里真实存在的小节 id；主干没有的中文小节会被挂到页尾并触发 zhOnly 警告")
            sub = s.get("subsections_zh")
            if isinstance(sub, list):
                self.check_coverage(zh_rel, sub, p + ("subsections_zh",), trunk_ids, trunk_id)

    # --- campaign_zh 专项 ---

    def check_campaign(self, relpath):
        if relpath != M + "data/campaign_zh.json":
            return
        obj = self.values[relpath]
        meta = obj.get("_meta")
        if isinstance(meta, dict):
            ua = meta.get("updated_at")
            if ua is not None and not (isinstance(ua, str) and ISO_RE.match(ua)):
                self.rep.add("SCHEMA.DATE", relpath, ("_meta", "updated_at"),
                             "_meta.updated_at 不是 ISO8601：%r" % (ua,),
                             "canonical 写 YYYY-MM-DD 或 YYYY-MM-DDTHH:MM:SSZ")
        for k in ("status", "reward_types", "factions"):
            v = obj.get(k)
            if not isinstance(v, dict) or not v:
                self.rep.add("SCHEMA.TOP", relpath, (k,),
                             "%s 必须是非空对象" % k,
                             "按 SCHEMA §7.13 补齐；status 键为 \"0\"/\"2\"/\"3\"")
        st = obj.get("status")
        if isinstance(st, dict):
            for k, v in st.items():
                if not isinstance(v, dict) or not v.get("cn") or not v.get("key"):
                    self.rep.add("SCHEMA.FIELDS", relpath, ("status", k),
                                 "status[%r] 缺少 key / cn" % k,
                                 "值形如 {\"key\": \"in_progress\", \"cn\": \"进行中\"}")
        rt = obj.get("reward_types")
        if isinstance(rt, dict):
            for k, v in rt.items():
                if not isinstance(v, dict) or not v.get("cn"):
                    self.rep.add("SCHEMA.FIELDS", relpath, ("reward_types", k),
                                 "reward_types[%r] 缺少 cn" % k,
                                 "值形如 {\"en\": ..., \"cn\": ..., \"icon\": \"medal\"|\"cape\"}")
                elif v.get("icon") not in NON_PATH_ICON_ENUMS:
                    self.rep.add("SCHEMA.TYPES", relpath, ("reward_types", k, "icon"),
                                 "icon = %r 不是 medal / cape" % v.get("icon"),
                                 "icon 是前端渲染分支的枚举名，不是文件路径")
        ep = obj.get("episodes")
        if isinstance(ep, dict):
            for k, v in ep.items():
                if not isinstance(v, dict):
                    self.rep.add("SCHEMA.FIELDS", relpath, ("episodes", k),
                                 "episodes[%r] 必须是对象" % k, "值形如 { title, description?, phases? }")
                    continue
                if not isinstance(v.get("title"), str) or not v["title"].strip():
                    self.rep.add("SCHEMA.FIELDS", relpath, ("episodes", k),
                                 "战役 %s 缺少中文 title" % k,
                                 "title 必填（SCHEMA §7.13）；缺失时前端会回退英文原文")
                ph = v.get("phases")
                if isinstance(ph, dict):
                    for pk, pv in ph.items():
                        if not isinstance(pv, dict):
                            self.rep.add("SCHEMA.FIELDS", relpath, ("episodes", k, "phases", pk),
                                         "阶段必须是对象", "值形如 { title?, briefing? }",
                                         )
                            continue
                        if pv.get("title") is not None and not isinstance(pv["title"], str):
                            self.rep.add("SCHEMA.TYPES", relpath,
                                         ("episodes", k, "phases", pk, "title"),
                                         "阶段 title 必须是字符串", "去掉多余的结构")

    # --- 聚合收尾 ---

    def flush_aggregates(self):
        for key in KNOWN:
            check, relpath = key
            if key in self.baseline_hits:
                self.add_agg(check, relpath,
                             "存在已登记的历史例外", "见 KNOWN 表")
            else:
                # 一条都没命中 = 要么问题已修完（该删基线），要么基线的路径/校验项写错了
                # （打错字会让整条规则静默失效）。两种都需要人来处理，故显式提示。
                self.rep.add_info(
                    check, relpath,
                    "KNOWN 基线登记了「%s」但本次 0 命中：如果问题已修完请删掉这条基线；"
                    "如果只是路径/校验项写错，基线等于没生效" % KNOWN[key][1])
        # href 指向 /wiki/... 的聚合提示
        for relpath in (MECH_DIR + "galactic_war_history.json",):
            if relpath not in self.parsed_ok:
                continue
            n = 0
            for _, s in walk_strings(self.values[relpath]):
                n += s.count('href="/wiki/')
            if n:
                self.rep.add_info("IMG.EXISTS", relpath,
                                  "正文里有 %d 处 href=\"/wiki/...\"（wiki.gg 站内路由，"
                                  "静态站不存在；SCHEMA §8/§9 已登记为刻意保留，"
                                  "合并引擎会把 <a> 降级为纯文本）" % n)


# ---------------------------------------------------------------------------
# 报告
# ---------------------------------------------------------------------------


def build_report(rep, strict):
    groups = collections.OrderedDict()
    for f in rep.findings:
        groups.setdefault(f.file, []).append(f)

    lines = []
    lines.append("=" * 78)
    lines.append("HD2 中文维基 · 数据校验报告%s" % ("（--strict，忽略基线）" if strict else ""))
    lines.append("=" * 78)

    errors = rep.errors
    baselines = rep.baselines
    infos = rep.infos

    if errors:
        lines.append("")
        lines.append("【必须修的问题】按文件分组：")
        for f in errors:
            lines.append("  ✗ " + f.render())
    if baselines:
        lines.append("")
        lines.append("【已登记的历史例外（不计失败，但新增同类问题会失败）】：")
        for f in baselines:
            lines.append("  · " + f.render())
    if infos:
        lines.append("")
        lines.append("【信息项（不影响退出码）】：")
        for f in infos:
            lines.append("  i " + f.render())

    lines.append("")
    lines.append("-" * 78)
    lines.append("%-56s %6s %6s" % ("数据集 / 文件", "错误", "基线"))
    per_file = collections.OrderedDict()
    for f in rep.findings:
        d = per_file.setdefault(f.file, [0, 0])
        if f.severity == "error":
            d[0] += 1
        elif f.severity == "baseline":
            d[1] += 1
    for file in sorted(per_file):
        e, b = per_file[file]
        lines.append("%-56s %6d %6d%s" % (file[:56], e, b, "" if e == 0 else "   <== 需修"))
    lines.append("-" * 78)
    lines.append("错误合计：%d    基线项：%d" % (len(errors), len(baselines)))
    lines.append("")
    lines.append("结果：" + ("❌ FAIL（退出码 1）" if errors else "✅ PASS"))
    lines.append("")
    lines.append("提示：本报告只覆盖上面 %d 个检查项：" % len(CHECKS))
    for cid, desc in CHECKS:
        lines.append("   %-16s %s" % (cid, desc))
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def parse_args(argv):
    here = os.path.dirname(os.path.abspath(__file__))
    default_root = os.path.dirname(here)
    ap = argparse.ArgumentParser(
        prog="validate_wiki_data.py",
        description="HD2 中文维基数据校验器（独立可复用；失败 → 非零退出码）",
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", default=default_root,
                    help="仓库根目录（默认：本脚本上一级）")
    ap.add_argument("--wiki-dir", default=None,
                    help="wiki 数据目录（默认 <root>/HD2_Wiki/data/wiki/zh）")
    ap.add_argument("--map-dir", default=None,
                    help="星图数据目录（默认 <root>/HD2-Galatic_war-Map）")
    ap.add_argument("--wiki-web-root", default=None,
                    help="HD2_Wiki 页面所在目录，站内相对路径的解析基准（默认 <root>/HD2_Wiki）")
    ap.add_argument("--map-web-root", default=None,
                    help="星图页面所在目录（默认 <root>/HD2-Galatic_war-Map）")
    ap.add_argument("--strict", action="store_true",
                    help="忽略 KNOWN 基线表，把历史例外也当错误")
    ap.add_argument("--report", default=None, help="把报告写入该文件（UTF-8）")
    ap.add_argument("--list-checks", action="store_true", help="打印检查项清单后退出")
    return ap.parse_args(argv)


def main(argv=None):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    o = parse_args(argv)

    if o.list_checks:
        for cid, desc in CHECKS:
            print("%-16s %s" % (cid, desc))
        print("\n已登记的历史例外（基线）表：")
        for (check, file), (limit, why) in sorted(KNOWN.items()):
            print("  %-16s %-46s <= %d 处  %s" % (check, file, limit, why))
        return EXIT_OK

    o.root = os.path.abspath(o.root)
    o.wiki_dir = os.path.abspath(o.wiki_dir or os.path.join(o.root, "HD2_Wiki", "data", "wiki", "zh"))
    o.map_dir = os.path.abspath(o.map_dir or os.path.join(o.root, "HD2-Galatic_war-Map"))
    o.wiki_web_root = os.path.abspath(o.wiki_web_root or os.path.join(o.root, "HD2_Wiki"))
    o.map_web_root = os.path.abspath(o.map_web_root or os.path.join(o.root, "HD2-Galatic_war-Map"))

    if not os.path.isdir(o.wiki_dir):
        sys.stderr.write("错误：wiki 数据目录不存在：%s\n" % o.wiki_dir)
        return EXIT_USAGE
    if not os.path.isdir(o.wiki_web_root):
        sys.stderr.write("警告：--wiki-web-root 不存在：%s（站内图片检查会全部报缺失）\n" % o.wiki_web_root)
    if not os.path.isdir(o.map_dir):
        sys.stderr.write("提示：星图目录不存在，跳过其数据：%s\n" % o.map_dir)

    rep = Report()
    v = Validator(o, rep)
    v.run()

    text = build_report(rep, o.strict)
    sys.stdout.write(text + "\n")
    if o.report:
        with io.open(o.report, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(text + "\n")

    return EXIT_FAIL if rep.errors else EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
