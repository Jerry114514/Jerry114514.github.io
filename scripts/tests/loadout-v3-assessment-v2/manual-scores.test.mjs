import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {changeManualScores,applyManualScores,validateManualScores} from '../../../shared/hd2-loadout/assessment-v2/manual-scores.mjs';
import {assessStrategic} from '../../../shared/hd2-loadout/assessment-v2/strategic.mjs';
import {assessmentCoverage} from '../../../shared/hd2-loadout/assessment-v2/coverage.mjs';
import {combinedMedium,evaluateAssessment} from '../../../shared/hd2-loadout/assessment-v2/evaluate.mjs';
const model=JSON.parse(readFileSync(new URL('../../../shared/hd2-loadout/assessment-v2/equipment.json',import.meta.url)));
const catalog=JSON.parse(readFileSync(new URL('../../../shared/hd2-loadout/data/catalog.json',import.meta.url)));
const empty=()=>({schema:1,overrides:{},history:[]});

test('manual scores preserve raw calculations, physics and history; null restores automatic values',()=>{
  const id='sg_8p_punisher_plasma',original=model.equipment.find(r=>r.equipment_id===id);
  const first=changeManualScores(empty(),{equipment_id:id,scores:{chaff:77,anti_medium:81},note:'人工验收'},model,'test-time');
  const copy=structuredClone(model);applyManualScores(copy,first);
  const r=copy.equipment.find(r=>r.equipment_id===id);
  assert.equal(r.dimensions.chaff.score,77);assert.equal(r.dimensions.chaff.calculated_score,original.dimensions.chaff.score);
  assert.equal(r.dimensions.chaff.state,'MANUAL_CALIBRATED');
  assert.deepEqual(r.calculated_scores,original.calculated_scores);
  assert.deepEqual(r.facts,original.facts);assert.deepEqual(r.capabilities,original.capabilities);
  const restored=changeManualScores(first,{equipment_id:id,scores:{chaff:null,anti_medium:null}},copy,'test-restore');
  assert.equal(restored.overrides[id],undefined);assert.equal(restored.history.length,2);
  assert.equal(restored.history[1].before.scores.chaff,77);assert.equal(restored.history[1].after,null);
  const rebuild=structuredClone(model);applyManualScores(rebuild,restored);
  assert.equal(rebuild.equipment.find(r=>r.equipment_id===id).dimensions.chaff.score,original.dimensions.chaff.score);
});

test('manual final Eagle bonuses are not multiplied by coverage or class factors again',()=>{
  const id='eagle_airstrike',doc=changeManualScores(empty(),{equipment_id:id,scores:{chaff:12,anti_medium:9,close_defense:2}},model);
  const copy=structuredClone(model);applyManualScores(copy,doc);
  const r=copy.equipment.find(r=>r.equipment_id===id),result=assessStrategic(r,copy);
  assert.equal(result.find(x=>x.role==='chaff').contribution.value,12);
  assert.equal(result.find(x=>x.role==='anti_medium').contribution.value,9);
  assert.equal(result.find(x=>x.role==='close_defense').contribution.value,2);
  assert.equal(result[0].contribution.calculated_value,r.calculated_scores.chaff);
});

test('manual corrections cannot claim missing source mechanisms are complete or revoke explicit zero rules',()=>{
  const id='eagle_500kg_bomb',copy=structuredClone(model);
  applyManualScores(copy,changeManualScores(empty(),{equipment_id:id,scores:{chaff:10,anti_medium:10}},model));
  const before=assessmentCoverage([model.equipment.find(r=>r.equipment_id===id)],model).equipment[0];
  const after=assessmentCoverage([copy.equipment.find(r=>r.equipment_id===id)],copy).equipment[0];
  assert.deepEqual(after.role_states,before.role_states);assert.deepEqual(after.source_fields_to_resolve,before.source_fields_to_resolve);
  for(const change of [
    {equipment_id:'eagle_airstrike',scores:{endurance:1}},
    {equipment_id:'deployable_autocannon_sentry',scores:{demolition:1}},
    {equipment_id:'g_3_smoke',scores:{chaff:1}},
    {equipment_id:'sg_8p_punisher_plasma',scores:{chaff:-1}},
    {equipment_id:'sg_8p_punisher_plasma',scores:{chaff:Infinity}},
    {equipment_id:'sg_8p_punisher_plasma',scores:{chaff:'75'}},
    {equipment_id:'unknown',scores:{chaff:75}},
  ])assert.throws(()=>changeManualScores(empty(),change,model));
  assert.throws(()=>validateManualScores({schema:1,overrides:[],history:[]},model));
});

test('manual medium reduction is not silently replaced by the same gun automatic combination score',()=>{
  const id='plas_1_scorcher',copy=structuredClone(model);
  applyManualScores(copy,changeManualScores(empty(),{equipment_id:id,scores:{anti_medium:20}},model));
  assert.equal(combinedMedium([copy.equipment.find(r=>r.equipment_id===id)],copy).score,null);
  const loadout={primary:id,secondary:'gp_20_ultimatum',grenade:'g_48_giga_grenade',
    stratagems:['support_spear','backpack_b_1_supply_pack','deployable_gas_mines','deployable_flame_sentry']};
  const original=evaluateAssessment(loadout,model,catalog),manual=evaluateAssessment(loadout,copy,catalog);
  assert.deepEqual(original.gates.heavy_pair,manual.gates.heavy_pair);
  assert.deepEqual(original.gates.demolition,manual.gates.demolition);
  assert.equal(manual.eligible_for_draw,false);
});
