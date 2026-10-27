# -*- coding: utf-8 -*-
"""
build_embed.py — 从 galaxy-map-v2.html 构建可独立挂载的星图模块（结构驱动版）
==============================================================================
产出 embed/hd2-starmap.js（自包含），供 wiki.gg 用户页 #hd2-starmap-mount 挂载。

设计原则（2026-10-28 重构）：
  · body DOM、元素 id、依赖脚本清单全部**从源码自动抽取**——源码演进时构建自动跟随，
    只有「语义改造点」（图标源、中文名、路径、全局状态）使用精确替换并由 must_replace 兜底报错。
  · 页面 <script src> 依赖（maplibre / forecast / regions / tactical / dss-donations / boot-splash）
    按源码顺序在 mount 时逐一加载；tactical.js 不再内联。
  · CSS：内联 <style> + map-hud.css + boot-splash.css + forecast.css 全部收敛到 .hd2sm-root 作用域。

语义改造点（与源页面的差异）：
  1. 所有元素 id 加 hd2sm- 前缀（含 JS 动态创建的 pc-biome/pc-buffs/pc-rgdetail/tac-empty）
  2. 数据/静态资源指向主仓绝对路径
  3. 星球图标 wiki.gg 直连优先（embed/wiki-icon-map.json 提供规范名）→ 主仓本地兜底 → 纯色圆点
  4. 星球名只保留中文名（标签/悬停/信息卡不显示英文小字）
  5. maplibre worker 用 blob + importScripts 垫片（跨域自托管 worker 不允许直接 new Worker）
  6. 资料页链接改新标签页打开主仓页面；移除 ?planet= 深链；移除文件尾部 boot() 自启动
  7. body 级 class 操作改为挂载根节点；导出 window.HD2StarMap = { mount, focusPlanet }

重跑本脚本即可在 galaxy-map-v2.html 更新后同步重新生成挂载模块。
"""
import io
import json
import os
import re
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

HERE = os.path.dirname(os.path.abspath(__file__))
MAP_DIR = os.path.dirname(HERE)
REPO = os.path.dirname(MAP_DIR)
SRC_HTML = os.path.join(MAP_DIR, "galaxy-map-v2.html")
OUT_JS = os.path.join(HERE, "hd2-starmap.js")

B = "https://jerry114514.github.io/HD2-Galatic_war-Map/"
B_ROOT = "https://jerry114514.github.io/"

# CSS 皮肤层文件（与内联 <style> 一起按源页面顺序收敛作用域）
CSS_FILES = [
    os.path.join(MAP_DIR, "css", "map-hud.css"),
    os.path.join(MAP_DIR, "css", "boot-splash.css"),
    os.path.join(MAP_DIR, "css", "forecast.css"),
]

src = open(SRC_HTML, encoding="utf-8").read()


def must_replace(text, old, new, count=None, tag=""):
    """精确替换；old 必须存在且次数吻合，否则报错（防止源文件演进后替换悄悄失效）。"""
    if old not in text:
        raise SystemExit(f"[build] 替换目标未找到{('（' + tag + '）') if tag else ''}，源文件可能已变化:\n" + old[:240])
    n = text.count(old)
    if count is not None and n != count:
        raise SystemExit(f"[build] 替换目标出现 {n} 次（预期 {count}）{('（' + tag + '）') if tag else ''}:\n" + old[:240])
    return text.replace(old, new)


# ================================================================ 抽取源码段 ===
m = re.search(r"<style>\n(.*?)\n</style>", src, re.S)
assert m, "未找到内联 <style> 块"
CSS_INLINE = m.group(1)

# body 标记：从 <body> 到第一个 <script 为止
m = re.search(r"<body>\n(.*?)(?=<script)", src, re.S)
assert m, "未找到 body 标记段"
MARKUP_RAW = m.group(1)
SCRIPT_SRCS = re.findall(r'<script src="([^"]+)"></script>', src[src.index("<body>"):])
assert SCRIPT_SRCS, "未找到 body 区域的依赖脚本"

# 主内联脚本：<script>\n（无属性）… </script>\n</body>
m = re.search(r"<script>\n(.*?)\n</script>\n</body>", src, re.S)
assert m, "未找到主 <script> 块"
JS_BODY = re.sub(r'^"use strict";\n', "", m.group(1))

