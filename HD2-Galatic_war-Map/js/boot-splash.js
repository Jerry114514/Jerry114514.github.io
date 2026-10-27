"use strict";
/* ==============================================================
   超级地球 · 银河链路启动屏（2026-10-27）
   - 真实状态与 lore 分行显示，互不覆盖。
   - setStage(current, total) 显示真实阶段；未设置时保持不确定扫描。
   - mount() 用于全站页面；attach() 接管星图已有的内联遮罩。
   ============================================================== */
(function (global) {
  "use strict";

  var PREFIX = "./";
  var LORE = [
    "🪖 超级地球武装力量正在为您准备战况简报…",
    "📡 真理部广播：民主的火种需要每一个公民的守护。",
    "🛰️ SEAF 侦察卫星正在校准轨道参数…",
    "⚡ E-710 提炼效率已提升至战时标准。",
    "🦅 「自由是一顿需要天天享用的盛宴。」——超级地球宣传部",
    "🛡️ 管理式民主的安全建立在信息透明之上。",
    "⚖️ 民主不会自己保卫自己——但真理部会。",
    "🔬 民主检测中心：当前页面安全性评级为「绝对安全」。",
    "🎖️ 在您等待的这几秒里，已有 3,741 名绝地潜兵完成了任务。",
    "🚀 超级驱逐舰编队已完成第 1,042 次轨道部署。",
  ];
  var motionQuery = global.matchMedia ? global.matchMedia("(prefers-reduced-motion: reduce)") : null;
  var state = {
    mounted: false,
    attached: false,
    node: null,
    msgEl: null,
    subEl: null,
    loreEl: null,
    stageCodeEl: null,
    stageCountEl: null,
    segmentsEl: null,
    loreIdx: 0,
    timer: null,
    gone: false,
  };

  function reducedMotion() { return !!(motionQuery && motionQuery.matches); }

  function segmentsMarkup() {
    var out = "";
    for (var i = 0; i < 10; i++) out += "<i><b></b></i>";
    return out;
  }

  function visualMarkup() {
    return '<div class="boot-visual" aria-hidden="true"><div class="boot-frame">'
      + '<img class="emblem" src="' + PREFIX + 'assets/ui-icons/super_earth_flag.svg" alt="" decoding="async">'
      + '<span class="scan-line"></span></div></div>';
  }

  function messageMarkup() {
    return '<div class="msg"><span class="line" role="status" aria-live="polite"></span>'
      + '<small class="sub"></small><small class="lore" aria-hidden="true"></small></div>';
  }

  function build() {
    var el = document.createElement("div");
    el.id = "hd2-boot";
    el.setAttribute("aria-label", "正在加载");
    el.innerHTML = visualMarkup()
      + '<div class="boot-stage" aria-hidden="true"><span class="stage-code">UPLINK</span><span class="stage-count">SYNC</span></div>'
      + '<div class="segments" data-mode="indeterminate" aria-hidden="true">' + segmentsMarkup() + "</div>"
      + messageMarkup();
    document.body.appendChild(el);
    return el;
  }

  function cacheNode(el) {
    state.node = el;
    state.msgEl = el.querySelector(".msg .line");
    state.subEl = el.querySelector(".msg .sub");
    state.loreEl = el.querySelector(".msg .lore");
    state.stageCodeEl = el.querySelector(".stage-code");
    state.stageCountEl = el.querySelector(".stage-count");
    state.segmentsEl = el.querySelector(".segments");
  }

  function clearSwap(el) {
    if (!el) return;
    if (el._hd2SwapTimer) clearTimeout(el._hd2SwapTimer);
    el._hd2SwapTimer = null;
  }

  function swapText(el, text, immediate) {
    if (!el) return;
    text = String(text == null ? "" : text);
    clearSwap(el);
    if (immediate || reducedMotion()) {
      el.textContent = text;
      el.classList.remove("changing");
      return;
    }
    if (el.textContent === text) { el.classList.remove("changing"); return; }
    el.classList.add("changing");
    el._hd2SwapTimer = setTimeout(function () {
      el._hd2SwapTimer = null;
      if (!el.isConnected) return;
      el.textContent = text;
      el.classList.remove("changing");
    }, 140);
  }

  function tick() {
    if (state.gone || !LORE.length) return;
    swapText(state.loreEl, LORE[state.loreIdx % LORE.length], false);
    state.loreIdx++;
  }

  function startLore() {
    if (state.timer) clearInterval(state.timer);
    if (!LORE.length || state.gone) return;
    swapText(state.loreEl, LORE[state.loreIdx % LORE.length], true);
    state.loreIdx++;
    if (!reducedMotion()) state.timer = setInterval(tick, 4200);
  }

  function clearAsync() {
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
    clearSwap(state.msgEl);
    clearSwap(state.subEl);
    clearSwap(state.loreEl);
  }

  function renderStage(current, total) {
    if (!state.node) return;
    total = Math.max(1, Number(total) || 1);
    current = Math.min(total, Math.max(1, Number(current) || 1));
    if (state.stageCountEl) {
      state.stageCountEl.textContent = String(current).padStart(2, "0") + " / " + String(total).padStart(2, "0");
    }
    if (!state.segmentsEl) return;
    state.segmentsEl.dataset.mode = "determinate";
    var completed = Math.floor((current - 1) / total * 10);
    Array.prototype.forEach.call(state.segmentsEl.children, function (seg, i) {
      seg.classList.toggle("done", i < completed);
      seg.classList.toggle("current", i === completed);
    });
  }

  function completeSegments() {
    if (!state.segmentsEl) return;
    state.segmentsEl.dataset.mode = "determinate";
    Array.prototype.forEach.call(state.segmentsEl.children, function (seg) {
      seg.classList.add("done");
      seg.classList.remove("current");
    });
  }

  var HD2Boot = {
    mount: function (opts) {
      if (state.mounted) return HD2Boot;
      state.mounted = true;
      state.attached = false;
      if (opts && opts.assetPrefix) PREFIX = opts.assetPrefix;
      var el = build();
      cacheNode(el);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { if (!state.gone && el.isConnected) el.classList.add("visible"); });
      });
      startLore();
      return HD2Boot;
    },

    attach: function (el) {
      if (!el) return HD2Boot;
      if (state.mounted && state.node !== el) return HD2Boot;
      state.mounted = true;
      state.attached = true;
      cacheNode(el);
      el.classList.add("visible");
      startLore();
      return HD2Boot;
    },

    setMsg: function (msg, sub) {
      if (state.gone) return HD2Boot;
      // 阶段计数是即时更新的；主状态也必须同步落字，否则快速启动时会短暂显示“03/04 + 正在建立链路”。
      swapText(state.msgEl, msg, true);
      if (sub !== undefined) swapText(state.subEl, sub, true);
      return HD2Boot;
    },

    setStage: function (current, total, code) {
      if (state.gone) return HD2Boot;
      if (code && state.stageCodeEl) state.stageCodeEl.textContent = String(code);
      renderStage(current, total);
      return HD2Boot;
    },

    done: function () {
      if (state.gone) return HD2Boot;
      state.gone = true;
      clearAsync();
      var n = state.node;
      if (!n) return HD2Boot;
      swapText(state.msgEl, "链路已建立 · FOR SUPER EARTH", true);
      swapText(state.loreEl, "", true);
      if (state.stageCountEl) state.stageCountEl.textContent = "READY";
      completeSegments();
      n.classList.remove("error");
      n.classList.add("complete");
      requestAnimationFrame(function () { if (n.isConnected) n.classList.add("gone"); });
      setTimeout(function () {
        if (!n.isConnected) return;
        if (state.attached) n.style.display = "none";
        else if (n.parentNode) n.parentNode.removeChild(n);
      }, 420);
      return HD2Boot;
    },

    fail: function (msg, sub) {
      state.gone = true;
      clearAsync();
      var n = state.node;
      if (!n) return HD2Boot;
      n.style.display = "flex";
      n.classList.remove("gone", "complete");
      n.classList.add("error");
      if (state.stageCodeEl) state.stageCodeEl.textContent = "LINK ERROR";
      if (state.stageCountEl) state.stageCountEl.textContent = "HALT";
      if (state.segmentsEl) {
        state.segmentsEl.dataset.mode = "determinate";
        Array.prototype.forEach.call(state.segmentsEl.children, function (seg) { seg.classList.remove("done", "current"); });
      }
      swapText(state.msgEl, msg || "链路建立失败", true);
      swapText(state.subEl, sub || "请检查网络连接后刷新重试", true);
      swapText(state.loreEl, "", true);
      return HD2Boot;
    },
  };

  HD2Boot._lorePool = LORE; // 保留给旧页面查询；消息轮换不再覆盖真实状态。
  global.HD2Boot = HD2Boot;
})(typeof window !== "undefined" ? window : globalThis);
