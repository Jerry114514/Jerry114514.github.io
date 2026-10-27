"use strict";
/* ==============================================================
   重要指令播报（mo-announce）· 2026-10-28
   --------------------------------------------------------------
   复刻 helldiverscompanion 的 INCOMING MESSAGE FROM SUPER EARTH 动效。
   状态机：idle → incoming → order → closing → idle
   版本判定：assignments.id（缺失/0/-1 时用 warId+起止时间+规范化 tasks 稳定哈希）；
   禁止用 fetchedAt / translated_at / engine / progress / 倒计时做版本。
   已看集合：localStorage hd2.majorOrder.seen.v1（上限 10 条版本），
   降级链 localStorage → sessionStorage → 内存；跨标签页用
   BroadcastChannel("hd2-major-order") + localStorage 抢占锁去重。
   ============================================================= */
(function (global) {
  "use strict";

  var SEEN_KEY = "hd2.majorOrder.seen.v1";
  var CLAIM_KEY = "hd2.majorOrder.claim.v1";
  var BC_NAME = "hd2-major-order";
  var SEEN_CAP = 10;              // 版本数组上限，防缓存无限增长
  var NOTICE_MS = 1000;           // 通知条关键帧时长
  var PANEL_DELAY_MS = 64;        // 通知条结束后面板延迟
  var PANEL_IN_MS = 48;           // 面板 scale(.88→1)
  var BACKDROP_MS = 128;          // 遮罩淡入/淡出
  var BANNER_DECODE_MS = 800;     // banner.decode() 最多等待
  var FIRST_PLAY_DELAY_MS = 1200; // 首次数据到达后的起播缓冲（避开载入遮罩）

  var TAB_ID = Math.random().toString(36).slice(2) + Date.now().toString(36);
  var state = "idle";             // idle | incoming | order | closing
  var timers = [];                // 全部待执行 timer（关闭时统一清）
  var closeGen = 0;               // 关闭代际：banner 等待期间被关闭则放弃本次展示
  var playedRevision = null;      // 正在/刚刚播放的版本
  var pendingRevision = null;     // 播放期间到达的新版本（关闭后播）
  var deferredRevision = null;    // 页面处于后台时的待播版本（转前台再播）
  var lastData = null;            // 最近一次 notifyData 的数据
  var lastRevision = "";          // 最近一次计算的版本
  var lastAnnouncement = null;    // 最近一次构造的播报内容
  var openerEl = null;            // 打开前的焦点元素

  /* ---------------- 存储：localStorage → sessionStorage → 内存 ---------------- */
  var store = (function () {
    var mode = "memory";
    var mem = {};
    try { global.localStorage.setItem("__hd2mo_probe", "1"); global.localStorage.removeItem("__hd2mo_probe"); mode = "local"; }
    catch (_) {
      try { global.sessionStorage.setItem("__hd2mo_probe", "1"); global.sessionStorage.removeItem("__hd2mo_probe"); mode = "session"; }
      catch (_) { mode = "memory"; }
    }
    function rawGet(k) {
      try {
        if (mode === "local") return global.localStorage.getItem(k);
        if (mode === "session") return global.sessionStorage.getItem(k);
      } catch (_) { /* 落内存 */ }
      return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
    }
    function rawSet(k, v) {
      try {
        if (mode === "local") { global.localStorage.setItem(k, v); return; }
        if (mode === "session") { global.sessionStorage.setItem(k, v); return; }
      } catch (_) { /* 写失败降级内存，不抛出 */ }
      mem[k] = v;
    }
    return { get: rawGet, set: rawSet, mode: mode };
  })();

  var bc = null;
  try { if (typeof BroadcastChannel !== "undefined") bc = new BroadcastChannel(BC_NAME); } catch (_) { bc = null; }

  /* ---------------- 已看集合 ---------------- */
  function readSeen() {
    var raw = store.get(SEEN_KEY);
    if (!raw) return [];
    try {
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.filter(function (x) { return typeof x === "string" && x.length > 0; }).slice(0, SEEN_CAP);
    } catch (_) { return []; }
  }
  function writeSeen(arr) {
    store.set(SEEN_KEY, JSON.stringify(arr.slice(0, SEEN_CAP)));
  }
  function hasSeen(rev) {
    return readSeen().indexOf(rev) >= 0;
  }
  /* 本地标记（不广播，避免回环）；播报中的版本立即可见于同浏览器其他标签页 */
  function markSeenLocal(rev) {
    if (!rev) return;
    var arr = readSeen();
    arr = arr.filter(function (x) { return x !== rev; });
    arr.unshift(rev);
    writeSeen(arr);
  }
  function markSeen(rev) {
    markSeenLocal(rev);
    if (bc) { try { bc.postMessage({ type: "seen", rev: rev, tab: TAB_ID }); } catch (_) {} }
  }

  /* ---------------- 版本判定 ---------------- */
  function fnv1a(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ("0000000" + h.toString(16)).slice(-8);
  }
  /* tasks 规范化：只保留稳定字段（type/values/goal/index），排除 progress 等实时值 */
  function stableTasks(tasks) {
    if (!Array.isArray(tasks)) return "[]";
    return JSON.stringify(tasks.map(function (t) {
      if (!t || typeof t !== "object") return null;
      return {
        index: t.index == null ? null : t.index,
        type: t.type == null ? null : t.type,
        values: t.values == null ? null : t.values,
        goal: t.goal == null ? null : t.goal
      };
    }));
  }
  function computeRevision(data) {
    var a = data && data.assignments;
    if (!a || a.__err) return "";
    var id = a.id;
    if (id !== null && id !== undefined && String(id) !== "" &&
        Number(id) !== 0 && Number(id) !== -1) {
      return String(id);
    }
    var warId = (data.war && (data.war.warId != null ? data.war.warId : data.war.id)) || "";
    var st = a.startTime || a.startedAt || "";
    var dl = a.deadline || "";
    var key = [warId, st, dl, stableTasks(a.tasks)].join("|");
    if (!key.replace(/\|/g, "")) return "";
    return "h:" + fnv1a(key);
  }

  /* ---------------- 正文构造：转义在前，受控标签在后 ---------------- */
  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function convertBody(text) {
    var html = escapeHtml(text == null ? "" : text);
    var cls = { "1": "mo-hl-y", "3": "mo-hl-b" };
    /* <i=N>…</i> 与 <ci=N>…</ci>：1=黄色重点，3=蓝色关键地名，其余剥壳保字 */
    html = html.replace(/&lt;i=([0-9]+)&gt;([\s\S]*?)&lt;\/i&gt;/gi, function (_, n, inner) {
      var c = cls[n] || ""; return c ? '<em class="' + c + '">' + inner + "</em>" : inner;
    });
    html = html.replace(/&lt;ci=([0-9]+)&gt;([\s\S]*?)&lt;\/ci&gt;/gi, function (_, n, inner) {
      var c = cls[n] || ""; return c ? '<em class="' + c + '">' + inner + "</em>" : inner;
    });
    /* 其余受控排版标签（p/br/u/b 等）剥壳保字；未知标签（如 script）保持转义可见，绝不还原 HTML */
    html = html.replace(/&lt;\/?(?:i|ci|u|b|strong|em|p|br|div|span|font)(?:=[0-9]+)?(?:\s[^&<>]*?)?&gt;/gi, "");
    return html.replace(/\r\n/g, "\n").replace(/\n/g, "<br>");
  }

  function buildMajorOrderAnnouncement(data, revision) {
    var a = data.assignments || {};
    var mo = data.major_order || {};
    var ac = data.active_campaign || null;

    /* 正文三级回退：dispatches(NEW MAJOR ORDER) → news 中文 → translated_brief → briefing */
    var disp = (data.dispatches || []).filter(function (n) {
      return n && n.message && /NEW\s+MAJOR\s+ORDER/i.test(n.message);
    }).sort(function (x, y) { return (y.id || 0) - (x.id || 0); });
    var hit = disp[0] || null;
    var zh = "";
    if (hit && hit.id != null) {
      var newsItem = (data.news || []).filter(function (n) { return n && n.id === hit.id; })[0];
      if (newsItem) zh = newsItem.translated || newsItem.message_zh || "";
    }
    var rawText = zh || mo.translated_brief || a.briefing || "";
    if (!rawText && hit) rawText = hit.message;

    /* Banner 四级本地/远程 + 纯 CSS 占位兜底 */
    var bannerSrc = (mo.banner_image_local) || (ac && ac.banner_image_local) ||
                    (ac && ac.banner_image) || "./assets/campaign/banner_eagle3.webp";

    return {
      revision: revision || "",
      title: "MAJOR ORDER",
      titleCn: "重要指令",
      bodyHtml: convertBody(rawText),
      bannerSrc: bannerSrc,
      bannerAlt: (ac && (ac.title_cn || ac.title)) || "重要指令横幅",
      dispatchId: hit ? hit.id : null,
      publishedAt: hit ? (hit.published || "") : ""
    };
  }

  /* ---------------- Banner 预解码（最多 800ms，失败不阻塞） ---------------- */
  function loadBanner(src) {
    return new Promise(function (resolve) {
      if (!src) { resolve(null); return; }
      var img = new Image();
      var done = false;
      var timer = setTimeout(function () { finish(false); }, BANNER_DECODE_MS);
      function finish(ok) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(ok ? src : null);
      }
      img.onload = function () {
        clearTimeout(timer);
        if (img.decode && img.decode.call) {
          img.decode().then(function () { finish(true); }, function () { finish(true); });
        } else finish(true);
      };
      img.onerror = function () { finish(false); };
      img.src = src;
    });
  }

  /* ---------------- DOM 装配 ---------------- */
  var dom = {
    layer: null, notice: null, modal: null, body: null, bannerWrap: null,
    bannerImg: null, title: null, replay: null
  };
  function fillDom(ann) {
    dom.body.innerHTML = ann.bodyHtml;
    dom.title.textContent = ann.title;
    if (ann.bannerSrc) {
      dom.bannerWrap.classList.remove("is-ph");
      dom.bannerImg.style.display = "";
      dom.bannerImg.src = "";          /* 先清，避免旧图闪现 */
      dom.bannerImg.alt = ann.bannerAlt;
      dom.bannerImg.src = ann.bannerSrc;
    } else {
      dom.bannerWrap.classList.add("is-ph");
      dom.bannerImg.removeAttribute("src");
      dom.bannerImg.style.display = "none";
    }
  }

  /* ---------------- 定时器管理 ---------------- */
  function addTimer(fn, ms) {
    var t = setTimeout(function () { timers = timers.filter(function (x) { return x !== t; }); fn(); }, ms);
    timers.push(t);
    return t;
  }
  function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
  }

  /* ---------------- 状态机 ---------------- */
  function isOpen() { return state !== "idle"; }

  function showMajorOrderSequence(opts) {
    opts = opts || {};
    if (state !== "idle") return false;          /* 播放中不叠加图层 */
    var ann = opts.announcement;
    if (!ann && lastData) {
      ann = buildMajorOrderAnnouncement(lastData, opts.revision || lastRevision);
    }
    if (!ann) return false;

    var isReplay = opts.source === "replay";
    state = "incoming";                          /* 先占位：banner 等待期间防叠加 */
    playedRevision = ann.revision || null;
    lastAnnouncement = ann;
    openerEl = document.activeElement;
    var gen = ++closeGen;

    /* 动画开始前最多等 banner.decode() 800ms；超时/失败 → 占位符，播报不阻塞 */
    loadBanner(ann.bannerSrc).then(function (okSrc) {
      if (gen !== closeGen || state !== "incoming") return;   /* 等待期间被关闭 */
      ann.bannerSrc = okSrc || null;
      fillDom(ann);

      dom.layer.dataset.prevOverflow = document.body.style.overflow || "";
      document.body.style.overflow = "hidden";
      document.body.classList.add("mo-alert-open");

      dom.layer.hidden = false;
      void dom.layer.offsetWidth;                /* 强制回流，保证 128ms 淡入可过渡 */
      dom.layer.classList.add("is-open");
      dom.notice.classList.add("is-active");

      /* 动画已开始 → 持久化已看版本（重播不写，不受已看集合约束） */
      if (!isReplay && playedRevision) markSeen(playedRevision);

      /* 1s 后通知条退场 → 面板登台（不重新淡入遮罩） */
      addTimer(function () {
        dom.notice.classList.remove("is-active");
        dom.modal.classList.add("is-active");
        state = "order";
        addTimer(function () { dom.modal.classList.add("is-in"); }, PANEL_DELAY_MS);
      }, NOTICE_MS);
    });
    return true;
  }

  function closeOrder() {
    if (state === "idle" || state === "closing") return;
    state = "closing";
    closeGen++;                                  /* banner 等待中的展示流程作废 */
    clearTimers();                               /* 取消未执行的“通知→正文”切换 */
    var duringNotice = !dom.modal.classList.contains("is-active");
    dom.notice.classList.remove("is-active");
    dom.modal.classList.remove("is-in");         /* 面板缩回 scale(.88)，约 48ms */
    addTimer(function () {
      dom.layer.classList.remove("is-open");     /* 遮罩淡出，约 128ms */
      addTimer(function () {
        dom.layer.hidden = true;
        dom.modal.classList.remove("is-active");
        document.body.classList.remove("mo-alert-open");
        document.body.style.overflow = dom.layer.dataset.prevOverflow || "";
        delete dom.layer.dataset.prevOverflow;
        var focusEl = (openerEl && document.body.contains(openerEl)) ? openerEl
                     : document.getElementById("mo-replay");
        if (focusEl && focusEl.focus) focusEl.focus();
        openerEl = null;
        var wasNotice = duringNotice;
        state = "idle";
        playedRevision = null;
        /* 通知阶段被关闭 → 不补弹正文；播放期间到达的新版本在空闲后播 */
        if (!wasNotice && pendingRevision) {
          var rev = pendingRevision;
          pendingRevision = null;
          addTimer(function () { autoPlay(rev); }, 60);
        } else {
          pendingRevision = null;
        }
      }, BACKDROP_MS);
    }, PANEL_IN_MS);
  }

  /* ---------------- 自动播放判定 ---------------- */
  function readClaim() {
    var raw = store.get(CLAIM_KEY);
    if (!raw) return null;
    try {
      var o = JSON.parse(raw);
      return (o && o.rev && o.tab) ? o : null;
    } catch (_) { return null; }
  }
  function writeClaim(rev) {
    store.set(CLAIM_KEY, JSON.stringify({ rev: rev, tab: TAB_ID, ts: Date.now() }));
  }
  function autoPlay(rev) {
    if (state !== "idle") return;
    if (!rev || hasSeen(rev)) return;
    /* 其他标签页已抢占同一版本 → 本页只记已看不弹 */
    var claim = readClaim();
    if (claim && claim.rev === rev && claim.tab !== TAB_ID && Date.now() - claim.ts < 8000) {
      markSeenLocal(rev);
      return;
    }
    writeClaim(rev);
    if (bc) { try { bc.postMessage({ type: "playing", rev: rev, tab: TAB_ID }); } catch (_) {} }
    showMajorOrderSequence({ source: "auto", revision: rev });
  }

  /* ---------------- 对外入口：refresh() 每次调 ---------------- */
  function notifyData(data) {
    if (!data) return;
    lastData = data;
    var rev = computeRevision(data);
    lastRevision = rev;

    /* 重播按钮可用性：有有效指令即启用，否则禁用 */
    if (dom.replay) dom.replay.disabled = !rev;

    if (!rev) return;
    if (state !== "idle") {
      if (rev !== playedRevision) pendingRevision = rev;   /* 新版本排队，不叠层 */
      return;
    }
    if (hasSeen(rev)) return;
    /* 页面在后台：先挂起，转前台后再播（不写已看，不算触发过） */
    if (typeof document !== "undefined" && document.hidden) {
      deferredRevision = rev;
      return;
    }
    var claim = readClaim();
    if (claim && claim.rev === rev && claim.tab !== TAB_ID && Date.now() - claim.ts < 8000) {
      markSeenLocal(rev);
      return;
    }
    var firstRun = !notifyData._booted;
    notifyData._booted = true;
    if (firstRun) {
      /* 首次数据到达：等载入遮罩淡出再播；期间重进校验 */
      addTimer(function () {
        if (state === "idle" && !hasSeen(rev) && lastRevision === rev &&
            !(typeof document !== "undefined" && document.hidden)) {
          autoPlay(rev);
        }
      }, FIRST_PLAY_DELAY_MS);
    } else {
      autoPlay(rev);
    }
  }

  /* ---------------- 初始化 ---------------- */
  function init() {
    dom.layer = document.getElementById("mo-alert-layer");
    dom.replay = document.getElementById("mo-replay");
    if (!dom.layer) return;
    dom.notice = dom.layer.querySelector(".mo-incoming-notice");
    dom.modal = dom.layer.querySelector(".mo-order-modal");
    dom.body = dom.layer.querySelector(".mo-order-body");
    dom.bannerWrap = dom.layer.querySelector(".mo-banner-wrap");
    dom.bannerImg = dom.layer.querySelector(".mo-order-banner");
    dom.title = document.getElementById("mo-order-title");

    /* 任意区域点击都关闭（通知条 / 正文 / banner / 遮罩） */
    dom.layer.addEventListener("click", function () {
      if (state === "incoming" || state === "order") closeOrder();
    });
    /* Escape / Enter / Space 关闭 */
    document.addEventListener("keydown", function (e) {
      if (state !== "incoming" && state !== "order") return;
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        closeOrder();
      }
    });
    /* 转前台：后台挂起的待播版本在这里起播（同一版本只挂起一次） */
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState !== "visible") return;
      if (state !== "idle" || !deferredRevision) return;
      var rev = deferredRevision;
      deferredRevision = null;
      if (!hasSeen(rev)) autoPlay(rev);
    });
    /* 其他标签页：同步“已播报” → 记已看，避免同时弹出 */
    if (bc) {
      bc.onmessage = function (ev) {
        var m = ev.data;
        if (!m || !m.rev) return;
        if (m.type === "seen" && m.tab !== TAB_ID) markSeenLocal(m.rev);
        if (m.type === "playing" && m.tab !== TAB_ID && state === "idle") markSeenLocal(m.rev);
      };
    }
    /* 重播按钮：不修改版本、不受已看集合限制 */
    if (dom.replay) {
      dom.replay.addEventListener("click", function (e) {
        e.stopPropagation();
        if (state !== "idle") return;
        var rev = lastRevision || (lastData ? computeRevision(lastData) : "");
        if (!rev) return;
        showMajorOrderSequence({
          source: "replay",
          revision: rev,
          announcement: buildMajorOrderAnnouncement(lastData || {}, rev)
        });
      });
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  /* ---------------- 导出 ---------------- */
  global.HD2MoAnnounce = {
    notifyData: notifyData,
    showMajorOrderSequence: showMajorOrderSequence,
    /* 测试钩子（验收脚本用，不参与页面逻辑） */
    _test: {
      computeRevision: computeRevision,
      buildMajorOrderAnnouncement: buildMajorOrderAnnouncement,
      getState: function () { return state; },
      hasSeen: hasSeen,
      markSeen: markSeen,
      clearSeen: function () { store.set(SEEN_KEY, "[]"); },
      storeMode: function () { return store.mode; },
      getDomDebug: function () {
        return {
          noticeCls: dom.notice ? dom.notice.className : null,
          modalCls: dom.modal ? dom.modal.className : null,
          modalTag: dom.modal ? dom.modal.tagName : null,
          modalConnected: dom.modal ? dom.modal.isConnected : null,
          layerConnected: dom.layer ? dom.layer.isConnected : null,
          liveModalCls: (document.getElementById("mo-order-modal") || {}).className || null
        };
      }
    }
  };
})(window);
