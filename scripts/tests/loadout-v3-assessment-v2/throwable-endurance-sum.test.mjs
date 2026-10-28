import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {throwableEndurance,totalDamageEndurance,nominalAmmo} from '../../../shared/hd2-loadout/assessment-v2/endurance-total.mjs';
import {contributionScore} from '../../../shared/hd2-loadout/assessment-v2/score-scale.mjs';
import {contributionKind} from '../../../shared/hd2-loadout/assessment-v2/manual-scores.mjs';
import {summarizeLoadout} from '../../../shared/hd2-loadout/assessment-v2/aggregate.mjs';
import {evaluateAssessment} from '../../../shared/hd2-loadout/assessment-v2/evaluate.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../../../'+p,import.meta.url)));
const model=read('shared/hd2-loadout/assessment-v2/equipment.json'),catalog=read('shared/hd2-loadout/data/catalog.json');
const get=id=>model.equipment.find(r=>r.equipment_id===id);
const final=n=>contributionScore(n,undefined,model.scenario.score_scale);
const custom=(carried,refill)=>{const r=structuredClone(get('g_4_gas'));
  r.facts.service_inventory={kind:'finite',capacity:carried,reserve:0,total:carried,feed:'loose'};
  r.facts.service_refill={public:refill,portable:refill};return r;};

