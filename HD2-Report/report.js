(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const M = window.HD2Report;
  const base = "../HD2-Galatic_war-Map/";
  const esc = text => String(text ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  let current = null, busy = false;
  function status(text, type = "") { $("status").textContent = text; $("status").className = `status ${type}`; }

  function meter(bar) {
    const known = M.number(bar.value) != null;
    const value = known ? Math.max(0, Math.min(100, bar.value)) : 0;
    const marker = M.number(bar.marker) == null ? "" : `<span class="meter-marker" style="left:${Math.max(0, Math.min(100, bar.marker))}%" title="按指令时间推算的预期进度 ${esc(M.percent(bar.marker))}"></span>`;
    const arrow = { right: "→", left: "←", still: "＝", unknown: "?" }[bar.direction] || "";
    const label = bar.side ? `<span>${esc(bar.label)} <strong>${esc(M.percent(bar.value))}</strong></span><span class="trend ${esc(bar.tone)}">${arrow} ${esc(bar.side)}</span>` : `<span>${esc(bar.label)}</span><strong>${esc(M.percent(bar.value))}</strong>`;
    return `<div class="meter-row"><div class="meter-label">${label}</div><div class="meter${known ? "" : " unknown"}" role="progressbar" aria-label="${esc(bar.label)}" aria-valuemin="0" aria-valuemax="100"${known ? ` aria-valuenow="${value.toFixed(2)}"` : ' aria-valuetext="数据未知"'} data-direction="${esc(bar.direction || "none")}"><div class="meter-fill ${esc(bar.tone || "blue")}" data-direction="${esc(bar.direction || "none")}" style="width:${value}%"></div>${marker}</div></div>`;
  }
  function renderBlock(b) {
    if (b.front) {
      const f = b.front;
      return `<article class="report-block front-card${b.defense ? " defense" : ""}"><h3 class="front-head"><span class="battle-type${b.defense ? " bad" : " blue"}">${esc(f.mode)}</span><a href="${esc(b.href)}">${esc(b.title)}</a><span class="faction-label ${esc(f.tone)}">${esc(f.faction)}</span><span class="front-players">潜兵 <strong>${esc(f.players)}</strong></span></h3>${f.variants ? `<p class="front-variants ${esc(f.tone)}">${esc(f.variants)}</p>` : ""}<div class="front-stats"><span class="front-health">${esc(f.health.healthText)}</span><span class="front-resistance">${esc(f.health.resistanceText)}</span></div>${b.bars.map(meter).join("")}<div class="front-summary">${f.summary.map(l => `<span class="${esc(l.tone)}">${esc(l.text)}</span>`).join("")}</div><div class="front-details"><span class="front-environment">${esc(f.environment)}</span><span class="front-source">${esc(f.source || "速率数据不足")}</span></div>${renderRegions(f.regions)}</article>`;
    }
    return `<article class="report-block">${b.title ? `<h3>${b.href ? `<a href="${esc(b.href)}">${esc(b.title)}</a>` : esc(b.title)}</h3>` : ""}${b.meta ? `<div class="block-meta">${esc(b.meta)}</div>` : ""}${(b.bars || []).map(meter).join("")}${b.lines.filter(l => l.text).map(l => `<p class="${esc(l.tone)}${l.small ? " detail" : ""}">${esc(l.text)}</p>`).join("")}</article>`;
  }
  function renderRegions(regions) {
    if (!regions.length) return "";
    const open = regions.filter(region => region.available === true).length;
    return `<div class="front-regions"><div class="front-regions-heading">城市／工厂 · 已确认开放 ${open} / ${regions.length}</div>${regions.map(region => `<div class="report-region${region.available === true ? " open" : ""}"><div class="region-title"><strong>${esc(region.name)}</strong><span class="region-type">${esc(region.type)}</span><span class="region-players">潜兵 ${esc(region.players == null ? "未知" : region.players.toLocaleString("zh-CN"))}</span></div>${meter(region.bar)}${region.detail ? `<p class="region-detail">${esc(region.detail)}</p>` : ""}</div>`).join("")}</div>`;
  }
  function render(model) {
    $("report").innerHTML = model.columns.map(col => `<div class="report-column">${col.map(s => `<section class="panel panel-${esc(s.key)}" aria-labelledby="heading-${esc(s.key)}"><h2 id="heading-${esc(s.key)}">${esc(s.title)}</h2>${s.note ? `<p class="panel-note">${esc(s.note)}</p>` : ""}${s.blocks.map(renderBlock).join("")}</section>`).join("")}</div>`).join("");
    $("snapshot").textContent = `战况快照 ${new Date(model.snapshotAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })} · 北京时间 · 每分钟检查更新`;
    $("report").setAttribute("aria-busy", "false");
    $("copy").disabled = false;
    $("export").disabled = false;
  }

  async function json(path) {
    const response = await fetch(base + path, { cache: "no-store", signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`HTTP ${response.status} (${path})`);
    return response.json();
  }
  async function load() {
    if (busy) return;
    busy = true;
    $("refresh").disabled = true;
    $("report").setAttribute("aria-busy", "true");
    status("正在读取主站战况与简中报告…");
    try {
      const data = await json("data.json");
      const paths = { starmap: "tables/starmap.json", variables: "tables/hd2_variables.json", translations: "data/translated/TransNews.json", official: "data/translated/official_texts.json", fallback: "data/translated/report_dispatches_zh.json", players: "data/history/player_distribution.json", environment: "data/planet_environment.json", baseline: "data/history/status_24h.json", regions: "tables/planet_regions.json?v=20261030f", regionsZh: "tables/planet_regions_zh.json?v=20261030f" };
      const results = await Promise.allSettled(Object.entries(paths).map(async ([key, path]) => [key, await json(path)]));
      const extras = {}, missing = [];
      results.forEach((result, i) => {
        if (result.status === "fulfilled") extras[result.value[0]] = result.value[1];
        else missing.push(Object.keys(paths)[i]);
      });
      try { await window.HD2Recent.load({ base: base + "data/recent" }); } catch (_) { missing.push("recent"); }
      const next = M.build(data, extras);
      current = next;
      render(next);
      const age = Date.now() - Date.parse(data.fetchedAt);
      const notices = [];
      if (age > 2 * 3600000) notices.push("主站快照已超过 2 小时，请以显示的快照时间为准");
      if (missing.length) notices.push("部分补充数据未能读取，相关内容标为未知或使用已标明的推演");
      status(notices.join("；") || "已与主站快照同步 · 可直接分享本站链接，或导出当前战报长图", notices.length ? "warning" : "");
    } catch (error) {
      status(`${current ? "刷新失败，保留上次战报" : "暂时无法读取战报"}：${error.message}。请稍后点击刷新。`, "error");
      if (!current) $("report").innerHTML = '<div class="loading">未取得有效的主站战况快照。</div>';
    } finally {
      busy = false;
      $("refresh").disabled = false;
      $("report").setAttribute("aria-busy", "false");
    }
  }

  // 直接绘制同一个战报模型，不依赖外站截图服务或浏览器 DOM 截图库。
  async function exportImage(model) {
    await document.fonts.ready;
    const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d");
    const W = 1800, pad = 24, gap = 16, colW = (W - pad * 2 - gap * 2) / 3;
    const css = getComputedStyle(document.documentElement), color = key => css.getPropertyValue(key).trim();
    const colors = { bg: color("--bg"), panel: color("--panel"), line: color("--line"), track: color("--meter-bg"), grid: color("--meter-grid"), text: color("--text"), muted: color("--muted"), yellow: color("--yellow"), good: color("--green"), bad: color("--red"), blue: color("--blue"), terminids: color("--c-terminids"), automaton: color("--c-automaton"), illuminate: color("--c-illuminate"), humans: color("--c-humans") };
    const commands = [];
    function font(size, weight) { ctx.font = `${weight || 400} ${size}px ReportSans, "Microsoft YaHei", sans-serif`; }
    function text(text, x, y, max, size = 16, color = colors.text, weight = 400) {
      font(size, weight);
      const rows = [];
      for (const paragraph of String(text || "").split("\n")) {
        let row = "";
        for (const ch of paragraph) {
          if (row && ctx.measureText(row + ch).width > max) { rows.push(row); row = ""; }
          row += ch;
        }
        rows.push(row);
      }
      for (const row of rows) { commands.push({ kind: "text", text: row, x, y, size, color, weight }); y += size * 1.65; }
      return y;
    }
    function rect(x, y, w, h, color) { commands.push({ kind: "rect", x, y, w, h, color }); }
    function inlineText(items, x, y, width) {
      let cursor = x, rowHeight = 0;
      for (const item of items) {
        font(item.size);
        const itemWidth = ctx.measureText(item.text).width;
        if (cursor > x && cursor + itemWidth > x + width) { y += rowHeight + 2; cursor = x; rowHeight = 0; }
        if (itemWidth > width) {
          y = text(item.text, x, y, width, item.size, item.color) + 2;
          cursor = x; rowHeight = 0;
        } else {
          text(item.text, cursor, y, itemWidth + 1, item.size, item.color);
          cursor += itemWidth + 12;
          rowHeight = Math.max(rowHeight, item.size * 1.65);
        }
      }
      return y + rowHeight + 3;
    }
    function drawMeter(bar, x, y, width, size = 13) {
      const arrow = { right: "→", left: "←", still: "＝", unknown: "?" }[bar.direction] || "";
      y = text(`${bar.label}  ${M.percent(bar.value)}${bar.side ? "　" + arrow + " " + bar.side : ""}`, x, y, width, size, colors.muted) + 2;
      rect(x, y, width, 11, colors.track);
      const fillWidth = M.number(bar.value) == null ? 0 : width * Math.max(0, Math.min(100, bar.value)) / 100;
      if (fillWidth) rect(x, y, fillWidth, 11, colors[bar.tone] || colors.blue);
      if (fillWidth && ["right", "left", "still"].includes(bar.direction)) commands.push({ kind: "arrows", x, y, width: fillWidth, direction: bar.direction });
      else for (let dx = 0; dx < width; dx += 7) rect(x + dx, y, 1, 11, colors.grid);
      if (M.number(bar.marker) != null) rect(x + width * Math.max(0, Math.min(100, bar.marker)) / 100 - 1, y - 3, 2, 17, colors.yellow);
      return y + 22;
    }
    function panel(s, x, y) {
      const start = y, insert = commands.length;
      y += 20;
      rect(x + 16, y, 4, 22, colors.yellow);
      y = text(s.title, x + 30, y - 3, colW - 50, 20, colors.text, 600) + 10;
      if (s.note) y = text(s.note, x + 16, y, colW - 32, 13, colors.muted) + 10;
      for (const [i, b] of s.blocks.entries()) {
        if (i) { rect(x + 16, y + 3, colW - 32, 1, colors.line); y += 18; }
        if (b.title) y = text(`${b.front ? b.front.mode + " · " : ""}${b.title}`, x + 16, y, colW - 32, 16, colors.yellow, 600) + 2;
        if (b.meta) y = text(b.meta, x + 16, y, colW - 32, 12, colors.muted) + 3;
        if (b.front?.variants) y = text(b.front.variants, x + 16, y, colW - 32, 12, colors[b.front.tone] || colors.muted) + 3;
        if (b.front?.health) y = inlineText([
          { text: b.front.health.healthText, size: 12, color: colors.muted },
          { text: b.front.health.resistanceText, size: 12, color: colors.muted }
        ], x + 16, y, colW - 32);
        for (const bar of b.bars || []) y = drawMeter(bar, x + 16, y, colW - 32);
        if (b.front) {
          const f = b.front;
          font(13);
          const widths = f.summary.map(l => ctx.measureText(l.text).width), total = widths.reduce((a, b) => a + b, 0);
          let cursor = x + 16;
          const space = f.summary.length > 1 ? Math.max(8, (colW - 32 - total) / (f.summary.length - 1)) : 0;
          for (const [j, l] of f.summary.entries()) { text(l.text, cursor, y, widths[j] + 1, 13, colors[l.tone] || colors.text); cursor += widths[j] + space; }
          y += 25;
          y = inlineText([
            { text: f.environment, size: 12, color: colors.muted },
            { text: f.source || "速率数据不足", size: 11, color: colors.muted }
          ], x + 16, y, colW - 32);
          if (f.regions.length) {
            rect(x + 16, y + 2, colW - 32, 1, colors.line); y += 11;
            y = text(`城市／工厂 · 已确认开放 ${f.regions.filter(region => region.available === true).length} / ${f.regions.length}`, x + 16, y, colW - 32, 12, colors.muted) + 5;
            for (const region of f.regions) {
              y = text(`${region.name} · ${region.type} · 潜兵 ${region.players == null ? "未知" : region.players.toLocaleString("zh-CN")}`, x + 24, y, colW - 48, 12, colors.text) + 2;
              y = drawMeter(region.bar, x + 24, y, colW - 48, 11);
              if (region.detail) y = text(region.detail, x + 24, y, colW - 48, 11, colors.muted) + 3;
              y += 5;
            }
          }
        } else for (const l of b.lines) if (l.text) y = text(l.text, x + 16, y, colW - 32, l.small ? 13 : 15, colors[l.tone] || (l.small ? colors.muted : colors.text)) + 4;
      }
      y += 12;
      commands.splice(insert, 0, { kind: "rect", x, y: start, w: colW, h: y - start, color: colors.panel, stroke: colors.line });
      return y + gap;
    }
    const bottoms = model.columns.map((col, i) => {
      let y = 115;
      for (const s of col) y = panel(s, pad + i * (colW + gap), y);
      return y;
    });
    const H = Math.ceil(Math.max(...bottoms) + 70);
    if (H > 16000) throw new Error("战报超出长图尺寸限制，可先复制完整文字。");
    canvas.width = W; canvas.height = H;
    ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = "top";
    font(30, 600); ctx.fillStyle = colors.yellow; ctx.fillText("超级地球战报 · 真理部", pad, 23);
    font(14); ctx.fillStyle = colors.muted; ctx.fillText(`战况快照 ${new Date(model.snapshotAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })} · 北京时间`, pad, 70);
    ctx.fillStyle = colors.yellow; ctx.fillRect(0, 100, W, 2);
    for (const cmd of commands) {
      ctx.fillStyle = cmd.color;
      if (cmd.kind === "arrows") {
        ctx.save(); ctx.beginPath(); ctx.rect(cmd.x, cmd.y, cmd.width, 11); ctx.clip(); ctx.strokeStyle = colors.bg; ctx.globalAlpha = .6; ctx.lineWidth = 1.8;
        for (let dx = 1; dx < cmd.width; dx += 12) {
          ctx.beginPath();
          if (cmd.direction === "still") { ctx.moveTo(cmd.x + dx, cmd.y + 4); ctx.lineTo(cmd.x + dx + 6, cmd.y + 4); ctx.moveTo(cmd.x + dx, cmd.y + 7); ctx.lineTo(cmd.x + dx + 6, cmd.y + 7); }
          else { const sign = cmd.direction === "left" ? -1 : 1, mid = cmd.x + dx + 4; ctx.moveTo(mid - sign * 2, cmd.y + 2); ctx.lineTo(mid + sign * 2, cmd.y + 5.5); ctx.lineTo(mid - sign * 2, cmd.y + 9); }
          ctx.stroke();
        }
        ctx.restore();
      } else if (cmd.kind === "text") { font(cmd.size, cmd.weight); ctx.fillText(cmd.text, cmd.x, cmd.y); }
      else { ctx.fillRect(cmd.x, cmd.y, cmd.w, cmd.h); if (cmd.stroke) { ctx.strokeStyle = cmd.stroke; ctx.strokeRect(cmd.x + .5, cmd.y + .5, cmd.w - 1, cmd.h - 1); } }
    }
    font(13); ctx.fillStyle = colors.muted; ctx.fillText("与主站同源 · 预测以保持快照时节奏为条件 · 公告只使用简中及站点汉化", pad, H - 45);
    ctx.fillStyle = colors.yellow; ctx.fillText("为了超级地球！", W - 160, H - 45);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("浏览器未能生成长图");
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = `hd2-site-report-${new Date(model.snapshotAt).toISOString().slice(0, 16).replace(/[:T]/g, "-")}.png`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  $("refresh").addEventListener("click", load);
  $("copy").addEventListener("click", async () => {
    if (!current) return;
    try { await navigator.clipboard.writeText(M.toText(current)); status("已复制完整战报文字。"); }
    catch (_) { status("浏览器未允许复制，请允许剪贴板访问后重试。", "warning"); }
  });
  $("export").addEventListener("click", async () => {
    if (!current) return;
    $("export").disabled = true;
    status("正在生成当前战报长图…");
    try { await exportImage(current); status("长图已生成，浏览器将下载 PNG 文件。"); }
    catch (error) { status(`长图导出失败：${error.message}`, "error"); }
    finally { $("export").disabled = false; }
  });
  load();
  setInterval(() => { if (!document.hidden) load(); }, 60000);
})();
