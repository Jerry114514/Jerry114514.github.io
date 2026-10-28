import test from 'node:test';
import assert from 'node:assert/strict';
import {projectileService, scoreOrdinary} from '../../../shared/hd2-loadout/assessment-v2/projectile.mjs';
import {executeResourcePlan} from '../../../shared/hd2-loadout/assessment-v2/resources.mjs';
import {sustainedTempo} from '../../../shared/hd2-loadout/assessment-v2/timing.mjs';

const ap = {equal: .65, greater: 1};
const policy = {reference_ergonomics: 65, reference_acquire_ms: 300, low_ergo_gain: 1, horizontal_ms_per_unit: 2, vertical_ms_per_unit: 1};
const target = {target_id: 'enemy', part_id: 'main', hp: 200, armor: 0, durable: 0};
const gun = {mode_id: 'gun', kind: 'projectile', feed_bound: true, normal: 100, durable: 100, pen: 3,
  pellets: 1, rpm: 600, capacity: 3, reload_ms: 2000, traits: '',
  handling: {ergonomics: 65, recoil_horizontal: 0, recoil_vertical: 0}};

test('capability and finite plan share exact shot clocks across reload, charge, target transfer and pump insertion', () => {
  for (const mode of [gun, {...gun, capacity: 1, rpm: 60, charge_ms: 1000, traits: 'Charge'},
    {...gun, rpm: 120, round_reload_profile: {partial_one_ms: 600}},
    {...gun, handling: {...gun.handling, ergonomics: 20, recoil_horizontal: 250}}]) {
    const measured = projectileService(mode, [{target, count: 4}], ap, {handling_policy: policy});
    const result = executeResourcePlan({weapons: [{id: 'gun', capacity: mode.capacity, loaded: mode.capacity,
      reserve: 100, reserve_capacity: 100, reload_ms: mode.reload_ms, round_reload_profile: mode.round_reload_profile}],
      providers: [], steps: Array.from({length: 4}, () => ({weapon_id: 'gun', mode_id: 'gun', rounds: 2,
        prepare_ms: 0, acquire_ms: Math.ceil(measured.handling.acquire_ms), charge_ms: mode.charge_ms ?? 0,
        interval_ms: measured.interval_ms, effect_delay_ms: 0}))});
    assert.equal(result.status, 'COMPLETED');
    assert.equal(result.elapsed_ms, measured.first_to_last_ms);
    assert.equal(result.state.resources['loaded:gun'].value + result.state.resources['ammo:gun'].value,
      mode.capacity + 100 - measured.shots);
  }
});

test('periodic tempo includes magazine depletion instead of charging only whichever side a short wave ends on', () => {
  const one = [{btk: 1, count: 1}], many = [{btk: 1, count: 100}];
  const input = {capacity: 10, interval_ms: 100, acquire_ms: 0, reload_ms: 2000};
  const a = sustainedTempo({...input, entries: one}), b = sustainedTempo({...input, entries: many});
  assert.equal(a.targets_per_second, b.targets_per_second);
  assert.equal(a.pattern_ms, 290); // 9 intervals + 2000 ms reload per ten shots.
  const longReload = sustainedTempo({...input, entries: one, reload_ms: 20000});
  assert.ok(longReload.targets_per_second < a.targets_per_second / 5);
});

test('periodic mixed-target computation agrees with an independent full joint-period timeline', () => {
  const entries = [{btk: 2, count: 2}, {btk: 3, count: 1}];
  const input = {entries, capacity: 4, interval_ms: 100, acquire_ms: 350, reload_ms: 1300};
  const boundaries = [false, true, false, true, false, false, true];
  let time = 0;
  for (let shot = 1; shot <= 28; shot++) time += Math.max(100, boundaries[(shot - 1) % 7] ? 350 : 0, shot % 4 === 0 ? 1300 : 0);
  assert.equal(sustainedTempo(input).pattern_ms, time / 4);
});

test('primary preference survives normalized reference factors and is never applied to ammunition or damage', () => {
  const capability = {modes: [{mode_id: 'same', chaff: {status: 'ESTIMATE', sustained: {targets_per_second: 1}}}]};
  const primary = scoreOrdinary(capability, capability, {role: 'chaff', primary: true, reference_primary: true});
  const secondary = scoreOrdinary(capability, capability, {role: 'chaff', primary: false, reference_primary: true});
  assert.equal(primary.ratio, 1); assert.equal(secondary.ratio, .8);
  assert.equal(primary.ratio / secondary.ratio, 1.25);
});

test('switching weapons costs declared time and never sums parallel handheld firepower', () => {
  const weapons = ['a', 'b'].map(id => ({id, loaded: 1, capacity: 1, reserve: 0, reserve_capacity: 0}));
  const step = id => ({weapon_id: id, rounds: 1, interval_ms: 100, prepare_ms: 300, effect_delay_ms: 0});
  const missing = executeResourcePlan({weapons, providers: [], steps: [step('a'), step('b')]});
  assert.equal(missing.reason, 'WEAPON_SWITCH_TIME_REQUIRED');
  const actual = executeResourcePlan({weapons, providers: [], steps: [step('a'), {...step('b'), switch_ms: 500}]});
  assert.equal(actual.elapsed_ms, 1100);
});

test('close defense stops its kill-route clock at the final threat rather than penalizing an afterwards reload', () => {
  const row = cycle => ({modes: [{mode_id: 'a', close_defense: {status: 'ESTIMATE', first_to_last_ms: 1200, cycle_ms: cycle}}]});
  assert.equal(scoreOrdinary(row(5000), row(1500), {role: 'close_defense'}).ratio, 1);
});
