// Red/green stratagem "coverage" research layer (orbital / eagle / deployable).
//
// Purpose: extract sourced, normalized-but-not-invented facts about *when* a
// red/green stratagem can act and *what it carries*: call-in latency, effect
// duration, reuse cooldown, Eagle mounted uses vs. rearm, orbital mission limits,
// deployable ammunition/lifetime and the explosion parameters printed in the
// frozen wiki snapshot. Nothing here assigns a six-dimension strength score and
// nothing here sums salvos into "total payload damage"; that would need
// encounter modelling, which this layer explicitly refuses to do.
//
// Rules the code enforces (see docs/loadout-v3-strategic-coverage-20261026.md):
//   1. Every value keeps its provenance: item revid + table index/kind/title +
//      row key/label + raw string.
//   2. A value is normalized only when its unit is unambiguous on its own
//      ("180 s" -> 180000 ms). Ranges ("1199 - 0"), starred values ("40*"),
//      compound specs ("↔[40.00]°/s") and free text stay canonical:null.
//   3. Multiple values (Standard / Upgraded / "With X") are all kept. The single
//      "baseline" value is filled only when every non-variant source agrees;
//      otherwise it is null and the disagreement is recorded as a conflict.
//      Never take max/min/sum silently.
//   4. Fields with different semantics (total sentry ammo vs magazine capacity,
//      two different status effects with their own durations) are separate
//      parts, not one field with conflicting values.
//   5. Missing data is null plus an explicit status, never 0.
//
// No third-party dependency. The optional CLI imports node:fs/node:url lazily so
// the extraction functions themselves stay side-effect free.

export const COVERAGE_SCHEMA = 'hd2-strategic-coverage/1';
export const COVERED_FAMILIES = ['orbital', 'eagle', 'deployable'];

const TIME_UNIT_MS = { ms: 1, millisecond: 1, milliseconds: 1, s: 1000, sec: 1000, secs: 1000, second: 1000, seconds: 1000 };
const LENGTH_UNIT_M = { mm: 0.001, cm: 0.01, m: 1, meter: 1, meters: 1 };
const DAMAGE_TYPES = { damage: 'Damage', explosion: 'Explosion', ballistic: 'Ballistic', gas: 'Gas', fire: 'Fire', shrapnel: 'Shrapnel', piercing: 'Piercing', impact: 'Impact' };

const TIME_RE = /^(-?\d+(?:\.\d+)?)\s*(ms|milliseconds?|seconds?|secs?|s)$/i;
const LENGTH_RE = /^(\d+(?:\.\d+)?)\s*(mm|cm|meters?|m)$/i;
const DAMAGE_RE = /^(\d+(?:\.\d+)?)\s*(damage|explosion|ballistic|gas|fire|shrapnel|piercing|impact)$/i;
const RANGE_RE = /^(-?\d+(?:\.\d+)?)\s*(?:-|–|~)\s*(-?\d+(?:\.\d+)?)$/;
const COUNT_RE = /^(\d+)$/;
const PERCENT_RE = /^(\d+(?:\.\d+)?)\s*%$/;
const STAR_RE = /^([\d.,]+)\s*\*+$/;
const UNLIMITED_RE = /^(∞|unlimited)$/i;
const COMPOUND_RE = /[[\]()↔↕]|\|/;

function clean(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim();
}

function roundProduct(value, factor) {
  if (factor === 1) return value;
  return Number((value * factor).toFixed(6));
}

/**
 * Classify a raw wiki cell. Returns a description, never a guess:
 *   {status:'ok'|'unlimited'|'range'|'annotated'|'compound'|'text'|'empty', family, value, unit, ...}
 * Only 'ok' and 'unlimited' are comparable canonical values.
 */
export function classifyValue(raw) {
  const text = clean(raw);
  if (!text) return { status: 'empty', text: '' };
  if (UNLIMITED_RE.test(text)) return { status: 'unlimited', unlimited: true, unit: 'unlimited', text };

  let m = TIME_RE.exec(text);
  if (m) {
    const factor = TIME_UNIT_MS[m[2].toLowerCase()];
    if (factor) return { status: 'ok', family: 'time', value: roundProduct(Number(m[1]), factor), unit: 'ms', raw_unit: m[2], text };
  }

  m = LENGTH_RE.exec(text);
  if (m) {
    const factor = LENGTH_UNIT_M[m[2].toLowerCase()];
    if (factor) return { status: 'ok', family: 'length', value: roundProduct(Number(m[1]), factor), unit: 'm', raw_unit: m[2], text };
  }

  m = DAMAGE_RE.exec(text);
  if (m) return { status: 'ok', family: 'damage', value: Number(m[1]), unit: `damage:${DAMAGE_TYPES[m[2].toLowerCase()]}`, raw_unit: m[2], text };

  m = PERCENT_RE.exec(text);
  if (m) return { status: 'ok', family: 'percent', value: Number(m[1]), unit: 'percent', text };

  m = COUNT_RE.exec(text.replace(/,/g, ''));
  if (m) return { status: 'ok', family: 'count', value: Number(m[1]), unit: 'count', text };

  m = RANGE_RE.exec(text.replace(/,/g, ''));
  if (m) return { status: 'range', range: [Number(m[1]), Number(m[2])], text };

  m = STAR_RE.exec(text.replace(/,/g, ''));
  if (m) return { status: 'annotated', value: Number(m[1]), starred: true, text };

  if (COMPOUND_RE.test(text)) return { status: 'compound', text };
  return { status: 'text', text };
}

