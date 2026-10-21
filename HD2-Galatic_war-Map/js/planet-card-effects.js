/* ============================================================================
   主页星球卡 · 行动变量图标层 + 统一折叠区（2026-10）
   ----------------------------------------------------------------------------
   用户诉求（参考战术卡截图）：卡片正文不再堆「最多 3 段变种 / buff 长说明」，
   改为把行动变量以图标直接叠在星球环境图底部；城市/超大型工厂列表与星球详情
   收进**同一个**折叠区（默认收起，一次展开全给，再点统一收起）。
   长说明一个都不删 —— 悬停 / 键盘聚焦 / 点击 / 触屏点按都能看到，
   卡片详情面板里也仍有完整的词条列表。

   实现约定：
     · 纯静态脚本：普通 <script> 引入，无模块、无构建、无第三方依赖；
       图标走同源相对路径 + 内联 SVG（保留 currentColor 着色），
       取图失败（file:// 直接打开等）降级成短文字标记，不留空框。
     · EFFECT_ICON / EFFECT_COLOR 是从 galaxy-map-v2.html 原样复用的同一份映射
       （星图侧按图标去重、tier 取舍的规则也一并沿用）。
       scripts/tests/planet-cards-check.mjs 会逐条比对本文件与 galaxy-map-v2.html
       的两张表，防止两边漂移；改任何一边都要同步另一边的数据和 ICON_VER。
     · 本文件只做「呈现 + 交互」，不计算任何战况数值：
       效果中文名/说明由调用方传入的映射（hd2_variables / galactic_effects）提供。
     · 2026-10 第二轮反馈：城市列表与星球详情**不再各开一套折叠**，整卡只有一个折叠区
       （cardSectionHtml），一次展开同时给出两者，再点统一收起。
     · HOME_EXTRA_ICON 是**主页专属**的补充图标表（星图没接、但本站 assets/effect-icons
       里确实有对应素材的效果）。星图共享项仍在 EFFECT_ICON，测试逐条比对；补充项只追加、
       不改写共享项，免得「主页映射 = 星图映射」把有素材的效果锁死在文字标签上。
   ========================================================================== */
