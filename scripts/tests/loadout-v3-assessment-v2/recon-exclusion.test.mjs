import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {beginAssessmentDraw,stepAssessmentDraw,assessmentReplacements,chooseAssessmentReplacement} from '../../../shared/hd2-loadout/assessment-v2/draw.mjs';
import {assessmentLegality,evaluateAssessment} from '../../../shared/hd2-loadout/assessment-v2/evaluate.mjs';
import {withinReconVehicleLimit} from '../../../shared/hd2-loadout/engine/common.mjs';
import {seeded} from '../../../shared/hd2-loadout/engine/rng.mjs';

const read=path=>JSON.parse(readFileSync(new URL('../../../shared/hd2-loadout/'+path,import.meta.url)));
const model=read('assessment-v2/equipment.json'),catalog=read('data/catalog.json');
const cars=['vehicle_m_102_gunner_fast_recon_vehicle','vehicle_m_103_supply_fast_recon_vehicle'];
const kit={primary:'plas_1_scorcher',secondary:'gp_20_ultimatum',grenade:'g_48_giga_grenade',
  stratagems:['support_spear','backpack_b_1_supply_pack','deployable_gas_mines','deployable_flame_sentry']};
function finish(task,evaluate){
  for(let i=0;i<5000;i++){const result=stepAssessmentDraw(task,evaluate);if(result.status!=='SEARCHING')return result;}
  assert.fail('No result within test budget');
}

test('recon pair conflicts in every slot pair and partial locks, independently of ability',()=>{
  for(let a=0;a<4;a++)for(let b=0;b<4;b++)if(a!==b){
    const loadout=structuredClone(kit);loadout.stratagems[a]=cars[0];loadout.stratagems[b]=cars[1];
    assert.equal(assessmentLegality(loadout,catalog,model).reason,'MULTIPLE_RECON_VEHICLES');
    const locks={stratagems:Array(4).fill(null)};locks.stratagems[a]=cars[0];locks.stratagems[b]=cars[1];
    for(const mode of ['pure','assessment']){
      const task=beginAssessmentDraw(model,catalog,{mode,constraints:{locks},seed:42});
      assert.equal(task.result.status,'INVALID_LOCKS');
      assert.equal(task.result.reason,'MULTIPLE_RECON_VEHICLES');
      assert.equal(task.completed,0);
    }
  }
  for(const car of cars){
    const mixed={...kit,stratagems:[car,'vehicle_exo_45_patriot_exosuit','vehicle_td_110_maelstrom','vehicle_td_220_bastion_mk_xvi']};
    assert.equal(assessmentLegality(mixed,catalog,model).status,'PASS','not a global vehicle cap');
  }
});

test('an impossible recon-only small pool terminates instead of outputting two cars',()=>{
  const unlocked=[kit.primary,kit.secondary,kit.grenade,...cars,...kit.stratagems.slice(2)];
  for(const mode of ['pure','assessment']){
    const result=finish(beginAssessmentDraw(model,catalog,{mode,seed:42,constraints:{unlocked}}),()=>assert.fail('illegal pair reached scoring'));
    assert.equal(result.status,mode==='pure'?'NO_LEGAL_LOADOUT':'NO_ACCEPTABLE_LOADOUT');
    assert.equal(result.exhaustive,true);assert.equal(result.loadout,undefined);
  }
});

test('pure draws and real balanced repair cannot output the recon pair',()=>{
  const seen=new Set();
  for(let seed=0;seed<100;seed++){
    const result=finish(beginAssessmentDraw(model,catalog,{mode:'pure',seed}));
    assert.equal(result.status,'UNVERIFIED');assert.ok(withinReconVehicleLimit(result.loadout.stratagems));
    for(const car of cars)if(result.loadout.stratagems.includes(car))seen.add(car);
  }
  assert.equal(seen.size,2,'neither car was removed from the normal pool');
  for(const car of cars){
    const task=beginAssessmentDraw(model,catalog,{seed:42,constraints:{locks:{stratagems:[car,null,null,null]}}});
    const result=finish(task,(loadout,...args)=>{
      assert.ok(withinReconVehicleLimit(loadout.stratagems),'repair must reject conflicts before scoring');
      return evaluateAssessment(loadout,...args);
    });
    assert.equal(result.status,'ASSESSMENT_PASS');assert.equal(result.loadout.stratagems[0],car);
    assert.ok(withinReconVehicleLimit(result.loadout.stratagems));
  }
});

test('post-output random/manual edits reject a second car but allow swapping the existing car',()=>{
  for(const [index,car] of cars.entries())for(let slot=0;slot<4;slot++){
    const loadout=structuredClone(kit);loadout.stratagems[slot]=car;
    const other=cars[1-index];
    const swap=assessmentReplacements(loadout,'stratagem:'+slot,null,catalog);
    assert.equal(swap.rows.find(r=>r.id===other).status,'UNVERIFIED');
    for(let target=0;target<4;target++)if(target!==slot){
      const menu=assessmentReplacements(loadout,'stratagem:'+target,null,catalog);
      assert.equal(menu.rows.find(r=>r.id===other).reason,'MULTIPLE_RECON_VEHICLES');
      assert.equal(menu.rows.find(r=>r.id===other).status,'REJECTED_ILLEGAL');
      for(let seed=0;seed<20;seed++){
        const next=chooseAssessmentReplacement(loadout,'stratagem:'+target,menu.rows,seeded(seed));
        assert.ok(withinReconVehicleLimit(next.loadout.stratagems));
        assert.equal(next.dimensions,undefined,'output edits do not score');
      }
    }
  }
});
