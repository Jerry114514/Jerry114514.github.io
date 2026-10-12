"use strict";
// Runtime region rules. Static wiki ownership never determines current availability.
window.HD2Regions = (() => {
  const n = v => v == null || v === "" || typeof v === "boolean" ? null : Number.isFinite(+v) ? +v : null;
  const human = v => v === 1 || String(v).toLowerCase() === "humans";
  const clamp = v => Math.max(0, Math.min(100, v));
  const BASE_HP = { Settlement: 100000, Town: 200000, City: 400000, MegaCity: 600000 };
  function live(planet, index) {
    const list = planet.regions || [];
    return list.find(r => n(r.regionIndex) === index)
      || (list[index]?.regionIndex == null ? list[index] : null) || null;
  }
  function model(planet, region, meta = {}, data = {}, recent = null) {
    const campaign = (data.campaigns || []).find(c => c.planet?.index === planet.index);
    const event = (data.planet_events || []).find(e => e.planetIndex === planet.index && e.eventType === 1);
    const defense = !!event || !!window.HD2Forecast?.isDefense(campaign);
    const factory = String(meta.region_type).toLowerCase() === "megafactory" || ((n(region?.flags) || 0) & 1) !== 0;
    const available = typeof region?.isAvailable === "boolean" ? region.isAvailable : null;
    const ours = !!region && human(region.owner);
    const inactive = !region && human(planet.currentOwner) && !defense;
    const factor = n(region?.availabilityFactor) ?? n(recent?.availabilityFactor);
    const threshold = factor == null ? null : clamp((1 - factor) * 100);
    const parentMax = defense ? n(event?.maxHealth) ?? n(campaign?.maxHealth) : n(planet.maxHealth);
    const regionMax = n(region?.maxHealth) ?? (factory ? null : BASE_HP[meta.size] ?? null);
    const multiplier = n(region?.damageMultiplier) ?? 1.5;
    const estimated = n(region?.damageMultiplier) == null || n(region?.maxHealth) == null;
    const contribution = parentMax > 0 && regionMax > 0 ? regionMax * multiplier / parentMax * 100 : null;
    const planetPct = n(planet.health) != null && n(planet.maxHealth) > 0 ? clamp((1 - planet.health / planet.maxHealth) * 100) : null;
    let status = available === true ? "已开放" : available === false ? "未开放" : inactive ? "无区域战役" : "开放状态未知";
    if (ours || inactive) status += " · 已解放";
    let condition = "";
    if (available !== true) {
      if (ours || inactive) condition = "暂无区域战役";
      else if (defense) condition = threshold == null ? "等待开放，阈值未知" : `入侵进度 ≥${threshold.toFixed(2)}%`;
      else if (threshold != null) condition = `主星球解放 ≥${threshold.toFixed(2)}%`
        + (planetPct != null && planetPct >= threshold ? " · 待开放" : "");
      else condition = "条件未知";
    }
    return { available, status, condition, threshold, contribution, multiplier, estimated, defense,
      target: defense ? "主星球防守进度" : "主星球解放度" };
  }
  function info(planet, index, meta, data) {
    const region = live(planet, index);
    const recent = region && window.HD2Recent?.regionMeta(planet.index, region, Date.parse(data?.fetchedAt));
    return model(planet, region, meta, data, recent);
  }
  function html(f) {
    const target = f.defense ? "主星球防守" : "主星球解放";
    return `<div class="region-rules"><div><b>${f.status}</b>${f.condition ? " · " + f.condition : ""}</div>`
      + `<div>解放贡献：${target} <b>${f.contribution == null ? "未知" : "+" + f.contribution.toFixed(2) + " 个百分点"}</b>${f.contribution != null && f.estimated ? "（估算）" : ""}</div></div>`;
  }
  return { live, model, info, html };
})();
