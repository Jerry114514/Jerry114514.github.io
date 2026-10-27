# -*- coding: utf-8 -*-
"""
build_embed.py — 从 galaxy-map-v2.html 构建可独立挂载的星图模块
================================================================
产出 embed/hd2-starmap.js（自包含：CSS 注入 + tactical.js 内联 + 星图主逻辑），
供 wiki.gg 用户页通过 #hd2-starmap-mount 容器挂载。

与源页面的差异（全部在本脚本内以精确替换实现，源文件零改动）：
  1. 所有元素 id 加 hd2sm- 前缀；CSS 全部收敛到 .hd2sm-root 作用域（不污染 wiki 页面）
  2. 静态资源 / 数据全部指向主仓 jerry114514.github.io（data.json、tables、effect/faction 图标、maplibre、字体）
  3. 星球图标改为 wiki.gg 直连优先（images/thumb/<File>/64px-<File>，embed/wiki-icon-map.json 提供规范名），
     主仓本地缓存兜底，仍缺失回退纯色圆点
  4. 星球名只保留中文名：地图标签中文优先（少量暂无译名的新星球回退英文）、悬停提示与信息卡不再显示英文名
  5. maplibre worker 用 blob + importScripts 垫片（跨域自托管 worker 浏览器不允许直接 new Worker）
  6. 资料页链接（planet.html）改为新标签页打开主仓页面；移除 ?planet= 深链逻辑
  7. 侧栏收起等 body 级 class 操作改为挂载根节点；导出 window.HD2StarMap = { mount, focusPlanet }

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
SRC_HUD = os.path.join(MAP_DIR, "css", "map-hud.css")
SRC_TAC = os.path.join(MAP_DIR, "js", "tactical.js")
OUT_JS = os.path.join(HERE, "hd2-starmap.js")

B = "https://jerry114514.github.io/HD2-Galatic_war-Map/"
B_ROOT = "https://jerry114514.github.io/"

# 挂载 DOM 中出现的全部元素 id（$() 查找与 CSS 选择器都会加 hd2sm- 前缀）
IDS = ["stage", "stars", "map", "boot", "bootmsg", "tip", "sector-card", "fx-layer",
       "planet-card", "wheel", "aside-rail", "aside-backdrop", "aside-toggle",
       "hdr", "factions", "layers", "hits", "detail", "detailTitle", "srcnote",
       "tac-empty", "q", "btn-reset", "btn-mode", "aside-collapse",
       "pc-biome", "pc-buffs", "pc-rgdetail"]

src = open(SRC_HTML, encoding="utf-8").read()
hud_css = open(SRC_HUD, encoding="utf-8").read()
tac_js = open(SRC_TAC, encoding="utf-8").read()

# ---------------------------------------------------------------- 抽取源码段 ----
m = re.search(r"<style>\n(.*?)\n</style>", src, re.S)
assert m, "未找到内联 <style> 块"
CSS_INLINE = m.group(1)

m = re.search(r"<script>\n(.*?)\n</script>\n</body>", src, re.S)
assert m, "未找到主 <script> 块"
JS_BODY = m.group(1)

JS_BODY = re.sub(r'^"use strict";\n', "", JS_BODY)


def must_replace(text, old, new, count=None):
    """精确替换；old 必须存在且次数吻合，否则报错（防止源文件演进后替换悄悄失效）。"""
    if old not in text:
        raise SystemExit("[build] 替换目标未找到（源文件可能已变化）:\n" + old[:200])
    n = text.count(old)
    if count is not None and n != count:
        raise SystemExit(f"[build] 替换目标出现 {n} 次（预期 {count}）:\n" + old[:200])
    return text.replace(old, new)


# ---------------------------------------------------------------- JS 改造 ----
JS = JS_BODY

# $ 前缀化
JS = must_replace(
    JS,
    'const $ = (id) => document.getElementById(id);',
    'const $ = (id) => document.getElementById("hd2sm-" + id);')

# maplibre 容器 / worker / glyphs / 字体
JS = must_replace(JS, 'container: "map",', 'container: $("map"),')
JS = must_replace(
    JS,
    'maplibregl.setWorkerUrl("./js/libs/maplibre/maplibre-gl-csp-worker.js");',
    'maplibregl.setWorkerUrl(HD2SM_WORKER_URL);')
JS = must_replace(
    JS,
    'glyphs: "./js/libs/maplibre/fonts/{fontstack}/{range}.pbf",',
    'glyphs: B + "js/libs/maplibre/fonts/{fontstack}/{range}.pbf",')
JS = must_replace(
    JS,
    'new FontFace("SourceHanSans", "url(\'../HD2_Wiki/assets/fonts/SourceHanSansCN-Medium.otf\') format(\'opentype\')")',
    'new FontFace("SourceHanSans", "url(\'' + B_ROOT + 'HD2_Wiki/assets/fonts/SourceHanSansCN-Medium.otf\') format(\'opentype\')")')

# 数据 / 静态资源 → 主仓绝对路径
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
    JS = must_replace(JS, old, new)

# 资料页链接 → 主仓 + 新标签页（showDetail / defCardHtml / showPlanetCard / renderHits 共 4 处）
JS = must_replace(JS, 'href="./planet.html?idx=',
                  'target="_blank" rel="noopener" href="' + B + 'planet.html?idx=', count=4)
JS = must_replace(
    JS,
    'if (act === "detail") { location.href = "./planet.html?idx=" + index; }',
    'if (act === "detail") { window.open(B + "planet.html?idx=" + index, "_blank", "noopener"); }')

# 移除 ?planet= 深链（wiki 页无该参数语义）
JS, n = re.subn(r"\n  // 深链：[\s\S]*?\n  \}\)\(\);\n", "\n", JS)
if n != 1:
    raise SystemExit(f"[build] deepLink 块匹配到 {n} 处，预期 1")

# 星球图标系统：wiki.gg 直连优先 + 主仓兜底
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
}""")

