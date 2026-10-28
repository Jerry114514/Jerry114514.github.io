import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fragmentHit,blastAt} from '../../../shared/hd2-loadout/assessment-v2/fragments.mjs';
import {guaranteedFire} from '../../../shared/hd2-loadout/assessment-v2/status.mjs';
import {resolveMediumTarget} from '../../../shared/hd2-loadout/assessment-v2/medium-resolution.mjs';
import {projectileService,statusTargetRequest,ordinaryModes} from '../../../shared/hd2-loadout/assessment-v2/projectile.mjs';
import {resourceWeapons,actionsFor} from '../../../shared/hd2-loadout/assessment-v2/engagement.mjs';
import {executeResourcePlan} from '../../../shared/hd2-loadout/assessment-v2/resources.mjs';
const m=JSON.parse(readFileSync(new URL('../../../shared/hd2-loadout/assessment-v2/equipment.json',import.meta.url)));
const row=id=>m.equipment.find(r=>r.equipment_id===id);
const ac=row('heavy_support_ac_8_autocannon'),eruptor=row('r_36_eruptor');

test('FLAK and Eruptor bind fragments as children, not independent loaded guns',()=>{
  const modes=ordinaryModes(ac.facts),flak=modes.find(m=>m.mode_id==='AC-8_P1');
  assert.equal(modes.length,2);
  assert.equal(modes[0].fragments,undefined);
  for(const mode of [flak,eruptor.facts.modes[0]]) {
    assert.equal(mode.fragments.count,30);
    assert.equal(mode.fragments.normal,110);assert.equal(mode.fragments.durable,35);
    assert.equal(mode.fragments.pen,3);
  }
  assert.equal(flak.normal,0);assert.equal(flak.durable,0);
  assert.ok(flak.direct_impact_alternative.normal>0);
  assert.equal(resourceWeapons([ac]).length,1);
  assert.equal(resourceWeapons([eruptor]).length,1);
});

test('fragments have their own AP and durable damage; emitted count is a hard budget',()=>{
  const mode=eruptor.facts.modes[0],target={armor:0,durable:1};
  assert.equal(fragmentHit(mode,target,m.ap,1).damage,35);
  assert.equal(fragmentHit(mode,{armor:0,durable:0},m.ap,1).damage,110);
  assert.equal(fragmentHit(mode,{armor:4,durable:0},m.ap,1).damage,0);
  assert.equal(fragmentHit(mode,target,m.ap,31).status,'UNKNOWN');
  for(const r of [ac,eruptor])for(const cap of r.capabilities.modes) {
    for(const shot of cap.chaff.area?.fragments?.audit??[]) {
      assert.ok(shot.contacts<=shot.emitted);assert.equal(shot.contacts+shot.unallocated,30);
      assert.ok(shot.contacts<=18,'nine targets each receive at most two candidate contacts');
    }
  }
});

test('FLAK proximity uses outer AP and falloff instead of free direct plus inner blast',()=>{
  const mode=ordinaryModes(ac.facts).find(m=>m.mode_id==='AC-8_P1');
  const blast=blastAt(mode.explosion,3);
  assert.equal(blast.pen,2);assert.ok(Math.abs(blast.normal-189*4/5)<1e-8);
  assert.equal(blastAt(mode.explosion,7).normal,0);
  assert.equal(mode.proximity_m,3);
});

test('guaranteed fire uses packet strength, target multiplier and one ship multiplier',()=>{
  const mode=row('sg_225ie_breaker_incendiary').facts.modes[0],target=m.targets['warrior:main'];
  const fire=guaranteedFire(mode,{target},m.ap);
  assert.equal(fire.dps,80);assert.equal(fire.duration_ms,3000);
  assert.equal(guaranteedFire({...mode,fire_module_multiplier:1.25},{target},m.ap).dps,100);
  assert.equal(guaranteedFire({...mode,pellets:1},{target},m.ap),null);
  assert.equal(guaranteedFire({...mode,continuous:true},{target},m.ap),null);
  assert.equal(guaranteedFire(mode,{target:m.targets['hunter:main']},m.ap),null);
});

