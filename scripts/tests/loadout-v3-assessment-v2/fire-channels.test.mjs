import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {combatComponentDamage,combatShotDamage} from '../../../shared/hd2-loadout/assessment-v2/elemental-damage.mjs';
import {statusApplications} from '../../../shared/hd2-loadout/assessment-v2/facts.mjs';
import {groundContactFire,boundFire} from '../../../shared/hd2-loadout/assessment-v2/status.mjs';
import {areaChaffService} from '../../../shared/hd2-loadout/assessment-v2/area.mjs';
const m=JSON.parse(readFileSync(new URL('../../../shared/hd2-loadout/assessment-v2/equipment.json',import.meta.url)));
const row=id=>m.equipment.find(r=>r.equipment_id===id);
const target={...m.targets['hunter:main'],armor:0,durable:0,fire_multiplier:0.5};
const fire={id:'Fire',normal:100,durable:100,pen:4,duration_s:3};

test('fire damage receives target and ship multipliers once; physical projectile remains physical',()=>{
 const c={normal:100,durable:100,pen:4,element:'Fire',fire_module_multiplier:1.25};
 assert.equal(combatComponentDamage(c,target,m.ap).damage,62);
 assert.equal(combatComponentDamage({...c,normal:125,durable:125,source_fire_module_multiplier:1.25},target,m.ap).damage,62);
 const physical={normal:100,durable:100,pen:4,pellets:1,element:'Ballistic',fire_module_multiplier:1.25};
 assert.equal(combatShotDamage(physical,target,m.ap).per_shot_damage,100);
 assert.equal(combatComponentDamage(c,{...target,fire_multiplier:undefined},m.ap).status,'UNKNOWN_DATA');
});

test('each repeated status strength binds to its own effect',()=>{
 const heavy={id:'BurningHeavy',normal:200,durable:200,pen:4,duration_s:1};
 const got=statusApplications([{key:'aoe_effect_status',raw:'Fire'},{key:'aoe_effect_status_strength',raw:'100'},
 {key:'second_status',raw:'BurningHeavy'},{key:'special_effects_status_strength',raw:'50'}],[fire,heavy]);
 assert.deepEqual(got,[{id:'Fire',strength:100,effect:fire},{id:'BurningHeavy',strength:50,effect:heavy}]);
});

test('ground fire binds only ordinary Fire and adds no independent contact DPS',()=>{
 const facts={ground_fire:true,effects:[{id:'BurningHeavy',normal:200,durable:200,pen:4,duration_s:1},fire],fire_damage_multiplier:1.25};
 const result=groundContactFire(facts,target,m.ap);
 assert.equal(result.id,'Fire');assert.equal(result.dps,62.5);assert.equal(result.duration_ms,3000);
 assert.equal(result.independent_ground_dps,0);assert.match(result.independent_ground_dps_basis,/NOT_PROOF_OF_ZERO/);
 assert.equal(groundContactFire({...facts,effects:[facts.effects[0]]},target,m.ap),null);
});

test('spray ignition is user-bound at 150 ms for ordinary small enemies, separate from pilot warmup',()=>{
 for(const id of ['flam_66_torcher','p_72_crisper'])for(const species of ['hunter','scavenger']){
  const mode=row(id).facts.service_modes[0],t=m.targets[`${species}:main`];
  const result=boundFire(mode,{target:t},m.ap);
  assert.equal(result.ignition_contact_ms,150);assert.equal(result.duration_ms,3000);
  assert.equal(result.dps,100*t.fire_multiplier);assert.equal(mode.warmup_ms,700);
 }
});

test('finite grenade area consumes paid rounds and never credits damage after death',()=>{
 const facts=row('g_10_incendiary').facts,mode=facts.service_modes[0];
 const requests=m.scenario.chaff.map(x=>({target:m.targets[x.id],count:x.count}));
 const a=areaChaffService(facts,mode,requests,m.ap,m.scenario);
 assert.ok(a);assert.equal(a.count,28);assert.equal(a.action_plan.reduce((n,x)=>n+x.rounds,0),a.shots);
 assert.equal(a.inventory_required,a.shots);assert.ok(a.area.audit.every(p=>p.remaining_hp.every(h=>h===0)));
 assert.ok(a.area.fire.damage<=requests.reduce((sum,r)=>sum+r.count*r.target.hp,0));
 assert.match(a.area.fire.policy,/ONE_NONSTACKING_FIRE_POOL/);
});
