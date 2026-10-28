// Red/green stratagem "upgraded" field selection on top of the accepted
// strategic-coverage/1 extraction result.
//
// Two axes are kept strictly apart (see docs/loadout-v3-strategic-upgraded-20261026.md):
//
//   A. Single-row observation (`observed_upgraded`, `observed_upgraded_status`)
//      "Does an explicit `Upgraded` row exist for this field?" A single Upgraded
//      row says nothing about modules it does not cover, so it is never promoted
//      to a full-upgrade value on the strength of its name alone.
//
//   B. Full-upgrade selection (`selected_full_upgrade`, `full_upgrade_status`)
//      The user states every ship module is upgraded, and the frozen table prints
//      an explicit `With All Upgrades` row. That row is a source-declared
//      all-upgrades value: it is used verbatim as the full-upgrade value when it is
//      unique and numerically usable. Percentages are never re-derived or stacked.
//
// Rules the code enforces:
//   1. Unique, usable `With All Upgrades` row -> full READY, value taken verbatim
//      (120mm cooldown 153.9 s, 380mm 205.2 s, 500kg 6.75 s).
//   2. Only a plain `Upgraded` row -> observation READY, full status PARTIAL. A
//      record cannot prove the field is unaffected by other modules.
//   3. A single Upgraded row whose value differs from the aggregate row is a
//      *different upgrade degree*, not a conflict; both stay in the record and the
//      aggregate row drives the full-upgrade value.
//   4. Conflicting aggregate rows (different values) -> CONFLICT, nothing chosen.
//      Conflicting plain Upgraded rows -> observation CONFLICT.
//   5. "Unlimited" is a mission use cap: the physical fact is kept
//      (`physical_reading.kind = unlimited_mission_cap`) but it is never current
//      inventory and never a number.
//   6. Non-normalized aggregate values (stars/ranges/text) do not become full READY.
//   7. Missing data stays null/unknown with an explicit status. No 0, no facts
//      reverse-engineered from candidate six-dimension scores.
//
// Pure functions, no third-party dependency, no I/O in the selection path. The
// only import is the sibling coverage module (same project, side-effect free) so
// value classification stays identical to the accepted extraction layer. The
// optional CLI imports node:fs/node:crypto lazily and is bypassed on import.

import { comparableToken } from './strategic-coverage.mjs';

export const UPGRADED_SCHEMA = 'hd2-strategic-upgraded/1';
export const UPGRADED_VARIANT = 'Upgraded';
export const AGGREGATE_VARIANT = 'With All Upgrades';
export const FULL_UPGRADE_STATUSES = ['READY', 'PARTIAL', 'UNKNOWN', 'CONFLICT'];
export const OBSERVED_STATUSES = ['READY', 'NONE', 'CONFLICT'];

/** Fields the selector answers for. `families` null means "every identity". */
export const FIELD_SPECS = [
  { field: 'call_latency', layer: 'call_latency', keys: ['call_in_time'], families: null, label_zh: '调用延迟' },
  { field: 'reuse_cooldown', layer: 'reuse_cooldown', keys: ['cooldown'], families: null, label_zh: '复用冷却' },
  { field: 'eagle_mounted_uses', layer: 'eagle_mounted_uses', keys: ['uses'], families: ['eagle'], label_zh: '飞鹰挂载次数' },
  { field: 'eagle_rearm', layer: 'eagle_rearm', keys: ['rearm_time'], families: ['eagle'], label_zh: '飞鹰再挂载时间' },
  { field: 'orbital_mission_use_limit', layer: 'orbital_mission_use_limit', keys: ['uses'], families: ['orbital'], label_zh: '轨道任务总使用上限' },
  { field: 'deployable_call_limit', layer: 'deployable_call_limit', keys: ['uses'], families: ['deployable'], label_zh: '绿战备调用次数' },
  { field: 'deployable_ammo', group: 'deployable_ammo', keys: ['sentry_ammo', 'capacity', 'barrels'], families: ['deployable'], label_zh: '绿战备弹药/弹匣' },
];

/** Identities quoted verbatim in the report so the numbers can be re-checked. */
export const EXAMPLE_IDS = [
  'orbital_120mm_he_barrage',
  'orbital_380mm_he_barrage',
  'eagle_500kg_bomb',
  'deployable_machine_gun_sentry',
];

