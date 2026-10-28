import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scoreOrdinary, projectileService} from '../../../shared/hd2-loadout/assessment-v2/projectile.mjs';
import {combinedMedium} from '../../../shared/hd2-loadout/assessment-v2/evaluate.mjs';
import {assessMixedEndurance, resourceWeapons} from '../../../shared/hd2-loadout/assessment-v2/engagement.mjs';
import {executeResourcePlan} from '../../../shared/hd2-loadout/assessment-v2/resources.mjs';
import {cloudCloseService} from '../../../shared/hd2-loadout/assessment-v2/cloud.mjs';

const model = JSON.parse(readFileSync(new URL('../../../shared/hd2-loadout/assessment-v2/equipment.json', import.meta.url)));
const row = id => model.equipment.find(r => r.equipment_id === id);

test('medium score and combined loadout use a count-weighted mean, not the weakest enemy', () => {
  const capability = ratios => ({modes: [{mode_id: 'test', anti_medium: model.scenario.medium.map((t, i) => ({
    target_id: t.id, cohort_count: t.count, status: 'ESTIMATE', response: {status: 'ESTIMATE', value: ratios[i]}}))}]});
  const own = capability([2, .5, .5]), reference = capability([1, 1, 1]);
  const score = scoreOrdinary(own, reference, {role: 'anti_medium', primary: true, reference_primary: true});
  assert.equal(score.ratio, (2 * 3 + .5 * 3 + .5 * 2) / 8);
  assert.ok(score.score > 60);
  const mini = {...model, references: {anti_medium: 'ref'}, equipment: [{equipment_id: 'ref', capabilities: reference}]};
  const combined = combinedMedium([{equipment_id: 'own', slot: 'primary', capabilities: own}], mini);
  assert.equal(combined.ratio, score.ratio);
});

test('shared medium gate does not secretly retain a per-enemy floor after mean aggregation', () => {
  const custom = structuredClone(model), mg = row('support_mg_43_machine_gun');
  const reference = custom.equipment.find(r => r.equipment_id === model.references.anti_medium);
  for (const [index, t] of reference.capabilities.modes[0].anti_medium.entries()) {
    const physical = mg.capabilities.modes[0].anti_medium.find(x => x.target_id === t.target_id).response.value;
    t.response.value = physical / (index === 0 ? .5 : 2);
  }
  assert.equal(assessMixedEndurance([mg], custom, {require_role_floors: true}).status, 'PASS');
});

test('Scorcher chooses the large explosive abdomen without borrowing the precise mouth aim cost', () => {
  const scorcher = row('plas_1_scorcher');
  const hit = scorcher.capabilities.modes[0].anti_medium.find(t => t.target_id === 'bile_spewer:head');
  assert.equal(hit.route.kind, 'EXPLOSIVE_BODY');
  assert.equal(hit.route.measured_target, 'bile_spewer:butt');
  assert.equal(hit.route.acquire_multiplier, 1);
  assert.equal(hit.shots, 5);
  assert.equal(hit.entries[0].per_round_damage, 150); // 50 durable direct + 100 explosion.
  assert.equal(hit.first_to_last_ms, 988);
});

test('immune heads never receive explosion damage: a redirected shot attacks Main HP instead', () => {
  const scorcher = row('plas_1_scorcher');
  const directHead = projectileService(scorcher.facts.modes[0], [{target: model.targets['bile_spewer:head'], count: 1,
    explosion_resistance: 1, redirected_explosion_target: model.targets['bile_spewer:main']}], model.ap,
  {handling_policy: model.scenario.handling});
  assert.equal(directHead.entries[0].part_id, 'main');
  assert.equal(directHead.entries[0].damage_route, 'REDIRECTED_EXPLOSION_TO_MAIN');
  assert.equal(directHead.entries[0].per_round_damage, 65);
  assert.equal(directHead.shots, 12); // 750 Main HP, never the immune 300-HP head.
  const commander = projectileService(scorcher.facts.modes[0], [{target: model.targets['alpha_commander:head'], count: 1,
    explosion_resistance: 1}], model.ap, {handling_policy: model.scenario.handling});
  assert.equal(commander.entries[0].per_round_damage, 42);
  assert.equal(commander.shots, 6); // Fits user's 6–8-shot observation; no fabricated multi-part blast.
  const selected = scorcher.capabilities.modes[0].anti_medium.find(t => t.target_id === 'alpha_commander:head');
  assert.equal(selected.route.measured_target, 'alpha_commander:main');
  assert.equal(selected.shots, 8); // Direct body destruction avoids the residual head bleed.
});

test('paid cloud refresh completes the lingering targets without adding gas DPS or another weapon', () => {
  const spear = row('support_spear'), chaff = spear.capabilities.modes[0].chaff;
  assert.equal(chaff.cloud.initial_clouds, 4);
  assert.equal(chaff.cloud.refresh_clouds, 1);
  assert.equal(chaff.shots, 5);
  assert.equal(chaff.cloud.damage_per_second, 25);
  assert.equal(chaff.cloud.status_kills, 24);
  assert.ok(chaff.cloud.targets.every(t => t.status_damage === t.initial_hp && t.remaining_hp === 0));
  const actual = executeResourcePlan({weapons: resourceWeapons([spear]), providers: [], steps: chaff.action_plan});
  assert.equal(actual.status, 'COMPLETED');
  assert.equal(actual.elapsed_ms, chaff.first_to_last_ms);
  assert.equal(actual.step_last_shot_ms[4] - actual.step_last_shot_ms[3], 3000);
  assert.equal(chaff.sustained.pattern_ms, 12000);
  assert.ok(chaff.first_to_last_ms > chaff.sustained.pattern_ms); // First clear still pays poison startup.
});

test('late cloud refresh is rejected rather than pretending there was uninterrupted poison contact', () => {
  const spear = row('support_spear'), weapons = resourceWeapons([spear]);
  weapons[0].reload_ms = 12000;
  const result = executeResourcePlan({weapons, providers: [], steps: spear.capabilities.modes[0].chaff.action_plan});
  assert.equal(result.status, 'UNKNOWN');
  assert.equal(result.reason, 'ACTION_DEPENDENCY_WINDOW_MISSED');
});

test('gas close-defense is a conditional escape, not four instant kills or a guaranteed hard stun', () => {
  const spear = row('support_spear'), close = spear.capabilities.modes[0].close_defense;
  assert.equal(close.kind, 'CONTROL_ESCAPE');
  assert.equal(close.shots, 1);
  assert.equal(close.neutralized_at_ms, null);
  assert.equal(close.first_to_last_ms, null);
  assert.equal(close.safe_escape_ms, 1000);
  assert.ok(close.control.applied_at_ms > 0);
  assert.equal(close.control.counts_as_instant_safety, false);
  const direct = projectileService(spear.facts.modes[0], [{target: model.targets['hunter:main'], count: 4}], model.ap,
    {handling_policy: model.scenario.handling});
  const scattered = {...model.scenario, cloud: {...model.scenario.cloud, close_contact_radii_m: [0, 1, 2, 6]}};
  assert.equal(cloudCloseService(spear.facts, spear.facts.modes[0], scattered, direct), null);
  const late = {...model.scenario, cloud: {...model.scenario.cloud, close_activation_delay_ms: 1000}};
  assert.equal(cloudCloseService(spear.facts, spear.facts.modes[0], late, direct), null);
});
