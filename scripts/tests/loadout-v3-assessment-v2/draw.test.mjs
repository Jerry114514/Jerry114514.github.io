import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {beginAssessmentDraw,stepAssessmentDraw,assessmentReplacements,chooseAssessmentReplacement} from '../../../shared/hd2-loadout/assessment-v2/draw.mjs';
import {evaluateAssessment,assessmentLegality} from '../../../shared/hd2-loadout/assessment-v2/evaluate.mjs';
import {seeded} from '../../../shared/hd2-loadout/engine/rng.mjs';

const read=name=>JSON.parse(readFileSync(new URL('../../../shared/hd2-loadout/'+name,import.meta.url)));
const model=read('assessment-v2/equipment.json'),catalog=read('data/catalog.json');
const kit={primary:'plas_1_scorcher',secondary:'gp_20_ultimatum',grenade:'g_48_giga_grenade',
  stratagems:['support_spear','backpack_b_1_supply_pack','deployable_gas_mines','deployable_flame_sentry']};
function finish(task,evaluate){for(let i=0;i<3000;i++){const v=stepAssessmentDraw(task,evaluate);if(v.status!=='SEARCHING')return v;}assert.fail('No result within test budget');}

test('whole random kits repeat with a seed; accepted kits use the actual current evaluator',()=>{
  const run=()=>finish(beginAssessmentDraw(model,catalog,{seed:42}));
  const a=run(),b=run();assert.deepEqual(a,b);
  assert.equal(a.status,'ASSESSMENT_PASS');assert.ok(a.completed>1);
  assert.equal(a.eligible_for_draw,false,'acceptance testing must not claim gameplay calibration');
  const evaluation=evaluateAssessment(a.loadout,model,catalog);
  assert.equal(evaluation.acceptance_ready,true);
  for(const dimension of Object.values(evaluation.dimensions)){
    assert.equal(dimension.threshold,60);assert.equal(dimension.status,'PASS');
    assert.ok(dimension.score>=60-1e-10);
  }
  assert.deepEqual(a.dimensions.endurance,evaluation.dimensions.endurance);
  assert.equal(a.evidence_grade,'assessment_estimate');
});

test('failure and unknown both cause another complete random draw; no best-kit ranking',()=>{
  let calls=0;
  const task=beginAssessmentDraw(model,catalog,{seed:12});
  const v=finish(task,()=>({status:++calls===1?'ESTIMATED_FAIL':calls===2?'UNKNOWN':'ESTIMATED_PASS',acceptance_ready:calls>=3}));
  assert.equal(calls,3);assert.equal(v.counts.ESTIMATED_FAIL,1);assert.equal(v.counts.UNKNOWN,1);
  assert.equal(v.status,'ASSESSMENT_PASS');
});

test('pure random and post-output replacements need no ability model at all',()=>{
  const holdingOnly={equipment:model.equipment.map(r=>({equipment_id:r.equipment_id,facts:{holding:r.facts.holding}}))};
  const fail=()=>assert.fail('pure mode must not evaluate abilities');
  assert.equal(finish(beginAssessmentDraw(holdingOnly,catalog,{mode:'pure',seed:7}),fail).status,'UNVERIFIED');
  const {rows}=assessmentReplacements(kit,'primary',holdingOnly,catalog);
  const next=chooseAssessmentReplacement(kit,'primary',rows,seeded(9));
  assert.equal(next.status,'UNVERIFIED');assert.equal(next.reason,'USER_ADJUSTMENT');
  assert.notEqual(next.loadout.primary,kit.primary);
  assert.deepEqual({...next.loadout,primary:kit.primary},kit);
});

test('post-output edits allow conflicting equipment but preserve slots, uniqueness and user choices',()=>{
  // No model at all: this path must neither score nor inspect holding rules.
  const {rows}=assessmentReplacements(kit,'stratagem:0',null,catalog);
  assert.equal(rows.find(r=>r.id==='heavy_support_gr_8_recoilless_rifle').status,'UNVERIFIED');
  assert.equal(rows.find(r=>r.id==='support_mg_43_machine_gun').status,'UNVERIFIED');
  assert.equal(assessmentReplacements(kit,'primary',model,catalog,{locks:{primary:kit.primary}}).reason,'SLOT_LOCKED');
  assert.ok(!assessmentReplacements(kit,'primary',model,catalog,{excluded:['ar_23_liberator']}).rows.some(r=>r.id==='ar_23_liberator'));
  assert.equal(rows.find(r=>r.id==='backpack_b_1_supply_pack').status,'REJECTED_ILLEGAL','a duplicate card is still excluded');
  const oneMech={...kit,stratagems:['vehicle_exo_45_patriot_exosuit',...kit.stratagems.slice(1)]};
  const menu=assessmentReplacements(oneMech,'stratagem:2',null,catalog);
  assert.equal(menu.rows.find(r=>r.id==='vehicle_exo_49_emancipator_exosuit').reason,'MULTIPLE_EXOSUITS');
  assert.equal(assessmentReplacements(oneMech,'stratagem:0',null,catalog).rows.find(r=>r.id==='vehicle_exo_49_emancipator_exosuit').status,'UNVERIFIED','switching an existing mech is allowed');
  for(let seed=0;seed<50;seed++){
    const v=chooseAssessmentReplacement(oneMech,'stratagem:2',menu.rows,seeded(seed));
    assert.ok(v.loadout.stratagems.filter(id=>id.startsWith('vehicle_exo_')).length<=1);
  }
});

