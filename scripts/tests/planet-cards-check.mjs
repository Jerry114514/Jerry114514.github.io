// 主页星球卡：行动变量图标层 + 统一折叠区 的静态回归检查。
// 跑法：node scripts/tests/planet-cards-check.mjs
//
// 覆盖的是**能离线验证的行为**：徽标去重/排序/短标签/名额溢出、图标映射与
// galaxy-map-v2.html 的一致性、主页专属补充图标的素材存在性与 DSS 映射对齐、
// 统一折叠区（一次展开同时给城市列表与星球详情）、收起提示的开放判据、
// 高度测量只扣一次折叠体、主页接线与样式存在性、index.html 内联脚本语法。
// 真实浏览器里的悬停/点击/触屏表现需人工查验（协调端会复制本地站做浏览器验收），
// 本文件不冒充浏览器验证。
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const site = f => path.join(root, "HD2-Galatic_war-Map", f);

const window = {};
new Function("window", fs.readFileSync(site("js/planet-card-effects.js"), "utf8"))(window);
const FX = window.HD2PlanetCardEffects;

const html = fs.readFileSync(site("index.html"), "utf8").replace(/\r\n/g, "\n");
const css = fs.readFileSync(site("css/home.css"), "utf8").replace(/\r\n/g, "\n");
const mapSrc = fs.readFileSync(site("galaxy-map-v2.html"), "utf8").replace(/\r\n/g, "\n");

let checks = 0;
function check(name, fn) {
  fn();
  checks++;
  console.log("PASS " + name);
}
function segment(start, end) {
  const a = html.indexOf(start);
  const b = html.indexOf(end, a + start.length);
  assert.ok(a >= 0, "index.html 缺少片段：" + start);
  assert.ok(b > a, "index.html 缺少结束标记：" + end);
  return html.slice(a, b);
}

// ---- 词条 → 徽标 ----------------------------------------------------------
const vars = {
  1202: { cn: "喷气旅", desc: "低空协同突进。", cat: "机器人特殊单位" },
  1203: { cn: "喷气旅", desc: "低空协同突进。", cat: "机器人特殊单位" },
  1243: { cn: "掠食变种", desc: "极强攻击性。", cat: "终结族变种" },
  1188: { cn: "浓阴影迷雾", desc: "厚阴霾遮住了这个世界。", cat: "深域惧像" },
  1193: { cn: "阴影迷雾边界", desc: "位于阴霾星际墙边界。", cat: "深域惧像" },
  1315: { cn: "班机延误", desc: "撤离延迟 40 秒。", cat: "作战限制" },
  1236: { cn: "平民监控与安全中心", desc: "真理部在此分析公民数据。", cat: "设施与场所" },
  9001: { cn: "重复效果", desc: "第一条。", cat: "设施与场所" },
  9002: { cn: "重复效果", desc: "第二条。", cat: "设施与场所" },
  9003: { cn: "另一个效果", desc: "第三条。", cat: "设施与场所" },
};

check("同图标变种合并成一条（1202/1203 只留喷气旅）", () => {
  const plan = FX.effectBadges([1202, 1203, 1243], { vars });
  assert.deepEqual(plan.shown.map(f => f.cn), ["喷气旅", "掠食变种"]);
  assert.equal(plan.total, 2);
});

check("无专用图标的同名效果合并、不同名保留", () => {
  const plan = FX.effectBadges([9001, 9002, 9003], { vars });
  assert.deepEqual(plan.shown.map(f => f.cn), ["重复效果", "另一个效果"]);
});

check("威胁类图标排在无图标效果之前，数据顺序在档内保持", () => {
  const plan = FX.effectBadges([1188, 1202, 1315], { vars });
  assert.deepEqual(plan.shown.map(f => f.cn), ["喷气旅", "浓阴影迷雾", "班机延误"]);
});

