import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessStrategic} from '../../../shared/hd2-loadout/assessment-v2/strategic.mjs';
import {assessMixedEndurance} from '../../../shared/hd2-loadout/assessment-v2/engagement.mjs';
import {suppliedGrenadeAdditions} from '../../../shared/hd2-loadout/assessment-v2/grenade-chaff.mjs';
import {equipmentHeavy} from '../../../shared/hd2-loadout/assessment-v2/equipment-review.mjs';
const model=JSON.parse(readFileSync(new URL('../../../shared/hd2-loadout/assessment-v2/equipment.json',import.meta.url)));
const row=id=>model.equipment.find(r=>r.equipment_id===id);

test('independent nominal feeds sum once and unknown flame direct damage stays unknown',()=>{
  const r=row('smg_flam_34_stoker'),s=r.endurance.rating.scenarios.public;
  assert.equal(s.independent_accounts.length,2);
  const accountTotals=r.endurance.rating.modes.map(m=>m.scenarios.public.standard_damage);
  assert.equal(s.standard_damage,accountTotals.reduce((a,b)=>a+b,0));
  const lumber=row('vehicle_exo_51_lumberjack_exosuit');
  assert.equal(lumber.endurance.rating.scenarios.public.partial,true);
  const fire=lumber.capabilities.modes.find(m=>m.mode_id.includes('FLAMETHROWER'));
  assert.equal(fire.chaff.count,20);assert.equal(fire.chaff.requested_count,28);
  assert.equal(fire.chaff.sustained.status,'FINITE_ONLY');
  assert.ok(fire.anti_medium.every(m=>m.status==='UNKNOWN'));
});

test('known nominal ammo can score without inventing automatic reload or blast timing',()=>{
  const dog=row('backpack_ax_ar_23_guard_dog');
  assert.equal(dog.endurance.rating.scenarios.public.standard_damage,765*65);
  assert.equal(dog.capabilities.modes.length,0);
  assert.equal(dog.automatic_assessments[0].contribution.status,'UNKNOWN');
  const breacher=row('p_34_breacher');
  assert.equal(breacher.endurance.rating.scenarios.public.standard_damage,4*2060);
  assert.equal(breacher.endurance.rating.scenarios.public.durable_damage,4*2000);
  assert.ok(breacher.dimensions.chaff.score>0);
  assert.equal(breacher.facts.modes[0].detached_delay_ms,4000);
});

test('strategic gas pressure changes only score index, preserving damage work and coverage',()=>{
  const gas=row('orbital_gas_strike'),off=structuredClone(model);
  off.scenario.cloud.pressure_control.residual_threat_fraction=1;
  const a=assessStrategic(gas,model)[0].contribution,b=assessStrategic(gas,off)[0].contribution;
  assert.ok(a.pressure_index_multiplier>1);assert.equal(b.pressure_index_multiplier,1);
  assert.deepEqual(a.physical,b.physical);
  assert.equal(a.coverage_value,b.coverage_value);
  assert.ok(a.value>b.value);
  assert.ok(row('deployable_gas_mines').facts.effects.some(e=>e.id==='Gas_Confusion'));
  assert.ok(row('deployable_incendiary_mines').facts.effects.some(e=>e.id==='Fire'));
});

test('close continuous heavy penalty applies once without changing physical two-kill timing',()=>{
  const r=row('support_40_k_thermal_gun'),flat=structuredClone(model);
  flat.scenario.heavy_scoring.close_continuous_factor=1;
  const a=equipmentHeavy(r,model),b=equipmentHeavy(r,flat);
  assert.ok(Math.abs(a.score-b.score*.7)<.02);
  for(let i=0;i<a.cases.length;i++)assert.deepEqual(a.cases[i].best?.public,b.cases[i].best?.public);
});

test('pack and nearby car grenade additions consume finite shared boxes once and respect manual values',()=>{
  for(const id of ['backpack_b_1_supply_pack','vehicle_m_103_supply_fast_recon_vehicle']){
    const rows=['support_mg_43_machine_gun','plas_1_scorcher','g_16_impact',id].map(row);
    const plan=assessMixedEndurance(rows,model),[a]=suppliedGrenadeAdditions(rows,model,plan);
    assert.equal(a.finite_supply.status,'EXECUTED');
    assert.equal(a.finite_supply.recurs,false);assert.equal(a.finite_supply.gate_credit,false);
    assert.equal(a.finite_supply.extra_completed_grenades,id.startsWith('backpack')?15:24);
    assert.equal(a.finite_supply.supplies_taken.filter(x=>x.provider_id==='public').length,1);
    assert.ok(a.contribution.value>rows[2].dimensions.chaff.score);
    const manual=structuredClone(rows);manual[2].dimensions.chaff={score:19,score_origin:'MANUAL_CALIBRATED'};
    assert.equal(suppliedGrenadeAdditions(manual,model,plan)[0].contribution.value,19);
  }
});