/** Stable token used to decide whether two entries really disagree. */
export function comparableToken(entry) {
  const c = entry?.canonical ?? {};
  if (c.status === 'unlimited') return 'unlimited';
  if (c.status === 'ok') return `${c.family}:${c.value}${c.unit}`;
  if (c.status === 'range') return `range:${c.range[0]}~${c.range[1]}`;
  if (c.status === 'annotated') return `annotated:${c.value}`;
  return `unresolved:${c.status ?? 'unknown'}:${clean(entry?.raw)}`;
}

/** Drop the echoed text copy of `raw` before storing, so JSON stays compact. */
function withoutText(classified) {
  const { text, ...rest } = classified;
  void text;
  return rest;
}

/** Build one field entry straight from a wiki table row. */
export function fieldEntry(row, table) {
  return {
    key: row?.key ?? null,
    label: row?.label ?? null,
    raw: row?.raw ?? null,
    variant: row?.variant ?? null,
    canonical: withoutText(classifyValue(row?.raw)),
    source: {
      table_index: table?.index ?? null,
      table_kind: table?.kind ?? null,
      table_title: table?.title ?? null,
      context_heading: table?.context_heading ?? null,
    },
  };
}

function fieldSummary(entry) {
  return { key: entry.key, raw: entry.raw, variant: entry.variant, canonical: entry.canonical.status, source: entry.source };
}

/**
 * Group field entries of one logical layer into a layer object. `baseline` is
 * filled only when all non-variant sources agree; otherwise null + conflict.
 */
export function buildLayer(entries) {
  const fields = Array.isArray(entries) ? entries.filter(Boolean) : [];
  if (!fields.length) {
    return { present: false, keys: [], fields: [], baseline: null, baseline_status: 'absent', variants: {}, conflicts: [], multi_valued: false, distinct_values: [] };
  }
  const keys = [...new Set(fields.map((f) => f.key))];
  const baselineCandidates = fields.filter((f) => f.variant == null || /^standard$/i.test(String(f.variant)));
  const allTokens = new Set(fields.map(comparableToken));
  const baselineTokens = new Set(baselineCandidates.map(comparableToken));

  const variants = {};
  for (const field of fields) {
    if (field.variant == null) continue;
    if (!variants[field.variant]) variants[field.variant] = [];
    variants[field.variant].push({ raw: field.raw, canonical: field.canonical.status, token: comparableToken(field) });
  }

  const conflicts = [];
  if (baselineTokens.size > 1) {
    conflicts.push({
      keys,
      tokens: [...baselineTokens],
      entries: baselineCandidates.map(fieldSummary),
      note: 'non-variant sources disagree; baseline left null instead of picking a value',
    });
  }
  const status = baselineTokens.size === 1 ? 'ok' : (baselineCandidates.length ? 'conflict' : 'variant_only');
  const wanted = [...baselineTokens][0];
  const first = baselineCandidates.find((f) => comparableToken(f) === wanted) ?? null;
  const baseline = status === 'ok' && first
    ? {
      raw: first.raw,
      value: first.canonical.value ?? null,
      unit: first.canonical.unit ?? null,
      status: first.canonical.status,
      key: first.key,
      source: first.source,
    }
    : null;

  return {
    present: true,
    keys,
    fields,
    baseline,
    baseline_status: status,
    variants,
    conflicts,
    multi_valued: allTokens.size > 1,
    distinct_values: [...allTokens],
  };
}

/**
 * Layer made of several distinct fields that must not be merged (sentry total
 * ammo vs magazine capacity vs barrels; two statuses with their own duration).
 * `groupBySource` splits a key further when the same key comes from more than
 * one table (e.g. one status-duration row per status table).
 */
export function buildKeyedGroup(entries, { groupBySource = false } = {}) {
  const fields = (entries ?? []).filter(Boolean);
  if (!fields.length) return { present: false, parts: {}, fields: [] };
  const tablesPerKey = {};
  for (const field of fields) {
    const key = field.key ?? 'unknown';
    (tablesPerKey[key] ??= new Set()).add(field.source.table_index);
  }
  const buckets = {};
  for (const field of fields) {
    const key = field.key ?? 'unknown';
    const split = groupBySource && tablesPerKey[key].size > 1;
    const label = field.source.table_title ?? field.source.context_heading ?? `table_${field.source.table_index}`;
    const part = split ? `${key}@${label}` : key;
    (buckets[part] ??= []).push(field);
  }
  const parts = {};
  for (const [name, bucket] of Object.entries(buckets)) parts[name] = buildLayer(bucket);
  return { present: true, parts, fields };
}

function rowsOf(item) {
  const tables = Array.isArray(item?.tables) ? item.tables : [];
  const flat = [];
  for (const table of tables) {
    const rows = Array.isArray(table?.rows) ? table.rows : [];
    rows.forEach((row) => flat.push(fieldEntry(row, table)));
  }
  return { tables, flat };
}

function entriesWithKeys(flat, keys) {
  return flat.filter((e) => keys.includes(e.key));
}

function duplicateKeySources(flat) {
  const byKey = {};
  for (const entry of flat) {
    if (!entry.key) continue;
    // Only stat tables can duplicate one semantic field; attack_* tables each
    // describe a different projectile / explosion component on purpose.
    if (!['wikitable', 'weapon_stats'].includes(String(entry.source.table_kind))) continue;
    (byKey[entry.key] ??= []).push(entry);
  }
  const duplicates = [];
  for (const [key, entries] of Object.entries(byKey)) {
    const sources = [...new Set(entries.map((e) => `${e.source.table_index}:${e.source.table_kind}:${e.source.table_title ?? e.source.context_heading ?? ''}`))];
    if (sources.length > 1) {
      duplicates.push({
        key,
        sources,
        entry_count: entries.length,
        same_value: new Set(entries.map(comparableToken)).size === 1,
      });
    }
  }
  return duplicates.sort((a, b) => a.key.localeCompare(b.key));
}