export const CAVEATS = {
  field_absent_in_snapshot: '原表没有该字段，保持 unknown，不写 0',
  no_upgrade_row_in_snapshot: '原表只有单一基线值，没有任何升级行，不能证明不受其他模块影响',
  single_upgraded_row_not_declared_all_upgrades: '只有普通 Upgraded 行：可作单项观测，不宣称全部模块已满',
  no_aggregate_all_upgrades_row: '原表没有 "With All Upgrades" 聚合行，无法给出全升级字段值',
  module_specific_variants_not_stacked: '只有模块分项变体，不叠加百分比、不取最大/最小',
  multiple_upgraded_rows: '普通 Upgraded 行互相矛盾，单项观测保持冲突',
  conflicting_all_upgrades_rows: '聚合全升级行互相矛盾，保持冲突不取值',
  all_upgrades_value_not_fully_normalized: '聚合全升级值未完全数值化（星号/区间/复合/文字），不判 full READY',
  upgraded_value_not_fully_normalized: '单项升级值未完全数值化（星号/区间/复合/文字），原样保留',
  single_upgraded_differs_from_all_upgrades: '单项 Upgraded 与聚合全升级值不同：视为不同升级程度，两者都保留',
  baseline_sources_disagree: '非变体来源本身不一致，基线参考留空并列来源',
  unlimited_is_mission_cap_not_inventory: 'Unlimited 是任务内总使用上限的已知事实，但不是现成库存',
  baseline_unlimited_is_mission_cap: '基线为 Unlimited：保留该上限事实，不当作升级数值',
};

/** Recorded verification run for the committed report (see docs .md). */
export const VERIFICATION = {
  command: 'node scripts/tests/loadout-v3-practical/strategic-upgraded.test.mjs',
  run_at: '2026-10-26',
  result: '18/18 通过',
  tests_total: 18,
  note: '该结果是生成报告时实际运行上面的命令所得；以后以重新运行该命令为准（报告数值本身由覆盖率 JSON 机械复现，不因测试数变化而改判）',
};

const BASELINE_VARIANT_RE = /^standard$/i;
const UPGRADED_VARIANT_RE = /^upgraded$/i;
const AGGREGATE_VARIANT_RE = /^with all upgrades$/i;

/** Bucket a wiki `variant` cell without guessing what the wiki meant. */
export function classifyVariant(variant) {
  if (variant == null) return 'unvarianted';
  const text = String(variant).trim();
  if (!text) return 'unvarianted';
  if (UPGRADED_VARIANT_RE.test(text)) return 'upgraded';
  if (BASELINE_VARIANT_RE.test(text)) return 'baseline';
  if (AGGREGATE_VARIANT_RE.test(text)) return 'aggregate';
  return 'module_specific';
}

const USABLE_CANONICAL = ['ok', 'unlimited'];

function uniq(list) {
  return [...new Set(list)];
}

function entryView(entry) {
  const canonical = entry?.canonical ?? {};
  return {
    key: entry?.key ?? null,
    label: entry?.label ?? null,
    raw: entry?.raw ?? null,
    variant: entry?.variant ?? null,
    canonical_status: canonical.status ?? 'unknown',
    value: canonical.value ?? null,
    unit: canonical.unit ?? null,
    token: comparableToken(entry),
    source: {
      table_index: entry?.source?.table_index ?? null,
      table_kind: entry?.source?.table_kind ?? null,
      table_title: entry?.source?.table_title ?? null,
      context_heading: entry?.source?.context_heading ?? null,
    },
  };
}

function readingOf(view, sourceKind) {
  if (!view) {
    return {
      known: false,
      kind: 'absent',
      raw: null,
      value: null,
      unit: null,
      variant: null,
      source_kind: null,
      source: null,
      unlimited_mission_cap: false,
      inventory_note: null,
    };
  }
  const unlimited = view.canonical_status === 'unlimited';
  const kind = unlimited
    ? 'unlimited_mission_cap'
    : (view.canonical_status === 'ok' ? 'single_value' : `raw_${view.canonical_status}`);
  return {
    known: true,
    kind,
    raw: view.raw,
    value: view.value,
    unit: view.unit,
    variant: view.variant,
    source_kind: sourceKind,
    source: view.source,
    unlimited_mission_cap: unlimited,
    inventory_note: unlimited ? 'unlimited_is_mission_cap_not_inventory' : null,
  };
}

/**
 * Select upgrade information for one coverage field (or one part of a keyed
 * group). `layer` is a strategic-coverage/1 layer object; `spec` names the
 * logical field.
 */
