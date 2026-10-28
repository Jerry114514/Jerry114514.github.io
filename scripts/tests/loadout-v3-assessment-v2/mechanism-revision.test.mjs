import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ordinaryModes,ordinaryCapabilities,scoreOrdinary} from '../../../shared/hd2-loadout/assessment-v2/projectile.mjs';
import {arcEquivalentContacts} from '../../../shared/hd2-loadout/assessment-v2/service-modes.mjs';
import {childBurstAt} from '../../../shared/hd2-loadout/assessment-v2/children.mjs';
import {combatResources,reloadWeapon} from '../../../shared/hd2-loadout/assessment-v2/resources.mjs';
import {resourceWeapons,heavyRoutes} from '../../../shared/hd2-loadout/assessment-v2/engagement.mjs';
import {demolitionResources} from '../../../shared/hd2-loadout/assessment-v2/demolition.mjs';
const m=JSON.parse(readFileSync(new URL('../../../shared/hd2-loadout/assessment-v2/equipment.json',import.meta.url)));
const row=id=>m.equipment.find(r=>r.equipment_id===id);

test('G31 nominal 50 arcs retain independent corpse and empty-bounce losses',()=>{
  const r=row('g_31_arc'),mode=ordinaryModes(r.facts)[0],p=mode.arc_policy;
  assert.equal(p.bolts*p.pulses,50);assert.equal(mode.nominal_arc_count,50);
  assert.ok(Math.abs(mode.pellets-9)<1e-8);
  assert.ok(Math.abs(arcEquivalentContacts(p)-9)<1e-8);
  assert.equal(arcEquivalentContacts({...p,pulse_location_factors:[1,1,1,1,1]}),25);
  assert.ok(Math.abs(arcEquivalentContacts({...p,live_target_fraction:1})-18)<1e-8);
  const actions=r.capabilities.modes[0].chaff.action_plan;
  assert.ok(actions.length>0&&actions.every(a=>a.effect_delay_ms>=7000));
  assert.equal(r.endurance.modes[0].standard_damage_per_round,5000,'nominal total does not silently become realized damage');
  assert.ok(heavyRoutes(r,'bile_titan',m).every(r=>r.route==='DISTRIBUTED_MAIN_HP'&&r.rounds>1),'area arcs cannot converge freely on a lethal head');
});

test('GL52 pays one round for ten nominal primary arcs and no invented branches',()=>{
  const r=row('support_gl_52_conciliator'),mode=ordinaryModes(r.facts)[0];
  assert.equal(mode.nominal_arc_count,10);assert.equal(mode.pellets,5);
  assert.deepEqual(mode.arc_policy.chains,[1]);
  assert.ok(r.capabilities.modes[0].chaff.action_plan.every(a=>a.rounds===1));
  assert.ok(r.capabilities.modes[0].close_defense.status!=='ESTIMATE','unresolved self exposure is not free safe close defense');
  const reduced=structuredClone(r.facts),candidate=ordinaryModes(reduced)[0];
  candidate.arc_policy.live_target_fraction=.25;candidate.pellets=arcEquivalentContacts(candidate.arc_policy);
  assert.equal(candidate.pellets,2.5);
  assert.ok(ordinaryCapabilities(reduced,m.targets,m.ap,m.scenario).modes[0].anti_medium.every(x=>x.status==='ESTIMATE'),
    'fractional realized budgets are not missing source pellet counts');
});

test('burning ammunition keeps direct fallback and accumulates a single nonstacking fire pool',()=>{
  const r=row('ar_2_coyote'),service=r.capabilities.modes[0].chaff;
  assert.equal(service.status,'ESTIMATE');assert.ok(service.area.fire.damage>0);
  assert.ok(service.action_plan.some(a=>a.acquire_ms===0),'continuous fire does not reacquire every round');
  const off=structuredClone(r.facts);
  for(const mode of off.modes){mode.direct_status_effects=[];mode.status_applications=[];}
  const caps=ordinaryCapabilities(off,m.targets,m.ap,m.scenario),ref=row(m.references.chaff);
  const without=scoreOrdinary(caps,ref.capabilities,{role:'chaff',primary:true,reference_primary:false}).score;
  assert.ok(r.dimensions.chaff.score>without);
});

test('heat weapons spend finite fast sinks then pay the full passive cooldown',()=>{
  for(const id of ['las_12_sai','las_13_trident']){
    const r=row(id),mode=ordinaryModes(r.facts)[0],w=resourceWeapons([r])[0];
    assert.ok(mode.finite_heat_sinks&&w.reserve>0&&w.cooling_ms>w.reload_ms);
    let state=combatResources([w],[]);state.resources[`loaded:${id}`].value=0;
    const fast=reloadWeapon(state,w);assert.equal(fast.state.time,w.reload_ms);
    assert.equal(fast.state.resources[`ammo:${id}`].value,w.reserve-w.capacity);
    state=combatResources([w],[]);state.resources[`loaded:${id}`].value=0;state.resources[`ammo:${id}`].value=0;
    const slow=reloadWeapon(state,w);assert.equal(slow.state.time,w.cooling_ms);
    assert.equal(slow.state.resources[`ammo:${id}`].value,0);
  }
  const trident=ordinaryModes(row('las_13_trident').facts)[0];
  assert.equal(trident.pellets,6);assert.ok(!trident.direct_status_effects?.some(e=>e.id==='Fire'));
});

test('exploding children use their own finite contacts without parent blast damage',()=>{
  for(const [id,count] of [['heavy_support_rl_77_airburst_rocket_launcher',25],['orbital_airburst_strike',12]]){
    const mode=row(id).facts.modes.find(x=>x.child_pattern),target=m.targets['warrior:main'];
    assert.equal(mode.child_payload.count,count);
    const hit=childBurstAt(mode,target,m.ap);
    assert.ok(hit.damage>0&&hit.contacts<count);
    assert.equal(childBurstAt({...mode,explosion:{normal:999999,durable:999999,pen:10}},target,m.ap).damage,hit.damage);
    assert.equal(childBurstAt(mode,target,m.ap,[100,100]).damage,0);
  }
});

test('P34 waits its user fuse and C4 shares one finite inventory with demolition',()=>{
  const p=ordinaryModes(row('p_34_breacher').facts)[0];
  assert.equal(p.detached_delay_ms,4000);assert.equal(p.explosion.normal,2000);assert.equal(p.attached_thermite.duration_s,4);
  const r=row('backpack_b_md_c4_pack'),c=ordinaryModes(r.facts)[0];
  assert.equal(c.detached_delay_ms,0);assert.ok(c.charge_ms>0);
  assert.equal(resourceWeapons([r]).filter(w=>w.equipment_id===r.equipment_id).length,1);
  assert.equal(demolitionResources([r],m).filter(w=>w.equipment_id===r.equipment_id||w.id===r.equipment_id).length,1);
});