# ================================================================ id 清单收集 ===
IDS = set(re.findall(r'id="([\w-]+)"', MARKUP_RAW))
IDS |= set(re.findall(r'\$\("([\w-]+)"\)', JS_BODY))
IDS |= {"tac-empty", "pc-biome", "pc-buffs", "pc-rgdetail"}
IDS = sorted(IDS, key=len, reverse=True)
ID_PAT = re.compile(r"#(" + "|".join(re.escape(x) for x in IDS) + r")(?![\w-])")


def rename_ids_css(css):
    return ID_PAT.sub(r"#hd2sm-\1", css)


# ================================================================ JS 语义改造 ===
JS = JS_BODY

# --- $ 前缀化 / maplibre 容器 / worker / glyphs / 字体 ---
JS = must_replace(JS, 'const $ = (id) => document.getElementById(id);',
                  'const $ = (id) => document.getElementById("hd2sm-" + id);', tag="$")
JS = must_replace(JS, 'container: "map",', 'container: $("map"),', tag="map容器")
JS = must_replace(
    JS,
    'maplibregl.setWorkerUrl("./js/libs/maplibre/maplibre-gl-csp-worker.js");',
    'maplibregl.setWorkerUrl(HD2SM_WORKER_URL);', tag="worker")
if 'glyphs: "./js/libs/maplibre/fonts/{fontstack}/{range}.pbf",' in JS:
    JS = must_replace(JS,
                      'glyphs: "./js/libs/maplibre/fonts/{fontstack}/{range}.pbf",',
                      'glyphs: B + "js/libs/maplibre/fonts/{fontstack}/{range}.pbf",', tag="glyphs")

# FontFace 字体 URL → 主仓绝对路径
JS = must_replace(
    JS,
    'new FontFace("SourceHanSans", "url(\'../HD2_Wiki/assets/fonts/SourceHanSansCN-Medium.otf\') format(\'opentype\')")',
    'new FontFace("SourceHanSans", "url(\'' + B_ROOT + 'HD2_Wiki/assets/fonts/SourceHanSansCN-Medium.otf\') format(\'opentype\')")',
    tag="FontFace")

# --- 数据 / 静态资源 → 主仓绝对路径 ---
PATH_SUBS = [
    ('"./data.json?t="', 'B + "data.json?t="'),
    ('"./tables/waypoints.json?t="', 'B + "tables/waypoints.json?t="'),
    ('"./tables/hd2_variables.json?t="', 'B + "tables/hd2_variables.json?t="'),
    ('"./tables/planet_regions.json?v=20261007b"', 'B + "tables/planet_regions.json?v=20261007b"'),
    ('"./tables/planet_regions_zh.json?v=20261007b"', 'B + "tables/planet_regions_zh.json?v=20261007b"'),
    ('"./tables/starmap.json?t="', 'B + "tables/starmap.json?t="'),
    ('"./tables/planet_biomes.json"', 'B + "tables/planet_biomes.json"'),
    ('"./assets/planet-icons/index.json?t="', 'B + "assets/planet-icons/index.json?t="'),
    ('"./assets/biomes/index.json"', 'B + "assets/biomes/index.json"'),
    ('"./assets/faction-icons/"', 'B + "assets/faction-icons/"'),
    ('`./assets/effect-icons/${file}?v=${FX_ASSET_VER}`', '`${B}assets/effect-icons/${file}?v=${FX_ASSET_VER}`'),
    ('`<img src="./assets/biomes/${esc(bimg)}"', '`<img src="' + B + 'assets/biomes/${esc(bimg)}"'),
]
for old, new in PATH_SUBS:
    JS = must_replace(JS, old, new, tag="路径")

# --- 资料页链接 → 主仓 + 新标签页 ---
n_planet_links = len(re.findall(r'href="\./planet\.html\?idx=', JS))
if n_planet_links != 4:
    raise SystemExit(f"[build] planet.html 链接出现 {n_planet_links} 处（预期 4），源文件可能已变化")
JS = JS.replace('href="./planet.html?idx=',
                'target="_blank" rel="noopener" href="' + B + 'planet.html?idx=')
JS = must_replace(
    JS,
    'if (act === "detail") { location.href = "./planet.html?idx=" + index; }',
    'if (act === "detail") { window.open(B + "planet.html?idx=" + index, "_blank", "noopener"); }',
    tag="轮盘跳转")

