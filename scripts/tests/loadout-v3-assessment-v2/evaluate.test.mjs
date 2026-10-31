import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateAssessment, assessmentLegality} from '../../../shared/hd2-loadout/assessment-v2/evaluate.mjs';
import {heavyRoutes, assessHeavyPairs} from '../../../shared/hd2-loadout/assessment-v2/engagement.mjs';
import {assessFiveHoles, demolitionRoutes} from '../../../shared/hd2-loadout/assessment-v2/demolition.mjs';
import {ordinaryCapabilities, scoreOrdinary} from '../../../shared/hd2-loadout/assessment-v2/projectile.mjs';
import {loadedKey, ammoKey} from '../../../shared/hd2-loadout/assessment-v2/resources.mjs';

const read = path => JSON.parse(readFileSync(new URL('../../../' + path, import.meta.url)));
const model = read('shared/hd2-loadout/assessment-v2/equipment.json');
const catalog = read('shared/hd2-loadout/data/catalog.json');
const tactic = read('shared/hd2-loadout/assessment-v2/tactic-references.json').cases[0];
const row = id => model.equipment.find(r => r.equipment_id === id);
const optional = ['deployable_gas_mines', 'deployable_flame_sentry'];
const kit = {primary: 'plas_1_scorcher', secondary: 'gp_20_ultimatum', grenade: 'g_48_giga_grenade',
  stratagems: ['support_spear', 'backpack_b_1_supply_pack', ...optional]};
const core = evaluateAssessment(kit, model, catalog, {disabled_contributions: optional, role_plan: tactic.role_plan});

test('five-item user core passes computed gates with both optional stratagems disabled', () => {
  assert.equal(core.status, 'ESTIMATED_PASS');
  assert.equal(core.eligible_for_draw, false);
  assert.ok(Object.values(core.gates).every(g => g.status === 'PASS'));
  assert.deepEqual(core.unresolved_strategic_equipment, []);
  assert.equal(core.gates.shared_resources.role_floor_constrained, true);
  assert.equal(core.gates.shared_resources.score,null,'wave feasibility no longer generates an endurance score');
  // A qualitative margin, not a lookup table forcing a particular score.
  for (const dimension of ['chaff', 'close_defense', 'anti_medium']) {
    assert.ok(core.dimensions[dimension].score > 75);
    assert.equal(core.dimensions[dimension].strategic_bonus, 0);
  }
  const full = evaluateAssessment(kit, model, catalog, {role_plan: tactic.role_plan});
  assert.equal(full.status, 'ESTIMATED_PASS');
  for (const key of ['chaff', 'close_defense', 'anti_medium']) {
    assert.equal(core.dimensions[key].base_score, full.dimensions[key].base_score);
    assert.ok(full.dimensions[key].score >= core.dimensions[key].score);
  }
  assert.deepEqual(core.gates.heavy_pair, full.gates.heavy_pair);
  assert.deepEqual(core.gates.shared_resources.ammo_remaining, full.gates.shared_resources.ammo_remaining);
});

test('ordinary shared-stock plan preserves Ultimatum and Giga for heavies', () => {
  const plan = core.gates.shared_resources;
  const used = new Set(plan.first_wave_actions.map(a => a.weapon_id));
  assert.ok(used.size>0,'a paid handheld plan is required; dense blast may choose Scorcher over spear');
  assert.ok([...used].every(id => ['plas_1_scorcher', 'support_spear'].includes(id)));
  assert.equal(plan.targets_per_wave, 36);
  assert.equal(plan.first_wave_actions.length, plan.actions_per_wave);
  assert.equal(plan.waves, 4); // Completed finite probe, not infinite endurance.
  assert.equal(plan.lower_bound, true);
  for (const id of tactic.role_plan.reserved_for_heavy) assert.equal(used.has(id), false);
  for (const action of plan.first_wave_actions) {
    assert.ok(action.area_action||model.targets[action.measured_target]);
    assert.ok(Number.isSafeInteger(action.rounds) && action.rounds > 0);
  }
});

