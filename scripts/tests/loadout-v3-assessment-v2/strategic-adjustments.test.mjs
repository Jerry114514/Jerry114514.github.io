import test from 'node:test';
import assert from 'node:assert/strict';
import {applyStrategicCombatAdjustment} from '../../../shared/hd2-loadout/assessment-v2/strategic-adjustments.mjs';

const automatic = () => ({status: 'KNOWN', value: 12,
  bare_score: 80, coverage_value: 0.5, realization_factor: 0.6, operation_factor: 0.5,
  physical: {capacity: 20, work_seconds: 10}});
const eagle = {equipment_id: 'eagle_airstrike', category: 'eagle'};

test('all eagle combat roles halve the completed contribution without changing physical factors', () => {
  for (const role of ['chaff', 'close_defense', 'anti_medium', 'anti_heavy']) {
    const input = automatic(), before = structuredClone(input);
    const output = applyStrategicCombatAdjustment(eagle, role, input);
    assert.equal(output.value, 6);
    assert.equal(output.combat_adjustment.factor, 0.5);
    assert.equal(output.combat_adjustment.before_value, 12);
    assert.deepEqual(input, before);
    for (const key of ['bare_score', 'coverage_value', 'realization_factor', 'operation_factor', 'physical'])
      assert.deepEqual(output[key], input[key]);
  }
  const futureEagle = {...eagle, equipment_id: 'eagle_future_variant'};
  assert.equal(applyStrategicCombatAdjustment(futureEagle, 'chaff', automatic()).value, 6);
});

test('only the three catalog mortar variants receive the green combat adjustment', () => {
  for (const equipment_id of ['deployable_mortar_sentry', 'deployable_ems_mortar_sentry', 'deployable_gas_mortar_sentry'])
    assert.equal(applyStrategicCombatAdjustment({equipment_id, category: 'deployable'}, 'anti_medium', automatic()).value, 3);
  for (const row of [
    {equipment_id: 'orbital_120mm_he_barrage', category: 'orbital'},
    {equipment_id: 'orbital_380mm_he_barrage', category: 'orbital'},
    {equipment_id: 'deployable_rocket_sentry', category: 'deployable'},
    {equipment_id: 'deployable_flame_sentry', category: 'deployable'},
  ]) {
    const input = automatic();
    assert.strictEqual(applyStrategicCombatAdjustment(row, 'chaff', input), input);
  }
});

test('endurance and demolition inventories are never halved', () => {
  for (const row of [eagle, {equipment_id: 'deployable_mortar_sentry', category: 'deployable'}])
    for (const role of ['endurance', 'demolition']) {
      const input = automatic();
      assert.strictEqual(applyStrategicCombatAdjustment(row, role, input), input);
    }
});

test('manual final scores and unknown contributions remain unchanged; known zero stays zero', () => {
  for (const input of [
    {...automatic(), score_origin: 'MANUAL_CALIBRATED'},
    {status: 'UNKNOWN', value: null, reason: 'SOURCE_REQUIRED'},
    {status: 'UNKNOWN', value: 12, reason: 'UNCONFIRMED_VALUE'},
    {status: 'KNOWN', value: null},
  ]) assert.strictEqual(applyStrategicCombatAdjustment(eagle, 'chaff', input), input);
  assert.equal(applyStrategicCombatAdjustment(eagle, 'chaff', {status: 'KNOWN', value: 0}).value, 0);
});

test('repeated application and a JSON round trip cannot halve the same contribution twice', () => {
  const once = applyStrategicCombatAdjustment(eagle, 'anti_heavy', automatic());
  assert.strictEqual(applyStrategicCombatAdjustment(eagle, 'anti_heavy', once), once);
  const restored = JSON.parse(JSON.stringify(once));
  assert.strictEqual(applyStrategicCombatAdjustment(eagle, 'anti_heavy', restored), restored);
  assert.equal(restored.value, 6);
  const manual = {...restored, value: 75, score_origin: 'MANUAL_CALIBRATED'};
  assert.strictEqual(applyStrategicCombatAdjustment(eagle, 'anti_heavy', manual), manual);
});
