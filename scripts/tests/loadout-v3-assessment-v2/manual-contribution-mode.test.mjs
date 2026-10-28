import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SCORE_ROLES,changeManualScores,applyManualScores,contributionKind} from '../../../shared/hd2-loadout/assessment-v2/manual-scores.mjs';
import {evaluateAssessment} from '../../../shared/hd2-loadout/assessment-v2/evaluate.mjs';
import {rescaleScore} from '../../../shared/hd2-loadout/assessment-v2/score-scale.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../../../'+p,import.meta.url)));
const source=read('shared/hd2-loadout/assessment-v2/equipment.json'),catalog=read('shared/hd2-loadout/data/catalog.json');
// Tests start from automatic values, regardless of the user's live saved edits.
for(const row of source.equipment){
  delete row.manual_calibration;
  for(const target of [...Object.values(row.dimensions),row.heavy_assessment,row.endurance,row.demolition_assessment]){
    if('calculated_score' in target)target.score=target.calculated_score;
    if(target.calculated_state)target.state=target.calculated_state;
    delete target.score_origin;delete target.calculated_score;delete target.calculated_state;
  }
}
const empty=()=>({schema:1,overrides:{},history:[]});
const id='plas_1_scorcher';
const kit={primary:id,secondary:'gp_20_ultimatum',grenade:'g_48_giga_grenade',
  stratagems:['support_spear','backpack_b_1_supply_pack','deployable_gas_mines','deployable_flame_sentry']};
function apply(doc){const model=structuredClone(source);applyManualScores(model,doc);return model;}

test('one whole-item mode routes all six final manual values once without ordinary/composite double counting',()=>{
  const scores=Object.fromEntries(SCORE_ROLES.map(role=>[role,60]));
  const doc=changeManualScores(empty(),{equipment_id:id,mode:'additive',scores},source);
  const model=apply(doc),r=evaluateAssessment(kit,model,catalog);
  for(const role of SCORE_ROLES){const dim=r.dimensions[role],added=dim.contributions.filter(c=>c.equipment_id===id);
    assert.equal(added.length,1,role);assert.equal(added[0].value,60,role);
    assert.equal(added[0].source,'MANUAL_EQUIPMENT_ADDITION');
    assert.notEqual(dim.selected_ordinary,id,role);
    assert.equal(dim.total_before_display,dim.base_score+dim.auxiliary_bonus);
  }
  assert.ok(r.medium_routes.witnesses.every(w=>w.equipment_id!==id));
  const baseDoc=changeManualScores(doc,{equipment_id:id,mode:'base',scores},model);
  const b=evaluateAssessment(kit,apply(baseDoc),catalog);
  for(const role of SCORE_ROLES)assert.equal(b.dimensions[role].contributions.some(c=>c.equipment_id===id),['anti_heavy','demolition'].includes(role));
  for(const gate of ['heavy_pair','demolition','legality'])assert.deepEqual(r.gates[gate],b.gates[gate]);
  assert.deepEqual(model.equipment.find(r=>r.equipment_id===id).facts,source.equipment.find(r=>r.equipment_id===id).facts);
});

test('mode-only edits use regraded automatic values; reset restores automatic routing and keeps history',()=>{
  const doc=changeManualScores(empty(),{equipment_id:id,mode:'additive',scores:{}},source);
  assert.deepEqual(doc.overrides[id].scores,{});
  const model=apply(doc),r=evaluateAssessment(kit,model,catalog),row=model.equipment.find(r=>r.equipment_id===id);
  for(const role of SCORE_ROLES){
    assert.equal(contributionKind(row,role),'AUXILIARY_ADDITION');
    const added=r.dimensions[role].contributions.find(c=>c.equipment_id===id);
    if(Number.isFinite(row.calculated_scores[role]))assert.equal(added.value,rescaleScore(row.calculated_scores[role],model.scenario.score_scale));
  }
  const reset=changeManualScores(doc,{equipment_id:id,mode:'auto',scores:{}},model);
  assert.deepEqual(reset.overrides,{});assert.equal(reset.history.length,2);
  assert.equal(contributionKind(apply(reset).equipment.find(r=>r.equipment_id===id),'chaff'),'BASE_CAPABILITY');
});

test('automatic backpacks accept six-dimensional additive edits and fixed zero/physical gates still apply',()=>{
  const dog='backpack_ax_ar_23_guard_dog',scores=Object.fromEntries(SCORE_ROLES.map(role=>[role,60]));
  const model=apply(changeManualScores(empty(),{equipment_id:dog,mode:'additive',scores},source));
  const loadout={...kit,secondary:'gp_31_grenade_pistol',grenade:'g_6_frag',
    stratagems:['support_mg_43_machine_gun',dog,'eagle_airstrike','orbital_gas_strike']};
  const r=evaluateAssessment(loadout,model,catalog);
  for(const role of SCORE_ROLES)assert.equal(r.dimensions[role].contributions.find(c=>c.equipment_id===dog)?.value,60,role);
  assert.notEqual(r.gates.heavy_pair.status,'PASS');assert.equal(r.acceptance_ready,false);
  assert.throws(()=>changeManualScores(empty(),{equipment_id:'deployable_autocannon_sentry',mode:'additive',scores:{demolition:60}},source));
  assert.throws(()=>changeManualScores(empty(),{equipment_id:'eagle_airstrike',mode:'additive',scores:{endurance:60}},source));
});
