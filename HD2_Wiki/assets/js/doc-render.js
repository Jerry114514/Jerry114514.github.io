/* ============================================================
   HD2 中文维基 · 长文档页运行时渲染器
   使用页面：contributing.html / schema.html
   ------------------------------------------------------------
   做四件事，全部在浏览器里完成，页面本身不存正文：

     ① 运行时 fetch 同源的 .md（GitHub Pages 对 .md 返回
        `text/markdown; charset=utf-8`，实测 200/206，`res.text()` 不受
        Content-Type 影响）→ 用站内 vendored 的 marked 渲染；
        单一真相源仍是仓库里的 .md，页面永不漂移。
     ② 给 h1–h4 补 id：算法与 GitHub 的 slugger 对齐（去标点、空格转
        `-`、中文与 emoji 保留、重名追加 -1/-2），所以
        `CONTRIBUTING.md#2-怎么改` 这类锚点在站内页面上同样能跳。
     ③ 改写链接：外站加 `target="_blank" rel="noopener noreferrer"`；
        仓库内相对路径（如 `HD2_Wiki/data/wiki/zh/boosters.json`）改写成
        `https://github.com/.../blob/main/...`（目录用 tree），
        避免在站点上 404；已在 routes 里登记的路径改指站内页面。
     ④ 用 h2/h3 生成目录（桌面吸顶右栏 / ≤1024px 吸顶抽屉）+ 滚动高亮。

   依赖：./vendor/marked.min.js（marked v15.0.7，UMD，暴露 window.marked）
   页面通过 `window.DOC_PAGE` 传入配置，见两个 HTML 页的 <script>。
   本文件不使用 console，失败时在正文区渲染可点击的降级提示。
   ============================================================ */