function attackTablesOf(tables) {
  return tables
    .filter((t) => /^attack_/.test(String(t.kind)))
    .map((table) => ({
      table_index: table.index ?? null,
      kind: table.kind,
      title: table.title ?? null,
      attack_type: table.attack_type ?? null,
      fields: (table.rows ?? []).map((row) => fieldEntry(row, table)),
    }));
}

function shipModuleModifiersOf(tables) {
  const mods = [];
  for (const table of tables) {
    if (table?.kind !== 'wikitable') continue;
    if (String(table.context_heading ?? '') !== 'Applicable_Ship_Modules') continue;
    for (const row of table.rows ?? []) {
      mods.push({
        department: row.key ?? null,
        module: row.variant ?? null,
        effect_raw: row.raw ?? null,
        source: {
          table_index: table.index ?? null,
          table_kind: table.kind,
          table_title: table.title ?? null,
          context_heading: table.context_heading ?? null,
        },
      });
    }
  }
  return mods;
}

function coverageStatus(layer) {
  if (!layer || layer.present === false) return 'absent';
  return layer.baseline_status;
}

const DURATION_KEYS = ['duration', 'aoe_duration', 'lifetime', 'status_duration'];

/**
 * Extract the coverage record for one snapshot item. `family` selects which
 * inventory layers apply, so invocation count, effect duration, reuse cooldown,
 * Eagle mount/rearm and green deployable ammunition are never conflated.
 */
export function extractIdentity(item, { catalogEntry = null } = {}) {
  if (!item || typeof item !== 'object') throw new TypeError('extractIdentity requires a snapshot item');
  const family = COVERED_FAMILIES.includes(item.category) ? item.category : null;
  const { tables, flat } = rowsOf(item);
  const provenance = item.provenance ?? {};

  const callLatency = buildLayer(entriesWithKeys(flat, ['call_in_time']));
  const reuseCooldown = buildLayer(entriesWithKeys(flat, ['cooldown']));
  const effectDuration = buildKeyedGroup(entriesWithKeys(flat, DURATION_KEYS), { groupBySource: true });

  const layers = {
    call_latency: callLatency,
    effect_duration: effectDuration,
    reuse_cooldown: reuseCooldown,
    eagle_mounted_uses: buildLayer(family === 'eagle' ? entriesWithKeys(flat, ['uses']) : []),
    eagle_mounted_uses_total: buildLayer(family === 'eagle' ? entriesWithKeys(flat, ['total_uses']) : []),
    eagle_rearm: buildLayer(family === 'eagle' ? entriesWithKeys(flat, ['rearm_time']) : []),
    orbital_mission_use_limit: buildLayer(family === 'orbital' ? entriesWithKeys(flat, ['uses']) : []),
    deployable_call_limit: buildLayer(family === 'deployable' ? entriesWithKeys(flat, ['uses']) : []),
    deployable_ammo: buildKeyedGroup(family === 'deployable' ? entriesWithKeys(flat, ['sentry_ammo', 'capacity', 'barrels']) : []),
    payload_counts: buildKeyedGroup(['orbital', 'eagle'].includes(family) ? entriesWithKeys(flat, ['bombs', 'salvos', 'capacity', 'bombardment_area_size']) : []),
  };

  const coverage = {};
  for (const [name, layer] of Object.entries(layers)) coverage[name] = coverageStatus(layer);

  const gaps = [];
  for (const layerName of ['call_latency', 'reuse_cooldown']) {
    if (!layers[layerName].present) gaps.push({ layer: layerName, status: 'absent_in_snapshot' });
    else if (layers[layerName].baseline_status === 'conflict') gaps.push({ layer: layerName, status: 'conflicting_sources' });
    else if (layers[layerName].baseline_status === 'variant_only') gaps.push({ layer: layerName, status: 'only_upgrade_variants' });
  }
  if (!layers.effect_duration.present) gaps.push({ layer: 'effect_duration', status: 'absent_in_snapshot' });
  else {
    for (const [name, part] of Object.entries(layers.effect_duration.parts)) {
      if (part.baseline_status === 'conflict') gaps.push({ layer: `effect_duration.${name}`, status: 'conflicting_sources' });
    }
  }
  if (family === 'eagle') {
    if (!layers.eagle_mounted_uses.present) gaps.push({ layer: 'eagle_mounted_uses', status: 'absent_in_snapshot' });
    if (!layers.eagle_rearm.present) gaps.push({ layer: 'eagle_rearm', status: 'absent_in_snapshot' });
  }
  if (family === 'orbital' && !layers.orbital_mission_use_limit.present) gaps.push({ layer: 'orbital_mission_use_limit', status: 'absent_in_snapshot' });
  if (family === 'deployable' && !layers.deployable_ammo.present) gaps.push({ layer: 'deployable_ammo', status: 'absent_in_snapshot' });

  const attackTables = attackTablesOf(tables);
  if (!attackTables.some((t) => t.kind === 'attack_explosion')) gaps.push({ layer: 'explosion_parameters', status: 'absent_in_snapshot' });

  return {
    id: item.id ?? null,
    family,
    name_en: item.name_en ?? null,
    name_zh: item.name_zh ?? null,
    page_title: item.page_title ?? null,
    source_url: item.source_url ?? null,
    catalog: {
      present: Boolean(catalogEntry),
      selection_slot: catalogEntry?.selection_slot ?? null,
      catalog_id: catalogEntry?.id ?? null,
    },
    provenance: {
      revid: provenance.revid ?? null,
      revision_timestamp: provenance.revision_timestamp ?? null,
      fetched_at: provenance.fetched_at ?? null,
      html_sha256: provenance.html_sha256 ?? null,
      locator: provenance.locator ?? null,
    },
    layers,
    coverage,
    attack_tables: attackTables,
    table_inventory: tables.map((table) => ({
      table_index: table.index ?? null,
      kind: table.kind ?? null,
      title: table.title ?? null,
      context_heading: table.context_heading ?? null,
      row_count: Array.isArray(table.rows) ? table.rows.length : 0,
    })),
    ship_module_modifiers: shipModuleModifiersOf(tables),
    duplicate_key_sources: duplicateKeySources(flat),
    gaps,
  };
}