check("图标徽标带可读名称、完整说明、图标路径与映射色", () => {
  const out = FX.effectsHtml([1202], { vars });
  assert.match(out, /<button type="button" class="pc-fx-i"/);
  assert.match(out, /data-fx-icon="jet_brigade\.svg"/);
  assert.match(out, /style="color:#D6806D"/);
  assert.match(out, /data-fx-cn="喷气旅"/);
  assert.match(out, /data-fx-desc="低空协同突进。"/);
  assert.match(out, /aria-label="喷气旅：低空协同突进。"/);
  assert.doesNotMatch(out, /onclick=/);   // 不做内联事件，CSS/JS 分离
});

check("没有专用图标的效果有短标签，完整名称仍在无损失处保留", () => {
  const out = FX.effectsHtml([1236], { vars });
  assert.match(out, /class="pc-fx-i pc-fx-txt"/);
  const label = out.match(/<span class="pc-fx-lbl" aria-hidden="true">([^<]+)<\/span>/)[1];
  assert.ok(label.length <= 6, "短标签过长：" + label);
  assert.ok(label.endsWith("…"));
  assert.match(out, /data-fx-cn="平民监控与安全中心"/);
  assert.match(out, /aria-label="平民监控与安全中心：真理部在此分析公民数据。"/);
});

