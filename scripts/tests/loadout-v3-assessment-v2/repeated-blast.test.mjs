import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {finiteBlast} from '../../../shared/hd2-loadout/assessment-v2/mechanisms.mjs';
import {heavyRoutes, assessHeavyPairs, resourceWeapons, supplyProviders} from '../../../shared/hd2-loadout/assessment-v2/engagement.mjs';
import {executeResourcePlan, loadedKey, supplyKey} from '../../../shared/hd2-loadout/assessment-v2/resources.mjs';
import {evaluateAssessment} from '../../../shared/hd2-loadout/assessment-v2/evaluate.mjs';

const read = p => JSON.parse(readFileSync(new URL('../../../' + p, import.meta.url)));
const model = read('shared/hd2-loadout/assessment-v2/equipment.json');
const catalog = read('shared/hd2-loadout/data/catalog.json');
const row = id => model.equipment.find(r => r.equipment_id === id);
const thermite = row('g_123_thermite'), pack = row('backpack_b_1_supply_pack');
const route = heavyRoutes(thermite, 'bile_titan', model)[0];
const kit = {primary: 'plas_1_scorcher', secondary: 'gp_31_grenade_pistol', grenade: thermite.equipment_id,
  stratagems: ['support_mg_43_machine_gun', pack.equipment_id, 'eagle_airstrike', 'orbital_gas_strike']};

test('Titan thermite route derives two hits from actual head HP and explosion resistance', () => {
  assert.equal(route.target_hp, 1500);
  assert.equal(route.damage_per_round, 1000);
  assert.equal(route.rounds, 2);
  assert.equal(route.one_shot, false);
  const tougher = structuredClone(model);
  tougher.targets['bile_titan:head'].hp = 2100;
  assert.equal(heavyRoutes(thermite, 'bile_titan', tougher)[0].rounds, 3);
  // A known sufficiency domain does not become a 6000-damage projectile.
  assert.equal(heavyRoutes(thermite, 'bile_titan', model).some(r => r.route === 'USER_STABLE_EXTRA_PART_ONE_SHOT'), false);
});

test('one stuck grenade only damages the head; a second independent explosion is required', () => {
  const run = rounds => executeResourcePlan({weapons: resourceWeapons([thermite]), providers: [],
    targets: {t: {hp: route.target_hp}}, steps: [{...route, rounds, target_id: 't'}], deadline_ms: 20000});
  assert.equal(run(1).status, 'INSUFFICIENT');
  assert.equal(run(1).state.targets.t.hp, 500);
  const two = run(2);
  assert.equal(two.status, 'COMPLETED');
  assert.equal(two.state.targets.t.neutralized_at, 12400);
  assert.equal(two.state.resources[loadedKey(thermite.equipment_id)].value, 1);
});

test('two Titans share stock and one pack box while their fuses overlap', () => {
  const result = evaluateAssessment(kit, model, catalog);
  assert.equal(result.status, 'ESTIMATED_PASS');
  assert.equal(result.gates.heavy_pair.status, 'PASS');
  const pair = result.gates.heavy_pair.cases.find(c => c.targets.every(t => t === 'bile_titan'));
  assert.equal(pair.elapsed_ms, 16900);
  assert.deepEqual(pair.neutralized_at_ms, {first: 12400, second: 16900});
  assert.equal(pair.plan.reduce((n, p) => n + p.rounds, 0), 4);
  assert.equal(pair.supplies_taken.length, 1);
  assert.equal(pair.supplies_taken[0].provider_id, pack.equipment_id);
  assert.equal(pair.ammo_remaining[loadedKey(thermite.equipment_id)].value, 1);
  assert.equal(pair.ammo_remaining[supplyKey(pack.equipment_id)].value, 3);
  assert.equal(pair.ammo_remaining[supplyKey('public')].value, 1);
  // The fourth throw starts only after taking the box; it is not a free instant throw.
  assert.deepEqual(pair.actions.filter(a => a.action_id.startsWith('fire:')).map(a => a.at), [1500, 3000, 4500, 7500]);
});

test('repeatable explosive routes still fail with insufficient stock or an insufficient time window', () => {
  const noPublic = {...model, scenario: {...model.scenario, supply: {...model.scenario.supply, public_boxes: 0}}};
  const noBox = assessHeavyPairs([thermite], noPublic).cases.find(c => c.targets.every(t => t === 'bile_titan'));
  assert.equal(noBox.status, 'UNKNOWN');
  const short = {...model, scenario: {...model.scenario, heavy_seconds: 16}};
  assert.equal(assessHeavyPairs([thermite, pack], short).cases.find(c => c.targets.every(t => t === 'bile_titan')).status, 'UNKNOWN');
  const rows = [thermite, pack];
  const planned = executeResourcePlan({weapons: resourceWeapons(rows), providers: supplyProviders(rows, model.scenario),
    targets: {a: {hp: 1500}, b: {hp: 1500}}, deadline_ms: 16000,
    steps: [{...route, target_id: 'a'}, {...route, target_id: 'b'}]});
  assert.equal(planned.reason, 'EFFECT_WINDOW_EXCEEDED');
});

test('missing ExDR is unknown rather than zero and partial resistance changes per-part damage', () => {
  const input = {blast: thermite.facts.areas[0], ap: model.ap, geometry: {id: 'test', basis: 'scenario'},
    targets: [{...model.targets['bile_titan:head'], instance_id: 't', line_of_sight: 'clear', distance_m: 0}]};
  assert.equal(finiteBlast(input).reason, 'PART_EXPLOSION_RESISTANCE_REQUIRED');
  const measured = finiteBlast({...input, targets: input.targets.map(t => ({...t, explosion_resistance: .5}))});
  assert.equal(measured.hits[0].damage, 1000);
});

test('impact detonators and the shared one-shot domain apply to Giga without inventing a Titan route', () => {
  const giga = row('g_48_giga_grenade');
  assert.equal(giga.facts.fuse_kind, 'impact');
  assert.equal(giga.facts.fuse_ms, 0);
  assert.equal(heavyRoutes(giga, 'charger_behemoth', model)[0].rounds, 1);
  assert.deepEqual(heavyRoutes(giga, 'bile_titan', model), []);
  assert.equal(row('g_40_k_melta_mine').facts.fuse_kind, 'proximity');
  assert.equal(row('g_40_k_melta_mine').facts.fuse_ms, null);
});