JS = must_replace(
    JS,
    """  // 星球图标索引（assets/planet-icons/index.json；缺失时全量回退纯色圆点，不致命）
  try {
    ICON_INDEX = await (await fetch(B + "assets/planet-icons/index.json?t=" + Date.now(), { cache: "no-store" })).json();
  } catch (_) { ICON_INDEX = {}; }""",
    """  // 星球图标索引：主仓本地兜底 + wiki.gg 规范名映射（缺失时回退纯色圆点，不致命）
  try {
    ICON_INDEX = await (await fetch(B + "assets/planet-icons/index.json?t=" + Date.now(), { cache: "no-store" })).json();
  } catch (_) { ICON_INDEX = {}; }
  try {
    WIKI_ICON_MAP = await (await fetch(B + "embed/wiki-icon-map.json?t=" + Date.now(), { cache: "no-store" })).json();
  } catch (_) { WIKI_ICON_MAP = {}; }""")

JS = must_replace(
    JS,
    """// 载入图标：返回 { image, pixelRatio }，pixelRatio 归一化到 32 CSS px 基准
// （64px → 2，48px → 1.5），使所有图标在同一 icon-size 下视觉尺寸一致。
async function loadPlanetIcon(url) {
  let dim = null;
  try {
    const r = await fetch(url, { cache: "force-cache" });
    if (r.ok) dim = pngSizeFromBuffer(await r.arrayBuffer());
  } catch (_) { /* 读头失败则退回按 64px 假设 */ }
  const img = await loadBitmapWithFallback(url);
  if (!img) return null;
  const w = (dim && dim.w) || img.naturalWidth || img.width || 64;
  return { image: img, pixelRatio: w / 32 };
}""",
    """// 载入图标：按 URL 顺序尝试（wiki.gg 直连优先，主仓本地兜底）。
// fetch 失败（CORS/404/网络）直接换下一个 URL —— 不做无 CORS 的 <img> 兜底：
// 污染纹理进不了 WebGL（addImage 会抛错），不如尽快落到真正可用的源。
// pixelRatio 归一化到 32 CSS px 基准（64px → 2，48px → 1.5）。
async function loadPlanetIcon(urls) {
  const list = Array.isArray(urls) ? urls : [urls];
  for (const url of list) {
    try {
      let dim = null;
      try {
        const r = await fetch(url, { cache: "force-cache" });
        if (!r.ok) continue;
        dim = pngSizeFromBuffer(await r.arrayBuffer());
      } catch (_) { continue; }
      const img = await loadBitmapWithFallback(url);
      if (!img) continue;
      const w = (dim && dim.w) || img.naturalWidth || img.width || 64;
      return { image: img, pixelRatio: w / 32 };
    } catch (_) { /* 尝试下一个 URL */ }
  }
  return null;
}""")

