import test from 'node:test';
import assert from 'node:assert/strict';
import {finiteBlast, refreshingStatus, thermalCycle, pressureAssessment, threatResolution} from '../../../shared/hd2-loadout/assessment-v2/mechanisms.mjs';

const blast = {normal: 400, durable: 400, pen: 3, inner_radius_m: 2, outer_radius_m: 4};
const enemy = {instance_id: 'a', part_id: 'main', hp: 100, armor: 1, durable: 0, fatal: true, distance_m: 1, line_of_sight: 'clear', explosion_resistance: 0};
const input = {blast, targets: [enemy], ap: {equal: .65, greater: 1}, geometry: {id: 'test', basis: 'scenario'}};

test('area damage respects finite targets, LoS and overkill rather than treating full damage as extra kills', () => {
  const result = finiteBlast({...input, targets: [enemy, {...enemy, instance_id: 'b', line_of_sight: 'blocked'},
    {...enemy, instance_id: 'c', distance_m: 4}]});
  assert.equal(result.effective_hp_damage, 100);
  assert.deepEqual(result.hits.map(h => h.remaining_hp), [0, 100, 100]);
  assert.equal(finiteBlast({...input, geometry: null}).reason, 'FINITE_GEOMETRY_REQUIRED');
});

test('an unknown falloff curve in the outer band and duplicate heavy parts do not invent blast benefits', () => {
  assert.equal(finiteBlast({...input, targets: [{...enemy, distance_m: 3}]}).status, 'UNKNOWN');
  assert.equal(finiteBlast({...input, targets: [enemy, {...enemy, part_id: 'leg'}]}).reason, 'MULTIPART_REQUIRES_COMPOSITE_ROUTE');
});

test('refreshing fire/gas windows overlap without duplicating damage and never exceed target HP', () => {
  const effect = {applications_ms: [0, 2000], duration_ms: 3000, damage_per_second: 100, target_hp: 1000, horizon_ms: 10000, stacking: 'refresh'};
  const result = refreshingStatus(effect);
  assert.equal(result.active_ms, 5000); assert.equal(result.effective_hp_damage, 500);
  assert.equal(refreshingStatus({...effect, target_hp: 300}).effective_hp_damage, 300);
  assert.equal(refreshingStatus({...effect, stacking: undefined}).status, 'UNKNOWN');
});

test('heat cycle includes cooling delay and warmup, with unknown values kept unresolved', () => {
  const data = {usable_heat: 80, heat_per_second: 10, cool_per_second: 20, cooling_delay_s: 1, warmup_s: 1};
  assert.equal(thermalCycle(data).cycle_s, 14);
  assert.equal(thermalCycle(data).firing_fraction, 8 / 14);
  assert.equal(thermalCycle({...data, cooling_delay_s: null}).status, 'UNKNOWN');
  assert.ok(thermalCycle({...data, cool_per_second: 10}).firing_fraction < thermalCycle(data).firing_fraction);
});

test('enemy-count threshold derives from available damage tempo and finite stock, not an old score', () => {
  const data = {present: 20, arrivalsPerSecond: 1, effectiveKillsPerSecond: 3, availableKills: 30, safeWindowSeconds: 10};
  const enough = pressureAssessment(data), over = pressureAssessment({...data, present: 21});
  assert.equal(enough.critical_present, 20); assert.equal(enough.physical.status, 'CONTROLLED');
  assert.equal(over.physical.status, 'OVERWHELMED'); assert.ok(over.score < enough.score);
  assert.equal(pressureAssessment({...data, effectiveKillsPerSecond: 1}).physical.reason, 'NO_NET_CLEARANCE');
  assert.equal(pressureAssessment({...data, arrivalsPerSecond: undefined}).status, 'UNKNOWN');
  const early = pressureAssessment({...data, present: 12, availableKills: 20});
  assert.equal(early.physical.status, 'CONTROLLED'); assert.ok(early.capacity_ratio > 1);
});

test('a broken fatal part does not imply instant threat removal without residual-threat evidence', () => {
  assert.equal(threatResolution({part_break_ms: 300}).status, 'UNKNOWN');
  assert.equal(threatResolution({part_break_ms: 300, residual_threat_ms: 2500}).neutralized_at_ms, 2800);
  assert.equal(threatResolution({part_break_ms: 300, residual_threat_ms: 0}).neutralized_at_ms, 300);
});