(function () {
  "use strict";

  var REPO = "https://github.com/Jerry114514/Jerry114514.github.io";
  var BLOB = REPO + "/blob/main/";
  var TREE = REPO + "/tree/main/";
  var SITE = "https://jerry114514.github.io/";

  var cfg = window.DOC_PAGE || {};
  var article = document.getElementById("doc-body");
  var tocBox = document.getElementById("doc-toc");
  var tocList = document.getElementById("doc-toc-list");
  var tocToggle = document.getElementById("doc-toc-toggle");
  var fetchedEl = document.getElementById("doc-fetched");

  if (!article) return;

  /* ── GitHub 同款 slug（github-slugger 的标点集合） ───────────── */
  var PUNCT = new RegExp(
    "[\\u0000-\\u001F\\u0021-\\u002C\\u002E-\\u002F\\u003A-\\u0040" +
    "\\u005B-\\u005E\\u0060\\u007B-\\u007E\\u00A0-\\u00A9\\u00AB-\\u00B4" +
    "\\u00B6-\\u00B9\\u00BB-\\u00BF\\u2000-\\u206F\\u3000-\\u3004" +
    "\\u3008-\\u3020\\u3030\\uFF01-\\uFF0F\\uFF1A-\\uFF20\\uFF3B-\\uFF40" +
    "\\uFF5B-\\uFF65]", "g");

  function ghSlug(text) {
    return String(text).toLowerCase().trim().replace(PUNCT, "").replace(/ /g, "-");
  }

  function pad2(n) { return n < 10 ? "0" + n : String(n); }

  function nowLabel() {
    var d = new Date();
    return pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }

  /* ── 标题 id + 锚点链接 + 目录条目 ─────────────────────────── */
  function decorateHeadings(root) {
    var used = Object.create(null);
    var heads = root.querySelectorAll("h1, h2, h3, h4");
    var items = [];

    Array.prototype.forEach.call(heads, function (h) {
      var text = h.textContent.replace(/\s+/g, " ").trim();
      var base = ghSlug(text) || "section";
      var n = used[base] || 0;
      used[base] = n + 1;
      var id = n === 0 ? base : base + "-" + n;
      h.id = id;

      if (h.tagName !== "H1") {
        var a = document.createElement("a");
        a.className = "doc-anchor";
        a.setAttribute("href", "#" + id);
        a.setAttribute("aria-label", "本节链接");
        a.textContent = "#";
        h.appendChild(a);
      }

      var lv = h.tagName === "H2" ? 2 : (h.tagName === "H3" ? 3 : 0);
      if (lv) items.push({ id: id, text: text, lv: lv });
    });

    return items;
  }

  /* ── 表格：套站点唯一的横滚壳 `.table-wrap` ───────────────── */
  function wrapTables(root) {
    var tables = root.querySelectorAll("table");
    Array.prototype.forEach.call(tables, function (t) {
      if (t.parentNode && t.parentNode.className &&
          String(t.parentNode.className).indexOf("table-wrap") >= 0) return;
      var first = t.querySelector("tr");
      if (first && first.children.length >= 4) t.className += " doc-table-wide";
      var box = document.createElement("div");
      box.className = "table-wrap";
      t.parentNode.insertBefore(box, t);
      box.appendChild(t);
    });
  }

  /* ── 链接改写 ─────────────────────────────────────────────── */
  function isAbsolute(href) {
    return /^[a-z][a-z0-9+.-]*:/i.test(href) || href.slice(0, 2) === "//";
  }

  function markExternal(a) {
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer");
  }

  function resolveTarget(href) {
    var hash = "", query = "";
    var i = href.indexOf("#");
    if (i >= 0) { hash = href.slice(i); href = href.slice(0, i); }
    var j = href.indexOf("?");
    if (j >= 0) { query = href.slice(j); href = href.slice(0, j); }

    var dir = /\/$/.test(href) || href === "";
    var parts = String(cfg.sourceDir || "").split("/").filter(Boolean);
    href.split("/").forEach(function (seg) {
      if (seg === "" || seg === ".") return;
      if (seg === "..") { parts.pop(); return; }
      parts.push(seg);
    });
    return { path: parts.join("/"), hash: hash, query: query, dir: dir };
  }

  function rewriteLinks(root) {
    var routes = cfg.routes || {};
    var anchors = root.querySelectorAll("a[href]");

    Array.prototype.forEach.call(anchors, function (a) {
      var raw = a.getAttribute("href");
      if (!raw) return;
      var href = raw.trim();
      if (!href || href.charAt(0) === "#") return;

      if (href.charAt(0) === "/") return;                 // 站内根相对，原样保留
      if (isAbsolute(href)) {
        if (href.indexOf(SITE) !== 0) markExternal(a);     // 站内绝对地址不开新窗
        return;
      }

      var r = resolveTarget(href);
      if (Object.prototype.hasOwnProperty.call(routes, r.path)) {
        a.setAttribute("href", routes[r.path] + r.hash);
        return;
      }
      if (!r.path) { a.setAttribute("href", r.hash || "#"); return; }
      a.setAttribute("href", (r.dir ? TREE : BLOB) + encodeURI(r.path) + r.query + r.hash);
      markExternal(a);
    });
  }

  /* ── 目录 ─────────────────────────────────────────────────── */
  function buildToc(items) {
    if (!tocBox || !tocList || items.length < 3) return false;

    var frag = document.createDocumentFragment();
    items.forEach(function (it) {
      var a = document.createElement("a");
      a.className = it.lv === 3 ? "toc-item lv3" : "toc-item";
      a.setAttribute("href", "#" + it.id);
      a.setAttribute("data-target", it.id);
      a.textContent = it.text;
      frag.appendChild(a);
    });
    tocList.appendChild(frag);
    tocBox.hidden = false;
    return true;
  }

  function initToc() {
    if (tocToggle) {
      tocToggle.addEventListener("click", function () {
        var open = tocBox.classList.toggle("open");
        tocToggle.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }
    if (tocList) {
      tocList.addEventListener("click", function (ev) {
        var node = ev.target;
        while (node && node !== tocList && !(node.className && String(node.className).indexOf("toc-item") >= 0)) {
          node = node.parentNode;
        }
        if (node && node !== tocList) {
          Array.prototype.forEach.call(tocList.querySelectorAll(".toc-item"), function (x) {
            x.classList.remove("active");
          });
          node.classList.add("active");
        }
        if (tocBox.classList.contains("open")) {
          tocBox.classList.remove("open");
          if (tocToggle) tocToggle.setAttribute("aria-expanded", "false");
        }
      });
    }

    var links = Array.prototype.slice.call(tocList.querySelectorAll(".toc-item"));
    var marks = [];
    links.forEach(function (a) {
      var el = document.getElementById(a.getAttribute("data-target"));
      if (el) marks.push({ el: el, a: a });
    });
    if (!marks.length) return;

    var lastRun = 0;
    var tail = null;

    function update() {
      var best = marks[0];
      for (var i = 0; i < marks.length; i++) {
        if (marks[i].el.getBoundingClientRect().top <= 96) best = marks[i];
        else break;
      }
      links.forEach(function (a) { a.classList.remove("active"); });
      best.a.classList.add("active");
    }

    /* 时间戳节流 + 尾调用：不用 requestAnimationFrame ——
       后台标签页里 rAF 完全不触发，会把「pending」状态永久卡住。 */
    function onScroll() {
      var now = Date.now();
      var wait = 100 - (now - lastRun);
      if (wait <= 0) {
        lastRun = now;
        if (tail) { clearTimeout(tail); tail = null; }
        update();
        return;
      }
      if (tail) return;
      tail = setTimeout(function () {
        tail = null;
        lastRun = Date.now();
        update();
      }, wait);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    update();
  }

  /* 正文是渲染完成后才出现的，浏览器处理 URL 片段时锚点还不存在，
     所以 `contributing.html#2-怎么改` 这类深链要在这里手动补一次跳转。
     纯 `#` 链接与提交按钮不在监听范围内。 */
  function applyHash() {
    var raw = location.hash.slice(1);
    if (!raw) return;
    var el = null;
    try { el = document.getElementById(decodeURIComponent(raw)); } catch (e) { el = null; }
    if (!el) el = document.getElementById(raw);
    if (!el) return;
    el.scrollIntoView();
    if (!tocList) return;
    Array.prototype.forEach.call(tocList.querySelectorAll(".toc-item"), function (a) {
      a.classList.toggle("active", a.getAttribute("data-target") === el.id);
    });
  }

  /* ── 降级提示（不写 console） ─────────────────────────────── */
  function fail(message) {
    article.textContent = "";
    var p = document.createElement("p");
    p.className = "doc-note";
    p.appendChild(document.createTextNode(message + " 请直接查看 GitHub 原文："));
    var a = document.createElement("a");
    a.setAttribute("href", cfg.githubUrl || REPO);
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer");
    a.textContent = cfg.sourceLabel || "仓库内的 .md";
    p.appendChild(a);
    p.appendChild(document.createTextNode("。"));
    article.appendChild(p);
  }

  /* ── 主流程 ───────────────────────────────────────────────── */
  function render(md) {
    var html;
    try {
      html = window.marked.parse(md, { gfm: true, breaks: false });
    } catch (e) {
      fail("Markdown 解析失败（" + ((e && e.message) || e) + "）。");
      return;
    }

    article.innerHTML = html;

    /* 页面 <header> 已经有 h1，正文顶部那个同级标题会构成重复的一级标题 */
    var lead = article.querySelector("h1");
    if (lead && !lead.previousElementSibling) lead.parentNode.removeChild(lead);

    var items = decorateHeadings(article);
    wrapTables(article);
    rewriteLinks(article);

    if (buildToc(items)) initToc();
    applyHash();
    window.addEventListener("hashchange", applyHash);
    if (fetchedEl) fetchedEl.textContent = "· 本次读取 " + nowLabel();
  }

  function load() {
    if (!cfg.source) { fail("页面没有配置文档源。"); return; }
    if (!window.marked || typeof window.marked.parse !== "function") {
      fail("Markdown 渲染器（assets/js/vendor/marked.min.js）未能加载。");
      return;
    }

    fetch(cfg.source, { cache: "no-cache" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.text();
      })
      .then(render)
      .catch(function (err) {
        fail("读取 " + (cfg.sourceLabel || cfg.source) + " 失败（" +
             ((err && err.message) || err) + "）。");
      });
  }

  load();
})();
