import test from 'node:test';
import assert from 'node:assert/strict';
import {executeResourcePlan, loadedKey} from '../../../shared/hd2-loadout/assessment-v2/resources.mjs';

const grenades = (loaded = 4) => ({id: 'gas', loaded, capacity: loaded, reserve: 0, reserve_capacity: 0,
  feed: 'loose', reload_ms: 0, refill: {public: 2, portable: 2}});
const throwGas = effect_delay_ms => ({weapon_id: 'gas', mode_id: 'gas-cloud', rounds: 1,
  prepare_ms: 1800, acquire_ms: 300, charge_ms: 1500, interval_ms: 1500, effect_delay_ms});
const gasCohort = () => [5300, 9300, 15900, 15900].map(throwGas);
const shot = (effect_delay_ms, extra = {}) => ({weapon_id: 'gas', mode_id: 'gas-cloud', rounds: 1,
  prepare_ms: 0, interval_ms: 1000, effect_delay_ms, ...extra});

test('exhausted grenades retain issued actions without claiming their pending cloud deaths', () => {
  const result = executeResourcePlan({weapons: [grenades()], providers: [],
    steps: [...gasCohort(), throwGas(999999)]});
  assert.equal(result.status, 'INSUFFICIENT');
  assert.equal(result.reason, 'AMMUNITION_EXHAUSTED');
  assert.equal(result.state.time, 6300);
  assert.equal(result.completed_steps, 4);
  assert.equal(result.completed_effect_steps, 0);
  assert.deepEqual(result.completed_step_effect_at_ms, [7100, 12600, 20700, 22200]);
  assert.equal(result.committed_effect_until_ms, 22200);
  assert.equal(result.pending_effect_until_ms, 22200);
  assert.equal(result.state.resources[loadedKey('gas')].value, 0);
  assert.equal(result.state.trace.filter(t => t.action_id?.startsWith('fire:')).length, 4);
  assert.equal(result.elapsed_ms, undefined, 'failure does not masquerade as a completed plan');
});

test('successful targetless cloud plans use their existing effect horizon as the state time', () => {
  const result = executeResourcePlan({weapons: [grenades()], providers: [], steps: gasCohort()});
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.elapsed_ms, 22200);
  assert.equal(result.state.time, result.elapsed_ms);
  assert.equal(result.completed_steps, 4);
  assert.equal(result.completed_effect_steps, 4);
  assert.equal(result.committed_effect_until_ms, 22200);
  assert.equal(result.pending_effect_until_ms, null);
});

test('failure counts only full actions whose effect timestamps have already elapsed', () => {
  const result = executeResourcePlan({weapons: [grenades(2)], providers: [],
    steps: [shot(500), shot(3000), shot(999999)]});
  assert.equal(result.status, 'INSUFFICIENT');
  assert.equal(result.state.time, 1000);
  assert.equal(result.completed_steps, 2);
  assert.equal(result.completed_effect_steps, 1);
  assert.deepEqual(result.completed_step_effect_at_ms, [500, 4000]);
  assert.equal(result.pending_effect_until_ms, 4000);
});

test('partial multi-shot actions expose committed effects but do not count as completed actions', () => {
  const result = executeResourcePlan({weapons: [grenades(2)], providers: [], targets: {enemy: {hp: 3}},
    steps: [shot(5000, {rounds: 3, damage_per_round: 1, target_id: 'enemy'})]});
  assert.equal(result.status, 'INSUFFICIENT');
  assert.equal(result.reason, 'AMMUNITION_EXHAUSTED');
  assert.equal(result.state.time, 1000);
  assert.equal(result.completed_steps, 0);
  assert.equal(result.completed_effect_steps, 0);
  assert.deepEqual(result.completed_step_effect_at_ms, []);
  assert.equal(result.committed_effect_until_ms, 6000);
  assert.equal(result.pending_effect_until_ms, 6000);
  assert.equal(result.state.targets.enemy.hp, 3);
  assert.equal(result.state.pending.length, 2);
  assert.equal(result.state.resources[loadedKey('gas')].value, 0);
});

test('an emitted effect beyond the deadline remains pending and cannot become completed', () => {
  const result = executeResourcePlan({weapons: [grenades(2)], providers: [], deadline_ms: 2000,
    targets: {enemy: {hp: 1}}, steps: [shot(3000, {target_id: 'enemy'}), shot(999999)]});
  assert.equal(result.status, 'INSUFFICIENT');
  assert.equal(result.reason, 'EFFECT_WINDOW_EXCEEDED');
  assert.equal(result.state.time, 0);
  assert.equal(result.completed_steps, 0);
  assert.equal(result.completed_effect_steps, 0);
  assert.equal(result.committed_effect_until_ms, 3000);
  assert.equal(result.pending_effect_until_ms, 3000);
  assert.equal(result.state.targets.enemy.hp, 1);
  assert.equal(result.state.resources[loadedKey('gas')].value, 1);
});

test('unfired plans have no committed effect horizon, and completed immediate shots have no pending effect', () => {
  const empty = executeResourcePlan({weapons: [{...grenades(), loaded: 0}], providers: [], steps: [shot(999999)]});
  assert.equal(empty.status, 'INSUFFICIENT');
  assert.equal(empty.committed_effect_until_ms, null);
  assert.equal(empty.pending_effect_until_ms, null);
  assert.equal(empty.completed_effect_steps, 0);
  const immediate = executeResourcePlan({weapons: [grenades(1)], providers: [], steps: [shot(0)]});
  assert.equal(immediate.status, 'COMPLETED');
  assert.equal(immediate.committed_effect_until_ms, 0);
  assert.equal(immediate.pending_effect_until_ms, null);
  assert.equal(immediate.completed_effect_steps, 1);
});