(function (global) {
  "use strict";

  /* ------------------------------------------------------------ 图标映射 ---- */
  // 与 galaxy-map-v2.html 的 EFFECT_ICON 完全一致（测试逐条比对）。
  // tier 1 = 军事/生存威胁类（势力变种、特殊个体、虫巢世界）—— 优先显示。
  const EFFECT_ICON = {
    // ---- tier 1：军事 / 威胁 ----
    1202: { icon: "jet_brigade.svg",        cn: "喷气旅",     tier: 1 },
    1203: { icon: "jet_brigade.svg",        cn: "喷气旅",     tier: 1 },
    1240: { icon: "jet_brigade.svg",        cn: "喷气旅",     tier: 1 },
    1248: { icon: "incineration_corps.svg", cn: "炽灼部队",   tier: 1 },
    1249: { icon: "incineration_corps.svg", cn: "炽灼部队",   tier: 1 },
    1360: { icon: "cyborgs.svg",            cn: "生化人",     tier: 1 },
    1361: { icon: "cyborgs.svg",            cn: "生化人",     tier: 1 },
    1243: { icon: "predator_strain.svg",    cn: "掠食变种",   tier: 1 },
    1245: { icon: "predator_strain.svg",    cn: "掠食变种",   tier: 1 },
    1244: { icon: "spore_burst_strain.svg", cn: "孢裂变种",   tier: 1 },
    1386: { icon: "spore_burst_strain.svg", cn: "孢裂变种",   tier: 1 },
    1303: { icon: "rupture_strain.svg",     cn: "爆裂变种",   tier: 1 },
    1310: { icon: "rupture_strain.svg",     cn: "爆裂变种",   tier: 1 },
    1380: { icon: "appropriators.svg",      cn: "占领者",     tier: 1 },
    1379: { icon: "appropriators.svg",      cn: "占领者",     tier: 1 },
    1377: { icon: "mindless_masses.svg",    cn: "无脑群氓",   tier: 1 },
    1378: { icon: "mindless_masses.svg",    cn: "无脑群氓",   tier: 1 },
    1402: { icon: "vote_snatchers.svg",     cn: "窃票者",     tier: 1 },
    1403: { icon: "vote_snatchers.svg",     cn: "窃票者",     tier: 1 },
    1417: { icon: "invasion_fleet.png",     cn: "入侵舰队",   tier: 1 },
    1413: { icon: "invasion_fleet.png",     cn: "入侵舰队",   tier: 1 },
    1414: { icon: "invasion_fleet.png",     cn: "入侵舰队",   tier: 1 },
    1306: { icon: "dragonroach.svg",        cn: "蟑龙",       tier: 1 },
    1309: { icon: "dragonroach.svg",        cn: "蟑龙",       tier: 1 },
    1307: { icon: "hive_lord.png",          cn: "霸王虫",     tier: 1 },
    1308: { icon: "hive_lord.png",          cn: "霸王虫",     tier: 1 },
    1400: { icon: "seaf.svg",               cn: "SEAF 武装部队", tier: 1 },
    1401: { icon: "seaf.svg",               cn: "SEAF 武装部队", tier: 1 },
    1239: { icon: "jet_brigade.svg",        cn: "喷气旅工厂", tier: 1 },
  };

  // 图标着色（仅 SVG 生效；PNG 自带配色）—— 与星图 EFFECT_COLOR 一致
  const EFFECT_COLOR = {
    "seaf.svg": "#ffe800",
    "incineration_corps.svg": "#D6806D", "jet_brigade.svg": "#D6806D", "cyborgs.svg": "#D6806D",
    "predator_strain.svg": "#F5C518", "spore_burst_strain.svg": "#F5C518", "rupture_strain.svg": "#F5C518",
    "dragonroach.svg": "#F5C518",
    "appropriators.svg": "#CF64F8", "mindless_masses.svg": "#CF64F8", "vote_snatchers.svg": "#CF64F8",
  };

  /* ---------------------------------------------- 主页专属补充图标表 ----
     只放「素材文件名 ↔ 效果英文名一一对应」的条目，且文件必须已在
     assets/effect-icons/ 里：
       FACTORY HUB            → factory_hub.png
       CENTER OF SCIENCE      → center_of_science.png
       TERMINID CONTROL SYSTEM → tcs.png（TCS 即该系统的游戏内缩写）
     没有确切素材的效果（浓阴影迷雾 / 阴影迷雾边界 / 班机延误 / 缺少飞行员 /
     补给不足 / 预算削减 / 无法抵达 / 非军事化 / 各类设施 …）**一律留短文字标签**：
     星图那边的既有结论也是「由雾层 / 红色 chip 表现」，本站不臆造图标。
     DSS 战术行动（1208-1216 / 1237 / 1425）与 DSS 停靠（1217）**不放进本表**：
     · data.json 的 planets[].activeEffects 里从不出现这些 id（当前 273 颗星 0 次），
       卡片上没有对应文字可替换；
     · 这些素材内部带同名 id（clipPath id="a"），内联多份时 url(#a) 可能指到别的图标，
       为一次没有收益的替换引入渲染风险不值得。DSS 图标已由页面的 DSS 面板承载。 */
  const HOME_EXTRA_ICON = {
    1232: { icon: "factory_hub.png",       cn: "工厂枢纽",        tier: 2 },  // FACTORY HUB
    1234: { icon: "center_of_science.png", cn: "科学中心",        tier: 2 },  // CENTER OF SCIENCE
    1395: { icon: "tcs.png",               cn: "终结族控制系统 +", tier: 2 },  // TERMINID CONTROL SYSTEM +
  };

  // 图标资源版本号：与 galaxy-map-v2.html 的 FX_ASSET_VER 保持一致（共用浏览器缓存）。
  // 改了 assets/effect-icons 里任何文件 → 两边一起 +1。
  const ICON_VER = "4";
  const ICON_DIR = "./assets/effect-icons/";
  const FALLBACK_COLOR = "#94A3B8";
  const ICON_MAX = 6;        // 图标层最多显示几个（其余收进 +N）
  const SHORT_MAX = 5;       // 无专用图标时的短标签字数

  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function shortLabel(cn) {
    const t = String(cn || "").replace(/\s+/g, "");
    return t.length > SHORT_MAX ? t.slice(0, SHORT_MAX) + "…" : t;
  }

  /* ------------------------------------------------------- 词条 → 徽标 ---- */
  // 单个 effectId 的展示信息：
  //   名称：有专用图标的效果用 EFFECT_ICON 的短名（如「SEAF 武装部队」），
  //         否则用 hd2_variables 的中文名（其次 galactic_effects / effect_id_cn）。
  //   说明：hd2_variables 中文描述优先，其次 galactic_effects 中文，最后英文原文。
  function infoOf(id, ctx) {
    // 星图共享表优先；主页专属补充表只补星图里没有的条目
    const icon = EFFECT_ICON[id] || HOME_EXTRA_ICON[id] || null;
    const vars = (ctx && ctx.vars) || {};
    const names = (ctx && ctx.names) || {};
    const details = (ctx && ctx.details) || {};
    const v = vars[id], det = details[id];
    const cn = (icon && icon.cn) || (v && v.cn) || names[id] || (det && det.name) || ("效果 #" + id);
    const desc = (v && v.desc) || (det && (det.description_cn || det.description)) || "";
    const cat = (v && v.cat) || "";
    return {
      id,
      cn,
      desc,
      cat,
      neg: cat === "作战限制" || cat === "combat_restriction",
      icon: icon ? icon.icon : "",
      color: icon ? (EFFECT_COLOR[icon.icon] || FALLBACK_COLOR) : "",
      tier: icon ? (icon.tier || 2) : 9,   // 无图标的效果排在图标项之后
    };
  }

  // 变种/增益 → 去重后的徽标列表。
  //   同图标去重：1202/1203（喷气旅）、1413/1414/1417（入侵舰队）这类同组 id
  //   只留一个图标，说明取第一个带描述的 id；同名效果（不同 id、都没图标）也合并。
  //   排序：tier 1（威胁/变种）→ 其余图标项 → 无图标项；同档保持数据顺序。
  function effectBadges(ids, ctx) {
    const list = [], seenIcon = {}, seenName = {};
    for (const id of (ids || [])) {
      if (id == null) continue;
      const f = infoOf(id, ctx);
      if (f.icon) {
        if (seenIcon[f.icon]) continue;
        seenIcon[f.icon] = 1;
      } else {
        if (seenName[f.cn]) continue;
        seenName[f.cn] = 1;
      }
      list.push(f);
    }
    list.sort((a, b) => a.tier - b.tier);
    return {
      shown: list.slice(0, ICON_MAX),
      more: list.slice(ICON_MAX),
      total: list.length,
    };
  }

  function badgeHtml(f) {
    const cls = "pc-fx-i" + (f.icon ? "" : " pc-fx-txt") + (f.neg ? " pc-fx-neg" : "");
    const aria = f.desc ? f.cn + "：" + f.desc : f.cn;
    const inner = f.icon
      ? `<span class="pc-fx-ic" data-fx-icon="${esc(f.icon)}" data-fx-short="${esc(shortLabel(f.cn))}" aria-hidden="true"></span>`
      : `<span class="pc-fx-lbl" aria-hidden="true">${esc(shortLabel(f.cn))}</span>`;
    // 图标色写在按钮上：内联 SVG 用 currentColor 上色，:hover 描边也跟着亮同一色
    const tone = f.icon ? ` style="color:${esc(f.color || FALLBACK_COLOR)}"` : "";
    return `<button type="button" class="${cls}"${tone} data-fx-i` +
      ` data-fx-cn="${esc(f.cn)}" data-fx-desc="${esc(f.desc)}"` +
      (f.cat ? ` data-fx-cat="${esc(f.cat)}"` : "") +
      ` aria-label="${esc(aria)}" aria-pressed="false">${inner}</button>`;
  }

  // 名额之外的条目：+N 徽标，点开仍是完整名称 + 说明（不丢信息）
  function moreHtml(more) {
    const desc = more.map(f => (f.desc ? f.cn + "：" + f.desc : f.cn)).join("\n");
    const names = more.map(f => f.cn).join("、");
    return `<button type="button" class="pc-fx-i pc-fx-more" data-fx-i` +
      ` data-fx-cn="其余 ${more.length} 项行动变量" data-fx-desc="${esc(desc)}"` +
      ` aria-label="${esc("其余 " + more.length + " 项行动变量：" + names)}" aria-pressed="false">` +
      `+${more.length}</button>`;
  }

  // 环境图底部的图标层；没有任何词条时返回空串（不占位）
  function effectsHtml(ids, ctx) {
    const plan = effectBadges(ids, ctx);
    if (!plan.shown.length) return "";
    return `<div class="pc-fx" role="group" aria-label="行动变量">` +
      plan.shown.map(badgeHtml).join("") +
      (plan.more.length ? moreHtml(plan.more) : "") +
      `</div>`;
  }

  /* --------------------------------------------------------- 统一折叠区 ---- */
  // 用户 2026-10 第二轮反馈：「这个展开建议仅仅展开一次，而非现在的二重展开」。
  // 原来是「区域块」和「详情面板」两套独立开合（点卡片展开第一次、再点区域标题展开第二次），
  // 现在一颗星球只有**一个**按钮：一次展开同时给出城市 / 超大型工厂列表和星球详情，
  // 再点统一收起；没有区域数据的星球用同一个入口（只是不带区域计数与城市提示）。
  // 收起时标题行下面可以多一行紧凑提示（如「已开放 2 / 5 · 阿瓦隆城 41.20%」），
  // 文案由调用方按真实数据算好传入（见 regionHint），本文件不猜任何战况。
  let sectionSerial = 0;
  function cardSectionHtml(o) {
    o = o || {};
    const idx = String(o.index == null ? "x" : o.index).replace(/[^0-9A-Za-z_-]/g, "");
    // 同一星球也可能同时出现在 MO 和可攻打列表；每次渲染使用独立 id，aria-controls 不串。
    const bodyId = "pc-sec-" + idx + "-" + (++sectionSerial);
    const count = o.count == null ? 0 : (Number(o.count) || 0);
    const hasRegions = count > 0;
    const label = o.label || (hasRegions ? "城市与星球详情" : "星球详情");
    return `<div class="pc-sec">` +
      `<div class="rhd">` +
        `<button type="button" class="pc-sec-toggle" aria-expanded="false" aria-controls="${esc(bodyId)}"` +
          ` data-exp-label="${esc(label)}" aria-label="${esc("展开 · " + label)}">` +
          `<span class="arw" aria-hidden="true">▸</span>` +
          (hasRegions
            ? `<span class="k">🏙 区域</span> <b>${esc(count)}</b>`
            : `<span class="k">📋 详情</span>`) +
          (o.hint ? `<span class="tip">${esc(o.hint)}</span>` : "") +
          `<span class="lbl" aria-hidden="true">展开</span>` +
        `</button>` +
        (o.docHref
          ? `<a class="pc-rg-doc" href="${esc(o.docHref)}" title="打开该星球的完整资料页（战役 / 统计 / 环境 / 补给线）">📄 资料</a>`
          : "") +
      `</div>` +
      (o.summary ? `<div class="pc-sec-hint" title="${esc(o.summary)}">${esc(o.summary)}</div>` : "") +
      `<div class="pc-sec-body" id="${esc(bodyId)}" hidden>` +
        (hasRegions ? `<div class="pc-rg-list">${o.rowsHtml || ""}</div>` : "") +
        (o.detailHtml ? `<div class="planet-detail-wrap">${o.detailHtml}</div>` : "") +
      `</div>` +
    `</div>`;
  }

  function pctText(v) {
    if (v == null || !isFinite(v)) return "—";
    return Number(v) >= 99.995 ? "100%" : Number(v).toFixed(2) + "%";
  }

  // 收起时的城市提示：**只**依据 available（data.json regions[].isAvailable）。
  //   · 玩家数 > 0、静态区域表里有这条区域、区域还没打下来 —— 都**不是**开放证据；
  //   · available 为 null 时不输出开放提示，不能因为星球在打防御战就说「交战中」
  //     （超级地球持有的区域同样可能正在防守，判据见 js/regions.js 的 defense）；
  //   · 有开放证据才写「已开放 N / M」，并附上进度最好的那座城市的名称 + 解放度。
  function regionHint(items) {
    const list = (items || []).filter(Boolean);
    if (!list.length) return "";
    const open = list.filter(it => it.available === true);
    if (open.length) {
      const best = open.slice().sort((a, b) => (b.pct == null ? -1 : b.pct) - (a.pct == null ? -1 : a.pct))[0];
      return "已开放 " + open.length + " / " + list.length +
        (best && best.pct != null ? " · " + String(best.name || "") + " " + pctText(best.pct) : "");
    }
    // 没有明确开放的区域时不加提示；区域总数已经在入口显示。
    return "";
  }

  /* ------------------------------------------------------------ 图标补全 ---- */
  // 图标：SVG 内联（currentColor 上色）/ PNG 用 <img>；带缓存，失败降级成短文字。
  const markupCache = {};   // file -> html 字符串（"" = 取图失败）
  const pending = {};

  function iconMarkup(file) {
    if (markupCache[file] != null) return Promise.resolve(markupCache[file]);
    if (pending[file]) return pending[file];
    if (typeof fetch !== "function") {
      markupCache[file] = "";
      return Promise.resolve("");
    }
    const src = ICON_DIR + file + "?v=" + ICON_VER;
    pending[file] = fetch(src, { cache: "force-cache" })
      .then(r => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.text();
      })
      .then(txt => {
        if (/\.png$/i.test(file)) {
          markupCache[file] = `<img src="${esc(src)}" alt="" loading="lazy" decoding="async">`;
        } else {
          const svg = String(txt)
            .replace(/<\?xml[^>]*\?>/i, "")
            .replace(/<!DOCTYPE[^>]*>/i, "")
            .trim()
            .replace(/<script[\s\S]*?<\/script>/gi, "")
            .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
            .replace(/\son\w+\s*=\s*'[^']*'/gi, "");
          markupCache[file] = /^<svg[\s>]/i.test(svg) ? svg : "";
        }
        return markupCache[file];
      })
      .catch(() => {
        markupCache[file] = "";
        return "";
      })
      .then(markup => {
        delete pending[file];
        return markup;
      });
    return pending[file];
  }

  // 把页面里所有还没填图的 [data-fx-icon] 补上。卡片每次重新渲染都是新节点，
  // 所以 init() 里用 MutationObserver 兜住后续渲染，不必改各渲染函数。
  function hydrate(root) {
    if (typeof document === "undefined") return;
    const scope = root || document;
    const nodes = scope.querySelectorAll ? scope.querySelectorAll("[data-fx-icon]") : [];
    Array.prototype.forEach.call(nodes, el => {
      if (el.getAttribute("data-fx-ready") === "1") return;
      const file = el.getAttribute("data-fx-icon");
      if (!file) return;
      el.setAttribute("data-fx-ready", "1");
      iconMarkup(file).then(markup => {
        if (!markup) {   // 取图失败（file:// / 404）：短文字兜底，不留空框
          el.textContent = el.getAttribute("data-fx-short") || "•";
          el.classList.add("pc-fx-ic-txt");
          return;
        }
        el.innerHTML = markup;
      });
    });
  }

  /* ------------------------------------------------------------ 说明浮层 ---- */
  const TIP_ID = "pc-fx-tip";
  let tipEl = null;
  let pinnedBtn = null;
  let tipBtn = null;

  function ensureTip() {
    if (tipEl && document.body.contains(tipEl)) return tipEl;
    tipEl = document.createElement("div");
    tipEl.className = "pc-fx-tip";
    tipEl.id = TIP_ID;
    tipEl.setAttribute("role", "tooltip");
    tipEl.hidden = true;
    tipEl.innerHTML = `<div class="t"></div><p class="d"></p><div class="c" hidden></div>`;
    document.body.appendChild(tipEl);
    return tipEl;
  }

  function place(btn) {
    const r = btn.getBoundingClientRect();
    const box = tipEl;
    const w = box.offsetWidth, h = box.offsetHeight;
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    let left = Math.min(Math.max(8, r.left), Math.max(8, vw - w - 8));
    let top = r.bottom + 6;
    if (top + h > vh - 8) top = Math.max(8, r.top - h - 6);
    box.style.left = left + "px";
    box.style.top = top + "px";
  }

  function show(btn, pin) {
    if (!btn || typeof document === "undefined") return;
    if (pin && pinnedBtn && pinnedBtn !== btn) clearPressed();
    ensureTip();
    tipBtn = btn;
    tipEl.querySelector(".t").textContent = btn.getAttribute("data-fx-cn") || "";
    tipEl.querySelector(".d").textContent = btn.getAttribute("data-fx-desc") || "暂无详细说明";
    const c = tipEl.querySelector(".c");
    const cat = btn.getAttribute("data-fx-cat") || "";
    c.textContent = cat;
    c.hidden = !cat;
    tipEl.hidden = false;
    tipEl.style.visibility = "hidden";   // 先量尺寸再定位，避免闪到左上角
    place(btn);
    tipEl.style.visibility = "";
    if (pin) {
      pinnedBtn = btn;
      btn.setAttribute("aria-pressed", "true");
    }
  }

  function clearPressed() {
    if (pinnedBtn && pinnedBtn.setAttribute) pinnedBtn.setAttribute("aria-pressed", "false");
    pinnedBtn = null;
  }

  function hide() {
    if (tipEl) tipEl.hidden = true;
    tipBtn = null;
    clearPressed();
  }

  function closest(el, sel) {
    return el && el.closest ? el.closest(sel) : null;
  }

  /* ---------------------------------------------------------- 交互绑定 ---- */
  function onDocClick(ev) {
    const btn = closest(ev.target, ".pc-fx-i");
    if (!btn) { hide(); return; }        // 点别处只收起浮层，卡片开合仍由页面自身处理
    ev.stopPropagation();                // 关键：点图标不展开卡片详情
    if (pinnedBtn === btn) hide();
    else show(btn, true);
  }

  function onPointerOver(ev) {
    const btn = closest(ev.target, ".pc-fx-i");
    if (!btn) return;
    if (pinnedBtn && pinnedBtn !== btn) hide();   // 悬停别的图标时释放上一个固定浮层
    if (btn === pinnedBtn) return;
    show(btn, false);
  }

  function onPointerOut(ev) {
    const btn = closest(ev.target, ".pc-fx-i");
    if (!btn || pinnedBtn) return;
    if (closest(ev.relatedTarget, ".pc-fx-i") === btn) return;   // 还在同一按钮内部
    hide();
  }

  function onFocusIn(ev) {
    const btn = closest(ev.target, ".pc-fx-i");
    if (btn && btn !== pinnedBtn) show(btn, false);
  }

  function onFocusOut(ev) {
    if (pinnedBtn) return;
    if (!closest(ev.target, ".pc-fx-i")) return;
    hide();
  }

  function onKeydown(ev) {
    if (ev.key === "Escape" || ev.key === "Esc") hide();
  }

  let hydrateTimer = 0;
  function scheduleHydrate() {
    if (hydrateTimer) return;
    hydrateTimer = setTimeout(() => {
      hydrateTimer = 0;
      // 自动刷新会替换整张卡片，旧说明不能悬在已移除的按钮旁。
      if (tipBtn && !tipBtn.isConnected) hide();
      hydrate();
    }, 0);
  }

  let started = false;
  function init() {
    if (started || typeof document === "undefined") return;
    started = true;
    hydrate();
    if (typeof MutationObserver === "function" && document.body) {
      new MutationObserver(scheduleHydrate).observe(document.body, { childList: true, subtree: true });
    }
    document.addEventListener("click", onDocClick, true);
    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("pointerout", onPointerOut, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    document.addEventListener("keydown", onKeydown, true);
    window.addEventListener("scroll", hide, { passive: true });
    window.addEventListener("resize", hide);
  }

  global.HD2PlanetCardEffects = {
    EFFECT_ICON,
    EFFECT_COLOR,
    HOME_EXTRA_ICON,
    ICON_VER,
    ICON_MAX,
    effectBadges,
    effectsHtml,
    cardSectionHtml,
    regionHint,
    hydrate,
    init,
    // 供检查脚本读取的纯函数（页面不用）
    _internals: { infoOf, shortLabel, pctText, esc },
  };
})(typeof window !== "undefined" ? window : this);