function fieldByKey(collection, key) {
  if (!collection?.present) return null;
  const fields = collection.fields ?? [];
  return fields.find((f) => f.key === key) ?? null;
}

function partOf(collection, key) {
  if (!collection?.present) return null;
  return collection.parts?.[key] ?? null;
}

const ABSENT_CELL = { text: 'unknown', value: null, unit: null, variant: null, source: null, status: 'absent' };

function toCell(entry) {
  if (!entry) return { ...ABSENT_CELL };
  const canonical = entry.canonical ?? { status: entry.status ?? 'unknown', value: entry.value ?? null, unit: entry.unit ?? null };
  return {
    text: entry.raw ?? '',
    value: canonical.value ?? null,
    unit: canonical.unit ?? null,
    variant: entry.variant ?? null,
    status: canonical.status ?? 'unknown',
    source: entry.source ?? null,
  };
}

/** Human-readable rendering of one field entry: show a normalized form only when
 * the unit actually changed (seconds -> ms), never repeat the same number twice. */
export function formatEntry(entry) {
  if (!entry) return 'unknown';
  const c = entry.canonical ?? {};
  const raw = entry.raw ?? '';
  if (c.status === 'unlimited') return 'Unlimited';
  if (c.status === 'ok') {
    if (c.family === 'time' && c.raw_unit && c.raw_unit.toLowerCase() !== 'ms') return raw + ' = ' + c.value + ' ms';
    if (c.family === 'length' && c.raw_unit && c.raw_unit !== 'm' && c.unit === 'm') return raw + ' = ' + c.value + ' m';
    return raw;
  }
  if (c.status === 'range') return raw + ' (区间 ' + c.range[0] + '~' + c.range[1] + '，不归一化)';
  return raw + ' (canonical null: ' + c.status + ')';
}

function layerCell(layer) {
  if (!layer || layer.present === false) return { ...ABSENT_CELL };
  if (layer.baseline) return toCell(layer.baseline);
  return {
    text: layer.baseline_status === 'conflict' ? 'null (源冲突)' : 'null (仅升级变体)',
    value: null,
    unit: null,
    variant: null,
    source: null,
    status: layer.baseline_status,
  };
}

const COMPARABLE_LAYERS = [
  ['reuse_cooldown', '复用冷却'],
  ['call_latency', '调用延迟'],
  ['eagle_rearm', '飞鹰再挂载'],
  ['eagle_mounted_uses', '飞鹰每轮挂载次数'],
  ['orbital_mission_use_limit', '轨道任务总使用上限'],
];

const COMPARABLE_PAYLOAD_KEYS = [
  ['bombs', '每轮投弹数(bombs)'],
  ['salvos', '齐射轮数(salvos)'],
  ['bombardment_area_size', '压制区尺寸'],
];

/** Factual, field-by-field comparison of two identities. No scoring judgement. */
export function compareIdentities(a, b) {
  const rows = [];
  const relation = (left, right) => {
    if (left.status === 'unlimited' && right.status === 'unlimited') return 'equal';
    if (left.value == null || right.value == null) {
      if (left.text && right.text && left.status !== 'absent' && right.status !== 'absent') return 'text_differs';
      return 'not_comparable';
    }
    if (left.unit !== right.unit) return 'not_comparable';
    if (left.value === right.value) return 'equal';
    return left.value > right.value ? 'a_higher' : 'b_higher';
  };
  const pushRow = (layer, label, left, right) => {
    if (left.text === 'unknown' && right.text === 'unknown') return;
    rows.push({ layer, label, a: left, b: right, relation: relation(left, right) });
  };

  for (const [layerName, label] of COMPARABLE_LAYERS) {
    const left = layerCell(a?.layers?.[layerName]);
    const right = layerCell(b?.layers?.[layerName]);
    pushRow(layerName, label, left, right);
  }
  for (const [key, label] of COMPARABLE_PAYLOAD_KEYS) {
    pushRow('payload_counts', label, layerCell(partOf(a?.layers?.payload_counts,key)), layerCell(partOf(b?.layers?.payload_counts,key)));
  }

  const tablesOf = (identity, kind) => (identity?.attack_tables ?? []).filter((t) => t.kind === kind);
  const compareAttackField = (label, kind, key) => {
    const leftEntries = tablesOf(a, kind).flatMap(t=>t.fields.filter(f=>f.key===key));
    const rightEntries = tablesOf(b, kind).flatMap(t=>t.fields.filter(f=>f.key===key));
    pushRow('attack_parameters', label, layerCell(buildLayer(leftEntries)), layerCell(buildLayer(rightEntries)));
  };
  compareAttackField('弹丸伤害(damage_standard)', 'attack_projectile', 'damage_standard');
  compareAttackField('弹丸耐久伤害(damage_durable)', 'attack_projectile', 'damage_durable');
  compareAttackField('直击穿甲(pen_direct)', 'attack_projectile', 'pen_direct');
  compareAttackField('爆炸内圈伤害(damage_inner_radius)', 'attack_explosion', 'damage_inner_radius');
  compareAttackField('爆炸内圈耐久(inner_durable)', 'attack_explosion', 'inner_durable');
  compareAttackField('爆炸内圈半径(area_of_effect_inner_radius)', 'attack_explosion', 'area_of_effect_inner_radius');
  compareAttackField('爆炸外圈半径(area_of_effect_outer_radius)', 'attack_explosion', 'area_of_effect_outer_radius');
  compareAttackField('冲击波半径(shockwave_radius)', 'attack_explosion', 'shockwave_radius');
  compareAttackField('内圈穿甲(pen_inner)', 'attack_explosion', 'pen_inner');
  compareAttackField('拆解力(demolition_force)', 'attack_explosion', 'demolition_force');

  return {
    a_id: a?.id ?? null,
    b_id: b?.id ?? null,
    a_revid: a?.provenance?.revid ?? null,
    b_revid: b?.provenance?.revid ?? null,
    rows,
  };
}

