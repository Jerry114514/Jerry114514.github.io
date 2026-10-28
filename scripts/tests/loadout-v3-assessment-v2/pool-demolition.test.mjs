import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {demolitionCapability,demolitionResources,demolitionRoutes,assessFiveHoles} from '../../../shared/hd2-loadout/assessment-v2/demolition.mjs';
const model=JSON.parse(readFileSync(new URL('../../../shared/hd2-loadout/assessment-v2/equipment.json',import.meta.url)));
const row=id=>structuredClone(model.equipment.find(r=>r.equipment_id===id));

test('red call accepts an inside route and pays at most one use per hole',()=>{
  for(const id of ['eagle_strafing_run','orbital_gatling_barrage','orbital_napalm_barrage']){
    const r=row(id), routes=demolitionRoutes(r,model.scenario), res=demolitionResources([r]).find(x=>x.id===id);
    assert.equal(routes.length,1); assert.match(routes[0].route,/^inside_/); assert.equal(routes[0].rounds,1);
    assert.match(routes[0].placement,/ONE_HOLE_PER_CALL/);assert.ok(res.loaded>0);
  }
  const eagle=row('eagle_strafing_run');assert.equal(assessFiveHoles([eagle],model).status,'PASS');
  const orbital=row('orbital_gatling_barrage');assert.equal(assessFiveHoles([orbital],model).status,'UNKNOWN');
  for(const c of orbital.facts.demolition_components)c.force=19;
  assert.equal(demolitionRoutes(orbital,model.scenario).length,0);
});

test('independent component feeds use only proven inventory, never the primary or vehicle gun feed',()=>{
  for(const [id,component,stock] of [
    ['ar_gl_21_one_two','GP-31_P_IE',4],
    ['support_ms_11_missile_silo','SOLO_SILO_EImpact',1],['vehicle_td_110_maelstrom','SWP_MAELSTROMIII_E',20]]){
    const r=row(id), route=demolitionRoutes(r,model.scenario).find(x=>x.component_id===component);
    assert.ok(route);assert.equal(route.inventory_only,true);assert.match(route.weapon_id,/#demolition_/);
    const feed=demolitionResources([r]).find(x=>x.id===route.weapon_id);
    assert.equal(feed.loaded,stock);assert.equal(feed.reserve,0);
    assert.equal(feed.equipment_id,id);
  }
  const under=row('ar_gl_21_one_two'),noSupply=structuredClone(model);noSupply.scenario.supply.public_boxes=0;
  assert.equal(assessFiveHoles([under],noSupply).status,'UNKNOWN');
  assert.equal(assessFiveHoles([under],model).status,'PASS');
  const underFeed=demolitionResources([under]).find(x=>x.id.includes('#demolition_underbarrel'));
  assert.equal(underFeed.capacity,6);assert.equal(underFeed.refill.public,5);
  const hammer=row('support_cqc_20_breaching_hammer'),hammerFeed=demolitionResources([hammer]).find(x=>x.id===hammer.equipment_id);
  assert.equal(hammerFeed.loaded,1);assert.equal(hammerFeed.reserve,10);assert.equal(hammerFeed.reload_ms,900);
  assert.equal(hammerFeed.refill.public,10);assert.equal(hammerFeed.refill.portable,7);
  assert.equal(assessFiveHoles([hammer],noSupply).status,'PASS');
  const tank=row('vehicle_td_110_maelstrom'),result=assessFiveHoles([tank],model);
  assert.equal(result.status,'PASS');assert.equal(result.plan.length,5);assert.ok(result.plan.every(x=>x.component_id==='SWP_MAELSTROMIII_E'));
  assert.match(result.timing_status,/INVENTORY_ONLY/);
});

test('a bound service account replaces the fallback without duplicating ammunition',()=>{
  const r=row('ar_gl_21_one_two'),id=`${r.equipment_id}#real_underbarrel`;
  r.facts.extra_accounts=[{id,equipment_id:r.equipment_id,loaded:1,capacity:1,reserve:3,reserve_capacity:5,
    feed:'magazine',reload_ms:1000,refill:{public:5,portable:5}}];
  const mode=structuredClone(r.facts.modes.find(m=>m.mode_id==='GP-31_P'));
  Object.assign(mode,{feed_bound:true,resource_id:id});r.facts.service_modes=[mode];
  const resources=demolitionResources([r]),routes=demolitionRoutes(r,model.scenario);
  assert.ok(resources.some(x=>x.id===id));assert.ok(!resources.some(x=>x.id.includes('#demolition_underbarrel')));
  assert.ok(routes.some(x=>x.component_id==='GP-31_P_IE'&&x.weapon_id===id));
  assert.ok(!routes.some(x=>x.weapon_id.includes('#demolition_underbarrel')));
  const thermal=row('support_40_k_thermal_gun');
  assert.ok(!demolitionResources([thermal]).some(x=>x.id.includes('#demolition_')));
  assert.equal(demolitionRoutes(thermal,model.scenario).find(x=>x.component_id==='40-K_MELTAGUN_B').weapon_id,thermal.equipment_id);
});

test('only the identified whole meltagun round may use a continuous beam account for demolition',()=>{
  const r=row('support_40_k_thermal_gun'), mode=r.facts.service_modes[0];
  assert.equal(mode.continuous,true);
  const route=demolitionRoutes(r,model.scenario).find(x=>x.component_id==='40-K_MELTAGUN_B');
  assert.ok(route);assert.equal(route.rounds,1);assert.equal(route.weapon_id,r.equipment_id);
  assert.equal(route.inventory_only,true);assert.equal(assessFiveHoles([r],model).status,'PASS');
  delete mode.service_conversion;
  assert.equal(demolitionRoutes(r,model.scenario).length,0);
  const other=row('support_40_k_thermal_gun');other.equipment_id='other_continuous_weapon';
  assert.equal(demolitionRoutes(other,model.scenario).length,0);
});

test('self destruction, backblast, green deployment and unresolved feeds do not grant usable routes',()=>{
  const rail=row('support_rs_422_railgun');assert.equal(demolitionCapability(rail).qualifies,false);assert.deepEqual(demolitionRoutes(rail,model.scenario),[]);
  for(const id of ['backpack_b_100_portable_hellbomb','backpack_lift_182_teleport_pack','vehicle_exo_55_breakthrough_exosuit'])
    assert.deepEqual(demolitionRoutes(row(id),model.scenario),[]);
  const green=row('deployable_mortar_sentry');assert.equal(demolitionCapability(green).qualifies,false);assert.deepEqual(demolitionRoutes(green,model.scenario),[]);
  const tank=row('vehicle_td_110_maelstrom');tank.category='deployable';assert.deepEqual(demolitionRoutes(tank,model.scenario),[]);
  const missing=row('vehicle_td_110_maelstrom');missing.facts.demolition_components=missing.facts.demolition_components.filter(c=>c.component_id!=='SWP_MAELSTROMIII_E');
  assert.ok(!demolitionResources([missing]).some(x=>x.id.includes('#demolition_missiles')));
});