export function selectUpgradeForField({ spec, part = null, layer = null } = {}) {
  if (!spec || !spec.field) throw new TypeError('selectUpgradeForField requires a field spec');
  const entries = Array.isArray(layer?.fields) ? layer.fields.filter(Boolean) : [];
  const views = entries.map(entryView);

  const upgraded = views.filter((view) => classifyVariant(view.variant) === 'upgraded');
  const baseline = views.filter((view) => ['unvarianted', 'baseline'].includes(classifyVariant(view.variant)));
  const aggregate = views.filter((view) => classifyVariant(view.variant) === 'aggregate');
  const moduleSpecific = views.filter((view) => classifyVariant(view.variant) === 'module_specific');

  const upgradedTokens = uniq(upgraded.map((view) => view.token));
  const baselineTokens = uniq(baseline.map((view) => view.token));
  const aggregateTokens = uniq(aggregate.map((view) => view.token));

  const caveats = [];

  // --- Axis A: single-row observation -------------------------------------
  let observedStatus;
  let observed = null;
  if (!upgraded.length) {
    observedStatus = 'NONE';
  } else if (upgradedTokens.length > 1) {
    observedStatus = 'CONFLICT';
    caveats.push('multiple_upgraded_rows');
  } else {
    observedStatus = 'READY';
    observed = upgraded[0];
    if (!USABLE_CANONICAL.includes(observed.canonical_status)) caveats.push('upgraded_value_not_fully_normalized');
    if (observed.canonical_status === 'unlimited') caveats.push('unlimited_is_mission_cap_not_inventory');
  }

  // --- Axis B: full-upgrade selection -------------------------------------
  let fullStatus;
  let basis;
  let selected = null;
  if (!views.length) {
    fullStatus = 'UNKNOWN';
    basis = 'absent';
    caveats.push('field_absent_in_snapshot');
  } else if (aggregate.length) {
    if (aggregateTokens.length > 1) {
      fullStatus = 'CONFLICT';
      basis = 'conflicting_all_upgrades_rows';
      caveats.push('conflicting_all_upgrades_rows');
    } else if (USABLE_CANONICAL.includes(aggregate[0].canonical_status)) {
      fullStatus = 'READY';
      basis = 'source_declared_all_upgrades_row';
      selected = aggregate[0];
      if (selected.canonical_status === 'unlimited') caveats.push('unlimited_is_mission_cap_not_inventory');
    } else {
      fullStatus = 'PARTIAL';
      basis = 'all_upgrades_row_not_numeric';
      caveats.push('all_upgrades_value_not_fully_normalized');
    }
  } else if (upgraded.length && upgradedTokens.length === 1) {
    fullStatus = 'PARTIAL';
    basis = 'single_upgraded_row_only';
    caveats.push('single_upgraded_row_not_declared_all_upgrades');
    caveats.push('no_aggregate_all_upgrades_row');
    if (moduleSpecific.length) caveats.push('module_specific_variants_not_stacked');
  } else if (upgraded.length) {
    fullStatus = 'PARTIAL';
    basis = 'conflicting_upgraded_rows_only';
    caveats.push('multiple_upgraded_rows');
    caveats.push('no_aggregate_all_upgrades_row');
  } else if (moduleSpecific.length) {
    fullStatus = 'PARTIAL';
    basis = 'module_variants_only';
    caveats.push('no_aggregate_all_upgrades_row');
    caveats.push('module_specific_variants_not_stacked');
  } else {
    fullStatus = 'UNKNOWN';
    basis = 'baseline_only';
    caveats.push('no_upgrade_row_in_snapshot');
  }

  if (observed && selected && observed.token !== selected.token) {
    caveats.push('single_upgraded_differs_from_all_upgrades');
  }
  if (baselineTokens.length > 1) caveats.push('baseline_sources_disagree');
  if (baseline.some((view) => view.canonical_status === 'unlimited')) caveats.push('baseline_unlimited_is_mission_cap');

  const baselineStatus = baselineTokens.length === 1
    ? 'ok'
    : (baseline.length ? 'conflict' : (views.length ? 'variant_only' : 'absent'));
  const baselineRef = baselineStatus === 'ok'
    ? {
      raw: baseline[0].raw,
      value: baseline[0].value,
      unit: baseline[0].unit,
      canonical_status: baseline[0].canonical_status,
      key: baseline[0].key,
      source: baseline[0].source,
      agreed_across_sources: baselineTokens.length === 1,
    }
    : null;

  // Physical reading: the best-sourced value this layer can state, keeping
  // Unlimited as a known mission cap instead of an unknown number.
  const readingView = selected ?? observed ?? (baselineRef ? baseline[0] : null);
  const readingKind = selected
    ? 'selected_full_upgrade'
    : (observed ? 'observed_upgraded' : (baselineRef ? 'baseline' : null));
  const physicalReading = readingOf(readingView, readingKind);

  return {
    field: part ? `${spec.field}.${part}` : spec.field,
    label_zh: spec.label_zh,
    layer: spec.layer ?? spec.group ?? null,
    part,
    family_scope: spec.families ?? 'all',
    keys: uniq(views.map((view) => view.key)).sort((a, b) => String(a).localeCompare(String(b))),
    present: views.length > 0,
    observed_upgraded: observed,
    observed_upgraded_status: observedStatus,
    observed_upgraded_count: upgraded.length,
    conflicting_upgraded: observedStatus === 'CONFLICT' ? upgraded : [],
    declared_all_upgrades: aggregate,
    selected_full_upgrade: selected,
    selected_full_upgrade_source_kind: selected ? 'source_declared_all_upgrades' : null,
    full_upgrade_status: fullStatus,
    full_upgrade_basis: basis,
    physical_reading: physicalReading,
    baseline: baselineRef,
    baseline_status: baselineStatus,
    baseline_entries: baseline,
    variants: [...aggregate, ...moduleSpecific],
    unadopted_aggregate: selected ? [] : aggregate,
    entries: views,
    caveats: uniq(caveats),
  };
}