JS = must_replace(
    JS,
    """    // 预载星球图标（本地 planet-icons 缓存）
    const files = [...new Set(planetFC.features.map(f => f.properties.icon).filter(Boolean))];
    let ok = 0, bad = 0;                       // 声明在 if 之外：下方提示需要读取
    if (files.length) {
      setMsg("正在加载星球图标…<br><small>本地 planet-icons · " + files.length + " 个</small>");
      await pool(files, 6, async (file) => {
        // 同源：无 CORS/纹理污染问题；pixelRatio 按各图实际宽度归一化
        const res = await loadPlanetIcon(ICON_DIR + file);""",
    """    // 预载星球图标（wiki.gg 直连优先，主仓本地缓存兜底）
    const files = [...new Set(planetFC.features.map(f => f.properties.icon).filter(Boolean))];
    let ok = 0, bad = 0;                       // 声明在 if 之外：下方提示需要读取
    if (files.length) {
      setMsg("正在加载星球图标…<br><small>wiki.gg planet-icons · " + files.length + " 个</small>");
      await pool(files, 6, async (file) => {
        // pixelRatio 按各图实际宽度归一化
        const res = await loadPlanetIcon([ICON_URL[file], ICON_FALLBACK[file]].filter(Boolean));""")

JS = must_replace(
    JS,
    '"图标：wiki.gg 命中 <b>" + ok + "</b> / 缺 <b>" + bad + "</b>（本地缓存，缺失的以纯色圆点显示）"',
    '"图标命中 <b>" + ok + "</b> / 缺 <b>" + bad + "</b>（wiki.gg 直连优先，缺失回退主仓本地缓存，仍缺以纯色圆点显示）"')

# 挂载场景下图标为跨域池式加载，25s 守卫偏紧（首次加载 + 271 图标可能超 25s），放宽到 60s
JS = must_replace(JS, 'console.error("[星图] map load 事件超时未触发 —— 请检查图层样式表达式是否合法");\n  }, 25000);',
                  'console.error("[星图] map load 事件超时未触发 —— 请检查图层样式表达式是否合法");\n  }, 60000);')

# 每个星球只保留中文名
JS = must_replace(
    JS,
    '`<div class="n">${esc(pr.nameCn || pr.name)}${pr.nameCn ? ` <small style="color:var(--text-mute)">${esc(pr.name)}</small>` : ""}</div>`',
    '`<div class="n">${esc(pr.nameCn || pr.name)}</div>`')
JS = must_replace(JS, '        `<span class="en">${esc(p.name || "")}</span>` +\n', "", count=2)
JS = must_replace(
    JS,
    '         ${pCn && p.name ? `<span style="color:var(--text-mute);font-size:.72rem">${esc(p.name)}</span>` : ""}\n',
    "")

# window.* 全局改挂载内状态
JS = must_replace(
    JS,
    '  window.addEventListener("resize", () => { clearTimeout(window.__rt); window.__rt = setTimeout(paintBackdrop, 250); });',
    '  window.addEventListener("resize", () => { clearTimeout(HD2SM_RT); HD2SM_RT = setTimeout(paintBackdrop, 250); });')
JS = must_replace(JS, "  window.__planetR = planetRadiusPx;", "  HD2SM_STATE.planetR = planetRadiusPx;")
JS = must_replace(JS, "    const rfn = window.__planetR;", "    const rfn = HD2SM_STATE.planetR;")
JS = must_replace(JS, "  window.__focusPlanet = focusPlanet;", "  HD2SM_STATE.focusPlanet = focusPlanet;")
JS = must_replace(JS, 'onclick="window.__focusPlanet(${index})"',
                  'onclick="window.HD2StarMap.focusPlanet(${index})"', count=2)
JS = must_replace(
    JS,
    """  window.__planetCard = showPlanetCard;      // 供自检/调试
  window.__wheel = showWheel;
  window.__rateOf = rateOf;                  // 速率推演（自检用）
  window.__pcSnap = PC_SNAP;                 // 观测快照（自检用）
window.__map = MAP;                        // 地图实例（自检用：图层/数据源核对，如 attack 源只应含入侵连线）""",
    "  HD2SM_STATE.dbg = { showPlanetCard, showWheel, rateOf, PC_SNAP, MAP };   // 自检/调试句柄（不再污染 window）")

# tactical.js 引用（内联后为模块内 const）
JS = must_replace(JS, "    if (window.Tactical) {", "    if (Tactical) {")
JS = must_replace(JS, "const t = window.Tactical.computeFor(+k, ctx);", "const t = Tactical.computeFor(+k, ctx);")

