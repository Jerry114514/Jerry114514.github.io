import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {restoreCalculatedScores} from './automatic-model.mjs';
import {assessStrategic, packetEfficiency} from '../../../shared/hd2-loadout/assessment-v2/strategic.mjs';
import {actionsFor, resourceWeapons, supplyProviders} from '../../../shared/hd2-loadout/assessment-v2/engagement.mjs';
import {executeResourcePlan, loadedKey, ammoKey} from '../../../shared/hd2-loadout/assessment-v2/resources.mjs';
import {projectileService} from '../../../shared/hd2-loadout/assessment-v2/projectile.mjs';
import {evaluateAssessment} from '../../../shared/hd2-loadout/assessment-v2/evaluate.mjs';

const read = path => JSON.parse(readFileSync(new URL('../../../' + path, import.meta.url)));
const model = restoreCalculatedScores(read('shared/hd2-loadout/assessment-v2/equipment.json'));
const catalog = read('shared/hd2-loadout/data/catalog.json');
const row = id => model.equipment.find(r => r.equipment_id === id);
const light = model.scenario.chaff.map(({id, count}) => ({target: model.targets[id], count}));

test('source S11 gas is an independent weapon capability with one ammo owner', () => {
  const spear = row('support_spear'), chaff = spear.capabilities.modes[0].chaff;
  assert.ok(chaff.cloud);
  assert.equal(chaff.cloud.damage_per_second, 25);
  assert.equal(chaff.cloud.status_duration_s, 6);
  assert.equal(chaff.cloud.exposure_seconds, 10);
  assert.ok(chaff.cloud.status_kills > 0);
  assert.deepEqual([...new Set(chaff.action_plan.map(a => a.weapon_id))], ['support_spear']);
  for (const target of chaff.cloud.targets) {
    assert.ok(target.status_damage <= target.initial_hp);
    assert.equal(target.status_damage + target.remaining_hp, target.initial_hp);
  }
  assert.ok(chaff.cloud.control.pressure.score_ratio_gain > 1);
  assert.equal(chaff.cloud.control.pressure.counts_as_kills, false);
  assert.equal(chaff.cloud.control.counts_as_instant_safety, false);
  const direct = projectileService(spear.facts.modes[0], light, model.ap, {handling_policy: model.scenario.handling});
  assert.ok(chaff.inventory_required < direct.inventory_required);
});

test('the real stock ledger consumes S11 cloud shots without giving cleanup to Scorcher', () => {
  const spear = row('support_spear');
  const steps = actionsFor(spear, light, model.ap, model.scenario);
  const result = executeResourcePlan({weapons: resourceWeapons([spear]), providers: [], steps});
  assert.equal(result.status, 'COMPLETED');
  const spent = steps.reduce((n, s) => n + s.rounds, 0);
  assert.equal(result.state.resources[loadedKey(spear.equipment_id)].value + result.state.resources[ammoKey(spear.equipment_id)].value,
    spear.facts.inventory.total - spent);
  for (const [index, step] of steps.entries()) if (step.after_step) {
    assert.ok(result.step_last_shot_ms[index] >= result.step_last_shot_ms[step.after_step.index] + step.after_step.delay_ms);
  }
});

test('detached waits are relative to their actual source shot, not a free absolute start', () => {
  const gun = {id: 'x', capacity: 1, loaded: 1, reserve: 3, reserve_capacity: 3,
    reload_ms: 2000, feed: 'magazine', refill: {}};
  const step = {weapon_id: 'x', rounds: 1, prepare_ms: 100, interval_ms: 100, effect_delay_ms: 0};
  const result = executeResourcePlan({weapons: [gun], providers: [], steps: [step, step,
    {...step, after_step: {index: 1, delay_ms: 5000}}]});
  assert.equal(result.status, 'COMPLETED');
  assert.ok(result.step_last_shot_ms[2] >= result.step_last_shot_ms[1] + 5000);
  assert.equal(executeResourcePlan({weapons: [gun], providers: [], steps: [{...step, after_step: {index: 0, delay_ms: 1}}]}).reason,
    'ACTION_DEPENDENCY_REQUIRED');
});

test('handling only makes small timing changes, never damage or real hit probability', () => {
  const source = row('ar_23_liberator').facts.modes[0], request = [{target: model.targets['warrior:main'], count: 1}];
  const baseline = projectileService({...source, handling: {ergonomics: 65, recoil_horizontal: 0, recoil_vertical: 0}}, request,
    model.ap, {handling_policy: model.scenario.handling});
  const difficult = projectileService({...source, handling: {ergonomics: 0, recoil_horizontal: 1000, recoil_vertical: 1000}}, request,
    model.ap, {handling_policy: model.scenario.handling});
  assert.equal(difficult.shots, baseline.shots);
  const damageEntries = service => service.entries.map(({acquire_ms, ...damage}) => damage);
  assert.deepEqual(damageEntries(difficult), damageEntries(baseline));
  assert.ok(difficult.handling.acquire_ms <= baseline.handling.acquire_ms * 1.15 + 1e-9);
  assert.ok(difficult.interval_ms <= Math.ceil(baseline.mechanical_interval_ms * 1.15));
  assert.equal(model.scenario.acceptance_policy.real_hit_probability, false);
  assert.equal(model.scenario.acceptance_policy.global_recalibration_required, false);
});