check("未知效果 id 也有通用标记与说明兜底", () => {
  const plan = FX.effectBadges([9999], { vars });
  assert.equal(plan.shown[0].cn, "效果 #9999");
  const out = FX.effectsHtml([9999], { vars });
  assert.match(out, /pc-fx-txt/);
  assert.match(out, /效果 #9999/);
});

check("作战限制（负面）带警示样式标记", () => {
  const out = FX.effectsHtml([1315], { vars });
  assert.match(out, /pc-fx-neg/);
  assert.match(out, /data-fx-cat="作战限制"/);
});

check("超出名额收进 +N，剩余条目名称与说明不丢", () => {
  const ids = [9001, 9003, 9004, 9005, 9006, 9007, 9008, 9009];
  const ctxVars = { ...vars };
  for (const id of [9004, 9005, 9006, 9007, 9008, 9009]) {
    ctxVars[id] = { cn: "效果" + id, desc: "说明" + id, cat: "设施与场所" };
  }
  const plan = FX.effectBadges(ids, { vars: ctxVars });
  assert.equal(plan.shown.length, FX.ICON_MAX);
  assert.equal(plan.more.length, 2);
  const out = FX.effectsHtml(ids, { vars: ctxVars });
  assert.match(out, /pc-fx-more/);
  assert.match(out, />\+2<\/button>/);
  assert.match(out, /效果9008：说明9008/);
  assert.match(out, /效果9009：说明9009/);
});

check("没有词条时图标层整体不渲染（不占版面）", () => {
  assert.equal(FX.effectsHtml([], { vars }), "");
  assert.equal(FX.effectsHtml(null), "");
});

// ---- 主页专属补充图标 -----------------------------------------------------
check("补充表：素材文件存在、只追加不覆盖共享表", () => {
  const icons = new Set(fs.readdirSync(site("assets/effect-icons")));
  const shared = new Set(Object.keys(FX.EFFECT_ICON));
  const extra = FX.HOME_EXTRA_ICON || {};
  // 每条都要有「素材文件名 ↔ 效果」的确切对应，逐条钉住以免日后漂移
  const expected = { 1232: "factory_hub.png", 1234: "center_of_science.png", 1395: "tcs.png" };
  assert.deepEqual(Object.keys(extra).sort(), Object.keys(expected).sort());
  for (const [id, file] of Object.entries(expected)) {
    assert.equal(extra[id].icon, file, "补充图标映射不一致：" + id);
    assert.ok(icons.has(file), "补充图标缺少本地素材：" + file);
    assert.ok(!shared.has(id), "补充表不得覆盖星图共享项：" + id);
    assert.ok(extra[id].cn, "补充项必须有中文名：" + id);
  }
});

check("补充图标按 tier 2 排在威胁之后，同图标仍去重", () => {
  const plan = FX.effectBadges([1395, 1202, 1232, 1400, 1401], { vars });
  const icons = plan.shown.map(f => f.icon);
  assert.equal(icons[0], "jet_brigade.svg", "tier 1 威胁必须排最前");
  assert.equal(icons.filter(i => i === "seaf.svg").length, 1, "1400/1401 同图标只留一个");
  const out = FX.effectsHtml([1232], { vars });
  assert.match(out, /data-fx-icon="factory_hub\.png"/);
  assert.match(out, /data-fx-cn="工厂枢纽"/);
  const tcs = FX.effectsHtml([1395], { vars });
  assert.match(tcs, /data-fx-icon="tcs\.png"/);
  assert.match(tcs, /data-fx-cn="终结族控制系统 \+"/);
  // 没有确切素材的仍走短文字标签（不得凭空造图标）
  const gloom = FX.effectsHtml([1188, 1193, 1315], { vars });
  assert.doesNotMatch(gloom, /data-fx-icon/);
  assert.match(gloom, /pc-fx-txt/);
});

// ---- 统一折叠区 ----------------------------------------------------------
check("折叠区只有一套开合：一次展开同时给出城市列表与星球详情", () => {
  const out = FX.cardSectionHtml({
    index: 228, count: 3, hint: "城市 / 超大型工厂",
    summary: "已开放 1 / 3 · 阿瓦隆城 41.20%",
    label: "城市与星球详情（区域 3）",
    docHref: "./planet.html?idx=228",
    rowsHtml: '<div class="pc-rg-wrap">城市A</div>',
    detailHtml: '<div class="planet-detail">详情D</div>',
  });
  assert.equal((out.match(/class="pc-sec-body"/g) || []).length, 1, "整卡只能有一个折叠体");
  assert.equal((out.match(/<button/g) || []).length, 1, "整卡只能有一个开合按钮");
  const body = out.match(/<div class="pc-sec-body" id="([^"]+)" hidden>/);
  assert.ok(body, "折叠体必须默认 hidden");
  assert.ok(out.includes('aria-controls="' + body[1] + '"'), "aria-controls 必须指向折叠体");
  assert.match(out, /aria-expanded="false"/);
  assert.match(out, /data-exp-label="城市与星球详情（区域 3）"/);
  assert.match(out, /<b>3<\/b>/);
  assert.match(out, /城市 \/ 超大型工厂/);
  assert.match(out, /class="pc-rg-doc" href="\.\/planet\.html\?idx=228"/);
  assert.match(out, /class="pc-sec-hint"[^>]*>已开放 1 \/ 3 · 阿瓦隆城 41\.20%</);
  const tail = out.slice(out.indexOf('class="pc-sec-body"'));
  assert.ok(tail.includes('<div class="pc-rg-wrap">城市A</div>'), "城市列表必须落在折叠体内");
  assert.ok(tail.includes('<div class="planet-detail">详情D</div>'), "星球详情必须落在同一个折叠体内");
});

check("没有区域的星球用同一个入口（只放详情，不留空行）", () => {
  const out = FX.cardSectionHtml({ index: 7, count: 0, detailHtml: '<div class="planet-detail">D</div>' });
  assert.match(out, /class="pc-sec-toggle"/);
  assert.match(out, /aria-expanded="false"/);
  assert.match(out, /📋 详情/);
  assert.doesNotMatch(out, /pc-rg-list/, "没有区域数据时不留空行容器");
  assert.doesNotMatch(out, /pc-sec-hint/, "没有提示文案时不输出空提示");
  assert.match(out, /<div class="planet-detail-wrap"><div class="planet-detail">D<\/div><\/div>/);
});

