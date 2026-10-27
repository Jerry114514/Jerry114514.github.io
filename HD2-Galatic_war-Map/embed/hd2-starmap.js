/* ============================================================
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
var SCRIPT_SRCS = ["./js/forecast.js?v=20261013b", "./js/regions.js", "./js/libs/maplibre/maplibre-gl-csp.js", "./js/tactical.js", "./js/dss-donations.js?v=20261014b", "./js/boot-splash.js?v=20261027b"];

var SCOPED_CSS = "/* ===== 内联样式 ===== */\n.hd2sm-root{\n    --bg-deep:#080B12; --bg-mid:#0E1420; --panel:rgba(14,20,32,.86);\n    --border:rgba(255,255,255,.10); --border-h:rgba(255,255,255,.20);\n    --text:#e2e8f0; --text-dim:#94a3b8; --text-mute:#64748b;\n    --yellow:#f5c518; --blue:#3b82f6;\n    --c-humans:#5BA3D0; --c-terminids:#F5C518; --c-automaton:#D6806D; --c-illuminate:#CF64F8;\n    --radius:12px; --radius-s:8px;\n  }\n.hd2sm-root, .hd2sm-root *, .hd2sm-root *::before, .hd2sm-root *::after{margin:0;padding:0;box-sizing:border-box}\n.hd2sm-root{height:100%;height:100dvh}\n/* 正文/标签字体：复用 wiki 侧思源黑体（不经 CDN）。\n     该字体同时供下方 MapLibre 的 localIdeographFontFamily 使用 ——\n     MapLibre 用 canvas 2D + TinySDF 走系统/本地字体渲染 CJK，故 @font-face 对地图标签同样生效。*/\n@font-face{\n    font-family:\"SourceHanSans\";\n    src:url(\"https://jerry114514.github.io/HD2_Wiki/assets/fonts/SourceHanSansCN-Medium.otf\") format(\"opentype\");\n    font-display:swap;\n  }\n.hd2sm-root{\n    display:flex;flex-direction:column;background:var(--bg-deep);color:var(--text);overflow:hidden;\n    font-family:\"SourceHanSans\",\"Microsoft YaHei\",\"PingFang SC\",sans-serif;\n  }\n/* ---------- 顶栏 ---------- */\n.hd2sm-root header{\n    display:flex;align-items:center;gap:14px;padding:9px 18px;z-index:20;\n    border-bottom:1px solid var(--border);background:var(--bg-mid);\n  }\n.hd2sm-root header h1{font-family:\"ZZZ-thick\",\"SourceHanSans\",sans-serif;font-size:1.05rem;color:var(--yellow);white-space:nowrap}\n.hd2sm-root .tag{background:var(--yellow);color:#1a1a00;font-weight:700;border-radius:999px;padding:2px 10px;font-size:.68rem;white-space:nowrap}\n.hd2sm-root .tag.v2{background:var(--blue);color:#fff}\n.hd2sm-root header .stats{margin-left:auto;color:var(--text-mute);font-size:.74rem;display:flex;gap:13px;flex-wrap:wrap;align-items:center}\n.hd2sm-root header .stats b{color:var(--text-dim);font-weight:600}\n.hd2sm-root header button, .hd2sm-root header .btn{\n    background:rgba(255,255,255,.06);border:1px solid var(--border);color:var(--text-dim);\n    border-radius:8px;padding:5px 11px;cursor:pointer;font-size:.76rem;font-family:inherit;white-space:nowrap;\n  }\n.hd2sm-root header button:hover, .hd2sm-root header .btn:hover{border-color:var(--blue);color:var(--blue)}\n.hd2sm-root header a.btn{text-decoration:none;display:inline-block}\n/* ---------- 主区 ---------- */\n.hd2sm-root main{flex:1;display:flex;min-height:0;position:relative}\n.hd2sm-root #hd2sm-stage{flex:1;position:relative;overflow:hidden;cursor:grab}\n.hd2sm-root #hd2sm-stage.dragging{cursor:grabbing}\n.hd2sm-root #hd2sm-stars{position:absolute;inset:0;width:100%;height:100%;display:block;z-index:0}\n.hd2sm-root #hd2sm-map{position:absolute;inset:0;z-index:1;background:transparent!important}\n.hd2sm-root .maplibregl-canvas{outline:none}\n.hd2sm-root .maplibregl-ctrl-attrib{display:none!important}\n/* 启动屏样式由 css/boot-splash.css 统一提供，HD2Boot.attach 接管内联 #hd2sm-boot。 */\n.hd2sm-root #hd2sm-tac-empty{\n    position:absolute;top:14px;left:50%;transform:translateX(-50%);z-index:12;pointer-events:none;white-space:nowrap;\n    background:rgba(14,20,32,.92);border:1px solid rgba(245,197,24,.45);color:var(--text-dim);\n    border-radius:999px;padding:7px 16px;font-size:.78rem;\n  }\n/* tooltip */\n.hd2sm-root #hd2sm-tip{\n    position:absolute;z-index:15;pointer-events:none;display:none;\n    background:rgba(10,14,26,.95);border:1px solid #334155;border-radius:var(--radius-s);\n    padding:9px 12px;font-size:.76rem;line-height:1.6;min-width:170px;max-width:250px;\n    box-shadow:0 8px 26px rgba(0,0,0,.6);\n  }\n.hd2sm-root #hd2sm-tip .n{font-weight:700;color:var(--yellow);margin-bottom:2px}\n.hd2sm-root #hd2sm-tip .r{color:var(--text-dim)}\n.hd2sm-root #hd2sm-tip .r span{color:var(--text)}\n.hd2sm-root #hd2sm-tip .bar{height:3px;border-radius:2px;background:rgba(255,255,255,.12);margin-top:6px;overflow:hidden}\n.hd2sm-root #hd2sm-tip .bar i{display:block;height:100%;background:var(--yellow)}\n/* ---------- 侧栏 ---------- */\n.hd2sm-root aside{\n    width:326px;flex-shrink:0;border-left:1px solid var(--border);background:var(--bg-mid);\n    overflow-y:auto;overflow-x:hidden;padding:14px;display:flex;flex-direction:column;gap:11px;z-index:10;\n    transition:width .26s ease,padding .26s ease,opacity .2s ease;\n  }\n/* 可收缩侧栏：收起后只留一条窄边条（点击恢复） */\n.hd2sm-root.aside-collapsed aside{width:0;padding:0;opacity:0;pointer-events:none;border-left:none}\n.hd2sm-root #hd2sm-aside-rail{\n    display:none;position:absolute;top:0;right:0;bottom:0;width:22px;z-index:19;cursor:pointer;\n    background:linear-gradient(90deg,rgba(14,20,32,0),rgba(14,20,32,.9));\n    border-left:1px solid var(--border);align-items:center;justify-content:center;\n  }\n.hd2sm-root.aside-collapsed #hd2sm-aside-rail{display:flex}\n.hd2sm-root #hd2sm-aside-rail span{color:var(--text-dim);font-size:.9rem}\n.hd2sm-root #hd2sm-aside-rail:hover span{color:var(--blue)}\n/* 抽屉遮罩：桌面端始终关闭（桌面用窄边条展开），仅移动端媒体查询里启用。\n     注意它必须比 aside(z25) 低 —— 否则会像旧的 #hd2sm-aside-rail 那样变成\n     一张盖住整屏、无法与星图交互的透明玻璃。 */\n.hd2sm-root #hd2sm-aside-backdrop{display:none;position:absolute;inset:0;z-index:24;background:rgba(3,6,14,.5)}\n/* ---------- 左上角星区信息卡（悬停星球时显示） ---------- */\n.hd2sm-root #hd2sm-sector-card{\n    position:absolute;left:14px;top:14px;z-index:14;display:none;min-width:206px;max-width:288px;\n    background:rgba(10,14,26,.93);border:1px solid #334155;border-radius:var(--radius);\n    padding:10px 13px;box-shadow:0 8px 26px rgba(0,0,0,.6);\n  }\n.hd2sm-root #hd2sm-sector-card.on{display:flex;gap:11px;align-items:flex-start}\n.hd2sm-root #hd2sm-sector-card .ficon{width:38px;height:38px;flex-shrink:0;margin-top:2px}\n.hd2sm-root #hd2sm-sector-card .ficon svg, .hd2sm-root #hd2sm-sector-card .ficon img{width:100%;height:100%;display:block}\n.hd2sm-root #hd2sm-sector-card .sec-name{font-family:\"ZZZ-thick\",\"SourceHanSans\",sans-serif;font-size:.98rem;color:var(--text);line-height:1.2}\n.hd2sm-root #hd2sm-sector-card .presence{font-size:.7rem;letter-spacing:.06em;margin-top:3px;text-transform:uppercase}\n.hd2sm-root #hd2sm-sector-card .librow{font-size:.82rem;color:var(--text-dim);margin-top:5px}\n.hd2sm-root #hd2sm-sector-card .librow b{color:var(--text);font-weight:700;font-variant-numeric:tabular-nums}\n.hd2sm-root #hd2sm-sector-card .bar{height:4px;border-radius:2px;background:rgba(239,68,68,.75);margin-top:6px;overflow:hidden}\n.hd2sm-root #hd2sm-sector-card .bar i{display:block;height:100%;background:var(--blue);transition:width .25s ease}\n.hd2sm-root #hd2sm-sector-card .sub{font-size:.68rem;color:var(--text-mute);margin-top:5px}\n/* 敌军阵营：改为带阵营色的胶囊，取代原先挤在一起、不易读的「敌军：A、B」纯文本 */\n.hd2sm-root #hd2sm-sector-card .enemy-row{display:flex;flex-wrap:wrap;gap:4px;margin-top:7px}\n.hd2sm-root #hd2sm-sector-card .enemy-chip{\n    display:inline-flex;align-items:center;gap:4px;font-size:.68rem;line-height:1;\n    padding:3px 7px;border-radius:999px;border:1px solid currentColor;\n    background:color-mix(in srgb, currentColor 14%, transparent);white-space:nowrap;\n  }\n.hd2sm-root #hd2sm-sector-card .enemy-chip .dot{width:6px;height:6px;border-radius:50%;background:currentColor;flex-shrink:0}\n/* 无 color-mix 支持时退回半透明底，避免胶囊看不见 */\n@supports not (background: color-mix(in srgb, red 10%, transparent)){.hd2sm-root #hd2sm-sector-card .enemy-chip{background:rgba(255,255,255,.07)}}\n/* ---------- 星球效果图标（浮动在地图上方，随地图移动） ---------- */\n/* --fx-size / --fx-img / --fx-gap 由 buildFXNodes 的 sync() 按当前 zoom 写入，\n     使图标随星球本体一起缩放（低缩放下不再盖住星球）。 */\n.hd2sm-root #hd2sm-fx-layer{\n    position:absolute;inset:0;z-index:9;pointer-events:none;overflow:hidden;\n    --fx-size:34px;--fx-img:24px;--fx-gap:42px;\n  }\n.hd2sm-root .fx-cluster{\n    position:absolute;left:0;top:0;display:flex;align-items:center;gap:3px;\n    transform:translate(-50%,-50%);will-change:transform;\n  }\n.hd2sm-root .fx-i{\n    width:var(--fx-size);height:var(--fx-size);\n    display:flex;align-items:center;justify-content:center;\n    border-radius:8px;background:rgba(8,11,18,.9);border:1px solid rgba(255,255,255,.38);\n    box-shadow:0 2px 8px rgba(0,0,0,.7);pointer-events:auto;\n  }\n/* SVG 图标随 .fx-i 的 color 着色；PNG 图标保留原配色 */\n.hd2sm-root .fx-i svg, .hd2sm-root .fx-i img{width:var(--fx-img);height:var(--fx-img);display:block}\n.hd2sm-root .fx-i svg{fill:currentColor}\n/* 描边类图标（DSS 战术行动：dss_orbital_blockade / dss_heavy_ordnance / dss_eagle_storm 等）\n     在 viewBox=256 里只写 stroke-width:2.2，缩到 --fx-img(24px) 显示后实际描边不足 0.3px →\n     渲染出来几乎是黑糊（用户反馈「DSS 效果的图片过黑」）。\n     non-scaling-stroke 让描边宽度按设备像素解释，2.2 即约 2.2px，清晰可见。 */\n.hd2sm-root .fx-i svg *{vector-effect:non-scaling-stroke}\n.hd2sm-root .fx-i img{object-fit:contain;border-radius:2px}\n.hd2sm-root .fx-more{\n    font-size:.72rem;line-height:1;padding:8px 6px;border-radius:8px;color:var(--text-dim);\n    background:rgba(8,11,18,.9);border:1px solid rgba(255,255,255,.28);\n  }\n@media (max-width:767px){.hd2sm-root .fx-cluster{gap:2px}}\n.hd2sm-root .card{background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:var(--radius);padding:11px 13px}\n.hd2sm-root aside h2{font-family:\"ZZZ-thick\",\"SourceHanSans\",sans-serif;font-size:.92rem;color:var(--yellow);display:flex;align-items:center;gap:7px}\n.hd2sm-root .search{width:100%;background:rgba(0,0,0,.35);border:1px solid var(--border);border-radius:var(--radius-s);\n    color:var(--text);padding:7px 10px;font-size:.78rem;font-family:inherit;outline:none}\n.hd2sm-root .search:focus{border-color:var(--blue)}\n.hd2sm-root .chips{display:flex;flex-wrap:wrap;gap:6px}\n.hd2sm-root .chip{\n    border:1px solid var(--border);border-radius:999px;padding:4px 11px;font-size:.73rem;cursor:pointer;\n    color:var(--text-dim);background:rgba(255,255,255,.03);user-select:none;transition:.15s;\n  }\n.hd2sm-root .chip:hover{border-color:var(--border-h);color:var(--text)}\n.hd2sm-root .chip.on{border-color:currentColor;background:rgba(255,255,255,.09);color:var(--text)}\n.hd2sm-root .chip .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle}\n.hd2sm-root .legend{font-size:.75rem;color:var(--text-dim);line-height:1.95}\n.hd2sm-root .legend i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:8px;vertical-align:middle}\n.hd2sm-root .legend .ln{display:inline-block;width:20px;height:0;border-top:2px solid;margin-right:8px;vertical-align:middle}\n.hd2sm-root .muted{color:var(--text-mute);font-size:.73rem;line-height:1.7}\n.hd2sm-root #hd2sm-detail .kv{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:9px}\n.hd2sm-root #hd2sm-detail .cell{background:rgba(255,255,255,.035);border-radius:var(--radius-s);padding:6px 9px}\n.hd2sm-root #hd2sm-detail .cell .k{color:var(--text-mute);font-size:.68rem}\n.hd2sm-root #hd2sm-detail .cell .v{font-size:.86rem;margin-top:2px}\n.hd2sm-root #hd2sm-detail .tac{border:1px solid rgba(59,130,246,.6);color:var(--blue);background:rgba(59,130,246,.1);\n    border-radius:999px;padding:3px 10px;font-size:.72rem;display:inline-block;margin:3px 4px 0 0}\n.hd2sm-root #hd2sm-detail .tacTxt{font-size:.74rem;color:var(--text-dim);line-height:1.6;margin-top:6px}\n/* ---------- 行动变量 chip（含作战限制的红色 Tag） ---------- */\n.hd2sm-root #hd2sm-detail .var-wrap{margin-top:11px;padding-top:9px;border-top:1px dashed rgba(255,255,255,.12)}\n.hd2sm-root #hd2sm-detail .var-title{font-size:.7rem;color:var(--text-mute);margin-bottom:6px;letter-spacing:.04em}\n.hd2sm-root #hd2sm-detail .var-chips{display:flex;flex-wrap:wrap;gap:5px}\n.hd2sm-root #hd2sm-detail .var-chip{\n    display:inline-flex;align-items:center;gap:4px;font-size:.7rem;line-height:1;\n    padding:3px 8px;border-radius:999px;border:1px solid var(--border);\n    background:rgba(255,255,255,.045);color:var(--text-dim);\n  }\n/* 作战限制：红色 Tag（与主站 .pd-chip-neg 同款语义） */\n.hd2sm-root #hd2sm-detail .var-chip.neg{\n    border-color:rgba(231,76,60,.6);color:#E74C3C;\n    background:rgba(231,76,60,.09);font-weight:600;\n  }\n.hd2sm-root #hd2sm-detail .var-chip .warn{font-size:.72rem}\n/* ---------- 图鉴链接：链接型行（区别于下方「聚焦到该星球」按钮） ---------- */\n.hd2sm-root .pd-wiki{\n    display:flex;align-items:center;gap:7px;margin-top:10px;\n    padding:7px 10px;border-radius:var(--radius-s);\n    border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.035);\n    color:var(--text-dim);font-size:.74rem;text-decoration:none;\n    transition:border-color .15s,background .15s,color .15s;\n  }\n.hd2sm-root .pd-wiki:hover{border-color:currentColor;background:rgba(255,255,255,.07)}\n.hd2sm-root .pd-wiki .ic{font-size:.8rem;flex-shrink:0}\n.hd2sm-root .pd-wiki .badge{\n    padding:2px 8px;border-radius:999px;font-size:.7rem;font-weight:700;white-space:nowrap;\n    border:1px solid currentColor;\n    background:color-mix(in srgb, currentColor 16%, transparent);\n  }\n@supports not (background: color-mix(in srgb, red 10%, transparent)){.hd2sm-root .pd-wiki .badge{background:rgba(255,255,255,.08)}}\n.hd2sm-root .pd-wiki .tx{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.hd2sm-root .pd-wiki .go{flex-shrink:0;opacity:.65;font-size:.78rem;transition:transform .15s,opacity .15s}\n.hd2sm-root .pd-wiki:hover .go{opacity:1;transform:translate(1px,-1px)}\n/* 配色：变种=黄、阵营=紫、我方=蓝，与星球归属/效果图标语义一致 */\n.hd2sm-root .pd-wiki.strain{color:var(--yellow)}\n.hd2sm-root .pd-wiki.faction{color:var(--c-illuminate)}\n.hd2sm-root .pd-wiki.humans{color:var(--c-humans)}\n.hd2sm-root #hd2sm-hits{max-height:210px;overflow-y:auto;display:flex;flex-direction:column;gap:3px}\n.hd2sm-root #hd2sm-hits .hit{display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:6px;cursor:pointer;font-size:.76rem}\n.hd2sm-root #hd2sm-hits .hit:hover{background:rgba(255,255,255,.07)}\n.hd2sm-root #hd2sm-hits .hit .dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}\n.hd2sm-root #hd2sm-hits .hit .own{margin-left:auto;color:var(--text-mute);font-size:.68rem}\n.hd2sm-root #hd2sm-hits .hit .hit-wiki{text-decoration:none;color:var(--blue);font-size:.72rem;padding:0 4px;border:1px solid transparent;border-radius:4px}\n.hd2sm-root #hd2sm-hits .hit .hit-wiki:hover{color:var(--yellow);border-color:var(--yellow)}\n.hd2sm-root ::-webkit-scrollbar{width:8px;height:8px}\n.hd2sm-root ::-webkit-scrollbar-thumb{background:rgba(255,255,255,.14);border-radius:4px}\n.hd2sm-root ::-webkit-scrollbar-track{background:transparent}\n/* ---------- 移动端适配 ---------- */\n.hd2sm-root #hd2sm-aside-toggle{display:none}\n/* 桌面用顶栏按钮 */\n@media (max-width:900px){.hd2sm-root aside{width:270px;padding:10px}\n.hd2sm-root header h1{font-size:.92rem}\n.hd2sm-root header .stats{display:none}\n.hd2sm-root #hd2sm-sector-card{left:10px;top:10px;min-width:0;max-width:calc(100% - 20px)}\n.hd2sm-root #hd2sm-sector-card .ficon{width:30px;height:30px}}\n@media (max-width:767px){/* 顶栏：只保留标题与侧栏开关 */\n.hd2sm-root header{padding:8px 10px;gap:8px;flex-wrap:nowrap}\n.hd2sm-root header .tag, .hd2sm-root header #hd2sm-btn-reset, .hd2sm-root header #hd2sm-btn-mode, .hd2sm-root header .btn.opt{display:none}\n.hd2sm-root header h1{font-size:.86rem}\n.hd2sm-root #hd2sm-aside-toggle{display:inline-block}\n/* 移动端：侧栏改为右侧抽屉浮层，不占地图宽度。\n       ⚠ 层叠陷阱：媒体查询里的 `aside{}` 特异度只有 (0,0,1)，会被通用的\n       `body.aside-collapsed aside{}` (0,1,1) 压过 —— 所以这里不能只靠\n       「默认隐藏」，必须用同等或更高特异度显式声明可见态，否则抽屉永远停在屏幕外。 */\n.hd2sm-root aside{\n      position:absolute;top:0;bottom:0;right:0;width:min(84vw,320px);\n      box-shadow:-10px 0 30px rgba(0,0,0,.55);z-index:25;\n      transform:translateX(105%);transition:transform .24s ease;\n    }\n/* 抽屉打开 = 未收起。这样 ☰ 的语义在桌面/移动端保持一致：\n       桌面收成窄边条、移动端收进屏幕外，都是同一个「收起」。 */\n.hd2sm-root:not(.aside-collapsed) aside{transform:translateX(0)}\n/* 关键修复：旧规则把窄边条拉成 100%×100% 的半透明整屏，\n       侧栏一收起就变成盖住整个星图、点不动任何东西的玻璃板。\n       移动端横向空间本就不够，展开侧栏改由顶栏 ☰ / 遮罩负责。 */\n.hd2sm-root #hd2sm-aside-rail{display:none !important}\n/* 抽屉打开时抽屉会盖住顶栏，所以把 ☰ 浮到抽屉之上，始终可点 */\n.hd2sm-root #hd2sm-aside-toggle{\n      position:absolute;top:7px;right:9px;z-index:27;\n      padding:4px 10px;line-height:1.25;font-size:1.02rem;\n      box-shadow:0 2px 10px rgba(0,0,0,.55);\n    }\n.hd2sm-root:not(.aside-collapsed) #hd2sm-aside-toggle{color:var(--yellow);border-color:var(--yellow)}\n/* 抽屉遮罩（仅移动端存在）：铺在地图上、位于抽屉之下，点它即收起。\n       不透明度只用 .5 —— 否则地图变暗后会被误认为「点不动」。 */\n.hd2sm-root #hd2sm-aside-backdrop{\n      display:block;position:absolute;inset:0;z-index:24;\n      background:rgba(3,6,14,.5);backdrop-filter:blur(2px);\n    }\n.hd2sm-root.aside-collapsed #hd2sm-aside-backdrop{display:none}\n/* 移动端：地图铺满，控件缩小 */\n.hd2sm-root .maplibregl-ctrl-bottom-right{bottom:8px;right:6px}\n.hd2sm-root .maplibregl-ctrl-bottom-left{display:none}\n.hd2sm-root #hd2sm-sector-card{font-size:.92em}\n.hd2sm-root #hd2sm-tac-empty{font-size:.7rem;left:10px;right:10px}\n.hd2sm-root #hd2sm-tip{min-width:0;width:206px;max-width:206px;font-size:.72rem;padding:7px 10px}}\n/* ════════════════════════════════════════════════════════════\n     2026-09-15：点击星球 → 星球**正上方**信息卡（不再直接弹侧栏）\n                 再次点击 → 轮盘（星球详细信息 / DSS 效果）\n     参考 helldiverscompanion.com/#hd2sm-map 的交互与信息组织\n     ════════════════════════════════════════════════════════════ */\n/* ---- 侧栏手风琴（2026-09-25 用户裁定：三栏滤镜保留但不默认展开）----\n     检索 / 阵营筛选 / 图层 默认 .collapsed（markup 里写死），点标题展开；星球详情与图例默认展开。 */\n.hd2sm-root aside .sec > h2{cursor:pointer;user-select:none;display:flex;align-items:center;gap:6px}\n.hd2sm-root aside .sec > h2::after{content:\"▾\";margin-left:auto;font-size:.7rem;color:var(--text-mute);transition:transform .15s}\n.hd2sm-root aside .sec.collapsed > h2::after{transform:rotate(-90deg)}\n.hd2sm-root aside .sec.collapsed > .card{display:none}\n/* 信息卡上的「完整资料 / 聚焦」按钮组 */\n.hd2sm-root .pc-actions{display:flex;gap:6px;margin-top:9px}\n.hd2sm-root .pc-actions .btn{flex:1;font-size:.74rem;text-align:center;text-decoration:none;line-height:1.5}\n.hd2sm-root .pc-actions .btn.primary{border-color:var(--yellow);color:var(--yellow)}\n/* 移动端：信息卡改成底部抽屉（positionOverlays 写的是行内 left/top，用 !important 压过）\n     ⚠ 2026-09-26 修（用户反馈：手机上卡片跑到左上角、还渲染出界）：\n       旧规则只压了 left/top，**漏了行内 `transform: translate(-50%,-100%)`** ——\n       那条 transform 是为\"桌面端贴在星球正上方\"设计的：卡片变全宽后，\n       `-100%` 会把它整体**向上抬整整一个卡片高度**，于是从底部抽屉跑到屏幕外／左上角。\n       根治办法不是再加一条 patch，而是**桌面端别再写死坐标**（见 positionOverlays 的 isMobile 分支），\n       这里同时把 transform 归零，双保险。 */\n@media (max-width:767px){.hd2sm-root #hd2sm-planet-card{left:0 !important;right:0;bottom:0;top:auto !important;width:auto;max-height:66vh;overflow:auto;\n      border-left:none;border-right:none;border-bottom:none;\n      transform:none !important}\n.hd2sm-root #hd2sm-planet-card::after{display:none}\n.hd2sm-root .pc-actions .btn{min-height:40px;display:flex;align-items:center;justify-content:center}}\n.hd2sm-root #hd2sm-planet-card{\n    position:absolute;z-index:18;display:none;width:322px;\n    background:var(--panel);border:1px solid var(--line-2);\n    border-top:3px solid var(--pc-color,var(--yellow));\n    cursor:pointer;\n  }\n.hd2sm-root #hd2sm-planet-card.on{display:block}\n.hd2sm-root #hd2sm-planet-card::after{                       /* 指向星球的小三角 */\n    content:\"\";position:absolute;left:50%;bottom:-7px;transform:translateX(-50%);\n    width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;\n    border-top:7px solid var(--pc-color,var(--yellow));\n  }\n.hd2sm-root #hd2sm-planet-card .hd{\n    display:flex;align-items:center;gap:8px;padding:4px 9px;\n    background:var(--stripe);border-bottom:1px solid #33270A;\n  }\n.hd2sm-root #hd2sm-planet-card .kind{font-family:var(--font-mono);font-size:.66rem;font-weight:700;\n    color:var(--yellow);letter-spacing:.1em;text-transform:uppercase}\n.hd2sm-root #hd2sm-planet-card .eta{margin-left:auto;font-family:var(--font-mono);font-size:.66rem;color:var(--text-dim);white-space:nowrap}\n.hd2sm-root #hd2sm-planet-card .eta.lose{color:#FF4D2E;font-weight:700}\n.hd2sm-root #hd2sm-planet-card .kind.ok{color:#1FA84A;font-size:.7rem}\n.hd2sm-root #hd2sm-planet-card .title{display:flex;align-items:center;gap:9px;padding:7px 9px 6px}\n.hd2sm-root #hd2sm-planet-card .ficon{width:30px;height:30px;flex:0 0 30px;color:var(--pc-color)}\n.hd2sm-root #hd2sm-planet-card .ficon svg, .hd2sm-root #hd2sm-planet-card .ficon img{width:100%;height:100%;display:block}\n.hd2sm-root #hd2sm-planet-card .names{min-width:0;line-height:1.25}\n.hd2sm-root #hd2sm-planet-card .nm{display:block;font-family:\"ZZZ-thick\",\"SourceHanSans\",sans-serif;\n    font-size:.94rem;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.hd2sm-root #hd2sm-planet-card .en{display:block;font-family:var(--font-mono);font-size:.62rem;color:var(--text-mute);\n    white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.hd2sm-root #hd2sm-planet-card .sec{display:block;font-size:.66rem;color:var(--text-dim);margin-top:2px}\n.hd2sm-root #hd2sm-planet-card .biome{position:relative;height:72px;overflow:hidden;\n    border-top:1px solid var(--line-2);border-bottom:1px solid var(--line-2);background:#0D0D0D}\n.hd2sm-root #hd2sm-planet-card .biome img{width:100%;height:100%;object-fit:cover;display:block}\n.hd2sm-root #hd2sm-planet-card .biome .noimg{display:grid;place-items:center;height:100%;font-size:.66rem;color:var(--text-mute)}\n.hd2sm-root #hd2sm-planet-card .buffs{display:flex;flex-wrap:wrap;gap:3px;padding:4px 9px;background:#0B0B0B;min-height:24px;align-items:center}\n.hd2sm-root #hd2sm-planet-card .bi{width:19px;height:19px;flex:0 0 19px;border:1px solid var(--line-2);\n    background:#141414;display:grid;place-items:center}\n.hd2sm-root #hd2sm-planet-card .bi svg, .hd2sm-root #hd2sm-planet-card .bi img{width:14px;height:14px;display:block}\n.hd2sm-root #hd2sm-planet-card .bar{position:relative;height:11px;margin:8px 9px 0;background:#1A1A1A;\n    border:1px solid var(--line-2);overflow:hidden}\n.hd2sm-root #hd2sm-planet-card .bar i{display:block;height:100%;background:var(--pc-color,var(--yellow))}\n.hd2sm-root #hd2sm-planet-card .bar .mk{position:absolute;top:-2px;width:2px;height:15px;background:#fff;opacity:.85}\n.hd2sm-root #hd2sm-planet-card .lib{display:flex;align-items:baseline;gap:8px;padding:5px 9px 0}\n.hd2sm-root #hd2sm-planet-card .lib b{font-family:var(--font-mono);font-size:1rem;color:var(--text)}\n.hd2sm-root #hd2sm-planet-card .lib .st{font-size:.68rem;color:var(--text-dim)}\n.hd2sm-root #hd2sm-planet-card .rate{margin-left:auto;font-family:var(--font-mono);font-size:.74rem;font-weight:700}\n.hd2sm-root #hd2sm-planet-card .rate .m{font-size:.6rem;font-weight:400;color:var(--text-mute);margin-left:3px}\n.hd2sm-root #hd2sm-planet-card .stats{display:grid;grid-template-columns:1fr 1fr;gap:2px 10px;\n    padding:6px 9px;margin-top:6px;border-top:1px solid var(--line-2)}\n.hd2sm-root #hd2sm-planet-card .st2{font-size:.68rem;color:var(--text-mute);white-space:nowrap}\n.hd2sm-root #hd2sm-planet-card .st2 b{font-family:var(--font-mono);color:var(--text);font-weight:700}\n.hd2sm-root #hd2sm-planet-card .tail{padding:3px 9px 6px;font-size:.6rem;color:var(--text-mute);\n    font-family:var(--font-mono);border-top:1px solid #161616}\n/* ── 防御战（入侵）卡片（2026-09-24 新增）──────────────────────────────\n     被入侵星球不再显示「已解放 100%」，改用与主页一致的**双进度条 + 战况**，\n     但视觉沿用星图这套（直角条 + 等宽数字 + 斜纹头）。\n     ⚠ P0 铁律（交接文档 §11.1-7）：双条**顺序固定为上=超级地球、下=入侵方**，\n       且超级地球那条**恒为蓝**；卡片外框/顶部色表达\"谁在打\"（入侵方），两者必须解耦。 */\n.hd2sm-root #hd2sm-planet-card .kind.def{color:#FF6A4A}\n.hd2sm-root #hd2sm-planet-card.def .ficon{color:var(--c-humans)}\n/* 星球归属仍是超级地球，图标不吃卡片威胁色 */\n.hd2sm-root #hd2sm-planet-card .def-race{padding:8px 9px 2px;display:grid;gap:5px}\n.hd2sm-root #hd2sm-planet-card .def-row{display:grid;grid-template-columns:62px 1fr 54px;align-items:center;gap:6px}\n.hd2sm-root #hd2sm-planet-card .def-row .lbl{font-size:.66rem;color:var(--text-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.hd2sm-root #hd2sm-planet-card .def-row .val{font-family:var(--font-mono);font-size:.68rem;color:var(--text);text-align:right}\n.hd2sm-root #hd2sm-planet-card .def-row .track{position:relative;height:9px;background:#1A1A1A;border:1px solid var(--line-2);overflow:hidden}\n.hd2sm-root #hd2sm-planet-card .def-row .track i{display:block;height:100%}\n.hd2sm-root #hd2sm-planet-card .def-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;\n    padding:4px 9px 0;font-size:.66rem;color:var(--text-mute)}\n.hd2sm-root #hd2sm-planet-card .def-meta b{font-family:var(--font-mono);color:var(--text);font-weight:700}\n.hd2sm-root #hd2sm-planet-card .def-meta .st-win{color:#1FA84A}\n.hd2sm-root #hd2sm-planet-card .def-meta .st-lose{color:#FF4D2E}\n/* ── 星球下属区域：城市 / 超大型工厂（2026-09-24 demo）─────────────────\n     对应游戏内「点开星球 → 左栏列城市/超大型工厂」，命名与类型取 wiki 的静态数据，\n     进度取 companion 的 warStatus.planetRegions（真实运行时）。 */\n.hd2sm-root #hd2sm-planet-card .regions{margin-top:6px;border-top:1px solid var(--line-2)}\n.hd2sm-root #hd2sm-planet-card .rg-hd{display:flex;align-items:baseline;gap:6px;padding:5px 9px 3px;\n    font-size:.7rem;color:var(--yellow);font-family:var(--font-mono)}\n.hd2sm-root #hd2sm-planet-card .rg-hd b{color:var(--text)}\n.hd2sm-root #hd2sm-planet-card .rg-tip{margin-left:auto;font-size:.6rem;color:var(--text-mute);font-family:inherit}\n.hd2sm-root #hd2sm-planet-card .rg-list{display:grid;gap:1px;padding:0 5px 5px}\n.hd2sm-root #hd2sm-planet-card .rg-row{display:grid;grid-template-columns:16px 1fr 76px 50px;align-items:center;gap:5px;\n    padding:3px 4px;background:none;border:1px solid transparent;color:var(--text);\n    font:inherit;text-align:left;cursor:pointer}\n.hd2sm-root #hd2sm-planet-card .rg-row:hover{border-color:var(--line-2);background:#121212}\n.hd2sm-root #hd2sm-planet-card .rg-row.on{border-color:var(--yellow);background:#161205}\n.hd2sm-root #hd2sm-planet-card .rg-ico{font-size:.72rem;text-align:center}\n.hd2sm-root #hd2sm-planet-card .rg-name{font-size:.72rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.hd2sm-root #hd2sm-planet-card .rg-name i{font-style:normal;color:var(--text-mute);font-size:.6rem;margin-left:4px}\n.hd2sm-root #hd2sm-planet-card .rg-type{font-size:.6rem;color:var(--text-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.hd2sm-root #hd2sm-planet-card .rg-type em{font-style:normal;color:var(--yellow);margin-left:2px;font-size:.55rem}\n.hd2sm-root #hd2sm-planet-card .rg-lib{font-family:var(--font-mono);font-size:.66rem;color:var(--text);text-align:right}\n.hd2sm-root #hd2sm-planet-card .rg-detail{margin:2px 9px 8px;padding:6px 7px;background:#0D0D0D;border:1px solid var(--line-2)}\n.hd2sm-root #hd2sm-planet-card .rg-d-hd{font-size:.72rem;color:var(--yellow);margin-bottom:3px}\n.hd2sm-root #hd2sm-planet-card .rg-d-hd i{font-style:normal;color:var(--text-mute);font-size:.6rem;margin-left:4px}\n.hd2sm-root #hd2sm-planet-card .rg-d-meta{display:flex;flex-wrap:wrap;gap:8px;font-size:.62rem;color:var(--text-mute)}\n.hd2sm-root #hd2sm-planet-card .rg-d-meta b{font-family:var(--font-mono);color:var(--text)}\n.hd2sm-root #hd2sm-planet-card .rg-d-desc{margin-top:4px;font-size:.64rem;line-height:1.55;color:var(--text-dim)}\n.hd2sm-root #hd2sm-planet-card .rg-d-act{margin-top:4px;font-size:.62rem;line-height:1.5;color:var(--text-mute);\n    border-top:1px solid #1a1a1a;padding-top:4px}\n/* 轮盘 */\n.hd2sm-root #hd2sm-wheel{position:absolute;z-index:19;display:none;width:186px;height:186px;\n    transform:translate(-50%,-50%);cursor:pointer}\n.hd2sm-root #hd2sm-wheel.on{display:block}\n.hd2sm-root #hd2sm-wheel svg{width:100%;height:100%;display:block;overflow:visible}\n.hd2sm-root #hd2sm-wheel .sect path{fill:rgba(12,12,12,.94);stroke:var(--line-2);stroke-width:1}\n.hd2sm-root #hd2sm-wheel .sect:hover path{fill:#1A1200;stroke:var(--yellow)}\n.hd2sm-root #hd2sm-wheel .sect text{fill:var(--text-dim);font-size:10.5px;font-family:var(--font-mono);\n    pointer-events:none;letter-spacing:.04em}\n.hd2sm-root #hd2sm-wheel .sect:hover text{fill:var(--yellow)}\n.hd2sm-root #hd2sm-wheel .sect text.sub{font-size:8.5px;fill:var(--text-mute)}\n.hd2sm-root #hd2sm-wheel .ctr circle{fill:#0B0B0B;stroke:var(--yellow);stroke-width:2}\n.hd2sm-root #hd2sm-wheel .ctr:hover circle{fill:#1A1200}\n.hd2sm-root #hd2sm-wheel .ctr text{fill:var(--yellow);font-size:9px;font-family:var(--font-mono);\n    text-anchor:middle;pointer-events:none;letter-spacing:.06em}\n@media (max-width:767px){.hd2sm-root #hd2sm-planet-card{width:min(300px,calc(100% - 16px))}\n.hd2sm-root #hd2sm-wheel{width:160px;height:160px}}\n\n/* ===== map-hud.css ===== */\n/* ============================================================\n   银河星图（galaxy-map-v2） · HUD 皮肤层\n   Diegetic Tactical HUD / Diesel Punk —— 与主站 hud-skin.css 同源同规则\n   ------------------------------------------------------------\n   加载顺序：`<style>`（本文件第 25–310 行的内联样式）→ maplibre-gl.css → **本文件**\n   星图的样式全部内联在页面里（284 行），本层插在其后，同特异度即可覆盖。\n   ⚠ 第①节用 !important 一次性压制历史写法；新增组件请直接写规范样式。\n   ============================================================ */\n/* ════════════════ ① 反模式清零 ════════════════ */\n.hd2sm-root, .hd2sm-root *, .hd2sm-root *::before, .hd2sm-root *::after{\n  border-radius: 0 !important;\n  box-shadow: none !important;\n  backdrop-filter: none !important;\n  -webkit-backdrop-filter: none !important;\n  text-shadow: none !important;\n}\n/* ════════════════ ② 令牌：与主站对齐 ════════════════ */\n.hd2sm-root{\n  --bg-deep: #0A0A0A;\n  --bg-mid: #101010;\n  --panel: #111111;\n  --panel-2: #0F0F0F;\n  --border: #1F1F1F;\n  --border-h: #3A2A00;\n  --line-2: #2A2A2A;\n  --text: #F2F2F2;\n  --text-dim: #A8A8A8;\n  --text-mute: #6E6E6E;\n  --yellow: #FFB000;\n  --yellow-2: #FFC94A;\n  --brass: #C8862A;\n  --blue: #3B82F6;\n  --ok: #1FA84A;\n  --warn: #FF4D2E;\n  --radius: 0;\n  --radius-s: 0;\n  --blur: none;\n  --stripe: repeating-linear-gradient(45deg, rgba(255,176,0,.14) 0 6px, transparent 6px 12px);\n  --font-mono: \"Rajdhani\",\"Orbitron\",\"Consolas\",\"Courier New\",monospace;\n  /* 阵营色：超级地球 = 蓝 #5BA3D0（2026-09-24 用户要求，与主页 tokens.css 的 --c-humans 同值；\n     2026-09-18~09-24 曾用黄 #ffe800，与终结族黄 #F5C518 在星图上难以分辨）；\n     其余三阵营保留不动（辨识度优先）。本层在内联 <style> 之后加载，故这里是**实际生效**的值 ——\n     改星图阵营色必须改这一行，只改 galaxy-map-v2.html 的内联 <style> 不生效。 */\n  --c-humans: #5BA3D0; --c-terminids: #F5C518; --c-automaton: #D6806D; --c-illuminate: #CF64F8;\n}\n.hd2sm-root{ background: var(--bg-deep); color: var(--text); font-size: 14px; }\n/* 战术数据一律等宽 */\n.hd2sm-root header .stats, .hd2sm-root #hd2sm-tip .r span, .hd2sm-root #hd2sm-sector-card .librow b, .hd2sm-root #hd2sm-detail .cell .v, .hd2sm-root .pd-wiki .badge, .hd2sm-root .legend, .hd2sm-root #hd2sm-hits .hit .own, .hd2sm-root #hd2sm-sector-card .sub{ font-family: var(--font-mono); }\n/* ════════════════ ③ 顶栏 ════════════════ */\n.hd2sm-root header{\n  background: var(--bg-deep);\n  border-bottom: 1px solid var(--border);\n  position: relative;\n  padding: 8px 16px;\n}\n/* 顶栏下沿的琥珀斜纹带（与主站导航同款） */\n.hd2sm-root header::after{\n  content: \"\"; position: absolute; left: 0; right: 0; bottom: -4px; height: 3px;\n  background: var(--stripe); border-top: 1px solid #241B00; pointer-events: none; z-index: 21;\n}\n.hd2sm-root header h1{ color: var(--text); letter-spacing: .05em; padding-left: 10px; border-left: 4px solid var(--yellow); }\n.hd2sm-root .tag{ background: var(--yellow); color: #000; border: 1px solid var(--yellow); padding: 2px 7px;\n  font-weight: 700; letter-spacing: .08em; text-transform: uppercase; font-size: .66rem; }\n.hd2sm-root .tag.v2{ background: var(--blue); color: #fff; border-color: var(--blue); }\n.hd2sm-root header .stats{ color: var(--text-mute); font-size: .72rem; }\n.hd2sm-root header .stats b{ color: var(--text-dim); }\n.hd2sm-root header button, .hd2sm-root header .btn{\n  background: var(--panel-2);\n  border: 1px solid var(--line-2);\n  border-top: 2px solid var(--brass);\n  color: var(--text-dim);\n  padding: 4px 10px;\n  font-weight: 700;\n  letter-spacing: .05em;\n  font-size: .74rem;\n}\n.hd2sm-root header button:hover, .hd2sm-root header .btn:hover{\n  border-color: var(--yellow); border-top-color: var(--yellow);\n  color: var(--yellow); background: #1A1200;\n}\n.hd2sm-root:not(.aside-collapsed) #hd2sm-aside-toggle{ color: var(--yellow); border-color: var(--yellow); }\n/* ════════════════ ④ 载入遮罩 / 提示浮层 ════════════════ */\n.hd2sm-root #hd2sm-boot{ background: var(--bg-deep); }\n/* 转圈改「扫描方框」：方角 + 只有顶边是琥珀 */\n.hd2sm-root #hd2sm-boot .ring{\n  width: 42px; height: 42px;\n  border: 2px solid var(--line-2);\n  border-top-color: var(--yellow);\n  animation: hd2sm-spin 1s linear infinite;\n}\n.hd2sm-root #hd2sm-boot .msg{ color: var(--text-dim); }\n.hd2sm-root #hd2sm-boot .msg small{ color: var(--text-mute); }\n.hd2sm-root #hd2sm-tac-empty{\n  background: var(--panel);\n  border: 1px solid var(--line-2);\n  border-left: 3px solid var(--yellow);\n  color: var(--text-dim);\n  padding: 6px 14px;\n  font-size: .76rem;\n}\n.hd2sm-root #hd2sm-tip{\n  background: var(--panel);\n  border: 1px solid var(--line-2);\n  border-top: 2px solid var(--yellow);\n  color: var(--text-dim);\n  padding: 8px 11px;\n}\n.hd2sm-root #hd2sm-tip .n{ color: var(--yellow); }\n.hd2sm-root #hd2sm-tip .r{ color: var(--text-mute); }\n.hd2sm-root #hd2sm-tip .r span{ color: var(--text); }\n.hd2sm-root #hd2sm-tip .bar{ height: 5px; background: #1A1A1A; border: 1px solid var(--line-2); }\n.hd2sm-root #hd2sm-tip .bar i{ background: var(--yellow); }\n/* ════════════════ ⑤ 侧栏 ════════════════ */\n.hd2sm-root aside{\n  background: var(--panel-2);\n  border-left: 1px solid var(--border);\n  padding: 12px;\n  gap: 10px;\n}\n.hd2sm-root #hd2sm-aside-rail{\n  background: var(--panel);\n  border-left: 1px solid var(--line-2);\n}\n.hd2sm-root #hd2sm-aside-rail:hover{ background: #1A1200; }\n.hd2sm-root #hd2sm-aside-rail:hover span{ color: var(--yellow); }\n.hd2sm-root #hd2sm-aside-backdrop{ background: rgba(0,0,0,.72); }\n.hd2sm-root #hd2sm-aside-toggle{ background: var(--panel); border: 1px solid var(--line-2); border-top: 2px solid var(--brass); color: var(--text-dim); }\n/* 侧栏小节标题：复刻 DSS 小节标题（斜纹底 + 琥珀字 + 硬描边） */\n.hd2sm-root aside h2{\n  font-size: .78rem;\n  color: var(--yellow);\n  letter-spacing: .12em;\n  text-transform: uppercase;\n  background: var(--stripe);\n  border: 1px solid #33270A;\n  border-left: 3px solid var(--yellow);\n  padding: 5px 9px;\n}\n.hd2sm-root .card{\n  background: var(--panel);\n  border: 1px solid var(--border);\n  border-top: 2px solid var(--brass);\n  padding: 10px 12px;\n}\n.hd2sm-root .search{\n  background: var(--panel-2);\n  border: 1px solid var(--line-2);\n  border-left: 3px solid var(--brass);\n  color: var(--text);\n  padding: 6px 9px;\n}\n.hd2sm-root .search:focus{ border-color: var(--yellow); border-left-color: var(--yellow); }\n/* 筛选 chip：方角 + 硬描边 */\n.hd2sm-root .chip{\n  background: var(--panel-2);\n  border: 1px solid var(--line-2);\n  color: var(--text-dim);\n  padding: 3px 10px;\n  font-size: .72rem;\n}\n.hd2sm-root .chip:hover{ border-color: var(--brass); color: var(--text); }\n.hd2sm-root .chip.on{ border-color: var(--yellow); background: #1A1200; color: var(--yellow); font-weight: 700; }\n.hd2sm-root .chip .dot{ width: 7px; height: 7px; }\n.hd2sm-root .legend{ color: var(--text-dim); font-size: .73rem; }\n.hd2sm-root .legend i{ width: 9px; height: 9px; }\n.hd2sm-root .muted{ color: var(--text-mute); }\n/* ════════════════ ⑥ 星区信息卡（悬停星球） ════════════════ */\n.hd2sm-root #hd2sm-sector-card{\n  background: var(--panel);\n  border: 1px solid var(--line-2);\n  border-top: 3px solid var(--yellow);\n  padding: 9px 12px;\n}\n.hd2sm-root #hd2sm-sector-card .sec-name{ color: var(--text); }\n.hd2sm-root #hd2sm-sector-card .librow{ color: var(--text-dim); }\n.hd2sm-root #hd2sm-sector-card .librow b{ color: var(--text); }\n.hd2sm-root #hd2sm-sector-card .bar{ height: 6px; background: rgba(255,77,46,.55); border: 1px solid var(--line-2); }\n.hd2sm-root #hd2sm-sector-card .bar i{ background: var(--c-humans); }\n.hd2sm-root #hd2sm-sector-card .sub{ color: var(--text-mute); }\n.hd2sm-root #hd2sm-sector-card .enemy-chip{\n  border: 1px solid currentColor;\n  background: rgba(255,255,255,.05);\n  padding: 2px 6px;\n  font-size: .66rem;\n}\n.hd2sm-root #hd2sm-sector-card .enemy-chip .dot{ width: 6px; height: 6px; }\n/* ════════════════ ⑦ 效果图标浮层 ════════════════ */\n.hd2sm-root .fx-i{\n  background: rgba(10,10,10,.92);\n  border: 1px solid var(--line-2);\n}\n.hd2sm-root .fx-i:hover{ border-color: var(--yellow); }\n.hd2sm-root .fx-i img{ border-radius: 0; }\n.hd2sm-root .fx-more{\n  background: rgba(10,10,10,.92);\n  border: 1px solid var(--line-2);\n  color: var(--text-dim);\n}\n/* ════════════════ ⑧ 详情面板（右栏下半） ════════════════ */\n.hd2sm-root #hd2sm-detail .kv{ gap: 6px; }\n.hd2sm-root #hd2sm-detail .cell{\n  background: var(--panel-2);\n  border: 1px solid var(--border);\n  border-left: 2px solid var(--line-2);\n  padding: 5px 8px;\n}\n.hd2sm-root #hd2sm-detail .cell .k{ color: var(--text-mute); font-size: .66rem; letter-spacing: .06em; }\n.hd2sm-root #hd2sm-detail .cell .v{ color: var(--text); }\n.hd2sm-root #hd2sm-detail .tac{\n  border: 1px solid var(--blue);\n  background: rgba(59,130,246,.10);\n  color: var(--blue);\n  padding: 2px 8px;\n  font-size: .7rem;\n}\n.hd2sm-root #hd2sm-detail .tacTxt{ color: var(--text-dim); }\n.hd2sm-root #hd2sm-detail .var-wrap{ border-top: 1px solid var(--line-2); }\n.hd2sm-root #hd2sm-detail .var-title{ color: var(--text-mute); font-size: .68rem; letter-spacing: .1em; text-transform: uppercase; }\n.hd2sm-root #hd2sm-detail .var-chip{\n  border: 1px solid var(--line-2);\n  border-left: 2px solid var(--brass);\n  background: var(--panel-2);\n  color: var(--text-dim);\n  padding: 2px 7px;\n  font-size: .68rem;\n}\n.hd2sm-root #hd2sm-detail .var-chip.neg{\n  border-color: var(--warn); border-left-color: var(--warn);\n  background: rgba(255,77,46,.09); color: var(--warn); font-weight: 600;\n}\n/* 图鉴链接行 */\n.hd2sm-root .pd-wiki{\n  border: 1px solid var(--line-2);\n  border-left: 3px solid var(--brass);\n  background: var(--panel-2);\n  color: var(--text-dim);\n  padding: 6px 9px;\n}\n.hd2sm-root .pd-wiki:hover{ border-color: currentColor; border-left-color: currentColor; background: #1A1200; }\n.hd2sm-root .pd-wiki .badge{\n  border: 1px solid currentColor;\n  background: rgba(255,255,255,.05);\n  padding: 1px 7px;\n  font-size: .68rem;\n}\n.hd2sm-root .pd-wiki.strain{ color: var(--yellow); }\n.hd2sm-root .pd-wiki.faction{ color: var(--c-illuminate); }\n.hd2sm-root .pd-wiki.humans{ color: var(--c-humans); }\n/* 搜索命中列表 */\n.hd2sm-root #hd2sm-hits .hit{ padding: 4px 8px; border-left: 2px solid transparent; font-size: .74rem; color: var(--text-dim); }\n.hd2sm-root #hd2sm-hits .hit:hover{ background: #1A1200; border-left-color: var(--yellow); color: var(--text); }\n.hd2sm-root #hd2sm-hits .hit .dot{ width: 7px; height: 7px; }\n.hd2sm-root #hd2sm-hits .hit .own{ color: var(--text-mute); }\n/* ════════════════ ⑨ 滚动条 ════════════════ */\n.hd2sm-root ::-webkit-scrollbar{ width: 8px; height: 8px; }\n.hd2sm-root ::-webkit-scrollbar-thumb{ background: #2A2A2A; }\n.hd2sm-root ::-webkit-scrollbar-thumb:hover{ background: var(--brass); }\n.hd2sm-root ::-webkit-scrollbar-track{ background: #0D0D0D; }\n/* ════════════════ ⑩ 移动端密度 ════════════════ */\n@media (max-width: 900px){.hd2sm-root aside{ width: min(84vw, 300px); background: var(--panel); border-left: 1px solid var(--line-2); }\n.hd2sm-root header h1{ font-size: .88rem; }}\n@media (max-width: 767px){.hd2sm-root header{ padding: 7px 10px; }\n.hd2sm-root header h1{ font-size: .82rem; padding-left: 8px; border-left-width: 3px; }\n.hd2sm-root #hd2sm-tip{ font-size: .7rem; }\n.hd2sm-root #hd2sm-sector-card{ border-top-width: 2px; }}\n\n/* ===== boot-splash.css ===== */\n/* ==============================================================\n   超级地球 · 银河链路启动屏\n   #hd2-boot：全站 JS 注入的全屏遮罩；#hd2sm-boot：星图内联遮罩。\n   动画只使用 transform / opacity，避免逐格跳变与持续重绘。\n   ============================================================== */\n.hd2sm-root :is(#hd2-boot, #hd2sm-boot){\n  --boot-accent: var(--yellow, #FFB000);\n  --boot-dim: var(--text-dim, #A8A8A8);\n  --boot-mute: var(--text-mute, #6E6E6E);\n  inset: 0;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  gap: 14px;\n  overflow: hidden;\n  background: radial-gradient(circle at 50% 44%, #151510 0, #0A0A0A 68%);\n  color: var(--boot-dim);\n  pointer-events: all;\n  transition: opacity .32s cubic-bezier(.22, .61, .36, 1);\n}\n.hd2sm-root #hd2-boot{ position: fixed; z-index: 9999; opacity: 0; }\n.hd2sm-root #hd2sm-boot{ position: absolute; z-index: 30; opacity: 1; }\n.hd2sm-root #hd2-boot.visible{ opacity: 1; }\n.hd2sm-root :is(#hd2-boot, #hd2sm-boot).gone{ opacity: 0; pointer-events: none; }\n/* 静态战术网格：只提供空间层次，不做持续绘制。 */\n.hd2sm-root :is(#hd2-boot, #hd2sm-boot)::before{\n  content: \"\";\n  position: absolute;\n  inset: 0;\n  pointer-events: none;\n  opacity: .055;\n  background-image:\n    linear-gradient(rgba(255, 176, 0, .5) 1px, transparent 1px),\n    linear-gradient(90deg, rgba(255, 176, 0, .5) 1px, transparent 1px);\n  background-size: 48px 48px;\n}\n.hd2sm-root :is(#hd2-boot, #hd2sm-boot) > *{ position: relative; }\n.hd2sm-root .boot-visual{ width: 120px; height: 120px; display: grid; place-items: center; }\n.hd2sm-root .boot-frame{\n  position: relative;\n  width: 104px;\n  height: 104px;\n  display: grid;\n  place-items: center;\n  background:\n    linear-gradient(rgba(255, 176, 0, .55), rgba(255, 176, 0, .55)) left top / 18px 1px no-repeat,\n    linear-gradient(rgba(255, 176, 0, .55), rgba(255, 176, 0, .55)) left top / 1px 18px no-repeat,\n    linear-gradient(rgba(255, 176, 0, .55), rgba(255, 176, 0, .55)) right top / 18px 1px no-repeat,\n    linear-gradient(rgba(255, 176, 0, .55), rgba(255, 176, 0, .55)) right top / 1px 18px no-repeat,\n    linear-gradient(rgba(255, 176, 0, .55), rgba(255, 176, 0, .55)) left bottom / 18px 1px no-repeat,\n    linear-gradient(rgba(255, 176, 0, .55), rgba(255, 176, 0, .55)) left bottom / 1px 18px no-repeat,\n    linear-gradient(rgba(255, 176, 0, .55), rgba(255, 176, 0, .55)) right bottom / 18px 1px no-repeat,\n    linear-gradient(rgba(255, 176, 0, .55), rgba(255, 176, 0, .55)) right bottom / 1px 18px no-repeat;\n}\n.hd2sm-root .boot-frame::before{\n  content: \"\";\n  position: absolute;\n  inset: 10px;\n  border: 1px solid rgba(255, 176, 0, .13);\n  pointer-events: none;\n}\n.hd2sm-root :is(#hd2-boot, #hd2sm-boot) .emblem{\n  width: 64px;\n  height: 64px;\n  object-fit: contain;\n  opacity: .82;\n  will-change: transform, opacity;\n  animation: hd2boot-emblem 3s ease-in-out infinite;\n}\n.hd2sm-root .scan-line{\n  position: absolute;\n  left: 13px;\n  right: 13px;\n  top: 50%;\n  height: 1px;\n  pointer-events: none;\n  background: linear-gradient(90deg, transparent, var(--boot-accent) 35%, #FFF0B0 50%, var(--boot-accent) 65%, transparent);\n  will-change: transform, opacity;\n  animation: hd2boot-scan 2.35s cubic-bezier(.45, 0, .55, 1) infinite;\n}\n@keyframes hd2boot-emblem{\n  0%, 100% { opacity: .68; transform: scale(.985); }\n  50% { opacity: 1; transform: scale(1.015); }\n}\n@keyframes hd2boot-scan{\n  0% { opacity: 0; transform: translateY(-39px); }\n  14%, 82% { opacity: .72; }\n  50% { opacity: .95; }\n  100% { opacity: 0; transform: translateY(39px); }\n}\n.hd2sm-root .boot-stage{\n  width: min(240px, 70vw);\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  margin-bottom: -9px;\n  color: var(--boot-mute);\n  font: 600 10px/1.2 var(--font-mono, \"Consolas\", monospace);\n  letter-spacing: .16em;\n}\n.hd2sm-root .stage-count{ color: var(--boot-accent); font-variant-numeric: tabular-nums; }\n.hd2sm-root :is(#hd2-boot, #hd2sm-boot) .segments{\n  position: relative;\n  width: min(240px, 70vw);\n  height: 12px;\n  padding: 3px;\n  display: grid;\n  grid-template-columns: repeat(10, 1fr);\n  gap: 3px;\n  overflow: hidden;\n  border: 1px solid rgba(255, 176, 0, .28);\n}\n.hd2sm-root .segments i{ display: block; height: 4px; overflow: hidden; background: rgba(255, 176, 0, .10); }\n.hd2sm-root .segments i b{\n  display: block;\n  width: 100%;\n  height: 100%;\n  background: var(--boot-accent);\n  opacity: .9;\n  transform: scaleX(0);\n  transform-origin: left center;\n  transition: transform .34s cubic-bezier(.22, .61, .36, 1), opacity .2s ease;\n}\n.hd2sm-root .segments i.current b{ transform: scaleX(1); opacity: .28; }\n.hd2sm-root .segments i.done b{ transform: scaleX(1); opacity: .9; }\n.hd2sm-root .segments::after{\n  content: \"\";\n  position: absolute;\n  left: 0;\n  top: 3px;\n  bottom: 3px;\n  width: 28%;\n  pointer-events: none;\n  background: linear-gradient(90deg, transparent, rgba(255, 202, 74, .85), transparent);\n  will-change: transform, opacity;\n  animation: hd2boot-sweep 1.9s ease-in-out infinite;\n}\n.hd2sm-root .segments[data-mode=\"determinate\"]::after{ display: none; }\n@keyframes hd2boot-sweep{\n  0% { opacity: 0; transform: translateX(-110%); }\n  18%, 78% { opacity: .8; }\n  100% { opacity: 0; transform: translateX(370%); }\n}\n.hd2sm-root :is(#hd2-boot, #hd2sm-boot) .msg{\n  max-width: min(460px, calc(100vw - 40px));\n  min-height: 5.8em;\n  padding: 0 20px;\n  color: var(--boot-dim);\n  font-size: .84rem;\n  line-height: 1.65;\n  text-align: center;\n}\n.hd2sm-root :is(#hd2-boot, #hd2sm-boot) .msg :is(.line, .sub, .lore){\n  display: block;\n  overflow-wrap: anywhere;\n  transition: opacity .16s ease, transform .16s ease;\n}\n.hd2sm-root :is(#hd2-boot, #hd2sm-boot) .msg :is(.line, .sub, .lore).changing{ opacity: 0; transform: translateY(-4px); }\n.hd2sm-root :is(#hd2-boot, #hd2sm-boot) .msg .line{ color: var(--boot-dim); }\n.hd2sm-root :is(#hd2-boot, #hd2sm-boot) .msg .sub{\n  margin-top: 2px;\n  color: var(--boot-mute);\n  font: 400 .68rem/1.6 var(--font-mono, \"Consolas\", monospace);\n  letter-spacing: .04em;\n}\n.hd2sm-root :is(#hd2-boot, #hd2sm-boot) .msg .lore{ min-height: 1.65em; margin-top: 8px; color: var(--boot-mute); font-size: .72rem; }\n.hd2sm-root :is(#hd2-boot, #hd2sm-boot).complete .emblem{ animation: none; opacity: 1; transform: scale(1); }\n.hd2sm-root :is(#hd2-boot, #hd2sm-boot).complete .scan-line{ animation: none; opacity: 0; }\n.hd2sm-root :is(#hd2-boot, #hd2sm-boot).error .emblem{ animation: none; opacity: .45; }\n.hd2sm-root :is(#hd2-boot, #hd2sm-boot).error .scan-line, .hd2sm-root :is(#hd2-boot, #hd2sm-boot).error .segments::after{ display: none; }\n.hd2sm-root :is(#hd2-boot, #hd2sm-boot).error .boot-stage, .hd2sm-root :is(#hd2-boot, #hd2sm-boot).error .stage-count{ color: var(--warn, #FF4D2E); }\n.hd2sm-root :is(#hd2-boot, #hd2sm-boot).error .segments i b{ background: var(--warn, #FF4D2E); }\n@media (max-width: 520px){.hd2sm-root .boot-visual{ width: 108px; height: 108px; }\n.hd2sm-root .boot-frame{ width: 96px; height: 96px; }\n.hd2sm-root :is(#hd2-boot, #hd2sm-boot) .emblem{ width: 56px; height: 56px; }\n.hd2sm-root :is(#hd2-boot, #hd2sm-boot) .msg{ min-height: 6.4em; padding: 0 12px; }\n.hd2sm-root :is(#hd2-boot, #hd2sm-boot) .msg .lore{ font-size: .68rem; }}\n@media (prefers-reduced-motion: reduce){.hd2sm-root :is(#hd2-boot, #hd2sm-boot), .hd2sm-root :is(#hd2-boot, #hd2sm-boot) *, .hd2sm-root :is(#hd2-boot, #hd2sm-boot) *::before, .hd2sm-root :is(#hd2-boot, #hd2sm-boot) *::after{ animation: none !important; transition: none !important; }\n.hd2sm-root .scan-line, .hd2sm-root .segments::after{ display: none; }\n.hd2sm-root :is(#hd2-boot, #hd2sm-boot) .emblem{ opacity: .9; transform: none; }\n.hd2sm-root .segments i.current b{ opacity: .65; }}\n\n/* ===== forecast.css ===== */\n.hd2sm-root .campaign-forecast{ margin: 8px 0; font-size: .78rem; line-height: 1.65; overflow-wrap: anywhere; }\n.hd2sm-root .campaign-forecast .good{ color: var(--ok); }\n.hd2sm-root .campaign-forecast .bad{ color: var(--warn); }\n.hd2sm-root .reinforcement-forecast{ margin-top: 6px; font-size: .75rem; line-height: 1.6; overflow-wrap: anywhere; }\n.hd2sm-root .reinforcement-forecast .good{ color: var(--ok); }\n.hd2sm-root .reinforcement-forecast .bad{ color: var(--warn); }\n.hd2sm-root #hd2sm-planet-card > .reinforcement-forecast{ margin: 8px 9px; font-size: .68rem; }\n.hd2sm-root .forecast-source{ opacity: .7; font-size: .7rem; }\n.hd2sm-root #hd2sm-planet-card .campaign-forecast{ margin: 8px 9px; font-size: .68rem; }\n.hd2sm-root .region-rules{ font-size: .72rem; line-height: 1.6; margin: 3px 0 8px; color: var(--text-dim); overflow-wrap: anywhere; }\n.hd2sm-root .region-rules b{ color: var(--text, #e6edf3); }\n.hd2sm-root .mo-hold-bar{ height: auto; min-height: 22px; background: transparent; border: 1px dashed var(--blue, #55aaff); }\n.hd2sm-root .mo-hold-status{ display: block; padding: 2px 8px; color: var(--blue, #55aaff); font-size: .72rem; line-height: 1.5; }\n/* ===== 挂载根节点补充（build_embed.py） ===== */\n.hd2sm-root{position:relative;height:var(--hd2sm-h,70vh);min-height:480px;isolation:isolate}\n";

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
/* ============================================================================
   银河星图 · MapLibre GL 3D
   ============================================================================ */
const $ = (id) => document.getElementById("hd2sm-" + id);
const SVGNS = "http://www.w3.org/2000/svg";

// 阵营代表色（超级地球 2026-09-24 起 = #5BA3D0 蓝，与主页 tokens.css 的 --c-faction-hum 同值。
// 2026-09-18~09-24 曾用 #ffe800 黄，与终结族 #F5C518 对比度仅 1.30、209 个我方圆点 vs 23 个终结族圆点难以分辨，
// 故按用户要求回退为蓝；humans.svg 的骷髅形状不变，只由 CSS 着色）
const OWNER_COLOR = { Humans:"#5BA3D0", Terminids:"#F5C518", Automaton:"#D6806D", Illuminate:"#CF64F8" };
const OWN_CN     = { Humans:"超级地球", Terminids:"终结族", Automaton:"机器人", Illuminate:"光能者" };
const FACTION_KEYS = ["Humans","Terminids","Automaton","Illuminate"];

/* ------------------------------------------------ wiki 图鉴链接映射 ---- */
// 阵营页（星球无变种效果时按当前归属链接阵营图鉴）
const FACTION_PAGE = { Automaton: "Automatons", Terminids: "Terminids", Illuminate: "Illuminate" };
// 变种效果 effectId -> wiki slug（galactic_effects/effect_id_cn 考据，slug 经 wiki API 验证存在）
const EFFECT_TO_STRAIN = {
  1202: "Jet_Brigade", 1203: "Jet_Brigade", 1239: "Jet_Brigade",
  1243: "Predator_Strain", 1245: "Predator_Strain",
  1244: "Spore_Burst_Strain", 1386: "Spore_Burst_Strain",
  1248: "Incineration_Corps", 1249: "Incineration_Corps",
  1303: "Rupture_Strain", 1310: "Rupture_Strain",
  1360: "Cyborgs", 1361: "Cyborgs",
  1377: "Mindless_Masses", 1378: "Mindless_Masses",
  1379: "Appropriators", 1380: "Appropriators",
  1402: "Vote_Snatchers", 1403: "Vote_Snatchers",
  1269: "The_Great_Host", 1417: "Invasion_Fleet",
};
// 变种归属阵营（链接只在星球当前归属与其一致时显示）
const STRAIN_FACTION = {
  Jet_Brigade: "Automaton", Incineration_Corps: "Automaton", Cyborgs: "Automaton",
  Predator_Strain: "Terminids", Spore_Burst_Strain: "Terminids", Rupture_Strain: "Terminids",
  Mindless_Masses: "Illuminate", Appropriators: "Illuminate", Vote_Snatchers: "Illuminate",
  The_Great_Host: "Illuminate", Invasion_Fleet: "Illuminate",
};
const STRAIN_CN = {
  Jet_Brigade: "喷气旅", Incineration_Corps: "炽灼部队", Cyborgs: "生化人",
  Predator_Strain: "掠食变种", Spore_Burst_Strain: "孢裂变种", Rupture_Strain: "爆裂变种",
  Mindless_Masses: "无脑群氓", Appropriators: "占领者", Vote_Snatchers: "窃票者",
  The_Great_Host: "伟大集群", Invasion_Fleet: "入侵舰队",
};
// 链接规则：变种（且归属一致）> 阵营目录页；指向**本仓 HD2_Wiki**，不再外链 wiki.gg。
// HD2_Wiki 的敌人详情页支持 ?id=，且 enemies.json 里这 10 个变种都有对应 id。
const STRAIN_WIKI_ID = {
  Jet_Brigade:"jet_brigade", Incineration_Corps:"incineration_corps", Cyborgs:"cyborg_legion",
  Predator_Strain:"predator_strain", Spore_Burst_Strain:"spore_burst_strain", Rupture_Strain:"rupture_strain",
  Mindless_Masses:"mindless_masses", Appropriators:"appropriators",
  Vote_Snatchers:"vote_snatchers", Invasion_Fleet:"invasion_fleet",
};
// 阵营代表色（与站点口径一致：超级地球 = 蓝 #5BA3D0；
// terminids #f59e0b / automatons #ef4444 / illuminate #AA44FF）
const FACTION_COLOR = { Terminids:"#f59e0b", Automaton:"#ef4444", Illuminate:"#AA44FF", Humans:"#5BA3D0" };
// 返回 { url, kind, color, badge, text }
function wikiLinkFor(p) {
  const owner = p.currentOwner || "";
  for (const id of (p.activeEffects || [])) {
    const slug = EFFECT_TO_STRAIN[id];
    if (slug && STRAIN_FACTION[slug] === owner) {
      const wid = STRAIN_WIKI_ID[slug];
      if (wid) {
        return { url: "../HD2_Wiki/enemy.html?id=" + encodeURIComponent(wid),
                 kind: "strain", color: FACTION_COLOR[owner] || "#94a3b8",
                 badge: STRAIN_CN[slug] || slug.replace(/_/g, " "), text: "战斗序列图鉴" };
      }
    }
  }
  const cat = { Terminids:"terminids", Automaton:"automatons", Illuminate:"illuminate" }[owner];
  if (cat) {
    // HD2_Wiki 的目录页不支持 faction 参数（只用按钮筛选），故链接到目录页本身；
    // 徽章已标明阵营，用户在目录页可自行按阵营筛选。
    return { url: "../HD2_Wiki/enemies.html", kind: "faction",
             color: FACTION_COLOR[owner] || "#94a3b8",
             badge: OWN_CN[owner] || owner, text: "阵营图鉴" };
  }
  if (owner === "Humans") {
    return { url: "../HD2_Wiki/enemies.html", kind: "humans", color: FACTION_COLOR.Humans,
             badge: "超级地球", text: "阵营图鉴" };
  }
  return null;
}

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c =>
  ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
const fmt = (n) => (n || 0).toLocaleString("zh-CN");

/* ---------------------------------------------------------------- 工具 ---- */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 并发受限的图片加载（CORS 优先；wiki.gg 若不给 CORS 头则回退纯色圆点）
async function fetchImageBitmap(url, crossOrigin) {
  const img = new Image();
  if (crossOrigin) img.crossOrigin = "anonymous";
  img.referrerPolicy = "no-referrer";
  img.decoding = "async";
  await new Promise((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error("load fail"));
    img.src = url;
  });
  if (img.decode) { try { await img.decode(); } catch (_) {} }
  return img;
}
// 读 PNG 头部取像素尺寸（IHDR 位于固定偏移）。
// 必要性：planet-icons 并非同尺寸 —— 实测 139 个 64px、122 个 48px（另有少数 47~65px）。
// 若统一按 pixelRatio:2 注册，48px 图标在同一 icon-size 下会比 64px 小约 33%，
// 这正是「图标大小与可互动区域不匹配」的根因。改为按各图实际宽度归一化后，
// icon-size 才能与 planet-core 的直径精确对齐。
function pngSizeFromBuffer(buf) {
  const b = new Uint8Array(buf);
  if (b.length < 24) return null;
  if (b[0] !== 0x89 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47) return null;  // \x89PNG
  const w = (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19];
  const h = (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23];
  return (w > 0 && h > 0) ? { w, h } : null;
}