const CANNOT_SHOW = [
  '单发/单轮命中率与敌人实际进入落区的比例：快照只有单值与表头，没有实测投放数据',
  '同一波次连续两次调用的实际节奏：快照只有冷却与调用延迟，不含玩家投点与走位时间',
  '多枚炸弹/多轮齐射覆盖同一目标的实际重叠比例：需逐落点几何与目标体积，本层不做',
  '对具体重甲目标的有效击杀次数：需目标HP/部位/护甲与落点绑定，本层不推算',
  '压制区尺寸（bombardment_area_size）与单弹实际杀伤半径的换算：两者不是同一字段，也不能将其称作口径',
  '因此"120实战明显优于380"只能是用户口述排序，不能由快照数值推导；也不能因单发数值更高就反向改判',
];

const NORMALIZATION_RULES = [
  '时间：s/sec/seconds/ms -> 毫秒；仅当原始单元格是单一数值加单位',
  '长度：m/cm/mm -> 米（cm/mm 折算并保留原始raw）；仅当单一数值加单位',
  '伤害：保留数值与原始伤害类型（Damage/Explosion/Ballistic/Gas/Fire），不跨类型换算或求和',
  '计数：纯整数（uses/bombs/salvos/capacity/sentry_ammo 等）-> count；"∞"/"Unlimited" -> unlimited，数值留空',
  '区间（如 "1199 - 0"）、复合规格（如 "↔[5.00] ↕[15.00]"）、带星注记（如 "40*"）、自由文本：canonical 为 null，只保留 raw',
  '同一字段的多来源/多升级变体全部保留：baseline 只取无变体行或标注 Standard 的行，若这些行彼此不一致则 baseline 为 null 并记入 conflicts；Upgraded / With X 等变体各自保留，不取最大也不取平均',
  '语义不同的字段分列：sentry_ammo（总弹量）≠ capacity（弹匣/单轮容量）≠ barrels；同一 key 来自不同表且标题不同（如两个状态各自的持续时间）也分开保留',
];

/**
 * Build the full report from an already-parsed snapshot + catalog.
 * Pure and deterministic: no filesystem, clock or network access.
 */
