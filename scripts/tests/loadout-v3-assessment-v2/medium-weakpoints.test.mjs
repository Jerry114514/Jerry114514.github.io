import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ordinaryCapabilities, mediumRequest, projectileService, scoreOrdinary} from '../../../shared/hd2-loadout/assessment-v2/projectile.mjs';
import {actionsFor, resourceWeapons, assessMixedEndurance} from '../../../shared/hd2-loadout/assessment-v2/engagement.mjs';
import {executeResourcePlan} from '../../../shared/hd2-loadout/assessment-v2/resources.mjs';

const model = JSON.parse(readFileSync(new URL('../../../shared/hd2-loadout/assessment-v2/equipment.json', import.meta.url)));
const row = id => model.equipment.find(r => r.equipment_id === id);
const liberator = row('ar_23_liberator'), adjudicator = row('br_14_adjudicator');
const mode = liberator.facts.modes[0];

test('light penetration has explicit lethal frontal routes and stable scenario identities', () => {
  const medium = liberator.capabilities.modes[0].anti_medium;
  assert.deepEqual(medium.map(t => t.target_id), model.scenario.medium.map(t => t.id));
  assert.deepEqual(medium.map(t => t.cohort_count), [3, 3, 2]);
  assert.deepEqual(medium.map(t => t.count), [1, 1, 1]);
  assert.deepEqual(medium.map(t => t.route.measured_target), ['alpha_commander:head', 'hive_guard:main', 'bile_spewer:mouth']);
  assert.deepEqual(medium.map(t => t.shots), [18, 12, 3]); // Commander includes paid post-break shots.
  assert.deepEqual(medium.map(t => t.entries[0].acquire_ms), [600, 600, 1500]);
  assert.equal(liberator.dimensions.anti_medium.state, 'ENGINEERING_ESTIMATE');
  assert.ok(liberator.dimensions.anti_medium.score > 0);
});

test('default penetrable medium heads and close-defense reference remain independent', () => {
  for (const t of adjudicator.capabilities.modes[0].anti_medium) {
    assert.equal(t.route.aim_class, 'PRECISE_PART');
    assert.ok(t.route.acquire_multiplier > 1);
  }
  const changedClose = ordinaryCapabilities(liberator.facts, model.targets, model.ap, {...model.scenario, close_count: 8});
  assert.deepEqual(changedClose.modes[0].anti_medium, liberator.capabilities.modes[0].anti_medium);
  assert.equal(scoreOrdinary(changedClose, adjudicator.capabilities,
    {role: 'anti_medium', primary: true, reference_primary: true}).score, liberator.dimensions.anti_medium.score);
  assert.equal(adjudicator.dimensions.anti_medium.score, 60);
});

test('weakpoint scoring and the finite mixed plan use identical damage, aim costs and shot clocks', () => {
  const requests = [...model.scenario.chaff, ...model.scenario.medium].map(({id, count}) => ({target: model.targets[id], count}));
  const steps = actionsFor(liberator, requests, model.ap, model.scenario, model.targets);
  const result = executeResourcePlan({weapons: resourceWeapons([liberator]), providers: [], steps});
  assert.equal(result.status, 'COMPLETED');
  assert.equal(steps.length, 36);
  const mixed = liberator.capabilities.modes[0].mixed_ammo;
  assert.equal(steps.reduce((n, s) => n + s.rounds, 0), 164);
  assert.equal(result.elapsed_ms, mixed.first_to_last_ms);
  assert.equal(result.state.resources['loaded:ar_23_liberator'].value + result.state.resources['ammo:ar_23_liberator'].value, 405 - 164);
  const guard = steps.find(s => s.assessment_target === 'hive_guard:head');
  assert.equal(guard.measured_target, 'hive_guard:main');
  assert.equal(guard.acquire_ms, 600);
  assert.equal(guard.rounds, 12);
});

test('medium admission compares the scenario enemy even when the chosen lethal part differs', () => {
  const singleMedium = {...model, references: {...model.references, anti_medium: 'ar_23_liberator'},
    scenario: {...model.scenario, medium: [{id: 'bile_spewer:head', count: 2}]}};
  const result = assessMixedEndurance([liberator], singleMedium, {require_role_floors: true});
  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.medium_weapons, ['ar_23_liberator']);
  const mouth = result.first_wave_actions.filter(s => s.assessment_target === 'bile_spewer:head');
  assert.equal(mouth.length, 2);
  assert.ok(mouth.every(s => s.measured_target === 'bile_spewer:mouth'));
});

