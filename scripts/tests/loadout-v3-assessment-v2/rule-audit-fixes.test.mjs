import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessFiveHoles} from '../../../shared/hd2-loadout/assessment-v2/demolition.mjs';
import {enduranceTrials} from '../../../shared/hd2-loadout/assessment-v2/endurance.mjs';
const model=JSON.parse(readFileSync(new URL('../../../shared/hd2-loadout/assessment-v2/equipment.json',import.meta.url)));
const row=id=>model.equipment.find(r=>r.equipment_id===id);

test('explicit Partial rows enable top-up outside the original pump whitelist without forcing a slower strategy',()=>{
  const evictor=row('gl_15_evictor'),veto=row('p_69_veto');
  assert.equal(evictor.facts.modes[0].round_reload_profile.partial_one_ms,500);
  assert.equal(evictor.capabilities.modes[0].chaff.sustained.strategy,'top_up_one');
  assert.equal(evictor.capabilities.modes[0].chaff.sustained.pattern_ms,4000);
  assert.equal(veto.facts.modes[0].round_reload_profile.partial_one_ms,2100);
  assert.equal(veto.capabilities.modes[0].chaff.sustained.strategy,'full_empty');
  assert.equal(row('p_4_senator').facts.modes[0].round_reload_profile,undefined);
});

test('five-hole loadout checks recognize paid mounted accounts belonging to the selected exosuit',()=>{
  for(const id of ['vehicle_exo_45_patriot_exosuit','vehicle_exo_49_emancipator_exosuit','vehicle_exo_51_lumberjack_exosuit']){
    const r=row(id);
    assert.equal(r.demolition_assessment.best.public.status,'COMPLETED',id);
    assert.equal(assessFiveHoles([r],model).status,'PASS',id);
  }
  assert.notEqual(assessFiveHoles([row('vehicle_m_103_supply_fast_recon_vehicle')],model).status,'PASS');
});

test('finite expendable opening has a bounded partial cohort; independently unsafe close use stays zero',()=>{
  for(const id of ['support_eat_17_expendable_anti_tank','support_eat_411_leveller','support_eat_700_incendiary','support_mls_4x_commando','vehicle_exo_55_breakthrough_exosuit']){
    const r=row(id);
    assert.ok(Number.isFinite(r.dimensions.chaff.score)&&r.dimensions.chaff.score>0,id);
    const mode=r.capabilities.modes.find(m=>m.mode_id===r.dimensions.chaff.mode_id);
    assert.equal(mode.chaff.partial_cohort,true,id);
    assert.ok(mode.chaff.count<mode.chaff.requested_count,id);
    const source=(r.facts.service_modes??r.facts.modes).find(m=>m.mode_id===mode.mode_id);
    assert.ok(mode.chaff.shots<=source.capacity,id);
  }
  assert.equal(row('support_eat_700_incendiary').dimensions.close_defense.score,0);
  assert.equal(row('g_4_gas').dimensions.close_defense.score,0);
});

test('exhausted thermite endurance probes retain delayed effects after the last throwing action',()=>{
  const result=enduranceTrials(row('g_123_thermite'),model).find(t=>t.role==='chaff').scenarios.initial;
  assert.equal(result.status,'INSUFFICIENT');
  assert.equal(result.actions_elapsed_ms,4800);
  assert.equal(result.elapsed_ms,14200);
  assert.equal(result.completed_effect_actions_at_stop,0);
  assert.equal(result.completed_actions,3);
});
