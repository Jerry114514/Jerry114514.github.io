import test from 'node:test';
import assert from 'node:assert/strict';
import {combatResources, receiveSupply, executeResourcePlan, ammoKey, loadedKey, supplyKey} from '../../../shared/hd2-loadout/assessment-v2/resources.mjs';
const gun = (id = 'gun') => ({id, loaded: 2, capacity: 2, reserve: 2, reserve_capacity: 2, reload_ms: 1000, refill: {public: 2, portable: 1}});
const pack = () => ({id: 'pack', kind: 'backpack', charges: 4, capacity: 4, refill_kind: 'portable', ready_at_ms: 0, take_ms: 1000});
const box = () => ({id: 'public', kind: 'public', charges: 1, capacity: 1, refill_kind: 'public', ready_at_ms: 0, take_ms: 1000, refills_pack: true});
const shot = (rounds, extra = {}) => ({weapon_id: 'gun', rounds, interval_ms: 100, prepare_ms: 0, effect_delay_ms: 0, ...extra});

test('shared ammunition is consumed across roles, and cannot be cloned per target', () => {
  const result = executeResourcePlan({weapons: [gun()], providers: [], steps: [shot(3), shot(2)]});
  assert.equal(result.status, 'INSUFFICIENT'); assert.equal(result.reason, 'AMMUNITION_EXHAUSTED');
});
test('a finite pack can be acquired midfight when ammunition is exhausted', () => {
  const result = executeResourcePlan({weapons: [gun()], providers: [pack()], steps: [shot(7)]});
  assert.equal(result.status, 'COMPLETED'); assert.equal(result.supplies_taken.length, 3);
  assert.equal(result.state.resources[supplyKey('pack')].value, 1);
  assert.equal(executeResourcePlan({weapons: [gun()], providers: [pack()], steps: [shot(9)]}).status, 'INSUFFICIENT');
});
test('one box restores multiple weapons plus one pack charge, paid exactly once', () => {
  const weapons = [gun('a'), gun('b')], p = {...pack(), charges: 2};
  const state = combatResources(weapons, [p, box()]);
  state.resources[ammoKey('a')].value = 0; state.resources[ammoKey('b')].value = 1;
  const result = receiveSupply(state, box(), weapons, [p, box()]);
  assert.equal(result.status, 'TAKEN'); assert.equal(result.state.resources[supplyKey('public')].value, 0);
  assert.equal(result.state.resources[supplyKey('pack')].value, 3);
  assert.equal(result.state.resources[ammoKey('a')].value, 2);
  assert.equal(result.state.resources[ammoKey('b')].value, 2);
  assert.equal(state.resources[supplyKey('public')].value, 1, 'original state preserved');
});
test('refill restores reserve, not a free already-loaded magazine', () => {
  const weapon = gun(); weapon.loaded = 0; weapon.reserve = 0;
  const state = combatResources([weapon], [box()]);
  const result = receiveSupply(state, box(), [weapon]);
  assert.equal(result.state.resources[loadedKey('gun')].value, 0);
  assert.equal(result.state.resources[ammoKey('gun')].value, 2);
});
test('supply and reload must both fit inside the combat deadline', () => {
  const request = {weapons: [gun()], providers: [box()], steps: [shot(6)]};
  assert.equal(executeResourcePlan({...request, deadline_ms: 3000}).status, 'INSUFFICIENT');
  assert.equal(executeResourcePlan({...request, deadline_ms: 3600}).status, 'COMPLETED');
});
test('two detached effects overlap instead of summing full fuse durations', () => {
  const weapon = {...gun(), loaded: 2, reserve: 0};
  const result = executeResourcePlan({weapons: [weapon], providers: [], deadline_ms: 12000,
    targets: {a: {hp: 1}, b: {hp: 1}}, steps: [shot(1, {target_id: 'a', interval_ms: 1000, effect_delay_ms: 9000}),
      shot(1, {target_id: 'b', interval_ms: 1000, effect_delay_ms: 9000})]});
  assert.equal(result.status, 'COMPLETED'); assert.equal(result.elapsed_ms, 10000);
  assert.equal(result.state.targets.a.destroyed_at, 9000); assert.equal(result.state.targets.b.destroyed_at, 10000);
});
test('supply vehicle is eight finite player supplies, with no turret account or free refill', () => {
  const car = {...pack(), id: 'car', kind: 'vehicle', charges: 8, capacity: 8};
  const state = combatResources([gun()], [car]);
  assert.deepEqual(Object.keys(state.resources).sort(), [ammoKey('gun'), loadedKey('gun'), supplyKey('car')].sort());
  assert.equal(executeResourcePlan({weapons: [gun()], providers: [car], steps: [shot(12)]}).status, 'COMPLETED');
  assert.equal(executeResourcePlan({weapons: [gun()], providers: [car], steps: [shot(13)]}).status, 'INSUFFICIENT');
});
test('grenades and belt inventories refill their usable stock without an invented magazine reload', () => {
  for (const feed of ['loose', 'belt']) {
    const weapon = {...gun(), feed, reserve: 0, reserve_capacity: 0, reload_ms: null};
    const result = executeResourcePlan({weapons: [weapon], providers: [box()], steps: [shot(4)]});
    // Shot at 0/100, receive supply 100..1100 (absorbs recovery), then 1100/1200.
    assert.equal(result.status, 'COMPLETED'); assert.equal(result.elapsed_ms, 1200);
    assert.equal(result.state.trace.some(x => x.action_id?.startsWith('reload:')), false);
  }
});