export function buildCoverageReport({ snapshot, catalog, sources = {}, source_hashes = {}, author = '' } = {}) {
  if (!snapshot || !Array.isArray(snapshot.items)) throw new TypeError('buildCoverageReport requires a parsed snapshot with items[]');
  const catalogEquipment = Array.isArray(catalog?.equipment) ? catalog.equipment : [];
  const catalogById = new Map(catalogEquipment.map((e) => [e.id, e]));
  const catalogStratagems = catalogEquipment.filter((e) => e.selection_slot === 'stratagem');
  const snapshotById = new Map(snapshot.items.filter((i) => i && i.id).map((i) => [i.id, i]));

  const identities = [];
  for (const item of snapshot.items) {
    if (item?.kind !== 'stratagem') continue;
    if (!COVERED_FAMILIES.includes(item.category)) continue;
    identities.push(extractIdentity(item, { catalogEntry: catalogById.get(item.id) ?? null }));
  }
  identities.sort((x, y) => (COVERED_FAMILIES.indexOf(x.family) - COVERED_FAMILIES.indexOf(y.family)) || String(x.id).localeCompare(String(y.id)));

  const missingFromSnapshot = [];
  for (const entry of catalogStratagems) {
    const item = snapshotById.get(entry.id);
    if (!item) {
      missingFromSnapshot.push({ id: entry.id, name: entry.name ?? null, reason: 'catalog stratagem has no snapshot item' });
      continue;
    }
    if (!COVERED_FAMILIES.includes(item.category)) continue;
    if (!identities.some((i) => i.id === entry.id)) missingFromSnapshot.push({ id: entry.id, name: entry.name ?? null, reason: 'family in scope but item not extracted' });
  }

  const outOfScope = {};
  for (const entry of catalogStratagems) {
    const family = snapshotById.get(entry.id)?.category ?? 'unknown';
    if (COVERED_FAMILIES.includes(family)) continue;
    outOfScope[family] = (outOfScope[family] ?? 0) + 1;
  }

  const conflicts = [];
  const gapCounts = {};
  for (const identity of identities) {
    for (const gap of identity.gaps) gapCounts[`${gap.layer}:${gap.status}`] = (gapCounts[`${gap.layer}:${gap.status}`] ?? 0) + 1;
    for (const [layerName, layer] of Object.entries(identity.layers)) {
      for (const conflict of layer.conflicts ?? []) conflicts.push({ id: identity.id, layer: layerName, ...conflict });
      for (const [partName, part] of Object.entries(layer.parts ?? {})) {
        for (const conflict of part.conflicts ?? []) conflicts.push({ id: identity.id, layer: `${layerName}.${partName}`, ...conflict });
      }
    }
  }

  const duplicates = identities
    .map((identity) => ({ id: identity.id, duplicates: identity.duplicate_key_sources }))
    .filter((row) => row.duplicates.length);

  const factCompare = compareIdentities(
    identities.find((i) => i.id === 'orbital_120mm_he_barrage') ?? null,
    identities.find((i) => i.id === 'orbital_380mm_he_barrage') ?? null,
  );

  return {
    schema: COVERAGE_SCHEMA,
    author,
    purpose: '红/绿战备覆盖资料层：只记录有出处的调用、持续、复用冷却、库存与爆炸参数；不产出六维评分，不把理论payload当实战清杂',
    generated_from: {
      snapshot_schema: snapshot.schema ?? null,
      snapshot_generated_at: snapshot.summary?.generated_at ?? null,
      snapshot_source_api: snapshot.summary?.source_api ?? null,
      snapshot_covered: snapshot.summary?.covered ?? null,
      catalog_schema: catalog?.schema ?? null,
      sources: { snapshot: sources.snapshot ?? null, catalog: sources.catalog ?? null },
      source_hashes: {snapshot:source_hashes.snapshot??null,catalog:source_hashes.catalog??null},
    },
    scope: {
      families: COVERED_FAMILIES,
      identity_count: identities.length,
      catalog_stratagem_total: catalogStratagems.length,
      catalog_stratagems_out_of_scope: outOfScope,
      in_scope_missing_from_snapshot: missingFromSnapshot,
    },
    normalization: { rules: NORMALIZATION_RULES },
    scoring: {
      six_dimension_scores: null,
      note: '本层不提供清杂/近防/反中/反重/拆迁/续航六维分；覆盖与库存事实供评价层引用，红绿0.6贡献折扣在评价层施加一次',
    },
    identities,
    fact_compare: {
      ...factCompare,
      snapshot_cannot_show: CANNOT_SHOW,
      user_ordering_note: {
        claim: '用户认为120实战表现明显优于380',
        claim_type: '用户口述排序（非快照可证）',
        allowed_use: '可作评价层的排序约束或待验证假设',
        forbidden_use: '不得据此写成理论证明，也不得因快照单发数值更高而反向改判为380更优',
      },
    },
    conflicts,
    duplicate_key_sources: duplicates,
    gap_counts: gapCounts,
    boundaries: [
      'uses只表示任务内总使用限制：Unlimited不是当前无限次就绪；不据此填充反重现成库存',
      'baseline为未升级或原表基线；全模块升级效果未在本资料层结算，不能直接当N10全升级时序',
      'lifetime可能是飞行弹丸或部署物寿命，status_duration是附着状态时长，不能统统当区域持续压制时间',
      '候选来自失败委派6dab7d07的已保存文件，由协调端核对来源后接续修正；不是DS正常DONE或自动验收',
      '绿色战备拆迁恒0是项目规则，不由本层 demolition_force 字段推出；本层只记录原始参数，不换算洞数',
      '烟雾无收益属评价层规则；本层仍如实记录其时长与半径字段',
      '未联网；全部数值来自 2026-10-23 冻结快照，不声称等于当前游戏版本',
      '多模式/多齐射数值并列保留，不做机械相加，也不给理论payload总伤',
    ],
  };
}

function baselineText(layer) {
  if (!layer || layer.present === false) return 'null (absent)';
  if (!layer.baseline) return layer.baseline_status === 'conflict' ? 'null (conflict)' : 'null (variant_only)';
  const b = layer.baseline;
  if (b.status === 'unlimited') return 'Unlimited';
  if (b.unit === 'ms' && typeof b.value === 'number') return `${b.raw} = ${b.value} ms`;
  if (b.value == null) return `${b.raw} (canonical null)`;
  return `${b.raw} = ${b.value} ${b.unit}`;
}

function groupText(group, { separator = '; ' } = {}) {
  if (!group || group.present === false) return 'null (absent)';
  const parts = Object.entries(group.parts ?? {}).map(([name, part]) => `${name}: ${baselineText(part)}`);
  return parts.length ? parts.join(separator) : 'null (absent)';
}

function cellText(cell) {
  if (!cell) return 'unknown';
  return cell.text ?? 'unknown';
}

const RELATION_TEXT = { a_higher: 'A更高', b_higher: 'B更高', equal: '相同', not_comparable: '不可比', text_differs: '文本不同（快照内未定序）' };