# --- 移除 ?planet= 深链（wiki 页无该参数语义） ---
JS, n = re.subn(r"\n  // 深链：[\s\S]*?\n  \}\)\(\);\n", "\n", JS)
if n != 1:
    raise SystemExit(f"[build] deepLink 块匹配到 {n} 处，预期 1")

# --- 星球图标系统：wiki.gg 直连优先 + 主仓兜底 ---
JS = must_replace(
    JS,
    """let ICON_INDEX = {};
const ICON_DIR = "./assets/planet-icons/";
function planetIconFile(name) {
  const key = String(name || "").trim().toUpperCase();
  return ICON_INDEX[key] || "";
}""",
    """let ICON_INDEX = {};      // 主仓本地兜底索引：星球名 -> 本地文件名（assets/planet-icons/index.json）
let WIKI_ICON_MAP = {};   // wiki.gg 规范文件名映射：星球名 -> File: 规范名（embed/wiki-icon-map.json）
let ICON_URL = {};        // 图标键 -> 首选图片 URL（wiki.gg 缩略图；wiki 页内为同源加载）
let ICON_FALLBACK = {};   // 图标键 -> 主仓本地兜底 URL
const ICON_DIR = B + "assets/planet-icons/";
const WIKI_ICON_BASE = "https://helldivers.wiki.gg/images/thumb/";
function planetIconFile(name) {
  const key = String(name || "").trim().toUpperCase();
  const wiki = WIKI_ICON_MAP[key];
  if (wiki) {
    const enc = encodeURIComponent(wiki);
    ICON_URL[wiki] = WIKI_ICON_BASE + enc + "/64px-" + enc;
    if (ICON_INDEX[key]) ICON_FALLBACK[wiki] = ICON_DIR + ICON_INDEX[key];
    return wiki;
  }
  const local = ICON_INDEX[key];
  if (local) { ICON_URL[local] = ICON_DIR + local; return local; }
  return "";
}""", tag="planetIconFile")

# 图标索引加载：补 wiki-icon-map.json
m = re.search(r'( *)try \{\n *ICON_INDEX = await \(await fetch\(B \+ "assets/planet-icons/index\.json\?t=" \+ Date\.now\(\), \{ cache: "no-store" \}\)\)\.json\(\);\n *\} catch \(_\) \{ ICON_INDEX = \{\}; \}',
              JS)
if not m:
    raise SystemExit("[build] ICON_INDEX 加载块未找到（源文件可能已变化）")
JS = JS[:m.start()] + m.group(0) + \
    '\n  try {\n    WIKI_ICON_MAP = await (await fetch(B + "embed/wiki-icon-map.json?t=" + Date.now(), { cache: "no-store" })).json();\n  } catch (_) { WIKI_ICON_MAP = {}; }' + \
    JS[m.end():]