test('a lethal hit at the deadline passes even when the shot interval ends later', () => {
  const request = {weapons: [gun()], providers: [], targets: {a: {hp: 1}},
    steps: [shot(1, {target_id: 'a', prepare_ms: 19900, interval_ms: 500})]};
  const result = executeResourcePlan({...request, deadline_ms: 20000});
  assert.equal(result.status, 'COMPLETED'); assert.equal(result.elapsed_ms, 19900);
  assert.equal(result.action_ready_ms, 20400);
  assert.equal(executeResourcePlan({...request, deadline_ms: 19899}).status, 'INSUFFICIENT');
});

test('late detached damage still fails even when throwing finishes inside the deadline', () => {
  const result = executeResourcePlan({weapons: [gun()], providers: [], deadline_ms: 20000,
    targets: {a: {hp: 1}}, steps: [shot(1, {target_id: 'a', effect_delay_ms: 20001})]});
  assert.equal(result.status, 'INSUFFICIENT');
});

test('unknown refill of an unused weapon does not cancel a known refill, nor become zero', () => {
  const unknown = {...gun('other'), loaded: 0, reserve: 0, refill: {public: null, portable: null}};
  const request = {weapons: [gun(), unknown], providers: [box()], steps: [shot(6)]};
  const known = executeResourcePlan(request);
  assert.equal(known.status, 'COMPLETED'); assert.deepEqual(known.unresolved_refills, ['other']);
  const thenUnknown = executeResourcePlan({...request, steps: [...request.steps, shot(1, {weapon_id: 'other', switch_ms: 500})]});
  assert.equal(thenUnknown.status, 'UNKNOWN'); assert.equal(thenUnknown.reason, 'REFILL_AMOUNT_REQUIRED');
});

test('unknown necessary refill is not reported as proven empty stock', () => {
  const result = executeResourcePlan({weapons: [{...gun(), refill: {public: null}}], providers: [box()], steps: [shot(5)]});
  assert.equal(result.status, 'UNKNOWN'); assert.equal(result.reason, 'REFILL_AMOUNT_REQUIRED');
});

test('partial reload shares firing interval but spends a reserve round for each insert', () => {
  const weapon = {...gun(), loaded: 3, capacity: 3, reserve: 3, reserve_capacity: 3,
    reload_ms: 1800, round_reload_profile: {partial_one_ms: 600}};
  const request = {weapons: [weapon], providers: [], steps: [shot(6, {interval_ms: 400})]};
  const result = executeResourcePlan(request);
  assert.equal(result.status, 'COMPLETED'); assert.equal(result.elapsed_ms, 2600);
  assert.equal(result.state.resources[ammoKey('gun')].value, 0);
  assert.equal(result.state.resources[loadedKey('gun')].value, 0);
  assert.equal(executeResourcePlan({...request, steps: [shot(7, {interval_ms: 400})]}).status, 'INSUFFICIENT');
});
