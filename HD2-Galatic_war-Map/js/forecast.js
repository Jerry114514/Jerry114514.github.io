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
  function reinforcement(data = {}, p = {}, c = null, efficiencyK = 90) {
    const total = number(data.player_distribution?.total), players = number(p.players);
    const currentShare = total > 0 && players != null && players >= 0 && players <= total ? players / total * 100 : null;
    const mode = isDefense(c) ? "defense" : "liberation";
    const unknown = { state: "unknown", mode, currentShare };
    let requiredRate, maxHealth;
    if (mode === "defense") {
      const f = defense(c);
      if (f.def >= 100) return { state: "complete", mode, currentShare };
      if (f.remainingH === 0) return { state: "expired", mode, currentShare };
      requiredRate = f.requiredRate;
      // A defense damages the invasion event, not the human-owned planet.
      maxHealth = number((data.planet_events || []).find(event => event.planetIndex === p.index && event.eventType === 1)?.maxHealth);
    } else {
      if (p.currentOwner === "Humans" || (number(p.health) === 0 && number(p.maxHealth) > 0))
        return { state: "complete", mode, currentShare };
      requiredRate = number(p.resistance);
      maxHealth = number(p.maxHealth);
    }
    if (currentShare == null || requiredRate == null || requiredRate < 0) return unknown;
    // Rewrite the site's existing gross-rate model in share units:
    // gross %/h = share (%) * (total online * impact multiplier * K / HP).
    // Hold the sampled global impact budget and operation efficiency constant.
    let ratePerShare;
    let source = "推演";
    const measuredDefenseRate = mode === "defense" ? number(c.defendersRate) : null;
    if (measuredDefenseRate != null) {
      // This is the recent snapshot delta, not the opening-to-now mean.
      // A measured stall/loss cannot establish a positive contribution efficiency.
      if (!(measuredDefenseRate > 0) || !(currentShare > 0)) return unknown;
      ratePerShare = measuredDefenseRate / currentShare;
      source = "实测";
    } else {
      const impact = number(data.impactMultiplier);
      if (!(impact > 0) || !(maxHealth > 0)) return unknown;
      ratePerShare = total * impact * efficiencyK / maxHealth;
    }
    if (!(ratePerShare > 0)) return unknown;
    const requiredShare = requiredRate / ratePerShare;
    const strict = mode === "liberation"; // Equaling regeneration only stalls.
    return { state: requiredShare > 100 || (strict && requiredShare >= 100) ? "impossible" : "active",
      mode, currentShare, requiredShare, requiredRate, ratePerShare, strict, source,
      sufficient: strict ? currentShare > requiredShare : currentShare >= requiredShare,
      gap: Math.max(0, requiredShare - currentShare) };
  }
  function reinforcementHtml(data, p, c = null) {
    if (!p) return "";
    const r = reinforcement(data, p, c);
    if (r.state === "complete" || r.state === "expired") return "";
    const current = r.currentShare == null ? "" : ` · 当前 ${r.currentShare.toFixed(2)}%`;
    if (r.state === "unknown") return `<div class="reinforcement-forecast">增援占比：数据不足${current}</div>`;
    // Round the displayed minimum upward so it never understates the estimate.
    const ceil = value => (Math.ceil((value - 1e-9) * 100) / 100).toFixed(2);
    const goal = r.mode === "defense" ? "守住需" : "持续推进需";
    const result = r.state === "impossible" ? "当前效率下无法达成" : r.sufficient ? "已达门槛"
      : r.gap > 0 ? `还差约 ${ceil(r.gap)} 个百分点` : "需再提高占比";
    const explanation = r.source === "实测" ? "按近期防守速率与当前兵力占比估算；假定单位占比贡献保持不变。"
      : "按当前全服影响力与站内作战效率模型估算；占比提高需保持该效率，实际结果会随任务效率和影响系数变化。";
    return `<div class="reinforcement-forecast" title="${explanation}">`
      + `${goal} <b>${r.strict ? "&gt;" : "≥"}${ceil(r.requiredShare)}%</b> 在线兵力${current}`
      + ` · <span class="${r.sufficient && r.state !== "impossible" ? "good" : "bad"}">${result}</span> <span class="forecast-source">${r.source}</span></div>`;
  }
  function defenseHtml(c, data = null, p = null) {
    const f = defense(c), cls = f.win === true ? "good" : f.win === false ? "bad" : "";
    const expected = f.expected == null ? "数据不足" : `${f.expected.toFixed(2)}%（时间基准）`;
    const delta = f.delta == null ? "" : ` · ${f.delta >= 0 ? "领先" : "落后"} ${Math.abs(f.delta).toFixed(2)} 个百分点`;
    const result = f.def >= 100 ? "防守已完成" : f.win === true ? "预计守住" : f.win === false ? "预计失守" : "数据不足，暂无法预测";
    const finish = f.etaH == null ? (f.rate === 0 ? "防守停滞" : "数据不足") : `还需 ${duration(f.etaH)}`;
    return `<div class="campaign-forecast"><div>预期进度 <b>${expected}</b>${delta}</div>`
      + `<div>截止时预计防守进度 <b>${f.projected == null ? "—" : f.projected.toFixed(2) + "%"}</b></div>`
      + `<div>预计战役结果 <b class="${cls}">${result}</b> · 预计完成 ${finish}</div>`
      + (data && p ? reinforcementHtml(data, p, c) : "")
      + `<div class="forecast-source">${f.source}${f.rate == null ? "：数据不足" : " " + f.rate.toFixed(3) + "%/h"}`
      + `${f.requiredRate == null ? "" : " · 所需防守速率 " + f.requiredRate.toFixed(3) + "%/h"} · 保持当前节奏的条件预测</div></div>`;
  }
  return { orderWindow, sameOrder, task, isDefense, defense, defenseHtml, duration, reinforcement, reinforcementHtml };
})();