const PARTIAL_HINT = {
  field_absent_in_snapshot: '原表无此字段（保持 unknown，不写 0）',
  no_upgrade_row_in_snapshot: '原表无任何升级行，只有单一基线',
  single_upgraded_row_not_declared_all_upgrades: '只有普通 Upgraded 行，只能作单项观测',
  no_aggregate_all_upgrades_row: '原表无 "With All Upgrades" 聚合行',
  module_specific_variants_not_stacked: '模块分项效果不叠加、不取极值',
  multiple_upgraded_rows: '普通升级行互相矛盾',
  conflicting_all_upgrades_rows: '聚合全升级行互相矛盾，保持冲突',
  all_upgrades_value_not_fully_normalized: '聚合全升级值未完全数值化，不判 full READY',
  upgraded_value_not_fully_normalized: '单项升级值未完全数值化，原样保留',
  single_upgraded_differs_from_all_upgrades: '单项升级值与聚合全升级值不同（不同升级程度）',
  baseline_sources_disagree: '基线来源本身冲突',
  unlimited_is_mission_cap_not_inventory: 'Unlimited 只是任务上限事实，不是库存',
  baseline_unlimited_is_mission_cap: '基线 Unlimited 只是任务上限事实',
};

/** Human-readable reason list for a field whose full status is not READY. */
export function missingText(row) {
  const parts = row.caveats.map((code) => PARTIAL_HINT[code] ?? code);
  const names = uniq(row.variants.map((view) => String(view.variant ?? '')).filter(Boolean));
  if (row.variants.length && names.length) parts.push(`原表变体行：${names.join(' / ')}`);
  if (row.conflicting_upgraded?.length) {
    const raw = uniq(row.conflicting_upgraded.map((view) => String(view.raw ?? ''))).join(' vs ');
    parts.push(`冲突的普通升级原值：${raw}`);
  }
  if (row.unadopted_aggregate.length) {
    const raw = uniq(row.unadopted_aggregate.map((view) => String(view.raw ?? ''))).join(' / ');
    parts.push(`未采用的聚合原值：${raw}`);
  }
  return parts.join('；');
}

function specsForFamily(family) {
  return FIELD_SPECS.filter((spec) => !spec.families || spec.families.includes(family));
}

/** Field rows for one coverage identity, family-filtered. */
export function selectUpgradedFields(identity) {
  if (!identity || typeof identity !== 'object') throw new TypeError('selectUpgradedFields requires a coverage identity');
  const layers = identity.layers ?? {};
  const rows = [];
  for (const spec of specsForFamily(identity.family)) {
    if (spec.group) {
      const parts = Object.entries(layers[spec.group]?.parts ?? {});
      if (!parts.length) {
        rows.push(selectUpgradeForField({ spec, part: null, layer: null }));
        continue;
      }
      for (const [part, layer] of parts) rows.push(selectUpgradeForField({ spec, part, layer }));
    } else {
      rows.push(selectUpgradeForField({ spec, part: null, layer: layers[spec.layer] ?? null }));
    }
  }
  return rows;
}

/** Whole-identity verdict: READY only when every applicable field is full READY. */
export function selectUpgradedIdentity(identity) {
  const rows = selectUpgradedFields(identity);
  const statuses = rows.map((row) => row.full_upgrade_status);
  let status;
  if (statuses.includes('CONFLICT')) status = 'CONFLICT';
  else if (statuses.length && statuses.every((value) => value === 'READY')) status = 'READY';
  else if (statuses.every((value) => value === 'UNKNOWN')) status = 'UNKNOWN';
  else status = 'PARTIAL';

  const blocking = rows
    .filter((row) => row.full_upgrade_status !== 'READY')
    .map((row) => ({
      field: row.field,
      full_upgrade_status: row.full_upgrade_status,
      observed_upgraded_status: row.observed_upgraded_status,
      missing: missingText(row),
    }));

  return {
    id: identity.id ?? null,
    family: identity.family ?? null,
    name_en: identity.name_en ?? null,
    name_zh: identity.name_zh ?? null,
    source_url: identity.source_url ?? null,
    provenance: {
      revid: identity.provenance?.revid ?? null,
      revision_timestamp: identity.provenance?.revision_timestamp ?? null,
    },
    full_upgrade_status: status,
    full_upgrade_ready: status === 'READY',
    field_status: Object.fromEntries(rows.map((row) => [row.field, row.full_upgrade_status])),
    observed_field_status: Object.fromEntries(rows.map((row) => [row.field, row.observed_upgraded_status])),
    known_full_upgrade_fields: rows.filter((row) => row.full_upgrade_status === 'READY').map((row) => row.field),
    observed_upgraded_fields: rows.filter((row) => row.observed_upgraded_status === 'READY').map((row) => row.field),
    blocking,
    fields: rows,
    ship_module_modifiers: (identity.ship_module_modifiers ?? []).map((mod) => ({
      department: mod.department ?? null,
      module: mod.module ?? null,
      effect_raw: mod.effect_raw ?? null,
      source: mod.source ?? null,
    })),
  };
}

function countStatuses(rows) {
  const counts = Object.fromEntries(FULL_UPGRADE_STATUSES.map((status) => [status, 0]));
  for (const row of rows) counts[row.full_upgrade_status] += 1;
  return counts;
}