// 载入图标：按 URL 顺序尝试（wiki.gg 直连优先，主仓本地兜底）。
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
}
async function pool(items, limit, worker) {
  let i = 0, active = 0;
  return new Promise((resolve) => {
    const next = () => {
      if (i >= items.length && active === 0) return resolve();
      while (active < limit && i < items.length) {
        const item = items[i++]; active++;
        Promise.resolve(worker(item)).catch(() => {}).then(() => { active--; next(); });
      }
    };
    next();
  });
}

/* ------------------------------------------------------- 星空（贴图+暗角） ---- */
// 星点/星云生成到一张可平铺贴图，作为 raster 图层挂进地图 —— 随平移/缩放真实移动；
// 屏幕坐标只保留深色底与四周暗角（相机质感），不再画星点。
function paintBackdrop() {
  const cv = $("stars");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = cv.clientWidth || window.innerWidth;
  const h = cv.clientHeight || window.innerHeight;
  cv.width = Math.floor(w * dpr); cv.height = Math.floor(h * dpr);
  const g = cv.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = "#05070C"; g.fillRect(0, 0, w, h);
  const vg = g.createRadialGradient(w/2, h/2, Math.min(w,h)*0.32, w/2, h/2, Math.max(w,h)*0.78);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,.55)");
  g.fillStyle = vg; g.fillRect(0, 0, w, h);
}