test('4 carried plus 2 refill is display 60; refill improves score more than equal added carry',()=>{
  const base=throwableEndurance(custom(4,2),model);
  assert.equal(base.scenarios.public.rounds,6);
  assert.equal(final(base.score),60);
  assert.equal(base.scenarios.public.weighted_uses,8);
  assert.ok(throwableEndurance(custom(4,3),model).score>throwableEndurance(custom(5,2),model).score);
  assert.ok(base.scenarios.initial.score<base.score);
});
test('stock score is independent of blast, fire, poison, control or weapon damage',()=>{
  const a=custom(4,2),b=structuredClone(a);b.facts.modes=[];b.facts.effects=[];
  b.utility={combat_damage:false};b.endurance={state:'NOT_APPLICABLE'};
  assert.deepEqual(totalDamageEndurance(b,null,model),throwableEndurance(a,model));
});
test('public, pack and vehicle are finite supplies; weighted uses never change real stock',()=>{
  const r=throwableEndurance(custom(4,2),model);
  assert.deepEqual(Object.values(r.scenarios).map(s=>s.rounds),[4,6,16,22]);
  assert.deepEqual(Object.values(r.scenarios).map(s=>s.replenished),[0,2,12,18]);
  assert.equal(r.scenarios.pack.weighted_uses,28);
  assert.equal(r.scenarios.vehicle.weighted_uses,40);
  const limited=nominalAmmo({loaded:2,reserve:0,capacity:2,feed:'loose',refill:{public:20}},
    [{kind:'public',charges:1,refill_kind:'public',ready_at_ms:0}]);
  assert.equal(limited.rounds,4);
});
test('missing refill stays unknown; no public box leaves only initial stock',()=>{
  const row=custom(4,2);row.facts.service_refill.public=null;
  const r=throwableEndurance(row,model);assert.equal(r.score,null);assert.equal(r.scenarios.public.rounds,null);
  assert.equal(r.scenarios.initial.rounds,4);
  const noPublic=structuredClone(model);noPublic.scenario.supply.public_boxes=0;
  const n=throwableEndurance(custom(4,2),noPublic);
  assert.equal(n.scenarios.public.rounds,4);assert.equal(n.scenarios.pack.rounds,12);
});
test('every throwable uses stock scoring, including utility grenades; red-green remains zero',()=>{
  const rows=model.equipment.filter(r=>r.category==='throwables');assert.equal(rows.length,24);
  for(const row of rows){const r=throwableEndurance(row,model);
    assert.equal(row.endurance.rating.kind,'THROWABLE_AVAILABLE_USES',row.equipment_id);
    assert.ok(Number.isFinite(r.score),row.equipment_id);
    assert.equal(r.scenarios.public.rounds,r.carried+Math.min(r.carried,r.refill_per_box.public));
  }
  for(const row of model.equipment.filter(r=>['orbital','eagle','deployable'].includes(r.category)))assert.equal(row.endurance.score,0);
});
test('heavy and demolition sum final scores without compression or second rescaling; other roles keep best',()=>{
  const gates=Object.fromEntries(['legality','heavy_pair','demolition','shared_resources','close_safety'].map(k=>[k,{status:'PASS'}]));
  const ordinary=['chaff','anti_heavy','demolition'].flatMap(role=>['a','b'].map(equipment_id=>({equipment_id,role,
    state:'MANUAL_CALIBRATED',score_origin:'MANUAL_CALIBRATED',score:80})));
  const r=summarizeLoadout({ordinary,gates,thresholds:{chaff:60,close_defense:0,anti_medium:null,anti_heavy:null,demolition:null},
    score_scale:model.scenario.score_scale});
  assert.equal(r.dimensions.chaff.score,80);
  for(const role of ['anti_heavy','demolition']){assert.equal(r.dimensions[role].score,160);
    for(const mode of ['auto','base','additive'])assert.equal(contributionKind({manual_calibration:{mode}},role),'AUXILIARY_ADDITION');}
  const unknown=summarizeLoadout({ordinary:[...ordinary,{equipment_id:'c',role:'anti_heavy',score:null,state:'UNRESOLVED'}],
    gates:{...gates,heavy_pair:{status:'UNKNOWN'}},thresholds:{chaff:60,close_defense:0,anti_medium:null,anti_heavy:null,demolition:null}});
  assert.equal(unknown.numeric_status,'UNKNOWN');assert.equal(unknown.dimensions.anti_heavy.score,160);
});
test('end-to-end final heavy/demolition scores add once; score changes do not bypass physical gates',()=>{
  const kit={primary:'plas_1_scorcher',secondary:'gp_20_ultimatum',grenade:'g_48_giga_grenade',
    stratagems:['support_spear','backpack_b_1_supply_pack','deployable_gas_mines','deployable_flame_sentry']};
  const before=evaluateAssessment(kit,model,catalog),changed=structuredClone(model);
  const row=changed.equipment.find(r=>r.equipment_id===kit.primary);
  row.manual_calibration={...row.manual_calibration,mode:'base',scores:{...row.manual_calibration?.scores,anti_heavy:80,demolition:80}};
  for(const t of [row.heavy_assessment,row.demolition_assessment]){t.score=80;t.score_origin='MANUAL_CALIBRATED';}
  const grenade=changed.equipment.find(r=>r.equipment_id===kit.grenade);
  grenade.manual_calibration={...grenade.manual_calibration,mode:'additive',scores:{...grenade.manual_calibration?.scores,endurance:105}};
  grenade.endurance.score=105;grenade.endurance.score_origin='MANUAL_CALIBRATED';
  const after=evaluateAssessment(kit,changed,catalog);
  for(const role of ['anti_heavy','demolition']){
    const dim=after.dimensions[role];assert.equal(dim.contributions.length,7);
    assert.equal(dim.score,dim.contributions.reduce((s,c)=>s+c.value,0));
    assert.equal(dim.contributions.filter(c=>c.equipment_id===kit.primary).length,1);
    assert.equal(dim.contributions.find(c=>c.equipment_id===kit.primary).value,80);
  }
  for(const gate of ['legality','heavy_pair','demolition'])assert.deepEqual(after.gates[gate],before.gates[gate]);
  assert.equal(after.dimensions.endurance.score,before.dimensions.endurance.score);
  assert.ok(!after.dimensions.endurance.contributions.some(c=>c.equipment_id===kit.grenade));
  assert.equal(after.throwable_endurance[0].score,105);
});
