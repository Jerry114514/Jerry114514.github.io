"use strict";
/* ============================================================================
 * mechanic-merge.js — 机制页「英文主干 + 中文覆盖」小节级合并引擎
 * ----------------------------------------------------------------------------
 * 纯前端运行时合并，无构建步骤。由 mechanic.html 引入。
 *
 * 主干（data/wiki/zh/mechanics/<id>.json）
 *   文档级：id / title / title_en / description / sections[] / toc[] / source
 *   小节级：level / id / title / content(HTML) / subsections[]
 *
 * 覆盖（data/wiki/zh/mechanics/<id>_zh.json）
 *   文档级：title_zh / description_zh / sections_zh[]
 *   小节级：id | target_id（可选，指向主干小节 id）
 *           title_zh（覆盖标题）
 *           paragraphs_zh[]（纯文本段落，覆盖主干散文）
 *           content_zh（HTML 片段，覆盖主干散文；优先级高于 paragraphs_zh）
 *           tables_zh[]（覆盖该小节的表格；缺省则保留主干表格）
 *           figures_zh[]（覆盖该小节的图片；缺省则保留主干图片）
 *           fully_translated（可选布尔：true = 中文已完整覆盖本节英文散文，
 *                             前端不再渲染该小节的「📄 英文原文」<details> 兜底块；
 *                             缺省 / false 行为不变，仍保留折叠块。见 SCHEMA.md §5.2.2）
 *           subsections_zh[]（与主干 subsections 按同规则递归合并）
 *
 * 合并优先级与回退：
 *   标题     override.title_zh        > trunk.title
 *   散文     override.content_zh      > override.paragraphs_zh > trunk.content(散文部分)
 *   英文兜底  override.fully_translated === true → 不渲染；否则主干英文散文折进 <details>
 *   表格     override.tables_zh       > trunk.content 内的 <table>（缺省保留，不丢）
 *   图片     override.figures_zh      > trunk.content 内的 <figure>（缺省保留，不丢）
 *   小节     override 按 target_id/id → 主干 id → 标题 → 同层序号 匹配；
 *            未匹配上的 sections_zh 追加为页面末尾的 L2 小节（不丢中文）
 *
 * 锚点 id 规则：主干 id（净化为 [A-Za-z0-9._-]，唯一化）> 覆盖 id > s-<序号>
 *              严禁出现下划线占位 id、严禁重复。
 *
 * 内链改写（2026-09-19）：主干与覆盖两侧的 `<a href="/wiki/…">`（wiki 站内相对路径，
 *   本站没有 /wiki 路由 → 全部 404）由 fixLinks 统一改写为站内页 / wiki.gg 外链 /
 *   纯文本，表见 assets/js/wiki-link-map.js；统计数在 page.stats.links。
 * 覆盖方换行（2026-09-19）：content_zh 里的 `\n` 按「分段」语义渲染（纯文本逐行成
 *   <p>；含标签者只认空行分段），避免整节挤成一整段。
 * ==========================================================================*/
