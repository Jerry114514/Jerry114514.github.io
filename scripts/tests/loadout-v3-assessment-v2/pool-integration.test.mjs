import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ordinaryModes,projectileService} from '../../../shared/hd2-loadout/assessment-v2/projectile.mjs';
import {resourceWeapons,actionsFor,assessHeavyPairs} from '../../../shared/hd2-loadout/assessment-v2/engagement.mjs';
import {executeResourcePlan,loadedKey,ammoKey} from '../../../shared/hd2-loadout/assessment-v2/resources.mjs';
import {shotAt} from '../../../shared/hd2-loadout/assessment-v2/timing.mjs';
import {assessStrategic} from '../../../shared/hd2-loadout/assessment-v2/strategic.mjs';

const read = path=>JSON.parse(readFileSync(new URL('../../../'+path,import.meta.url)));
const model=read('shared/hd2-loadout/assessment-v2/equipment.json');
const coverage=read('shared/hd2-loadout/assessment-v2/coverage.json');
const row=id=>model.equipment.find(e=>e.equipment_id===id);
const light=model.scenario.chaff.map(({id,count})=>({target:model.targets[id],count}));
const step=(id,rounds,extra={})=>({weapon_id:id,rounds,prepare_ms:0,interval_ms:100,effect_delay_ms:0,...extra});

test('resolved reload evidence is consumed by the bound modes',()=>{
  assert.equal(row('p_44_mist').facts.reload_ms,2300);
  assert.equal(row('p_69_veto').facts.reload_ms,3300);
  assert.equal(row('support_gl_52_conciliator').facts.reload_ms,4250);
});

test('beam quantum costs actual time and fractional damage, not 20 full DPS hits each second',()=>{
  const dagger=row('las_7_dagger'),mode=ordinaryModes(dagger.facts)[0];
  assert.equal(mode.work_ms,50);
  assert.equal(mode.normal,12.5);
  const service=projectileService(mode,[{target:model.targets['scavenger:main'],count:1}],model.ap,{handling_policy:model.scenario.handling});
  assert.ok(service.first_to_last_ms>=service.shots*50+mode.warmup_ms);
  assert.throws(()=>shotAt({ready_at:0,interval_ms:1,work_ms:-1}),/INVALID_SHOT_CLOCK/);
});

test('finite heat sinks are spent once and a public box cannot create infinite stock',()=>{
  const item=row('las_7_dagger'),w=resourceWeapons([item])[0];
  assert.equal(w.renewable,false);
  const exhausted=executeResourcePlan({weapons:[w],providers:[],steps:[step(w.id,w.loaded+w.reserve+1)]});
  assert.equal(exhausted.status,'INSUFFICIENT');
  assert.equal(exhausted.state.resources[loadedKey(w.id)].value,0);
  assert.equal(exhausted.state.resources[ammoKey(w.id)].value,0);
});

test('passive thermal recovery waits for cooling and does not consume a supply box',()=>{
  const item=row('las_16_sickle'),w=resourceWeapons([item])[0];
  assert.equal(w.renewable,true);
  const short=executeResourcePlan({weapons:[w],providers:[],steps:[step(w.id,w.capacity)]});
  const longer=executeResourcePlan({weapons:[w],providers:[],steps:[step(w.id,w.capacity+1)]});
  assert.equal(longer.status,'COMPLETED');
  assert.ok(longer.elapsed_ms-short.elapsed_ms>=w.reload_ms);
  assert.deepEqual(longer.supplies_taken,[]);
});

test('Quasar cannot ignore its mandatory per-shot cooldown in the heavy window',()=>{
  const item=row('support_las_99_quasar_cannon'),mode=ordinaryModes(item.facts)[0];
  assert.equal(mode.reload_ms,15000);
  const w=resourceWeapons([item])[0];
  const result=executeResourcePlan({weapons:[w],providers:[],deadline_ms:20000,
    steps:[step(w.id,2,{charge_ms:mode.charge_ms,acquire_ms:1500,interval_ms:Math.ceil(60000/mode.rpm)})]});
  assert.equal(result.status,'INSUFFICIENT');
});

test('Trident six beams are one trigger and one heat debit',()=>{
  const mode=ordinaryModes(row('las_13_trident').facts)[0];
  assert.equal(mode.pellets,6);assert.equal(mode.normal,60);assert.equal(mode.heat_per_service_unit,10);
});

test('finite area packets spend real ammo and never deal damage to dead HP pools',()=>{
  const item=row('support_gl_21_grenade_launcher');
  const service=item.capabilities.modes.find(m=>m.chaff.area)?.chaff;
  assert.ok(service);assert.equal(service.area.audit.reduce((n,g)=>n+g.targets,0),28);
  assert.ok(service.area.audit.every(g=>g.remaining_hp.every(h=>h===0)));
  const steps=actionsFor(item,light,model.ap,model.scenario,model.targets);
  const w=resourceWeapons([item])[0];
  const executed=executeResourcePlan({weapons:[w],providers:[],steps});
  assert.equal(executed.status,'COMPLETED');
  assert.equal(w.loaded+w.reserve-executed.state.resources[loadedKey(w.id)].value-executed.state.resources[ammoKey(w.id)].value,service.shots);
});

