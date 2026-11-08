"use strict";
/* ==============================================================
   富文本强调（rich-text）· 2026-11-09
   --------------------------------------------------------------
   Arrowhead 的 dispatch / 公告原文带受控内联标记（官方简中原文里就是这些标签）：

     <i=1>重要文本</i>    黄色重点（--mo-yellow #F5C518）
     <i=3>标题/关键地名</i> 蓝色关键信息（--mo-place #5BA3D0）
     <ci=N>…</ci>         与 <i=N> 同义（旧版写法，保留兼容）
     裸 <i>文本</i>       没写编号，按 1（黄色重点）处理
     其它编号            只剥壳、保留文字（不猜测颜色）

   约定与安全：
   - **先转义、后受控替换**：原文里除上述标记外的任何标签（含 script）都不会被还原成 HTML；
   - 只保留 <b>/<strong> 的加粗语义，其余排版标签（p/br/u/div/span/font）剥壳保字；
   - 换行统一转 <br>；
   - 翻译链路（HD2Web-Trans）输出的 *_zh 字段是**无格式纯文本**，因此需要强调时必须取
     official_message / raw_message 这类带标签的原文，而不是 translated；
   - 渲染入口只有这一处：主站首页、重要指令播报、站点战报都调用 HD2Rich.toHtml，
     复制/导出文本走 HD2Rich.toPlain（或节点 textContent，天然无标签）。
   ============================================================= */
(function (root) {
  "use strict";

  var ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  var HL = { "1": "rt-hl-y", "3": "rt-hl-b" };

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ESC[c]; });
  }

  /* 原文 → 带 <em class="rt-hl-y|rt-hl-b"> 的安全 HTML */
  function toHtml(text) {
    if (text == null) return "";
    /* 占位符：先挑出白名单标记，其余标签在原文层直接剥壳，最后再还原白名单。
       这样带引号/& 的属性（img onerror 等）也不会以转义文本的形式漏出来。 */
    var Y = "\u0001Y\u0001", B = "\u0001B\u0001", SO = "\u0001O\u0001";
    var CE = "\u0001E\u0001", CS = "\u0001S\u0001", BR = "\u0001R\u0001";
    var s = String(text)
      .replace(/[\u0001\u0002]/g, "")
      .replace(/<\s*(?:script|style)\b[^>]*>[\s\S]*?<\/\s*(?:script|style)\s*>/gi, "")
      .replace(/\r\n?/g, "\n");

    /* 1) 成对的 <i=N>…</i> / <ci=N>…</ci>：1=黄 3=蓝，省略编号按 1，其它编号剥壳 */
    s = s.replace(/<(i|ci)(?:=(\d+))?>([\s\S]*?)<\/\1>/gi, function (_, tag, n, inner) {
      var cls = HL[n == null ? "1" : String(n)];
      return cls ? (cls === "rt-hl-y" ? Y : B) + inner + CE : inner;
    });

    /* 2) 加粗语义保留（官方原文里偶见 <b>/<strong>） */
    s = s.replace(/<b>|<strong>/gi, SO).replace(/<\/b>|<\/strong>/gi, CS);

    /* 3) 换行与段落：<br> 转真换行，段落标签去掉（原文用空行分段） */
    s = s.replace(/<br\s*\/?>/gi, BR);
    s = s.replace(/<\/?p(?:\s[^>]*)?>/gi, "");

    /* 4) 其余任何标签（含未闭合的 <i=N>、script 等）一律剥壳保字，绝不还原 */
    s = s.replace(/<[^>]*>/g, "");

    /* 5) 转义后还原白名单标记，文本换行 → <br> */
    return escapeHtml(s)
      .replace(/\u0001Y\u0001/g, '<em class="rt-hl-y">')
      .replace(/\u0001B\u0001/g, '<em class="rt-hl-b">')
      .replace(/\u0001O\u0001/g, "<strong>")
      .replace(/\u0001E\u0001/g, "</em>")
      .replace(/\u0001S\u0001/g, "</strong>")
      .replace(/\u0001R\u0001/g, "<br>")
      .replace(/\n/g, "<br>");
  }

  /* 原文 → 纯文本（复制、导出、日志；与 toHtml 同一套剥壳规则） */
  function toPlain(text) {
    if (text == null) return "";
    return String(text)
      .replace(/<\s*(script|style)\b[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/?[a-zA-Z][^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&");
  }

  root.HD2Rich = { escapeHtml: escapeHtml, toHtml: toHtml, toPlain: toPlain };
})(typeof window !== "undefined" ? window : globalThis);
