import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {restoreCalculatedScores} from './automatic-model.mjs';
import {heavyCapacityScore,demolitionCapacityScore} from '../../../shared/hd2-loadout/assessment-v2/dimension-scores.mjs';
import {totalDamageScore,nominalAmmo,totalDamageEndurance} from '../../../shared/hd2-loadout/assessment-v2/endurance-total.mjs';
import {equipmentHeavy} from '../../../shared/hd2-loadout/assessment-v2/equipment-review.mjs';
const m=JSON.parse(readFileSync(new URL('../../../shared/hd2-loadout/assessment-v2/equipment.json',import.meta.url)));
restoreCalculatedScores(m);
const row=id=>m.equipment.find(r=>r.equipment_id===id),mg=row('support_mg_43_machine_gun');

test('heavy scores the 20-second boundary smoothly and rewards faster real double kills',()=>{
  const score=t=>heavyCapacityScore({completed:2,elapsed_ms:t}).score;
  assert.equal(score(20000),60);assert.ok(score(19000)>60);assert.ok(score(21000)<60);
  assert.ok(score(5000)>score(10000));assert.ok(score(5000)<=100);
});
test('one very quick kill is still an ammunition shortage; missing time is unknown',()=>{
  assert.equal(heavyCapacityScore({completed:1,elapsed_ms:1000}).score,15);
  assert.equal(heavyCapacityScore({completed:1,elapsed_ms:100}).score,15);
  assert.equal(heavyCapacityScore({completed:2,elapsed_ms:null}).score,null);
});
test('unknown heavy roster does not divide known performance; sub-heavy guns default to zero',()=>{
  const r=row('g_48_giga_grenade'),h=r.heavy_assessment;
  assert.equal(h.scored_targets,2);assert.equal(h.score_lower_bound,false);
  const own=h.cases.filter(c=>c.best).map(c=>c.best.scoring.public.score);
  assert.ok(Math.abs(h.score-own.reduce((a,b)=>a+b)/own.length)<.01);
  assert.equal(h.coverage_status,'PARTIAL_SAMPLE');
  const withoutUnknown={...m,scenario:{...m.scenario,heavy_targets:['charger_behemoth','impaler']}};
  assert.equal(equipmentHeavy(r,withoutUnknown).score,h.score);
  assert.equal(mg.heavy_assessment.score,0);assert.equal(row('plas_1_scorcher').heavy_assessment.score,0);
});
test('demolition has a five-hole reference and diminishing extra-stock returns',()=>{
  assert.equal(demolitionCapacityScore(0).score,0);assert.equal(demolitionCapacityScore(5).score,60);
  assert.equal(demolitionCapacityScore(20).score,100);assert.ok(demolitionCapacityScore(25).score<105);
  assert.equal(row('eagle_airstrike').demolition_assessment.score,21.6);
  assert.equal(row('orbital_precision_strike').demolition_assessment.score,2.4);
  for(const r of m.equipment.filter(r=>r.category==='deployable'))assert.equal(r.demolition_assessment.score,0);
});
test('total-ammo scoring is independent of enemies, BTK, reload and heavy routes',()=>{
  const r=structuredClone(row('plas_1_scorcher')),model=structuredClone(m);
  model.targets={};model.scenario.chaff=[];model.scenario.medium=[];
  r.capabilities={};r.heavy_assessment={};r.facts.reload_ms=999999;
  const rated=totalDamageEndurance(r,row('ar_23_liberator'),model);
  assert.equal(rated.score,r.endurance.score);assert.equal(rated.scenarios.public.standard_damage,220*200);
  assert.equal(rated.selected_role,undefined);
});
test('fixed total-damage scale is monotonic for each finite supply variant',()=>{
  assert.equal(row('ar_23_liberator').endurance.score,60);assert.ok(mg.endurance.score>60);
  for(const r of m.equipment){const s=r.endurance.rating?.scenarios;if(!s)continue;
    if(Number.isFinite(s.initial.score)&&Number.isFinite(s.public.score))assert.ok(s.public.score>=s.initial.score,r.equipment_id);
    for(const k of ['pack','vehicle'])if(Number.isFinite(s[k].score)&&Number.isFinite(s.public.score))assert.ok(s[k].score>=s.public.score,r.equipment_id+k);
  }
});
test('raw full-stock arithmetic includes loaded ammunition and one public box exactly once',()=>{
  const e=mg.endurance,r=e.rating.scenarios;
  assert.equal(r.initial.rounds,700);assert.equal(r.public.rounds,1225);
  assert.equal(r.public.standard_damage,1225*90);assert.equal(r.public.durable_damage,1225*23);
  assert.equal(totalDamageScore(68850,68850),60);assert.equal(totalDamageScore(null,68850),null);
  assert.ok(totalDamageScore(68850*2,68850)>60);assert.ok(totalDamageScore(68850*100,68850)<105);
});
test('more total ammunition raises the score without a four-wave probe ceiling',()=>{
  const r=structuredClone(mg),inv=r.facts.service_inventory??r.facts.inventory;
  inv.total+=inv.capacity;inv.reserve+=inv.capacity;
  const better=totalDamageEndurance(r,row('ar_23_liberator'),m);assert.ok(better.score>mg.endurance.score);
});
test('nominal ammunition ignores reload time while preserving finite supply and compatibility',()=>{
  const weapon={id:'a',loaded:10,reserve:20,capacity:10,reserve_capacity:20,feed:'magazine',reload_ms:null,refill:{public:100,portable:10}};
  const providers=[{kind:'public',charges:1,refill_kind:'public',ready_at_ms:0,refills_pack:true},
    {kind:'backpack',charges:4,refill_kind:'portable',ready_at_ms:0}];
  assert.equal(nominalAmmo(weapon,providers).rounds,100);
  const bad=structuredClone(weapon);bad.refill.portable=null;assert.equal(nominalAmmo(bad,providers).rounds,null);
  assert.equal(row('heavy_support_gr_8_recoilless_rifle').endurance.rating.scenarios.pack.score,null);
});
test('all red and green endurance scores are zero even if their payload profile is missing',()=>{
  for(const r of m.equipment.filter(r=>['orbital','eagle','deployable'].includes(r.category))) {
    assert.equal(r.endurance.score,0,r.equipment_id);
    const copy={...r,strategic_profile:null};
    assert.equal(totalDamageEndurance(copy,null,{}).score,0);
    assert.ok(Object.values(r.endurance.rating.scenarios).every(s=>s.score===0));
  }
  assert.equal(row('backpack_b_1_supply_pack').endurance.rating.kind,'SUPPLY_TOTAL_DAMAGE_REFERENCE');
});

test('slightly steeper endurance curve preserves reference and ceiling',()=>{
  const old=x=>totalDamageScore(x,1,{steepness:1}),now=x=>totalDamageScore(x,1);
  assert.equal(now(1),60);assert.equal(now(0),0);
  assert.ok(now(.8)<old(.8));assert.ok(now(1.2)>old(1.2));assert.ok(now(100)<105);
});