var MechanicMerge = (function () {
  var ALLOWED_TAGS = {
    p: 1, div: 1, span: 1, table: 1, tbody: 1, thead: 1, tfoot: 1, tr: 1, th: 1, td: 1,
    caption: 1, ul: 1, ol: 1, li: 1, dl: 1, dt: 1, dd: 1, a: 1, b: 1, strong: 1, i: 1,
    em: 1, u: 1, s: 1, sup: 1, sub: 1, small: 1, big: 1, code: 1, pre: 1, blockquote: 1,
    br: 1, hr: 1, img: 1, h2: 1, h3: 1, h4: 1, h5: 1, h6: 1, figure: 1, figcaption: 1,
    details: 1, summary: 1, mark: 1, abbr: 1, time: 1, cite: 1, q: 1, kbd: 1, samp: 1, var: 1
  };
  var VOID_TAGS = { br: 1, hr: 1, img: 1, link: 1, meta: 1, input: 1 };
  var DROP_TAGS = { script: 1, style: 1, link: 1, meta: 1, iframe: 1, object: 1, embed: 1, form: 1, input: 1, button: 1, nav: 1 };
  var MEDIA_CLASS = "mg-media";
  var TABLE_CLASS = "mg-table";
  var FIGURE_LABEL = "\u56fe ";
  var LINK_BASE_DEFAULT = "https://helldivers.wiki.gg/wiki/";

  /* ---------------------------------------------------------------- 基础工具 */

  function isObj(o) { return o !== null && typeof o === "object"; }
  function arr(o) { return Object.prototype.toString.call(o) === "[object Array]" ? o : null; }

  function esc(s) {
    return String(s === undefined || s === null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function normTitle(s) {
    return String(s || "")
      .replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
      .replace(/[_\uFF08\uFF09()\[\]\u3010\u3011:：,，.。!！?？'"\u2014\u2013-]/g, "")
      .replace(/\s+/g, "").toLowerCase();
  }

  /* ------------------------------------------------- /wiki/ 内链改写（C 项修复）
     正文/表格 HTML 直接复用 helldivers.wiki.gg 的抓取结果，里面每个锚点都是 wiki 站内
     相对路径 `/wiki/<PageName>`。本站没有 /wiki 路由，线上会解析成
     https://jerry114514.github.io/wiki/… → 全线 404（本地则是 http://host/wiki/…）。
     这里按 assets/js/wiki-link-map.js 的表做一次改写（主干散文 / 主干表格 /
     中文表格 / 图片块 / 英文兜底块 一视同仁）：
       ① 站内映射      → 站内详情页（weapon|stratagem|enemy|booster|warbond|mission
                         .html?id=<snake_case> / mechanic.html?id=…#锚点，锚点已换算成站内小节 id）
       ② textOnly 列表 → 拆掉 <a>，只留可见文字（站内与 wiki.gg 都没有该页面时）
       ③ 其余          → https://helldivers.wiki.gg/wiki/<PageName>（保留可见文字，补 target/rel）
     表未加载时退化为「全部按 ③」，链接依然可用（不再 404），不阻断渲染。 */
  function linkMap() {
    return (typeof window !== "undefined" && window.WIKI_LINK_MAP) ? window.WIKI_LINK_MAP : null;
  }

  /* HTML 实体多重转义还原（数据里有 &amp; / &amp;amp; / &amp;amp;amp; 三种写法） */
  function decEntDeep(s) {
    var out = String(s === undefined || s === null ? "" : s);
    for (var i = 0; i < 3; i++) {
      var t = out.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
                 .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
      if (t === out) break;
      out = t;
    }
    return out;
  }

  function stripRelTarget(attrs) {
    return String(attrs || "").replace(/\s+(?:target|rel)="[^"]*"/gi, "");
  }

  /* 去掉 wiki 的「页面不存在，点此编辑」查询串（?action=edit&redlink=1） */
  function stripEditQuery(t) {
    var q = t.indexOf("?");
    if (q < 0 || !/^\?action=edit/.test(t.slice(q))) return t;
    var h = t.indexOf("#", q);
    return t.slice(0, q) + (h >= 0 ? t.slice(h) : "");
  }

  function fixLinks(html, stats) {
    var s = String(html === undefined || html === null ? "" : html);
    if (s.indexOf("/wiki/") < 0) return s;
    var map = linkMap();
    var site = (map && map.site) || {};
    var textOnly = (map && map.textOnly) || [];
    var base = (map && map.externalBase) || LINK_BASE_DEFAULT;
    return s.replace(/<a\b([^>]*?)\shref="\/wiki\/([^"]*)"([^>]*)>([\s\S]*?)<\/a>/gi,
      function (all, pre, raw, post, inner) {
        var target = decEntDeep(raw);
        if (!target) return all;                                  // 空目标：原样保留，不乱猜
        if (stats && stats.links) stats.links.total += 1;
        var dest = site[target];
        if (dest) {
          if (stats && stats.links) stats.links.site += 1;
          return "<a" + stripRelTarget(pre) + ' href="' + esc(dest) + '"' + stripRelTarget(post) + ">" + inner + "</a>";
        }
        if (textOnly.indexOf(target) >= 0) {
          if (stats && stats.links) stats.links.textOnly += 1;
          return inner;                                           // ② 降级为纯文本
        }
        if (stats && stats.links) stats.links.external += 1;
        return "<a" + stripRelTarget(pre) + ' href="' + esc(base + stripEditQuery(target)) +
          '" target="_blank" rel="noopener noreferrer"' + stripRelTarget(post) + ">" + inner + "</a>";
      });
  }

  /* 锚点 id 净化：保留 ASCII 字母数字与 . _ -，其余（中文/空白/标点）→ '-'；折叠；去首尾 '-' */
  function slugId(raw) {
    var s = String(raw === undefined || raw === null ? "" : raw);
    s = s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"');
    var out = "";
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (/[A-Za-z0-9._-]/.test(ch)) out += ch;
      else if (/[\s]/.test(ch)) out += "-";
      else out += "-";
    }
    out = out.replace(/-{2,}/g, "-").replace(/^[-.]+/, "").replace(/[-.]+$/, "");
    if (out.length > 72) out = out.slice(0, 72).replace(/[-.]+$/, "");
    return out;
  }

  /* 统一 id 分配器：保证全域唯一，绝不产生 "_" 这种退化 id */
  function IdAlloc() {
    this.seen = {};
    this.seq = 0;
  }
  IdAlloc.prototype.take = function (preferred) {
    var base = slugId(preferred);
    if (!base || /^[_]+$/.test(base)) {
      do { this.seq++; base = "s-" + this.seq; } while (this.seen[base]);
    }
    var id = base, n = 1;
    while (this.seen[id]) { n++; id = base + "-" + n; }
    this.seen[id] = 1;
    return id;
  };

  /* ------------------------------------------------- 极简 HTML 扫描器
     content 内嵌的 HTML 由抓取器生成，规则性较强。这里做两件事：
       (1) 按顶层节点切块（真正的字符级分词 + 栈，正确处理嵌套与引号内 '>'）
       (2) 允许列表净化
     不用 DOM 解析（不 innerHTML，避免 img 预加载与 console 噪声），也不用动态正则
     （动态正则的前缀匹配陷阱曾把 <table> 误判成 <p> 的闭合标签）。 */

  function cleanText(html) {
    return String(html || "")
      .replace(/<span class="mw-editsection">[\s\S]*?<\/span>/g, "")
      .replace(/<!--[\s\S]*?-->/g, "");
  }

  /* 字符级取一个标签：从 '<' 读到引号外的 '>'，返回 {end, closing, name, selfClosing} */
  function readTag(s, lt) {
    var i = lt + 1, len = s.length, closing = false, name = "", selfClosing = false;
    if (s.charAt(i) === "/") { closing = true; i++; }
    while (i < len && /\s/.test(s.charAt(i))) i++;
    var c0 = s.charAt(i);
    if (!/[A-Za-z]/.test(c0)) return null;                 // "< " 之类不是标签
    while (i < len && /[A-Za-z0-9:-]/.test(s.charAt(i))) { name += s.charAt(i); i++; }
    var quote = "";
    while (i < len) {
      var c = s.charAt(i);
      if (quote) { if (c === quote) quote = ""; }
      else if (c === '"' || c === "'") { quote = c; }
      else if (c === ">") {
        var prev = s.charAt(i - 1);
        if (prev === "/") selfClosing = true;
        return { end: i + 1, closing: closing, name: name.toLowerCase(), selfClosing: selfClosing };
      }
      i++;
    }
    return { end: len, closing: closing, name: name.toLowerCase(), selfClosing: selfClosing, unclosed: true };
  }

  function isVoidName(name) { return VOID_TAGS[name] === 1; }

  /* 顶层节点切块 → [{tag, html}]（tag 为空串表示纯文本块） */
  function topNodes(src) {
    var html = cleanText(src);
    var nodes = [], i = 0, len = html.length, text = "";
    function flushText() {
      if (/[^\s\u00a0]/.test(text)) nodes.push({ tag: "", html: text });
      text = "";
    }
    while (i < len) {
      var lt = html.indexOf("<", i);
      if (lt < 0) { text += html.slice(i); break; }
      text += html.slice(i, lt);
      var t = readTag(html, lt);
      if (!t) { text += html.charAt(lt); i = lt + 1; continue; }   // 裸 '<'，按文本处理
      if (t.closing) { text += html.slice(lt, t.end); i = t.end; continue; }
      flushText();
      if (t.selfClosing || isVoidName(t.name)) {
        nodes.push({ tag: t.name, html: html.slice(lt, t.end) });
        i = t.end;
        continue;
      }
      // 栈式找配对闭合标签（同名嵌套安全，引号内 '>' 不误判）
      var depth = 1, j = t.end, end = -1;
      while (j < len) {
        var jl = html.indexOf("<", j);
        if (jl < 0) break;
        var tj = readTag(html, jl);
        if (!tj) { j = jl + 1; continue; }
        if (tj.name === t.name) {
          if (tj.closing) { depth--; if (depth === 0) { end = tj.end; break; } }
          else if (!tj.selfClosing && !isVoidName(tj.name)) { depth++; }
        }
        j = tj.end;
      }
      if (end < 0) { nodes.push({ tag: t.name, html: html.slice(lt) }); i = len; }
      else { nodes.push({ tag: t.name, html: html.slice(lt, end) }); i = end; }
    }
    flushText();
    return nodes;
  }

  /* 取一个完整元素的「内部 HTML」（用于容器下钻，避免把自身标签再解析一遍） */
  function innerHtml(nodeHtml) {
    var s = String(nodeHtml || "");
    var gt = s.indexOf(">");
    if (gt < 0) return "";
    var open = s.slice(0, gt + 1);
    if (/\/\s*>$/.test(open)) return "";
    var close = s.lastIndexOf("</");
    return close > gt ? s.slice(gt + 1, close) : s.slice(gt + 1);
  }

  function tagNameOf(tag) {
    var m = /^<\s*\/?\s*([A-Za-z][A-Za-z0-9:-]*)/.exec(tag);
    return m ? m[1].toLowerCase() : "";
  }
  function isCloseTag(tag) { return /^<\s*\//.test(tag); }
  function isSelfClosingTag(tag) {
    var n = tagNameOf(tag);
    return isVoidName(n) || /\/\s*>$/.test(tag);
  }

  function sanitizeAttrs(tag) {
    var name = tagNameOf(tag);
    if (!name) return tag;
    var src = tag;
    var attrs = src.replace(/^<\s*[A-Za-z][A-Za-z0-9]*/, "").replace(/\/?>$/, "");
    var out = "", re = /([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g, m;
    while ((m = re.exec(attrs)) !== null) {
      var key = m[1].toLowerCase();
      var val = m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : m[5]);
      if (/^on/.test(key)) continue;                          // 事件属性一律丢弃
      if (key === "style") { out += " " + key + '="' + esc(val) + '"'; continue; }
      if (key === "href" || key === "src") {
        if (/^\s*(javascript|data:text\/html|vbscript)/i.test(val)) continue;
        out += " " + key + '="' + esc(val) + '"'; continue;
      }
      if (key === "class") { out += ' class="mg-raw"'; continue; }
      if (key === "loading" || key === "decoding" || key === "fetchpriority") continue;
      out += " " + key + '="' + esc(val) + '"';
    }
    return "<" + name + out + ">";
  }

  function sanitize(html) {
    var s = cleanText(html);
    return s.replace(/<[^>]+>/g, function (tag) {
      if (/^<\s*\//.test(tag)) {
        var n = tagNameOf(tag);
        return (ALLOWED_TAGS[n] === 1 && DROP_TAGS[n] !== 1) ? "</" + n + ">" : "";
      }
      var name = tagNameOf(tag);
      if (!name || DROP_TAGS[name] === 1 || ALLOWED_TAGS[name] !== 1) return "";
      if (isSelfClosingTag(tag)) return sanitizeAttrs(tag).replace(/>$/, " />");
      return sanitizeAttrs(tag);
    }).replace(/\s+$/g, "");
  }

  /* figure/img 内的 img 去掉懒加载属性，保证一定加载 */
  function hydrateImg(html) {
    return String(html || "")
      .replace(/<img /gi, "<img ")
      .replace(/\sloading="[^"]*"/gi, "")
      .replace(/\sdecoding="[^"]*"/gi, "");
  }

  /* ------------------------------------------------------------ 媒体抽取 */

  function tagHasImage(html) {
    return /<img[\s>]/i.test(html);
  }

  function normalizeMediaKey(raw) {
    var s = String(raw || "");
    var id = /\sid="([^"]+)"/i.exec(s);
    if (id && id[1]) return "id:" + id[1].toLowerCase();
    var srcs = [], re = /<img[^>]*\ssrc="([^"]+)"/gi, m;
    while ((m = re.exec(s)) !== null) srcs.push(m[1]);
    // 表/图的内容指纹：取足量文本（不截断到 60 字符），避免两个不同表格因前 60 字相同而被误判为同一张
    var txt = s.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
    return "k:" + srcs.join(",").toLowerCase() + "|" + txt.slice(0, 400).toLowerCase();
  }

  /* 递归把一段 HTML 拆成：散文块 / 表格块 / 图片块
     - div 只作为容器：内部若含 table / figure / img，则整体作为「图片块」保留；
       若只是包着表格（wiki 常见 flex 布局），则继续下钻，保证表格不被散文顶掉。 */
  function splitContent(content) {
    var prose = [], media = [], tbls = [], figs = [];
    (function walkNodes(nodes, depth) {
      nodes.forEach(function (n) {
        if (n.tag === "figure") {
          var fig = { tag: "figure", html: sanitize(hydrateImg(n.html)), key: normalizeMediaKey(n.html) };
          media.push(fig); figs.push(fig);
          return;
        }
        if (n.tag === "table") {
          var tb = { tag: "table", html: sanitize(n.html), key: normalizeMediaKey(n.html) };
          media.push(tb); tbls.push(tb);
          return;
        }
        if (n.tag === "div" && depth < 4) {
          var hasTable = /<table[\s>]/i.test(n.html);
          if (hasTable && !tagHasImage(n.html)) {
            walkNodes(topNodes(innerHtml(n.html)), depth + 1);   // ③ 只是宽表壳（wiki <div style="overflow:scroll">）
            return;
          }
          if (hasTable) {                                        // ④ 表 + 图标共存：抽走表格，其余继续下钻
            var tm = /<table[\s\S]*?<\/table>/i.exec(n.html);
            var traw = tm ? sanitize(tm[0]) : "";
            if (traw.indexOf("<table") >= 0) {
              var tb2 = { tag: "table", html: traw, key: normalizeMediaKey(traw) };
              media.push(tb2); tbls.push(tb2);
            }
            walkNodes(topNodes(innerHtml(n.html).replace(/<table[\s\S]*?<\/table>/i, "")), depth + 1);
            return;
          }
        }
        if ((n.tag === "div" || n.tag === "p") && tagHasImage(n.html)) {
          var mv = { tag: n.tag, html: sanitize(hydrateImg(n.html)), key: normalizeMediaKey(n.html) };
          media.push(mv); figs.push(mv);
          return;
        }
        prose.push(n.html);
      });
    })(topNodes(content), 0);
    return { prose: prose, media: media, tables: tbls, figures: figs };
  }

  /* 覆盖方表格：{ title, headers, rows, note } */
  function normalizeZhTable(t, idx, mark) {
    if (!isObj(t)) return "";
    var headers = arr(t.headers) || [];
    var rows = arr(t.rows) || [];
    if (!headers.length && !rows.length) return "";
    var key = t.key ? ' data-mg-key="' + esc(t.key) + '"' : "";
    var out = ['<div class="' + TABLE_CLASS + '-wrap" ' + mark + key + '>'];
    if (t.title) out.push('<div class="' + TABLE_CLASS + '-title">' + esc(t.title) + "</div>");
    out.push('<table class="wikitable">');
    var text = function (v) { return v === undefined || v === null ? "" : esc(v); };
    if (headers.length === 1) {
      out.push("<tbody><tr><th colspan=\"2\">" + text(headers[0]) + "</th></tr>");
      rows.forEach(function (r) {
        var cells = arr(r) || [];
        if (cells.length <= 1) out.push('<tr><th colspan="2">' + text(cells[0]) + "</th></tr>");
        else out.push("<tr><td>" + text(cells[0]) + "</td><td>" + text(cells[1]) + "</td></tr>");
      });
    } else if (headers.length === 0) {
      out.push("<tbody>");
      rows.forEach(function (r) {
        out.push("<tr>" + (arr(r) || []).map(function (c) { return "<td>" + text(c) + "</td>"; }).join("") + "</tr>");
      });
    } else {
      out.push("<thead><tr>" + headers.map(function (h) { return "<th>" + text(h) + "</th>"; }).join("") + "</tr></thead><tbody>");
      rows.forEach(function (r) {
        var cells = arr(r) || [];
        if (cells.length < headers.length) {
          out.push('<tr><th colspan="' + headers.length + '">' + text(cells[0]) + "</th></tr>");
        } else {
          out.push("<tr>" + cells.map(function (c) { return "<td>" + text(c) + "</td>"; }).join("") + "</tr>");
        }
      });
    }
    out.push("</tbody></table>");
    if (t.note) out.push('<div class="' + TABLE_CLASS + '-note">' + esc(t.note) + "</div>");
    out.push("</div>");
    return out.join("");
  }

  /* 主干表格（原始 HTML）→ 带横向滚动容器的节点 */
  function wrapTrunkTable(html, idx, from, key) {
    var raw = sanitize(html);
    if (raw.indexOf("<table") < 0) return "";
    return '<div class="' + TABLE_CLASS + '-wrap" data-mg-from="' + from + '" data-mg-key="' + esc(key || "") + '">' + raw + "</div>";
  }

  /* 覆盖方表格节点：{ html } 或 { title, headers, rows, note } */
  function normalizeTableNode(t, idx, from) {
    var mark = 'data-mg-from="' + from + '"';
    if (isObj(t) && t.html) {
      var raw = sanitize(t.html);
      if (raw.indexOf("<table") < 0) return "";
      var title = t.title ? '<div class="' + TABLE_CLASS + '-title">' + esc(t.title) + "</div>" : "";
      var note = t.note ? '<div class="' + TABLE_CLASS + '-note">' + esc(t.note) + "</div>" : "";
      return '<div class="' + TABLE_CLASS + '-wrap" ' + mark + ' data-mg-key="' + esc(t.key || "") + '">' + title + raw + note + "</div>";
    }
    return normalizeZhTable(t, idx, mark);
  }

  function normalizeFigureNode(f, idx, from) {
    var mark = 'data-mg-from="' + from + '"';
    var key = (isObj(f) && f.key) ? ' data-mg-key="' + esc(f.key) + '"' : "";
    var html = isObj(f) && f.html ? f.html : "";
    if (html) {
      var one = sanitize(hydrateImg(html));
      return '<div class="' + MEDIA_CLASS + '" ' + mark + key + ">" + one + "</div>";
    }
    // 结构化写法：{ src, alt, caption_zh, caption, link }
    if (isObj(f) && f.src) {
      return '<figure class="' + MEDIA_CLASS + '" ' + mark + key + '><img src="' + esc(f.src) + '" alt="' +
        esc(f.alt || f.caption || "") + '" />' +
        ((f.caption_zh || f.caption) ? "<figcaption>" + esc(f.caption_zh || f.caption) + "</figcaption>" : "") +
        "</figure>";
    }
    return "";
  }

  /* --------------------------------------------------------------- 合并主流程 */

  function build(trunk, override, opts) {
    opts = opts || {};
    var zh = isObj(override) ? override : {};
    var stats = { tables: 0, figures: 0, proseZh: 0, proseTrunk: 0, zhOnly: [], warnings: [], fullyTranslated: 0,
                  links: { total: 0, site: 0, external: 0, textOnly: 0 } };
    var zhSections = arr(zh.sections_zh) || [];
    var trunkList = arr(trunk.sections) || [];

    function sup(s) { return String(s || "").toLowerCase(); }

    var alloc = new IdAlloc();

    function mergeNode(s, zhNode, depth) {
      var isTrunk = isObj(s);
      var z = isObj(zhNode) ? zhNode : {};
      var level = isTrunk ? (s.level || (depth === 1 ? 2 : 3)) : Math.min(4, Math.max(2, depth + 1));
      var idSource = isTrunk ? s.id : (z.id || z.target_id || z.title_zh);
      var id = alloc.take(idSource);
      var title = z.title_zh || (isTrunk ? s.title : "") || "";
      var srcTitle = z.title_zh ? "zh" : (isTrunk ? "trunk" : "zh");

      // 主干侧拆解：散文 / 表格 / 图片
      var split = isTrunk ? splitContent(s.content) : { prose: [], media: [], tables: [], figures: [] };
      var zhProse = proseFromOverride(z);
      var hasProseOverride = zhProse !== null;
      // 覆盖方散文里若内嵌 <table>（现有 galactic_war_zh.json 就有一张），抽出来与主干表格同规格渲染
      // （统一套横向滚动壳，窄屏不被挤爆）
      var zhInline = hasProseOverride ? extractTables(zhProse) : null;
      if (zhInline) zhProse = zhInline.rest;

      // 该小节是否已由覆盖方声明「整节翻译完成」（见 SCHEMA.md §5.2.2）
      var fullyTranslated = z.fully_translated === true;

      var contentHtml, proseSource, trunkRefHtml = "";
      if (hasProseOverride) {
        contentHtml = zhProse;
        proseSource = "zh";
        // 英文原文兜底：中文散文覆盖时，把该小节「本节自有」的英文散文档折进 <details>，
        // 保证信息量不因覆盖而消失（表格/图片不在这里重复，它们仍渲染在正文里）。
        // 覆盖方写了 fully_translated: true（= 中文已完整覆盖本节英文散文）时不再渲染该兜底块；
        // 未写该字段的小节行为完全不变，仍保留 <details> 兜底。
        if (isTrunk && split.prose.length && !fullyTranslated) trunkRefHtml = split.prose.join("");
        if (fullyTranslated) stats.fullyTranslated += 1;
      } else if (isTrunk) {
        contentHtml = split.prose.join("");
        proseSource = split.prose.length ? "trunk" : "none";
      } else {
        contentHtml = "";
        proseSource = "none";
      }

      // 表格：覆盖优先，否则保留主干
      var tablesHtml = [], tablesSource;
      var handled = {};
      var zhTables = arr(z.tables_zh);
      if (zhTables && zhTables.length) {
        zhTables.forEach(function (t, i) { tablesHtml.push(normalizeTableNode(t, i, "zh")); });
        tablesSource = "zh";
      } else {
        split.tables.forEach(function (t, i) {
          handled[t.key] = 1;
          tablesHtml.push(wrapTrunkTable(t.html, i, "trunk", t.key));
        });
        tablesSource = split.tables.length ? "trunk" : "none";
      }

      // 图片：覆盖优先，否则保留主干（主干侧按 key 去重，避免容器与内层重复）
      var figsHtml = [], figsSource;
      var zhFigs = arr(z.figures_zh);
      if (zhFigs) {
        zhFigs.forEach(function (f, i) { figsHtml.push(normalizeFigureNode(f, i, "zh")); });
        figsSource = zhFigs.length ? "zh" : "none";
      } else {
        split.figures.forEach(function (f, i) {
          if (f.key && handled[f.key]) return;
          if (f.key) handled[f.key] = 1;
          figsHtml.push(normalizeFigureNode(f, i, "trunk"));
        });
        figsSource = split.figures.length ? "trunk" : "none";
      }
      tablesHtml = tablesHtml.filter(Boolean);
      figsHtml = figsHtml.filter(Boolean);
      if (zhInline && zhInline.tables.length) {
        zhInline.tables.forEach(function (h) { tablesHtml.push(wrapTrunkTable(h, 0, "zh")); });
      }

      // 同一小节内去重：只清除「容器与内层」这类同源重复，不跨小节合并
      // （同类图标在不同小节重复出现是正常的，跨节去重会丢内容）
      var secSeen = {}, dupHere = 0;
      tablesHtml = tablesHtml.filter(function (h) {
        var k = keyOf(h);
        if (!k || !secSeen[k]) { if (k) secSeen[k] = 1; return true; }
        dupHere++; return false;
      });
      figsHtml = figsHtml.filter(function (h) {
        var k = keyOf(h);
        if (!k || !secSeen[k]) { if (k) secSeen[k] = 1; return true; }
        dupHere++; return false;
      });
      stats.dupInSection = (stats.dupInSection || 0) + dupHere;

      if (tablesHtml.length) stats.tables += tablesHtml.length;
      if (figsHtml.length) stats.figures += figsHtml.length;
      if (proseSource === "zh") stats.proseZh += 1; else if (proseSource === "trunk") stats.proseTrunk += 1;

      // 子节递归：只以主干子节为准匹配，未配对上的中文子节作为「溢出分支」整体保留
      var trunkSubs = isTrunk && arr(s.subsections) ? s.subsections : [];
      var zhSubs = arr(z.subsections_zh) || [];
      var pairedSubs = pairUp(trunkSubs, zhSubs, level);
      var subNodes = pairedSubs.nodes.map(function (p) {
        return mergeNode(p.trunk, p.zh, depth + 1);
      });
      pairedSubs.zhExtra.forEach(function (zs) {
        subNodes.push(mergeNode(null, zs, depth + 1));
      });

      return {
        id: id, level: level, title: title, content: contentHtml,
        tablesHtml: tablesHtml, figuresHtml: figsHtml, subsections: subNodes,
        trunkRefHtml: trunkRefHtml,
        source: { title: srcTitle, prose: proseSource, tables: tablesSource, figures: figsSource }
      };
    }

    /* ---- 同层配对：显式 id 优先，其余按序号 1:1 ----
       规则（经 4 个机制页实测后被刻意做成「简单可预测」）：
         ① 覆盖小节写了 id / target_id 且命中主干 id → 无视序号，直接配对（推荐的写法）；
         ② 其余按序号一一对应，直到某一侧先耗尽；
         ③ 多出来的中文小节不丢，按原层级追加到父节末尾；
         ④ 主干多出来的小节保持英文主干内容（含表格/图片）。

       为什么不按「编辑距离/diff」自动对齐：实测 damage_zh 的 Damage Calculation 下
       主干 16 节、中文 18 节（中文多出「拆毁值与结构」「其他结构」，且缺 ExDR 一节）。
       「整体平移 2 位」与「按下标对齐」在纯字符串距离下几乎等价，而只有后者与数据的
       书写顺序一致（中文就是按主干顺序逐条翻译的）。自动平移会把中文散文整体错位贴到
       相邻小节上（标题与内容对不上），比「多出的两节挂到父节末尾」有害得多。
       要彻底消除歧义，请在覆盖文件里给小节写 id（见 SCHEMA.md §5.2）。 */
    function pairUp(trunkList, zhList, parentLevel) {
      var pair = {}, usedZh = {}, zhExtra = [], ambiguous = [];
      var byId = {};
      zhList.forEach(function (z, k) {
        var want = z && (z.target_id || z.id);
        if (want && !byId[sup(want)]) byId[sup(want)] = k;
      });
      trunkList.forEach(function (s, i) {
        if (s.id && byId[sup(s.id)] !== undefined && !usedZh[byId[sup(s.id)]]) {
          pair[i] = byId[sup(s.id)];
          usedZh[pair[i]] = 1;
          return;
        }
        if (!usedZh[i] && i < zhList.length) {
          pair[i] = i;
          usedZh[i] = 1;
          var zi = isObj(zhList[i]) ? zhList[i] : {};
          var ts = arr(s.subsections) ? s.subsections.length : 0;
          var zs = arr(zi.subsections_zh) ? zi.subsections_zh.length : 0;
          // 结构不一致（一侧有子节、另一侧没有）时给出「对齐存疑」提示，便于下一步在覆盖文件里写 id
          if ((ts > 0) !== (zs > 0)) {
            ambiguous.push({ level: (parentLevel || 1) + 1, trunk: s.title, zh: zi.title_zh, score: 0 });
          }
        }
      });
      zhList.forEach(function (z, i) { if (!usedZh[i]) zhExtra.push(z); });
      return {
        nodes: trunkList.map(function (s, i) { return { trunk: s, zh: pair[i] === undefined ? null : zhList[pair[i]] }; }),
        zhExtra: zhExtra,
        ambiguous: ambiguous
      };
    }

    var topPair = pairUp(trunkList, zhSections, 1);
    var merged = topPair.nodes.map(function (p) { return mergeNode(p.trunk, p.zh, 1); });
    if (topPair.ambiguous.length) { stats.ambiguous = topPair.ambiguous; }

    // 主干里没有对应小节的中文小节：整支追加到页尾（中文一律不丢）
    var appended = [];
    topPair.zhExtra.forEach(function (zs) {
      var node = mergeNode(null, zs, 1);
      if (node.title || node.content || node.subsections.length) {
        node.zhOnly = true;
        stats.zhOnly.push(node.title || "(无标题)");
      }
      appended.push(node);
    });

    merged = merged.concat(appended);
    merged = merged.filter(function (n) { return n && (n.title || n.content || n.tablesHtml.length || n.figuresHtml.length || (n.subsections && n.subsections.length)); });

    /* /wiki/ 内链改写（C 项）：主干散文、主干/中文表格、图片块、英文兜底块统一过一遍，
       主干与中文覆盖两处同时生效（渲染层单一入口，避免两处数据各自为政）。 */
    (function fixTree(list) {
      list.forEach(function (n) {
        n.content = fixLinks(n.content, stats);
        n.trunkRefHtml = fixLinks(n.trunkRefHtml, stats);
        n.tablesHtml = (n.tablesHtml || []).map(function (h) { return fixLinks(h, stats); });
        n.figuresHtml = (n.figuresHtml || []).map(function (h) { return fixLinks(h, stats); });
        if (n.subsections && n.subsections.length) fixTree(n.subsections);
      });
    })(merged);

    var page = {
      id: trunk.id || opts.id || "",
      title: zh.title_zh || trunk.title || trunk.title_en || opts.id || "",
      title_en: trunk.title_en || trunk.title || "",
      description: zh.description_zh || trunk.description || "",
      sections: merged,
      toc: buildToc(merged),
      stats: stats,
      source: {
        title: zh.title_zh ? "zh" : "trunk",
        description: zh.description_zh ? "zh" : "trunk"
      }
    };
    return page;
  }

  function keyOf(html) {
    var m = /data-mg-key="([^"]*)"/.exec(String(html || ""));
    return m ? m[1] : "";
  }

  /* 从一段 HTML 里抽出所有顶层 <table>（用于覆盖方散文内嵌表格：统一套横向滚动壳） */
  function extractTables(html) {
    var nodes = topNodes(html);
    var rest = [], tables = [];
    nodes.forEach(function (n) {
      if (n.tag === "table") tables.push(sanitize(n.html));
      else rest.push(n.html);
    });
    return { rest: linkText(rest.join("")), tables: tables };
  }

  function buildToc(nodes) {
    var toc = [];
    (function walk(list) {
      list.forEach(function (n) {
        toc.push({ level: n.level, id: n.id, title: n.title });
        if (n.subsections && n.subsections.length) walk(n.subsections);
      });
    })(nodes);
    return toc;
  }

  /* 纯文本 → 逐行分段（数据里的 \n 是「分段」语义；这些串的 \n 全部落在句末，
     没有句中软换行，见 SCHEMA/审计记录） */
  function textToParagraphs(txt) {
    var lines = String(txt).split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean);
    return lines.map(function (x) { return '<p class="mg-p">' + esc(x) + "</p>"; }).join("");
  }

  /* 含标签的 content_zh：只把「两侧都是正文、中间带空行」的换行升级为段落边界；
     紧贴标签的换行（</li>\n<li>、HTML 源码缩进）一律不动 —— 那些是格式缩进。 */
  function blankLineBreaks(html) {
    return String(html).replace(/([^\s>])\s*\n\s*\n\s*([^\s<])/g, '$1</p><p class="mg-p">$2');
  }

  /* 覆盖方散文：content_zh > paragraphs_zh > null（无覆盖）
     content_zh 里作者用 \n 分段，但 HTML 会把 \n 折叠成空格，整节于是挤成一整段
     （2026-09-19 修）。分两种情形处理，避免误伤：整串不含标签 → 按行分段；
     含标签 → 只认空行分段。 */
  function proseFromOverride(z) {
    if (!isObj(z)) return null;
    if (typeof z.content_zh === "string" && z.content_zh.trim() !== "") {
      var raw = z.content_zh;
      if (!/<[a-zA-Z\/]/.test(raw)) {
        return raw.split(/\r?\n/).length > 1 ? textToParagraphs(raw) : linkText(sanitize(raw));
      }
      // 顺序要紧：先 sanitize（它会把任何 class 统一改写成 mg-raw），再插段落边界，
      // 否则新生成的 <p class="mg-p"> 会被改写成 mg-raw、丢掉段落样式。
      return linkText(blankLineBreaks(sanitize(raw)));
    }
    var ps = arr(z.paragraphs_zh);
    if (ps && ps.length) {
      var out = [];
      ps.forEach(function (p) {
        if (p === undefined || p === null) return;
        var txt = String(p).trim();
        if (!txt) return;
        out.push('<p class="mg-p">' + (/<[a-zA-Z]/.test(txt) ? sanitize(txt) : esc(txt)) + "</p>");
      });
      if (out.length) return out.join("");
      return null;
    }
    return null;
  }

  /* wiki 内链在中文页没有对应目标，退化为纯文本（保持可读、避免英文链接名突兀） */
  function linkText(html) {
    return String(html || "").replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, "$1");
  }

  return {
    build: build,
    slugId: slugId,
    splitContent: splitContent,
    topNodes: topNodes,
    version: "1.0.0"
  };
})();
