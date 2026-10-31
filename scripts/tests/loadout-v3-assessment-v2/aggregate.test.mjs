import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeLoadout, displayScore, finalizeAssessmentSummary} from '../../../shared/hd2-loadout/assessment-v2/aggregate.mjs';
const roles = ['chaff', 'close_defense', 'anti_medium'];
const base = score => roles.map(role => ({equipment_id: 'gun', role, score, state: 'ENGINEERING_ESTIMATE'}));
const request = () => ({ordinary: base(60), thresholds: {chaff: 60, close_defense: 60, anti_medium: null},
  coverage_complete: Object.fromEntries(roles.map(role => [role, true])),
  gates: Object.fromEntries(['legality', 'heavy_pair', 'demolition', 'shared_resources', 'close_safety'].map(id => [id, {status: 'PASS'}]))});

test('handheld contributions select a measured route, not a sum of simultaneous guns', () => {
  const data = request(); data.ordinary.push(...base(50).map(x => ({...x, equipment_id: 'pistol'})));
  assert.equal(summarizeLoadout(data).dimensions.chaff.base_score, 60);
});

test('red/green CD-adjusted contributions are added exactly once without a hidden fixed bonus budget', () => {
  const data = request(); data.strategic = ['a', 'b'].map(equipment_id => ({equipment_id, role: 'chaff', contribution: {status: 'KNOWN', value: 22}}));
  const result = summarizeLoadout(data);
  assert.equal(result.dimensions.chaff.strategic_bonus, 44);
  assert.equal(result.dimensions.chaff.total_before_display, 104);
  assert.ok(result.dimensions.chaff.score > 100 && result.dimensions.chaff.score < 105);
  data.strategic.push(data.strategic[0]);
  assert.equal(summarizeLoadout(data).reason, 'DUPLICATE_EQUIPMENT_ROLE');
});

test('high scores cannot buy a missing heavy route or violate equipment exclusivity', () => {
  const data = request(); data.ordinary = base(104); data.gates.heavy_pair = {status: 'UNKNOWN'};
  assert.equal(summarizeLoadout(data).eligible_for_draw, false);
  data.gates.legality = {status: 'FAIL'};
  assert.equal(summarizeLoadout(data).status, 'FAIL');
});

test('a failed incomplete search stays unknown and uncalibrated arithmetic never certifies a loadout', () => {
  const data = request(); data.ordinary = base(10); data.coverage_complete.chaff = false; data.coverage_complete.close_defense = false;
  assert.equal(summarizeLoadout(data).status, 'UNKNOWN');
  assert.equal(summarizeLoadout(request()).status, 'ESTIMATED_PASS');
  assert.equal(summarizeLoadout({...request(), calibration_ready: true}).eligible_for_draw, true);
});

test('display compression preserves every pass threshold below 100 and has no overpowered-loadout veto', () => {
  assert.equal(displayScore(60), 60); assert.equal(displayScore(100), 100);
  assert.ok(displayScore(500) > displayScore(110)); assert.ok(displayScore(500) < 105);
  const data = request(); data.ordinary = base(1000); data.calibration_ready = true;
  assert.equal(summarizeLoadout(data).eligible_for_draw, true);
});

test('each final dimension independently blocks admission below 60 despite five strong dimensions', () => {
  const allRoles = [...roles, 'anti_heavy', 'endurance', 'demolition'];
  for (const weakRole of allRoles) for (const score of [0, 59.99, null]) {
    const data = request();
    data.thresholds = Object.fromEntries(allRoles.map(role => [role, 60]));
    data.coverage_complete = Object.fromEntries(allRoles.map(role => [role, false]));
    data.ordinary = allRoles.map(role => ({equipment_id:'fixture', role,
      score:role === weakRole ? score : 100, state:'ENGINEERING_ESTIMATE'}));
    const result = summarizeLoadout(data);
    assert.notEqual(result.numeric_status, 'PASS', `${weakRole}=${score}`);
    assert.ok(result.missing.includes(weakRole));
    data.ordinary.find(r => r.role === weakRole).score = 60;
    assert.equal(summarizeLoadout(data).numeric_status, 'PASS', weakRole);
  }
});

test('final score adjustments reclassify admission without bypassing physical gates', () => {
  const data = request();
  data.thresholds.endurance = 60;
  data.ordinary.push({equipment_id:'routine',role:'endurance',score:20,state:'ENGINEERING_ESTIMATE'});
  const result = summarizeLoadout(data);
  assert.ok(result.missing.includes('endurance'));
  result.dimensions.endurance.score = 100;
  const supplied = finalizeAssessmentSummary(result);
  assert.equal(supplied.dimensions.endurance.status, 'PASS');
  assert.equal(supplied.numeric_status, 'PASS');
  assert.deepEqual(supplied.missing, []);
  supplied.gates.heavy_pair = 'UNKNOWN';
  const incomplete = finalizeAssessmentSummary(supplied);
  assert.equal(incomplete.numeric_status, 'UNKNOWN');
  assert.deepEqual(incomplete.missing, ['heavy_pair']);
});
