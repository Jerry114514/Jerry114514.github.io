import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {grenadeChaff,grenadeChaffAddition} from '../../../shared/hd2-loadout/assessment-v2/grenade-chaff.mjs';
import {ordinaryCapabilities,scoreOrdinary} from '../../../shared/hd2-loadout/assessment-v2/projectile.mjs';
import {summarizeLoadout} from '../../../shared/hd2-loadout/assessment-v2/aggregate.mjs';
import {evaluateAssessment} from '../../../shared/hd2-loadout/assessment-v2/evaluate.mjs';
const model=JSON.parse(readFileSync(new URL('../../../shared/hd2-loadout/assessment-v2/equipment.json',import.meta.url)));
const get=id=>model.equipment.find(r=>r.equipment_id===id);
const reference=get(model.references.chaff);
const raw=id=>{const row=structuredClone(get(id));row.dimensions.chaff=scoreOrdinary(row.capabilities,reference.capabilities,{role:'chaff'});return row;};

test('grenade chaff declines with supply CD and follows each item refill, not initial stock',()=>{
  const row=raw('g_16_impact'),base=grenadeChaff(row,reference,model.scenario);
  assert.ok(base.score>0&&base.score<base.bare_score/4);
  assert.equal(base.refill_rounds,3);assert.equal(base.initial_rounds,(row.facts.service_inventory??row.facts.inventory).total);
  const slow=structuredClone(model.scenario);slow.supply.grenade_renewal.cooldown_ms*=2;
  assert.ok(grenadeChaff(row,reference,slow).score<base.score);
  const more=structuredClone(row);(more.facts.service_refill??more.facts.refill).public=4;
  assert.ok(grenadeChaff(more,reference,model.scenario).score>base.score);
  const pocket=structuredClone(row);(pocket.facts.service_inventory??pocket.facts.inventory).total+=100;
  assert.equal(grenadeChaff(pocket,reference,model.scenario).score,base.score);
});

test('missing refill is unknown, documented zero is zero, manual final additions are not multiplied again',()=>{
  const row=raw('g_16_impact'),missing=structuredClone(row);(missing.facts.service_refill??missing.facts.refill).public=null;
  assert.equal(grenadeChaff(missing,reference,model.scenario).state,'UNRESOLVED');
  const zero=structuredClone(row);(zero.facts.service_refill??zero.facts.refill).public=0;
  assert.equal(grenadeChaff(zero,reference,model.scenario).score,0);
  const manual=structuredClone(get('g_16_impact'));manual.dimensions.chaff={score:17,state:'MANUAL_CALIBRATED',score_origin:'MANUAL_CALIBRATED'};
  const [add]=grenadeChaffAddition(manual);assert.equal(add.contribution.value,17);
  const summary=summarizeLoadout({ordinary:[{equipment_id:'gun',role:'chaff',score:50,state:'ENGINEERING_ESTIMATE'}],
    strategic:[add],thresholds:{chaff:60,close_defense:60,anti_medium:null}});
  assert.equal(summary.dimensions.chaff.selected_ordinary,'gun');
  assert.equal(summary.dimensions.chaff.base_score,50);assert.equal(summary.dimensions.chaff.total_before_display,67);
});

test('gas grenade uses its finite sourced field, pays each cloud and retains poisoning delay',()=>{
  const row=get('g_4_gas'),dense=row.capabilities.modes.find(m=>m.chaff.cloud).chaff;
  assert.equal(dense.cloud.damage_per_second,25);assert.equal(dense.cloud.exposure_seconds,15);
  assert.equal(dense.cloud.initial_clouds,1);assert.equal(dense.count,28);
  assert.equal(dense.action_plan.reduce((n,a)=>n+a.rounds,0),dense.shots);
  assert.ok(dense.cloud.targets.every(t=>t.distance_m<=dense.cloud.radius_m));
  assert.ok(dense.neutralized_at_ms>dense.first_to_last_ms-1);
  assert.equal(dense.cloud.control.counts_as_instant_safety,false);
  const sparse=ordinaryCapabilities(row.facts,model.targets,model.ap,{...model.scenario,area:{spacing_samples_m:[5]}})
    .modes.find(m=>m.chaff.cloud).chaff;
  assert.ok(sparse.cloud.initial_clouds>dense.cloud.initial_clouds);
  assert.ok(sparse.shots>dense.shots);
  assert.equal(sparse.count,dense.count);
  assert.equal(get('support_spear').capabilities.modes.find(m=>m.chaff.cloud).chaff.cloud.packet_size,7);
});

test('gas confusion reduces pressure once without inventing damage, kills, ammo or safety',()=>{
  const row=get('g_4_gas'),withControl=row.capabilities;
  const scenario=structuredClone(model.scenario);scenario.cloud.pressure_control.residual_threat_fraction=1;
  const noControl=ordinaryCapabilities(row.facts,model.targets,model.ap,scenario);
  const a=withControl.modes[0].chaff,b=noControl.modes[0].chaff;
  assert.equal(a.shots,b.shots);assert.equal(a.neutralized_at_ms,b.neutralized_at_ms);
  assert.equal(a.cloud.status_kills,b.cloud.status_kills);assert.deepEqual(a.action_plan,b.action_plan);
  assert.ok(a.pressure.score_ratio_gain>1);assert.equal(b.pressure.score_ratio_gain,1);
  assert.ok(a.pressure.avoided_enemy_ms<a.pressure.uncontrolled_enemy_ms);
  assert.equal(a.pressure.counts_as_kills,false);assert.equal(a.pressure.counts_as_safety,false);
  const getScore=cap=>scoreOrdinary(cap,reference.capabilities,{role:'chaff'}).score;
  assert.ok(getScore(withControl)>getScore(noControl));
  const candidate={...row,capabilities:noControl,dimensions:{chaff:scoreOrdinary(noControl,reference.capabilities,{role:'chaff'})}};
  const pureDamage=grenadeChaff(candidate,reference,model.scenario);
  assert.equal(pureDamage.coverage_value,row.grenade_chaff.coverage_value,'control cannot conjure extra grenade stock or kills');
  assert.ok(pureDamage.score<row.grenade_chaff.score);
});

test('real seven-slot evaluation keeps even a high manual grenade bonus out of the ordinary gun slot',()=>{
  const catalog=JSON.parse(readFileSync(new URL('../../../shared/hd2-loadout/data/catalog.json',import.meta.url)));
  const modified=structuredClone(model),grenade=modified.equipment.find(r=>r.equipment_id==='g_6_frag');
  grenade.dimensions.chaff.score=105;grenade.dimensions.chaff.state='MANUAL_CALIBRATED';
  grenade.dimensions.chaff.score_origin='MANUAL_CALIBRATED';
  const loadout={primary:'ar_23_liberator',secondary:'gp_20_ultimatum',grenade:'g_6_frag',
    stratagems:['support_mg_43_machine_gun','backpack_b_1_supply_pack','eagle_airstrike','orbital_gas_strike']};
  const result=evaluateAssessment(loadout,modified,catalog);
  assert.notEqual(result.dimensions.chaff.selected_ordinary,'g_6_frag');
  assert.equal(result.dimensions.chaff.grenade_bonus,105);
  assert.notEqual(result.gates.shared_resources.light_weapon,'g_6_frag');
});