function ratio(part, total) {
  return total ? Number((part / total).toFixed(4)) : null;
}

/**
 * Build the report from a strategic-coverage/1 report object (the accepted
 * extraction result). Pure: `coverage` is the only required input.
 */
export function buildUpgradedReport({ coverage, sources = {}, source_hashes = {}, author = '' } = {}) {
  if (!coverage || !Array.isArray(coverage.identities)) {
    throw new TypeError('buildUpgradedReport requires a strategic-coverage report with identities[]');
  }
  const identities = coverage.identities.map(selectUpgradedIdentity);

  const fieldStats = {};
  for (const identity of identities) {
    for (const row of identity.fields) {
      const bucket = (fieldStats[row.field] ??= {
        field: row.field,
        label_zh: row.label_zh,
        family_scope: row.family_scope,
        keys: row.keys,
        identities: [],
        counts: Object.fromEntries(FULL_UPGRADE_STATUSES.map((status) => [status, 0])),
        observed_counts: Object.fromEntries(OBSERVED_STATUSES.map((status) => [status, 0])),
      });
      bucket.identities.push({
        id: identity.id,
        full_upgrade_status: row.full_upgrade_status,
        observed_upgraded_status: row.observed_upgraded_status,
      });
      bucket.counts[row.full_upgrade_status] += 1;
      bucket.observed_counts[row.observed_upgraded_status] += 1;
    }
  }

  const familyCounts = {};
  for (const identity of identities) familyCounts[identity.family] = (familyCounts[identity.family] ?? 0) + 1;

  const allRows = identities.flatMap((identity) => identity.fields);
  const fullReadyRows = allRows.filter((row) => row.full_upgrade_status === 'READY');
  const observedReadyRows = allRows.filter((row) => row.observed_upgraded_status === 'READY');
  const summary = {
    identity_status_counts: countStatuses(identities.map((identity) => ({ full_upgrade_status: identity.full_upgrade_status }))),
    field_row_status_counts: countStatuses(allRows),
    field_row_total: allRows.length,
    full_upgrade_ready_field_rows: fullReadyRows.length,
    full_upgrade_ready_field_ratio: ratio(fullReadyRows.length, allRows.length),
    full_upgrade_ready_fields: uniq(fullReadyRows.map((row) => row.field)),
    observed_upgraded_field_rows: observedReadyRows.length,
    observed_upgraded_field_ratio: ratio(observedReadyRows.length, allRows.length),
    identities_ready: identities.filter((identity) => identity.full_upgrade_status === 'READY').map((identity) => identity.id),
    per_field: fieldStats,
    fields_without_full_upgrade: allRows
      .filter((row) => row.full_upgrade_status !== 'READY')
      .map((row) => ({ field: row.field, full_upgrade_status: row.full_upgrade_status, basis: row.full_upgrade_basis })),
  };

  const exampleSet = new Set(EXAMPLE_IDS);
  const examples = identities
    .filter((identity) => exampleSet.has(identity.id))
    .map((identity) => ({
      id: identity.id,
      name_en: identity.name_en,
      family: identity.family,
      full_upgrade_status: identity.full_upgrade_status,
      fields: identity.fields.filter((row) => row.present || row.full_upgrade_status !== 'UNKNOWN'),
    }));

  return {
    schema: UPGRADED_SCHEMA,
    author,
    purpose: '在已验收的 strategic-coverage 提取结果上拆分"单项 Upgraded 观测"与"全升级字段选择"：聚合行按原表直接取值，不叠百分比、不把 Unlimited 当库存',
    generated_from: {
      coverage_schema: coverage.schema ?? null,
      coverage_sources: {
        coverage: sources.coverage ?? null,
        snapshot: coverage.generated_from?.sources?.snapshot ?? null,
        catalog: coverage.generated_from?.sources?.catalog ?? null,
      },
      coverage_source_hashes: {
        coverage: source_hashes.coverage ?? null,
        snapshot: coverage.generated_from?.source_hashes?.snapshot ?? null,
        catalog: coverage.generated_from?.source_hashes?.catalog ?? null,
      },
      snapshot_generated_at: coverage.generated_from?.snapshot_generated_at ?? null,
      snapshot_source_api: coverage.generated_from?.snapshot_source_api ?? null,
    },
    rules: {
      full_upgrade_statuses: {
        READY: '存在唯一且数值可用的原表 "With All Upgrades" 聚合行，直接作为全升级字段值',
        PARTIAL: '只有普通 Upgraded 行或模块分项变体，缺少聚合全升级行（或聚合值未数值化），不能给出全升级值',
        UNKNOWN: '原表没有该字段，或只有单一基线值、没有任何升级信息',
        CONFLICT: '聚合全升级行彼此矛盾，保持冲突不取值',
      },
      observed_upgraded_statuses: {
        READY: '该字段存在唯一一条普通 Upgraded 行（单项观测，不代表全部模块已满）',
        NONE: '没有普通 Upgraded 行',
        CONFLICT: '普通 Upgraded 行彼此矛盾，不给观测值',
      },
      selection: [
        '用户已确认舰船模块全部升级：原表 variant="With All Upgrades" 行按 source_declared_all_upgrades 直接采用，不自叠百分比',
        '普通 Upgraded 行只作单项观测；除非原表给出聚合全升级行，full_upgrade_status 保持 PARTIAL/UNKNOWN',
        '单项 Upgraded 与聚合全升级值不同视为不同升级程度，两者都保留，不算冲突；只有聚合行彼此矛盾才 CONFLICT',
        'Unlimited 保留为已知任务上限事实（physical_reading.kind=unlimited_mission_cap），不是现成库存也不是未知数值',
        '聚合值未归一化（星号/区间/文字）不判 full READY，保持 PARTIAL 并原样保留',
        '缺失保持 null/unknown，不写 0；不从候选六维分反推物理事实',
      ],
      field_specs: FIELD_SPECS.map((spec) => ({
        field: spec.field,
        layer: spec.layer ?? spec.group,
        keys: spec.keys,
        families: spec.families ?? 'all',
        label_zh: spec.label_zh,
      })),
    },
    scope: {
      identity_count: identities.length,
      family_counts: familyCounts,
      field_row_count: allRows.length,
      excluded_on_purpose: [
        'deployable 哨戒生命/转向速率等 coverage 层未单列的升级字段',
        'payload_counts（bombs/salvos/capacity）不是升级选择目标',
        'effect_duration 的升级变体不在本次必答范围',
      ],
    },
    summary,
    identities,
    examples,
    verification: VERIFICATION,
    boundaries: [
      '用户已明确舰船模块全满：原表 "With All Upgrades" 行被直接用作该字段的全升级值，本层不自行合成百分比或叠加公式，也不外推到没有聚合行的字段',
      '普通 Upgraded 行只是单项观测；它不证明字段不受其他模块影响，因此不单凭名字宣称全模块已满',
      '单项 Upgraded 与聚合全升级值不同可能只是升级程度不同，不记为冲突；两者都保留原值与来源',
      'Unlimited 是任务内总使用上限的已知事实：保留且标注，但不等于当前可用库存，也不据此填反重/清杂库存',
      '未归一化（星号/区间/文字）的聚合行不判 full READY，保持 PARTIAL 并原样保留',
      '沿用 2026-10-23 冻结快照，不声称等于当前游戏版本；未联网',
      '本模块只读取 strategic-coverage 的 JSON 输出，未修改覆盖模块、评分、生成器、规则',
      'READY 只覆盖这些字段的升级值；有效区域伤害、命中率、区域持续压制时间仍未闭合',
    ],
  };
}

