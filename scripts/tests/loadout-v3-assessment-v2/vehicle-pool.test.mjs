import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {beginAssessmentDraw,stepAssessmentDraw,assessmentReplacements,isArmoredVehicle} from '../../../shared/hd2-loadout/assessment-v2/draw.mjs';
import {REPAIR_ROLES} from '../../../shared/hd2-loadout/assessment-v2/repair.mjs';

const read=name=>JSON.parse(readFileSync(new URL('../../../shared/hd2-loadout/'+name,import.meta.url)));
const model=read('assessment-v2/equipment.json'),catalog=read('data/catalog.json');
const armored=catalog.equipment.filter(r=>isArmoredVehicle(r.id)).map(r=>r.id);
const kit={primary:'plas_1_scorcher',secondary:'gp_20_ultimatum',grenade:'g_48_giga_grenade',
  stratagems:['support_spear','backpack_b_1_supply_pack','deployable_gas_mines','deployable_flame_sentry']};
const seedFor=enabled=>{for(let seed=0;seed<100;seed++)if(beginAssessmentDraw(model,catalog,{seed}).armored_pool.enabled===enabled)return seed;throw Error('seed not found');};
const openSeed=seedFor(true),closedSeed=seedFor(false);
const finish=task=>{for(let i=0;i<1000;i++){const v=stepAssessmentDraw(task);if(v.status!=='SEARCHING')return v;}assert.fail('test budget');};

test('one shared pool contains four mechs and two tanks, not scout/supply cars',()=>{
  assert.equal(armored.length,6);
  for(const id of ['vehicle_td_110_maelstrom','vehicle_td_220_bastion_mk_xvi'])assert.ok(armored.includes(id));
  const closed=beginAssessmentDraw(model,catalog,{seed:closedSeed});
  assert.ok(!closed.prepared.values.stratagem.some(isArmoredVehicle));
  for(const id of ['vehicle_m_102_gunner_fast_recon_vehicle','vehicle_m_103_supply_fast_recon_vehicle'])
    assert.ok(closed.prepared.values.stratagem.includes(id));
});

test('a fresh request opens the whole pool about twenty percent of the time and repeats with its seed',()=>{
  let opened=0;
  for(let seed=0;seed<10000;seed++) {
    const task=beginAssessmentDraw(model,catalog,{seed});
    if(task.armored_pool.enabled){opened++;assert.ok(armored.every(id=>task.prepared.values.stratagem.includes(id)));}
    else assert.ok(!task.prepared.values.stratagem.some(isArmoredVehicle));
  }
  assert.ok(opened>=1800&&opened<=2200,`opened ${opened}/10000`);
  assert.deepEqual(beginAssessmentDraw(model,catalog,{seed:openSeed}).prepared,beginAssessmentDraw(model,catalog,{seed:openSeed}).prepared);
});

test('closed admission survives whole-kit retries and every local repair step',()=>{
  const task=beginAssessmentDraw(model,catalog,{seed:closedSeed}),admission=task.armored_pool;
  const evaluate=loadout=>{
    assert.ok(!loadout.stratagems.some(isArmoredVehicle));
    return {status:'UNKNOWN',acceptance_ready:false,
      dimensions:Object.fromEntries(REPAIR_ROLES.map(role=>[role,{score:0,status:'UNKNOWN'}])),
      gates:Object.fromEntries(['legality','heavy_pair','demolition','shared_resources','close_safety'].map(key=>[key,{status:key==='legality'?'PASS':'UNKNOWN'}]))};
  };
  for(let i=0;i<2000&&task.search_stats.restarts<3;i++) {
    assert.equal(stepAssessmentDraw(task,evaluate).status,'SEARCHING');
    assert.equal(task.armored_pool,admission);assert.equal(admission.enabled,false);
    assert.ok(!task.prepared.values.stratagem.some(isArmoredVehicle));
  }
  assert.equal(task.search_stats.restarts,3);assert.ok(task.search_stats.local_trials>=3);
});

