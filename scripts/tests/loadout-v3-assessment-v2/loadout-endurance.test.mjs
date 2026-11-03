import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {routineRoleScores, aggregateRoutineScores, baselineWeaponEndurance, assessLoadoutEndurance, applySupplyEnduranceFloor,throwableEnduranceAdditions} from '../../../shared/hd2-loadout/assessment-v2/loadout-endurance.mjs';
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
const item = (equipment_id, score, role_scores = {chaff:60,close_defense:60,anti_medium:60}) =>
  ({equipment_id,score,role_scores});
const manualModel = (equipment_id, scores, mode = 'base') => {
  const model = structuredClone(source);
  applyManualScores(model, {schema: 1, history: [], overrides: {[equipment_id]: {scores, mode, note: 'test fixture'}}});
  return model;
};
const kit = {primary: 'ar_23_liberator', secondary: 'gp_20_ultimatum', grenade: 'g_6_frag',
  stratagems: ['support_mg_43_machine_gun', PACK, 'eagle_airstrike', 'orbital_gas_strike']};
const noSupplyKit = {...kit, stratagems: kit.stratagems.map(id => id === PACK ? 'deployable_flame_sentry' : id)};

test('role proportions use full display scores and distinguish unknown from known zero', () => {
  const row = {equipment_id: 'fixture', dimensions: Object.fromEntries([
    ['chaff', 60], ['close_defense', 30], ['anti_medium', 105],
  ].map(([role, score]) => [role, {score, score_origin: 'MANUAL_CALIBRATED'}]))};
  assert.deepEqual(routineRoleScores(row, source), {chaff:60,close_defense:30,anti_medium:105});
  row.dimensions.chaff.score = 0;
  assert.equal(routineRoleScores(row, source).chaff, 0);
  row.dimensions.anti_medium.score = null;
  const missing = routineRoleScores(row, source);
  assert.equal(missing.anti_medium, null);
  assert.equal(aggregateRoutineScores([item('fixture', 80, missing)]).score, null);
});

test('separate role proportions expose short close-defense endurance and combine at 50/35/15', () => {
  const entries = [item('clearer',100,{chaff:90,close_defense:10,anti_medium:50}),
    item('defender',20,{chaff:10,close_defense:90,anti_medium:50})];
  const result = aggregateRoutineScores(entries);
  approximate(result.roles.chaff.score,19600/220);
  approximate(result.roles.close_defense.score,13200/220);
  approximate(result.roles.anti_medium.score,16400/220);
  approximate(result.score,76.72727272727273);
  assert.deepEqual(Object.values(result.roles).map(r=>r.weight),[.5,.35,.15]);
  approximate(result.items.reduce((sum,i)=>sum+i.value,0),result.score);
  assert.equal(result.lower_bound, false);
  assert.equal(aggregateRoutineScores([...entries].reverse()).score, result.score);
});

test('adding a capable but short-endurance weapon deliberately lowers the average', () => {
  const gun=item('lasting',100),short=item('short',20);
  assert.equal(aggregateRoutineScores([gun]).score,100);
  approximate(aggregateRoutineScores([gun,short]).score,73.33333333333333);
  const none={chaff:0,close_defense:0,anti_medium:0};
  assert.equal(aggregateRoutineScores([gun,item('nonparticipant',0,none)]).score,100);
  assert.equal(aggregateRoutineScores([item('zero',0)]).score,0);
  assert.equal(aggregateRoutineScores([item('no ability',100,none)]).score,0);
  assert.equal(aggregateRoutineScores([]).score,0);
});

test('a versatile gun is counted once and ability proportions are not clipped at 60', () => {
  assert.equal(aggregateRoutineScores([item('versatile',80)]).score,80);
  const result=aggregateRoutineScores([item('strong',100,{chaff:120,close_defense:120,anti_medium:120}),item('weak',20)]);
  approximate(result.score,23600/300);
  assert.equal(aggregateRoutineScores([item('a', 105), item('b', 105)]).score, 100);
});

