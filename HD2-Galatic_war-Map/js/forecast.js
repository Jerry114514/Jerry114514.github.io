"use strict";
// Pure prediction model shared by the dashboard, map and planet details.
// All inputs are observations at a snapshot time, never the browser wall clock.
window.HD2Forecast = (() => {
  const HOUR = 3600000;
  const number = v => v == null || v === "" || typeof v === "boolean" ? null : (Number.isFinite(Number(v)) ? Number(v) : null);
  const ms = v => v == null ? null : (Number.isFinite(Date.parse(v)) ? Date.parse(v) : null);
  const clamp = v => Math.max(0, Math.min(100, v));
  const taskKey = tasks => JSON.stringify((tasks || []).map(t => [t.type, t.values, t.valueTypes]));
  function sameOrder(frame, assignment) {
    if (!frame || !assignment) return false;
    const id = frame.id ?? frame.id32;
    return id != null && String(id) === String(assignment.id)
      && taskKey(frame.tasks || frame.setting?.tasks) === taskKey(assignment.tasks);
  }
  function orderWindow(data, frames = []) {
    const a = data.assignments || {};
    const end = ms(a.deadline), now = ms(data.fetchedAt);
    if (end == null || now == null) return null;
    // warTime is seconds since war start; timestampUtc anchors it to UTC.
    // Reject a frame from another order, another deadline or the future.
    const candidates = frames.flatMap(f => {
      const t = ms(f.timestampUtc), war = number(f.warTime);
      const order = (f.assignments || []).find(x => sameOrder(x, a));
      const startWar = number(order?.startTime), expires = number(order?.expiresIn);
      if (t == null || t > now || war == null || startWar == null || expires == null
          || Math.abs(t + expires * 1000 - end) > 300000) return [];
      return [{ start: t - (war - startWar) * 1000, source: "指令时间戳" }];
    });
    let start = ms(a.startedAt || a.startDate);
    let source = "指令时间戳";
    if (start == null && candidates.length) start = candidates.at(-1).start;
    if (start == null) {
      // Only the opening headline, never an arbitrary mention or a victory dispatch.
      const d = (data.dispatches || []).filter(d => /^\s*(?:<i=3>)?NEW MAJOR ORDER(?:<\/i>)?(?:\s|$)/i.test(d.message || ""))
        .filter(d => ms(d.published) != null && ms(d.published) <= now && end - ms(d.published) <= 14 * 86400000)
        .sort((x, y) => ms(y.published) - ms(x.published))[0];
      start = d ? ms(d.published) : null;
      source = "指令开局播报";
    }
    if (start == null || start > now || end <= start) return null;
    return { start, end, now, hours: (end - start) / HOUR, source,
      expected: clamp((now - start) / (end - start) * 100) };
  }
  function task({ type, goal, current, window: w, recentRate = null }) {
    const g = number(goal), c = number(current);
    if (g == null || g <= 0 || c == null) return { state: "unknown" };
    if (Number(type) === 13) return { state: "hold", satisfied: c >= g, expired: !!w && w.now >= w.end };
    if (![2, 3, 9, 11, 15].includes(Number(type))) return { state: c >= g ? "satisfied" : "stateful" };
    if (c >= g) return { state: "complete" };
    if (!w) return { state: "unknown" };
    const elapsedH = (w.now - w.start) / HOUR, remainingH = Math.max(0, (w.end - w.now) / HOUR);
    // Whole-order mean must include the entire elapsed time, even when cache starts halfway through.
    const rate = elapsedH > 0 ? c / elapsedH : null;
    const projected = rate == null ? null : clamp((c + rate * remainingH) / g * 100);
    const etaH = rate > 0 ? (g - c) / rate : null;
    const recent = number(recentRate);
    return { state: remainingH <= 0 ? "expired" : "active", expected: w.expected,
      delta: c / g * 100 - w.expected, rate, projected, etaH, remainingH,
      win: etaH != null && etaH <= remainingH,
      recentProjected: recent == null ? null : clamp((c + recent * remainingH) / g * 100) };
  }
  function isDefense(c) {
    return !!c && (String(c.campaignType).toLowerCase() === "defense" || c.eventType === 1
      || ["defense", "1", "4"].includes(String(c.type)));
  }
  function defense(c = {}) {
    const def = number(c.defendersProgress), atk = number(c.attackersProgress);
    const aR = number(c.attackersRate), dR = number(c.defendersRate);
    const seconds = number(c.remainingTime), remainingH = seconds == null ? null : Math.max(0, seconds / 3600);
    const elapsedH = aR > 0 && atk != null ? atk / aR : null;
    // Zero is a measured stall, not permission to substitute a positive historical mean.
    const rate = dR != null ? Math.max(0, dR) : (elapsedH > 0 && def != null ? def / elapsedH : null);
    const source = dR != null ? "实测防守速率" : "开战以来平均防守速率";
    const expected = atk == null ? null : clamp(atk);
    const projected = def == null || remainingH == null || rate == null ? null : clamp(def + rate * remainingH);
    const etaH = def >= 100 ? 0 : (def != null && rate > 0 ? (100 - def) / rate : null);
    const win = def == null || remainingH == null ? null : (def >= 100 ? true : projected == null ? null : etaH != null && etaH <= remainingH);
    return { def, atk, rate, source, expected, projected, etaH, remainingH, win,
      delta: def == null || expected == null ? null : def - expected,
      requiredRate: def == null || !(remainingH > 0) ? null : Math.max(0, 100 - def) / remainingH };
  }
  function duration(h) {
    if (h == null || !Number.isFinite(h)) return "—";
    if (h > 720) return "超过 30 天";
    if (h <= 0) return "0 分钟";
    const m = Math.max(1, Math.round(h * 60)), d = Math.floor(m / 1440), hh = Math.floor(m % 1440 / 60);
    return d ? `${d} 天 ${hh} 小时` : hh ? `${hh} 小时 ${m % 60} 分钟` : `${m} 分钟`;
  }
  function defenseHtml(c) {
    const f = defense(c), cls = f.win === true ? "good" : f.win === false ? "bad" : "";
    const expected = f.expected == null ? "数据不足" : `${f.expected.toFixed(2)}%（时间基准）`;
    const delta = f.delta == null ? "" : ` · ${f.delta >= 0 ? "领先" : "落后"} ${Math.abs(f.delta).toFixed(2)} 个百分点`;
    const result = f.def >= 100 ? "防守已完成" : f.win === true ? "预计守住" : f.win === false ? "预计失守" : "数据不足，暂无法预测";
    const finish = f.etaH == null ? (f.rate === 0 ? "防守停滞" : "数据不足") : `还需 ${duration(f.etaH)}`;
    return `<div class="campaign-forecast"><div>预期进度 <b>${expected}</b>${delta}</div>`
      + `<div>截止时预计防守进度 <b>${f.projected == null ? "—" : f.projected.toFixed(2) + "%"}</b></div>`
      + `<div>预计战役结果 <b class="${cls}">${result}</b> · 预计完成 ${finish}</div>`
      + `<div class="forecast-source">${f.source}${f.rate == null ? "：数据不足" : " " + f.rate.toFixed(3) + "%/h"}`
      + `${f.requiredRate == null ? "" : " · 所需防守速率 " + f.requiredRate.toFixed(3) + "%/h"} · 保持当前节奏的条件预测</div></div>`;
  }
  return { orderWindow, sameOrder, task, isDefense, defense, defenseHtml, duration };
})();
