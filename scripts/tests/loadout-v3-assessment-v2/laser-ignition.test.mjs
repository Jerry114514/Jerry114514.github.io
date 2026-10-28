import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {boundFire,guaranteedFire} from '../../../shared/hd2-loadout/assessment-v2/status.mjs';
import {resolveMediumTarget} from '../../../shared/hd2-loadout/assessment-v2/medium-resolution.mjs';
import {projectileService,statusTargetRequest,ordinaryModes,ordinaryCapabilities} from '../../../shared/hd2-loadout/assessment-v2/projectile.mjs';
import {actionsFor,resourceWeapons} from '../../../shared/hd2-loadout/assessment-v2/engagement.mjs';
import {executeResourcePlan} from '../../../shared/hd2-loadout/assessment-v2/resources.mjs';
const m=JSON.parse(readFileSync(new URL('../../../shared/hd2-loadout/assessment-v2/equipment.json',import.meta.url)));
const row=id=>m.equipment.find(r=>r.equipment_id===id);
const r=row('las_5_scythe'),mode=ordinaryModes(r.facts)[0],target=m.targets['hunter:main'];
const request={target,count:1,resolution:{main:target,policy:m.scenario.medium_resolution}};

test('light beam contact is user-bound independently of unknown status ticks and medium thresholds',()=>{
  const f=boundFire(mode,request,m.ap);
  assert.equal(f.ignition_contact_ms,150);assert.equal(f.dps,70);assert.equal(f.duration_ms,3000);
  assert.equal(guaranteedFire(mode,request,m.ap),null);
  assert.equal(boundFire(mode,{target:m.targets['bile_spewer:main']},m.ap),null);
  for(const id of ['las_16_sickle','las_17_double_edge_sickle','las_13_trident'])
    for(const mode of ordinaryModes(row(id).facts))assert.equal(boundFire(mode,request,m.ap),null,id);
});

test('burn starts after contact; a brief pass or interrupted exposure cannot buy a full burn',()=>{
  assert.equal(resolveMediumTarget(mode,request,[50,100],m.ap).status,'UNKNOWN');
  assert.equal(resolveMediumTarget(mode,request,[50,100,500],m.ap).status,'UNKNOWN');
  const hit=resolveMediumTarget(mode,request,[50,100,150],m.ap);
  assert.equal(hit.fire.ignition_at_ms,150);assert.equal(hit.main_after_shots,107.5);
  assert.equal(hit.main_damage.fire_before_death,107.5);assert.equal(hit.death_ms,1686);
});

test('changing integration quantum does not multiply status damage or speed up ignition',()=>{
  const finer={...mode,work_ms:25,rpm:2400,normal:mode.normal/2,durable:mode.durable/2};
  const coarse=resolveMediumTarget(mode,request,[50,100,150],m.ap);
  const fine=resolveMediumTarget(finer,request,[25,50,75,100,125,150],m.ap);
  assert.equal(fine.fire.ignition_at_ms,coarse.fire.ignition_at_ms);
  assert.equal(fine.death_ms,coarse.death_ms);
  assert.equal(fine.main_damage.fire_before_death,coarse.main_damage.fire_before_death);
});

test('tagging two enemies switches before burn completion and pays identical heat units in resource ledger',()=>{
  const req=statusTargetRequest(mode,target,2,m.ap,m.scenario);
  const service=projectileService(mode,[req],m.ap,{handling_policy:m.scenario.handling});
  assert.equal(service.shots,6);assert.ok(service.neutralized_at_ms>service.first_to_last_ms);
  const actions=actionsFor(r,[{target,count:2}],m.ap,m.scenario,m.targets);
  assert.equal(actions.reduce((s,a)=>s+a.rounds,0),6);
  const run=executeResourcePlan({weapons:resourceWeapons([r]),providers:[],steps:actions});
  assert.equal(run.status,'COMPLETED');
  assert.equal(run.state.resources[`loaded:${r.equipment_id}`].value,mode.capacity-6);
  assert.equal(run.elapsed_ms,service.neutralized_at_ms);
  assert.ok(service.first_to_last_ms<service.entries[0].resolution.death_ms);
});

test('close defence pays actual death time and can choose continued beam over minimal tagging',()=>{
  const close=r.capabilities.modes[0].close_defense;
  assert.equal(close.response_time_ms,close.neutralized_at_ms);
  const tag=projectileService(mode,[statusTargetRequest(mode,target,4,m.ap,m.scenario)],m.ap,{handling_policy:m.scenario.handling});
  assert.ok(close.neutralized_at_ms<=tag.neutralized_at_ms);
  assert.ok(close.response_time_ms>150*4);
});

test('chaff rate gains come from paid fire actions; removing ignition restores direct-only work',()=>{
  for(const id of ['las_5_scythe','las_7_dagger','support_las_98_laser_cannon']) {
    const r=row(id),facts=structuredClone(r.facts);
    for(const mode of facts.service_modes)delete mode.ignition_policy;
    const direct=ordinaryCapabilities(facts,m.targets,m.ap,m.scenario).modes[0];
    assert.ok(r.capabilities.modes[0].chaff.shots<direct.chaff.shots,id);
    assert.ok(r.capabilities.modes[0].chaff.sustained.targets_per_second>direct.chaff.sustained.targets_per_second,id);
    assert.deepEqual(r.capabilities.modes[0].anti_medium,direct.anti_medium,'light time must not leak into medium scores');
  }
});