test('unknown ammo stays in the denominator and cannot inflate the known estimate', () => {
  const result = aggregateRoutineScores([item('known', 70), item('unknown', null)]);
  assert.equal(result.lower_bound, true);
  assert.equal(result.score,null);
  assert.equal(result.items.find(r => r.equipment_id === 'unknown').value, null);
  assert.equal(result.known_lower_bound,0);
  const allUnknown = aggregateRoutineScores([item('unknown', null)]);
  assert.equal(allUnknown.lower_bound, true);
  assert.equal(allUnknown.score, null);
  const missingAbility=aggregateRoutineScores([item('known',70),item('unknown',0,{chaff:null,close_defense:0,anti_medium:0})]);
  assert.equal(missingAbility.score,null);
  assert.equal(missingAbility.roles.chaff.ability_total,null);
  assert.deepEqual(missingAbility.roles.chaff.missing_abilities,['unknown']);
  approximate(missingAbility.known_lower_bound,35);
  const irrelevant=aggregateRoutineScores([item('known',70),item('unknown',null,{chaff:0,close_defense:0,anti_medium:0})]);
  assert.equal(irrelevant.score,70);
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
  assert.equal(result.routine_score, onlyGun.routine_score);
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

test('held-weapon manual endurance joins the role means instead of bypassing them as a final addition', () => {
  const model = manualModel(kit.primary, Object.fromEntries(SCORE_ROLES.map(role => [role, 37])), 'additive');
  const result = evaluateAssessment(noSupplyKit, model, catalog);
  assert.equal(result.endurance_assessment.items.find(r => r.equipment_id === kit.primary).score,37);
  assert.equal(result.dimensions.endurance.contributions.some(r=>r.equipment_id===kit.primary),false);
  assert.equal(result.dimensions.endurance.score,result.endurance_assessment.score);
  for (const role of SCORE_ROLES.filter(role=>role!=='endurance')) {
    const dimension = result.dimensions[role];
    const contributions = dimension.contributions.filter(r => r.equipment_id === kit.primary);
    assert.equal(contributions.length, 1, role);
    assert.equal(contributions[0].value, 37, role);
    assert.equal(contributions[0].source, 'MANUAL_EQUIPMENT_ADDITION', role);
    assert.equal(dimension.total_before_display, dimension.base_score + dimension.auxiliary_bonus, role);
  }
});

test('grenade role additions scale by endurance/100 without entering gun denominators or adding endurance twice', () => {
  const before=evaluateAssessment(noSupplyKit,source,catalog);
  for(const [stock,expected] of [[0,0],[50,9],[100,18],[105,18.9]]){
    const model=manualModel(kit.grenade,{chaff:20,close_defense:10,anti_medium:30,endurance:stock},'additive');
    const result=evaluateAssessment(noSupplyKit,model,catalog),a=result.endurance_assessment;
    assert.equal(a.items.some(i=>i.equipment_id===kit.grenade),false);
    assert.equal(a.routine_score,before.endurance_assessment.routine_score);
    approximate(a.grenade_bonus,expected);
    approximate(result.dimensions.endurance.score,Math.min(100,a.routine_score+expected));
    assert.equal(result.dimensions.endurance.contributions.some(r=>r.equipment_id===kit.grenade),false);
    assert.equal(result.throwable_endurance[0].score,stock);
    assert.deepEqual(result.gates.heavy_pair,before.gates.heavy_pair);
    assert.deepEqual(result.gates.demolition,before.gates.demolition);
  }
});

test('unknown grenade bonuses are marked as lower bounds; known zero abilities do not gain endurance',()=>{
  const model=manualModel(kit.grenade,{chaff:0,close_defense:0,anti_medium:0,endurance:100});
  const row=get(model,kit.grenade);
  assert.equal(throwableEnduranceAdditions([row],model)[0].value,0);
  row.endurance.score=null;
  row.dimensions.chaff.score=20;
  const value=throwableEnduranceAdditions([row],model)[0];
  assert.equal(value.roles.chaff.bonus,null);
  assert.equal(value.roles.close_defense.bonus,0);
  assert.equal(value.lower_bound,true);
});

test('supply floor follows the weighted means including high or low manual weapon endurance', () => {
  for (const manual of [5, 105]) {
    const model = manualModel(kit.primary, {endurance: manual}, 'additive');
    const before = evaluateAssessment(noSupplyKit, model, catalog).dimensions.endurance;
    const supplied = evaluateAssessment(kit, model, catalog).dimensions.endurance;
    assert.equal(supplied.score, Math.max(100, before.score));
    assert.equal(supplied.supply_adjustment.before_score, before.score);
    assert.equal(supplied.contributions.filter(c => c.equipment_id === kit.primary).length, 0);
    assert.ok(before.score<=100);
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

test('supply pack or car resolves the actual endurance admission gate after all final adjustments', () => {
  const model = read('shared/hd2-loadout/assessment-v2/equipment.json');
  const strong = {primary:'plas_1_scorcher',secondary:'gp_20_ultimatum',grenade:'g_48_giga_grenade',
    stratagems:['support_spear',PACK,'deployable_gas_mines','deployable_flame_sentry']};
  for (const id of [strong.primary,strong.secondary,'support_spear']) {
    const row = get(model,id);
    row.endurance = {...row.endurance,score:0,score_origin:'MANUAL_CALIBRATED'};
  }
  for (const provider of [PACK,CAR]) {
    const loadout = {...strong,stratagems:strong.stratagems.map(id=>id===PACK?provider:id)};
    const before = evaluateAssessment(loadout,model,catalog,{disabled_contributions:[provider]});
    assert.equal(before.dimensions.endurance.score,before.endurance_assessment.grenade_bonus);
    assert.ok(before.dimensions.endurance.score<60);
    assert.equal(before.dimensions.endurance.threshold,50);
    assert.ok(before.failed.includes('endurance'));
    assert.equal(before.acceptance_ready,false);
    const supplied = evaluateAssessment(loadout,model,catalog);
    assert.equal(supplied.dimensions.endurance.score,100);
    assert.equal(supplied.dimensions.endurance.status,'PASS');
    assert.equal(supplied.dimensions.endurance.supply_adjustment.before_score,before.dimensions.endurance.score);
    assert.equal(supplied.missing.includes('endurance'),false);
    assert.equal(supplied.failed.includes('endurance'),false);
    assert.equal(supplied.status,'ESTIMATED_PASS');
    assert.equal(supplied.acceptance_ready,true);
    assert.ok(Object.entries(supplied.dimensions).every(([role,d])=>d.threshold===(role==='endurance'?50:60)&&d.status==='PASS'));
  }
});

test('endurance admission accepts 50 and rejects below it without lowering other dimensions',()=>{
  const strong={primary:'plas_1_scorcher',secondary:'gp_20_ultimatum',grenade:'g_48_giga_grenade',
    stratagems:['support_spear','orbital_gas_strike','deployable_gas_mines','deployable_flame_sentry']};
  for(const [score,expected] of [[49.9,'FAIL'],[50,'PASS'],[54.9,'PASS'],[55,'PASS']]){
    const model=read('shared/hd2-loadout/assessment-v2/equipment.json');
    for(const id of [strong.primary,strong.secondary,'support_spear'])
      get(model,id).endurance={...get(model,id).endurance,score,score_origin:'MANUAL_CALIBRATED'};
    get(model,strong.grenade).endurance={...get(model,strong.grenade).endurance,score:0,score_origin:'MANUAL_CALIBRATED'};
    const result=evaluateAssessment(strong,model,catalog);
    assert.equal(result.dimensions.endurance.status,expected);
    assert.equal(result.dimensions.endurance.threshold,50);
    assert.equal(result.acceptance_ready,expected==='PASS');
    for(const [role,d] of Object.entries(result.dimensions))if(role!=='endurance')assert.equal(d.threshold,60);
    assert.ok(Object.values(result.gates).every(g=>g.status==='PASS'));
  }
});


test('ability plus endurance weights stay normalized and keep zero-endurance capable guns',()=>{
  const result=aggregateRoutineScores([item('high',100),item('low',20)]);
  const high=result.items.find(i=>i.equipment_id==='high'),low=result.items.find(i=>i.equipment_id==='low');
  approximate(high.ability_shares.chaff,.5);
  approximate(high.role_shares.chaff,2/3);
  approximate(low.role_shares.chaff,1/3);
  approximate(high.weighted_share+low.weighted_share,1);
  assert.ok(result.score>60&&result.score<80);
  assert.ok(low.value>0,'a low-endurance weapon still lowers the score');
  const zero=aggregateRoutineScores([item('high',100),item('empty',0)]);
  approximate(zero.score,16000/220);
  approximate(zero.items.find(i=>i.equipment_id==='empty').weighted_share,60/220);
  const noAbility={chaff:0,close_defense:0,anti_medium:0};
  assert.equal(aggregateRoutineScores([item('high',100,noAbility),item('low',20)]).score,20);
  assert.equal(aggregateRoutineScores([item('a',0),item('b',0)]).score,0);
});

test('uniform endurance is unchanged; raw ability and endurance scores are added before normalization',()=>{
  const entries=[item('a',40,{chaff:120,close_defense:20,anti_medium:10}),item('b',40)];
  approximate(aggregateRoutineScores(entries).score,40);
  const result=aggregateRoutineScores([item('a',20,{chaff:100,close_defense:100,anti_medium:100}),item('b',100,{chaff:20,close_defense:20,anti_medium:20})]);
  approximate(result.score,60);
  for(const i of result.items)approximate(i.weighted_share,.5);
  for(const r of Object.values(result.roles)){
    assert.equal(r.ability_total,120);assert.equal(r.endurance_total,120);assert.equal(r.weight_total,240);
  }
});

test('zero role ability excludes that gun from both halves of the additive denominator',()=>{
  const result=aggregateRoutineScores([item('clearer',100,{chaff:60,close_defense:0,anti_medium:0}),item('defender',20,{chaff:0,close_defense:60,anti_medium:60})]);
  approximate(result.roles.chaff.score,100);approximate(result.roles.close_defense.score,20);approximate(result.roles.anti_medium.score,20);
  approximate(result.score,60);
  assert.equal(result.items.find(i=>i.equipment_id==='clearer').role_shares.close_defense,0);
  assert.equal(result.roles.close_defense.weight_total,80);
});