test('thermite throws retain the delayed effect and finite grenade stock',()=>{
  const item=row('g_123_thermite'),mode=ordinaryModes(item.facts)[0];
  assert.equal(mode.detached_delay_ms,model.scenario.thermite_effect_ms);
  const w=resourceWeapons([item])[0];
  assert.equal(w.loaded,3);
  const one=executeResourcePlan({weapons:[w],providers:[],steps:[step(w.id,1,{charge_ms:model.scenario.throw_ms,effect_delay_ms:mode.detached_delay_ms})]});
  assert.ok(one.elapsed_ms>=10900);
});

test('knife and bolt pistol resolve their own source components',()=>{
  const knife=ordinaryModes(row('k_2_throwing_knife').facts)[0];
  assert.equal(knife.normal,300);assert.equal(knife.total,20);assert.equal(knife.charge_ms,1500);
  const bolt=ordinaryModes(row('p_40_k_bolt_pistol').facts)[0];
  assert.equal(bolt.unresolved_impact,false);assert.equal(bolt.explosion.normal,175);
});

test('arc grenade carrier cannot become ten free hits against a precise head',()=>{
  for(const id of ['support_gl_52_conciliator','g_31_arc']) {
    const mode=ordinaryModes(row(id).facts)[0];
    assert.equal(mode.normal,100);assert.ok(mode.pellets>1&&mode.pellets<mode.nominal_arc_count);assert.equal(mode.target_policy,'MAIN_ONLY');
    assert.ok(row(id).capabilities.modes[0].anti_medium.every(m=>m.route.measured_target.endsWith(':main')));
  }
});

test('mounted weapons keep distinct accounts and cannot refill from a supply backpack',()=>{
  const item=row('vehicle_exo_45_patriot_exosuit'),weapons=resourceWeapons([item]);
  assert.deepEqual(weapons.map(w=>w.loaded),[1350,14]);assert.notEqual(weapons[0].id,weapons[1].id);
  assert.equal(weapons[0].available_at_ms,10500);
  assert.ok(weapons.every(w=>w.refill.public===0&&w.refill.portable===0));
  const result=executeResourcePlan({weapons,providers:[],steps:[step(weapons[1].id,15)]});
  assert.equal(result.status,'INSUFFICIENT');assert.equal(result.state.resources[loadedKey(weapons[0].id)].value,1350);
  const one=executeResourcePlan({weapons,providers:[],steps:[step(weapons[0].id,1)],deadline_ms:10000});
  assert.equal(one.status,'INSUFFICIENT');
  const twins=resourceWeapons([row('vehicle_exo_49_emancipator_exosuit')]);
  assert.deepEqual(twins.map(w=>w.loaded),[100,100]);
});

test('supply vehicle turret and green demolition remain excluded',()=>{
  assert.deepEqual(resourceWeapons([row('vehicle_m_103_supply_fast_recon_vehicle')]),[]);
  for(const e of model.equipment.filter(e=>e.category==='deployable')) assert.deepEqual(e.facts.demolition_components,[]);
});

test('melee has contact costs and does not use a fictional supply ammunition pool',()=>{
  const saber=row('cqc_2_saber'),mode=ordinaryModes(saber.facts)[0];
  assert.equal(mode.rpm,150);assert.equal(mode.normal,188);assert.equal(mode.acquire_floor_ms,750);
  assert.equal(mode.target_policy,'MAIN_ONLY');
  const w=resourceWeapons([saber])[0];assert.equal(w.renewable,true);assert.equal(w.refill.public,0);
  assert.ok(saber.capabilities.modes[0].anti_medium.every(t=>t.route.measured_target.endsWith(':main')));
  assert.equal(saber.facts.stamina_cost_percent,3);
});

test('coverage follows calculation and keeps optional mechanisms separate',()=>{
  assert.equal(coverage.counts.equipment,200);
  const known=coverage.equipment.find(e=>e.equipment_id==='eagle_airstrike');
  assert.equal(known.role_states.chaff,'ENGINEERING_ESTIMATE');
  assert.ok(!known.implementation_bindings.includes('CALL_PAYLOAD_COVERAGE_AND_READINESS_TIMELINE'));
  const missing=coverage.equipment.find(e=>e.equipment_id==='eagle_500kg_bomb');
  assert.equal(missing.role_states.chaff,'UNRESOLVED');assert.ok(missing.source_fields_to_resolve.includes('DETONATION_DELAY_REQUIRED'));
  assert.equal(row('g_3_smoke').dimensions.chaff.score,0);
  assert.equal(row('backpack_sh_32_shield_generator_pack').dimensions.close_defense.state,'UNRESOLVED');
});

test('red/green medium packets use Main and cluster bombs select their child payload',()=>{
  const cluster=row('eagle_cluster_bomb');
  assert.equal(cluster.strategic_profile.payload_per_call,72);
  assert.equal(cluster.strategic_profile.payload_mode_id,'P13');
  const medium=assessStrategic(cluster,model).find(x=>x.role==='anti_medium').contribution;
  assert.equal(medium.status,'KNOWN');
  const edited=structuredClone(model);edited.targets['alpha_commander:head'].hp=1;
  assert.equal(assessStrategic(cluster,edited).find(x=>x.role==='anti_medium').contribution.value,medium.value);
});