// 生成无缝星空贴图：星点在边缘处按 3×3 环绕补画，保证平铺无接缝
function makeStarfieldTile(size) {
  const cv = document.createElement("canvas");
  cv.width = size; cv.height = size;
  const g = cv.getContext("2d");
  g.clearRect(0, 0, size, size);                 // 透明底，露出屏幕深色
  const wrap = (fn) => { for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) fn(ox, oy); };
  const nebulae = [
    [size*0.30, size*0.34, size*0.45, "rgba(64,88,168,.10)"],
    [size*0.74, size*0.62, size*0.42, "rgba(128,74,168,.085)"],
    [size*0.55, size*0.20, size*0.34, "rgba(40,120,150,.06)"],
  ];
  for (const [x, y, r, col] of nebulae) {
    wrap((ox, oy) => {
      const rg = g.createRadialGradient(x+ox, y+oy, 0, x+ox, y+oy, r);
      rg.addColorStop(0, col); rg.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = rg; g.fillRect(x+ox-r, y+oy-r, r*2, r*2);
    });
  }
  const count = Math.round(size * size / 2600);
  for (let n = 0; n < count; n++) {
    const x = Math.random() * size, y = Math.random() * size;
    const big = Math.random() > 0.985;
    const r = big ? 1.5 + Math.random() * 1.5 : Math.random() * 0.95 + 0.25;
    const a = 0.20 + Math.random() * 0.72;
    const col = big ? `rgba(255,246,220,${a})` : `rgba(226,238,255,${a})`;
    wrap((ox, oy) => {
      g.beginPath(); g.arc(x+ox, y+oy, r, 0, 6.2832);
      g.fillStyle = col; g.fill();
      if (big) {
        g.strokeStyle = `rgba(255,246,220,${a * 0.35})`; g.lineWidth = 0.7;
        const s2 = r * 4.2;
        g.beginPath();
        g.moveTo(x+ox - s2, y+oy); g.lineTo(x+ox + s2, y+oy);
        g.moveTo(x+ox, y+oy - s2); g.lineTo(x+ox, y+oy + s2);
        g.stroke();
      }
    });
  }
  return cv.toDataURL("image/png");
}

/* ------------------------------------------- 星区 / 势力 凸包（伪领土） ---- */
// 星区多边形数据缺失，故按「同星区星球坐标 + 向质心外扩」构造近似范围。
function convexHull(pts) {
  if (pts.length < 3) return pts.slice();
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0]);
  const lower = [], upper = [];
  for (const pt of p) { while (lower.length >= 2 && cross(lower[lower.length-2], lower[lower.length-1], pt) <= 0) lower.pop(); lower.push(pt); }
  for (let i = p.length - 1; i >= 0; i--) { const pt = p[i]; while (upper.length >= 2 && cross(upper[upper.length-2], upper[upper.length-1], pt) <= 0) upper.pop(); upper.push(pt); }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}
function expandHull(hull, factor) {
  if (!hull.length) return hull;
  const cx = hull.reduce((a, p) => a + p[0], 0) / hull.length;
  const cy = hull.reduce((a, p) => a + p[1], 0) / hull.length;
  return hull.map(([x, y]) => [cx + (x - cx) * factor, cy + (y - cy) * factor]);
}
function ring(coords) { const r = coords.slice(); if (r.length) r.push(r[0]); return r; }

/* --------------------------------------------------------- 星球图标 ---- */
// 本地缓存 assets/planet-icons/（fetch_planet_icons.py 生成；来源与许可见该目录 README.md）
// 键 = data.json 大写原名（如 "ACAMAR IV"），值 = 本地文件名；未命中返回空串回退纯色圆点。
let ICON_INDEX = {};      // 主仓本地兜底索引：星球名 -> 本地文件名（assets/planet-icons/index.json）
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
}

// 星球 → wiki.gg 中文站页面（zh 站星球页标题为英文 Title Case，映射见 embed/wiki-planet-links.json）
let WIKI_PLANET_MAP = {};    // 星球大写原名 -> zh 站规范标题
const WIKI_ZH_BASE = "https://helldivers.wiki.gg/zh/wiki/";
function planetWikiUrl(index) {
  const p = BYIDX[index];
  const en = String((p && p.name) || "").trim().toUpperCase();
  const title = WIKI_PLANET_MAP[en];
  if (title) return WIKI_ZH_BASE + encodeURIComponent(title.replace(/ /g, "_"));
  // 未收录：回退 zh 站搜索（精确命中时 MediaWiki 会直达页面）
  const q = en || (p && p.name) || ("#" + index);
  return "https://helldivers.wiki.gg/zh/index.php?search=" + encodeURIComponent(q);
}

/* ------------------------------------------------------ 阵营图标（SVG） ---- */
// 取自 helldivers.wiki.gg 的 Faction Icons，本地同源缓存（assets/faction-icons/）。
// ⚠ 2026-09 修复「预览面板阵营图标是纯黑剪影」：
//   SVG 若**完全没有 fill**，其 fill 的初始值是 `black`（**不是** currentColor），
//   所以父级 .ficon{color:…} 根本管不到 path —— 四个图标全渲染成黑剪影。
//   现由四个 SVG 自带 **fill="…" 表现属性**（非行内 style）着色：
//     · 表现属性优先级低于任何 CSS 规则 → 主页 index.html 的
//       `.planet-card .pc-ficon path{fill:var(--fc)}` 仍按卡片阵营色覆盖，主页不受影响；
//     · 星图这里没有 fill 规则 → 用 SVG 自带的阵营色；
//     · 且 <img src> 加载方式下也是正确颜色（<img> 无法继承 currentColor，只能靠自带 fill）。
const FACTION_ICON_FILE = { Automaton:"automatons.svg", Terminids:"terminids.svg",
                            Illuminate:"illuminate.svg", Humans:"humans.svg" };