test('medium route feasibility and the final medium score are separate admission checks', () => {
  const baseline = {primary: 'ar_23_liberator', secondary: 'gp_20_ultimatum', grenade: 'g_6_frag',
    stratagems: ['support_mg_43_machine_gun', 'backpack_b_1_supply_pack', 'eagle_airstrike', 'orbital_gas_strike']};
  const lowDisplay = structuredClone(model);
  lowDisplay.equipment.find(r => r.equipment_id === 'support_mg_43_machine_gun').dimensions.anti_medium.score = 1;
  const result = evaluateAssessment(baseline, lowDisplay, catalog);
  assert.equal(result.status, 'UNKNOWN');
  assert.ok(result.missing.includes('close_defense')); // Old Liberator 60 is now 55.38.
  assert.equal(result.gates.shared_resources.status, 'PASS');
  assert.deepEqual(result.gates.shared_resources.medium_weapons, ['support_mg_43_machine_gun']);
  assert.equal(result.dimensions.anti_medium.threshold, 60);
  assert.equal(result.dimensions.anti_medium.status, result.dimensions.anti_medium.score >= 60 ? 'PASS' : 'UNKNOWN');
});

test('known backpack/support incompatibilities reject before scoring', () => {
  const withRR = {...kit, stratagems: ['heavy_support_gr_8_recoilless_rifle', ...kit.stratagems.slice(1)]};
  const result = evaluateAssessment(withRR, model, catalog);
  assert.equal(result.status, 'REJECTED_ILLEGAL');
  assert.equal(result.gates.legality.reason, 'SUPPORT_WEAPON_CARRIES_BACKPACK');
  assert.equal(result.dimensions, undefined);
  const twoSupports = {...kit, stratagems: ['support_spear', 'support_mg_43_machine_gun', ...optional]};
  assert.equal(assessmentLegality(twoSupports, catalog, model).status, 'FAIL');
});

test('unknown Titan route stays unknown even with strong ordinary scores', () => {
  const result = evaluateAssessment({...kit, secondary: 'gp_31_grenade_pistol', grenade: 'g_6_frag'}, model, catalog,
    {disabled_contributions: ['support_spear']});
  assert.equal(result.status, 'UNKNOWN');
  assert.equal(result.gates.heavy_pair.status, 'UNKNOWN');
  assert.ok(result.missing.includes('heavy_pair'));
  assert.equal(result.eligible_for_draw, false);
});

test('Scorcher incidental Impaler example retains blast evidence but cannot enter anti-heavy gates', () => {
  const scorcher = row('plas_1_scorcher');
  assert.deepEqual(heavyRoutes(scorcher, 'impaler', model), []);
  const route = heavyRoutes(scorcher, 'impaler', model, {incidental_only:true})[0];
  assert.equal(route.route, 'FAST_EXPOSED_IMPALER_HEAD');
  assert.equal(route.condition, 'EXPOSED_HEAD_VISIBLE');
  assert.equal(route.rounds, 8);
  assert.equal(route.per_round_damage, 162);
  const directOnly = structuredClone(scorcher);
  for (const mode of directOnly.facts.modes) mode.explosion = null;
  assert.deepEqual(heavyRoutes(directOnly, 'impaler', model), []);
  assert.deepEqual(heavyRoutes(scorcher, 'bile_titan', model), []);
});

test('disposable Commando has four real rounds and cannot receive an extra weapon from supplies', () => {
  const commando = row('support_mls_4x_commando');
  assert.equal(commando.facts.inventory.total, 4);
  assert.equal(commando.facts.inventory.reserve, 0);
  const result = assessHeavyPairs([commando], model);
  assert.equal(result.status, 'PASS');
  for (const pair of result.cases) {
    assert.deepEqual(pair.supplies_taken, []);
    assert.ok(pair.elapsed_ms <= 20000);
  }
  assert.equal(assessFiveHoles([commando], model).status, 'UNKNOWN');
});