test('the gate applies to initial pure and balanced draws, but opening never forces a vehicle',()=>{
  for(const mode of ['pure','assessment','certified']) {
    const task=beginAssessmentDraw(model,catalog,{mode,seed:closedSeed});
    assert.equal(task.armored_pool.enabled,false);assert.ok(!task.prepared.values.stratagem.some(isArmoredVehicle));
  }
  let openedWith=0,openedWithout=0;
  for(let seed=0;seed<200;seed++) {
    const task=beginAssessmentDraw(model,catalog,{mode:'pure',seed}),result=finish(task);
    assert.equal(result.status,'UNVERIFIED');
    const vehicle=result.loadout.stratagems.some(isArmoredVehicle);
    if(!task.armored_pool.enabled)assert.equal(vehicle,false);
    else if(vehicle)openedWith++;else openedWithout++;
    assert.ok(result.loadout.stratagems.filter(id=>id.startsWith('vehicle_exo_')).length<=1);
  }
  assert.ok(openedWith>0&&openedWithout>0);
});

test('explicit vehicle locks remain fixed but do not reopen the random pool',()=>{
  const mech='vehicle_exo_45_patriot_exosuit';
  const constraints={locks:{stratagems:[mech,null,null,null]}};
  const before=structuredClone(constraints),task=beginAssessmentDraw(model,catalog,{mode:'pure',seed:closedSeed,constraints});
  assert.equal(task.armored_pool.enabled,false);
  assert.deepEqual(task.prepared.values.stratagem.filter(isArmoredVehicle),[mech]);
  assert.equal(finish(task).loadout.stratagems[0],mech);assert.deepEqual(constraints,before);
  const conflict=beginAssessmentDraw(model,catalog,{seed:closedSeed,constraints:{locks:{stratagems:[mech,'vehicle_exo_49_emancipator_exosuit',null,null]}}});
  assert.equal(conflict.result.reason,'MULTIPLE_EXOSUITS');
});

test('an open pool cannot override exclusions/unlocks or make an excluded lock valid',()=>{
  const removed=armored[0],constraints={excluded:[removed]};
  const task=beginAssessmentDraw(model,catalog,{seed:openSeed,constraints});
  assert.equal(task.armored_pool.enabled,true);assert.ok(!task.prepared.values.stratagem.includes(removed));
  const locked=beginAssessmentDraw(model,catalog,{seed:openSeed,constraints:{...constraints,locks:{stratagems:[removed,null,null,null]}}});
  assert.equal(locked.result.status,'INVALID_LOCKS');
  const unlocked=[kit.primary,kit.secondary,kit.grenade,...kit.stratagems];
  assert.ok(!beginAssessmentDraw(model,catalog,{seed:openSeed,constraints:{unlocked}}).prepared.values.stratagem.some(isArmoredVehicle));
});

test('closing a restricted pool returns insufficient candidates instead of rerolling admission',()=>{
  const unlocked=[kit.primary,kit.secondary,kit.grenade,...kit.stratagems.slice(1),...armored];
  const task=beginAssessmentDraw(model,catalog,{mode:'pure',seed:closedSeed,constraints:{unlocked}});
  assert.equal(task.result.status,'EMPTY_SLOT_POOL');assert.equal(task.result.reason,'ARMORED_POOL_CLOSED');
  assert.equal(stepAssessmentDraw(task),task.result);assert.equal(task.completed,0);
  const open=beginAssessmentDraw(model,catalog,{mode:'pure',seed:openSeed,constraints:{unlocked}});
  assert.ok(open.candidates,'small-space enumeration uses the admitted pool');assert.equal(finish(open).status,'UNVERIFIED');
});

test('post-output replacements do not inherit the initial admission coin',()=>{
  const task=beginAssessmentDraw(model,catalog,{mode:'pure',seed:closedSeed});
  const result=finish(task),menu=assessmentReplacements(result.loadout,'stratagem:0',model,catalog);
  assert.ok(armored.every(id=>menu.rows.some(row=>row.id===id&&row.status==='UNVERIFIED')));
});