# --- loadPlanetIcon：单次 fetch 解码版 → 多 URL 依序尝试版 ---
JS = must_replace(
    JS,
    """// 单次请求完成尺寸读取与解码：返回 { image, pixelRatio }，pixelRatio 归一化到 32 CSS px。
// 旧流程先 fetch PNG 头、再用 Image 请求同一路径；这里复用同一份 Blob，避免重复请求。
async function loadPlanetIcon(url) {
  try {
    const r = await fetch(url, { cache: "force-cache" });
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    const dim = pngSizeFromBuffer(buf);
    const blob = new Blob([buf], { type: r.headers.get("content-type") || "image/png" });
    let img = null;
    if (window.createImageBitmap) {
      try { img = await createImageBitmap(blob); } catch (_) { /* 旧浏览器走 Image 兜底 */ }
    }
    if (!img) {
      const objectUrl = URL.createObjectURL(blob);
      try { img = await fetchImageBitmap(objectUrl, false); }
      finally { URL.revokeObjectURL(objectUrl); }
    }
    if (!img) return null;
    const w = (dim && dim.w) || img.naturalWidth || img.width || 64;
    return { image: img, pixelRatio: w / 32 };
  } catch (_) { return null; }
}""",
    """// 载入图标：按 URL 顺序尝试（wiki.gg 直连优先，主仓本地兜底）。
// 单次请求完成尺寸读取与解码（复用同一份 Blob，避免重复请求）；
// fetch 失败（CORS/404/网络）直接换下一个 URL —— 污染纹理进不了 WebGL（addImage 会抛错）。
// pixelRatio 归一化到 32 CSS px 基准（64px → 2，48px → 1.5）。
async function loadPlanetIcon(urls) {
  const list = Array.isArray(urls) ? urls : [urls];
  for (const url of list) {
    try {
      const r = await fetch(url, { cache: "force-cache" });
      if (!r.ok) continue;
      const buf = await r.arrayBuffer();
      const dim = pngSizeFromBuffer(buf);
      const blob = new Blob([buf], { type: r.headers.get("content-type") || "image/png" });
      let img = null;
      if (window.createImageBitmap) {
        try { img = await createImageBitmap(blob); } catch (_) { /* 旧浏览器走 Image 兜底 */ }
      }
      if (!img) {
        const objectUrl = URL.createObjectURL(blob);
        try { img = await fetchImageBitmap(objectUrl, false); }
        finally { URL.revokeObjectURL(objectUrl); }
      }
      if (!img) continue;
      const w = (dim && dim.w) || img.naturalWidth || img.width || 64;
      return { image: img, pixelRatio: w / 32 };
    } catch (_) { /* 尝试下一个 URL */ }
  }
  return null;
}""", tag="loadPlanetIcon")

JS = must_replace(
    JS,
    'const res = await loadPlanetIcon(ICON_DIR + file);',
    'const res = await loadPlanetIcon([ICON_URL[file], ICON_FALLBACK[file]].filter(Boolean));',
    tag="图标加载调用")

JS = must_replace(
    JS,
    '"图标：wiki.gg 命中 <b>" + ok + "</b> / 缺 <b>" + bad + "</b>（本地缓存，缺失的以纯色圆点显示）"',
    '"图标命中 <b>" + ok + "</b> / 缺 <b>" + bad + "</b>（wiki.gg 直连优先，缺失回退主仓本地缓存，仍缺以纯色圆点显示）"',
    tag="srcnote")

# --- 每个星球只保留中文名 ---
JS = must_replace(
    JS,
    '`<div class="n">${esc(pr.nameCn || pr.name)}${pr.nameCn ? ` <small style="color:var(--text-mute)">${esc(pr.name)}</small>` : ""}</div>`',
    '`<div class="n">${esc(pr.nameCn || pr.name)}</div>`', tag="tooltip中文名")
JS = must_replace(JS, '        `<span class="en">${esc(p.name || "")}</span>` +\n', "", count=2, tag="信息卡英文名")
JS = must_replace(
    JS,
    '         ${pCn && p.name ? `<span style="color:var(--text-mute);font-size:.72rem">${esc(p.name)}</span>` : ""}\n',
    "", tag="详情英文名")

# --- window.* 全局改挂载内状态 ---
JS = must_replace(
    JS,
    '  window.addEventListener("resize", () => { clearTimeout(window.__rt); window.__rt = setTimeout(paintBackdrop, 250); });',
    '  window.addEventListener("resize", () => { clearTimeout(HD2SM_RT); HD2SM_RT = setTimeout(paintBackdrop, 250); });',
    tag="__rt")
JS = must_replace(JS, "  window.__planetR = planetRadiusPx;", "  HD2SM_STATE.planetR = planetRadiusPx;", tag="__planetR")
JS = must_replace(JS, "    const rfn = window.__planetR;", "    const rfn = HD2SM_STATE.planetR;", tag="__planetR读")
JS = must_replace(JS, "  window.__focusPlanet = focusPlanet;", "  HD2SM_STATE.focusPlanet = focusPlanet;", tag="__focusPlanet")
JS = must_replace(JS, 'onclick="window.__focusPlanet(${index})"',
                  'onclick="window.HD2StarMap.focusPlanet(${index})"', count=2, tag="聚焦按钮")
JS = must_replace(
    JS,
    """  window.__planetCard = showPlanetCard;      // 供自检/调试
  window.__wheel = showWheel;
  window.__rateOf = rateOf;                  // 速率推演（自检用）
  window.__pcSnap = PC_SNAP;                 // 观测快照（自检用）
window.__map = MAP;                        // 地图实例（自检用：图层/数据源核对，如 attack 源只应含入侵连线）""",
    "  HD2SM_STATE.dbg = { showPlanetCard, showWheel, rateOf, PC_SNAP, MAP };   // 自检/调试句柄（不再污染 window）",
    tag="调试导出")

