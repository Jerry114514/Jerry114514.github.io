"use strict";
/* wiki 首页区块系统（2026-09 自 wiki.html 零改机抽取）
   读 index.json 配置 → 拉取 blocks/*.json → renderBlock 声明式渲染
   页面接入: WikiBlocks.render(document.getElementById("wiki-grid")) */
var WikiBlocks = (function () {
  const WIKI_BASE = "./data/wiki/zh";

    async function loadWiki() {
      const grid = document.getElementById("wiki-grid");
      try {
        const configResp = await fetch(WIKI_BASE + "/index.json?t=" + Date.now(), { cache: "no-store" });
        if (!configResp.ok) throw new Error("HTTP " + configResp.status);
        const config = await configResp.json();
        const blocks = config.blocks || [];
        const html = [];
        for (const block of blocks) {
          try {
            const resp = await fetch(WIKI_BASE + "/blocks/" + block.id + ".json?t=" + Date.now(), { cache: "no-store" });
            if (!resp.ok) continue;
            const data = await resp.json();
            html.push(renderBlock(data, block.type));
          } catch (e) {
            console.warn("[Wiki] 加载板块失败:", block.id, e);
          }
        }
        grid.innerHTML = html.join("");
      } catch (e) {
        console.error("[Wiki] 加载失败:", e);
        grid.innerHTML = '<div class="loading">⚠️ 维基数据加载失败，请刷新重试</div>';
      }
    }

    function renderBlock(data, type) {
      var cls = "wiki-card";
      if (type === "full-width") cls += " full-width";
      switch (data.id) {
        case "welcome":
          return '<div class="' + cls + '">' +
            '<h2>' + esc(data.title) + '</h2>' +
            '<p style="font-size:0.9rem;color:var(--yellow);margin-bottom:8px">' + esc(data.subtitle) + '</p>' +
            '<p>' + esc(data.content) + '</p>' +
            (data.buttons ? data.buttons.map(function(b) { return '<a class="btn" href="' + esc(b.link) + '">' + esc(b.text) + '</a>'; }).join("") : "") +
            '</div>';
        case "about":
          return '<div class="' + cls + '">' +
            '<h2>' + esc(data.title) + '</h2>' +
            '<p>' + esc(data.content) + '</p>' +
            '<ul class="features-list">' + (data.features || []).map(function(f) { return '<li>' + esc(f) + '</li>'; }).join("") + '</ul>' +
            '</div>';
        case "navigation":
          return '<div class="' + cls + '">' +
            '<h2>' + esc(data.title) + '</h2>' +
            '<div class="nav-grid">' + (data.categories || []).map(function(c) {
              return '<a class="nav-item" href="' + esc(c.link) + '">' +
                '<span class="icon">' + c.icon + '</span>' +
                '<div><div>' + esc(c.name) + '</div><div class="desc">' + esc(c.description) + '</div></div>' +
                '<span class="count">' + c.count + '</span>' +
                '</a>';
            }).join("") + '</div></div>';
        case "news":
          return '<div class="' + cls + '">' +
            '<h2>' + esc(data.title) + '</h2>' +
            (data.items || []).map(function(n) {
              return '<div class="news-item"><div class="news-date">' + esc(n.date) + '</div><div class="news-title">' + esc(n.title) + '</div><div class="news-summary">' + esc(n.summary) + '</div></div>';
            }).join("") +
            (data.link ? '<a class="btn" href="' + esc(data.link) + '">查看更多</a>' : "") +
            '</div>';
        case "factions":
          return '<div class="' + cls + '">' +
            '<h2>' + esc(data.title) + '</h2>' +
            (data.factions || []).map(function(f) {
              return '<div class="faction-card" style="border-left:3px solid ' + f.color + '">' +
                '<div class="faction-name" style="color:' + f.color + '">' + f.icon + ' ' + esc(f.name) + '</div>' +
                '<p>' + esc(f.description) + '</p></div>';
            }).join("") + '</div>';
        case "beginners":
          return '<div class="' + cls + '">' +
            '<h2>' + esc(data.title) + '</h2>' +
            (data.sections || []).map(function(s) {
              return '<div class="beginners-section"><h3>' + esc(s.title) + '</h3><ul>' +
                (s.items || []).map(function(i) { return '<li>' + esc(i) + '</li>'; }).join("") + '</ul></div>';
            }).join("") + '</div>';
        default:
          return '<div class="' + cls + '"><h2>' + esc(data.title || data.id) + '</h2><p>' + esc(data.content || "") + '</p></div>';
      }
    }

    function esc(s) { return String(s || "").replace(/[&<>"']/g, function(c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    }); }

  return { render: loadWiki };
})();