/** Deterministic Markdown rendering of a report built by buildCoverageReport(). */
export function renderMarkdown(report, { command = '' } = {}) {
  const lines = [];
  const push = (line = '') => lines.push(line);
  const ids = report.identities ?? [];
  const sourceLabel = (key) => {
    const src = key ?? {};
    return `${src.table_index}:${src.table_kind}:${src.table_title ?? src.context_heading ?? '-'}`;
  };

  push('# 红/绿战备覆盖资料层（冻结快照 2026-10-23）');
  push();
  push('作者：');
  push();
  push(`- 模式：\`${report.schema}\`；覆盖身份 ${report.scope.identity_count} 项（orbital/eagle/deployable），catalog 战备总数 ${report.scope.catalog_stratagem_total}。`);
  const outOfScope = Object.entries(report.scope.catalog_stratagems_out_of_scope ?? {}).map(([k, v]) => `${k}=${v}`).join('，') || '无';
  push(`- 范围外家族（本层不取）：${outOfScope}；范围内但快照缺失：${report.scope.in_scope_missing_from_snapshot.length} 项。`);
  push(`- 快照：\`${report.generated_from.sources.snapshot}\`（schema \`${report.generated_from.snapshot_schema}\`，生成于 ${report.generated_from.snapshot_generated_at}，来源 ${report.generated_from.snapshot_source_api}）。`);
  push(`- 目录：\`${report.generated_from.sources.catalog}\`（schema ${report.generated_from.catalog_schema}）。`);
  push(`- 输入SHA256：snapshot=${report.generated_from.source_hashes.snapshot??'未提供'}；catalog=${report.generated_from.source_hashes.catalog??'未提供'}。`);
  push('- 本文件由模块 CLI 机械生成，内容可复现。不含六维评分，不含敌群密度/战斗时长/命中率/舰船模块因子假设。');
  push();

  push('## 生成命令（使用所授予的冻结快照）');
  push();
  push('```bash');
  push(command || 'node shared/hd2-loadout/calibration/practical/strategic-coverage.mjs --snapshot <snapshot.json> --catalog <catalog.json> --json <out.json> --markdown <out.md>');
  push('```');
  push();

  push('## 归一化与缺失口径');
  push();
  for (const rule of report.normalization.rules) push(`- ${rule}`);
  push('- 缺失一律 `null`/`unknown`，不填 0；`baseline` 仅在非变体来源一致时给出，冲突时保持 `null` 并列在下方冲突表。');
  push();

  push('## 总表：调用 / 持续 / 复用冷却 / 库存');
  push();
  push('| id | 家族 | revid | 复用冷却（原表基线） | 调用延迟（原表基线） | 时长字段（按来源，非统一覆盖率） | 飞鹰挂载 / 再挂载 | 轨道任务总使用上限 | 绿色弹药 / 调用 / 寿命 |');
  push('|---|---|---|---|---|---|---|---|---|');
  for (const identity of ids) {
    const l = identity.layers;
    const eagle = identity.family === 'eagle'
      ? `${baselineText(l.eagle_mounted_uses)}${l.eagle_mounted_uses_total.present ? ` (total_uses: ${baselineText(l.eagle_mounted_uses_total)})` : ''} / ${baselineText(l.eagle_rearm)}`
      : 'n/a';
    const charges = identity.family === 'orbital' ? baselineText(l.orbital_mission_use_limit) : 'n/a';
    const ammo = identity.family === 'deployable'
      ? `${groupText(l.deployable_ammo)}; 调用=${baselineText(l.deployable_call_limit)}`
      : 'n/a';
    push(`| ${identity.id} | ${identity.family} | ${identity.provenance.revid} | ${baselineText(l.reuse_cooldown)} | ${baselineText(l.call_latency)} | ${groupText(l.effect_duration)} | ${eagle} | ${charges} | ${ammo} |`);
  }
  push();

  push('## 爆炸/直击参数（逐项，按表）');
  push();
  push('| id | revid | 表(kind/title) | 内圈伤害 | 内圈耐久 | 内圈半径 | 外圈半径 | 冲击波 | 内圈AP | 拆解力 | 状态持续 |');
  push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const identity of ids) {
    const explosions = identity.attack_tables.filter((t) => t.kind === 'attack_explosion');
    if (!explosions.length) {
      push(`| ${identity.id} | ${identity.provenance.revid} | 快照无 attack_explosion 表 | unknown | unknown | unknown | unknown | unknown | unknown | unknown | unknown |`);
      continue;
    }
    for (const table of explosions) {
      const get = (key) => table.fields.find((f) => f.key === key);
      const val = (key) => {
        const entry = get(key);
        return entry ? formatEntry(entry) : 'unknown';
      };
      push(`| ${identity.id} | ${identity.provenance.revid} | ${table.table_index}:${table.kind}:${table.title ?? '-'} | ${val('damage_inner_radius')} | ${val('inner_durable')} | ${val('area_of_effect_inner_radius')} | ${val(get('area_of_effect_outer_radius') ? 'area_of_effect_outer_radius' : 'outer_radius')} | ${val('shockwave_radius')} | ${val('pen_inner')} | ${val('demolition_force')} | ${val('aoe_duration')} |`);
    }
  }
  push();

  push('## 120mm 与 380mm 逐字段事实对照');
  push();
  const fc = report.fact_compare;
  push(`- 左侧 A：\`${fc.a_id}\`（revid ${fc.a_revid}）；右侧 B：\`${fc.b_id}\`（revid ${fc.b_revid}）。`);
  push('- 只并列快照单值；"关系"只表示两个同单位数值的大小，不代表实战优劣。');
  push();
  push('| 字段 | A：120mm | B：380mm | 关系 |');
  push('|---|---|---|---|');
  for (const row of fc.rows ?? []) {
    push(`| ${row.label} | ${cellText(row.a)} | ${cellText(row.b)} | ${RELATION_TEXT[row.relation] ?? row.relation} |`);
  }
  push();
  const equalRows = (fc.rows ?? []).filter((r) => r.relation === 'equal');
  const higherA = (fc.rows ?? []).filter((r) => r.relation === 'a_higher');
  const higherB = (fc.rows ?? []).filter((r) => r.relation === 'b_higher');
  const notComparable = (fc.rows ?? []).filter((r) => r.relation === 'not_comparable');
  push('### 事实归纳（只描述数值关系）');
  push();
  push(`- 相同：${equalRows.length ? equalRows.map((r) => r.label).join('、') : '无'}`);
  push(`- 120 数值更高：${higherA.length ? higherA.map((r) => r.label).join('、') : '无'}`);
  push(`- 380 数值更高：${higherB.length ? higherB.map((r) => r.label).join('、') : '无'}`);
  push(`- 不可比（缺值/单位或状态不同）：${notComparable.length ? notComparable.map((r) => r.label).join('、') : '无'}`);
  push();
  push('### 快照不能证实的部分');
  push();
  for (const item of fc.snapshot_cannot_show) push(`- ${item}`);
  push();
  push(`- 用户排序：${fc.user_ordering_note.claim}（${fc.user_ordering_note.claim_type}）。允许用法：${fc.user_ordering_note.allowed_use}；禁止用法：${fc.user_ordering_note.forbidden_use}。`);
  push();

  push('## 源冲突（不静默取最大）');
  push();
  if (!(report.conflicts ?? []).length) {
    push('- 无。');
  } else {
    push('| id | 层 | 字段 | 冲突取值 | 来源 |');
    push('|---|---|---|---|---|');
    for (const conflict of report.conflicts) {
      const tokens = (conflict.tokens ?? []).join(' vs ');
      const sources = (conflict.entries ?? []).map((e) => `${e.raw} @${e.source.table_index}:${e.source.table_kind}:${e.source.table_title ?? e.source.context_heading ?? '-'}`).join(' ; ');
      push(`| ${conflict.id} | ${conflict.layer} | ${(conflict.keys ?? []).join(',')} | ${tokens} | ${sources} |`);
    }
  }
  push();

  push('## 同字段跨表出现（仅统计表；attack_* 子表各描述不同弹丸/爆炸组件，不并入）');
  push();
  if (!(report.duplicate_key_sources ?? []).length) {
    push('- 无同字段跨表重复。');
  } else {
    push('| id | 字段 | 来源表(index:kind:title) | 条目数 | 取值一致 |');
    push('|---|---|---|---|---|');
    for (const row of report.duplicate_key_sources) {
      for (const duplicate of row.duplicates) {
        push(`| ${row.id} | ${duplicate.key} | ${duplicate.sources.join(' ; ')} | ${duplicate.entry_count} | ${duplicate.same_value ? '是' : '否'} |`);
      }
    }
  }
  push();

  push('## 缺口统计');
  push();
  const gapEntries = Object.entries(report.gap_counts ?? {}).sort((a, b) => a[0].localeCompare(b[0]));
  if (!gapEntries.length) push('- 无缺失层。');
  for (const [key, count] of gapEntries) push(`- \`${key}\`：${count} 项`);
  push();
  push('### 逐项缺口');
  push();
  push('| id | 缺失/冲突层 |');
  push('|---|---|');
  for (const identity of ids) {
    if (!identity.gaps.length) continue;
    push(`| ${identity.id} | ${identity.gaps.map((g) => `${g.layer}=${g.status}`).join('; ')} |`);
  }
  push();

  push('## 舰船模块原始描述（未套用，仅保留原文）');
  push();
  const withMods = ids.filter((i) => i.ship_module_modifiers.length);
  push(`- 含"Applicable Ship Modules"表的身份：${withMods.length}/${ids.length}；本层不把百分比模块效果折算成新数值。`);
  const seen = new Set();
  for (const identity of withMods) {
    for (const mod of identity.ship_module_modifiers) {
      const key = `${mod.department}|${mod.module}|${mod.effect_raw}`;
      if (seen.has(key)) continue;
      seen.add(key);
      push(`- ${mod.department} / ${mod.module}：${mod.effect_raw}`);
    }
  }
  push();

  push('## 边界');
  push();
  for (const boundary of report.boundaries) push(`- ${boundary}`);
  push('- 未联网、未跑游戏、未接页面；不含敌群密度、战斗时长、命中率、舰船模块因子或120/380精确分。');
  push();

  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
}