# --- body 级 class / 全局查询 → 挂载根节点 ---
JS = JS.replace("document.body.classList", "ROOT.classList")
JS = must_replace(JS, 'document.querySelectorAll("aside .sec > h2")',
                  'ROOT.querySelectorAll("aside .sec > h2")', tag="侧栏手风琴")
JS = must_replace(JS, 'e.target.closest("#map")', 'e.target.closest("#hd2sm-map")', tag="移动端抽屉")

# --- 动态创建元素的 id 前缀（含旧版遗漏的 pc-biome/pc-buffs，修复装饰查询错位） ---
JS = must_replace(JS, 'n.id = "tac-empty";', 'n.id = "hd2sm-tac-empty";', tag="tac-empty")
JS = must_replace(JS, 'id="pc-rgdetail"', 'id="hd2sm-pc-rgdetail"', tag="pc-rgdetail")
JS = must_replace(JS, 'id="pc-biome"', 'id="hd2sm-pc-biome"', count=2, tag="pc-biome")
JS = must_replace(JS, 'id="pc-buffs"', 'id="hd2sm-pc-buffs"', count=2, tag="pc-buffs")
JS = must_replace(JS, 'querySelector("#pc-biome")', 'querySelector("#hd2sm-pc-biome")', tag="pc-biome查")
JS = must_replace(JS, 'querySelector("#pc-buffs")', 'querySelector("#hd2sm-pc-buffs")', tag="pc-buffs查")

# --- 加载守卫放宽（跨域图标池式加载，25s 偏紧） ---
JS = must_replace(JS, '}, 25000);', '}, 60000);', tag="加载守卫")

# --- 移除文件尾部 boot() 自启动（由 mount 驱动） ---
JS, n = re.subn(
    r"/\* -+ 启动 -+ \*/\nboot\(\)\.catch\(e => \{[\s\S]*?\n\}\);\n?$",
    "", JS.strip(), flags=re.M)
if n != 1:
    raise SystemExit(f"[build] boot() 自启动块匹配到 {n} 处，预期 1")

# ================================================================ CSS 收敛作用域 ====


def split_top(s, sep=","):
    parts, buf, depth = [], "", 0
    for ch in s:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == sep and depth == 0:
            parts.append(buf)
            buf = ""
        else:
            buf += ch
    if buf.strip():
        parts.append(buf)
    return parts


def split_comments(pre):
    comments, rest = [], pre
    while True:
        s = rest.lstrip()
        if s.startswith("/*"):
            k = s.find("*/")
            if k < 0:
                break
            comments.append(s[:k + 2])
            rest = s[k + 2:]
            continue
        break
    return "\n".join(comments), rest.strip()


def sel_transform(s):
    s = s.strip()
    if not s:
        return None
    if s == ":root":
        return ".hd2sm-root"
    if s.startswith("html"):
        return None
    if s == "body":
        return ".hd2sm-root"
    if s.startswith("body"):
        return ".hd2sm-root" + s[4:]
    return ".hd2sm-root " + s


def scope_css(css):
    out, i, n = [], 0, len(css)
    while i < n:
        prelude, j = "", i
        while j < n:
            if css.startswith("/*", j):
                k = css.find("*/", j + 2)
                k = n if k < 0 else k + 2
                prelude += css[j:k]
                j = k
                continue
            if css[j] == "{":
                break
            prelude += css[j]
            j += 1
        if j >= n:
            break
        k, depth = j + 1, 1
        while k < n and depth:
            if css[k] == "{":
                depth += 1
            elif css[k] == "}":
                depth -= 1
            k += 1
        block = css[j + 1:k - 1]
        comments, sel = split_comments(prelude)
        head = comments + "\n" if comments else ""
        if sel.startswith(("@media", "@supports", "@container")):
            out.append(head + sel + "{" + scope_css(block) + "}")
        elif sel.startswith("@"):
            if re.match(r"@keyframes\s+spin\s*$", sel):
                sel = re.sub(r"spin\s*$", "hd2sm-spin", sel)
            out.append(head + sel + "{" + block + "}")
        else:
            sels = split_top(sel)
            newsels = []
            if sels and all(x.strip() in ("*", "*::before", "*::after") for x in sels):
                newsels = [".hd2sm-root", ".hd2sm-root *",
                           ".hd2sm-root *::before", ".hd2sm-root *::after"]
            elif len(sels) == 1 and sels[0].strip() == "*":
                newsels = [".hd2sm-root", ".hd2sm-root *"]
            else:
                for s in sels:
                    t = sel_transform(s)
                    if t:
                        newsels.append(t)
            if newsels:
                out.append(head + ", ".join(newsels) + "{" + block + "}")
        i = k
    return "\n".join(out)


