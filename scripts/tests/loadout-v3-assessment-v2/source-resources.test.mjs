import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resourceWeapons, supplyProviders, assessHeavyPairs, heavyRoutes} from '../../../shared/hd2-loadout/assessment-v2/engagement.mjs';
import {executeResourcePlan, loadedKey, supplyKey} from '../../../shared/hd2-loadout/assessment-v2/resources.mjs';

const model = JSON.parse(readFileSync(new URL('../../../shared/hd2-loadout/assessment-v2/equipment.json', import.meta.url)));

test('normal-climate heat data keeps seconds and heat sinks separate from rounds', () => {
  const scythe = model.equipment.find(e => e.equipment_id === 'las_5_scythe').facts;
  assert.equal(model.scenario.heat_environment, 'normal');
  assert.equal(scythe.inventory.kind, 'heat'); assert.equal(scythe.inventory.total, null);
  assert.equal(scythe.inventory.continuous_fire_seconds, 8);
  assert.equal(scythe.modes[0].cool_per_second, 8.5);
  assert.equal(scythe.refill.unit, 'heat_sinks');
  assert.equal(model.targets['alpha_commander:head'].residual_threat_ms, null);
});
const ids = {
  car: 'vehicle_m_103_supply_fast_recon_vehicle', pack: 'backpack_b_1_supply_pack',
  belt: 'heavy_support_gl_28_belt_fed_grenade_launcher', mg: 'support_mg_43_machine_gun',
  ultimatum: 'gp_20_ultimatum', thermite: 'g_123_thermite', liberator: 'ar_23_liberator',
};
const row = key => model.equipment.find(e => e.equipment_id === ids[key]);
const shoot = (key, rounds) => ({weapon_id: ids[key], rounds, interval_ms: 200, prepare_ms: 0, effect_delay_ms: 0});

test('the source adapter removes all car turret modes and every offensive dimension is explicitly zero', () => {
  const car = row('car');
  assert.equal(car.facts.combat_exclusion, 'USER_SUPPLY_VEHICLE_TURRET_EXCLUDED');
  assert.deepEqual(car.facts.modes, []);
  assert.equal(car.facts.inventory.kind, 'supply_only');
  assert.equal(car.facts.reload_ms, null);
  assert.equal(car.capabilities.status, 'UTILITY_ONLY');
  assert.deepEqual(car.facts.known_zero_dimensions, ['chaff', 'close_defense', 'anti_medium', 'anti_heavy', 'demolition']);
  for (const dimension of Object.values(car.dimensions)) {
    assert.equal(dimension.state, 'KNOWN_ZERO'); assert.equal(dimension.score, 0);
  }
  assert.deepEqual(resourceWeapons([car]), []);
  assert.deepEqual(heavyRoutes(car, 'charger_behemoth', model), []);
});

test('MG43 raw full stock and public/portable refills keep distinct all-module semantics', () => {
  const facts = row('mg').facts;
  assert.equal(facts.inventory.capacity, 175); assert.equal(facts.inventory.total, 700);
  assert.equal(facts.refill.public, 525); assert.equal(facts.refill.portable, 350);
  assert.equal(facts.modes[0].normal, 90); assert.equal(facts.modes[0].durable, 23);
  assert.equal(facts.modes[0].rpm, 900);
});

test('GL28 uses one 120-round backpack inventory, never 120 rounds times fake magazines', () => {
  const belt = row('belt');
  assert.equal(belt.facts.inventory.total, 120);
  assert.equal(belt.facts.inventory.feed, 'belt');
  assert.equal(belt.facts.refill.portable, 60); assert.equal(belt.facts.refill.public, 120);
  const baseline = [belt], supported = [belt, row('car')];
  const run = (rows, rounds) => executeResourcePlan({weapons: resourceWeapons(rows),
    providers: supplyProviders(rows, model.scenario), steps: [shoot('belt', rounds)]});
  assert.equal(run(baseline, 241).status, 'INSUFFICIENT');
  const extended = run(supported, 720);
  assert.equal(extended.status, 'COMPLETED');
  assert.equal(extended.supplies_taken.filter(p => p.provider_id === ids.car).length, 8);
  assert.equal(extended.supplies_taken.filter(p => p.provider_id === 'public').length, 1);
  assert.equal(extended.state.resources[loadedKey(ids.belt)].value, 0);
  assert.equal(extended.state.resources[supplyKey(ids.car)].value, 0);
  assert.equal(Object.keys(extended.state.resources).some(k => k === loadedKey(ids.car)), false);
  assert.equal(run(supported, 721).status, 'INSUFFICIENT');
});

test('nearby car access is required; an unknown access time never becomes free instant supply', () => {
  const rows = [row('belt'), row('car')];
  const scenario = structuredClone(model.scenario);
  scenario.supply.vehicle_nearby = false; scenario.supply.public_boxes = 0;
  const result = executeResourcePlan({weapons: resourceWeapons(rows), providers: supplyProviders(rows, scenario), steps: [shoot('belt', 121)]});
  assert.equal(result.status, 'UNKNOWN'); assert.equal(result.reason, 'SUPPLY_READY_TIME_REQUIRED');
});

test('two Ultimatum shots can meet all six heavy pair cases without a supply pack', () => {
  const result = assessHeavyPairs([row('ultimatum')], model);
  assert.equal(result.status, 'PASS'); assert.equal(result.cases.length, 6);
  for (const item of result.cases) {
    assert.equal(item.status, 'PASS'); assert.ok(item.elapsed_ms <= 20000);
    assert.deepEqual(item.supplies_taken, []);
  }
});

test('light-penetration Titan grinding and supply-car turret cannot invent a heavy route', () => {
  assert.deepEqual(heavyRoutes(row('liberator'), 'bile_titan', model), []);
  assert.deepEqual(heavyRoutes(row('car'), 'bile_titan', model), []);
});

test('thermite one-shot domain excludes Titan but its confirmed repeated-head route remains available', () => {
  const titan = heavyRoutes(row('thermite'), 'bile_titan', model);
  assert.equal(titan.length, 1);
  assert.equal(titan[0].route, 'REPEATED_STABLE_BLAST_PART');
  assert.equal(titan[0].rounds, 2);
  const route = heavyRoutes(row('thermite'), 'charger_behemoth', model)[0];
  const result = executeResourcePlan({weapons: resourceWeapons([row('thermite')]), providers: [],
    targets: {a: {hp: 1}, b: {hp: 1}}, deadline_ms: 20000,
    steps: [{...route, target_id: 'a'}, {...route, target_id: 'b'}]});
  assert.equal(result.status, 'COMPLETED'); assert.equal(result.elapsed_ms, 12400);
});