// ---------------------------------------------------------------------------
// Optional CLI. Extraction functions above stay I/O-free.
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const out = { snapshot: null, catalog: null, json: null, markdown: null, stdout: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--snapshot') out.snapshot = argv[++i];
    else if (arg === '--catalog') out.catalog = argv[++i];
    else if (arg === '--json') out.json = argv[++i];
    else if (arg === '--markdown') out.markdown = argv[++i];
    else if (arg === '--stdout') out.stdout = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

function usage() {
  return [
    'usage: node strategic-coverage.mjs --snapshot <equipment-expanded.json> --catalog <catalog.json> \\',
    '         [--json <out.json>] [--markdown <out.md>] [--stdout]',
  ].join('\n');
}

async function runCli(argv) {
  const fs = await import('node:fs');
  const {createHash}=await import('node:crypto');
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (!args.snapshot || !args.catalog) {
    process.stderr.write(`${usage()}\n`);
    process.exitCode = 2;
    return;
  }
  const snapshotBytes=fs.readFileSync(args.snapshot),catalogBytes=fs.readFileSync(args.catalog);
  const snapshot = JSON.parse(snapshotBytes.toString('utf8'));
  const catalog = JSON.parse(catalogBytes.toString('utf8'));
  const report = buildCoverageReport({
    snapshot,
    catalog,
    sources: { snapshot: args.snapshot, catalog: args.catalog },
    source_hashes:{snapshot:createHash('sha256').update(snapshotBytes).digest('hex'),catalog:createHash('sha256').update(catalogBytes).digest('hex')},
    author: '',
  });
  const markdown = renderMarkdown(report, {
    command: `node shared/hd2-loadout/calibration/practical/strategic-coverage.mjs --snapshot ${args.snapshot} --catalog ${args.catalog} --json ${args.json ?? '<out.json>'} --markdown ${args.markdown ?? '<out.md>'}`,
  });
  if (args.json) fs.writeFileSync(args.json, `${JSON.stringify(report, null, 2)}\n`);
  if (args.markdown) fs.writeFileSync(args.markdown, markdown);
  if (args.stdout || (!args.json && !args.markdown)) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.stderr.write(`identities=${report.scope.identity_count} conflicts=${report.conflicts.length} duplicate_fields=${report.duplicate_key_sources.length}\n`);
}

if (typeof process !== 'undefined' && process.argv?.[1]) {
  const { pathToFileURL } = await import('node:url');
  if (import.meta.url === pathToFileURL(process.argv[1]).href) await runCli(process.argv.slice(2));
}