test('fire refresh does not stack; fire and gas have separate simultaneous damage',()=>{
  const target={...m.targets['warrior:main'],hp:350,armor:0,durable:0,fire_threshold_max:1};
  const fire={id:'Fire',normal:100,durable:100,pen:4,duration_s:3};
  const mode={mode_id:'test',normal:30,durable:30,pen:3,pellets:1,status_strength:1,direct_status_effects:[fire]};
  const request={target,resolution:{main:target,policy:m.scenario.medium_resolution}};
  const single=resolveMediumTarget(mode,request,[0,1000],m.ap);
  assert.equal(single.death_ms,3625);assert.equal(single.main_damage.fire_before_death,290);
  const both=resolveMediumTarget({...mode,direct_status_effects:[fire,{id:'Gas',normal:25,durable:25,pen:6,duration_s:6}]},request,[0,1000],m.ap);
  assert.equal(both.death_ms,2762);
  assert.ok(Math.abs(both.main_damage.fire_before_death+both.main_damage.gas_before_death-290)<1e-8);
  assert.equal(resolveMediumTarget(mode,{target:{...target,hp:1000},resolution:{main:{...target,hp:1000},policy:m.scenario.medium_resolution}},[0],m.ap).status,'UNKNOWN');
});

test('fire short burst is paid identically in score and finite ledger',()=>{
  const r=row('sg_225ie_breaker_incendiary'),mode=r.facts.modes[0],target=m.targets['warrior:main'];
  const req=statusTargetRequest(mode,target,1,m.ap,m.scenario);
  const service=projectileService(mode,[req],m.ap,{handling_policy:m.scenario.handling});
  const actions=actionsFor(r,[{target,count:1}],m.ap,m.scenario,m.targets);
  assert.equal(service.shots,1);assert.equal(actions[0].rounds,1);
  assert.ok(actions[0].effect_delay_ms>0);
  const executed=executeResourcePlan({weapons:resourceWeapons([r]),providers:[],steps:actions});
  assert.equal(executed.status,'COMPLETED');
  assert.equal(executed.state.resources[`loaded:${r.equipment_id}`].value,mode.capacity-1);
  assert.equal(executed.elapsed_ms,service.neutralized_at_ms);
});

test('gas grenade owns its cloud, pays fuse and all grenades, and has finite stock',()=>{
  const r=row('g_4_gas'),service=r.capabilities.modes[0].chaff;
  assert.equal(service.cloud.application,'ONE_PAID_GRENADE_STARTS_FIELD; NO_DIRECT_KILL_SEED');
  assert.equal(service.cloud.targets.length,28);assert.equal(service.shots,1);
  assert.ok(service.neutralized_at_ms>=13000+r.facts.fuse_ms);
  const request=m.scenario.chaff.map(x=>({target:m.targets[x.id],count:x.count}));
  const actions=actionsFor(r,request,m.ap,m.scenario,m.targets);
  assert.equal(actions.reduce((n,a)=>n+a.rounds,0),service.shots);
  const first=executeResourcePlan({weapons:resourceWeapons([r]),providers:[],steps:actions});
  assert.equal(first.status,'COMPLETED');
  const tooMany=Array.from({length:r.facts.inventory.total+1},()=>actions).flat();
  assert.equal(executeResourcePlan({weapons:resourceWeapons([r]),providers:[],steps:tooMany}).status,'INSUFFICIENT');
});

test('HE and HEAT share RR stock; Halt cannot spend stun-tube rounds as flechettes',()=>{
  const rr=row('heavy_support_gr_8_recoilless_rifle');
  assert.ok(ordinaryModes(rr.facts).some(m=>m.mode_id==='GR-8_P1'));
  assert.equal(resourceWeapons([rr]).length,1);
  const halt=row('sg_20_halt'),modes=ordinaryModes(halt.facts),[weapon]=resourceWeapons([halt]);
  assert.equal(modes.length,1);assert.equal(weapon.loaded,8);assert.equal(weapon.reserve,60);
  assert.equal(modes[0].total,68);assert.ok(halt.facts.unbound_modes[0].includes('SECOND_TUBE'));
});

test('endurance keeps full stock, one public refill and alternative modes separate',()=>{
  const mg=row('support_mg_43_machine_gun'),e=mg.endurance,mode=ordinaryModes(mg.facts)[0],budget=e.modes[0];
  assert.equal(budget.full_stock_standard_damage,mode.total*mode.normal);
  assert.equal(budget.full_stock_durable_damage,mode.total*mode.durable);
  assert.equal(budget.plus_one_box_standard_damage,(mode.total+mg.facts.refill.public)*mode.normal);
  assert.ok(e.score>60);assert.equal(row('ar_23_liberator').endurance.score,60);
  assert.ok(e.without_public_score<e.score,'both variants use the same damage reference');
  assert.equal(ac.endurance.modes.length,2);assert.ok(ac.endurance.mode_policy.includes('NEVER_SUMMED'));
  assert.equal(row('backpack_b_1_supply_pack').endurance.charges,4);
  assert.equal(row('vehicle_m_103_supply_fast_recon_vehicle').endurance.charges,8);
  assert.equal(row('vehicle_m_103_supply_fast_recon_vehicle').endurance.vehicle_turret,false);
});
