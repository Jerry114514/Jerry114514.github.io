import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {equipmentHeavy,equipmentDemolition} from '../../../shared/hd2-loadout/assessment-v2/equipment-review.mjs';
import {demolitionRoutes,demolitionResources,assessFiveHoles} from '../../../shared/hd2-loadout/assessment-v2/demolition.mjs';
import {executeResourcePlan} from '../../../shared/hd2-loadout/assessment-v2/resources.mjs';
import {assessStrategic} from '../../../shared/hd2-loadout/assessment-v2/strategic.mjs';
import {evaluateAssessment} from '../../../shared/hd2-loadout/assessment-v2/evaluate.mjs';
const m=JSON.parse(readFileSync(new URL('../../../shared/hd2-loadout/assessment-v2/equipment.json',import.meta.url)));
const row=id=>m.equipment.find(r=>r.equipment_id===id);
test('all 200 rows expose heavy, endurance and demolition states without changing ordinary score API',()=>{
  for(const r of m.equipment){assert.ok(r.heavy_assessment.state);assert.ok(r.endurance.state);assert.ok(r.demolition_assessment.state);
    assert.deepEqual(Object.keys(r.dimensions),['chaff','close_defense','anti_medium']);}
});
test('heavy review executes two targets against real stock in 20 seconds',()=>{
  const h=equipmentHeavy(row('gp_20_ultimatum'),m);
  assert.equal(h.passed_pairs,3);
  assert.ok(h.cases.every(c=>c.best.initial.status==='COMPLETED'&&c.best.public.elapsed_ms<=20000));
  const one=structuredClone(row('gp_20_ultimatum'));
  Object.assign(one.facts.inventory,{capacity:1,reserve:0,total:1});one.facts.refill={public:0,portable:0};
  assert.ok(equipmentHeavy(one,m).cases.every(c=>c.best.public.status!=='COMPLETED'));
});
test('Scorcher exposed Impaler example remains information only below the heavy penetration gate',()=>{
  const h=row('plas_1_scorcher').heavy_assessment;
  assert.equal(h.score,0);assert.equal(h.eligibility.state,'BELOW_THRESHOLD');
  assert.equal(h.incidental_routes[0].target_id,'impaler');assert.equal(h.cases,undefined);
});
test('strategic heavy applies the same curve, CD and class factors and stays a conditional bonus',()=>{
  const r=row('deployable_autocannon_sentry'),h=r.heavy_assessment,c=h.assessment.contribution;
  assert.equal(h.state,'CONDITIONAL_STRATEGIC_BONUS');assert.ok(c.value>0);
  assert.equal(c.value,c.bare_score*c.coverage_value*c.realization_factor*c.operation_factor);
  assert.equal(c.realization_factor,.30);
  const slower=structuredClone(r);slower.strategic_profile.cooldown_s*=2;
  assert.ok(assessStrategic(slower,m,{selected_roles:['anti_heavy']})[0].contribution.value<c.value);
  assert.equal(assessStrategic(r,m).length,2,'advisory heavy is not silently added to ordinary pass gates');
});
test('endurance measures actual separate role waves, including extra midfight supply',()=>{
  const e=row('plas_1_scorcher').endurance;
  const light=e.combat_trials.find(t=>t.role==='chaff'),medium=e.combat_trials.find(t=>t.role==='anti_medium');
  assert.equal(light.rounds_per_wave,28,'dense outer splash reduces paid shots for the 28-enemy cohort');
  assert.equal(light.scenarios.initial.completed_waves,4);assert.equal(medium.scenarios.initial.completed_waves,2);
  assert.equal(light.scenarios.public.completed_waves,4);assert.equal(light.scenarios.public.probe_completed,true);
  const spear=row('support_spear').endurance.combat_trials.find(t=>t.role==='anti_medium');
  assert.equal(spear.scenarios.initial.completed_waves,1);assert.equal(spear.scenarios.public.completed_waves,3);
  assert.equal(spear.scenarios.pack.completed_waves,4);assert.ok(spear.scenarios.pack.supplies_taken.length>0);
  assert.equal(row('heavy_support_gr_8_recoilless_rifle').endurance.combat_trials[0].scenarios.pack.status,'ILLEGAL');
});
test('red endurance reports per-deployment payload and all Eagle uses without folding them twice',()=>{
  const e=row('eagle_airstrike').endurance;
  assert.equal(e.units_per_deployment,7);assert.equal(e.first_cycle_calls,3);
  assert.ok(e.full_deployment_standard_damage>0);assert.equal(e.cooldown_s,120);
});
test('demolition green and low-force weapons are zero; C4 has qualified finite charges without fake timing',()=>{
  for(const r of m.equipment.filter(r=>r.category==='deployable'))assert.equal(r.demolition_assessment.state,'KNOWN_ZERO');
  assert.equal(row('plas_1_scorcher').demolition_assessment.state,'KNOWN_ZERO');
  const c4=row('backpack_b_md_c4_pack').demolition_assessment;
  assert.equal(c4.state,'EXECUTED_INVENTORY');assert.ok(c4.max_demolition_force>=40);
  assert.equal(c4.best.scoring.initial.completed_actions,7);assert.equal(c4.best.scoring.public.completed_actions,8);
  assert.equal(c4.best.public.elapsed_ms,null);
});
test('targeted red demolition spends first-cycle calls and cannot be refilled from a box',()=>{
  const r=row('eagle_airstrike'),s=m.scenario,route=demolitionRoutes(r,s)[0];
  assert.equal(route.rounds,1);
  const result=executeResourcePlan({weapons:demolitionResources([r]),providers:[],steps:Array.from({length:4},()=>route)});
  assert.equal(result.status,'INSUFFICIENT');assert.equal(result.completed_steps,3);
  assert.equal(r.demolition_assessment.best.public.completed_actions,3);
  assert.equal(row('orbital_precision_strike').demolition_assessment.best.public.completed_actions,1);
});
test('five holes can combine held ammunition and paid red calls without free cluster holes',()=>{
  const noBox={...m,scenario:{...m.scenario,supply:{...m.scenario.supply,public_boxes:0}}};
  const one=structuredClone(row('gp_20_ultimatum'));
  const result=assessFiveHoles([one,row('eagle_airstrike')],noBox);
  assert.equal(result.status,'PASS');assert.equal(result.plan.length,5);
  assert.equal(result.plan.filter(p=>p.weapon_id==='eagle_airstrike').length,3);
  assert.equal(result.plan.filter(p=>p.weapon_id==='gp_20_ultimatum').length,2);
});
test('private clock optimization preserves delayed events and does not mutate supplied inventories',()=>{
  const weapons=[{id:'test',loaded:2,capacity:2,reserve:0,reserve_capacity:0,feed:'loose',reload_ms:0,refill:{public:0,portable:0}}];
  const before=structuredClone(weapons);
  const r=executeResourcePlan({weapons,providers:[],targets:{a:{hp:1},b:{hp:1}},steps:['a','b'].map(target_id=>({weapon_id:'test',mode_id:'same',target_id,
    rounds:1,prepare_ms:100,interval_ms:100,effect_delay_ms:500,switch_ms:0}))});
  assert.equal(r.status,'COMPLETED');assert.deepEqual(weapons,before);
  assert.equal(r.state.targets.a.neutralized_at,600);assert.equal(r.state.targets.b.neutralized_at,700);
});