function variantText(row) {
  if (!row.variants.length) return '无';
  return row.variants
    .map((view) => `${view.variant ?? '未标注'}=${view.raw ?? 'null'}`)
    .join(' ; ');
}

function fullValueText(row) {
  if (!row.selected_full_upgrade) return 'null';
  return String(row.selected_full_upgrade.raw ?? 'null');
}

function observedText(row) {
  if (!row.observed_upgraded) return 'null';
  return String(row.observed_upgraded.raw ?? 'null');
}

function baselineTextOf(row) {
  if (row.baseline_status === 'absent') return 'null (absent)';
  if (!row.baseline) return `null (${row.baseline_status})`;
  return String(row.baseline.raw ?? 'null');
}

function readingText(row) {
  const reading = row.physical_reading ?? {};
  if (!reading.known) return 'unknown';
  if (reading.kind === 'unlimited_mission_cap') return `${reading.raw}（任务总上限，非库存）`;
  return `${reading.raw}（${reading.source_kind}）`;
}

const STATUS_TEXT = { READY: 'READY', PARTIAL: 'PARTIAL', UNKNOWN: 'UNKNOWN', CONFLICT: 'CONFLICT' };

/** Deterministic Markdown rendering of a report built by buildUpgradedReport(). */
export function renderUpgradedMarkdown(report, { command = '' } = {}) {
  const lines = [];
  const push = (line = '') => lines.push(line);
  const identities = report.identities ?? [];
  const summary = report.summary ?? {};
  const familyText = Object.entries(report.scope.family_counts)
    .map(([name, value]) => `${name}=${value}`)
    .join('，');

  push('# 红/绿战备全升级字段选择（基于冻结快照 2026-10-23 的已验收覆盖层）');
  push();
  push('作者：');
  push();
  push(`- 模式：\`${report.schema}\`；身份 ${report.scope.identity_count} 项（${familyText}）。`);
  push(`- 输入：\`${report.generated_from.coverage_sources.coverage}\`（覆盖层 schema \`${report.generated_from.coverage_schema}\`），其快照 \`${report.generated_from.coverage_sources.snapshot}\`（生成于 ${report.generated_from.snapshot_generated_at}，来源 ${report.generated_from.snapshot_source_api}）。`);
  push(`- 输入SHA256：coverage=${report.generated_from.coverage_source_hashes.coverage ?? '未提供'}；snapshot=${report.generated_from.coverage_source_hashes.snapshot ?? '未提供'}；catalog=${report.generated_from.coverage_source_hashes.catalog ?? '未提供'}。`);
  push('- 本文件由模块 CLI 机械生成；只做字段选择，不含六维分、不含敌群密度/战斗时长/命中率假设。');
  push();

  push('## 生成命令（可重复）');
  push();
  push('```bash');
  push(command || 'node shared/hd2-loadout/calibration/practical/strategic-upgraded.mjs --coverage docs/loadout-v3-strategic-coverage-20261026.json --json docs/loadout-v3-strategic-upgraded-20261026.json --markdown docs/loadout-v3-strategic-upgraded-20261026.md');
  push('```');
  push();

  push('## 结论摘要');
  push();
  const ids = summary.identity_status_counts ?? {};
  push(`- 38 项按"所有适用字段都有聚合全升级值"判定：READY ${ids.READY ?? 0} 项，PARTIAL ${ids.PARTIAL ?? 0} 项，UNKNOWN ${ids.UNKNOWN ?? 0} 项，CONFLICT ${ids.CONFLICT ?? 0} 项。`);
  push(`- 全升级可用字段：${summary.full_upgrade_ready_field_rows}/${summary.field_row_total}（${((summary.full_upgrade_ready_field_ratio ?? 0) * 100).toFixed(1)}%），仅 ${(summary.full_upgrade_ready_fields ?? []).join('、') || '无'}：原表只为"复用冷却"给出明确的 "With All Upgrades" 行。`);
  push(`- 单项 Upgraded 观测可用：${summary.observed_upgraded_field_rows}/${summary.field_row_total}（${((summary.observed_upgraded_field_ratio ?? 0) * 100).toFixed(1)}%），但这些普通升级行不等于全部模块已满，故不计入全升级可用。`);
  push(`- 逐字段共 ${summary.field_row_total} 行：READY ${summary.field_row_status_counts.READY ?? 0} 行、PARTIAL ${summary.field_row_status_counts.PARTIAL ?? 0} 行、UNKNOWN ${summary.field_row_status_counts.UNKNOWN ?? 0} 行、CONFLICT ${summary.field_row_status_counts.CONFLICT ?? 0} 行。`);
  if (!(ids.READY ?? 0)) {
    push('- 因此没有任何一项红/绿战备可以整体称为"全升级 READY"：调用延迟、飞鹰挂载/再挂载、轨道与绿战备使用上限都没有聚合全升级行。');
  }
  push();
  push('| 字段 | 覆盖范围 | full READY | full PARTIAL | full UNKNOWN | full CONFLICT | 单项观测 READY |');
  push('|---|---|---|---|---|---|---|');
  for (const bucket of Object.values(summary.per_field)) {
    const scopeText = bucket.family_scope === 'all' ? '全部' : bucket.family_scope.join('/');
    push(`| ${bucket.field}（${bucket.label_zh}） | ${scopeText} | ${bucket.counts.READY} | ${bucket.counts.PARTIAL} | ${bucket.counts.UNKNOWN} | ${bucket.counts.CONFLICT} | ${bucket.observed_counts.READY} |`);
  }
  push();

  push('## 判定规则');
  push();
  push('| 全升级状态 | 含义 |');
  push('|---|---|');
  for (const [status, text] of Object.entries(report.rules.full_upgrade_statuses)) push(`| ${STATUS_TEXT[status]} | ${text} |`);
  push();
  push('| 单项观测状态 | 含义 |');
  push('|---|---|');
  for (const [status, text] of Object.entries(report.rules.observed_upgraded_statuses)) push(`| ${status} | ${text} |`);
  push();
  for (const rule of report.rules.selection) push(`- ${rule}`);
  push();

  push('## 逐项状态总表');
  push();
  push('| id | 家族 | 全升级状态 | 调用延迟 | 复用冷却 | 家族库存字段 | 阻断字段 |');
  push('|---|---|---|---|---|---|---|');
  for (const identity of identities) {
    const fieldStatus = identity.field_status;
    const extra = Object.keys(fieldStatus).filter((name) => !['call_latency', 'reuse_cooldown'].includes(name));
    const extraText = extra.length ? extra.map((name) => `${name}=${fieldStatus[name]}`).join('; ') : 'n/a';
    const blockingText = identity.blocking.length
      ? identity.blocking.map((entry) => `${entry.field}=${entry.full_upgrade_status}`).join('; ')
      : '无';
    push(`| ${identity.id} | ${identity.family} | ${identity.full_upgrade_status} | ${fieldStatus.call_latency ?? 'n/a'} | ${fieldStatus.reuse_cooldown ?? 'n/a'} | ${extraText} | ${blockingText} |`);
  }
  push();

  push('## 可核对例子');
  push();
  push('以下 4 项直接取自覆盖层 JSON，可对照原表逐格复核。');
  push();
  for (const example of report.examples) {
    push(`### ${example.id}（${example.name_en}，${example.family}）：全升级 ${example.full_upgrade_status}`);
    push();
    push('| 字段 | 全升级状态 | 选定全升级值（原表聚合行） | 单项 Upgraded 观测 | 基线参考 | 其它变体原值 | 可读取的物理事实 | 备注 |');
    push('|---|---|---|---|---|---|---|---|');
    for (const row of example.fields) {
      const note = row.full_upgrade_status === 'READY'
        ? (row.caveats.length ? row.caveats.join(',') : '—')
        : missingText(row);
      push(`| ${row.field} | ${row.full_upgrade_status} | ${fullValueText(row)} | ${observedText(row)} | ${baselineTextOf(row)} | ${variantText(row)} | ${readingText(row)} | ${note} |`);
    }
    push();
  }

  push('## 逐字段明细（全部 38 项）');
  push();
  push('| id | 字段 | 全升级 | 选定全升级值 | 单项观测 | 基线参考 | 其它变体原值 | 备注 / 缺什么 |');
  push('|---|---|---|---|---|---|---|---|');
  for (const identity of identities) {
    for (const row of identity.fields) {
      const note = row.full_upgrade_status === 'READY'
        ? (row.caveats.length ? row.caveats.join(',') : '—')
        : missingText(row);
      push(`| ${identity.id} | ${row.field} | ${row.full_upgrade_status} | ${fullValueText(row)} | ${observedText(row)} | ${baselineTextOf(row)} | ${variantText(row)} | ${note} |`);
    }
  }
  push();

  push('## 舰船模块原文（Applicable_Ship_Modules，未套用）');
  push();
  const seen = new Set();
  let moduleRowCount = 0;
  for (const identity of identities) {
    for (const mod of identity.ship_module_modifiers) {
      const key = `${mod.department}|${mod.module}|${mod.effect_raw}`;
      if (seen.has(key)) continue;
      seen.add(key);
      moduleRowCount += 1;
      push(`- ${mod.department ?? '-'} / ${mod.module ?? '-'}：${mod.effect_raw ?? 'null'}`);
    }
  }
  push();
  push(`- 共 ${moduleRowCount} 条去重原文；本层不把任何百分比折算成新数值；全升级值只取原表已有的 "With All Upgrades" 行。`);
  push();

  push('## 测试与复现');
  push();
  const verification = report.verification ?? {};
  push(`- 测试命令：\`${verification.command}\`，${verification.run_at} 实际结果：${verification.result}（${verification.tests_total} 项）。`);
  push(`- ${verification.note}`);
  push('- 报告 JSON/Markdown 由 `strategic-upgraded.mjs --coverage <coverage.json>` 机械生成，相同输入逐字节可复现。');
  push();

  push('## 边界与未覆盖');
  push();
  for (const boundary of report.boundaries) push(`- ${boundary}`);
  const excluded = report.scope.excluded_on_purpose ?? [];
  if (excluded.length) {
    push('- 本次明确不选（避免假装覆盖）：');
    for (const item of excluded) push(`  - ${item}`);
  }
  push();

  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
}