test('missing or nonfatal weakpoint evidence is unknown and cannot certify the whole medium role', () => {
  for (const replacement of [undefined, {...model.targets['hive_guard:main'], fatal: false}]) {
    const targets = {...model.targets, 'hive_guard:main': replacement};
    const caps = ordinaryCapabilities(liberator.facts, targets, model.ap, model.scenario);
    const guard = caps.modes[0].anti_medium.find(t => t.target_id === 'hive_guard:head');
    assert.equal(guard.status, 'UNKNOWN');
    assert.equal(caps.modes[0].anti_medium[0].status, 'ESTIMATE');
    assert.equal(scoreOrdinary(caps, adjudicator.capabilities, {role: 'anti_medium'}).score, null);
  }
});

test('mouth explosion resistance cannot turn a direct three-shot route into a one-shot explosion route', () => {
  const explosive = {...mode, explosion: {normal: 1000, durable: 1000, pen: 2, pellets: 1}};
  const request = {target: model.targets['bile_spewer:mouth'], count: 1, explosion_resistance: 1};
  const measured = projectileService(explosive, [request], model.ap, {handling_policy: model.scenario.handling});
  assert.equal(measured.status, 'ESTIMATE');
  assert.equal(measured.shots, 3);
  assert.equal(measured.entries[0].per_round_damage, 90);
});

test('weakpoint access changes acquisition and repeated tempo without reducing damage or inventing misses', () => {
  const measure = multiplier => {
    const scenario = {...model.scenario, medium_weakpoints: {...model.scenario.medium_weakpoints, acquire_multiplier: multiplier}};
    return projectileService(mode, [mediumRequest(mode, 'hive_guard:head', model.targets, model.ap, scenario)], model.ap,
      {handling_policy: model.scenario.handling});
  };
  const easy = measure(1), harder = measure(1.15);
  assert.equal(easy.shots, harder.shots);
  assert.equal(easy.entries[0].per_round_damage, harder.entries[0].per_round_damage);
  assert.equal(harder.first_to_last_ms - easy.first_to_last_ms, 45);
  assert.ok(harder.sustained.pattern_ms > easy.sustained.pattern_ms);
});

test('green head and mouth precision floors apply to penetrating guns as well as light guns', () => {
  for (const routeId of ['bile_spewer:head', 'bile_spewer:mouth']) {
    const mouth = routeId.endsWith(':mouth');
    const policy = {...model.scenario.medium_weakpoints, acquire_multiplier: 1,
      alternatives: mouth ? {'bile_spewer:head': {...model.scenario.medium_weakpoints.alternatives['bile_spewer:head'], acquire_multiplier: 1}} : {},
      explosive_body_routes: {}};
    const scenario = {...model.scenario, medium_weakpoints: policy};
    // AP2 cannot use the head; it must choose the mouth. AP3 can use the head.
    const gun = mouth ? mode : adjudicator.facts.modes[0];
    const request = mediumRequest(gun, 'bile_spewer:head', model.targets, model.ap, scenario);
    const hard = projectileService(gun, [request], model.ap, {handling_policy: scenario.handling});
    const easy = projectileService(gun, [{...request, acquire_multiplier: 1}], model.ap, {handling_policy: scenario.handling});
    assert.equal(request.route.measured_target, routeId);
    assert.equal(request.acquire_multiplier, mouth ? 5 : 4);
    assert.equal(hard.shots, easy.shots);
    assert.equal(hard.entries[0].per_round_damage, easy.entries[0].per_round_damage);
    assert.ok(hard.first_to_last_ms > easy.first_to_last_ms);
    assert.ok(hard.sustained.pattern_ms > easy.sustained.pattern_ms);
  }
});

test('all currently selected precise medium routes carry a cost, independent of equipment identity', () => {
  for (const row of model.equipment) for (const mode of row.capabilities.modes ?? []) {
    for (const target of mode.anti_medium ?? []) {
      if (target.status !== 'ESTIMATE') continue;
      if (target.route.aim_class === 'PRECISE_PART') assert.ok(target.route.acquire_multiplier > 1, row.equipment_id);
      if (target.route.measured_target === 'bile_spewer:mouth') assert.ok(target.route.acquire_multiplier >= 5);
      if (target.route.measured_target === 'bile_spewer:head') assert.ok(target.route.acquire_multiplier >= 4);
    }
  }
});