def absolutize_fonts(css):
    return css.replace('url("../HD2_Wiki/', 'url("' + B_ROOT + 'HD2_Wiki/')


def build_scoped_css():
    parts = []
    for label, css in [("内联样式", CSS_INLINE)] + [(os.path.basename(p), open(p, encoding="utf-8").read()) for p in CSS_FILES]:
        scoped = scope_css(rename_ids_css(absolutize_fonts(css)))
        parts.append(f"/* ===== {label} ===== */\n" + scoped)
    out = "\n\n".join(parts)
    out = re.sub(r"(?<![\w-])spin(\s+1s)", r"hd2sm-spin\1", out)
    out += """
/* ===== 挂载根节点补充（build_embed.py） ===== */
.hd2sm-root{position:relative;height:var(--hd2sm-h,70vh);min-height:480px;isolation:isolate}
"""
    return out


SCOPED_CSS = build_scoped_css()

# ================================================================ DOM 抽取与改造 ===
MARKUP = MARKUP_RAW
# 依赖脚本标签剥离（由 mount 按源码顺序加载，innerHTML 注入的 script 不会执行）
MARKUP = re.sub(r'[ \t]*<script src="[^"]+"></script>\n?', "", MARKUP)
# id 前缀化
MARKUP = re.sub(r'id="(' + "|".join(re.escape(x) for x in IDS) + r')"',
                lambda mm: 'id="hd2sm-' + mm.group(1) + '"', MARKUP)
# 相对路径绝对化
MARKUP = MARKUP.replace('href="./', 'href="' + B)
MARKUP = MARKUP.replace('src="./', 'src="' + B)
# 站内链接（顶栏按钮）新标签页打开
MARKUP = MARKUP.replace('<a class="btn opt" href="',
                        '<a class="btn opt" target="_blank" rel="noopener noreferrer" href="')