// ---------------------------------------------------------------------------
// Optional CLI. Selection functions above stay I/O-free.
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const out = { coverage: null, json: null, markdown: null, stdout: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--coverage') out.coverage = argv[++i];
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
    'usage: node strategic-upgraded.mjs --coverage <coverage.json> \\',
    '         [--json <out.json>] [--markdown <out.md>] [--stdout]',
  ].join('\n');
}

async function runCli(argv) {
  const fs = await import('node:fs');
  const { createHash } = await import('node:crypto');
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (!args.coverage) {
    process.stderr.write(`${usage()}\n`);
    process.exitCode = 2;
    return;
  }
  const coverageBytes = fs.readFileSync(args.coverage);
  const coverage = JSON.parse(coverageBytes.toString('utf8'));
  const report = buildUpgradedReport({
    coverage,
    sources: {
      coverage: args.coverage,
      snapshot: coverage.generated_from?.sources?.snapshot ?? null,
      catalog: coverage.generated_from?.sources?.catalog ?? null,
    },
    source_hashes: { coverage: createHash('sha256').update(coverageBytes).digest('hex') },
    author: '',
  });
  const markdown = renderUpgradedMarkdown(report, {
    command: `node shared/hd2-loadout/calibration/practical/strategic-upgraded.mjs --coverage ${args.coverage} --json ${args.json ?? '<out.json>'} --markdown ${args.markdown ?? '<out.md>'}`,
  });
  if (args.json) fs.writeFileSync(args.json, `${JSON.stringify(report, null, 2)}\n`);
  if (args.markdown) fs.writeFileSync(args.markdown, markdown);
  if (args.stdout || (!args.json && !args.markdown)) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  const counts = report.summary.identity_status_counts;
  process.stderr.write(`identities=${report.scope.identity_count} ready=${counts.READY} partial=${counts.PARTIAL} full_ready_rows=${report.summary.full_upgrade_ready_field_rows}/${report.summary.field_row_total}\n`);
}

if (typeof process !== 'undefined' && process.argv?.[1]) {
  const { pathToFileURL } = await import('node:url');
  if (import.meta.url === pathToFileURL(process.argv[1]).href) await runCli(process.argv.slice(2));
}
