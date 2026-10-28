import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {routineSuitability, aggregateRoutineScores, baselineWeaponEndurance, assessLoadoutEndurance, applySupplyEnduranceFloor} from '../../../shared/hd2-loadout/assessment-v2/loadout-endurance.mjs';
import {supplyProviders} from '../../../shared/hd2-loadout/assessment-v2/engagement.mjs';
import {evaluateAssessment} from '../../../shared/hd2-loadout/assessment-v2/evaluate.mjs';
import {applyManualScores, SCORE_ROLES} from '../../../shared/hd2-loadout/assessment-v2/manual-scores.mjs';
import {contributionScore} from '../../../shared/hd2-loadout/assessment-v2/score-scale.mjs';

const read = path => JSON.parse(readFileSync(new URL('../../../' + path, import.meta.url)));
const source = read('shared/hd2-loadout/assessment-v2/equipment.json');
const catalog = read('shared/hd2-loadout/data/catalog.json');
test('C4 is a held backpack support weapon in the routine endurance pool',()=>{
  const c4=source.equipment.find(r=>r.equipment_id==='backpack_b_md_c4_pack');
  assert.equal(c4.facts.holding.support,true);assert.equal(c4.facts.holding.requires_backpack,true);
  const estimate=assessLoadoutEndurance([c4],source);
  assert.equal(estimate.items[0]?.equipment_id,c4.equipment_id);assert.equal(estimate.excluded.length,0);
});
// Saved user edits remain untouched; each test starts from the computed model.
for (const row of source.equipment) {
  delete row.manual_calibration;
  for (const target of [...Object.values(row.dimensions), row.heavy_assessment, row.endurance, row.demolition_assessment]) {
    if ('calculated_score' in target) target.score = target.calculated_score;
    if (target.calculated_state) target.state = target.calculated_state;
    delete target.score_origin;
    delete target.calculated_score;
    delete target.calculated_state;
  }
}
const PACK = 'backpack_b_1_supply_pack', CAR = 'vehicle_m_103_supply_fast_recon_vehicle';
const get = (model, id) => {
  const row = model.equipment.find(r => r.equipment_id === id);
  assert.ok(row, id);
  return row;
};
const approximate = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance,
  `expected ${expected}, received ${actual}`);
const item = (equipment_id, score, q = 1, missing_roles = []) => ({equipment_id, score,
  suitability: {value: q, missing_roles}});
const manualModel = (equipment_id, scores, mode = 'base') => {
  const model = structuredClone(source);
  applyManualScores(model, {schema: 1, history: [], overrides: {[equipment_id]: {scores, mode, note: 'test fixture'}}});
  return model;
};
const kit = {primary: 'ar_23_liberator', secondary: 'gp_20_ultimatum', grenade: 'g_6_frag',
  stratagems: ['support_mg_43_machine_gun', PACK, 'eagle_airstrike', 'orbital_gas_strike']};
const noSupplyKit = {...kit, stratagems: kit.stratagems.map(id => id === PACK ? 'deployable_flame_sentry' : id)};

test('routine suitability uses display scores, caps each role, and distinguishes unknown from known zero', () => {
  const row = {equipment_id: 'fixture', dimensions: Object.fromEntries([
    ['chaff', 60], ['close_defense', 30], ['anti_medium', 105],
  ].map(([role, score]) => [role, {score, score_origin: 'MANUAL_CALIBRATED'}]))};
  approximate(routineSuitability(row, source).value, 0.85);
  row.dimensions.chaff.score = 0;
  approximate(routineSuitability(row, source).value, 0.25);
  assert.deepEqual(routineSuitability(row, source).missing_roles, []);
  row.dimensions.anti_medium.score = null;
  const missing = routineSuitability(row, source);
  approximate(missing.value, 0.15);
  assert.deepEqual(missing.missing_roles, ['anti_medium']);
  assert.equal(aggregateRoutineScores([item('fixture', 80, missing.value, missing.missing_roles)]).lower_bound, true);
});

test('main weapon plus discounted backups is monotone, order independent, and capped at 100', () => {
  const entries = [item('main', 80), item('backup', 40, 0.5), item('tool', 0)];
  const result = aggregateRoutineScores(entries);
  assert.equal(result.primary_id, 'main');
  assert.equal(result.primary_value, 80);
  assert.equal(result.backup_value, 7);
  assert.equal(result.score, 87);
  assert.equal(result.lower_bound, false);
  assert.equal(aggregateRoutineScores([...entries].reverse()).score, result.score);
  assert.equal(aggregateRoutineScores([entries[0], item('tool', 0)]).score, 80);
  assert.equal(aggregateRoutineScores([item('a', 105), item('b', 105)]).score, 100);
  const weakRenewable = aggregateRoutineScores([item('weak renewable', 100, 0.1)]);
  assert.equal(weakRenewable.score, 10, 'unlimited stock cannot replace ordinary combat suitability');
});