check("同一星球多处渲染：id 不重复、原始索引不进属性", () => {
  const a = FX.cardSectionHtml({ index: '22"8<', count: 1, rowsHtml: "" });
  const b = FX.cardSectionHtml({ index: '22"8<', count: 1, rowsHtml: "" });
  const idA = a.match(/id="(pc-sec-[^"]+)"/)[1];
  const idB = b.match(/id="(pc-sec-[^"]+)"/)[1];
  assert.match(idA, /^pc-sec-228-\d+$/);
  assert.notEqual(idA, idB, "重复星球不能生成重复 DOM id");
  assert.ok(!a.includes('22"8'), "原始索引不得原样进入属性");
});

check("收起提示只认 available：人数多/防御中/未知状态都不算开放", () => {
  assert.equal(FX.regionHint([]), "");
  assert.equal(FX.regionHint(null), "");
  assert.equal(
    FX.regionHint([{ name: "甲城", pct: 41.204, available: true }, { name: "乙城", pct: 12, available: false }]),
    "已开放 1 / 2 · 甲城 41.20%"
  );
  assert.equal(FX.regionHint([{ name: "甲城", pct: 99.999, available: true }]), "已开放 1 / 1 · 甲城 100%");
  assert.equal(FX.regionHint([{ name: "甲城", pct: 0, available: false }]), "");
  assert.equal(
    FX.regionHint([{ name: "甲城", pct: 0, available: false }, { name: "乙城", pct: 0, available: null }]),
    ""
  );
  // 状态未知 + 玩家很多 + 星球在防御战 → 仍只能说「未知」，不能说「已开放」或「交战中」
  const unknown = FX.regionHint([{ name: "甲城", pct: 60, available: null, players: 9000, defense: true }]);
  assert.equal(unknown, "");
  assert.doesNotMatch(unknown, /已开放|交战/);
});

// ---- 与星图同源 ----------------------------------------------------------
function jsonLiteral(name) {
  const m = mapSrc.match(new RegExp("const " + name + " = \\{([\\s\\S]*?)\\n\\};"));
  assert.ok(m, "galaxy-map-v2.html 缺少 " + name);
  // 捕获块末尾常常是注释行，必须补换行，否则闭合的 } 会被行注释吃掉
  return new Function("return ({\n" + m[1] + "\n})")();
}

check("EFFECT_ICON 与 galaxy-map-v2.html 逐条一致", () => {
  assert.deepEqual(FX.EFFECT_ICON, jsonLiteral("EFFECT_ICON"));
});

check("EFFECT_COLOR 与 galaxy-map-v2.html 逐条一致", () => {
  assert.deepEqual(FX.EFFECT_COLOR, jsonLiteral("EFFECT_COLOR"));
});

check("图标资源版本号与星图 FX_ASSET_VER 同步（共用缓存）", () => {
  const m = mapSrc.match(/const FX_ASSET_VER = "(\d+)"/);
  assert.ok(m);
  assert.equal(FX.ICON_VER, m[1]);
});

