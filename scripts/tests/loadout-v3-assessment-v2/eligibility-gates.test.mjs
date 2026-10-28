import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {restoreCalculatedScores} from './automatic-model.mjs';
import {heavyEligibility} from '../../../shared/hd2-loadout/assessment-v2/heavy-eligibility.mjs';
import {heavyRoutes,assessHeavyPairs} from '../../../shared/hd2-loadout/assessment-v2/engagement.mjs';
import {equipmentHeavy} from '../../../shared/hd2-loadout/assessment-v2/equipment-review.mjs';
import {demolitionCapability,demolitionRoutes,demolitionResources,assessFiveHoles} from '../../../shared/hd2-loadout/assessment-v2/demolition.mjs';
import {executeResourcePlan} from '../../../shared/hd2-loadout/assessment-v2/resources.mjs';
const m=JSON.parse(readFileSync(new URL('../../../shared/hd2-loadout/assessment-v2/equipment.json',import.meta.url)));
restoreCalculatedScores(m);
const row=id=>m.equipment.find(r=>r.equipment_id===id);

test('every known below-heavy weapon has zero anti-heavy score and cannot pay the heavy gate',()=>{
  const below=m.equipment.filter(r=>heavyEligibility(r,m).state==='BELOW_THRESHOLD');
  assert.ok(below.length>40);
  for(const r of below){assert.equal(r.heavy_assessment.score,0,r.equipment_id);
    for(const id of m.scenario.heavy_targets)assert.deepEqual(heavyRoutes(r,id,m),[],r.equipment_id);}
  const r=structuredClone(row('plas_1_scorcher'));
  r.facts.effects=[{id:'Fire',pen:10,normal:10000,durable:10000}];
  assert.equal(equipmentHeavy(r,m).score,0,'status penetration is not the weapon gate');
  assert.notEqual(assessHeavyPairs([r],m).status,'PASS');
});

test('AP4 direct weapons need no Anti-Tank label but penetration alone does not guarantee double kills',()=>{
  const r=structuredClone(row('heavy_support_ac_8_autocannon'));
  for(const mode of r.facts.modes)mode.traits='';
  assert.equal(heavyEligibility(r,m).state,'ELIGIBLE');
  assert.ok(heavyRoutes(r,'bile_titan',m).length>0);
  Object.assign(r.facts.inventory,{capacity:1,reserve:0,total:1});r.facts.refill={public:0,portable:0};
  assert.notEqual(assessHeavyPairs([r],m).status,'PASS');
});

test('heavy explosion qualifies despite low carrier AP, and confirmed thermite/Ultimatum kills survive',()=>{
  const giga=row('g_48_giga_grenade');
  assert.equal(giga.facts.service_modes[0].pen,0);
  assert.ok(heavyEligibility(giga,m).qualifying_components.some(c=>c.channel==='explosion'));
  for(const id of ['g_123_thermite','gp_20_ultimatum']) {
    assert.ok(row(id).heavy_assessment.score>0);
    assert.ok(heavyRoutes(row(id),'bile_titan',m).length>0);
  }
});

test('one 40-force direct OR blast component qualifies; force is not summed or borrowed from status/backblast',()=>{
  const r=structuredClone(row('ar_23_liberator'));
  const component=(attack_type,force,extra={})=>({component_id:attack_type,attack_type,force,backblast:false,...extra});
  for(const kind of ['projectile','explosion']) {
    r.facts.demolition_components=[component(kind,40)];assert.equal(demolitionCapability(r).qualifies,true);
  }
  r.facts.demolition_components=[component('projectile',21),component('explosion',19)];
  assert.equal(demolitionCapability(r).qualifies,false,'21+19 cannot be aggregated into one 40-force contact');
  r.facts.demolition_components=[component('status',100),component('explosion',100,{backblast:true})];
  assert.equal(demolitionCapability(r).qualifies,false);
});

test('40-force red calls bypass name whitelist and unknown fuse only for inventory; all uses remain finite',()=>{
  for(const id of ['eagle_500kg_bomb','eagle_cluster_bomb','eagle_110mm_rocket_pods','orbital_120mm_he_barrage']) {
    const r=row(id),route=demolitionRoutes(r,m.scenario)[0],stock=demolitionResources([r]);
    const count=r.category==='orbital'?1:r.strategic_profile.uses;
    assert.ok(route.inventory_only);assert.equal(r.demolition_assessment.best.scoring.public.completed_actions,count);
    assert.equal(r.demolition_assessment.best.public.elapsed_ms,null);
    const run=executeResourcePlan({weapons:stock,providers:[],steps:Array.from({length:count+1},()=>route)});
    assert.equal(run.status,'INSUFFICIENT');assert.equal(run.completed_steps,count);
  }
  const plan=assessFiveHoles([row('eagle_cluster_bomb')],m);
  assert.equal(plan.status,'PASS');assert.match(plan.timing_status,/INVENTORY_ONLY/);
});

test('40-force capability is visible without invented stock; green demolition stays zero',()=>{
  for(const id of ['backpack_b_100_portable_hellbomb']) {
    const d=row(id).demolition_assessment;
    assert.equal(d.capability.qualifies,true);assert.equal(d.state,'CAPABLE_STOCK_UNRESOLVED');assert.equal(d.score,null);
  }
  for(const r of m.equipment.filter(r=>r.category==='deployable'))assert.equal(demolitionCapability(r).qualifies,false);
  assert.ok(row('vehicle_td_220_bastion_mk_xvi').demolition_assessment.score>0);
  assert.equal(demolitionRoutes(row('vehicle_m_103_supply_fast_recon_vehicle'),m.scenario).length,0);
});