test('unknown ammunition does not become a known zero or erase the known lower bound', () => {
  const result = aggregateRoutineScores([item('known', 70), item('unknown', null)]);
  assert.equal(result.lower_bound, true);
  assert.equal(result.items.find(r => r.equipment_id === 'unknown').value, null);
  assert.equal(result.primary_id, 'known');
  assert.equal(result.primary_value, 70);
  assert.equal(result.known_lower_bound, 70);
  const allUnknown = aggregateRoutineScores([item('unknown', null)]);
  assert.equal(allUnknown.lower_bound, true);
  assert.equal(allUnknown.score, null);
});

test('weapon baselines preserve manual zero and final values; adding supplies does not rescale individual guns', () => {
  for (const score of [0, 75, 105]) {
    const model = manualModel('plas_1_scorcher', {endurance: score});
    const gun = get(model, 'plas_1_scorcher');
    const baseline = baselineWeaponEndurance(gun, model);
    assert.equal(baseline.score, score);
    assert.equal(baseline.baseline_score, score);
    const alone = assessLoadoutEndurance([gun], model);
    const supplied = assessLoadoutEndurance([gun, get(model, PACK), get(model, CAR)], model);
    assert.equal(supplied.items[0].score, score);
    assert.equal(supplied.score, alone.score);
  }
  const gun = get(source, 'ar_23_liberator');
  approximate(baselineWeaponEndurance(gun, source).score,
    contributionScore(gun.endurance.score, gun.endurance.score_origin, source.scenario.score_scale));
  const unknown = structuredClone(gun);
  unknown.endurance.score = null;
  assert.equal(baselineWeaponEndurance(unknown, source).score, null);
  assert.equal(baselineWeaponEndurance(unknown, source).lower_bound, true);
});

test('supply pack and vehicle each floor the final score at 100, never stack, and never reduce scores above 100', () => {
  const dimension = {score: 63, total_before_display: 63, base_score: 58, auxiliary_bonus: 5, contributions: []};
  const noSupply = applySupplyEnduranceFloor(dimension, [get(source, 'ar_23_liberator')]);
  assert.equal(noSupply.score, 63);
  assert.equal(noSupply.supply_adjustment, null);
  for (const ids of [[PACK], [CAR], [PACK, CAR]]) {
    const result = applySupplyEnduranceFloor(dimension, ids.map(id => get(source, id)));
    assert.equal(result.score, 100);
    assert.equal(result.supply_adjustment.floor, 100);
    assert.equal(result.supply_adjustment.before_score, 63);
    assert.equal(result.supply_adjustment.added_score, 37);
    assert.deepEqual([...result.supply_adjustment.equipment_ids].sort(), [...ids].sort());
    const over = applySupplyEnduranceFloor({...dimension, score: 103, total_before_display: 120}, ids.map(id => get(source, id)));
    assert.equal(over.score, 103);
    assert.equal(over.total_before_display, 120);
    assert.equal(over.supply_adjustment.added_score, 0);
  }
  assert.equal(dimension.score, 63, 'the final adjustment must not mutate its input');
});

test('reserved heavy weapons, grenades, red-green stratagems, supply devices and automatic backpacks stay out of the routine pool', () => {
  const ids = ['ar_23_liberator', 'gp_20_ultimatum', 'g_6_frag', 'eagle_airstrike', 'orbital_gas_strike',
    'deployable_autocannon_sentry', PACK, CAR, 'backpack_ax_ar_23_guard_dog'];
  const result = assessLoadoutEndurance(ids.map(id => get(source, id)), source, {reserved_for_heavy: ['gp_20_ultimatum']});
  assert.deepEqual(result.items.map(r => r.equipment_id), ['ar_23_liberator']);
  const onlyGun = assessLoadoutEndurance([get(source, 'ar_23_liberator'), get(source, PACK), get(source, CAR)], source);
  assert.equal(result.score, onlyGun.score);
});

