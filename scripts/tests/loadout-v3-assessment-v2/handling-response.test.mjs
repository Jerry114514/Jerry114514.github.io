import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {handlingTiming, mediumResponse} from '../../../shared/hd2-loadout/assessment-v2/handling.mjs';
import {projectileService, scoreOrdinary} from '../../../shared/hd2-loadout/assessment-v2/projectile.mjs';
import {assessMixedEndurance} from '../../../shared/hd2-loadout/assessment-v2/engagement.mjs';

const model = JSON.parse(readFileSync(new URL('../../../shared/hd2-loadout/assessment-v2/equipment.json', import.meta.url)));
const hp = model.scenario.handling, rp = model.scenario.medium_response;
const target = {target_id: 'test', part_id: 'head', hp: 100, armor: 1, durable: 0, fatal: true};
const gun = {mode_id: 'fixture', kind: 'projectile', feed_bound: true, normal: 100, durable: 100,
  pen: 3, pellets: 1, rpm: 600, capacity: 10, total: 100, reload_ms: 2500, traits: '',
  handling: {ergonomics: 65, recoil_horizontal: 0, recoil_vertical: 0}};
const measure = (mode, enemy = target, count = 1) => projectileService(mode, [{target: enemy, count}], model.ap, {handling_policy: hp});
const utility = service => mediumResponse(service, rp).value;

test('first-shot kill wins over two hits without fabricating a two-second aiming delay', () => {
  const one = measure(gun), two = measure({...gun, normal: 50, durable: 50});
  assert.equal(one.shots, 1); assert.equal(one.first_to_last_ms, hp.reference_acquire_ms);
  assert.ok(two.first_to_last_ms > one.first_to_last_ms);
  assert.ok(utility(one) > utility(two));
});

test('empty single-shot gun pays reload after the kill, not before the already-loaded first shot', () => {
  const one = measure({...gun, capacity: 1, rpm: 60});
  assert.equal(one.first_to_last_ms, 300);
  assert.equal(one.recovery_after_ms, 2500);
  assert.equal(one.cycle_ms, 2800);
  const slow = measure({...gun, capacity: 1, rpm: 60, reload_ms: 10000});
  assert.equal(slow.first_to_last_ms, one.first_to_last_ms);
  assert.ok(utility(slow) < utility(one));
  assert.equal(mediumResponse(slow, rp).one_shot, true);
});

test('recoil generated after a lethal first hit never retroactively delays that kill', () => {
  const stable = measure(gun);
  const high = {...gun, handling: {...gun.handling, recoil_horizontal: 500, recoil_vertical: 500}};
  const kicked = measure(high);
  assert.equal(kicked.first_to_last_ms, stable.first_to_last_ms);
  assert.equal(kicked.shots, stable.shots);
  assert.ok(kicked.interval_ms > stable.interval_ms);
  assert.ok(kicked.interval_ms <= Math.ceil(stable.mechanical_interval_ms * (1 + hp.max_recoil_interval_extra_fraction)));
  // Under the user's small-correction policy, acquiring the next target can
  // absorb all recoil recovery; that must not become an extra additive delay.
  assert.equal(kicked.recovery_after_ms, stable.recovery_after_ms);
  const burst = measure({...high, normal: 50, durable: 50});
  assert.ok(burst.first_to_last_ms > measure({...gun, normal: 50, durable: 50}).first_to_last_ms);
});

test('long reload and slow firing absorb recoil recovery instead of applying a second penalty', () => {
  const high = {...gun.handling, recoil_horizontal: 500, recoil_vertical: 500};
  for (const mode of [{...gun, capacity: 1}, {...gun, rpm: 30}]) {
    const before = measure(mode), after = measure({...mode, handling: high});
    assert.equal(after.cycle_ms, before.cycle_ms);
    assert.equal(utility(after), utility(before));
  }
});

test('low ergonomics increases acquisition and target transfer, without changing damage or inventory', () => {
  const low = {...gun, handling: {...gun.handling, ergonomics: 10}};
  const original = structuredClone(low);
  const fast = measure(gun), slow = measure(low);
  assert.ok(slow.first_to_last_ms > fast.first_to_last_ms);
  const damageEntries = service => service.entries.map(({acquire_ms, ...damage}) => damage);
  assert.deepEqual(damageEntries(slow), damageEntries(fast));
  assert.ok(slow.entries[0].acquire_ms > fast.entries[0].acquire_ms);
  assert.equal(slow.inventory_required, fast.inventory_required);
  assert.ok(measure(low, target, 4).first_to_last_ms > measure(gun, target, 4).first_to_last_ms);
  assert.deepEqual(low, original);
});