// 图标缓存版本：assets/faction-icons/ 内容改动后必须 +1
// （fetch 用 force-cache，不换 URL 的话旧图标会被浏览器钉在缓存里 —— 改了也看不到，
//  与 index.html 的 PC_ICON_VER 同一个道理）
const FACTION_ICON_VER = "2";
const __ficit = {};
async function factionIconSVG(owner) {
  const f = FACTION_ICON_FILE[owner];
  if (!f) return null;
  if (__ficit[owner] !== undefined) return __ficit[owner];
  try {
    const r = await fetch(B + "assets/faction-icons/" + f + "?v=" + FACTION_ICON_VER, { cache: "force-cache" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    let svg = (await r.text()).replace(/<\?xml[^>]*\?>/i, "").replace(/<!DOCTYPE[^>]*>/i, "").trim();
    svg = svg.replace(/<script[\s\S]*?<\/script>/gi, "")                    // 纵深防御
             .replace(/\son\w+\s*=\s*"[^"]*"/gi, "").replace(/\son\w+\s*=\s*'[^']*'/gi, "");
    __ficit[owner] = svg;
  } catch (_) { __ficit[owner] = null; }
  return __ficit[owner];
}

// 星区索引：名称 → {planets, total, lib, owner, races}
// 供左上角星区卡与悬停联动使用（不依赖 bySector，避免与地图构建耦合）
let SECTOR_IDX = {};

/* ------------------------------------------- 行动变量（含作战限制红 Tag） ----
   数据源 tables/hd2_variables.json：15 个分类、每条带 effect_ids。
   其中 combat_restriction（作战限制，如 班机延误/缺少飞行员/补给不足/预算削减）
   在详情面板以**红色 Tag** 呈现 —— 与主站 .pd-chip-neg 的语义保持一致。
   说明：DSS 战略行动只有 6 条（tactical_action 分类），它们是全局的，
   只作用于 DSS 停靠星球并以其专属图标表现，不参与此处的行动变量 chip。 */
let VAR_BY_EFFECT = {};      // effectId -> { cn, desc, cat, catKey, neg }
async function loadVariables() {
  try {
    const j = await (await fetch(B + "tables/hd2_variables.json?t=" + Date.now(), { cache: "no-store" })).json();
    for (const cat of (j.categories || [])) {
      const catKey = cat.key || "", catName = cat.name || "";
      for (const e of (cat.entries || [])) {
        for (const id of (e.effect_ids || [])) {
          VAR_BY_EFFECT[id] = { cn: e.cn || e.name || ("效果 #" + id),
                                desc: e.desc || "", cat: catName, catKey,
                                neg: catKey === "combat_restriction" };
        }
      }
    }
  } catch (_) { VAR_BY_EFFECT = {}; }
}

/* ------------------------------------------------- 星球效果图标 ------------ */
// 图标全部来源 helldivers.wiki.gg，本地同源缓存于 assets/effect-icons/（22 个，约 76 KB）。
// 每个 effectId 映射「图标文件 + 中文名 + 优先级」；同一图标的不同 id（含 (Enemies) 变体）
// 渲染时按图标去重，避免同一效果出现两次。
//
// tier 说明（用于空间不足时的取舍）：
//   tier 1 = 军事/生存威胁类（势力变种、特殊个体、虫巢世界）—— 必须优先显示
//   tier 2 = 其余兴趣点/建筑/设施 —— 空间足够时才补显
// 这样 POI 不会把关键信息挤出可显示名额。
const EFFECT_ICON = {
  // ---- tier 1：军事 / 威胁 ----
  1202:{ icon:"jet_brigade.svg",        cn:"喷气旅",     tier:1 },
  1203:{ icon:"jet_brigade.svg",        cn:"喷气旅",     tier:1 },
  1240:{ icon:"jet_brigade.svg",        cn:"喷气旅",     tier:1 },
  1248:{ icon:"incineration_corps.svg", cn:"炽灼部队",   tier:1 },
  1249:{ icon:"incineration_corps.svg", cn:"炽灼部队",   tier:1 },
  1360:{ icon:"cyborgs.svg",            cn:"生化人",     tier:1 },
  1361:{ icon:"cyborgs.svg",            cn:"生化人",     tier:1 },
  1243:{ icon:"predator_strain.svg",    cn:"掠食变种",   tier:1 },
  1245:{ icon:"predator_strain.svg",    cn:"掠食变种",   tier:1 },
  1244:{ icon:"spore_burst_strain.svg", cn:"孢裂变种",   tier:1 },
  1386:{ icon:"spore_burst_strain.svg", cn:"孢裂变种",   tier:1 },
  1303:{ icon:"rupture_strain.svg",     cn:"爆裂变种",   tier:1 },
  1310:{ icon:"rupture_strain.svg",     cn:"爆裂变种",   tier:1 },
  1380:{ icon:"appropriators.svg",      cn:"占领者",     tier:1 },
  1379:{ icon:"appropriators.svg",      cn:"占领者",     tier:1 },
  1377:{ icon:"mindless_masses.svg",    cn:"无脑群氓",   tier:1 },
  1378:{ icon:"mindless_masses.svg",    cn:"无脑群氓",   tier:1 },
  1402:{ icon:"vote_snatchers.svg",     cn:"窃票者",     tier:1 },
  1403:{ icon:"vote_snatchers.svg",     cn:"窃票者",     tier:1 },
  1417:{ icon:"invasion_fleet.png",     cn:"入侵舰队",   tier:1 },
  // 1413/1414：早期从解包数据得到「教团先锋(矛头先锋)」这个名字，实为对 wiki 图片的**翻译误会**；
  // 现已证实 1413 指向的就是入侵舰队（1414 为同组变体，无独立中文名）。
  // 故 1413/1414/1417 统一显示为「入侵舰队」并复用同一图标，按图标去重后只出现一个。
  1413:{ icon:"invasion_fleet.png",     cn:"入侵舰队",   tier:1 },
  1414:{ icon:"invasion_fleet.png",     cn:"入侵舰队",   tier:1 },
  1306:{ icon:"dragonroach.svg",        cn:"蟑龙",       tier:1 },
  1309:{ icon:"dragonroach.svg",        cn:"蟑龙",       tier:1 },
  1307:{ icon:"hive_lord.png",          cn:"霸王虫",     tier:1 },
  1308:{ icon:"hive_lord.png",          cn:"霸王虫",     tier:1 },
  1400:{ icon:"seaf.svg",               cn:"SEAF 武装部队", tier:1 },
  1401:{ icon:"seaf.svg",               cn:"SEAF 武装部队", tier:1 },
  1239:{ icon:"jet_brigade.svg",        cn:"喷气旅工厂", tier:1 },
  // 说明：本表只放「有本地图标」的效果。以下类别不在此表，各有其呈现方式：
  //   · 设施/兴趣点（科学中心、工厂枢纽、城市、黑洞、碎裂星球、训练设施…）
  //     → wiki 无对应图标文件，改在「星球详情」面板以文字 chip 呈现
  //   · 阴影迷雾(1188/1193) → 已由黄色雾团图层表现
  //   · TCS+控制塔(1395)   → 已由蓝色雾环表现
  //   · 无法抵达(1190)     → 状态类，不加图标；星球本身降到 40% 不透明度（阴霾区除外，见 HIDDEN_IDS）
  //   · DSS 增益/减益（班机延误/缺少飞行员/补给不足/预算削减 1315-1320）
  //     → 属「作战限制」，在详情面板以**红色 chip** 呈现
};
// 图标着色（仅 SVG 生效；PNG 自带配色）
const EFFECT_COLOR = {
  "seaf.svg":"#ffe800",
  "incineration_corps.svg":"#D6806D", "jet_brigade.svg":"#D6806D", "cyborgs.svg":"#D6806D",
  "predator_strain.svg":"#F5C518", "spore_burst_strain.svg":"#F5C518", "rupture_strain.svg":"#F5C518",
  "dragonroach.svg":"#F5C518",
  "appropriators.svg":"#CF64F8", "mindless_masses.svg":"#CF64F8", "vote_snatchers.svg":"#CF64F8",
};

// DSS 战术行动（全局）：仅作用于 DSS 当前停靠星球，随其跃迁自动跟随。
// effectId 取自 data.dss.tacticalActions[].effectIds；status===2 为已激活。
const DSS_ACTION_ICON = {
  // 1425 与 1209 是上游重新登记的同一条「飞鹰风暴」效果（四组描述 hash 完全一致），
  // 2026-10 毒气改版后上游改用 1425；两个 id 都保留映射。
  1425:{ icon:"dss_eagle_storm.svg",          cn:"飞鹰毒气风暴" },
  1209:{ icon:"dss_eagle_storm.svg",          cn:"飞鹰风暴" },
  1212:{ icon:"dss_eagle_storm.svg",          cn:"飞鹰风暴" },
  1216:{ icon:"dss_eagle_storm.svg",          cn:"飞鹰风暴" },
  1210:{ icon:"dss_orbital_blockade.svg",     cn:"轨道封锁" },
  1213:{ icon:"dss_orbital_blockade.svg",     cn:"轨道封锁" },
  1215:{ icon:"dss_orbital_blockade.svg",     cn:"轨道封锁" },
  1214:{ icon:"dss_heavy_ordnance.svg",       cn:"重型军械分发" },
  1237:{ icon:"dss_heavy_ordnance.svg",       cn:"重型军械分发" },
  1208:{ icon:"dss_planetary_bombardment.svg",cn:"星球轰炸" },
  1211:{ icon:"dss_planetary_bombardment.svg",cn:"星球轰炸" },
};
// 取 DSS 战术行动（已去重到图标级）
// DSS 战术行动三阶段（2026-09 经用户确认 + 实测校准）：
//   status=1 → 募捐中（仅投票，对战场无效果 → 不显示）
//   status=2 → 已激活（正在生效 → 显示图标）
//   status=3 → 冷却期（本轮已结束 → 不显示）
// 注意：冷却期的 statusExpireAtWarTime 同样落在未来，故不能用 expire 区分激活/冷却。
//
// 【2026-09 用户明确要求】只有「已激活」才加图标：募捐中与冷却期都不加。
// （此前为让 DSS 有机会露面，曾把冷却期也显示成半透明虚线框，属于多余信息，已移除。
//   DSS 停靠本身由 dssStationsAt() 单独负责显示，不依赖战术行动是否生效。）
function dssActionsAt(planetIndex) {
  if (!DATA || !DATA.dss) return [];
  if (DATA.dss.planetIndex !== planetIndex) return [];
  const out = [], seen = {};
  for (const ta of (DATA.dss.tacticalActions || [])) {
    if (ta.status !== 2) continue;                  // 仅「已激活」显示
    for (const id of (ta.effectIds || [])) {
      const a = DSS_ACTION_ICON[id];
      if (!a || seen[a.icon]) continue;
      seen[a.icon] = 1;
      out.push({ icon: a.icon, cn: a.cn, color: "#f5c518", tier: 1, dss: true });
    }
  }
  return out;
}

/* DSS 本体图标 —— 即 helldivers.wiki.gg/wiki/Effects#Democracy_Space_Station
   中「Effects」标题前那个图标（wiki 文件名为 DSS_Icon.svg，本地 dss.svg）。
   它与三个「战术行动」图标是两回事，过去只接了战术行动，导致 DSS 停靠本身
   在地图上毫无踪迹：只要没有任何行动处于 status=2，整张图就看不到 DSS。 */
const DSS_STATION_ICON = { icon:"dss.svg", cn:"民主空间站" };
// DSS 停靠星球：无条件返回本体图标，且**不因冷却期做视觉弱化**（用户要求）。
// 排队位置由 buildFXNodes 的 isBuff 决定 —— 与 SEAF 一样归入「左侧 BUFF 列」。
function dssStationsAt(planetIndex) {
  if (!DATA || !DATA.dss) return [];
  if (DATA.dss.planetIndex !== planetIndex) return [];
  return [{
    icon: DSS_STATION_ICON.icon, cn: DSS_STATION_ICON.cn, color: "#f5c518",
    tier: 1, dss: true,
  }];
}
const __fxsvg = {};

/* ------------------------------------------------- 阴霾 / TCS+ 雾气 ----------
   实现说明：不用多边形 + fill-pattern（多边形是直线边，fill 三角化后会留可见折痕，
   且平铺贴图浓度均匀、显得生硬）。改为「大量重叠的软边圆斑」：
   以阴霾星球为骨架，沿骨架连线与凸包外圈补点，每个点由三层不同半径/透明度的
   circle-blur 圆叠加 —— 无硬边、无折痕，重叠处自然变浓。点集在 build 阶段生成。 */
// 取某星球可显示的效果（已按图标去重）
// 组成：星球自身 activeEffects + DSS 当前停靠地的战术行动
// 排序：tier 1（军事/威胁）在前，tier 2（设施/POI）在后 ——
// 这样显示名额有限时，POI 不会把关键军事信息挤掉。
function fxOf(planet) {
  const seen = {}, out = [];
  const push = (e, tier) => {
    if (!e || seen[e.icon]) return;
    seen[e.icon] = 1;
    out.push({ icon: e.icon, cn: e.cn, color: EFFECT_COLOR[e.icon] || "#94a3b8", tier, cd: !!e.cd });
  };
  for (const id of (planet.activeEffects || [])) {
    const e = EFFECT_ICON[id];
    if (e) push(e, e.tier || 2);
  }
  for (const a of dssActionsAt(planet.index)) push(a, 1);
  for (const a of dssStationsAt(planet.index)) push(a, 1);
  return out.sort((a, b) => a.tier - b.tier);
}
// 取图标的可插入标记：SVG 内联（可按阵营色着色）；PNG 用 <img>（保留原配色）
// FX_ASSET_VER：图标资源版本号。历史上 cyborgs.svg 曾因缺 viewBox 而「整块不可见」，
// 而此处用的是 cache:"force-cache"，浏览器会把那份坏文件长期钉在缓存里 ——
// 即使 HTML 已更新，图标仍然不显示。加版本号即换新 URL，强制重新取图。
// 以后只要改了 assets/effect-icons 下的任何文件，就把这个数字 +1。
const FX_ASSET_VER = "4";
async function effectIconMarkup(file) {
  if (__fxsvg[file] !== undefined) return __fxsvg[file];
  try {
    const src = `${B}assets/effect-icons/${file}?v=${FX_ASSET_VER}`;
    const r = await fetch(src, { cache: "force-cache" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    if (/\.png$/i.test(file)) {
      __fxsvg[file] = `<img src="${src}" alt="" loading="lazy">`;
    } else {
      let svg = (await r.text()).replace(/<\?xml[^>]*\?>/i, "").replace(/<!DOCTYPE[^>]*>/i, "").trim();
      svg = svg.replace(/<script[\s\S]*?<\/script>/gi, "")
               .replace(/\son\w+\s*=\s*"[^"]*"/gi, "").replace(/\son\w+\s*=\s*'[^']*'/gi, "");
      __fxsvg[file] = svg;
    }
  } catch (_) { __fxsvg[file] = null; }   // 待补图标：跳过，不显示空框
  return __fxsvg[file];
}

/* ================================================================ 主流程 ==== */
let MAP = null;
let DATA = null, BYIDX = {}, WP = {}, TACBY = {}, REGIONS = {}, REGIONS_ZH = {};
let PL_CN = {}, SEC_CN = {};                   // 星球/星区中文映射（starmap.json）
let SEC_BY_PLANET = {};                        // 星球英文名 -> 中文星区（取自 starmap.json，唯一权威源）
// 星球 → 中文星区名。游戏里星区叫「XX分区」，名字与 starmap 的 system/sector_en 一一对应
// （游戏内置文本：阿基拉分区/AKIRA SECTOR、巴纳德分区/BARNARD SECTOR、大熊座分区/URSA SECTOR…）。
// ⚠ 取值**必须以 SEC_BY_PLANET 为准，不能优先用 data.json 的 p.sector**：p.sector 来自 hd2dev，
//   是另一套 21 项分区名（Sol/Barnard/Tau Ceti/Kronos/Gacrux…），与游戏分区不符 ——
//   实测 273 颗里 152 颗为空、有值的 121 颗里仅 8 颗与 starmap 一致；且 Tau Ceti/Kronos/Yezub/
//   Pictor/Titania/Kessel/Ursa Major/Angels Venture 在游戏文本里 0 命中。
// 兜底顺序：starmap → SEC_CN[p.sector]（含 SECTOR_ALIASES 桥接）→ p.sector 原文 → "—"
const secCnByPlanet = (p) => {
  const byName = SEC_BY_PLANET[String((p && p.name) || "").toUpperCase()];
  if (byName) return byName.toUpperCase() === "TBD" ? "不分区" : byName;   // 与主站 index.html 口径一致
  const raw = (p && p.sector) || "";
  return SEC_CN[String(raw).toUpperCase()] || raw || "—";
};
let UNLISTED_IDX = new Set();                  // 未分区星球的 index（不显示在星图上，见构造 GeoJSON 处）
let VIEW_MODE = "galaxy";                      // galaxy | tactical | region
const ACTIVE_FACTIONS = new Set(FACTION_KEYS); // 阵营筛选
// 图层开关的初始状态。⚠ `icons`（星球图标）已于 2026-09-26 按用户要求**移除** ——
// 该图层现在恒显示（见 applyLayerToggles 里 `setLayerVis("planet-icon", true)`）。
const LAYER_ON = { territory:true, supply:true, attack:true, heat:false, labels:true };

const HOME = { center: [0, 0.0163], zoom: 8.6, pitch: 48, bearing: 0 };

async function boot() {
  const bootUI = window.HD2Boot || null;
  if (bootUI) bootUI.attach($("boot"));
  const nextPaint = () => new Promise(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const setMsg = (line, sub, stage) => {
    if (bootUI) {
      if (stage) bootUI.setStage(stage, 4);
      bootUI.setMsg(line, sub || "");
    } else {
      const b = $("bootmsg");
      if (b) b.innerHTML = esc(line) + (sub ? "<br><small>" + esc(sub) + "</small>" : "");
    }
  };
  const finishBoot = () => {
    if (bootUI) { bootUI.done(); return; }
    const b = $("boot");
    if (b) b.classList.add("gone");
    setTimeout(() => { const n = $("boot"); if (n) n.style.display = "none"; }, 420);
  };
  const failBoot = (line, sub) => {
    if (bootUI) { bootUI.fail(line, sub); return; }
    const b = $("bootmsg");
    if (b) b.innerHTML = esc(line) + "<br><small>" + esc(sub) + "</small>";
  };
  setMsg("正在建立银河链路…", "中文字体 · 战况数据 · 补给线", 1);
  paintBackdrop();
  window.addEventListener("resize", () => { clearTimeout(HD2SM_RT); HD2SM_RT = setTimeout(paintBackdrop, 250); });

  // ---- 0+1) 字体与核心数据并行 ----
  // MapLibre 建图前仍需字体就绪，但下载字体时不必让战况数据一起空等。
  const fontTask = (async () => {
    try {
      const ff = new FontFace("SourceHanSans", "url('https://jerry114514.github.io/HD2_Wiki/assets/fonts/SourceHanSansCN-Medium.otf') format('opentype')");
      await Promise.race([ff.load().then(f => document.fonts.add(f)), sleep(4000)]);
    } catch (_) { /* 字体失败退后备系统字体，不阻塞建图 */ }
  })();
  const dataTask = (async () => {
    const [d, w] = await Promise.all([
      (await fetch(B + "data.json?t=" + Date.now(), { cache: "no-store" })).json(),
      (await fetch(B + "tables/waypoints.json?t=" + Date.now(), { cache: "no-store" })).json(),
    ]);
    return { data: d, wpRaw: w };
  })();
  let data, wpRaw;
  try {
    const core = await dataTask;
    await fontTask;
    data = core.data;
    wpRaw = core.wpRaw;
  } catch (e) {
    failBoot("数据加载失败", e.message || "请检查网络连接后刷新重试");
    return;
  }
  setMsg("正在同步星图资料…", "区域 · 星区 · 行动变量", 2);
  await nextPaint();
  // 星球图标索引（assets/planet-icons/index.json；缺失时全量回退纯色圆点，不致命）
  try {
    ICON_INDEX = await (await fetch(B + "assets/planet-icons/index.json?t=" + Date.now(), { cache: "no-store" })).json();
  } catch (_) { ICON_INDEX = {}; }
  try {
    WIKI_ICON_MAP = await (await fetch(B + "embed/wiki-icon-map.json?t=" + Date.now(), { cache: "no-store" })).json();
  } catch (_) { WIKI_ICON_MAP = {}; }
  try {
    WIKI_PLANET_MAP = await (await fetch(B + "embed/wiki-planet-links.json?t=" + Date.now(), { cache: "no-store" })).json();
  } catch (_) { WIKI_PLANET_MAP = {}; }
  // 行动变量表（tables/hd2_variables.json；含作战限制红 Tag 判定）
  await loadVariables();
  // 星球下属区域（城市/超大型工厂）静态表（2026-09-24 demo）：名字/类型/描述 + 中文名覆盖
  try {
    REGIONS = (await (await fetch(B + "tables/planet_regions.json?v=20261007b", { cache: "no-store" })).json()).planets || {};
    REGIONS_ZH = (await (await fetch(B + "tables/planet_regions_zh.json?v=20261007b", { cache: "no-store" })).json()).planets || {};
  } catch (_) { REGIONS = {}; REGIONS_ZH = {}; }
  // 星区/星球中文映射（tables/starmap.json；缺失时回退英文，不致命）
  // 官方 API 与 hd2dev 的星区拼写不一致，沿用 index.html 的别名表桥接
  const SECTOR_ALIASES = {
    "Arturion": "Arkturus", "Cantolus": "Cantorus", "Gallux": "Galux", "Gellert": "Gelert",
    "Gothmar": "Gottma", "Guang": "Guan",
    "Korpus": "Corpus", "Marspira": "Maspira", "Meridian": "Meridia", "Morgon": "Morgen",
    "Rictus": "Rectus", "Sten": "Stein", "Talus": "Talos", "Tarragon": "Tarago",
    "Ursa": "Ursa Major", "Void": "The Void",
    // 2026-09 补充：官方 API 星区名与 starmap 系统名差异较大的，全部用
    // 「该星区星球集合 ∩ starmap 系统星球集合」重合度确认（overlap 100%），非猜测：
    "Cancri": "Kongulii",     // 刻耳柏洛斯IIIc/艾芙鲁维亚/庇护堡/繁荣瀑布/塞舌尔海滩 → 康古利伊
    "Lacaille": "Lakieo",     // PENTA/CHOOHE/CHORT BAY/LESATH → 拉凯欧（与 companion 页面一致：75% 机器人占领）
    "Ymir": "Hyperion",       // MEISSA/WASAT/VEGA BAY/WEZEN/X-45 → 土卫十九
    "Idun": "Eaton",          // ATRAMA/MAW/MYRADESH/WRAITH → 伊顿（旧值指向 Ipotus 是错的）
    "Iptus": "Ipodus",        // IRIDICA/KRAKABOS/PRIMORDIA/PROVIDENCE/RATCH/VALGAARD → 伊普都斯（旧值 Ipotus 拼写不符）
  };
  const SECTOR_CN_FALLBACK = { "TBD": "不分区" };   // starmap 未收录的星区（TBD 占位）→「不分区」
  try {
    const star = await (await fetch(B + "tables/starmap.json?t=" + Date.now(), { cache: "no-store" })).json();
    for (const sysn of (star.systems || [])) {
      if (sysn.name_en) SEC_CN[sysn.name_en.toUpperCase()] = sysn.name;
      for (const pl of (sysn.planets || [])) {
        if (pl.en) PL_CN[pl.en.toUpperCase()] = pl.cn || "";
      }
    }
    // 星球 -> 中文星区（starmap.planets[].system）：**唯一权威源**（用户指定）。
    // 不能拿 data.json 的 p.sector 分组 —— 实测 273 颗里 152 颗为空，会分出「未分区」和一堆假星区。
    SEC_BY_PLANET = {};
    for (const [en, v] of Object.entries(star.planets || {})) {
      if (v && v.system) SEC_BY_PLANET[String(en).toUpperCase()] = v.system;
    }
    // 未分区星球（starmap 无星区、或星区是 TBD 占位，如 NEW INSIGHT / WAYWARD）：
    // 统一登记，稍后**从星图上完全剔除**（其坐标是 (0,0) 哨兵值，会把图标叠在银河中心）。
    UNLISTED_IDX.clear();
    for (const p of (data.planets || [])) {
      const s = SEC_BY_PLANET[String(p.name || "").toUpperCase()];
      if (!s || s.toUpperCase() === "TBD") UNLISTED_IDX.add(p.index);
    }
    for (const [off, canonical] of Object.entries(SECTOR_ALIASES)) {
      if (!SEC_CN[off.toUpperCase()] && SEC_CN[canonical.toUpperCase()]) SEC_CN[off.toUpperCase()] = SEC_CN[canonical.toUpperCase()];
    }
  } catch (_) { /* 中文映射缺失不影响运行 */ }
  DATA = data;
  WP = wpRaw.waypoints || wpRaw;
  // 未分区的星球也不进 BYIDX —— 否则检索框（#q）与 focusPlanet 仍会把它翻出来、飞到银河中心
  (data.planets || []).forEach(p => { if (!UNLISTED_IDX.has(p.index)) BYIDX[p.index] = p; });

  // ---- 星区索引（供左上角星区卡：总解放度 / 占领方 / 交战中阵营） ----
  {
    const tmp = {};
    (data.planets || []).forEach(p => {
      // 星区归属以写死对照表为准（见上方 SEC_BY_PLANET 注释）
      const s = SEC_BY_PLANET[String(p.name || "").toUpperCase()] || p.sector || "UNKNOWN";
      (tmp[s] = tmp[s] || []).push(p);
    });
    SECTOR_IDX = {};
    for (const [name, list] of Object.entries(tmp)) {
      let human = 0, total = 0, np = 0;
      const byRace = {};
      for (const pl of list) {
        const hp = pl.maxHealth || 0;
        human += (pl.currentOwner === "Humans") ? hp : (hp - (pl.health || 0));
        total += hp;
        if (hp > 0) np++;
        if (pl.currentOwner && pl.currentOwner !== "Humans") {
          byRace[pl.currentOwner] = (byRace[pl.currentOwner] || 0) + 1;
        }
      }
      // 主导阵营 = 该星区内占领星球最多的敌方阵营；并列或无敌方 → 交战区
      let owner = null, best = 0, tie = false;
      for (const [k, v] of Object.entries(byRace)) {
        if (v > best) { best = v; owner = k; tie = false; }
        else if (v === best) tie = true;
      }
      if (tie) owner = null;
      // 中文名在此解析：分组键若已是中文（写死对照表）直接用；否则查 SEC_CN / 内置兜底
      const cn0 = /[\u4e00-\u9fff]/.test(name) ? name
        : (SEC_CN[name.toUpperCase()] || SECTOR_CN_FALLBACK[name.toUpperCase()] || "");
      SECTOR_IDX[name] = {
        name, cn: (/[\u4e00-\u9fff]/.test(cn0) ? cn0 : name),
        planets: np, total,
        lib: total > 0 ? human / total * 100 : 0,
        owner, races: Object.keys(byRace),
      };
    }
  }

  // ---- 2) 战术目标（复用现有 tactical.js） ----
  setMsg("正在计算战术目标…", "补给线 · 战役状态 · 战略目标", 3);
  await nextPaint();
  try {
    if (window.Tactical) {
      // nameOf / sectorCnOf 必须返回**中文名**，否则战术词条正文里会混入英文原名
      // （如「解放HEETH将对BRILLIANCE的…」）。PL_CN/SEC_CN 已在上方由 starmap.json 填充。
      const ctx = {
        // p.sector（hd2dev）与游戏分区不符、且 273 颗里 152 颗为空 → 统一换成 starmap 权威中文
        // 星区名，供 tactical.js 的「星域解放」同星区判定与文案使用（sectorCnOf 收到中文原样返回）。
        planets: (data.planets || []).map(p => Object.assign({}, p,
          { sector: UNLISTED_IDX.has(p.index) ? "" : secCnByPlanet(p) })),
        campaigns: data.campaigns, waypoints: wpRaw,
        nameOf: (idx) => {
          const p = BYIDX[idx];
          if (!p) return "#" + idx;
          return PL_CN[String(p.name || "").toUpperCase()] || p.name;
        },
        sectorCnOf: (s) => SEC_CN[String(s || "").toUpperCase()] || s,   // 已是中文星区名时原样返回
      };
      const wpKeys = Object.keys(WP);
      for (let i = 0; i < wpKeys.length; i++) {
        const k = wpKeys[i];
        try { const t = window.Tactical.computeFor(+k, ctx); if (t && t.length) TACBY[+k] = t; } catch (_) {}
        // 每 24 个节点让出主线程，避免长任务把加载动画和状态切换卡住。
        if ((i + 1) % 24 === 0) await nextPaint();
      }
    }
  } catch (_) { /* 词条失败不影响星图 */ }

  // ---- 3) 构造 GeoJSON ----
  // 注意：不能按坐标 (0,0) 剔除 —— 超级地球(index 0) 的合法坐标就是 (0,0)，
  // 早前用 `pos.x || pos.y` 过滤把超级地球一起丢掉了（正是"星图中心缺星球"的原因）。
  // 改为只保留落在星图有效范围内的坐标：NEW INSIGHT / WAYWARD 是未启用占位星球，
  // 坐标为哨兵值 (0,0)，靠索引名单剔除，避免与超级地球重叠。
  // 未分区的星球不上图：UNLISTED_IDX（starmap 无星区/TBD，用户要求「未分区不显示在地图上」）
  // 并上历史哨兵名单（防止对照表变动后漏网），两者取并集。
  const SENTINEL_IDX = new Set([264, 265]);   // NEW INSIGHT / WAYWARD
  const planets = (data.planets || []).filter(p => {
    const pos = p.position || {};
    if (SENTINEL_IDX.has(p.index) || UNLISTED_IDX.has(p.index)) return false;
    return Number.isFinite(pos.x) && Number.isFinite(pos.y);
  });
  const fc = (feats) => ({ type: "FeatureCollection", features: feats });
  const pt = (x, y) => ({ type: "Point", coordinates: [x, y] });

  // 无法抵达(1190 mark_Hidden)：官方描述「Our sensors can no longer monitor this planet.」
  // 这类星球**不从星图上剔除**（曾考虑学 264/265 移出，但那会让星球页入口一起消失），
  // 改为整颗星球降到 40% 不透明度，一眼区别于正常星球；具体原因由详情面板的效果 chip 说明。
  // 例外：落在阴霾区（1188/1193）的星球已由黄色雾团图层表现，不再叠加变淡。
  const HIDDEN_IDS = new Set([1190]);
  const HIDDEN_EXCLUDE_IDS = new Set([1188, 1193]);   // 阴霾：已有专门的雾团图层
  const isHidden = (p) => {
    const fx = p.activeEffects || [];
    return fx.some(e => HIDDEN_IDS.has(e)) && !fx.some(e => HIDDEN_EXCLUDE_IDS.has(e));
  };
  const HIDDEN_IDX = new Set(planets.filter(isHidden).map(p => p.index));
  const OPACITY_HIDDEN = .4;
  // 把 opacity 按 hidden 属性降级：hidden=1 → ×0.4，否则原样。
  // MapLibre 对 zoom 表达式有两条硬规则，写错任何一条都会让**整个样式校验失败** →
  // map 的 load 事件永不触发 → 星图永久卡在加载遮罩（2026-10 两次踩坑）：
  //   ① 一条表达式里只能有一个 zoom 驱动的 step/interpolate；
  //   ② zoom 的 step/interpolate 只能出现在**顶层**，不能塞进 ["*", interp, …] 里。
  // 故：常量 opacity 走 dim()；zoom 驱动的插值走 dimZoom()，把隐藏系数下推到每个档位的输出值。
  //   ✗ ["case", ["==", ["get","hidden"], 1], ["*", interp, OPACITY_HIDDEN], interp]  // 违反 ①
  //   ✗ ["*", interp, HIDDEN_FACTOR]                                                  // 违反 ②
  //   ✓ dimZoom([[4, .14], [9, .26], [13, .38]])
  const HIDDEN_FACTOR = ["case", ["==", ["get", "hidden"], 1], OPACITY_HIDDEN, 1];
  const dim = (v) => ["*", v, HIDDEN_FACTOR];
  const dimZoom = (stops) => ["interpolate", ["linear"], ["zoom"],
    ...stops.flatMap(([z, v]) => [z, ["*", v, HIDDEN_FACTOR]])];

  // 星球点（带全部展示属性）
  const planetFC = fc(planets.map(p => {
    const libPct = p.maxHealth > 0 ? Math.max(0, Math.min(100, (1 - p.health / p.maxHealth) * 100)) : 0;
    const tac = (TACBY[p.index] || []).map(t => t.title);
    return {
      type: "Feature", geometry: pt(p.position.x, p.position.y),
      properties: {
        index: p.index, name: p.name || ("#" + p.index),
        nameCn: PL_CN[String(p.name || "").toUpperCase()] || "",
        owner: p.currentOwner || "None", ownerCn: OWN_CN[p.currentOwner] || (p.currentOwner || "未知"),
        color: OWNER_COLOR[p.currentOwner] || "#64748b",
        sector: p.sector || "", sectorCn: secCnByPlanet(p),
        players: p.players || 0, lib: +libPct.toFixed(1),
        tacCount: tac.length, tacTitle: tac.join(" / "),
        icon: planetIconFile(p.name) || "",
        // 有可显示效果图标（去重后）的星球，供浮动图标层使用
        fx: fxOf(p).length,
        isDef: (data.campaigns || []).some(c => c.campaignType === "defense" && c.planet && c.planet.index === p.index) ? 1 : 0,
        isEvent: (data.planet_events || []).some(e => e.planetIndex === p.index) ? 1 : 0,
        // 无法抵达(1190)：整个星球节点降到 40% 不透明度（阴霾区除外，见上方 HIDDEN_IDS）
        hidden: isHidden(p) ? 1 : 0,
      },
    };
  }));

  // 补给线（有向；按速率分级）
  const ownerOf = (i) => (BYIDX[i] ? BYIDX[i].currentOwner : null);
  const posOf = (i) => (BYIDX[i] && BYIDX[i].position) ? BYIDX[i].position : null;
  // 补给线：**全部** waypoint 边都要画（实测共 299 条：我方↔我方 215、敌方↔敌方 67、
  // 跨阵营 57）。上一版误把「非跨阵营」的线全部丢弃，导致星图几乎看不到连线。
  //   · 同阵营线：用该阵营代表色的暗色实线
  //   · 跨阵营线：额外叠加一层「我方（超级地球）色 → 阵营代表色」渐变（见 supply-grad-* 图层）
  // 2026-09-24：超级地球改动为 #5BA3D0 后，这里的「我方端点」同步由黄改蓝
  // （SUPPLY_FACTION_COLOR.Humans 必须与 OWNER_COLOR / FACTION_COLOR / --c-humans 同值，否则连线端点会撞色）。
  const SUPPLY_FACTION_COLOR = { Humans:"#5BA3D0", Terminids:"#f59e0b", Automaton:"#ef4444", Illuminate:"#AA44FF" };
  const supplyFC = fc((() => {
    const out = [];
    for (const k of Object.keys(WP)) {
      const a = posOf(+k); if (!a) continue;
      for (const to of (WP[k] || [])) {
        const b = posOf(+to); if (!b) continue;
        const oA = ownerOf(+k) || "None", oB = ownerOf(+to) || "None";
        // 跨阵营渐变以「我方那一端」为我方色（#5BA3D0）起点；其余取任一端阵营色
        let grad = null;
        if (oA === "Humans" && oB !== "Humans") grad = oB;
        else if (oB === "Humans" && oA !== "Humans") grad = oA;
        const humanEnd = (oA === "Humans" && oB !== "Humans");
        out.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: [[a.x, a.y], [b.x, b.y]] },
          properties: {
            from: +k, to: +to,
            fromOwner: oA, toOwner: oB,
            // cross: 跨阵营线标记（用于渐变层 + 实线是否加深）
            cross: grad ? 1 : 0,
            grad: grad || oA,               // 渐变终点阵营（非跨阵营时为自身阵营）
            humanEnd: humanEnd ? 1 : 0,     // 1 表示 from 端为我方（我方色起点）
            color: SUPPLY_FACTION_COLOR[grad || oA] || "#64748b",
          },
        });
      }
    }
    return out;
  })());

  // 跨阵营渐变图层：line-gradient 不是 data-driven，故按「阵营 × 我方端点」显式生成 6 条。
  // humanEnd=1 → from 端是我方（我方色在 0%）；humanEnd=0 → to 端是我方（我方色在 100%）。
  const GRAD_HEX = { Terminids:"245,158,11", Automaton:"239,68,68", Illuminate:"170,68,255" };
  const BLUE_C = "rgba(91,163,208,.95)";   // 我方（超级地球）= #5BA3D0
  const SUPPLY_GRAD_LAYERS = [];
  for (const [fac, rgb] of Object.entries(GRAD_HEX)) {
    for (const humanEnd of [1, 0]) {
      const FAC_C = `rgba(${rgb},1)`;
      SUPPLY_GRAD_LAYERS.push({
        id: `supply-grad-${fac.toLowerCase()}-${humanEnd}`,
        type: "line", source: "supply",
        filter: ["all", ["==", ["get", "cross"], 1], ["==", ["get", "grad"], fac],
                 ["==", ["get", "humanEnd"], humanEnd]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-width": ["interpolate", ["linear"], ["zoom"], 4, 1.4, 9, 3.2, 13, 7.5],
          "line-opacity": .95,
          "line-gradient": ["interpolate", ["linear"], ["line-progress"],
            0, humanEnd ? BLUE_C : FAC_C, 1, humanEnd ? FAC_C : BLUE_C],
        },
      });
    }
  }

  // 真·入侵（防御战）：campaignType=defense / eventType=1 / type=1|4（与主页 index.html 同一判据）
  const INVASIONS = (data.campaigns || []).filter(c =>
    c.planet && c.planet.index != null &&
    (String(c.campaignType).toLowerCase() === "defense" || c.eventType === 1 ||
     c.type === 1 || c.type === 4));

  // 入侵战役连线（红虚线 + 箭头）：**只有真在打防御战的星球才画**。
  // 2026-09-24 修正：旧版直接拿上游 planet_attacks 的**全部跨阵营相邻对**（60+ 条）画红线，
  //   于是整张图到处是红虚线、看着像到处都是接敌；而「我方星球 ↔ 敌方星球」的相邻关系
  //   本来就由 supply 连线（跨阵营那条）叠的渐变层表达了，红线属于重复表达 + 误导。
  // 现在：从 planet_attacks 里找出与被入侵星球相邻、且归属 = campaign.faction 的那颗敌星作起点，
  //   坐标顺序 [入侵方 → 被入侵星球]，箭头方向与之一致。
  const attackFC = fc(INVASIONS.map(c => {
    const mine = c.planet.index, dst = posOf(mine);
    if (!dst) return null;
    const fac = String(c.faction || "");
    const neighbours = (data.planet_attacks || [])
      .filter(a => a.source === mine || a.target === mine)
      .map(a => (a.source === mine ? a.target : a.source));
    // 优先取「归属 = 入侵方阵营」的邻居；取不到就退回第一个邻居（仍是相邻的那颗）
    const origin = (neighbours.find(i => String((BYIDX[i] || {}).currentOwner || "") === fac) != null)
      ? neighbours.find(i => String((BYIDX[i] || {}).currentOwner || "") === fac)
      : neighbours[0];
    const from = origin != null ? posOf(origin) : null;
    if (!from) return null;
    return { type: "Feature",
             geometry: { type: "LineString", coordinates: [[from.x, from.y], [dst.x, dst.y]] },
             properties: { from: origin, to: mine, faction: fac } };
  }).filter(Boolean));

  // 玩家热力（按星球）
  /* ⚠ 2026-09-26 修（用户反馈：勾上「玩家热力」看不出任何变化）：
     旧代码 `value: Math.min(1, players / 9000)` 把权重压得几乎全是 0 ——
     全服 273 颗里绝大多数星球只有几十到几千人，实测前 5 个特征值是 `0.021 / 0.012 / 0 / 0 / 0`。
     热力图的"密度"是**邻域内权重之和**，权重趋近 0 → 密度落在色带第一个可见档（0.2）之下 →
     整层画出来近乎全透明（实测：开/关两帧只有 427 / 795616 个像素发生变化，肉眼当然看不出）。
     ⇒ 改为**对数标度**：把"百人级"到"万人级"拉开（`log(1+p)/log(30001)`），
       小战场也能显出淡热力、大战场仍然最亮；并给色带补一个低密度档（0.05）让淡热力真的可见。
     口径：这是**相对热度**，不是人数刻度；`heatmap-intensity` 统一整体亮度。 */
  const HEAT_SCALE = 30000;
  const heatFC = fc(planets.filter(p => (p.players || 0) > 0).map(p => ({
    type: "Feature", geometry: pt(p.position.x, p.position.y),
    // `value`：对数标度，保证小战场也有可看的权重（热力图**可见性**靠它）
    // `players`：原始人数，给热源**半径**用（2026-09-26 用户要求"把星球当成随人数变动的巨大热源"）
    properties: { value: Math.min(1, Math.log(1 + (p.players || 0)) / Math.log(1 + HEAT_SCALE)),
                  players: p.players || 0 },
  })));

  /* 星区领土：游戏 / companion 同一套极坐标网格 —— 24 个 15° 楔形 × 10 个 0.1 半径环。
     每格 = 两条径向直边 + 两条环弧（环弧就是游戏里那圈「曲边」的来源）；星球落进哪格就属于哪个星区，
     空格用最近星球补齐。分组键仍走 secCnByPlanet（starmap 权威中文星区名）。
     ⚠ 格子大小**就是观感**（2026-10-16 用户要求「几块矩形拼起来」）：格子取游戏口径 15°×0.1，
       星区的边就只有径向直边和同心弧两种方向、拐角是直角，拼出来像几块倾斜的矩形；
       格子放大到 72×36 时边会碎成细密台阶，再抽稀就会切成斜线（两头都不是那个味道）。 */
  const WED = 24, RING = 10;                                  // 与游戏同口径：15° × 0.1
  const countBySector = {}, bySector = {}, ownerTally = {};
  planets.forEach(p => {
    const sec = secCnByPlanet(p);
    (bySector[sec] = bySector[sec] || []).push(p);
    countBySector[sec] = (countBySector[sec] || 0) + 1;
    ownerTally[sec] = ownerTally[sec] || {};
    ownerTally[sec][p.currentOwner] = (ownerTally[sec][p.currentOwner] || 0) + 1;
  });
  const dominantOwner = (sec) => {
    const t = ownerTally[sec] || {};
    return Object.keys(t).sort((a, b) => t[b] - t[a])[0] || "Humans";
  };
  const ownerColorOf = sec => OWNER_COLOR[dominantOwner(sec)] || "#64748b";
  // 底色：**只要星区里有一颗星球被敌方占领，整片星区就上敌方色**（2026-10-17 用户要求：
  //   塞提亚、赤血这类敌占星球所在的星区必须渲染成光能者色，不能因为「我方星球更多」而留透明）。
  //   敌方有多个阵营时，取敌方星球最多的那个阵营；一颗敌方星球都没有（全员我方）→ 不上底色。
  //   边界线不受影响，所有星区都照常描边。
  const sectorFillOf = sec => {
    const t = ownerTally[sec] || {};
    const enemy = Object.keys(t).filter(o => o !== "Humans" && OWNER_COLOR[o])
      .sort((a, b) => t[b] - t[a])[0];
    return enemy ? OWNER_COLOR[enemy] : "rgba(0,0,0,0)";
  };
  // 格子归属：① 格子里有星球 → 这格归该星球所在星区（同格多颗取多数，平手取离格心最近的：
  //   否则会出现「这颗星球长在别人家块里」）；② 空格 → 归最近星球所在的星区。
  // 这样星区边界随星球分布自然变得大小不一，但每条边都落在 15°×0.1 的格子线上。
  const cellOwner = {};
  {
    const W = 360 / WED;
    const cellOf = (x, y) => Math.min(WED - 1, Math.floor((((Math.atan2(y, x) * 180 / Math.PI + 90) % 360) + 360) % 360 / W)) +
      ":" + Math.min(RING - 1, Math.floor(Math.hypot(x, y) * RING));
    const claim = {};
    planets.forEach(p => (claim[cellOf(p.position.x, p.position.y)] = claim[cellOf(p.position.x, p.position.y)] || []).push(p));
    Object.entries(claim).forEach(([k, list]) => {
      const parts = k.split(":"), w = +parts[0], r = +parts[1];
      const th = ((w + .5) * W - 90) * Math.PI / 180, rad = (r + .5) / RING;
      const cx = rad * Math.cos(th), cy = rad * Math.sin(th), tally = {};
      list.forEach(p => {
        const s = secCnByPlanet(p), t = tally[s] = tally[s] || { n: 0, d: Infinity };
        t.n++; t.d = Math.min(t.d, Math.hypot(p.position.x - cx, p.position.y - cy));
      });
      cellOwner[k] = Object.keys(tally).sort((a, b) => tally[b].n - tally[a].n || tally[a].d - tally[b].d)[0];
    });
    for (let w = 0; w < WED; w++) for (let r = 0; r < RING; r++) {
      if (cellOwner[w + ":" + r]) continue;
      const th = ((w + .5) * W - 90) * Math.PI / 180, rad = (r + .5) / RING;
      const mx = rad * Math.cos(th), my = rad * Math.sin(th);
      let best = null, bestD = Infinity;
      for (const p of planets) {
        const dx = p.position.x - mx, dy = p.position.y - my, d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = p; }
      }
      if (best) cellOwner[w + ":" + r] = secCnByPlanet(best);
    }
  }
  const polarPt = (w, rad) => {
    const th = (w * (360 / WED) - 90) * Math.PI / 180;
    return [rad * Math.cos(th), rad * Math.sin(th)];
  };
  const ownerAt = (w, r) => (r < 0 || r >= RING ? "OUT" :
    (cellOwner[((w % WED) + WED) % WED + ":" + r] || "OUT"));

  /* ── 星区轮廓（2026-10-16）：把同属一个星区的细格**并成一整块**，沿格子边界走出一圈轮廓 ──
     逐格填充时，格与格之间会留下缝（半透明下更明显），而且每个星区被拆成上百个小面；
     改成「并集轮廓」后，一个星区就是一整块面，形状严格贴格子（径向直边 + 同心弧，直角拐角），
     也就是游戏/companion 那种「几块矩形拼起来」的观感。
     ⚠ 抽稀必须**按共享的边界链做**（不是每个星区各抽各的）：一个星区的边同时也是邻格的边，
       两边各自抽稀会得到两条不同的折线 → 半透明填充之间裂出细缝（或叠色）。
       所以先把整张边界图拆成「链」（度=2 的中间点串起来、junction 处断开），每条链只抽稀一次；
       相邻星区引用同一条链（一正一反）→ 填充严丝合缝、描边与填充共用同一条线。 */
  // 角点 KP(w,r)＝角度索引 w × 半径索引 r；r=0 的一整圈在几何上就是圆心，统一塌成节点 "C"。
  const KP = (w, r) => (r <= 0 ? "C" : (((w % WED) + WED) % WED) + ":" + r);
  const nodeRC = (k) => (k === "C" ? [0, 0] : k.split(":").map(Number));
  const nodePt = (k) => { const rc = nodeRC(k); return polarPt(rc[0], rc[1] / RING); };

  // 第 1 步：每格只出「与邻格归属不同」的边，统一按逆时针定向
  // （下边 +w、右边 +r、上边 -w、左边 -r）→ 每个角点恰好 1 进 1 出，顺着走必然闭合。
  // 半径最小那一圈的下边退化成圆心一个点，跳过（圆心附近单独处理，见下）。
  // ⚠ 边存成**有向边表**（而不是「角点 → 唯一后继」）：同一个星区的两格若只共用一个角
  //   （对角相碰），那个角点就是 2 进 2 出，用「每角点一个后继」的 Map 会把边覆盖掉、
  //   走环再也回不到起点（2026-10-16 踩过：页面会卡在加载遮罩上）。
  const edgesOf = new Map();                              // 星区 -> [[角点, 后继角点], ...]
  const dirAdd = (S, a, b) => { let l = edgesOf.get(S); if (!l) edgesOf.set(S, l = []); l.push([a, b]); };
  for (let w = 0; w < WED; w++) for (let r = 0; r < RING; r++) {
    const S = ownerAt(w, r);
    if (r > 0 && ownerAt(w, r - 1) !== S) dirAdd(S, KP(w, r), KP(w + 1, r));          // 下边（弧）
    if (r > 0 && ownerAt(w + 1, r) !== S) dirAdd(S, KP(w + 1, r), KP(w + 1, r + 1));  // 右边（径向）
    if (ownerAt(w, r + 1) !== S) dirAdd(S, KP(w + 1, r + 1), KP(w, r + 1));           // 上边（弧）
    if (r > 0 && ownerAt(w - 1, r) !== S) dirAdd(S, KP(w, r + 1), KP(w, r));          // 左边（径向）
  }
  // 圆心那一圈：一个星区在 r=0 上的每个连续段 → 一段「穿圆心」的跳线 KP(w0,1) → KP(w1+1,1)
  // （真实数据里整圈 r=0 同属太阳系 → 没有任何跳线；这里只是保证换数据也不会走崩）
  const centerOver = new Map();                           // 星区 -> Map(起点角点 -> 终点角点)
  {
    const r0 = Array.from({ length: WED }, (_, w) => ownerAt(w, 0));
    const oneRing = r0.every(s => s === r0[0]);
    if (!oneRing) for (let w0 = 0; w0 < WED; w0++) {
      if (r0[w0] === r0[(w0 - 1 + WED) % WED]) continue;      // 只在段首出跳线
      let len = 0; while (len < WED && r0[(w0 + len) % WED] === r0[w0]) len++;
      let m = centerOver.get(r0[w0]);
      if (!m) centerOver.set(r0[w0], m = new Map());
      m.set(KP(w0, 1), KP(w0 + len, 1));
    }
  }
  // 出边表（一个角点可能有多条出边，见上）
  const outOf = new Map();                                // 星区 -> Map(角点 -> [后继角点, ...])
  edgesOf.forEach((list, S) => {
    const m = new Map();
    list.forEach(([a, b]) => { const l = m.get(a); if (l) l.push(b); else m.set(a, [b]); });
    outOf.set(S, m);
  });

  // 第 2 步：全局边界图（无向）→ 拆成链。径向边 r≥1、弧向边 1≤r≤RING（含最外圈）。
  const adj = new Map(), bEdges = [];
  const edgeKey = (a, b) => (a < b ? a + "|" + b : b + "|" + a);
  const addEdge = (a, b) => {
    if (a === b) return;
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b); adj.get(b).push(a); bEdges.push([a, b]);
  };
  for (let w = 0; w < WED; w++) {
    for (let r = 1; r < RING; r++) if (ownerAt(w - 1, r) !== ownerAt(w, r)) addEdge(KP(w, r), KP(w, r + 1));
    for (let r = 1; r <= RING; r++) if (ownerAt(w, r - 1) !== ownerAt(w, r)) addEdge(KP(w, r), KP(w + 1, r));
  }
  const chains = [], usedEdge = new Set();
  for (const [a0, b0] of bEdges) {
    if (usedEdge.has(edgeKey(a0, b0))) continue;
    usedEdge.add(edgeKey(a0, b0));
    const nodes = [a0, b0];
    let closed = false;
    for (const dir of [1, -1]) {
      if (closed) break;
      let prev = dir > 0 ? a0 : b0, cur = dir > 0 ? b0 : a0;
      while (adj.get(cur).length === 2) {
        const nb = adj.get(cur), nx = nb[0] === prev ? nb[1] : nb[0];
        const back = dir > 0 ? nodes[0] : nodes[nodes.length - 1];
        if (nx === back) { closed = true; break; }
        if (usedEdge.has(edgeKey(cur, nx))) break;
        usedEdge.add(edgeKey(cur, nx));
        if (dir > 0) nodes.push(nx); else nodes.unshift(nx);
        prev = cur; cur = nx;
      }
    }
    chains.push({ nodes, closed });
  }

  // 第 3 步：**不做斜切抽稀**，只把「同向共线」的相邻点并掉。
  // ⚠ 这里踩过一次坑（2026-10-16）：最初照交接文档用 Douglas–Peucker（容差 0.9 个细格）把台阶
  //   压成长直边，台阶是被压平了，但压出来的是任意角度的斜线，星区变成歪扭的多边形 —— 用户要的是
  //   「几块矩形拼起来」：形状**严格贴格子**（径向直边 + 同心弧，拐角是直角），台阶就在格子尺度上。
  //   所以现在：连续同角度的径向边并成一条长直线、同半径的弧边并成一条长弧，拐角一个都不动。
  // 弧边按角度取样（约 1.25° 一段）。格子是 15° 的粗格，若只取两三个点，长弧会变成折线、
  // 圆盘外缘也会被切成多边形；取样够密，弧看起来就是弧。
  const ARC_STEP_DEG = 1.25;
  const arcSamples = (a, b) => {
    const [wa, ra] = nodeRC(a), [wb, rb] = nodeRC(b);
    if (ra !== rb || wa === wb) return [nodePt(a), nodePt(b)];
    let dw = wb - wa; if (dw > 1) dw = -1; else if (dw < -1) dw = 1;
    const n = Math.max(2, Math.ceil(Math.abs(dw) * (360 / WED) / ARC_STEP_DEG));
    const out = [];
    for (let i = 0; i <= n; i++) out.push(polarPt(wa + dw * i / n, ra / RING));
    return out;
  };
  // 同向判定：p 处拐没拐弯（叉积为 0 且点积 > 0 才算「还是那条直线」）。
  // 阈值取 1e-6 的正弦值 ≈ 0.00006°，弧上每 1/6 格的取样点也有 ~0.83° 的方向变化，绝不会被误并。
  const straightAt = (o, p, q) => {
    const ax = p[0] - o[0], ay = p[1] - o[1], bx = q[0] - p[0], by = q[1] - p[1];
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    if (la < 1e-12 || lb < 1e-12) return true;
    return Math.abs((ax * by - ay * bx) / (la * lb)) < 1e-6 && (ax * bx + ay * by) > 0;
  };
  const weldStraight = (pts) => {                         // 去重复点 + 去「共线同向」的中间点（形状不变）
    const uniq = [];
    for (const p of pts) {
      const l = uniq[uniq.length - 1];
      if (!l || l[0] !== p[0] || l[1] !== p[1]) uniq.push(p);
    }
    const out = [];
    for (let i = 0; i < uniq.length; i++) {
      if (out.length && i + 1 < uniq.length && straightAt(out[out.length - 1], uniq[i], uniq[i + 1])) continue;
      out.push(uniq[i]);                                 // 首尾两点永远保留（它们是 junction）
    }
    return out;
  };
  chains.forEach(ch => {
    const pts = [];
    const seq = ch.closed ? ch.nodes.concat([ch.nodes[0]]) : ch.nodes;
    for (let i = 0; i < seq.length - 1; i++) {
      const seg = arcSamples(seq[i], seq[i + 1]);
      for (let k = 0; k < seg.length - 1; k++) pts.push(seg[k]);
    }
    pts.push(nodePt(seq[seq.length - 1]));
    ch.simp = weldStraight(pts);
  });

  // 第 4 步：顺着第 1 步的有向边走环。链的入口只有两个方向：从链首进（顺着读）或从链尾进（倒着读），
  // 所以走到链端点就把整条链的折线一次吐完（相邻星区共用这条折线 → 填充严丝合缝）。
  const entryOf = new Map();                              // "角点|后继" -> {i, fwd}
  chains.forEach((ch, i) => {
    const n = ch.nodes, last = n.length - 1;
    if (last < 1) return;
    entryOf.set(n[0] + "|" + n[1], { i, fwd: true });
    // ⚠ 只有两个角点的短链（= 一条边）也必须登记反向入口，否则反向走时会当成「单边」处理，
    //   弧边就退化成一条弦（2026-10-16 踩过：整盘面积少 0.75%，症状是弧被拉直）
    entryOf.set(n[last] + "|" + n[last - 1], { i, fwd: false });
  });
  const ringArea = (r) => { let s = 0; for (let i = 0; i < r.length - 1; i++) s += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return s / 2; };
  const inRing = (p, rg) => {                              // 射线法：点是否在某环内
    let hit = false;
    for (let i = 0, j = rg.length - 2; i < rg.length - 1; j = i++) {
      const yi = rg[i][1], yj = rg[j][1];
      if ((yi > p[1]) !== (yj > p[1]) &&
          p[0] < (rg[j][0] - rg[i][0]) * (p[1] - yi) / (yj - yi) + rg[i][0]) hit = !hit;
    }
    return hit;
  };
  // 网格步方向（±w / ±r），用来判「下一个出口往哪拐」
  const stepDir = (a, b) => {
    const A = nodeRC(a), B = nodeRC(b);
    let dw = B[0] - A[0];
    if (dw > 1) dw = -1; else if (dw < -1) dw = 1;
    return [dw, B[1] - A[1]];
  };
  // 从 cur 出发，来向是 din，挑下一条出边：**尽量左转**（平面图追面的标准做法）。
  // 星区两格对角相碰的角点上有 2 进 2 出，靠这条规则两块各走各的，不会串成一个蝴蝶结。
  const nextAfter = (din, cur, outs, over) => {
    if (over) { const f = over.get(cur); if (f) return f; }       // 穿圆心的跳线优先
    const list = outs.get(cur);
    if (!list || !list.length) return null;
    if (list.length === 1 || !din || cur === "C") return list[0];
    let best = null, bestAng = -Infinity;
    for (const d of list) {
      const dd = stepDir(cur, d);
      if (dd[0] === -din[0] && dd[1] === -din[1]) continue;       // 不走回头路
      const ang = Math.atan2(din[0] * dd[1] - din[1] * dd[0], din[0] * dd[0] + din[1] * dd[1]);
      if (ang > bestAng) { bestAng = ang; best = d; }
    }
    return best || list[0];
  };
  const sectorFC = fc([...outOf.entries()].map(([name, outs]) => {
    const over = centerOver.get(name) || null;
    const used = new Set(), rings = [];
    for (const [a0, list] of outs) for (const b0 of list) {
      if (used.has(edgeKey(a0, b0))) continue;
      if (!entryOf.has(a0 + "|" + b0)) continue;            // 只从链端点起步，保证整条链一次吐完
      // 每一步处理一条「边」（cur → nxt）：边若属于某条链，就把整条链的折线一次吐完并跳到链的另一端
      const pts = [nodePt(a0)], seen = new Set();
      let cur = a0, nxt = b0, din = null, guard = 0, closed = false;
      while (nxt != null && guard++ < 5000) {               // 兜底：数据异常也别把页面卡死
        used.add(edgeKey(cur, nxt));
        const en = entryOf.get(cur + "|" + nxt);
        if (en) {
          const ch = chains[en.i], seq = en.fwd ? ch.simp : ch.simp.slice().reverse();
          for (let k = 1; k < seq.length; k++) pts.push(seq[k]);
          for (const n of ch.nodes) seen.add(n);
          for (let k = 0; k + 1 < ch.nodes.length; k++) used.add(edgeKey(ch.nodes[k], ch.nodes[k + 1]));
          const end = ch.closed ? ch.nodes[0] : (en.fwd ? ch.nodes[ch.nodes.length - 1] : ch.nodes[0]);
          const from = ch.closed ? ch.nodes[ch.nodes.length - 1] : (en.fwd ? ch.nodes[ch.nodes.length - 2] : ch.nodes[1]);
          din = stepDir(from, end); cur = end;
        } else {
          // 没成链的单边（正常情况下不该出现，兜底用）：弧边也要按弧取样，别退化成弦
          const seg = arcSamples(cur, nxt);
          if (over && over.get(cur) === nxt) pts.push([0, 0]);      // 穿圆心
          for (let k = 1; k < seg.length; k++) pts.push(seg[k]);
          din = stepDir(cur, nxt); cur = nxt;
        }
        if (cur === a0 && nextAfter(din, a0, outs, over) === b0) { closed = true; break; }  // 回到起始边 → 闭合
        const adv = nextAfter(din, cur, outs, over);
        if (adv == null) break;
        // 回到起始角点不算「重访」（下一步如果是起始边就是闭合，见上）；其它重复角点说明自触 → 在此收环
        if (adv !== a0 && seen.has(adv)) break;
        seen.add(adv); nxt = adv;
      }
      if (!closed) console.warn(`[星区] ${name} 的轮廓没有闭合，已跳过这一圈（数据可能异常）`);
      const clean = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
      if (clean.length >= 4 && Math.abs(ringArea(clean)) > 1e-12) rings.push(ring(clean));
    }
    // 走环方向与 (x,y) 里的手性相反（网格平面中是逆时针 → 平面上是顺时针）：
    // 外环反向一次即 RFC 7946 的「外环逆时针」，空腔反过来（顺时针）。当前数据没有空腔，
    // 但它是数据驱动的 —— 万一某星区被另一个星区整个包住，空腔必须挂到包住它的那个外环上。
    const outers = [], holes = [];
    rings.forEach(r => (ringArea(r) < 0 ? outers : holes).push(r));
    outers.sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)));
    const host = (h) => {
      const c = h.slice(0, -1).reduce((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0]).map(v => v / (h.length - 1));
      return outers.filter(o => inRing(c, o)).pop() || null;     // 最小的那个包住它的外环
    };
    const polys = outers.map(o => [o.slice().reverse()]);
    for (const h of holes) {
      const o = host(h), hr = h.slice().reverse();
      if (o) polys[outers.indexOf(o)].push(hr); else polys.push([hr]);   // 兜底：找不到宿主就当独立外环
    }
    return { type: "Feature", geometry: { type: "MultiPolygon", coordinates: polys },
             properties: { name, count: countBySector[name] || 0, color: ownerColorOf(name), fill: sectorFillOf(name) } };
  }));

  // 势力领土（近似凸包，仅非我方阵营绘制，作为大色块）
  // 势力凸包弃用：改用上面的星区轮廓直接上色（游戏/companion 的同一思路）
  const factionFC = fc([]);

  // 星区名不再绘制在地图上（改由左上角星区卡呈现，详见 showSectorCard）

  // 势力名（放在该阵营凸包质心，沿地图旋转）
  // 大字用中文：译名取自既有术语库 OWN_CN（与 HD2_Wiki/data/wiki/zh/factions.json 的 name_zh 同源）
  const factionLabelFC = fc(FACTION_KEYS.map(k => {
    const list = planets.filter(p => p.currentOwner === k);
    if (!list.length) return null;
    const cx = list.reduce((a, p) => a + p.position.x, 0) / list.length;
    const cy = list.reduce((a, p) => a + p.position.y, 0) / list.length;
    return { type: "Feature", geometry: pt(cx, cy),
             properties: { text: OWN_CN[k] || k, color: OWNER_COLOR[k], owner: k, n: list.length } };
  }).filter(Boolean));

  // 节点玩家数分级表达式（planet-core 半径用；0→0，12000→1）
  const PLAYER_T = ["interpolate", ["linear"], ["coalesce", ["get", "players"], 0],
    0, 0, 800, .22, 2500, .45, 6000, .75, 12000, 1];
  const resolvePlayersExpr = (tree) => JSON.parse(JSON.stringify(tree).replaceAll('["interp-players"]', JSON.stringify(PLAYER_T)));

  // 星球本体半径（与 planet-core 的 circle-radius 完全同源）。
  // 抽成常量后：图层直接复用，效果图标也能算出「星球实际多大」，
  // 从而把图标摆到星球**外面**而不是压在星球上（否则会挡掉 planet-core 的 hover）。
  const PLANET_R_BASE = 4.4,  PLANET_R_GAIN = 1.76;   // z4
  const PLANET_R_MID  = 10.12, PLANET_R_MID_GAIN = 3.96; // z9
  const PLANET_R_HI   = 24.2, PLANET_R_HI_GAIN = 8.8;  // z13
  const PLANET_RADIUS_EXPR = ["interpolate", ["linear"], ["zoom"],
    4,  ["+", PLANET_R_BASE, ["*", PLANET_R_GAIN,     ["interp-players"]]],
    9,  ["+", PLANET_R_MID,  ["*", PLANET_R_MID_GAIN, ["interp-players"]]],
    13, ["+", PLANET_R_HI,   ["*", PLANET_R_HI_GAIN,  ["interp-players"]]]];
  // 按 zoom 与玩家分级 t(0..1) 解出该星球的屏幕半径（px），与 MapLibre 的插值一致
  function planetRadiusPx(zoom, t) {
    const seg = (z, r, g) => r + g * t;
    if (zoom <= 4)  return seg(4, PLANET_R_BASE, PLANET_R_GAIN);
    if (zoom >= 13) return seg(13, PLANET_R_HI, PLANET_R_HI_GAIN);
    if (zoom <= 9) {
      const u = (zoom - 4) / 5;
      return seg(4, PLANET_R_BASE, PLANET_R_GAIN) * (1 - u) + seg(9, PLANET_R_MID, PLANET_R_MID_GAIN) * u;
    }
    const u = (zoom - 9) / 4;
    return seg(9, PLANET_R_MID, PLANET_R_MID_GAIN) * (1 - u) + seg(13, PLANET_R_HI, PLANET_R_HI_GAIN) * u;
  }
  // 该函数定义在 boot() 闭包内，而「星球信息卡」需要在 bindUI 里用它算卡片与星球的间距，
  // 故显式对外暴露一份（只此一个引用点，避免整段搬迁带来的回归风险）
  HD2SM_STATE.planetR = planetRadiusPx;

  // 战术空态：无任何战术目标时明确提示（避免误以为功能坏了）
  if (!Object.keys(TACBY).length && !$("tac-empty")) {
    const n = document.createElement("div");
    n.id = "hd2sm-tac-empty";
    n.innerHTML = "📭 当前无战术目标 —— 星图拓扑暂未形成可围攻局面，解放推进后自动出现";
    $("stage").appendChild(n);
  }

  // ---- 阴霾(The Gloom) / TCS+ 雾气 ----
  // 阴霾：effectId 1188(浓)/1193(边界) 的星球连成一片。
  // 早前用「凸包多边形 + fill-pattern」实现，问题有二：
  //   ① 多边形是直线边，fill 三角化后在内部留下可见折痕，观感生硬；
  //   ② 平铺贴图浓度均匀，缺少自然雾气的浓淡变化。
  // 现改为「大量重叠的软边圆斑」：以阴霾星球为骨架，再沿骨架线段与凸包外圈补点，
  // 每个点由多层不同半径/透明度的 circle-blur 叠加 —— 无硬边、无折痕，
  // 且重叠处自然变浓。三套不同尺度的点集叠加，进一步打散规则感。
  const GLOOM_IDS = new Set([1188, 1193]);
  const TCS_IDS   = new Set([1395]);
  const gloomPts = planets.filter(p => (p.activeEffects || []).some(e => GLOOM_IDS.has(e)))
                          .map(p => [p.position.x, p.position.y]);
  const rnd = (s) => { let x = Math.sin(s * 12.9898) * 43758.5453; return x - Math.floor(x); };

  function gloomBlobFC(step, jitter, ringN) {
    if (gloomPts.length < 2) return fc([]);
    const pts = gloomPts.slice();
    // 沿骨架线段按固定间距补点（step 为坐标单位），把孤立星球连成连续雾带
    for (let i = 0; i < gloomPts.length; i++) {
      for (let j = i + 1; j < gloomPts.length; j++) {
        const a = gloomPts[i], b = gloomPts[j];
        const d = Math.hypot(a[0]-b[0], a[1]-b[1]);
        if (d > step * 8) continue;                      // 只连接彼此较近的星球
        const n = Math.max(1, Math.round(d / step));
        for (let k = 1; k < n; k++) {
          const t = k / n;
          pts.push([a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t]);
        }
      }
    }
    // 凸包外圈按同间距补点，让边缘呈不规则消散而不是被"切"出来
    const hull = expandHull(convexHull(gloomPts), 1.06);
    for (let i = 0; i < hull.length; i++) {
      const a = hull[i], b = hull[(i+1) % hull.length];
      const d = Math.hypot(a[0]-b[0], a[1]-b[1]);
      const n = Math.max(1, Math.round(d / step) * ringN);
      for (let k = 0; k < n; k++) {
        const t = k / n;
        pts.push([a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t]);
      }
    }
    const cx = pts.reduce((s,p)=>s+p[0],0)/pts.length;
    const cy = pts.reduce((s,p)=>s+p[1],0)/pts.length;
    return fc(pts.map((p, i) => {
      const jx = (rnd(i*1.7+1) - 0.5) * step * jitter;
      const jy = (rnd(i*3.1+7) - 0.5) * step * jitter;
      return { type: "Feature",
               geometry: pt(p[0] + jx, p[1] + jy),
               properties: { v: +(0.6 + rnd(i*5.3+3) * 0.75).toFixed(3) } };
    }));
  }
  // 三套尺度（点距 = 半径的一半，保证相邻圆斑充分重叠、连成片）
  // 半径：wide 0.040 / main 0.030 / core 0.018 坐标单位 ≈ 阴霾范围的 10% / 7% / 4%
  const gloomWide = gloomBlobFC(0.040, 0.9, 2);
  const gloomMain = gloomBlobFC(0.030, 0.8, 2);
  const gloomCore = gloomBlobFC(0.018, 0.7, 1);

  const tcsFC = fc(planets.filter(p => (p.activeEffects || []).some(e => TCS_IDS.has(e)))
    .map(p => ({ type: "Feature", geometry: pt(p.position.x, p.position.y), properties: { idx: p.index } })));

  // ---- 4) 顶栏统计 ----
  const owners = {};
  planets.forEach(p => { owners[p.currentOwner] = (owners[p.currentOwner] || 0) + 1; });
  $("hdr").innerHTML =
    `<span><b>星球</b> ${planets.length}</span>` +
    FACTION_KEYS.map(k => `<span style="color:${OWNER_COLOR[k]}">${OWN_CN[k]} ${owners[k] || 0}</span>`).join("") +
    `<span style="color:var(--blue)"><b>战术目标</b> ${Object.keys(TACBY).length}</span>` +
    // 口径随「红虚线 = 只在入侵战役时出现」一起改：这里显示的就是图上真实在打的入侵数
    //（旧版显示 planet_attacks 全量 = 60+ 条跨阵营相邻对，"反攻 68" 与图上的 1 条红线对不上）
    `<span style="color:#E74C3C"><b>入侵</b> ${INVASIONS.length}</span>` +
    `<span><b>更新</b> ${(data.fetchedAt || "").slice(5, 16).replace("T", " ")}</span>`;

  // ---- 5) 地图 ----
  setMsg("正在部署星图图层…", "MapLibre GL · WebGL · 首帧渲染", 4);
  await nextPaint();
  maplibregl.setWorkerUrl(HD2SM_WORKER_URL);

  MAP = new maplibregl.Map({
    container: $("map"),
    // CJK（汉字/假名/谚文）由 MapLibre 用 canvas 2D + TinySDF 本地取字形，
    // 不请求字形 PBF —— 因此中文字形无需下载，复用上面的 @font-face 思源黑体。
    // 拉丁字符仍走 glyphs PBF（仅 3 个区间，共 ~238 KB）。
    localIdeographFontFamily: "'SourceHanSans','Microsoft YaHei','PingFang SC',sans-serif",
    style: {
      version: 8,
      name: "hd2-galaxy",
      glyphs: B + "js/libs/maplibre/fonts/{fontstack}/{range}.pbf",
      sources: {
        planets:    { type: "geojson", data: planetFC },
        supply:     { type: "geojson", data: supplyFC, lineMetrics: true },
        attack:     { type: "geojson", data: attackFC },
        sector:     { type: "geojson", data: sectorFC },
        faction:    { type: "geojson", data: factionFC },
        flabel:     { type: "geojson", data: factionLabelFC },
        gloomWide:  { type: "geojson", data: gloomWide },
        gloomMain:  { type: "geojson", data: gloomMain },
        gloomCore:  { type: "geojson", data: gloomCore },
        tcs:        { type: "geojson", data: tcsFC },
        heat:       { type: "geojson", data: heatFC },
      },
      layers: [
        // 背景交给 CSS 星空，不在此处填色
        { id: "bg", type: "background", paint: { "background-color": "rgba(0,0,0,0)" } },

        // TCS+：星球附近的小范围蓝色雾气（圆形软边）
        { id: "tcs-fog", type: "circle", source: "tcs",
          paint: {
            "circle-color": "rgba(96,165,250,.30)",
            "circle-blur": 1,
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 22, 8, 40, 12, 78],
            "circle-opacity": 0.85,
          } },
        { id: "tcs-ring", type: "circle", source: "tcs",
          paint: {
            "circle-color": "rgba(0,0,0,0)",
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 12, 8, 22, 12, 44],
            "circle-stroke-color": "rgba(147,197,253,.45)",
            "circle-stroke-width": 1,
            "circle-stroke-opacity": .7,
          } },

        // 星区：按该星区的主导阵营上色；**超级地球的星区不上底色**（fill 属性直接是透明色，
        // 见 sectorFillOf）。轮廓是「格子并集」的结果（逐格填充已弃用），
        // 所以填充边缘与下面的描边是同一条折线，不会裂缝。
        { id: "sector-fill", type: "fill", source: "sector",
          paint: { "fill-color": ["get", "fill"], "fill-opacity": .3, "fill-antialias": false } },
        // 描边跟着同一份轮廓走（游戏内观感：少量长直边 / 长弧，内部没有格线）
        { id: "sector-line", type: "line", source: "sector",
          paint: { "line-color": "rgba(235,242,250,.5)", "line-width": .9 } },

        // 势力领土（大色块）
        { id: "faction-fill", type: "fill", source: "faction",
          paint: { "fill-color": ["get", "color"], "fill-opacity": .085 } },
        { id: "faction-line", type: "line", source: "faction",
          paint: { "line-color": ["get", "color"], "line-width": 1.1, "line-opacity": .45 } },

        // 玩家热力（默认关）＝ **热成像风格**（2026-09-26 用户要求："按热成像的形式"）。
        // 视觉配方：冷（深蓝）→ 青 → 绿 → 黄 → 橙红 → 白热核心，alpha 随密度攀升。
        // 三条设计约束（改参数前先读）：
        //   ① 色带必须**从低密度就可见**：旧版第一档是 0.2 且 alpha 只有 .25，权重小的星球整片落空，
        //      整层看起来像没生效（见 §19.40）。现在 0.03 起就有 alpha .35。
        //   ② alpha 阶梯不能太急：热成像的"白热核心"只该出现在真热点上，否则整图糊成一片白、
        //      也会把底下的补给线/星球图标盖掉。
        //   ③ 图层顺序在补给线**下面**（本块位置）→ 热力不会遮住线与图标，只在地图底子上发光。
        { id: "heat", type: "heatmap", source: "heat", layout: { visibility: "none" },
          paint: {
            "heatmap-weight": ["get", "value"],
            "heatmap-intensity": 1.25,
            /* 热源半径 = **随人数放大**（2026-09-26 用户要求："把星球当成随人数变动的巨大热源；
               现在只能看见单个星球的热力，无法体现邻近星球或片区的热力"）。
               旧版半径只随 zoom 变（16/38/74）→ 星球之间不重叠 → 只能看到孤立的点。
               现在按**原始人数**给半径：0 人 → 110px 底噪，500 人 → 190px，5000 人 → 260px，
               30000 人（当前最大 42964）→ 330px。于是
                 · 邻星（间距通常几十~百余 px）的羽状体会**互相重叠**，融合成"片区"；
                 · 万人级战场铺成一大团热区，几百人的小战场只留小亮点（本快照人数中位仅 3 人，
                   p75 = 77、p90 = 554 → 绝大多数是小亮点，层次不会被抹平）。
               ⚠ 用**单个内插**（内插在 `players` 上）而不是"两个内插相乘"：后者虽然更精确，
               但网格/GPU 对嵌套表达式的支持面窄一些，而这里必须一次改对（本次会话的 WebGL 已不可用、
               无法本地回归验证，见 §19.42）。`heatmap-radius` 支持数据驱动表达式，单内插是标准写法。 */
            "heatmap-radius": ["interpolate", ["linear"], ["get", "players"],
              0, 110, 500, 190, 5000, 260, 30000, 330],
            "heatmap-opacity": .8,
            "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"],
              0,   "rgba(0,0,0,0)",
              .03, "rgba(20,60,160,.35)",     // 深蓝：刚有人的边缘
              .15, "rgba(0,150,200,.5)",      // 青
              .35, "rgba(0,200,120,.6)",      // 绿
              .55, "rgba(230,200,40,.72)",    // 黄
              .75, "rgba(240,120,30,.85)",    // 橙红
              .9,  "rgba(255,60,60,.92)",     // 红
              1,   "rgba(255,245,235,1)"],    // 白热核心
          } },

        // 补给线（全部边）：同阵营用本阵营暗色，跨阵营稍暗以让渐变层突出
        { id: "supply-base", type: "line", source: "supply",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": ["case", ["==", ["get", "cross"], 1], "rgba(255,255,255,.16)", ["get", "color"]],
            "line-width": ["interpolate", ["linear"], ["zoom"], 4, .8, 9, 1.9, 13, 4.6],
            "line-opacity": ["case", ["==", ["get", "cross"], 1], .5, .62],
          } },

        // 跨阵营渐变（我方蓝 → 阵营代表色）。
        // 注意：line-gradient 的色标**不是 data-driven**，不能在色标里用 ["case"]，
        // 故按「阵营 × 方向」显式生成 6 条同参图层（见下方 makeGradLayer）。
        ...SUPPLY_GRAD_LAYERS,

        // 入侵战役线：红色虚线（方向由 attack 源数据取反保证 = 入侵方 → 被入侵星球）
        { id: "attack-line", type: "line", source: "attack",
          layout: { "line-cap": "butt" },
          paint: {
            "line-color": "rgba(239,68,68,.85)",
            "line-width": ["interpolate", ["linear"], ["zoom"], 4, 1.2, 9, 2.2, 13, 4],
            "line-dasharray": [2, 1.6],
            "line-opacity": .8,
          } },

        // 节点投影（map 对齐 + 微下移，营造悬浮立体感）
        { id: "planet-shadow", type: "circle", source: "planets",
          paint: {
            "circle-pitch-alignment": "map",
            "circle-translate": [0, 1.6],
            "circle-color": "rgba(0,0,0,.5)",
            "circle-blur": .8,
            "circle-opacity": dim(1),
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 2.6, 9, 6.4, 13, 15.5],
          } },

        // 星球外发光（外层宽晕）
        { id: "planet-glow", type: "circle", source: "planets",
          paint: {
            "circle-color": ["get", "color"],
            "circle-blur": 1,
            "circle-opacity": dimZoom([[4, .14], [9, .26], [13, .38]]),
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 4.2, 9, 10.5, 13, 26],
          } },

        // 星球内发光（紧贴本体的亮晕，分层立体）
        { id: "planet-glow-in", type: "circle", source: "planets",
          paint: {
            "circle-color": ["get", "color"],
            "circle-blur": .5,
            "circle-opacity": dimZoom([[4, .2], [9, .34], [13, .5]]),
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 2.8, 9, 6.8, 13, 16],
          } },

        // 星球本体（半径按在线玩家数分级：0 → 基准，12000 → 玩家权重放大）
        // 半径 = 交互命中半径（MapLibre 的 circle 命中即该半径 + 描边/2 + clickTolerance），
        // 故 icon-size 一律按本层半径换算，改这里即可同时放大图标与 hover 区。
        { id: "planet-core", type: "circle", source: "planets",
          paint: {
            "circle-color": ["get", "color"],
            "circle-radius": PLANET_RADIUS_EXPR,
            "circle-opacity": dim(1),
            "circle-stroke-color": "rgba(0,0,0,.55)",
            "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 4, .6, 9, 1.2, 13, 1.8],
            "circle-stroke-opacity": dim(1),
          } },

        // 高人气星白环（玩家数 ≥ 2500）
        { id: "planet-hot", type: "circle", source: "planets",
          filter: [">", ["coalesce", ["get", "players"], 0], 2499],
          paint: {
            "circle-color": "rgba(0,0,0,0)",
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 4.5, 9, 9.5, 13, 27],
            "circle-stroke-color": "rgba(255,255,255,.45)",
            "circle-stroke-opacity": dim(1),
            "circle-stroke-width": 1,
          } },

        // 防御战红环
        { id: "planet-def", type: "circle", source: "planets",
          filter: ["==", ["get", "isDef"], 1],
          paint: {
            "circle-color": "rgba(0,0,0,0)",
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 5.5, 9, 11, 13, 28],
            "circle-stroke-color": "rgba(239,68,68,.85)",
            "circle-stroke-opacity": dim(1),
            "circle-stroke-width": 1.4,
          } },

        // 战术目标蓝环
        { id: "planet-tac", type: "circle", source: "planets",
          filter: [">", ["get", "tacCount"], 0],
          paint: {
            "circle-color": "rgba(0,0,0,0)",
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 6.5, 9, 12.5, 13, 30],
            "circle-stroke-color": "rgba(59,130,246,.9)",
            "circle-stroke-opacity": dim(1),
            "circle-stroke-width": 1.5,
          } },

        // 活动事件黄环
        { id: "planet-event", type: "circle", source: "planets",
          filter: ["==", ["get", "isEvent"], 1],
          paint: {
            "circle-color": "rgba(0,0,0,0)",
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 7.5, 9, 14, 13, 33],
            "circle-stroke-color": "rgba(245,197,24,.9)",
            "circle-stroke-width": 1.3,
            "circle-stroke-opacity": dim(.85),
          } },

        // 图标大小 = 星球本体直径（PNG 经 pixelRatio 归一化到 32px 基准，故 size = 半径/16），
        // 使图标与 hover/点击区严格一致；想整体缩放图标，只改 planet-core 的半径即可。
        { id: "planet-icon", type: "symbol", source: "planets",
          layout: {
            "icon-image": ["get", "icon"],
            "icon-size": ["interpolate", ["linear"], ["zoom"],
              4,  ["+", 0.275, ["*", 0.11, ["interp-players"]]],
              9,  ["+", 0.6325, ["*", 0.2475, ["interp-players"]]],
              13, ["+", 1.5125, ["*", 0.55, ["interp-players"]]]],
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
            "icon-anchor": "center",
            "icon-padding": 0,
          },
          paint: { "icon-opacity": dim(1) } },

        // 星球名标签（缩放到一定级别才显示）
        { id: "planet-label", type: "symbol", source: "planets",
          minzoom: 8.2,
          layout: {
            "text-field": ["coalesce", ["get", "nameCn"], ["get", "name"]],
            "text-font": ["NotoSansRegular"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 8.2, 10, 11, 12, 13, 14.5],
            "text-anchor": "top",
            "text-offset": [0, 1.1],
            "text-allow-overlap": false,
            "text-optional": true,
            "text-padding": 3,
          },
          paint: { "text-color": "rgba(226,232,240,.92)", "text-halo-color": "rgba(0,0,0,.85)", "text-halo-width": 1.3 } },

        // 星区中文名不再绘制在地图上（名称改由左上角星区卡显示，格式「XX星区」）

        // 势力名（沿地图旋转）
        { id: "flabel", type: "symbol", source: "flabel",
          layout: {
            "text-field": ["get", "text"],
            "text-font": ["NotoSansRegular"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 4, 13, 9, 23, 13, 52],
            "text-rotate": 0,
            "text-pitch-alignment": "map",
            "text-rotation-alignment": "map",
            "text-allow-overlap": true,
            "text-ignore-placement": true,
            "text-letter-spacing": .06,
          },
          paint: { "text-color": ["get", "color"], "text-opacity": .38, "text-halo-color": "rgba(0,0,0,.5)", "text-halo-width": 1.4 } },

        // 反攻方向箭头
        { id: "attack-arrow", type: "symbol", source: "attack",
          minzoom: 7.2,
          layout: {
            "symbol-placement": "line-center",
            "icon-image": "arrow-head",
            "icon-size": ["interpolate", ["linear"], ["zoom"], 7, .5, 12, 1.3],
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          } },

        // ---- 阴霾雾气：**置于星球之上**，让星球呈现「被淹没」的观感 ----
        // 三层叠加（外圈大而淡 → 中层 → 内层小而浓），靠重叠自然形成浓淡不均的雾团；
        // 全部使用 circle-blur 软边：无多边形、无折痕。
        // 半径按「坐标单位」校准后换算成屏幕像素 —— 实测本项目坐标系下
        // 1 单位 = 182px @z7，每 +1 级翻倍（z9=728、z10=1456、z13=11651）。
        // 目标半径：wide 0.040 / main 0.030 / core 0.018 单位（≈ 阴霾范围的 10%/7%/4%）。
        { id: "gloom-wide", type: "circle", source: "gloomWide",
          paint: {
            "circle-color": "rgba(206,160,24,.26)",
            "circle-blur": 1,
            "circle-opacity": ["*", 0.5, ["get", "v"]],
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, 7.3, 8, 14.6, 9, 29.1, 10, 58.2, 11, 116.5, 12, 233, 13, 466],
          } },
        { id: "gloom-main", type: "circle", source: "gloomMain",
          paint: {
            "circle-color": "rgba(228,180,30,.38)",
            "circle-blur": 1,
            "circle-opacity": ["*", 0.58, ["get", "v"]],
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, 5.5, 8, 10.9, 9, 21.8, 10, 43.7, 11, 87.4, 12, 174.7, 13, 349.5],
          } },
        { id: "gloom-core", type: "circle", source: "gloomCore",
          paint: {
            "circle-color": "rgba(244,204,58,.52)",
            "circle-blur": 1,
            "circle-opacity": ["*", 0.66, ["get", "v"]],
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, 3.3, 8, 6.6, 9, 13.1, 10, 26.2, 11, 52.4, 12, 104.8, 13, 209.7],
          } },
      // 统一解析 ["interp-players"] 占位符：凡 layout/paint 用到它的图层都替换为真实表达式。
      // 原先只对 planet-core 硬编码处理，新增图层（planet-icon 的 icon-size）复用该占位符后
      // 会残留未知表达式，MapLibre 判该属性非法 → 图层加载失败、map 的 load 事件永不触发，
      // 页面就永久停在「正在构建星图图层…」。改为遍历所有图层，杜绝同类问题。
      ].map((l) => {
        const out = { ...l };
        for (const key of ["paint", "layout"]) {
          if (!out[key]) continue;
          if (JSON.stringify(out[key]).includes('["interp-players"]')) out[key] = resolvePlayersExpr(out[key]);
        }
        return out;
      }),
    },
    center: HOME.center,
    zoom: HOME.zoom,
    pitch: HOME.pitch,
    bearing: HOME.bearing,
    minZoom: 3.2,
    maxZoom: 15,
    maxPitch: 70,
    minPitch: 0,
    maxBounds: [[-1.9, -1.7], [1.9, 1.75]],
    // 交互命中留白默认 3px（CSS px），会让可点区域明显大于可见星球；
    // 收窄到 1px，使点击/hover 判定贴近实际图标范围。
    clickTolerance: 1,
    dragRotate: true,
    pitchWithRotate: true,
    attributionControl: false,
    antialias: true,
    renderWorldCopies: false,
    fadeDuration: 120,
  });

  MAP.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showCompass: true }), "bottom-right");
  MAP.addControl(new maplibregl.ScaleControl({ maxWidth: 90, unit: "metric" }), "bottom-left");

  MAP.on("error", (e) => { if (e && e.error) console.warn("[MapLibre]", e.error.message || e.error); });

  // 加载兜底：map 的 load 事件若因样式/资源问题永不触发，页面会永久停在加载遮罩上
  // （2026-09 曾因 planet-icon 残留未解析的 ["interp-players"] 表达式而整页卡死）。
  // 这里加超时保护，把失败暴露出来而不是静默卡住。
  let mapLoaded = false;
  const loadGuard = setTimeout(() => {
    if (mapLoaded) return;
    failBoot("星图加载超时", "图层样式可能未通过校验，请查看控制台后刷新重试");
    console.error("[星图] map load 事件超时未触发 —— 请检查图层样式表达式是否合法");
  }, 60000);

  MAP.on("load", async () => {
    mapLoaded = true; clearTimeout(loadGuard);
    // 反攻箭头图标（SDF，可着色）
    // 说明：attack-arrow 图层里 "icon-image":"arrow-head" 是**静态字符串**，
    // MapLibre 在 load 之前的样式校验阶段就会去解析它，所以必须让图片尽早可用。
    // 这里把 data-URI 的解码 promise 也纳入 await；若它最终没解码出宽度，
    // 就用 canvas 画一个同样形状的三角形兜底 —— 保证箭头永远不会变成
    // 「Image "arrow-head" could not be loaded」而整层不渲染。
    try {
      const HEAD = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">' +
        '<path d="M2 3 L16 9 L2 15 L5.5 9 Z" fill="#fff"/></svg>';
      const img = new Image();
      img.referrerPolicy = "no-referrer";
      const ready = new Promise((res) => { img.onload = res; img.onerror = res; });
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(HEAD);
      if (img.decode) { try { await img.decode(); } catch (_) { /* 解码失败走下面的兜底 */ } }
      await ready;
      if (!MAP.hasImage("arrow-head")) {
        if (img.width) {
          MAP.addImage("arrow-head", img, { sdf: true });
        } else {
          const cv = document.createElement("canvas");
          cv.width = cv.height = 18;
          const cx = cv.getContext("2d");
          cx.fillStyle = "#fff";
          cx.beginPath();
          cx.moveTo(2, 3); cx.lineTo(16, 9); cx.lineTo(2, 15); cx.lineTo(5.5, 9);
          cx.closePath(); cx.fill();
          MAP.addImage("arrow-head", cx.getImageData(0, 0, 18, 18), { sdf: true });
          console.warn("[箭头] SVG 解码失败，已用 canvas 兜底绘制 arrow-head");
        }
      }
    } catch (e) { console.warn("[箭头] arrow-head 注册失败", e); }
    try { MAP.setPaintProperty("attack-arrow", "icon-color", "rgba(255,120,120,.95)"); } catch (_) {}

    // 星空贴图：raster 图层挂在最底层，随地图平移/缩放真实移动（真视差）
    try {
      MAP.addSource("stars-src", {
        type: "image",
        url: makeStarfieldTile(2048),
        coordinates: [[-2.6, 2.6], [2.6, 2.6], [2.6, -2.6], [-2.6, -2.6]],
      });
      MAP.addLayer({ id: "stars-raster", type: "raster", source: "stars-src",
        paint: { "raster-opacity": 1, "raster-resampling": "linear", "raster-fade-duration": 0 } }, "bg");
    } catch (e) { console.warn("[星空] raster 挂载失败", e); }

    // 星球图标改为后台渐进部署：核心地图先开放，未就绪的图标继续使用圆点。
    const files = [...new Set(planetFC.features.map(f => f.properties.icon).filter(Boolean))];
    let ok = 0, bad = 0;
    let repaintQueued = false;
    const requestIconRepaint = () => {
      if (repaintQueued) return;
      repaintQueued = true;
      requestAnimationFrame(() => {
        repaintQueued = false;
        if (MAP) MAP.triggerRepaint();
      });
    };
    (async () => {
      if (!files.length) {
        $("srcnote").textContent = "图标：未启用（纯色圆点渲染）";
        return;
      }
      $("srcnote").textContent = "图标：正在分批部署 " + files.length + " 个星球图标…";
      await pool(files, 6, async (file) => {
        const res = await loadPlanetIcon([ICON_URL[file], ICON_FALLBACK[file]].filter(Boolean));
        if (!res) { bad++; return; }
        try {
          if (!MAP.hasImage(file)) MAP.addImage(file, res.image, { pixelRatio: res.pixelRatio });
          ok++;
          requestIconRepaint();
        } catch (_) { bad++; }
      });
      $("srcnote").innerHTML =
        "图标命中 <b>" + ok + "</b> / 缺 <b>" + bad + "</b>（wiki.gg 直连优先，缺失回退主仓本地缓存，仍缺以纯色圆点显示）" +
        "<br>星球图标 © <a href='https://helldivers.wiki.gg/' target='_blank' rel='noopener noreferrer' style='color:var(--blue)'>helldivers.wiki.gg</a>（CC BY-NC-SA 4.0）";
      console.info("[图标] 命中", ok, "缺失", bad, "共", files.length);
    })().catch(e => {
      console.warn("[图标] 渐进部署中断", e);
      $("srcnote").textContent = "部分星球图标未能部署，已保留圆点显示";
    });

    // 等待地图样式更新后的下一帧再退场；不等待全部星球图标。
    await nextPaint();
    finishBoot();
    initFXLayer(planetFC);
  });

  /* ---- 星球效果图标浮层 ----
     把势力变种 / SEAF / DSS 等效果以小图标显示在星球旁边（参考 companion）。
     实现方式：HTML 浮层 + map.project() 投影，而不是 MapLibre symbol 图层 ——
     因为一个星球可能同时有多个效果，而 symbol 每要素只支持一个 icon-image。 */
  function initFXLayer(planetFC) {
    const raw = [];
    for (const f of planetFC.features) {
      const p = BYIDX[f.properties.index];
      if (!p || !p.position) continue;
      const list = fxOf(p);
      if (list.length) raw.push({ idx: f.properties.index, list });
    }
    // 预载图标并把「无本地图标的待补项」剔除，避免出现空框或占位后无内容
    return (async () => {
      const files = [...new Set(raw.flatMap(x => x.list.map(e => e.icon)))];
      for (const f of files) await effectIconMarkup(f);
      const missing = files.filter(f => !__fxsvg[f]);
      const fx = raw
        .map(x => ({ idx: x.idx, list: x.list.filter(e => __fxsvg[e.icon]) }))
        .filter(x => x.list.length);
      if (missing.length) console.info("[效果图标] 本地缺图（已跳过）:", missing.join(", "));
      if (!fx.length) {
        $("srcnote").innerHTML += "<br>效果图标：当前战局无可用图标的效果";
        return;
      }
      buildFXNodes(fx, PLAYER_T);
    })();
  }

  function buildFXNodes(fx, playerT) {
    const host = $("fx-layer");
    host.innerHTML = "";
    const MAXICON = 4;
    // 星球**左侧**：己方增益/设施 —— SEAF 驻守、DSS 本体（民主空间站）。
    // 星球**右侧**：敌军相关 —— 变种/子阵营、以及 DSS 的战术行动（飞鹰风暴等，属打击手段）。
    // 【2026-09 用户要求】DSS 相关图标一律靠左、且只有「已激活」的行动才出现。
    // 左侧 BUFF 列 = 己方增益：DSS 本体 + **DSS 战术行动（dss_*.svg）** + SEAF。
    // 原先把 DSS 战术行动归入右侧敌军列，导致「DSS 本体在左、它的效果在右」被拆开
    // （用户要求：DSS 效果与 DSS 同位于星球左侧）。
    const isBuff = e => /^dss/i.test(e.icon) || /seaf/i.test(e.icon);
    const nodes = fx.map(item => {
      const buffs = item.list.filter(isBuff);
      const effs  = item.list.filter(e => !isBuff(e));
      // 各自独立截断到 MAXICON；两侧都超出时用 +N 提示
      const shownL = buffs.slice(0, MAXICON);
      const shownR = effs.slice(0, MAXICON);
      const extraL = buffs.length - shownL.length;
      const extraR = effs.length - shownR.length;
      const mk = (arr, extra) => {
        const el = document.createElement("div");
        el.className = "fx-cluster";
        el.innerHTML = arr.map(e =>
          `<div class="fx-i" style="color:${e.color}" title="${esc(e.cn)}"></div>`).join("") +
          (extra > 0 ? `<div class="fx-more">+${extra}</div>` : "");
        host.appendChild(el);
        return el;
      };
      return {
        idx: item.idx,
        elL: buffs.length ? mk(shownL, extraL) : null,
        elR: effs.length ? mk(shownR, extraR) : null,
        nL: shownL.length + (extraL > 0 ? 1 : 0),
        nR: shownR.length + (extraR > 0 ? 1 : 0),
        shownL, shownR,
      };
    });
    // 图标已在 initFXLayer 预载并剔除缺图项，此处直接填充（同步，无空框）
    nodes.forEach(nd => {
      // 无法抵达(1190) 的星球：浮动效果图标与本体的 40% 不透明度保持一致
      const fxOp = HIDDEN_IDX.has(nd.idx) ? OPACITY_HIDDEN : 1;
      if (nd.elL) nd.elL.style.opacity = fxOp;
      if (nd.elR) nd.elR.style.opacity = fxOp;
      if (nd.elL) {
        const s = nd.elL.querySelectorAll(".fx-i");
        nd.shownL.forEach((e, i) => { const mk = __fxsvg[e.icon]; if (s[i] && mk) s[i].innerHTML = mk; });
      }
      if (nd.elR) {
        const s = nd.elR.querySelectorAll(".fx-i");
        nd.shownR.forEach((e, i) => { const mk = __fxsvg[e.icon]; if (s[i] && mk) s[i].innerHTML = mk; });
      }
    });

    // 位置同步：每帧重算屏幕坐标（星球少、元素少，成本可忽略）
    let rafId = 0, visible = true;
    const MINZ = 7.0;
    // 图标与间距随缩放同步缩小：星球本体半径是按屏幕像素算的（z7≈8.5px、z8.6≈13.6px），
    // 而 .fx-i 曾是固定 34px —— 低缩放下图标会盖住星球（用户截图可见）。
    // 这里把「图标盒 / 内部图 / 间距」统一成随 zoom 插值的 CSS 变量，
    // 由 sync() 按帧写入，各元素直接复用，不必逐个改样式。
    const FX_VARS = v => {
      host.style.setProperty("--fx-size", v.size + "px");
      host.style.setProperty("--fx-img", v.img + "px");
      host.style.setProperty("--fx-gap", v.gap + "px");
    };
    function fxScale(z) {
      let base;
      if (z >= 9)        base = { size: 30, img: 21, gap: 38 };
      else if (z <= 7.2) base = { size: 22, img: 15, gap: 28 };
      else {
        const t = (z - 7.2) / (9 - 7.2);          // 7.2..9 线性过渡
        const lerp = (a, b) => Math.round(a + (b - a) * t);
        base = { size: lerp(22, 30), img: lerp(15, 21), gap: lerp(28, 38) };
      }
      // 移动端（窄屏）图标再缩一档，避免多个图标横向挤在一起
      if (window.matchMedia("(max-width:767px)").matches) {
        const k = 0.8;
        base = { size: Math.round(base.size * k), img: Math.round(base.img * k), gap: Math.round(base.gap * k) };
      }
      return base;
    }
    let lastSize = 0;
    const place = (el, x, y) => {
      if (!el) return;
      el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%)`;
    };
    // 把某一侧的图标簇整体摆到星球**外面**：簇的近端留出 r + pad 的净距，
    // 远端再按簇宽补 offset，使簇的视觉中心落在外侧。这样图标不会压住星球，
    // 也不会吃掉 planet-core 的 hover/点击区（用户反馈的核心问题）。
    const SIDE_PAD = 7;
    const sideOffset = (n, r, sc) => (n <= 0 ? 0 : (r + SIDE_PAD) + (sc.size * n + 3 * (n - 1)) / 2);
    const playerTAt = (t, v) => {
      const pts = [[0, t[2]], [800, t[4]], [2500, t[6]], [6000, t[8]], [12000, t[10]]];
      if (v <= pts[0][0]) return pts[0][1];
      if (v >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
        if (v <= x1) return y0 + (y1 - y0) * (v - x0) / (x1 - x0);
      }
      return pts[pts.length - 1][1];
    };
    function sync() {
      rafId = 0;
      const z = MAP.getZoom();
      const on = z >= MINZ;
      if (on !== visible) { host.style.display = on ? "" : "none"; visible = on; }
      if (!on) return;
      const sc = fxScale(z);
      if (sc.size !== lastSize) { FX_VARS(sc); lastSize = sc.size; }
      for (const nd of nodes) {
        const p = BYIDX[nd.idx];
        if (!p || !p.position) continue;
        const pt = MAP.project([p.position.x, p.position.y]);
        const r = planetRadiusPx(z, playerTAt(playerT, p.players || 0));
        // 左侧放己方增益（SEAF / DSS 本体），右侧放敌军相关（变种 / DSS 战术行动）
        if (nd.elL) place(nd.elL, pt.x - sideOffset(nd.nL, r, sc), pt.y);
        if (nd.elR) place(nd.elR, pt.x + sideOffset(nd.nR, r, sc), pt.y);
      }
    }
    function schedule() { if (!rafId) rafId = requestAnimationFrame(sync); }
    MAP.on("move", schedule);
    MAP.on("zoom", schedule);
    MAP.on("resize", schedule);
    MAP.on("moveend", schedule);
    schedule();
  }

  bindUI(data, planets);
}

/* -------------------------------------------------------------- UI 交互 ---- */
function bindUI(data, planets) {
  const CIRCLED = (n) => Math.max(0, Math.min(255, Math.round(n)));
  const colorOf = (owner) => OWNER_COLOR[owner] || "#64748b";

  // 阵营筛选
  $("factions").innerHTML = FACTION_KEYS.map(k =>
    `<span class="chip on" data-f="${k}" style="color:${OWNER_COLOR[k]}">` +
    `<span class="dot" style="background:${OWNER_COLOR[k]}"></span>${OWN_CN[k]}</span>`).join("");
  $("factions").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip"); if (!chip) return;
    const k = chip.dataset.f;
    if (ACTIVE_FACTIONS.has(k)) { if (ACTIVE_FACTIONS.size === 1) return; ACTIVE_FACTIONS.delete(k); chip.classList.remove("on"); }
    else { ACTIVE_FACTIONS.add(k); chip.classList.add("on"); }
    applyFactionFilter();
  });

  // 图层开关（2026-09-26：用户要求删除「星球图标」这一项 → 它恒显示，不再出现在这里）
  const LAYER_LABEL = { territory:"领土/星区", supply:"补给线", attack:"反攻线", heat:"玩家热力", labels:"星球名" };
  $("layers").innerHTML = Object.keys(LAYER_ON).map(k =>
    `<span class="chip${LAYER_ON[k] ? " on" : ""}" data-l="${k}">${LAYER_LABEL[k]}</span>`).join("");
  $("layers").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip"); if (!chip) return;
    const k = chip.dataset.l;
    LAYER_ON[k] = !LAYER_ON[k];
    chip.classList.toggle("on", LAYER_ON[k]);
    applyLayerToggles();
  });

  // 视图模式
  const MODES = [
    ["galaxy",   "银河"],
    ["tactical", "战术"],
    ["region",   "区域"],
  ];
  let mi = 0;
  $("btn-mode").addEventListener("click", () => {
    mi = (mi + 1) % MODES.length;
    VIEW_MODE = MODES[mi][0];
    $("btn-mode").textContent = "视图：" + MODES[mi][1];
    applyViewMode();
  });

  $("btn-reset").addEventListener("click", () => {
    MAP.easeTo({ center: HOME.center, zoom: HOME.zoom, pitch: HOME.pitch, bearing: HOME.bearing, duration: 700 });
  });

  // 检索
  const q = $("q");
  const allNames = planets.map(p => ({ index: p.index, name: p.name || ("#" + p.index),
    nameCn: PL_CN[String(p.name || "").toUpperCase()] || "",
    owner: p.currentOwner, sector: p.sector || "", sectorCn: secCnByPlanet(p),
    lib: p.maxHealth > 0 ? (1 - p.health / p.maxHealth) * 100 : 0 }));
  let hitsTimer = null;
  q.addEventListener("input", () => { clearTimeout(hitsTimer); hitsTimer = setTimeout(renderHits, 130); });
  q.addEventListener("keydown", (e) => { if (e.key === "Enter") performSearch(q.value.trim()); });

  function renderHits() {
    const term = q.value.trim().toUpperCase();
    const box = $("hits");
    if (!term) { box.innerHTML = ""; return; }
    const list = allNames.filter(p =>
      p.name.toUpperCase().includes(term) ||
      (p.nameCn && p.nameCn.includes(q.value.trim())) ||
      (p.sector || "").toUpperCase().includes(term) ||
      (p.sectorCn && p.sectorCn.includes(q.value.trim()))).slice(0, 40);
    if (!list.length) { box.innerHTML = '<div class="muted" style="padding:4px 8px">无匹配</div>'; return; }
    box.innerHTML = list.map(p =>
      `<div class="hit" data-i="${p.index}"><span class="dot" style="background:${colorOf(p.owner)}"></span>` +
      `<span>${esc(p.nameCn || p.name)}</span><span class="own">${OWN_CN[p.owner] || p.owner || ""} · ${p.lib.toFixed(0)}%</span>` +
      // 内链：每个结果都能直接进资料页（2026-09-25）。点这一格不应触发行点击（focusPlanet）
      `<a class="hit-wiki" target="_blank" rel="noopener" href="${planetWikiUrl(p.index)}" title="打开中文维基星球页" ` +
      `onclick="event.stopPropagation()">📄</a></div>`).join("");
  }
  function performSearch(term) {
    if (!term) return;
    const p = allNames.find(x => x.name.toUpperCase() === term.toUpperCase())
           || allNames.find(x => x.name.toUpperCase().includes(term.toUpperCase()));
    if (p) focusPlanet(p.index);
  }
  $("hits").addEventListener("click", (e) => {
    const h = e.target.closest(".hit"); if (!h) return;
    focusPlanet(+h.dataset.i);
  });

  function focusPlanet(index) {
    const p = BYIDX[index]; if (!p || !p.position) return;
    MAP.flyTo({ center: [p.position.x, p.position.y], zoom: Math.max(MAP.getZoom(), 10.4), pitch: 46, duration: 900 });
    showDetail(index);
  }
  HD2SM_STATE.focusPlanet = focusPlanet;

  // hover tooltip
  const tip = $("tip");
  MAP.on("mousemove", "planet-core", (e) => {
    const f = e.features && e.features[0]; if (!f) return;
    const pr = f.properties;
    tip.innerHTML =
      `<div class="n">${esc(pr.nameCn || pr.name)}</div>` +
      `<div class="r">星区：<span>${esc(pr.sectorCn || pr.sector || "—")}</span></div>` +
      `<div class="r">归属：<span>${esc(pr.ownerCn)}</span></div>` +
      `<div class="r">解放度：<span>${pr.lib}%</span> · 玩家 <span>${fmt(pr.players)}</span></div>` +
      (pr.tacCount ? `<div class="r" style="color:#60a5fa">⚡ ${esc(pr.tacTitle)}</div>` : "") +
      `<div class="bar"><i style="width:${pr.lib}%"></i></div>`;
    tip.style.display = "block";
    const st = $("stage").getBoundingClientRect();
    const mob = window.matchMedia("(max-width:767px)").matches;
    let x, y;
    if (mob) {
      // 移动端跟随手指，并避开左上角星区卡
      x = Math.max(6, Math.min(st.width - 215, e.originalEvent.clientX - st.left - 102));
      y = Math.max(96, e.originalEvent.clientY - st.top + 18);
    } else {
      x = e.originalEvent.clientX - st.left + 15;
      y = e.originalEvent.clientY - st.top + 15;
      if (x + 265 > st.width) x = e.originalEvent.clientX - st.left - 275;
      if (y + 110 > st.height) y = e.originalEvent.clientY - st.top - 120;
    }
    tip.style.left = x + "px"; tip.style.top = y + "px";
    MAP.getCanvas().style.cursor = "pointer";
    showSectorCard(pr.sectorCn || pr.sector);
  });
  MAP.on("mouseleave", "planet-core", () => {
    tip.style.display = "none"; MAP.getCanvas().style.cursor = ""; hideSectorCard();
  });
  MAP.getCanvas().addEventListener("mouseleave", hideSectorCard);

  /* ---- 左上角星区卡：星区名 / 占领方 / 总解放度 / 阵营图标 ---- */
  let secToken = 0;
  function hideSectorCard() { secToken++; $("sector-card").classList.remove("on"); }
  // ⚠ 2026-09 修复「星区卡 22 个星区全都不显示」：
  //   SECTOR_IDX 的键取自 starmap.json 的**中文**星区名（SEC_BY_PLANET → v.system），
  //   而悬停/点击传进来的是 feature 的**英文** p.sector（如 "Barnard"），
  //   于是 SECTOR_IDX[sector] 恒为 undefined → 直接 hideSectorCard() 返回。
  //   中文名走既有映射表 SEC_CN（英文→中文，含 SECTOR_ALIASES 别名桥接，见 boot() 段）。
  //   只有 starmap 未收录、SECTOR_IDX 以英文名兜底建键的极少数星球才走第一个分支。
  function sectorEntryOf(sector) {
    if (sector == null) return null;
    return SECTOR_IDX[sector] || SECTOR_IDX[SEC_CN[String(sector).toUpperCase()]] || null;
  }
  async function showSectorCard(sector) {
    const s = sectorEntryOf(sector);
    if (!s) { hideSectorCard(); return; }
    const my = ++secToken, el = $("sector-card");
    const dominant = s.owner || "Humans";
    const color = OWNER_COLOR[dominant] || "#94a3b8";
    el.innerHTML =
      `<div class="ficon" style="color:${color}"></div>` +
      `<div style="flex:1;min-width:0">` +
        `<div class="sec-name">${esc(s.cn || sector)}星区</div>` +
        `<div class="presence" style="color:${color}">` +
          (s.owner ? `${esc(OWN_CN[s.owner] || s.owner)} 控制` : "交战区 · 多阵营") + `</div>` +
        `<div class="librow">总解放度 <b>${s.lib.toFixed(2)}%</b></div>` +
        `<div class="bar"><i style="width:${Math.max(0, Math.min(100, s.lib)).toFixed(2)}%"></i></div>` +
        `<div class="sub">${s.planets} 个星球</div>` +
        (s.races.length
          ? `<div class="enemy-row">` + s.races.map(r =>
              `<span class="enemy-chip" style="color:${colorOf(r)}">` +
                `<i class="dot"></i>${esc(OWN_CN[r] || r)}</span>`).join("") + `</div>`
          : "") +
      `</div>`;
    el.classList.add("on");
    const svg = await factionIconSVG(dominant);
    if (my !== secToken) return;                       // 已移开或切换到别的星区
    const slot = el.querySelector(".ficon");
    if (slot && svg) slot.innerHTML = svg;             // 失败则退化为空槽（仍保留文字信息）
  }

  // 点击星球：① 在星球正上方显示信息卡 ② 再次点击同一星球 → 轮盘
  // LAST_PLANET_CLICK：给下面的「点空白收起」用 —— 只要星球 handler 触发过，
  // 400ms 内的地图级 click 一律不许收起，避免两个 handler 互相打架（见下方说明）。
  let LAST_PLANET_CLICK = 0;
  MAP.on("click", "planet-core", (e) => {
    const f = e.features && e.features[0];
    if (!f) return;
    LAST_PLANET_CLICK = Date.now();
    const idx = f.properties.index;
    if (WHEEL_IDX === idx) { hideWheel(); return; }                       // 轮盘已开 → 收起
    if (PC_IDX === idx && $("planet-card").classList.contains("on")) {    // 二次点击 → 轮盘
      hidePlanetCard(); showWheel(idx); return;
    }
    hideWheel();
    showPlanetCard(idx);
    showSectorCard(f.properties.sectorCn || f.properties.sector);
  });
  // 点空白处收起。
  // ⚠ 2026-09-15 修复：原来用 `!e.features || !e.features.length` 判断空白 ——
  //   但 MapLibre 的**地图级** click 事件并不保证带 features，
  //   于是点星球时这个 handler 也会判定为空白并立刻收起卡片，
  //   表现为「点击星球毫无反应」（卡片刚进入异步渲染就被取消）。
  //   现在显式查询 planet-core 图层，只有确实没点到星球才收起。
  MAP.on("click", (e) => {
    if (Date.now() - LAST_PLANET_CLICK < 400) return;   // 刚点过星球 → 绝不收起
    let onPlanet = false;
    try {
      onPlanet = !!(e.point && MAP.queryRenderedFeatures(e.point, { layers: ["planet-core"] }).length);
    } catch (_) { onPlanet = true; }        // 查询异常时宁可不收起
    if (!onPlanet) { hidePlanetCard(); hideWheel(); }
  });
  // 地图移动时让卡片/轮盘跟随星球
  MAP.on("move", positionOverlays);
  MAP.on("zoom", positionOverlays);

  function showDetail(index) {
    const p = BYIDX[index]; if (!p) return;
    const lib = p.maxHealth > 0 ? ((1 - p.health / p.maxHealth) * 100).toFixed(2) : "—";
    const tags = TACBY[index] || [];
    const campaigns = (data.campaigns || []).filter(c => c.planet && c.planet.index === index);
    const camp = campaigns[0];
    const ev = (data.planet_events || []).find(x => x.planetIndex === index);
    const pCn = PL_CN[String(p.name || "").toUpperCase()] || "";
    const pSec = secCnByPlanet(p);
    // 行动变量：按 effectId 查 hd2_variables；作战限制(combat_restriction)显红色 Tag
    // 同一效果常有 基础 id 与 (Enemies) 变体 id 两个，故按**中文名去重**（与主站一致）
    const varSeen = {};
    const varHtml = (() => {
      const ids = [...new Set(p.activeEffects || [])]
        .filter(id => VAR_BY_EFFECT[id])
        .filter(id => { const n = VAR_BY_EFFECT[id].cn; if (varSeen[n]) return false; varSeen[n] = 1; return true; });
      if (!ids.length) return "";
      return `<div class="var-wrap"><div class="var-title">行动变量</div><div class="var-chips">` +
        ids.map(id => {
          const v = VAR_BY_EFFECT[id];
          return `<span class="var-chip${v.neg ? " neg" : ""}" title="${esc(v.desc || v.cn)}">` +
                 (v.neg ? `<span class="warn">⚠</span>` : "") + `${esc(v.cn)}</span>`;
        }).join("") + `</div></div>`;
    })();
    // 标题栏保持固定文案（面板标签），星球名只在下方正文出现一次，避免重复显示
    $("detailTitle").textContent = "📋 星球详情";
    $("detail").innerHTML =
      `<div style="display:flex;align-items:center;gap:8px;margin-bottom:2px">
         <span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:${colorOf(p.currentOwner)};flex-shrink:0"></span>
         <b style="font-size:.95rem">${esc(pCn || p.name || ("#" + index))}</b>
       </div>` +
      `<div class="kv">
         <div class="cell"><div class="k">归属</div><div class="v">${esc(OWN_CN[p.currentOwner] || p.currentOwner || "—")}</div></div>
         <div class="cell"><div class="k">解放度</div><div class="v">${lib}%</div></div>
         <div class="cell"><div class="k">在线玩家</div><div class="v">${fmt(p.players)}</div></div>
         <div class="cell"><div class="k">星区</div><div class="v">${esc(pSec)}</div></div>
         <div class="cell"><div class="k">抵抗值</div><div class="v">${p.resistance != null ? p.resistance : "—"}</div></div>
         <div class="cell"><div class="k">索引</div><div class="v">${p.index}</div></div>
       </div>` +
      (camp ? `<div style="margin-top:9px"><span class="tac">${camp.campaignType === "defense" ? "防御战役" : "解放战役"}</span>` +
              `<span class="tac">${OWN_CN[camp.faction] || camp.faction || ""}</span></div>` : "") +
      (ev ? `<div style="margin-top:9px"><span class="tac" style="border-color:rgba(245,197,24,.6);color:var(--yellow);background:rgba(245,197,24,.1)">活动事件</span>` +
            `<div class="tacTxt">进度 ${(ev.maxHealth > 0 ? (1 - ev.health / ev.maxHealth) * 100 : 0).toFixed(1)}%</div></div>` : "") +
      // 2026-09-25：行动变量 / 词条 / 维基链接这些「重内容」已搬到独立资料页 planet.html，
      // 侧栏只留一眼能看完的摘要 + 两个入口，避免右栏又变成信息堆（用户反馈的正是这个）。
      `<div class="pc-actions">` +
        `<a class="btn primary" target="_blank" rel="noopener" href="${planetWikiUrl(index)}">📄 中文维基</a>` +
        `<button class="btn" onclick="window.HD2StarMap.focusPlanet(${index})">🎯 聚焦</button>` +
      `</div>`;
  }

  /* ============================================================
     星球信息卡（2026-09-15）
     点击星球 → 在星球**正上方**显示信息卡；再次点击 → 轮盘。
     参考 helldiverscompanion.com/#map 的信息组织。
     「预估解放时间 / 解放速率 / 影响力」属**前端推演**：
       · 实测：同一会话内两次观测的差值（最可靠）
       · 推演：影响力公式估算，仅用于显示，**不写入任何数据文件、不改动抓取管线**
     ============================================================ */
  // 推演常数：**原值 32** 由一次自洽观测反推（施加 0.558 − 抵抗 0.31 ≈ 净 0.245，
  //   反代入 players=21608、impactMultiplier≈0.013、maxHealth=1.6e6 得 K≈32）。
  // ⚠ 2026-09-29 重新标定 32 → 90：影响系数已从 ≈0.013 涨到 ≈0.032，沿用 32 会让推演值
  //   整体偏小约 2.6 倍（足以把正在推进的星球判成「无法完成解放」）。方法：只取明显掉血的大战场，
  //   玩家侧(血/秒) = −ΔHealth/Δt + regenPerSecond ⇒ K = 3600 × 玩家侧 ÷ (players × impactMultiplier)
  //   实测 4 样本（idx 269, players≈17.6k, 系数≈0.032）K = 71.9/74.2/91.4/100.1，中位 82.8 → 取 90。
  //   三处必须同值：index.html / planet.html / 本文件。详见 §19.45。
  const LIB_RATE_K = 90;
  const PC_SNAP = {};              // {index:{t,lib}} 观测快照，供「实测」速率
  let PC_IDX = null, WHEEL_IDX = null, BIOME_IDX = null, BIOME_FB = null;

  const libPct = (p) => (p && p.maxHealth > 0) ? Math.max(0, Math.min(100, (1 - p.health / p.maxHealth) * 100)) : 0;
  const plCn   = (p) => PL_CN[String(p.name || "").toUpperCase()] || "";
  const secCn  = (p) => secCnByPlanet(p);

  /* ---- 星球下属区域：城市 / 超大型工厂（2026-09-24 demo）------------------
     三个来源：
       · 名字/类型/描述 —— tables/planet_regions.json（抓 wiki 的 Module:Data/PlanetStatistics）
       · 中文名        —— tables/planet_regions_zh.json（**游戏内解包官方中文名**，来源 绝地潜兵2游戏内文本-归类整理版-20261003.xlsx
                          的「归类总表 · UI/菜单文本」；只有 UNNAMED 与一条本地化未翻译的怪名查不到，回退上一轮译名）
       · 运行时进度    —— data.json 里每颗星球的 regions[]（companion warStatus.planetRegions）
     两者按**顺序**配对，顺序用 maxHealth ↔ 区域规模交叉验证（定居点 10 万 / 城镇 20 万 /
     城市 40 万 / 大城市 60 万；Automaton 超大型工厂单列，HP 100 万）。
     用 no-store 拉这两个静态表：文件小、变得少，且避免 force-cache 把一次边缘 404 钉在浏览器里（§19.20）。 */
  // ⚠ REGIONS / REGIONS_ZH 的声明在文件顶部（与 DATA/BYIDX 一起）—— 引导阶段就要赋值，
  //   写在这里会踩 let 的 TDZ（"Cannot access before initialization"）。
  const REGION_TYPE_ZH = { Settlement: "定居点", Town: "城镇", City: "城市", MegaCity: "大城市" };
  const REGION_HP = { Settlement: 100000, Town: 200000, City: 400000, MegaCity: 600000 };

  function regionTypeOf(r) {
    if (String((r || {}).region_type || "").toLowerCase() === "megafactory") return "Megafactory";
    return (r || {}).size || "";
  }
  function regionTypeLabel(r) {
    const t = regionTypeOf(r);
    return t === "Megafactory" ? "超大型工厂" : (REGION_TYPE_ZH[t] || t || "区域");
  }
  function regionLibPct(st, meta) {
    if (!st) return null;
    if (String(st.owner || "").toLowerCase() === "humans") return 100;
    const mh = st.maxHealth || REGION_HP[(meta || {}).size] || 0;
    if (!mh || st.health == null) return null;
    return Math.max(0, Math.min(100, 100 * (1 - st.health / mh)));
  }
  function regionRowHtml(o) {
    const pct = o.pct == null ? "—" : (o.pct >= 99.995 ? "100%" : o.pct.toFixed(2) + "%");
    const stars = o.stars ? "★".repeat(o.stars) : "";
    return `<button type="button" class="rg-row" data-rg="${o.i}">` +
      `<span class="rg-ico">${o.megafactory ? "🏭" : "🏙"}</span>` +
      `<span class="rg-name">${esc(o.zh || o.en || "区域 " + o.i)}${o.zh && o.en ? "<i>" + esc(o.en) + "</i>" : ""}</span>` +
      `<span class="rg-type">${esc(o.type)}${stars ? "<em>" + stars + "</em>" : ""}</span>` +
      `<span class="rg-lib">${pct}</span></button>${o.rules || ""}`;
  }
  function buildRegionsHtml(p, index) {
    if (!window.HD2Regions) return "<div class=region-rules>区域信息暂不可用</div>";
    const st = REGIONS[String(index)];
    if (!st || !st.regions || !st.regions.length) return "";
    const zhMap = REGIONS_ZH[String(index)] || {};
    // 己方星球在"无区域战役"时官方不再下发 regions[] → 逐条只能显示"—"；
    // 整颗星球都是我们的，故我方星球一律记 100%（有运行时数据时仍以运行时为准）。
    const ours = String(p.currentOwner || "").toLowerCase() === "humans";
    const pctOf = (live, meta) => {
      const v = regionLibPct(live, meta);
      return (v == null && ours) ? 100 : v;
    };
    // ⚠ **只列下属区域，不列"星球本体"那一行**（2026-09-24 用户反馈）：
    //   与星球同名的那条不是城市/工厂，把它标成「城市」是错的；而且星球自身的进度
    //   卡片上方已有进度条，再列一行只是重复。游戏面板确实列了它，但我们按用户口径去掉。
    const rows = st.regions.map((r, k) => regionRowHtml({
      i: k, type: regionTypeLabel(r),
      stars: { Settlement: 1, Town: 2, City: 3, MegaCity: 4 }[regionTypeOf(r)] || 0,
      megafactory: regionTypeOf(r) === "Megafactory",
      zh: zhMap[r.name] || "", en: r.name,
      pct: pctOf(HD2Regions.live(p, k), r),
      rules: HD2Regions.html(HD2Regions.info(p, k, r, DATA)),
    }));
    return `<div class="regions"><div class="rg-hd">🏙 区域 <b>${st.regions.length}</b>` +
      `<span class="rg-tip">城市 / 超大型工厂 · 点一行看详情</span></div>` +
      `<div class="rg-list">${rows.join("")}</div>` +
      `<div class="rg-detail" id="hd2sm-pc-rgdetail" hidden></div></div>`;
  }
  function regionDetailHtml(p, index, meta, k) {
    const live = HD2Regions.live(p, k);
    const zhMap = REGIONS_ZH[String(index)] || {};
    const pct = regionLibPct(live, meta);
    // 归属 = 当前控制方（运行时 owner；无运行时数据时退回 wiki 的静态 owner 字段）
    //   ⚠ 不要硬编「超级地球」：区域仍被敌方控制时（如 BRNO 3/4 已解放但控制方仍是终结族）
    //     那样会自相矛盾。解放进度另有一栏。
    const owner = (live && live.owner) ? (OWN_CN[live.owner] || live.owner)
                                       : (meta.owner || "—");
    return `<div class="rg-d-hd">${esc(zhMap[meta.name] || meta.name)}` +
        (zhMap[meta.name] ? `<i>${esc(meta.name)}</i>` : "") + `</div>` +
      `<div class="rg-d-meta"><span>类型 <b>${esc(regionTypeLabel(meta))}</b></span>` +
        `<span>归属 <b>${esc(owner)}</b></span>` +
        `<span>已解放 <b>${pct == null ? "—" : (pct >= 99.995 ? "100%" : pct.toFixed(2) + "%")}</b></span>` +
        (live && live.players ? `<span>玩家 <b>${fmt(live.players)}</b></span>` : "") + `</div>` +
      (meta.desc ? `<div class="rg-d-desc">${esc(meta.desc)}</div>` : "") +
      `<div class="rg-d-act">行动影响：完成此处的行动有助于解放这座城市，成功解放后将大幅推动星球解放进程。</div>` +
      (String(meta.region_type || "").toLowerCase() === "megafactory"
        ? `<div class="rg-d-act">⚠ 机器人超大型工厂：归类与城市不同，但解放机制相同。</div>` : "");
  }
  // 点某一行 → 在下方展开详情（数据都在内存里，不再回查）
  function bindRegionRows() {
    const card = $("planet-card");
    if (!card || card.__rgBound) return;
    card.__rgBound = true;
    card.addEventListener("click", (ev) => {
      const row = ev.target.closest ? ev.target.closest(".rg-row") : null;
      if (!row) return;
      ev.stopPropagation();                       // 别触发「点卡片打开轮盘」
      const idx = (PC_IDX != null) ? PC_IDX : (card.__pcIdx != null ? card.__pcIdx : null);
      const k = Number(row.getAttribute("data-rg"));   // data-rg = 区域下标（0 起；已无"星球本体"行）
      const p = BYIDX[idx], st = REGIONS[String(idx)] || {};
      const box = $("pc-rgdetail");
      if (!p || !box || !st.regions || !st.regions[k]) return;
      Array.prototype.forEach.call(card.querySelectorAll(".rg-row"),
        (x) => x.classList.toggle("on", x === row));
      if (box.__for === k && !box.hidden) { box.hidden = true; box.__for = null; return; }
      box.__for = k; box.hidden = false;
      box.innerHTML = regionDetailHtml(p, idx, st.regions[k], k);
    });
  }

  async function biomeImage(biome) {
    if (!biome) return null;
    if (BIOME_IDX === null) {
      try { BIOME_IDX = await (await fetch(B + "assets/biomes/index.json", { cache: "force-cache" })).json(); }
      catch (_) { BIOME_IDX = {}; }
    }
    const v = BIOME_IDX[biome];
    if (!v) return null;
    return typeof v === "string" ? v : (v.file || v.img || v.image || null);
  }
  // biome 名兜底：data.json 的 biome 只由 hd2dev 提供，它偶发失败（限流）时 273 颗星球会
  // 全部变空字符串；tables/planet_biomes.json（随仓库提交）按星球英文名兜底，环境图照常显示。
  async function biomeNameOf(p) {
    if (p.biome) return p.biome;
    if (BIOME_FB === null) {
      try { BIOME_FB = await (await fetch(B + "tables/planet_biomes.json", { cache: "force-cache" })).json(); }
      catch (_) { BIOME_FB = {}; }
    }
    return (BIOME_FB || {})[String(p.name || "").trim().toUpperCase()] || "";
  }

  // 解放速率（%/h）：优先实测（同会话两次观测差值），否则公式推演
  function rateOf(p) {
    const lib = libPct(p), s = PC_SNAP[p.index], now = Date.now();
    if (s && now - s.t >= 60000) {
      const dt = (now - s.t) / 3600000, dv = lib - s.lib;
      if (dt > 0.001) return { v: dv / dt, m: "实测" };
    }
    return { v: grossOf(p) - (p.resistance || 0), m: "推演" };
  }
  // 对该星球施加的影响力（总率，未扣抵抗），%/h
  function grossOf(p) {
    const imp = (DATA && DATA.impactMultiplier) || 0;
    return p.maxHealth > 0 ? (p.players || 0) * imp * LIB_RATE_K / p.maxHealth * 100 : 0;
  }
  // 预估解放时间：按当前净速率线性外推
  const ETA_MAX_H = 720;          // 30 天：超过它就不显示（战役以天计，1800 天这种数字是噪声）
  function etaOf(p) {
    const r = rateOf(p), left = 100 - libPct(p);
    if (!(r.v > 0.0005)) return null;
    const h = left / r.v;
    return h <= ETA_MAX_H ? h : null;
  }
  function fmtHours(h) {
    if (h == null) return "—";
    if (h >= 24) return Math.floor(h / 24) + "天 " + Math.round(h % 24) + "时";
    if (h >= 1)  return Math.floor(h) + "小时 " + Math.round((h % 1) * 60) + "分";
    return Math.max(1, Math.round(h * 60)) + "分";
  }

  function hidePlanetCard() { PC_IDX = null; const el = $("planet-card"); if (el) el.classList.remove("on"); }
  function hideWheel() { WHEEL_IDX = null; const w = $("wheel"); if (w) w.classList.remove("on"); }

  // 让卡片/轮盘跟随星球（地图移动、缩放时调用）
  /* ⚠ 2026-09-26：**移动端不写行内坐标**（用户反馈：手机卡片跑到左上角、渲染出界）。
     旧版无差别地给卡片写 left/top/transform，靠媒体查询用 !important 反压 —— 只要漏一项就会错位
     （实际就漏了 transform，卡片被 translate(-100%) 抬出屏幕）。
     现在按视口分流：窄屏交给 CSS 的底部抽屉（left/right/bottom 全由样式定），JS 一个字都不写；
     桌面端才写"贴星球正上方"的坐标。轮盘同理。 */
  function positionOverlays() {
    const narrow = window.matchMedia("(max-width:767px)").matches;
    const rfn = HD2SM_STATE.planetR;
    const off = Math.max(18, (typeof rfn === "function" ? rfn(MAP.getZoom(), 1) : 18) + 12);
    if (PC_IDX != null) {
      const p = BYIDX[PC_IDX], el = $("planet-card");
      if (p && p.position && el && el.classList.contains("on")) {
        if (narrow) {
          // 底部抽屉由 CSS 定位：清掉可能残留的行内值，避免 resize 跨断点后错位
          el.style.left = ""; el.style.top = ""; el.style.transform = "";
          el.style.maxHeight = ""; el.style.overflowY = "";
        } else {
          const pt = MAP.project([p.position.x, p.position.y]);
          const stage = $("stage");
          el.style.maxHeight = Math.max(80, stage.clientHeight - 16) + "px";
          el.style.overflowY = "auto";
          const left = Math.max(8, Math.min(stage.clientWidth - el.offsetWidth - 8, pt.x - el.offsetWidth / 2));
          const top = Math.max(8, Math.min(stage.clientHeight - el.offsetHeight - 8, pt.y - off - el.offsetHeight));
          el.style.left = left.toFixed(1) + "px";
          el.style.top = top.toFixed(1) + "px";
          el.style.transform = "none";
        }
      }
    }
    if (WHEEL_IDX != null) {
      const p = BYIDX[WHEEL_IDX], w = $("wheel");
      if (p && p.position && w && w.classList.contains("on")) {
        const pt = MAP.project([p.position.x, p.position.y]);
        /* 轮盘尺寸取自元素实际大小（桌面 186、移动端 CSS 缩到 160），
           并且它用 `transform:translate(-50%,-50%)` 居中 ⇒ left/top 是**中心点**。
           ⚠ 2026-09-26 修（用户反馈：移动端点星球后"选项轮盘出现位置错误"）：
             旧代码只写了中心点、**完全没有夹取边界**，移动端窄屏上轮盘有一半溢出屏幕外；
             而且底部抽屉此时占着下方，轮盘压在抽屉上、也被抽屉盖住。
           现在：① 夹取在舞台内；② 移动端把轮盘放到抽屉**上方**的可见区域（放不下就贴顶）。 */
        const wW = w.offsetWidth || 186, wH = w.offsetHeight || 186;
        const st = $("stage").getBoundingClientRect();
        const half = { x: wW / 2, y: wH / 2 };
        let cx = pt.x, cy = pt.y;
        // 移动端：若底部抽屉正显示，则把轮盘整体限制在抽屉上缘之上（留 8px 呼吸）
        // ⚠ 夹取的是**中心点**，所以上限还要再减掉半个高度 —— 首版忘了减，实测轮盘会压到抽屉上。
        if (narrow) {
          const card = $("planet-card");
          if (card && card.classList.contains("on")) {
            const cs = card.getBoundingClientRect();
            const limitCenterY = Math.max(half.y + 4, cs.top - st.top - 8 - half.y);
            if (cy > limitCenterY) cy = limitCenterY;
          }
        }
        cx = Math.max(half.x + 4, Math.min(st.width - half.x - 4, cx));
        cy = Math.max(half.y + 4, Math.min(st.height - half.y - 4, cy));
        w.style.left = cx.toFixed(1) + "px";
        w.style.top = cy.toFixed(1) + "px";
      }
    }
  }

  // 同步渲染核心信息（保证「点击必有反馈」），图片/图标随后异步补上
  // 剩余时长：18h 35m / 2d 3h（星图只用于防御战倒计时，保持短）
  function durTxt(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
    return d > 0 ? `${d}d ${h}h` : (h > 0 ? `${h}h ${m}m` : `${m}m`);
  }

  // 防御战（入侵）卡片：与主页 index.html 的 pcDefenseRace 同一套口径，
  // 视觉贴合星图（直角条 + 等宽数字 + 斜纹头）。
  // ⚠ P0 铁律（交接文档 §11.1-7）：双条**顺序固定为上=超级地球、下=入侵方**，
  //   且超级地球那条**恒为蓝**（不跟卡片威胁色走）。
  function defCardHtml(p, index, camp, owner, share, regionsHtml) {
    const atkF = String(camp.faction || "");
    const atkLabel = OWN_CN[atkF] || atkF || "敌方";
    const atkColor = FACTION_COLOR[atkF] || "#E74C3C";
    const atk = camp.attackersProgress != null ? Number(camp.attackersProgress) : null;
    const def = camp.defendersProgress != null ? Number(camp.defendersProgress) : null;
    const aR = camp.attackersRate;
    const forecast = window.HD2Forecast?.defense(camp) || { rate: null, win: null }, pace = forecast.rate;
    const st = forecast.win === true ? "优势" : forecast.win === false ? "劣势" : "数据不足";
    const cls = forecast.win === true ? "st-win" : forecast.win === false ? "st-lose" : "";
    const row = (label, pct, bg) => {
      const known = pct != null && isFinite(pct);
      const w = known ? Math.max(0, Math.min(100, pct)).toFixed(2) : "0.00";
      return `<div class="def-row"><span class="lbl">${esc(label)}</span>` +
             `<div class="track"><i style="width:${w}%;background:${bg}"></i></div>` +
             `<span class="val">${known ? Number(pct).toFixed(2) + "%" : "--"}</span></div>`;
    };
    return `<div class="hd"><span class="kind def">⚠ 防御战 · 入侵中</span>` +
        (camp.remainingTime ? `<span class="eta lose">⏳ ${durTxt(camp.remainingTime)}</span>` : "") +
      `</div>` +
      `<div class="title"><span class="ficon"></span><span class="names">` +
        `<span class="nm">${esc(plCn(p) || p.name || "#" + index)}</span>` +
        `<span class="sec">${esc(secCn(p))} 星区 · 归属 ${esc(OWN_CN[owner] || owner)}</span>` +
      `</span></div>` +
      `<div class="biome" id="hd2sm-pc-biome"><div class="noimg">载入生态图…</div></div>` +
      `<div class="buffs" id="hd2sm-pc-buffs"><span class="st2">载入增益…</span></div>` +
      `<div class="def-race">` +
        row("超级地球", def, "var(--c-humans)") +
        row(atkLabel, atk, atkColor) +
      `</div>` +
      `<div class="def-meta"><span>进攻 <b>${aR != null ? Number(aR).toFixed(3) : "--"}%</b>/h` +
        ` · 防守 <b>${pace != null ? pace.toFixed(3) : "--"}%</b>/h</span>` +
        `<span style="margin-left:auto">战况 <b class="${cls}">${esc(st)}</b></span></div>` +
      (window.HD2Forecast?.defenseHtml(camp, DATA, p) || "<div class=campaign-forecast>预测模块未加载</div>") +
      (camp.invasionLevel != null
        ? `<div class="def-meta"><span>⚔️ 入侵等级 <b>${esc(camp.invasionLevel)}</b></span>` +
          `<span>等级越高敌方兵力越强</span></div>` : "") +
      `<div class="stats">` +
        `<span class="st2">玩家 <b>${fmt(p.players)}</b> · 全服 <b>${share.toFixed(2)}%</b></span>` +
        `<span class="st2">血量 <b>${fmt(p.health)}</b>/${fmt(p.maxHealth)}</span>` +
      `</div>` +
      (regionsHtml || "") +
      `<div class="pc-actions">` +
        `<a class="btn primary" target="_blank" rel="noopener" href="${planetWikiUrl(index)}">📄 中文维基</a>` +
        `<button type="button" class="btn" data-act="wheel">🎡 轮盘</button>` +
      `</div>`;
  }

  function showPlanetCard(index) {
    const p = BYIDX[index]; if (!p) return;
    const el = $("planet-card"); if (!el) return;
    PC_IDX = index;
    const owner = p.currentOwner || "Humans";
    const color = colorOf(owner);
    const lib = libPct(p);
    const camp = (data.campaigns || []).find(c => c.planet && c.planet.index === index);
    // 防御战（入侵）判定：与主页 index.html 同一判据（campaignType=defense / eventType=1 / type=1|4）
    const isDef = !!camp && (String(camp.campaignType).toLowerCase() === "defense" ||
                             camp.eventType === 1 || camp.type === 1 || camp.type === 4);
    // 超级地球持有的星球：其 health 恒为满血（见主页 index.html 中同类注释），
    // 于是 (1-health/maxHealth) 会算出 0% —— 与「已解放」自相矛盾。
    // 这类星球一律按「已解放」呈现：战争性质=✓ 已解放（绿）、进度 100%、不显示速率。
    // ⚠ 但**正在被入侵的我方星球不在此列**（2026-09-24 用户报的正是这个：菁宿一/MEISSA
    //   明明在打防御战，卡片却写「✓ 已解放 100%」——那时的真实进度只存在于 campaign 里）。
    const humanOwned = String(p.currentOwner || "Humans").toLowerCase() === "humans";
    const showLiberated = humanOwned && !isDef;
    const libShow = showLiberated ? 100 : lib;
    const kind = isDef ? "⚠ 防御战 · 入侵中"
      : (showLiberated ? "✓ 已解放"
      : (camp ? (String(camp.campaignType).toLowerCase() === "defense" ? "入侵 · 防御战役" : "解放战役")
              : (p.attacking ? "遭受进攻" : "无战役")));
    const r = rateOf(p), eta = etaOf(p);
    const total = (data.player_distribution && data.player_distribution.total) || 0;
    const share = total > 0 ? (p.players || 0) / total * 100 : 0;
    const gross = grossOf(p);
    // 区域列表（城市/超大型工厂）：有数据的星球才渲染（demo，2026-09-24）
    const regionsHtml = buildRegionsHtml(p, index);
    // 外框/顶部色 = "谁在打这颗星球"（入侵方，威胁感）；条内颜色另算（超级地球恒蓝）——两者解耦（§11.1-7）
    el.classList.toggle("def", !!isDef);
    el.style.setProperty("--pc-color", isDef
      ? (FACTION_COLOR[String(camp.faction || "")] || "#E74C3C")
      : color);
    if (isDef) {
      el.innerHTML = defCardHtml(p, index, camp, owner, share, regionsHtml);
    } else {
    el.innerHTML =
      `<div class="hd"><span class="kind${showLiberated ? " ok" : ""}">${esc(kind)}</span>` +
        // 估不出来就不显示（净速率≤ 0 时无解放时间可言，不要占着右上角写「无法估算」）；
        // 已解放的星球不显示任何速率
        (showLiberated ? "" : (eta != null
          ? `<span class="eta">预估解放 ${fmtHours(eta)} · ${r.m}</span>`
          : (r.v < 0 ? `<span class="eta lose">▼ ${Math.abs(r.v).toFixed(3)}%/h · ${r.m}</span>` : ""))) +
      `</div>` +
      `<div class="title"><span class="ficon"></span><span class="names">` +
        `<span class="nm">${esc(plCn(p) || p.name || "#" + index)}</span>` +
        `<span class="sec">${esc(secCn(p))} 星区 · 归属 ${esc(OWN_CN[owner] || owner)}</span>` +
      `</span></div>` +
      `<div class="biome" id="hd2sm-pc-biome"><div class="noimg">载入生态图…</div></div>` +
      `<div class="buffs" id="hd2sm-pc-buffs"><span class="st2">载入增益…</span></div>` +
      `<div class="bar"><i style="width:${libShow.toFixed(2)}%"></i><span class="mk" style="left:${libShow.toFixed(2)}%"></span></div>` +
      `<div class="lib"><b>${libShow.toFixed(4)}%</b><span class="st">${showLiberated ? "已解放 · 超级地球控制中" : "已解放"}</span>` +
        (showLiberated ? "" :
        `<span class="rate" style="color:${r.v >= 0 ? "#1FA84A" : "#FF4D2E"}">` +
        `${r.v >= 0 ? "▲" : "▼"} ${Math.abs(r.v).toFixed(3)}% / h<span class="m">${r.m}</span></span>`) + `</div>` +
      `<div class="stats">` +
        `<span class="st2">玩家 <b>${fmt(p.players)}</b> · 全服 <b>${share.toFixed(2)}%</b></span>` +
        `<span class="st2">施加 <b>${gross.toFixed(3)}%</b>/h</span>` +
        `<span class="st2">抵抗度 <b>${p.resistance != null ? (+p.resistance).toFixed(2) + "%" : "—"}</b></span>` +
        `<span class="st2">血量 <b>${fmt(p.health)}</b>/${fmt(p.maxHealth)}</span>` +
      `</div>` +
      (showLiberated ? "" : window.HD2Forecast?.reinforcementHtml(DATA, p) || "") +
      regionsHtml +
      `<div class="pc-actions">` +
        `<a class="btn primary" target="_blank" rel="noopener" href="${planetWikiUrl(index)}">📄 中文维基</a>` +
        `<button type="button" class="btn" data-act="wheel">🎡 轮盘</button>` +
      `</div>`;
    }
    el.classList.add("on");
    el.__pcIdx = index;                 // 区域行点击时用它兜底（PC_IDX 可能已被别的监听清空）
    bindRegionRows();
    positionOverlays();
    PC_SNAP[index] = { t: Date.now(), lib: lib };     // 记录观测点，供下次「实测」
    decoratePlanetCard(index, owner, p);
  }

  // 异步装饰：势力图标 / 生态图 / 增益图标。任一失败都不影响卡片本体。
  async function decoratePlanetCard(index, owner, p) {
    const alive = () => PC_IDX === index && $("planet-card").classList.contains("on");
    try {
      const svg = await factionIconSVG(owner);
      if (alive() && svg) { const s = $("planet-card").querySelector(".ficon"); if (s) s.innerHTML = svg; }
    } catch (_) {}
    try {
      const bimg = await biomeImage(await biomeNameOf(p));
      if (alive()) {
        const s = $("planet-card").querySelector("#hd2sm-pc-biome");
        if (s) s.innerHTML = bimg ? `<img src="https://jerry114514.github.io/HD2-Galatic_war-Map/assets/biomes/${esc(bimg)}" alt="${esc(p.biome || "")}" loading="lazy">`
                                  : `<div class="noimg">${esc(p.biome || "未知生态")}（无图）</div>`;
      }
    } catch (_) {}
    try {
      const buffs = (typeof fxOf === "function" ? fxOf(p) : []).slice(0, 10);
      const html = (await Promise.all(buffs.map(async b => {
        try {
          const ic = await effectIconMarkup(b.icon);
          return ic ? `<span class="bi" style="color:${b.color || "#94a3b8"}" title="${esc(b.cn || "")}">${ic}</span>` : "";
        } catch (_) { return ""; }
      }))).join("");
      if (alive()) {
        const s = $("planet-card").querySelector("#hd2sm-pc-buffs");
        if (s) s.innerHTML = html || `<span class="st2">无星球增益 / 减益</span>`;
      }
    } catch (_) {}
    if (alive()) positionOverlays();
  }

  /* ---- 轮盘：上=星球详细信息，下=DSS 效果，中心=关闭 ---- */
  function showWheel(index) {
    const p = BYIDX[index]; if (!p || !p.position) return;
    const w = $("wheel"); if (!w) return;
    WHEEL_IDX = index;
    const R = 84, CX = 90, CY = 90;
    w.innerHTML =
      `<svg viewBox="0 0 180 180">` +
        `<g class="sect" data-act="detail">` +
          `<path d="M${CX - R} ${CY} A${R} ${R} 0 0 1 ${CX + R} ${CY} Z"/>` +
          `<text x="${CX}" y="${CY - 44}" text-anchor="middle">星球详细信息</text>` +
          `<text class="sub" x="${CX}" y="${CY - 31}" text-anchor="middle">PLANET DATA</text>` +
        `</g>` +
        `<g class="sect" data-act="dss">` +
          `<path d="M${CX - R} ${CY} A${R} ${R} 0 0 0 ${CX + R} ${CY} Z"/>` +
          `<text x="${CX}" y="${CY + 48}" text-anchor="middle">DSS 效果</text>` +
          `<text class="sub" x="${CX}" y="${CY + 61}" text-anchor="middle">DEMOCRACY SPACE STATION</text>` +
        `</g>` +
        `<g class="ctr" data-act="close">` +
          `<circle cx="${CX}" cy="${CY}" r="27"/>` +
          `<text x="${CX}" y="${CY - 2}">OPTIONS</text>` +
          `<text x="${CX}" y="${CY + 10}">CLOSE</text>` +
        `</g>` +
      `</svg>`;
    w.classList.add("on");
    positionOverlays();
    w.querySelectorAll("[data-act]").forEach(g => {
      g.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const act = g.getAttribute("data-act");
        hideWheel();
        if (act === "detail") { window.open(planetWikiUrl(index), "_blank", "noopener"); }
        else if (act === "dss") { window.open(WIKI_ZH_BASE + encodeURIComponent("民主空间站"), "_blank", "noopener"); }
      });
    });
  }
  function openAside() { ROOT.classList.remove("aside-collapsed"); }
  HD2SM_STATE.dbg = { showPlanetCard, showWheel, rateOf, PC_SNAP, MAP };   // 自检/调试句柄（不再污染 window）
  // 点信息卡本身也打开轮盘
  (function bindCardClick() {
    const el = $("planet-card");
    if (!el) return;
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      // ⚠ 卡片里的「📄 完整资料」是 <a>：要让浏览器照常跳转，别被这里拦住去开轮盘
      if (ev.target && ev.target.closest && ev.target.closest("a")) return;
      // ⚠ 区域行（.rg-row）的点击由 bindRegionRows 处理，**必须在这里让路**：
      //   两个监听挂在同一个元素上，本监听注册更早 → 先执行；它会 hidePlanetCard()（把 PC_IDX 清空）
      //   并打开轮盘，于是区域处理器再跑时 PC_IDX 已是 null，静默 return —— 表现就是"点行没反应"。
      if (ev.target && ev.target.closest && ev.target.closest(".rg-row")) return;
      if (PC_IDX == null) return;
      const i = PC_IDX; hidePlanetCard(); showWheel(i);
    });
  })();

  /* ---- DSS 效果面板：复用主页 DSS 区块的数据（捐献进度取 cost[0].current / target）---- */
  function showDssPanel(index) {
    const p = BYIDX[index]; if (!p) return;
    const box = $("detail"), title = $("detailTitle");
    if (!box) return;
    const dss = DATA && DATA.dss;
    if (title) title.textContent = "🛰️ DSS 效果";
    const head = `<div style="font-size:.8rem;color:var(--yellow);margin-bottom:6px">🛰️ 民主空间站 · ${esc(plCn(p) || p.name || "")}</div>`;
    const tail = `<div style="margin-top:9px"><button class="btn" style="width:100%;font-size:.74rem" onclick="window.HD2StarMap.focusPlanet(${index})">🎯 聚焦到该星球</button></div>`;
    if (!dss || dss.planetIndex !== index) {
      box.innerHTML = head + `<div class="muted">民主空间站当前<strong>未停靠</strong>在该星球。</div>` + tail;
      return;
    }
    const ST = { 1: ["募捐中", "#f5c518"], 2: ["已激活", "#1FA84A"], 3: ["冷却中", "#FF4D2E"] };
    const acts = (dss.tacticalActions || []).filter(ta => [1, 2, 3].includes(ta.status));
    const rows = acts.map(ta => {
      const meta = (ta.effectIds || []).includes(1425) ? DSS_ACTION_ICON[1425] : (DSS_ACTION_ICON[(ta.effectIds || [])[0]] || {});
      const s = ST[ta.status] || ["未知", "#94a3b8"];
      const prog = HD2DssDonations.progress(ta);
      return `<div style="margin:6px 0;padding:6px 8px;border:1px solid var(--line-2);background:#0D0D0D">` +
        `<div style="display:flex;align-items:center;gap:6px">` +
          `<span style="color:${s[1]};font-size:.64rem;font-family:var(--font-mono)">${s[0]}</span>` +
          `<strong style="font-size:.78rem;color:var(--text)">${esc(meta.cn || ta.name || "战术行动")}</strong>` +
          (prog != null ? `<span style="margin-left:auto;font-family:var(--font-mono);font-size:.7rem;color:var(--text-dim)">${prog.toFixed(1)}%</span>` : "") +
        `</div>` +
        (prog != null ? `<div style="height:5px;background:#1A1A1A;margin-top:5px"><i style="display:block;height:100%;width:${prog.toFixed(1)}%;background:${s[1]}"></i></div>` +
          `<div class="muted" style="margin-top:3px">募捐进度 ${prog.toFixed(1)}%</div>` : "") +
        `<div class="muted" style="margin-top:3px">${esc(HD2DssDonations.resourceLines(ta).join("；"))}</div>` +
      `</div>`;
    }).join("");
    box.innerHTML = head +
      `<div class="muted">行动 ${acts.length} 项 · 数据与主页「民主空间站 / DSS」区块同源。</div>` +
      `<div class="muted" style="margin-top:4px">${esc(HD2DssDonations.snapshotLabel(dss))}</div>` +
      (rows || `<div class="muted" style="margin-top:6px">暂无战术行动数据</div>`) +
      tail;
  }

  /* ---- 筛选 / 图层 / 视图 的实际生效 ---- */
  function ownerFilterExpr() {
    const list = [...ACTIVE_FACTIONS];
    return ["in", ["get", "owner"], ["literal", list]];
  }
  function setLayerVis(id, on) {
    try { MAP.setLayoutProperty(id, "visibility", on ? "visible" : "none"); } catch (_) {}
  }
  function applyFactionFilter() {
    const f = ownerFilterExpr();
    for (const id of ["planet-shadow", "planet-glow", "planet-glow-in", "planet-core", "planet-hot", "planet-def", "planet-tac", "planet-event", "planet-icon", "planet-label"]) {
      try { MAP.setFilter(id, id === "planet-def" ? ["all", f, ["==", ["get", "isDef"], 1]]
                        : id === "planet-tac" ? ["all", f, [">", ["get", "tacCount"], 0]]
                        : id === "planet-event" ? ["all", f, ["==", ["get", "isEvent"], 1]]
                        : f); } catch (_) {}
    }
  }
  /* ⚠ 2026-09-26 修（用户反馈：图层列表里只有「补给线」能用）：
     旧写法第二行是 `for (const l of SUPPLY_GRAD_LAYERS) ...`，而 `SUPPLY_GRAD_LAYERS` 在运行时
     取不到（实测抛 `ReferenceError: SUPPLY_GRAD_LAYERS is not defined`，行号正指向这一行）。
     它在同一个脚本里明明是顶层 `const` —— 但**不管原因是什么，这里都不该依赖它**：
     函数一旦抛出，后面 9 个 setLayerVis 全部不执行 → 表现就是"点其它按钮没反应、只有补给线生效"
     （补给线是**第一行**，它已经生效了才轮到崩）。
     现在改成"从地图自己的图层表里挑 supply-grad-* 前缀"，自洽、不依赖外部声明，
     以后再加渐变图层也自动覆盖；并给每个图层单独 catch，**任何一个失败都不再中断其余开关**。 */
  function applyLayerToggles() {
    if (!MAP || !MAP.getStyle || !MAP.getStyle()) return;    // 地图尚未就绪：别抛错，等下次
    // 补给线：1 条实线基底 + 全部跨阵营渐变层（按 id 前缀取，见上）
    setLayerVis("supply-base", LAYER_ON.supply);
    let gradIds = [];
    try { gradIds = MAP.getStyle().layers.map(l => l.id).filter(id => id.indexOf("supply-grad-") === 0); } catch (_) {}
    for (const id of gradIds) setLayerVis(id, LAYER_ON.supply);
    setLayerVis("attack-line", LAYER_ON.attack);
    setLayerVis("attack-arrow", LAYER_ON.attack);
    setLayerVis("sector-fill", LAYER_ON.territory);
    setLayerVis("sector-line", LAYER_ON.territory);
    setLayerVis("faction-fill", LAYER_ON.territory);
    setLayerVis("faction-line", LAYER_ON.territory);
    setLayerVis("flabel", LAYER_ON.territory);
    // 星球图标已从图层列表移除（用户要求）→ 恒显示，不再受开关控制
    setLayerVis("planet-icon", true);
    setLayerVis("planet-label", LAYER_ON.labels);
    setLayerVis("heat", LAYER_ON.heat);
  }
  function applyViewMode() {
    if (VIEW_MODE === "galaxy") {
      LAYER_ON.territory = true; LAYER_ON.labels = true; LAYER_ON.heat = false; LAYER_ON.attack = true;
    } else if (VIEW_MODE === "tactical") {
      LAYER_ON.territory = false; LAYER_ON.labels = true; LAYER_ON.heat = false; LAYER_ON.attack = true;
    } else {
      LAYER_ON.territory = true; LAYER_ON.labels = false; LAYER_ON.heat = true; LAYER_ON.attack = false;
    }
    // 同步 chip 状态
    $("layers").querySelectorAll(".chip").forEach(c => c.classList.toggle("on", !!LAYER_ON[c.dataset.l]));
    applyLayerToggles();
  }

  applyFactionFilter();

  /* ---- 可收缩侧栏（桌面：折叠为窄边条；移动端：右侧抽屉 + 点地图关闭） ---- */
  const isMobile = () => window.matchMedia("(max-width:767px)").matches;
  const setAside = (collapsed) => {
    ROOT.classList.toggle("aside-collapsed", collapsed);
    requestAnimationFrame(() => { if (MAP) MAP.resize(); });
  };
  $("aside-collapse").addEventListener("click", () => setAside(true));
  $("aside-rail").addEventListener("click", () => setAside(false));
  // 移动端抽屉遮罩：点遮罩收起（与点地图收起同义，但遮罩本身不拦截地图拖动之外的区域）
  $("aside-backdrop").addEventListener("click", () => setAside(true));
  $("aside-toggle").addEventListener("click", () =>
    setAside(!ROOT.classList.contains("aside-collapsed")));
  // 侧栏手风琴（2026-09-25）：点标题展开/收起。检索/阵营筛选/图层在 markup 里默认 .collapsed
  // ——用户的要求是"保留这三栏滤镜，但不默认展开"，把版面让给地图。
  ROOT.querySelectorAll("aside .sec > h2").forEach((h) => {
    h.addEventListener("click", () => {
      const sec = h.parentElement;
      if (sec) sec.classList.toggle("collapsed");
    });
  });
  // 移动端：抽屉打开时，在「地图画布」上按下即收起（不误伤侧栏内输入框与图层开关）
  $("stage").addEventListener("pointerdown", (e) => {
    if (isMobile() && !ROOT.classList.contains("aside-collapsed") && e.target.closest("#hd2sm-map"))
      setAside(true);
  }, { passive: true });
}