test('five holes can be funded across two finite inventories, one paid shot per hole', () => {
  const noSupply = {...model, scenario: {...model.scenario, supply: {...model.scenario.supply, public_boxes: 0}}};
  const grenadePistol = structuredClone(row('gp_31_grenade_pistol'));
  grenadePistol.facts.inventory = {...grenadePistol.facts.inventory, reserve: 2, total: 3};
  const giga = row('g_48_giga_grenade');
  const result = assessFiveHoles([grenadePistol, giga], noSupply);
  assert.equal(result.status, 'PASS');
  assert.equal(result.plan.length, 5);
  assert.equal(new Set(result.plan.map(s => s.hole_id)).size, 5);
  assert.equal(result.plan.reduce((n, s) => n + s.rounds, 0), 5);
  assert.equal(new Set(result.plan.map(s => s.weapon_id)).size, 2);
  assert.deepEqual(result.supplies_taken, []);
  const remaining = [grenadePistol, giga].reduce((n, r) => n
    + result.ammo_remaining[loadedKey(r.equipment_id)].value
    + result.ammo_remaining[ammoKey(r.equipment_id)].value, 0);
  assert.equal(remaining, grenadePistol.facts.inventory.total + giga.facts.inventory.total - 5);
});

test('green, backblast and unbound demolition components cannot borrow a handheld feed', () => {
  for (const id of optional) assert.deepEqual(demolitionRoutes(row(id), model.scenario), []);
  const gun = structuredClone(row('ar_23_liberator'));
  gun.facts.demolition_components = [
    {component_id: 'unbound-explosion', attack_type: 'explosion', force: 50, backblast: false},
    {component_id: gun.facts.modes[0].mode_id, attack_type: 'explosion', force: 50, backblast: true},
  ];
  assert.deepEqual(demolitionRoutes(gun, model.scenario), []);
});

test('escape pays only the remaining safe-distance delay after overlapping aim', () => {
  const scorcher = row('plas_1_scorcher'), reference = row(model.references.close_defense).capabilities;
  const scores = [];
  for (const dive_ms of [1000, 2000, 3000]) {
    const caps = ordinaryCapabilities(scorcher.facts, model.targets, model.ap, {...model.scenario, dive_ms});
    const close = caps.modes[0].close_defense;
    assert.equal(close.escape.safe_fire_delay_ms, dive_ms / 5);
    assert.equal(close.escape.added_delay_ms, Math.max(0, dive_ms / 5 - close.handling.acquire_ms));
    const score = scoreOrdinary(caps, reference, {primary: true, reference_primary: true, role: 'close_defense'}).score;
    assert.ok(score >= 60);
    scores.push(score);
  }
  assert.ok(scores[0] > scores[1] && scores[1] > scores[2]);
  const unsafe = ordinaryCapabilities(scorcher.facts, model.targets, model.ap, {...model.scenario, close_distance_m: 2});
  assert.equal(unsafe.modes[0].close_defense.status, 'UNABLE');
});

test('all-upgrade Eagle small cooldown selects its source variant, not base/upgraded disagreement', () => {
  const fields = row('eagle_airstrike').strategic_source;
  const reuse = fields.find(f => f.field === 'reuse_cooldown');
  assert.equal(reuse.full_upgrade_status, 'READY');
  assert.equal(reuse.selected.variant, 'With All Upgrades');
  assert.equal(reuse.selected.value, 7000);
  assert.equal(reuse.selected.unit, 'ms');
  assert.equal(fields.find(f => f.field === 'eagle_rearm').full_upgrade_status, 'PARTIAL');
  assert.equal(fields.find(f => f.field === 'call_latency').full_upgrade_status, 'UNKNOWN');
});