test('both horizontal and vertical recoil can increase post-shot recovery independently', () => {
  const base = handlingTiming(gun.handling, hp);
  assert.ok(handlingTiming({...gun.handling, recoil_horizontal: 10}, hp).recoil_settle_ms > base.recoil_settle_ms);
  assert.ok(handlingTiming({...gun.handling, recoil_vertical: 10}, hp).recoil_settle_ms > base.recoil_settle_ms);
});

test('missing recoil is unknown, while an explicit zero recoil remains usable', () => {
  assert.equal(measure({...gun, handling: {...gun.handling, recoil_horizontal: null}}).status, 'UNKNOWN');
  assert.equal(measure(gun).status, 'ESTIMATE');
  assert.equal(handlingTiming(gun.handling, {...hp, horizontal_ms_per_unit: null}).status, 'UNKNOWN');
});

test('a pump top-up keeps a round in the tube and does not borrow the faster partial animation after emptying', () => {
  const pump = {...gun, capacity: 2, rpm: 60, reload_ms: 5000,
    round_reload_profile: {partial_one_ms: 400, full_empty_ms: 5000}};
  const result = measure(pump, {...target, hp: 300});
  assert.equal(result.shots, 3); assert.equal(result.partial_inserts, 1);
  assert.equal(result.reloads, 0); assert.equal(result.first_to_last_ms, 2300);
  const single = measure({...pump, capacity: 1}, {...target, hp: 200});
  assert.equal(single.partial_inserts, 0); assert.equal(single.reloads, 1);
  assert.equal(single.first_to_last_ms, 5300);
});

test('charging a new round follows reloading rather than disappearing inside the reload duration', () => {
  const mode = {...gun, capacity: 1, rpm: 60, charge_ms: 1000, reload_ms: 2500, traits: 'Charge'};
  const result = measure(mode, {...target, hp: 200});
  assert.equal(result.first_to_last_ms, 4800);
  assert.equal(result.recovery_after_ms, 3500);
});

test('actual S11 source preserves one-shot routes and its 2250 ms upgraded reload', () => {
  const spear = model.equipment.find(e => e.equipment_id === 'support_spear');
  const adj = model.equipment.find(e => e.equipment_id === 'br_14_adjudicator');
  const mode = spear.capabilities.modes[0];
  for (const result of mode.anti_medium) {
    assert.equal(result.shots, 1); assert.equal(result.recovery_after_ms, 2250);
    assert.equal(result.first_to_last_ms, result.entries[0].acquire_ms);
    assert.ok(result.first_to_last_ms < 2000, 'one-shot still pays precision acquisition before the first hit');
    assert.equal(result.response.one_shot, true);
  }
  assert.ok(spear.dimensions.anti_medium.score > adj.dimensions.anti_medium.score,
    'a reliable one-shot should not lose its first-target advantage to the old common +2s denominator');
  assert.equal(spear.facts.handling.ergonomics, 35);
  assert.equal(spear.facts.handling.recoil_horizontal, 6.5);
  assert.equal(spear.facts.handling.recoil_vertical, 25);
  assert.equal(adj.facts.handling_source.recoil.selected, '27');
  assert.equal(adj.facts.handling_source.recoil.infobox, '24', 'the conflicting infobox is retained, not averaged');
});

test('medium scoring requires new response measurements instead of falling back to legacy zero-TTK math', () => {
  const c = {modes: [{mode_id: 'old', anti_medium: [{target_id: 'test', status: 'ESTIMATE', first_to_last_ms: 0}]}]};
  assert.equal(scoreOrdinary(c, c, {role: 'anti_medium'}).state, 'UNRESOLVED');
});

test('the mixed-wave resource plan reads handling cost without changing ammunition capacity', () => {
  const row = model.equipment.find(e => e.equipment_id === 'sg_97_sweeper');
  const slow = structuredClone(row);
  slow.facts.modes.forEach(m => {m.handling.ergonomics = 0;});
  const before = assessMixedEndurance([row], model), after = assessMixedEndurance([slow], model);
  assert.ok(before.completed_actions > 0);
  assert.equal(after.completed_actions, before.completed_actions);
  assert.deepEqual(after.ammo_remaining, before.ammo_remaining);
  assert.ok(after.elapsed_ms > before.elapsed_ms);
});
