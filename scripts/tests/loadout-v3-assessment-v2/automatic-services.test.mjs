import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessAutomatic} from '../../../shared/hd2-loadout/assessment-v2/automatic.mjs';

const model = JSON.parse(readFileSync(new URL('../../../shared/hd2-loadout/assessment-v2/equipment.json', import.meta.url)));
const row = id => model.equipment.find(x => x.equipment_id === id);
const byRole = (result, role) => result.find(x => x.role === role).contribution;

test('guard dog exposes only its conditional first magazine, never sustained bonus', () => {
  const result = assessAutomatic(row('backpack_ax_ar_23_guard_dog'), model);
  for (const role of ['chaff', 'anti_medium']) {
    const c = byRole(result, role);
    assert.equal(c.status, 'UNKNOWN');
    assert.equal(c.reason, 'REARM_AND_TARGET_SWITCH_TIMING_REQUIRED');
    assert.equal(c.physical.first_magazine_rounds, 45);
    assert.equal(c.physical.fire_rate_rpm, 660);
    assert.ok(c.physical.conditional_target_equivalents >= 0);
    assert.equal(c.value, null);
  }
  assert.equal(byRole(result, 'close_defense').status, 'UNKNOWN');
});

test('K-9 gives only a conditional auxiliary candidate at the observed approximate cycle', () => {
  const result = assessAutomatic(row('backpack_ax_arc_3_k_9'), model);
  for (const role of ['chaff', 'anti_medium']) {
    const c = byRole(result, role);
    assert.equal(c.status, 'KNOWN');
    assert.equal(c.calibration_status, 'FORMULA_CANDIDATE');
    assert.equal(c.source, 'AUTOMATIC_BACKPACK_AUXILIARY');
    assert.equal(c.physical.cycle_seconds, 5);
    assert.equal(c.realization_factor, 0.45);
    assert.ok(Number.isFinite(c.value) && c.value >= 0);
    assert.ok(c.assumptions.includes('ONE_DIRECT_ARC_ONLY_NO_CHAIN_OR_STUN_CREDIT'));
  }
  assert.equal(byRole(result, 'close_defense').value, null);
});

test('unresolved lasers and sprays are not converted into fake damage or fire uptime', () => {
  for (const id of ['backpack_ax_las_5_guard_dog_rover', 'backpack_ax_tx_13_purifier', 'backpack_ax_flam_75_hot_dog']) {
    const result = assessAutomatic(row(id), model);
    assert.equal(result.length, 3);
    assert.ok(result.every(x => x.contribution.status === 'UNKNOWN' && x.contribution.value === null));
  }
});

test('missing target, reference, damage, or changed feed remains unknown', () => {
  const dog = structuredClone(row('backpack_ax_ar_23_guard_dog'));
  dog.facts.modes[0].capacity = 46;
  assert.equal(byRole(assessAutomatic(dog, model), 'chaff').reason, 'GUARD_DOG_FIRST_MAGAZINE_OR_RATE_UNVERIFIED');
  const k9 = structuredClone(row('backpack_ax_arc_3_k_9'));
  k9.facts.modes[0].durable = null;
  assert.equal(byRole(assessAutomatic(k9, model), 'chaff').reason, 'BOUND_AUTOMATIC_DAMAGE_REQUIRED');
  const incomplete = {...model, targets: {}};
  assert.equal(byRole(assessAutomatic(row('backpack_ax_arc_3_k_9'), incomplete), 'chaff').reason, 'REFERENCE_OR_TARGET_REQUIRED');
  assert.deepEqual(assessAutomatic({equipment_id:'unrelated'}, model), []);
});
