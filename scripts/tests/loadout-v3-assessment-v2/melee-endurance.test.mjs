import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MELEE_EQUIPMENT_IDS,isMeleeEquipment} from '../../../shared/hd2-loadout/assessment-v2/score-exclusions.mjs';
import {totalDamageEndurance} from '../../../shared/hd2-loadout/assessment-v2/endurance-total.mjs';
import {baselineWeaponEndurance,assessLoadoutEndurance,applySupplyEnduranceFloor} from '../../../shared/hd2-loadout/assessment-v2/loadout-endurance.mjs';
import {lockedScoreRoles,changeManualScores} from '../../../shared/hd2-loadout/assessment-v2/manual-scores.mjs';
import {evaluateAssessment} from '../../../shared/hd2-loadout/assessment-v2/evaluate.mjs';

const read=name=>JSON.parse(readFileSync(new URL('../../../shared/hd2-loadout/'+name,import.meta.url)));
const model=read('assessment-v2/equipment.json'),catalog=read('data/catalog.json');
const get=id=>{const row=model.equipment.find(r=>r.equipment_id===id);assert.ok(row,id);return row;};

test('all nine melee weapons have zero endurance in every supply context, including charged hammer',()=>{
  assert.deepEqual(model.equipment.filter(r=>/^(support_)?cqc_/.test(r.equipment_id)).map(r=>r.equipment_id).sort(),[...MELEE_EQUIPMENT_IDS].sort());
  for(const id of MELEE_EQUIPMENT_IDS){
    const row=get(id),rating=totalDamageEndurance(row,null,model);
    assert.equal(row.endurance.score,0,id);assert.equal(row.calculated_scores.endurance,0,id);
    assert.equal(rating.score,0,id);assert.ok(Object.values(rating.scenarios).every(s=>s.score===0),id);
    assert.equal(baselineWeaponEndurance({...row,endurance:{...row.endurance,score:100}},model).score,0,id);
    assert.match(lockedScoreRoles(row).endurance,/近战/);
  }
  assert.equal(get('support_cqc_20_breaching_hammer').facts.inventory.total,11,'real charged ammo retained');
  assert.equal(isMeleeEquipment(get('las_7_dagger')),false,'energy firearm is not melee');
  assert.equal(isMeleeEquipment(get('k_2_throwing_knife')),false,'throwables keep their own use-count policy');
});

test('melee never enters the routine pool or a mean denominator; supplies still affect the final result',()=>{
  const gun=get('ar_23_liberator'),melee=MELEE_EQUIPMENT_IDS.map(get);
  const alone=assessLoadoutEndurance([gun],model),withMelee=assessLoadoutEndurance([gun,...melee],model);
  assert.deepEqual(withMelee.items,alone.items);assert.equal(withMelee.score,alone.score);
  assert.equal(withMelee.excluded.filter(r=>r.reason==='MELEE_EXCLUDED_FROM_ENDURANCE').length,9);
  assert.equal(assessLoadoutEndurance(melee,model).items.length,0);
  assert.equal(assessLoadoutEndurance(melee,model).score,0);
  const supplied=applySupplyEnduranceFloor({score:withMelee.score},[gun,...melee,get('backpack_b_1_supply_pack')]);
  assert.equal(supplied.score,100);
});

test('old additive melee values cannot enter loadout endurance, and new manual nonzero values are rejected',()=>{
  const id='cqc_42_machete',copy=structuredClone(model),row=copy.equipment.find(r=>r.equipment_id===id);
  row.endurance.score=100;row.endurance.score_origin='MANUAL_CALIBRATED';
  row.manual_calibration={mode:'additive',scores:{endurance:100}};
  const kit={primary:'plas_1_scorcher',secondary:id,grenade:'g_48_giga_grenade',
    stratagems:['support_mg_43_machine_gun','orbital_precision_strike','deployable_gas_mines','deployable_flame_sentry']};
  const result=evaluateAssessment(kit,copy,catalog),without=evaluateAssessment(kit,copy,catalog,{disabled_contributions:[id]});
  assert.equal(result.dimensions.endurance.score,without.dimensions.endurance.score);
  assert.ok(!result.dimensions.endurance.contributions.some(c=>c.equipment_id===id));
  assert.ok(!result.endurance_assessment.items.some(c=>c.equipment_id===id));
  const empty={schema:1,overrides:{},history:[]};
  assert.throws(()=>changeManualScores(empty,{equipment_id:id,scores:{endurance:100}},model),/近战/);
  assert.equal(changeManualScores(empty,{equipment_id:id,scores:{endurance:0}},model).overrides[id].scores.endurance,0);
});