# ================================================================ 组装模块 ===
MODULE = """/* ============================================================
   HD2 银河星图 · 独立挂载模块（embed build —— 勿手改，由 build_embed.py 生成）
   来源：HD2-Galatic_war-Map/galaxy-map-v2.html（MapLibre GL 3D 星图）
   用法：目标容器 <div id="hd2-starmap-mount"></div>，本脚本自动挂载；
         也可手动 window.HD2StarMap.mount(element)。
   数据：全部实时抓取主仓 https://jerry114514.github.io/HD2-Galatic_war-Map/
   星球图标：wiki.gg 直连（wiki 页内同源）优先 → 主仓本地缓存 → 纯色圆点
   ============================================================ */
(function () {
"use strict";

var B = "https://jerry114514.github.io/HD2-Galatic_war-Map/";
var B_ROOT = "https://jerry114514.github.io/";

/* ---- maplibre worker 垫片：浏览器不允许跨域 new Worker，
        用同源 blob worker importScripts 拉取自托管 csp worker ---- */
var HD2SM_WORKER_URL = URL.createObjectURL(new Blob(
  ["importScripts(" + JSON.stringify(B + "js/libs/maplibre/maplibre-gl-csp-worker.js") + ");"],
  { type: "application/javascript" }));

/* ---- 挂载级状态（替代原页面的 window.* 全局） ---- */
var ROOT = null;
var HD2SM_RT = 0;
var HD2SM_STATE = { planetR: null, focusPlanet: null, dbg: null };
var CURRENT = { el: null, root: null, map: null };
var CSS_TOKEN = "hd2sm-style";
var SCRIPT_SRCS = @SCRIPTSRCS@;

var SCOPED_CSS = @CSS@;

function injectCss() {
  if (document.getElementById(CSS_TOKEN)) return;
  var st = document.createElement("style");
  st.id = CSS_TOKEN;
  st.textContent = SCOPED_CSS;
  document.head.appendChild(st);
  var link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = B + "js/libs/maplibre/maplibre-gl.css";
  document.head.appendChild(link);
}

function loadScript(src) {
  return new Promise(function (res, rej) {
    var s = document.createElement("script");
    s.src = src;
    s.onload = res;
    s.onerror = function () { rej(new Error("依赖加载失败: " + src)); };
    document.head.appendChild(s);
  });
}

function loadDependencies() {
  var p = Promise.resolve();
  SCRIPT_SRCS.forEach(function (rel) {
    p = p.then(function () {
      if (rel.indexOf("js/libs/maplibre/maplibre-gl-csp.js") !== -1 && window.maplibregl) return null;
      return loadScript(rel.charAt(0) === "/" ? rel : B + rel);
    });
  });
  return p;
}

/* ============================================================
   星图主逻辑（原 galaxy-map-v2.html 内联脚本，挂载化改造）
   ============================================================ */
@JSBODY@

/* ============================================================
   挂载 API
   ============================================================ */
var DOM_HTML = @DOMHTML@;

function mount(el, opts) {
  if (!el) return Promise.reject(new Error("HD2StarMap.mount: 缺少容器元素"));
  if (CURRENT.el === el && CURRENT.map) return Promise.resolve(CURRENT.root);
  if (CURRENT.root && CURRENT.root !== el) {
    try { if (CURRENT.map) CURRENT.map.remove(); } catch (_) {}
    try { CURRENT.root.remove(); } catch (_) {}
  }
  injectCss();
  var root = document.createElement("div");
  root.className = "hd2sm-root";
  root.innerHTML = DOM_HTML;
  el.innerHTML = "";
  el.appendChild(root);
  ROOT = root;
  var h = (opts && opts.height) || el.getAttribute("data-height");
  if (h) root.style.setProperty("--hd2sm-h", h);
  CURRENT = { el: el, root: root, map: null };
  return loadDependencies().then(function () { return boot(); }).then(function () {
    CURRENT.map = MAP;
    return root;
  }).catch(function (e) {
    var m = root.querySelector("#hd2sm-bootmsg");
    if (m) m.innerHTML = "⚠️ 初始化异常<br><small>" + esc(e && e.message || e) + "</small>";
    console.error("[HD2 星图挂载]", e);
    throw e;
  });
}

function autoMount() {
  var el = document.getElementById("hd2-starmap-mount");
  if (el && !el.getAttribute("data-hd2sm-on")) {
    el.setAttribute("data-hd2sm-on", "1");
    mount(el).catch(function (_) {});
  }
}

window.HD2StarMap = {
  mount: mount,
  focusPlanet: function (i) { if (HD2SM_STATE.focusPlanet) HD2SM_STATE.focusPlanet(i); },
  version: "1.1.0"
};
Object.defineProperty(window.HD2StarMap, "map", { get: function () { return CURRENT.map; } });

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", autoMount);
} else {
  autoMount();
}
setTimeout(autoMount, 2500);   // wiki 渲染时序兜底
})();
"""

MODULE = MODULE.replace("@SCRIPTSRCS@", json.dumps(SCRIPT_SRCS, ensure_ascii=False))
MODULE = MODULE.replace("@CSS@", json.dumps(SCOPED_CSS, ensure_ascii=False))
MODULE = MODULE.replace("@JSBODY@", JS.strip())
MODULE = MODULE.replace("@DOMHTML@", json.dumps(MARKUP, ensure_ascii=False))

os.makedirs(HERE, exist_ok=True)
with open(OUT_JS, "w", encoding="utf-8", newline="\n") as f:
    f.write(MODULE)
with open(os.path.join(HERE, "_scoped.css"), "w", encoding="utf-8", newline="\n") as f:
    f.write(SCOPED_CSS)
print(f"[build] OK → {os.path.relpath(OUT_JS, REPO)}  ({os.path.getsize(OUT_JS) // 1024} KB)")
print(f"[build] 依赖脚本 {len(SCRIPT_SRCS)} 个: " + ", ".join(SCRIPT_SRCS))
