import test from 'node:test';
import assert from 'node:assert/strict';
import {capacityCurve, coverageValue, strategicContribution} from '../../../shared/hd2-loadout/assessment-v2/formulas.mjs';
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const sample = () => ({
  capacity: {available: 40, reference: 10, unit: 'synthetic-targets', reference_id: 'synthetic-case'},
  coverage: {family: 'green', duration_s: 30, cooldown_s: 120, delay_s: 5},
  realization_class: 'automatic_turret',
});

test('a bundled category factor cannot charge again for a loss already simulated in its payload or coverage', () => {
  const data = sample(); data.capacity.applied_losses = ['terrain_obstruction'];
  assert.equal(strategicContribution(data).reason, 'REALIZATION_LOSS_ALREADY_APPLIED');
  delete data.capacity.applied_losses;
  data.realization_class = 'laser_turret'; data.coverage.applied_losses = ['overheat_self_destruction'];
  assert.equal(strategicContribution(data).reason, 'REALIZATION_LOSS_ALREADY_APPLIED');
});

test('capacity curve is monotone, joins smoothly and only exceeds 100 above ratio 4', () => {
  near(capacityCurve(0), 0); near(capacityCurve(1), 60); near(capacityCurve(4), 100);
  let previous = -1;
  for (let n = 0; n <= 1000; n++) {
    const r = n / 100, score = capacityCurve(r);
    assert.ok(score > previous && score <= 105);
    assert.equal(score > 100, r > 4); previous = score;
  }
  const h = 1e-7;
  assert.ok(Math.abs((capacityCurve(1) - capacityCurve(1 - h)) / h - 120) < 0.001);
  assert.ok(Math.abs((capacityCurve(1 + h) - capacityCurve(1)) / h - 120) < 0.001);
  assert.ok(capacityCurve(Number.MAX_VALUE) <= 105);
  for (const value of [-1, NaN, Infinity, null, undefined]) assert.throws(() => capacityCurve(value));
});

test('moderate deficits soften without promoting a sub-reference capacity to passing', () => {
  near(capacityCurve(.5), 15);
  near(capacityCurve(.8), 38.4);
  near(capacityCurve(.9), 48.6);
  assert.ok(capacityCurve(.99) < 60);
  assert.ok(capacityCurve(1.01) > 60);
});

test('orbital coverage includes effect, cooldown and delay exactly once', () => {
  near(coverageValue({family: 'orbital', duration_s: 20, cooldown_s: 90, delay_s: 10}).value, 1 / 6);
  assert.equal(coverageValue({family: 'orbital', duration_s: null, cooldown_s: 90, delay_s: 10}).status, 'UNKNOWN');
});

test('green cooldown overlaps work; sufficient working time also covers next deployment delay', () => {
  near(coverageValue({family: 'green', duration_s: 60, cooldown_s: 100, delay_s: 20}).value, 0.5);
  near(coverageValue({family: 'green', duration_s: 120, cooldown_s: 100, delay_s: 20}).value, 1);
  near(coverageValue({family: 'green', duration_s: 150, cooldown_s: 100, delay_s: 20}).value, 1);
  near(coverageValue({family: 'green', duration_s: 0, cooldown_s: 0, delay_s: 0}).value, 0);
});

test('eagle accounts for N calls, N-1 small cooldowns and one depleted rearm', () => {
  const input = {family: 'eagle', uses: 3, small_cd_s: 10, effective_work_s:10, cooldown_s: 120, delay_s: 2};
  near(coverageValue(input).value, 30 / (30 + 120 + 20 + 2));
  near(coverageValue({...input, uses: 1}).value, 10 / (10+122));
  near(coverageValue({...input, uses: 0}).value, 0);
  assert.ok(coverageValue({...input, small_cd_s: 20}).value < coverageValue(input).value);
  assert.equal(coverageValue({...input, effective_work_s: null}).status, 'UNKNOWN');
  assert.equal(coverageValue({...input,effective_work_s:0}).value,0);
});

test('CD and delay changes affect coverage, without modifying bare capacity or realization', () => {
  const first = strategicContribution(sample());
  const input = sample(); input.coverage.cooldown_s = 240;
  const second = strategicContribution(input);
  assert.equal(first.bare_score, second.bare_score);
  assert.equal(first.realization_factor, second.realization_factor);
  assert.ok(first.value > second.value);
  near(first.value, 100 * (30 / 125) * 0.30);
});

test('laser and gas mines use their own k without stacking parent category factors', () => {
  near(strategicContribution({...sample(), realization_class: 'laser_turret'}).value, 100 * (30 / 125) * 0.10);
  near(strategicContribution({...sample(), realization_class: 'gas_mines'}).value, 100 * (30 / 125) * 0.55);
  near(strategicContribution({realization_class: 'smoke'}).value, 0);
});

test('manual operation factor has no invented default and does not apply to automatic equipment', () => {
  assert.equal(strategicContribution({...sample(), manual: true}).status, 'UNKNOWN');
  near(strategicContribution({...sample(), manual: true, operation_factor: 0.7}).value,
    strategicContribution(sample()).value * 0.7);
  assert.equal(strategicContribution({...sample(), operation_factor: 0.7}).status, 'UNKNOWN');
});

test('old points and the retired 0.6 multiplier cannot be accepted as new inputs', () => {
  for (const key of ['raw_score', 'score', 'legacy_score', 'strategic_multiplier']) {
    assert.equal(strategicContribution({...sample(), [key]: 0}).reason, 'LEGACY_SCORE_INPUT_FORBIDDEN');
  }
  assert.equal(strategicContribution({...sample(), capacity: {available: 60, reference: 60}}).status, 'UNKNOWN');
  const zero = sample(); zero.capacity.available = 0;
  near(strategicContribution(zero).value, 0);
  const missing = sample(); missing.capacity.available = null;
  assert.equal(strategicContribution(missing).status, 'UNKNOWN');
});
