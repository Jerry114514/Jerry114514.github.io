import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeLoadout, displayScore} from '../../../shared/hd2-loadout/assessment-v2/aggregate.mjs';
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