/* ============================================================
   挂载 API
   ============================================================ */
var DOM_HTML = "<header>\n  <h1>🌌 银河星图</h1>\n  <span class=\"tag v2\">实时战况 · 3D</span>\n  <div class=\"stats\" id=\"hd2sm-hdr\"></div>\n  <button id=\"hd2sm-aside-toggle\" title=\"侧栏\">☰</button>\n  <button id=\"hd2sm-btn-reset\">重置视角</button>\n  <button id=\"hd2sm-btn-mode\">视图：银河</button>\n  <a class=\"btn opt\" target=\"_blank\" rel=\"noopener noreferrer\" href=\"https://jerry114514.github.io/HD2-Galatic_war-Map/index.html\">← 战况面板</a>\n  <a class=\"btn opt\" target=\"_blank\" rel=\"noopener noreferrer\" href=\"https://jerry114514.github.io/HD2-Galatic_war-Map/tech.html\">🛠️ 技术详解</a>\n  <button id=\"hd2sm-aside-collapse\" title=\"收起侧栏\">▶</button>\n</header>\n\n<main>\n  <div id=\"hd2sm-stage\">\n    <canvas id=\"hd2sm-stars\"></canvas>\n    <div id=\"hd2sm-map\"></div>\n    <div id=\"hd2sm-tip\"></div>\n    <div id=\"hd2sm-sector-card\"></div>\n    <div id=\"hd2sm-fx-layer\"></div>\n    <div id=\"hd2sm-planet-card\"></div>\n    <div id=\"hd2sm-wheel\"></div>\n    <div id=\"hd2sm-boot\">\n      <div class=\"boot-visual\" aria-hidden=\"true\"><div class=\"boot-frame\">\n        <img class=\"emblem\" src=\"https://jerry114514.github.io/HD2-Galatic_war-Map/assets/ui-icons/super_earth_flag.svg\" alt=\"\" decoding=\"async\">\n        <span class=\"scan-line\"></span>\n      </div></div>\n      <div class=\"boot-stage\" aria-hidden=\"true\"><span class=\"stage-code\">UPLINK</span><span class=\"stage-count\">01 / 04</span></div>\n      <div class=\"segments\" data-mode=\"determinate\" aria-hidden=\"true\"><i class=\"current\"><b></b></i><i><b></b></i><i><b></b></i><i><b></b></i><i><b></b></i><i><b></b></i><i><b></b></i><i><b></b></i><i><b></b></i><i><b></b></i></div>\n      <div class=\"msg\" id=\"hd2sm-bootmsg\"><span class=\"line\" role=\"status\" aria-live=\"polite\">正在建立银河链路…</span><small class=\"sub\">MapLibre · 中文字体 · 战况数据</small><small class=\"lore\" aria-hidden=\"true\"></small></div>\n    </div>\n  </div>\n  <div id=\"hd2sm-aside-backdrop\"></div>\n  <div id=\"hd2sm-aside-rail\" title=\"展开侧栏\"><span>◀</span></div>\n\n  <aside>\n    <section class=\"sec collapsed\">\n      <h2>🔍 检索</h2>\n      <div class=\"card\">\n        <input class=\"search\" id=\"hd2sm-q\" type=\"search\" placeholder=\"输入星球名…（如 CHOOHE / 海尔迈尔）\" autocomplete=\"off\">\n        <div id=\"hd2sm-hits\" style=\"margin-top:8px\"></div>\n      </div>\n    </section>\n\n    <section class=\"sec collapsed\">\n      <h2>🎛️ 阵营筛选</h2>\n      <div class=\"card\"><div class=\"chips\" id=\"hd2sm-factions\"></div></div>\n    </section>\n\n    <section class=\"sec collapsed\">\n      <h2>🗂️ 图层</h2>\n      <div class=\"card\"><div class=\"chips\" id=\"hd2sm-layers\"></div></div>\n    </section>\n\n    <section class=\"sec\">\n      <h2 id=\"hd2sm-detailTitle\">📋 星球详情</h2>\n      <div class=\"card\" id=\"hd2sm-detail\">\n        <div class=\"muted\">点星球 → 星球上方弹出信息卡（手机上是从底部滑出的抽屉）；\n          卡里点「📄 完整资料」进入独立资料页（解放度/战役/区域/统计/环境/补给线都在那页）。<br>\n          滚轮缩放 · 拖拽平移 · 右键拖拽旋转/倾斜。</div>\n      </div>\n    </section>\n\n    <section class=\"sec\">\n      <h2>📖 图例</h2>\n      <div class=\"card legend\">\n        <div><i style=\"background:var(--c-humans)\"></i>超级地球</div>\n        <div><i style=\"background:var(--c-terminids)\"></i>终结族</div>\n        <div><i style=\"background:var(--c-automaton)\"></i>机器人</div>\n        <div><i style=\"background:var(--c-illuminate)\"></i>光能者</div>\n        <div><span class=\"ln\" style=\"border-color:rgba(239,68,68,.8)\"></span>入侵战役（箭头=入侵方方向）</div>\n        <div><span class=\"ln\" style=\"border-image:linear-gradient(90deg,#5BA3D0,#f59e0b) 1\"></span>我方蓝 → 敌方阵营色</div>\n        <div><i style=\"border:2px solid var(--blue);background:none\"></i>战术目标星球</div>\n        <div><span class=\"ln\" style=\"border-image:linear-gradient(90deg,#143ca0,#0096c8,#00c878,#e6c828,#f07820,#ff3c3c,#fff5eb) 1\"></span>玩家热力：冷 → 白热（**相对**密度，非人数刻度）</div>\n      </div>\n    </section>\n    <div class=\"muted\" id=\"hd2sm-srcnote\"></div>\n  </aside>\n</main>\n\n";

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