test('Eagle uses the depleted rearm and per-pass payload without double-counting its charges', () => {
  const airstrike = row('eagle_airstrike'), profile = airstrike.strategic_profile;
  assert.equal(profile.cooldown_s, 120);
  assert.equal(profile.small_cd_s, 7);
  assert.equal(profile.uses, 3);
  assert.equal(profile.payload_per_call, 7);
  const full = assessStrategic(airstrike, model)[0].contribution;
  const one = structuredClone(airstrike); one.strategic_profile.uses = 1;
  const single = assessStrategic(one, model)[0].contribution;
  assert.equal(full.status, 'KNOWN');
  assert.equal(full.bare_score, single.bare_score);
  assert.ok(full.coverage_value > single.coverage_value);
  assert.equal(row('eagle_strafing_run').strategic_profile.payload_per_call, 100);
  assert.equal(row('eagle_strafing_run').strategic_profile.single_call_explosion_fraction, .25);
});

test('more turret ammunition raises coverage instead of creating a higher instantaneous peak', () => {
  const turret = row('deployable_machine_gun_sentry');
  const original = assessStrategic(turret, model)[0].contribution;
  const larger = structuredClone(turret); larger.strategic_profile.ammo *= 2;
  const expanded = assessStrategic(larger, model)[0].contribution;
  assert.equal(original.status, 'KNOWN');
  assert.equal(expanded.bare_score, original.bare_score);
  assert.ok(expanded.coverage_value > original.coverage_value);
  assert.ok(expanded.physical.capacity > original.physical.capacity);
  assert.equal(original.realization_factor, .30);
  assert.deepEqual(turret.strategic_profile.source_rate_range, [660, 630]);
});

test('manual operation pays for occupying the same hands and cannot stack a slower gun for free', () => {
  const wall = row('deployable_grenadier_defense_wall');
  const free = assessStrategic(wall, model, {ordinary_rates: {chaff: 0}})[0].contribution;
  const occupied = assessStrategic(wall, model, {ordinary_rates: {chaff: 1000}})[0].contribution;
  assert.ok(free.value > 0);
  assert.equal(occupied.operation_factor, 0);
  assert.equal(occupied.value, 0);
});

test('laser overheat loss is charged once and finite orbital charges can be exhausted', () => {
  const laser = assessStrategic(row('deployable_laser_sentry'), model)[0].contribution;
  assert.equal(laser.status, 'KNOWN');
  assert.equal(laser.physical.work_seconds, 180);
  assert.equal(laser.realization_factor, .10);
  for (const x of assessStrategic(row('orbital_laser'), model, {remaining_mission_uses: 0})) {
    assert.equal(x.contribution.value, 0);
    assert.equal(x.contribution.reason, 'FINITE_MISSION_USES_EXHAUSTED');
  }
});

test('missing timing stays explicit instead of a fake zero delay or old score', () => {
  assert.equal(assessStrategic(row('eagle_500kg_bomb'), model)[0].contribution.reason, 'DETONATION_DELAY_REQUIRED');
  assert.equal(assessStrategic(row('deployable_flame_sentry'), model)[0].contribution.reason, 'FINITE_DEPLOYABLE_AMMO_AND_RATE_REQUIRED');
  for (const x of assessStrategic(row('orbital_smoke_strike'), model)) assert.equal(x.contribution.value, 0);
});

test('the evaluator adds known red/green contributions while weapon capabilities remain independent', () => {
  const loadout = {primary: 'ar_23_liberator', secondary: 'gp_20_ultimatum', grenade: 'g_6_frag',
    stratagems: ['support_mg_43_machine_gun', 'backpack_b_1_supply_pack', 'eagle_airstrike', 'orbital_gas_strike']};
  const before = JSON.stringify(model.equipment.map(r => r.dimensions));
  const evaluated = evaluateAssessment(loadout, model, catalog);
  assert.equal(evaluated.status, 'UNKNOWN');
  assert.deepEqual(evaluated.missing, ['close_defense']);
  assert.equal(evaluated.acceptance_ready, false);
  assert.equal(evaluated.eligible_for_draw, false);
  assert.ok(evaluated.dimensions.chaff.strategic_bonus > 0);
  assert.equal(evaluated.cooperation, undefined);
  assert.equal(JSON.stringify(model.equipment.map(r => r.dimensions)), before);
  const pure = evaluateAssessment(loadout, model, catalog, {disabled_contributions: ['eagle_airstrike', 'orbital_gas_strike']});
  assert.equal(pure.dimensions.chaff.base_score, evaluated.dimensions.chaff.base_score);
  assert.equal(pure.dimensions.chaff.strategic_bonus, 0);
});