test('C4 occupies both support and backpack slots, without conflicting with itself',()=>{
  const c4='backpack_b_md_c4_pack',tail=['orbital_precision_strike','deployable_flame_sentry'];
  const loadout=ids=>({...kit,stratagems:[...ids,...tail].slice(0,4)});
  const lone=loadout([c4,'deployable_gas_mines']);
  assert.equal(assessmentLegality(lone,catalog,model).status,'PASS');
  assert.equal(assessmentLegality(loadout([c4,'support_mg_43_machine_gun']),catalog,model).reason,'MULTIPLE_SUPPORT_WEAPONS');
  assert.equal(assessmentLegality(loadout([c4,'backpack_b_1_supply_pack']),catalog,model).reason,'MULTIPLE_BACKPACKS');
  assert.equal(assessmentLegality(loadout([c4,'heavy_support_gr_8_recoilless_rifle']),catalog,model).reason,'MULTIPLE_SUPPORT_WEAPONS');
  const exempt={...kit,stratagems:[c4,'support_mls_4x_commando','backpack_b_100_portable_hellbomb','orbital_precision_strike']};
  assert.equal(assessmentLegality(exempt,catalog,model).status,'PASS');
  assert.equal(finish(beginAssessmentDraw(model,catalog,{mode:'pure',constraints:{locks:exempt}})).status,'UNVERIFIED');
  assert.equal(beginAssessmentDraw(model,catalog,{constraints:{locks:loadout([c4,'support_mg_43_machine_gun'])}}).result.reason,'MULTIPLE_SUPPORT_WEAPONS');
  assert.equal(assessmentReplacements(lone,'stratagem:1',null,catalog).rows.find(r=>r.id==='support_mg_43_machine_gun').status,'UNVERIFIED','manual holding conflicts remain allowed');
});

test('initial draw allows only one mech, including fixed locks; vehicles are not all mechs',()=>{
  const twoMechs={...kit,stratagems:['vehicle_exo_45_patriot_exosuit','vehicle_exo_49_emancipator_exosuit',...kit.stratagems.slice(2)]};
  assert.equal(assessmentLegality(twoMechs,catalog,model).reason,'MULTIPLE_EXOSUITS');
  assert.equal(beginAssessmentDraw(model,catalog,{constraints:{locks:{stratagems:[...twoMechs.stratagems.slice(0,2),null,null]}}}).result.reason,'MULTIPLE_EXOSUITS');
  const one={...twoMechs,stratagems:['vehicle_exo_45_patriot_exosuit','vehicle_m_103_supply_fast_recon_vehicle',...kit.stratagems.slice(2)]};
  assert.equal(assessmentLegality(one,catalog,model).status,'PASS');
  for(let seed=0;seed<50;seed++){
    const v=finish(beginAssessmentDraw(model,catalog,{mode:'pure',seed}));
    assert.ok(v.loadout.stratagems.filter(id=>id.startsWith('vehicle_exo_')).length<=1);
  }
});

test('disposable equipment and portable hellbomb are exempt, but Bullet Storm is a regular support',()=>{
  const rr='heavy_support_gr_8_recoilless_rifle',hell='backpack_b_100_portable_hellbomb';
  const disposables=model.equipment.filter(r=>r.facts.inventory?.disposable&&r.equipment_id!=='support_mgx_42_bullet_storm');
  assert.equal(disposables.length,5);
  for(const row of disposables){
    const l={...kit,stratagems:[rr,row.equipment_id,hell,'deployable_flame_sentry']};
    assert.equal(assessmentLegality(l,catalog,model).status,'PASS',row.equipment_id);
    const task=beginAssessmentDraw(model,catalog,{mode:'pure',constraints:{locks:l}});
    assert.equal(finish(task).status,'UNVERIFIED');
  }
  const packs={...kit,stratagems:['support_mg_43_machine_gun','backpack_b_1_supply_pack',hell,'deployable_flame_sentry']};
  assert.equal(assessmentLegality(packs,catalog,model).status,'PASS');
  const conflict={...kit,stratagems:['support_mg_43_machine_gun','support_mgx_42_bullet_storm',...kit.stratagems.slice(2)]};
  assert.equal(assessmentLegality(conflict,catalog,model).reason,'MULTIPLE_SUPPORT_WEAPONS');
  assert.equal(beginAssessmentDraw(model,catalog,{constraints:{locks:conflict}}).result.status,'INVALID_LOCKS');
});

test('a locked unknown candidate terminates without claiming proved failure or spinning',()=>{
  let calls=0;
  const task=beginAssessmentDraw(model,catalog,{seed:1,constraints:{locks:kit}});
  const v=finish(task,()=>{calls++;return {status:'UNKNOWN',acceptance_ready:false};});
  assert.equal(calls,1);assert.equal(v.status,'NO_ACCEPTABLE_LOADOUT');assert.equal(v.exhaustive,true);
});

test('a strong user kit is retained; lock conflicts fail before random retries',()=>{
  const result=finish(beginAssessmentDraw(model,catalog,{seed:1,constraints:{locks:kit}}));
  assert.equal(result.status,'ASSESSMENT_PASS');assert.deepEqual(result.loadout,kit);
  const locks={stratagems:['heavy_support_gr_8_recoilless_rifle','backpack_b_1_supply_pack',null,null]};
  assert.equal(beginAssessmentDraw(model,catalog,{constraints:{locks}}).result.status,'INVALID_LOCKS');
});

test('fresh draws receive independent random seeds; invalid seeds and pool constraints fail clearly',()=>{
  const seeds=new Set(Array.from({length:8},()=>beginAssessmentDraw(model,catalog).seed));assert.equal(seeds.size,8);
  assert.equal(beginAssessmentDraw(model,catalog,{seed:-1}).result.status,'INVALID_INPUT');
  assert.equal(beginAssessmentDraw(model,catalog,{constraints:{unlocked:[]}}).result.status,'EMPTY_SLOT_POOL');
});