// ---- 主页接线 ------------------------------------------------------------
check("卡片模板把图标层放在星球背景图里，且不再输出正文长词条", () => {
  const cardFn = segment("function renderPlanetCard(p, starMap, statusLabel, statusClass)", "// 侦察战 侦察 卡片");
  assert.match(cardFn, /HD2PlanetCardEffects\.effectsHtml\(p\.activeEffects/);
  assert.match(cardFn, /vars: effectCnDescMap/);
  assert.match(cardFn, /names: currentEffectMap/);
  assert.match(cardFn, /const landmark[\s\S]{0,500}?fxHtml/);
  assert.match(cardFn, /\$\{top\}\$\{landmark\}\$\{head\}/, "背景图必须在星球名之前");
  assert.doesNotMatch(cardFn, /pc-traits|pc-trait\b/, "正文不得再输出长词条块");
  assert.doesNotMatch(cardFn, /slice\(0,\s*3\)/, "不得再按 slice(0,3) 截断词条");
});

check("卡片模板只调用一次统一折叠区，不再单独输出详情面板", () => {
  const cardFn = segment("function renderPlanetCard(p, starMap, statusLabel, statusClass)", "// 侦察战 侦察 卡片");
  assert.equal((cardFn.match(/\$\{pcCardSection\(p, starMap, statusLabel\)\}/g) || []).length, 1);
  assert.doesNotMatch(cardFn, /pcRegionsHtml/, "旧的区域折叠入口必须删除");
  assert.doesNotMatch(cardFn, /planet-detail-wrap/, "详情面板必须并进统一折叠体");
});

check("折叠区数据取 HD2Regions.info，提示只喂 available", () => {
  const fn = segment("function pcCardSection(p, starMap, statusLabel)", "// 星球卡片（2026-09-13");
  assert.match(fn, /HD2Regions\.info\(p, k, r, currentData\)/);
  assert.match(fn, /available: info \? info\.available : null/);
  assert.match(fn, /rg\.regionHint\(items\.map\(it => \(\{/);
  assert.match(fn, /name: it\.zh \|\| it\.en, pct: it\.pct, available: it\.available/);
  assert.match(fn, /const detailHtml = planetDetailHtml\(p, starMap, statusLabel\)/);
  assert.match(fn, /rg\.cardSectionHtml\(\{/);
  assert.doesNotMatch(fn, /players/, "玩家数不得参与开放判据");
});

check("高度测量只扣统一折叠体一次（不重复扣除嵌套区域/详情）", () => {
  const fn = segment("function layoutPlanetGrids()", "/* 血条颜色");
  assert.match(fn, /const body = c\.querySelector\("\.pc-sec-body"\)/);
  assert.match(fn, /getBoundingClientRect\(\)\.height - \(body\?\.offsetHeight \|\| 0\)/);
  assert.doesNotMatch(fn, /pc-rg-list/);
  assert.doesNotMatch(fn, /planet-detail-wrap/);
});

check("点击委托：入口/城市提示开合，资料链接与图标浮层不误触", () => {
  const handler = segment('document.addEventListener("click", (e) => {', "/* ==============================================================\n     入侵与邻接");
  const docIdx = handler.indexOf('.closest(".pc-rg-doc")');
  const secIdx = handler.indexOf('.closest(".pc-sec-toggle, .pc-sec-hint")');
  assert.ok(docIdx > 0, "必须有资料链接分支");
  assert.ok(secIdx > docIdx, "资料链接分支必须在折叠切换之前 return");
  assert.ok(handler.indexOf('.closest(".pc-fx-i")') > 0, "图标分支必须存在");
  assert.match(handler, /toggleCardSection\(secHit\.closest\("\.pc-sec"\)\)/);
  assert.match(handler, /toggleCardSection\(card\.querySelector\("\.pc-sec:not\(\.pc-sec-native\)"\)\)/);
  assert.doesNotMatch(handler, /planet-detail-wrap/, "不得再单独切换详情面板");
});

check("开合函数同步 aria-expanded / 文案 / hidden / .open（键盘与读屏一致）", () => {
  assert.match(html, /function setCardSectionOpen\(sect, open\)/);
  assert.match(html, /btn\.setAttribute\("aria-expanded", open \? "true" : "false"\)/);
  assert.match(html, /lbl\.textContent = open \? "收起" : "展开"/);
  assert.match(html, /body\.hidden = !open/);
  assert.match(html, /sect\.classList\.toggle\("open", open\)/);
  assert.match(html, /document\.querySelectorAll\("\.pc-sec\.open"\)/);
  assert.match(html, /function toggleCardSection\(sect\)/);
});

check("主页先加载图标层脚本，再初始化，且是相对路径（静态站可用）", () => {
  const scriptIdx = html.indexOf('<script src="./js/planet-card-effects.js');
  const inlineIdx = html.indexOf('  <script>\n  "use strict";');
  assert.ok(scriptIdx > 0 && inlineIdx > scriptIdx, "图标层脚本必须在主页内联脚本之前");
  assert.match(html, /window\.HD2PlanetCardEffects\?\.init\(\)/);
  assert.doesNotMatch(html.slice(scriptIdx, html.indexOf("</script>", scriptIdx) + 9), /localhost|127\.0\.0\.1|http:\/\//);
  // 改过样式与图标脚本 → 两个 ?v= 都必须存在（否则浏览器/静态站会拿旧缓存）
  assert.match(html, /\.\/css\/home\.css\?v=\d/);
  assert.match(html, /\.\/js\/planet-card-effects\.js\?v=\d/);
});

check("样式：图标层绝对定位在图上、折叠体收起、浮层不被卡片裁剪", () => {
  assert.match(css, /\.planet-card \.pc-fx\{[^}]*position:absolute/);
  assert.match(css, /\.planet-card \.pc-fx-i\{[^}]*pointer-events:auto/);
  assert.match(css, /\.planet-card \.pc-sec\{[^}]*margin-top:auto/, "折叠区必须贴卡片底部（同排收起等高）");
  assert.match(css, /\.planet-card \.pc-sec-body\[hidden\]\{display:none\}/);
  assert.match(css, /\.planet-card \.pc-sec-toggle\[aria-expanded="true"\] \.arw\{transform:rotate\(90deg\)\}/);
  assert.match(css, /\.planet-card \.pc-sec-hint\{[^}]*text-overflow:ellipsis/, "收起提示必须单行不换行");
  assert.match(css, /\.pc-fx-tip\{[^}]*position:fixed/);
  assert.match(css, /@media \(max-width:768px\)\{[\s\S]{0,400}\.planet-card \.pc-fx/);
  assert.doesNotMatch(css, /\.pc-traits|\.pc-trait\b/, "长词条样式应随正文一起移除");
  assert.doesNotMatch(css, /\.pc-rg-toggle/, "旧的两段式区域按钮样式必须删除");
});

// ---- 开合状态机（从 index.html 抽出真实实现，用最小 DOM 桩跑一遍）----------------
check("开合状态机：aria/文案/hidden/.open 同步，切另一张卡会收起上一张", () => {
  const start = html.indexOf("  function setCardSectionOpen(sect, open) {");
  const after = html.indexOf("  function toggleCardSection(sect) {");
  assert.ok(start > 0 && after > start, "index.html 缺少开合函数");
  const end = html.indexOf("\n  /* ======================", after);
  assert.ok(end > after);
  const code = html.slice(start, end);

  const el = (props) => {
    const node = {
      _cls: new Set(props.cls || []),
      _attrs: Object.assign({}, props.attrs || {}),
      _children: props.children || [],
      hidden: !!props.hidden,
      textContent: props.text || "",
      classList: {
        contains: (c) => node._cls.has(c),
        add: (c) => node._cls.add(c),
        toggle: (c, on) => { if (on) node._cls.add(c); else node._cls.delete(c); },
      },
      setAttribute: (k, v) => { node._attrs[k] = String(v); },
      getAttribute: (k) => (Object.prototype.hasOwnProperty.call(node._attrs, k) ? node._attrs[k] : null),
      querySelector: (sel) => find(node, sel),
    };
    return node;
  };
  function find(node, sel) {
    const cls = sel.replace(/^\./, "");
    for (const child of node._children) {
      if (child._cls.has(cls)) return child;
      const deep = find(child, sel);
      if (deep) return deep;
    }
    return null;
  }
  function section(label) {
    const lbl = el({ cls: ["lbl"], text: "展开" });
    const btn = el({ cls: ["pc-sec-toggle"], attrs: {
      "aria-expanded": "false", "data-exp-label": label, "aria-label": "展开 · " + label,
    }, children: [lbl] });
    const body = el({ cls: ["pc-sec-body"], hidden: true });
    return el({ cls: ["pc-sec"], children: [el({ cls: ["rhd"], children: [btn] }), body] });
  }
  const s1 = section("星球 A");
  const s2 = section("星球 B");
  const fakeDoc = {
    querySelectorAll: (sel) => (sel === ".pc-sec.open" ? [s1, s2].filter(s => s._cls.has("open")) : []),
  };
  const api = new Function("document", code + "\nreturn { setCardSectionOpen, toggleCardSection };")(fakeDoc);

  const view = (s) => ({
    expanded: s.querySelector(".pc-sec-toggle").getAttribute("aria-expanded"),
    label: s.querySelector(".lbl").textContent,
    hidden: s.querySelector(".pc-sec-body").hidden,
    open: s._cls.has("open"),
  });
  assert.deepEqual(view(s1), { expanded: "false", label: "展开", hidden: true, open: false });

  api.toggleCardSection(s1);
  assert.deepEqual(view(s1), { expanded: "true", label: "收起", hidden: false, open: true });
  assert.match(s1.querySelector(".pc-sec-toggle").getAttribute("aria-label"), /^收起 · 星球 A$/);

  // 同屏只留一张：开另一张时上一张收回，且状态完整还原
  api.toggleCardSection(s2);
  assert.deepEqual(view(s1), { expanded: "false", label: "展开", hidden: true, open: false });
  assert.deepEqual(view(s2), { expanded: "true", label: "收起", hidden: false, open: true });

  // 再点自己 = 统一收起
  api.toggleCardSection(s2);
  assert.deepEqual(view(s2), { expanded: "false", label: "展开", hidden: true, open: false });
});

check("index.html 内联脚本仍可解析", () => {
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/src=|application\/ld\+json/i.test(m[1])) continue;
    new Function(m[2]);
  }
});

console.log(`${checks} planet-card regression cases passed.`);

// ---- 2026-10-26 效果描述占位符替换（fillEffectTemplate）----
{
  const F = FX.fillEffectTemplate;
  assert.ok(typeof F === "function", "fillEffectTemplate 必须导出");
  const a = F("<i=1>#V_ONE</i>战略配备可供所有绝地潜兵使用。", "ARSENAL AUGMENTATION: RS-422 RAILGUN",
    (en) => en === "RS-422 RAILGUN" ? "RS-422 磁轨枪" : "");
  assert.ok(a.text.includes("RS-422 磁轨枪") && !a.text.includes("#"), "ARSENAL #V_ONE 应替换为配备中文名");
  assert.equal(a.named, true); assert.equal(a.dynamic, false);
  const b = F("The #V_ONE stratagem is available.", "ARSENAL AUGMENTATION: AC-8 AUTOCANNON");
  assert.ok(b.text.includes("AC-8 AUTOCANNON") && !b.text.includes("#"));
  const c = F("撤离所需时间延长#V_TWO秒。", "PILOT SHORTAGE");
  assert.ok(c.text.includes("[动态值]") && !c.text.includes("#V_TWO"));
  assert.equal(c.dynamic, true); assert.equal(c.named, false);
  const d = F("所有星球上的战场拾取物中将<i=1>增加#AMOUNT%</i>的弹药。", "MORE BATTLEFIELD AMMO");
  assert.ok(d.text.includes("[动态值]") && !d.text.includes("#"));
  const e = F("绝地潜兵部署时携带弹匣数减少<i=1>#V_ONE%</i>。", "AMMO SHORTAGE");
  assert.ok(e.text.includes("[动态值]") && !e.text.includes("#"));
  const f0 = F("撤离时间额外延迟 30 秒。", "FLIGHT DELAY");
  assert.equal(f0.text, "撤离时间额外延迟 30 秒。"); assert.equal(f0.dynamic, false);
}
console.log("planet-cards-check: fillEffectTemplate assertions passed");