test('evaluation uses the carried-gun assessment even when a supply device has a higher manual score', () => {
  const model = manualModel(PACK, {endurance: 105});
  const result = evaluateAssessment(kit, model, catalog, {role_plan: {reserved_for_heavy: ['gp_20_ultimatum']}});
  const assessment = result.endurance_assessment;
  assert.ok(assessment);
  assert.deepEqual(result.dimensions.endurance.computation, assessment);
  assert.equal(result.dimensions.endurance.selected_ordinary, 'plan:routine-endurance');
  assert.equal(result.dimensions.endurance.base_score, assessment.score);
  assert.equal(assessment.items.some(r => r.equipment_id === PACK), false);
  assert.equal(result.dimensions.endurance.score, 100);
  assert.deepEqual(result.dimensions.endurance.supply_adjustment.equipment_ids, [PACK]);
  const changed = structuredClone(model);
  get(changed, PACK).endurance.score = 0;
  get(changed, PACK).manual_calibration.scores.endurance = 0;
  const after = evaluateAssessment(kit, changed, catalog, {role_plan: {reserved_for_heavy: ['gp_20_ultimatum']}});
  assert.equal(after.dimensions.endurance.score, result.dimensions.endurance.score);
});

test('whole-item manual addition is excluded from routine scoring and added once at its final displayed value', () => {
  const model = manualModel(kit.primary, Object.fromEntries(SCORE_ROLES.map(role => [role, 37])), 'additive');
  const result = evaluateAssessment(noSupplyKit, model, catalog);
  assert.equal(result.endurance_assessment.items.some(r => r.equipment_id === kit.primary), false);
  for (const role of SCORE_ROLES) {
    const dimension = result.dimensions[role];
    const contributions = dimension.contributions.filter(r => r.equipment_id === kit.primary);
    assert.equal(contributions.length, 1, role);
    assert.equal(contributions[0].value, 37, role);
    assert.equal(contributions[0].source, 'MANUAL_EQUIPMENT_ADDITION', role);
    assert.equal(dimension.total_before_display, dimension.base_score + dimension.auxiliary_bonus, role);
  }
});

test('manual grenade endurance remains a separate slot resource and cannot inflate gun endurance', () => {
  const before = evaluateAssessment(noSupplyKit, source, catalog);
  const model = manualModel(kit.grenade, {endurance: 105}, 'additive');
  const after = evaluateAssessment(noSupplyKit, model, catalog);
  assert.equal(after.throwable_endurance[0].score, 105);
  assert.equal(after.dimensions.endurance.score, before.dimensions.endurance.score);
  assert.equal(after.dimensions.endurance.contributions.some(r => r.equipment_id === kit.grenade), false);
  assert.deepEqual(after.gates.heavy_pair, before.gates.heavy_pair);
  assert.deepEqual(after.gates.demolition, before.gates.demolition);
});

test('final supply floor is applied after manual additions and preserves an already higher manual result', () => {
  for (const manual of [5, 105]) {
    const model = manualModel(kit.primary, {endurance: manual}, 'additive');
    const before = evaluateAssessment(noSupplyKit, model, catalog).dimensions.endurance;
    const supplied = evaluateAssessment(kit, model, catalog).dimensions.endurance;
    assert.equal(supplied.score, Math.max(100, before.score));
    assert.equal(supplied.supply_adjustment.before_score, before.score);
    assert.equal(supplied.contributions.filter(c => c.equipment_id === kit.primary).length, 1);
    if (manual === 5) assert.ok(before.score < 100);
    if (manual === 105) assert.ok(before.score > 100);
  }
});

test('display floor cannot create unlimited physical supplies, repair a missing heavy route, or bypass backpack incompatibility', () => {
  const providers = supplyProviders([get(source, PACK), get(source, CAR)], source.scenario);
  assert.deepEqual(providers.map(p => [p.kind, p.charges]), [['public', 1], ['backpack', 4], ['vehicle', 8]]);
  const noHeavy = evaluateAssessment({...kit, secondary: 'gp_31_grenade_pistol'}, source, catalog);
  assert.equal(noHeavy.dimensions.endurance.score, 100);
  assert.equal(noHeavy.gates.heavy_pair.status, 'UNKNOWN');
  assert.equal(noHeavy.acceptance_ready, false);
  assert.equal(noHeavy.eligible_for_draw, false);
  assert.ok(Number.isFinite(noHeavy.gates.shared_resources.waves));
  assert.ok(noHeavy.gates.shared_resources.waves <= noHeavy.gates.shared_resources.probe_limit_waves);
  const illegal = evaluateAssessment({...kit, stratagems: ['heavy_support_gr_8_recoilless_rifle', ...kit.stratagems.slice(1)]}, source, catalog);
  assert.equal(illegal.status, 'REJECTED_ILLEGAL');
  assert.equal(illegal.gates.legality.reason, 'SUPPORT_WEAPON_CARRIES_BACKPACK');
  assert.equal(illegal.dimensions, undefined);
});
