import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {projectileService} from '../../../shared/hd2-loadout/assessment-v2/projectile.mjs';
import {mediumResponse} from '../../../shared/hd2-loadout/assessment-v2/handling.mjs';
import {actionsFor, resourceWeapons} from '../../../shared/hd2-loadout/assessment-v2/engagement.mjs';
import {executeResourcePlan} from '../../../shared/hd2-loadout/assessment-v2/resources.mjs';
const m = JSON.parse(readFileSync(new URL('../../../shared/hd2-loadout/assessment-v2/equipment.json', import.meta.url)));
const row = id => m.equipment.find(r => r.equipment_id === id);
const head = m.targets['alpha_commander:head'], main = m.targets['alpha_commander:main'];
const measure = (id, {policy = m.scenario.medium_resolution, mode, target = head, rounds} = {}) =>
  projectileService(mode ?? row(id).facts.modes[0], [{target, count: 1, acquire_multiplier: 2,
    explosion_resistance: 1, resolution: {main, policy}, ...(rounds ? {burst_rounds: rounds} : {})}], m.ap,
  {handling_policy: m.scenario.handling});

test('commander head break is not death; constitution decays after the real break event', () => {
  const hit = measure('br_14_adjudicator');
  assert.equal(hit.shots, 6);
  assert.equal(hit.first_part_break_ms, 1185);
  assert.equal(hit.neutralized_at_ms, 4185);
  const response = mediumResponse(hit, m.scenario.medium_response);
  assert.equal(response.first_part_break_ms, 1185);
  assert.equal(response.effective_response_ms, 4185);
  assert.equal(response.rapid, false);
  assert.ok(response.repeat_cycle_ms < response.effective_response_ms, 'bleed does not lock the hands');
});

test('follow-up bullets reduce constitution alongside natural decay and are not free', () => {
  const hit = measure('br_14_adjudicator', {rounds: 12});
  assert.equal(hit.shots, 12);
  assert.equal(hit.first_part_break_ms, 1185);
  assert.equal(hit.first_to_last_ms, 1845);
  assert.equal(hit.neutralized_at_ms, 1845);
  assert.equal(hit.entries[0].resolution.constitution.after_burst_hp, 0);
  const chosen = row('br_14_adjudicator').capabilities.modes[0].anti_medium[0];
  assert.equal(chosen.shots, 12);
  assert.equal(chosen.route.burst_policy, 'FOLLOWUP_ON_CONSTITUTION_ZONE');
});

test('bound S11 cleave hits Main once, separately from head transfer, with one ammunition debit', () => {
  const yes = measure('support_spear');
  const no = measure('support_spear', {policy: {...m.scenario.medium_resolution, cleave_routes: {}}});
  const y = yes.entries[0].resolution, n = no.entries[0].resolution;
  assert.equal(yes.shots, 1);
  assert.equal(y.main_damage.transferred, 387);
  assert.equal(y.main_damage.cleave, 387);
  assert.equal(y.main_after_shots, 226);
  assert.equal(n.main_after_shots, 613);
  assert.equal(n.main_damage.cleave, 0);
  assert.equal(y.death_ms, n.death_ms, 'this real route still dies from bleed first');
  assert.equal(y.effective_response_ms, n.effective_response_ms, 'control advantage does not rely on disputed extra damage');
});

test('gas damages Main only; confusion lowers residual threat without forging an early death', () => {
  const on = measure('support_spear');
  const off = measure('support_spear', {policy: {...m.scenario.medium_resolution,
    gas_control: {...m.scenario.medium_resolution.gas_control, residual_threat_fraction: 1}}});
  assert.equal(on.first_part_break_ms, 642);
  assert.equal(on.neutralized_at_ms, 3642);
  assert.equal(on.effective_response_ms, 1212);
  assert.equal(off.neutralized_at_ms, on.neutralized_at_ms);
  assert.equal(off.effective_response_ms, 3642);
  const resolution = on.entries[0].resolution;
  assert.equal(resolution.main_damage.gas_before_death, 75);
  assert.equal(resolution.control.is_hard_stun, false);
  assert.equal(resolution.constitution.after_break_hp, 300);
});

test('expired or delayed confusion does not protect the entire bleed period', () => {
  const gun = structuredClone(row('support_spear').facts.modes[0]);
  gun.direct_status_effects.find(e => e.id === 'Gas_Confusion').duration_s = .5;
  const short = measure('support_spear', {mode: gun});
  assert.equal(short.entries[0].resolution.control.covered_residual_ms, 200);
  assert.equal(short.effective_response_ms, 3462);
  const late = measure('support_spear', {policy: {...m.scenario.medium_resolution,
    gas_control: {...m.scenario.medium_resolution.gas_control, onset_delay_ms: 4000}}});
  assert.equal(late.effective_response_ms, late.neutralized_at_ms);
});

test('unknown constitution is not silently interpreted as no residual threat', () => {
  assert.equal(measure('support_spear', {target: {...head, constitution: null}}).status, 'UNKNOWN');
});

test('a same-hit overflow assumption is explicit and separate from cleaving', () => {
  const policy = {...m.scenario.medium_resolution, overflow_to_constitution: true, cleave_routes: {}};
  const hit = measure('support_spear', {policy});
  assert.equal(hit.entries[0].resolution.constitution.after_break_hp, 163);
  assert.equal(hit.neutralized_at_ms, 2272);
  assert.equal(hit.entries[0].resolution.main_damage.cleave, 0);
});

test('Scorcher body destruction bypasses head constitution without injecting explosion damage into its head', () => {
  const hit = row('plas_1_scorcher').capabilities.modes[0].anti_medium[0];
  assert.equal(hit.shots, 8);
  assert.equal(hit.route.measured_target, 'alpha_commander:main');
  assert.equal(hit.neutralized_at_ms, 1504);
  assert.equal(hit.effective_response_ms, 1504);
  const headHit = measure('plas_1_scorcher');
  assert.equal(headHit.shots, 6);
  assert.equal(headHit.entries[0].resolution.packet.local, 42);
  assert.equal(headHit.entries[0].resolution.main_damage.redirected_blast, 600);
  assert.equal(headHit.neutralized_at_ms, 4460);
});

test('the resource plan pays shots and reloads while previous targets bleed independently', () => {
  const spear = row('support_spear');
  const steps = actionsFor(spear, [{target: head, count: 2}], m.ap, m.scenario, m.targets);
  const result = executeResourcePlan({weapons: resourceWeapons([spear]), providers: [], steps});
  assert.equal(result.status, 'COMPLETED');
  assert.deepEqual(result.step_last_shot_ms, [642, 2892]);
  assert.equal(result.elapsed_ms, 5892);
  assert.equal(result.state.resources['ammo:support_spear'].value, 11);
  assert.equal(steps[0].effect_delay_ms, 3000);
});