# body 级 class / 全局查询 → 挂载根节点
JS = JS.replace("document.body.classList", "ROOT.classList")
JS = must_replace(JS, 'document.querySelectorAll("aside .sec > h2")',
                  'ROOT.querySelectorAll("aside .sec > h2")')
JS = must_replace(JS, 'e.target.closest("#map")', 'e.target.closest("#hd2sm-map")')

# 动态创建元素的 id 前缀
JS = must_replace(JS, 'n.id = "tac-empty";', 'n.id = "hd2sm-tac-empty";')
JS = must_replace(JS, 'id="pc-rgdetail"', 'id="hd2sm-pc-rgdetail"')
JS = must_replace(JS, 'querySelector("#pc-biome")', 'querySelector("#hd2sm-pc-biome")')
JS = must_replace(JS, 'querySelector("#pc-buffs")', 'querySelector("#hd2sm-pc-buffs")')

# 移除末尾 boot() 自启动（由 mount 驱动）
JS = must_replace(
    JS,
    """/* ---------------------------------------------------------------- 启动 ---- */
try {
  boot();
} catch (e) {
  $("bootmsg").innerHTML = "⚠️ 初始化异常<br><small>" + esc(e.message) + "</small>";
  console.error(e);
}""", "")

# ---------------------------------------------------------------- CSS 收敛作用域 ----
ID_PAT = re.compile(r"#(" + "|".join(re.escape(x) for x in sorted(IDS, key=len, reverse=True)) + r")(?![\w-])")


def rename_ids(css):
    return ID_PAT.sub(r"#hd2sm-\1", css)


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
    """剥离选择器前奏中的前导注释，返回 (注释块, 剩余选择器文本)。"""
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
            # @font-face 原样保留；@keyframes spin 改名避免与 wiki 页撞车
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


css_a = rename_ids(CSS_INLINE.replace('url("../HD2_Wiki/assets/fonts/',
                                      'url("' + B_ROOT + 'HD2_Wiki/assets/fonts/'))
css_b = rename_ids(hud_css)
SCOPED_CSS = scope_css(css_a) + "\n\n/* ===== 以下为 map-hud.css（HUD 皮肤层，同源规则） ===== */\n\n" + scope_css(css_b)
# keyframes spin 引用改名（负向断言避免把已改名的 hd2sm-spin 二次污染）
SCOPED_CSS = re.sub(r"(?<![\w-])spin(\s+1s)", r"hd2sm-spin\1", SCOPED_CSS)

# 挂载根节点自身：尺寸/层叠隔离（覆盖原 html,body 的高度语义）
SCOPED_CSS += """
/* ===== 挂载根节点补充（build_embed.py） ===== */
.hd2sm-root{position:relative;height:var(--hd2sm-h,70vh);min-height:480px;isolation:isolate}
"""

# ---------------------------------------------------------------- tactical.js 内联 ----
TAC = must_replace(tac_js, "window.Tactical = (function () {", "const Tactical = (function () {")

