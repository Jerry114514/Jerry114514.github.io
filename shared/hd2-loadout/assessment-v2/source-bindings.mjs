// Explicit field bindings from the archived research packages. A candidate is
// never promoted to a fact by this adapter. No old scores enter this path.
export function sourceBindings(general) {
  const result = {};
  for (const p of general.parameters) {
    if (p.status !== 'resolved') continue;
    const fields = {};
    if (p.field === 'reload') {
      const seconds = p.value.full_upgraded ?? p.value.empty ?? p.value.full;
      if (Number.isFinite(seconds)) fields.reload_ms = Math.round(seconds * 1000);
    }
    if (p.field === 'feed' && p.value.manual_reload === false) fields.reload_ms = 0;
    if (['charge', 'charge_per_shot'].includes(p.field)) fields.charge_ms = Math.round(p.value * 1000);
    if (p.field === 'recharge_after_shot') fields.forced_cooldown_ms = Math.round(p.value * 1000);
    if (p.field === 'cooling_start_delay') fields.cooling_delay_ms = Math.round(p.value * 1000);
    if (p.field === 'between_shots_cooling' && p.value === 'immediate') fields.cooling_delay_ms = 0;
    // LAS44: narrative 3s conflicts with detailed 100/28. Preserve both; use
    // the slower derived cooling period when building its service cycle.
    if (p.field === 'per_shot_recharge') fields.observed_recharge_ms = Math.round(p.value * 1000);
    if (!Object.keys(fields).length) continue;
    const item = result[p.equipment_id] ??= {evidence: []};
    Object.assign(item, fields);
    item.evidence.push({field: p.field, source_url: p.source_url, locator: p.source_locator,
      revision: p.revision, condition: p.condition, status: p.status});
  }
  return result;
}
