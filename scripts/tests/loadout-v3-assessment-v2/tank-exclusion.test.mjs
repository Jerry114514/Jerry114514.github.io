import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {beginAssessmentDraw,stepAssessmentDraw,assessmentReplacements,chooseAssessmentReplacement} from '../../../shared/hd2-loadout/assessment-v2/draw.mjs';
import {assessmentLegality,evaluateAssessment} from '../../../shared/hd2-loadout/assessment-v2/evaluate.mjs';
import {withinTankLimit} from '../../../shared/hd2-loadout/engine/common.mjs';
import {seeded} from '../../../shared/hd2-loadout/engine/rng.mjs';

const read=path=>JSON.parse(readFileSync(new URL('../../../shared/hd2-loadout/'+path,import.meta.url)));
const model=read('assessment-v2/equipment.json'),catalog=read('data/catalog.json');
const tanks=['vehicle_td_110_maelstrom','vehicle_td_220_bastion_mk_xvi'];
const kit={primary:'plas_1_scorcher',secondary:'gp_20_ultimatum',grenade:'g_48_giga_grenade',
  stratagems:['support_spear','backpack_b_1_supply_pack','deployable_gas_mines','deployable_flame_sentry']};
function finish(task,evaluate){
  for(let i=0;i<5000;i++){const result=stepAssessmentDraw(task,evaluate);if(result.status!=='SEARCHING')return result;}
  assert.fail('No result within test budget');
}

test('tank pair fails in all slot orders and fixed locks, while mixed vehicle classes remain legal',()=>{
  for(let a=0;a<4;a++)for(let b=0;b<4;b++)if(a!==b){
    const loadout=structuredClone(kit);loadout.stratagems[a]=tanks[0];loadout.stratagems[b]=tanks[1];
    assert.equal(assessmentLegality(loadout,catalog,model).reason,'MULTIPLE_TANKS');
    const locks={stratagems:Array(4).fill(null)};locks.stratagems[a]=tanks[0];locks.stratagems[b]=tanks[1];
    for(const mode of ['pure','assessment']){
      const task=beginAssessmentDraw(model,catalog,{mode,seed:42,constraints:{locks}});
      assert.equal(task.result.status,'INVALID_LOCKS');assert.equal(task.result.reason,'MULTIPLE_TANKS');
      assert.equal(task.completed,0);
    }
  }
  for(const tank of tanks){
    const loadout={...kit,stratagems:[tank,'vehicle_exo_45_patriot_exosuit','vehicle_m_103_supply_fast_recon_vehicle','orbital_precision_strike']};
    assert.equal(assessmentLegality(loadout,catalog,model).status,'PASS');
  }
});

test('impossible tank pools terminate for both open and closed admission',()=>{
  const unlocked=[kit.primary,kit.secondary,kit.grenade,...tanks,...kit.stratagems.slice(2)];
  for(const mode of ['pure','assessment']){
    const gates=new Set();
    for(let seed=0;seed<30;seed++){
      const task=beginAssessmentDraw(model,catalog,{mode,seed,constraints:{unlocked}});gates.add(task.armored_pool.enabled);
      const result=finish(task,()=>assert.fail('two tanks reached scoring'));
      assert.equal(result.status,task.armored_pool.enabled?(mode==='pure'?'NO_LEGAL_LOADOUT':'NO_ACCEPTABLE_LOADOUT'):'EMPTY_SLOT_POOL');
      assert.equal(result.loadout,undefined);
    }
    assert.equal(gates.size,2);
  }
});

test('pure draws and real balanced repair preserve single tanks without removing either from the pool',()=>{
  const seen=new Set();
  for(let seed=0;seed<1000;seed++){
    const task=beginAssessmentDraw(model,catalog,{mode:'pure',seed}),result=finish(task);
    assert.equal(result.status,'UNVERIFIED');assert.ok(withinTankLimit(result.loadout.stratagems));
    for(const id of tanks)if(result.loadout.stratagems.includes(id)){assert.ok(task.armored_pool.enabled);seen.add(id);}
  }
  assert.equal(seen.size,2);
  for(const tank of tanks){
    const result=finish(beginAssessmentDraw(model,catalog,{seed:42,constraints:{locks:{stratagems:[tank,null,null,null]}}}),(loadout,...args)=>{
      assert.ok(withinTankLimit(loadout.stratagems),'illegal repair reached scoring');return evaluateAssessment(loadout,...args);
    });
    assert.equal(result.status,'ASSESSMENT_PASS');assert.equal(result.loadout.stratagems[0],tank);
  }
});

test('manual and random replacement exclude a second tank but allow swapping the existing one',()=>{
  for(const [i,tank] of tanks.entries())for(let slot=0;slot<4;slot++){
    const loadout=structuredClone(kit);loadout.stratagems[slot]=tank;
    assert.equal(assessmentReplacements(loadout,'stratagem:'+slot,null,catalog).rows.find(r=>r.id===tanks[1-i]).status,'UNVERIFIED');
    for(let target=0;target<4;target++)if(target!==slot){
      const menu=assessmentReplacements(loadout,'stratagem:'+target,null,catalog),other=menu.rows.find(r=>r.id===tanks[1-i]);
      assert.equal(other.status,'REJECTED_ILLEGAL');assert.equal(other.reason,'MULTIPLE_TANKS');
      for(let seed=0;seed<20;seed++)assert.ok(withinTankLimit(chooseAssessmentReplacement(loadout,'stratagem:'+target,menu.rows,seeded(seed)).loadout.stratagems));
    }
  }
});