# ---------------------------------------------------------------- 组装模块 ----
DOM_HTML = """<header>
  <h1>🌌 银河星图</h1>
  <span class="tag v2">实时战况 · 3D</span>
  <div class="stats" id="hd2sm-hdr"></div>
  <button id="hd2sm-aside-toggle" title="侧栏">☰</button>
  <button id="hd2sm-btn-reset">重置视角</button>
  <button id="hd2sm-btn-mode">视图：银河</button>
  <a class="btn opt" href="https://jerry114514.github.io/HD2-Galatic_war-Map/index.html" target="_blank" rel="noopener noreferrer">← 战况面板</a>
  <button id="hd2sm-aside-collapse" title="收起侧栏">▶</button>
</header>

<main>
  <div id="hd2sm-stage">
    <canvas id="hd2sm-stars"></canvas>
    <div id="hd2sm-map"></div>
    <div id="hd2sm-tip"></div>
    <div id="hd2sm-sector-card"></div>
    <div id="hd2sm-fx-layer"></div>
    <div id="hd2sm-planet-card"></div>
    <div id="hd2sm-wheel"></div>
    <div id="hd2sm-boot">
      <div class="ring"></div>
      <div class="msg" id="hd2sm-bootmsg">正在初始化星图…<br><small>加载 MapLibre 与战况数据</small></div>
    </div>
  </div>
  <div id="hd2sm-aside-backdrop"></div>
  <div id="hd2sm-aside-rail" title="展开侧栏"><span>◀</span></div>

  <aside>
    <section class="sec collapsed">
      <h2>🔍 检索</h2>
      <div class="card">
        <input class="search" id="hd2sm-q" type="search" placeholder="输入星球名…（如 CHOOHE / 海尔迈尔）" autocomplete="off">
        <div id="hd2sm-hits" style="margin-top:8px"></div>
      </div>
    </section>

    <section class="sec collapsed">
      <h2>🎛️ 阵营筛选</h2>
      <div class="card"><div class="chips" id="hd2sm-factions"></div></div>
    </section>

    <section class="sec collapsed">
      <h2>🗂️ 图层</h2>
      <div class="card"><div class="chips" id="hd2sm-layers"></div></div>
    </section>

    <section class="sec">
      <h2 id="hd2sm-detailTitle">📋 星球详情</h2>
      <div class="card" id="hd2sm-detail">
        <div class="muted">点星球 → 星球上方弹出信息卡（手机上是从底部滑出的抽屉）；
          卡里点「📄 完整资料」在新标签页打开主站资料页。<br>
          滚轮缩放 · 拖拽平移 · 右键拖拽旋转/倾斜。</div>
      </div>
    </section>

    <section class="sec">
      <h2>📖 图例</h2>
      <div class="card legend">
        <div><i style="background:var(--c-humans)"></i>超级地球</div>
        <div><i style="background:var(--c-terminids)"></i>终结族</div>
        <div><i style="background:var(--c-automaton)"></i>机器人</div>
        <div><i style="background:var(--c-illuminate)"></i>光能者</div>
        <div><span class="ln" style="border-color:rgba(239,68,68,.8)"></span>入侵战役（箭头=入侵方方向）</div>
        <div><span class="ln" style="border-image:linear-gradient(90deg,#5BA3D0,#f59e0b) 1"></span>我方蓝 → 敌方阵营色</div>
        <div><i style="border:2px solid var(--blue);background:none"></i>战术目标星球</div>
        <div><span class="ln" style="border-image:linear-gradient(90deg,#143ca0,#0096c8,#00c878,#e6c828,#f07820,#ff3c3c,#fff5eb) 1"></span>玩家热力：冷 → 白热（**相对**密度，非人数刻度）</div>
      </div>
    </section>
    <div class="muted" id="hd2sm-srcnote"></div>
  </aside>
</main>"""

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

var maplibrePromise = null;
function loadMaplibre() {
  if (window.maplibregl) return Promise.resolve();
  if (maplibrePromise) return maplibrePromise;
  maplibrePromise = new Promise(function (res, rej) {
    var s = document.createElement("script");
    s.src = B + "js/libs/maplibre/maplibre-gl-csp.js";
    s.onload = res;
    s.onerror = function () { maplibrePromise = null; rej(new Error("MapLibre 加载失败")); };
    document.head.appendChild(s);
  });
  return maplibrePromise;
}

/* ============================================================
   战术目标计算模块（原 js/tactical.js 内联，window.Tactical → 模块内 const）
   ============================================================ */
@TACTICAL@

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
  return loadMaplibre().then(function () { return boot(); }).then(function () {
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
  version: "1.0.0"
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

MODULE = MODULE.replace("@CSS@", json.dumps(SCOPED_CSS, ensure_ascii=False))
MODULE = MODULE.replace("@TACTICAL@", TAC.strip())
MODULE = MODULE.replace("@JSBODY@", JS.strip())
MODULE = MODULE.replace("@DOMHTML@", json.dumps(DOM_HTML, ensure_ascii=False))

os.makedirs(HERE, exist_ok=True)
with open(OUT_JS, "w", encoding="utf-8", newline="\n") as f:
    f.write(MODULE)
with open(os.path.join(HERE, "_scoped.css"), "w", encoding="utf-8", newline="\n") as f:
    f.write(SCOPED_CSS)
print(f"[build] OK → {os.path.relpath(OUT_JS, REPO)}  ({os.path.getsize(OUT_JS) // 1024} KB)")

# ---- 自检：残留的全局引用必须为零 ----
residual = []
for pat in ["document.body", "window.__", '="./', "location.href"]:
    if pat in MODULE.replace('window.__', 'window.__', 0):
        cnt = MODULE.count(pat)
        if pat == '="./' and cnt == 0:
            continue
        if cnt:
            residual.append((pat, cnt))
for pat, cnt in residual:
    print(f"[build][WARN] 残留引用 {pat} × {cnt}")
