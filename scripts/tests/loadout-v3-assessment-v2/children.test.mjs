import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bindExplodingChildren,diagnoseExplodingChildren} from '../../../shared/hd2-loadout/assessment-v2/children.mjs';
const items=JSON.parse(readFileSync(new URL('../../../shared/hd2-loadout/assessment-v2/sources/equipment-expanded.json',import.meta.url))).items;
const model=JSON.parse(readFileSync(new URL('../../../shared/hd2-loadout/assessment-v2/equipment.json',import.meta.url)));
const tiers={'Unarmored':0,'Light':2,'Medium':3,'Heavy':4,'Anti-Tank I':5,'Anti-Tank II':6,'Anti-Tank III':7};
const pair=id=>[structuredClone(items.find(i=>i.id===id)),structuredClone(model.equipment.find(i=>i.equipment_id===id).facts)];

test('child links preserve per-contact damage and unresolved scatter',()=>{
  for(const [id,modeId,count,normal,damage,inner,outer] of [
    ['heavy_support_rl_77_airburst_rocket_launcher','RL-77_P',25,150,500,4,6],
    ['heavy_support_rl_77_airburst_rocket_launcher','RL-77_P2',25,150,500,4,6],
    ['orbital_airburst_strike','S_P15',12,300,350,3,6],
    ['support_eat_700_incendiary','EAT-700_P',20,200,50,1.60000002,5]]) {
    const [item,facts]=pair(id);assert.equal(bindExplodingChildren(item,facts,tiers),facts);
    const mode=facts.modes.find(m=>m.mode_id===modeId),p=mode.child_payload;
    assert.equal(p.count,count);assert.equal(p.normal,normal);assert.equal(p.explosion.normal,damage);
    assert.equal(p.explosion.inner_radius_m,inner);assert.equal(p.explosion.outer_radius_m,outer);
    assert.equal(p.delay_ms,null);assert.match(p.contact_policy,/ONE_CHILD_CONTACT_LOWER_BOUND/);
    assert.ok(mode.unbound_child_projectiles);assert.equal(p.source_ref,facts.source_ref);
  }
});

test('WASP artillery costs seven rounds and partial magazines remain unknown',()=>{
  const [item,facts]=pair('heavy_support_sta_x3_wasp_launcher');bindExplodingChildren(item,facts,tiers);
  const p=facts.modes.find(m=>m.mode_id==='StA-X3_P1').child_payload;
  assert.equal(p.count,7);assert.equal(p.ammo_cost,7);assert.equal(p.requires_full_magazine,true);
  assert.equal(p.partial_magazine_distribution,null);assert.equal(p.explosion.normal,600);
});

test('missing, ambiguous or partial source remains unresolved without guessed blast values',()=>{
  const [item,facts]=pair('support_eat_700_incendiary');
  item.tables=item.tables.filter(t=>t.id!=='EAT-700_P1_IE');bindExplodingChildren(item,facts,tiers);
  assert.equal(facts.modes.find(m=>m.mode_id==='EAT-700_P').child_payload,undefined);
  const [item2,facts2]=pair('support_eat_700_incendiary');
  const blast=item2.tables.find(t=>t.id==='EAT-700_P1_IE');
  blast.rows=blast.rows.filter(r=>r.key!=='area_of_effect_outer_radius'&&r.key!=='outer_radius'&&r.key!=='pen_outer');
  bindExplodingChildren(item2,facts2,tiers);
  const p=facts2.modes.find(m=>m.mode_id==='EAT-700_P').child_payload;
  assert.equal(p.explosion.outer_radius_m,null);assert.equal(p.explosion.outer_pen,null);
});

test('conditioned contact damage and theoretical all-child ceiling use child armor and durability',()=>{
  const cases=[['heavy_support_rl_77_airburst_rocket_launcher','RL-77_P',25,150,500],
    ['heavy_support_rl_77_airburst_rocket_launcher','RL-77_P2',25,150,500],
    ['heavy_support_sta_x3_wasp_launcher','StA-X3_P1',7,200,600],
    ['orbital_airburst_strike','S_P15',12,300,350],
    ['support_eat_700_incendiary','EAT-700_P',20,200,50]];
  for(const [id,modeId,count,direct,blast] of cases){
    const [item,facts]=pair(id);bindExplodingChildren(item,facts,tiers);
    const mode=facts.modes.find(m=>m.mode_id===modeId);
    const d=diagnoseExplodingChildren(mode,{armor:0,durable:0},{equal:0.65,greater:1},
      {direct_contacts:1,blast_contacts:1,blast_distance_m:0});
    const effectiveDirect=mode.child_payload.pen===0?Math.floor(direct*.65):direct;
    assert.equal(d.direct.declared_damage,effectiveDirect);assert.equal(d.explosion.declared_damage,blast);
    assert.equal(d.declared_combined_damage,effectiveDirect+blast);
    assert.equal(d.theoretical_all_emitted_upper_bound,count*(effectiveDirect+blast));
    assert.equal(d.delay_ms,null);assert.equal(d.scatter,'UNKNOWN');
    assert.equal(d.ammo_cost,id==='heavy_support_sta_x3_wasp_launcher'?7:1);
  }
  const [item,facts]=pair('orbital_airburst_strike');bindExplodingChildren(item,facts,tiers);
  const mode=facts.modes.find(m=>m.mode_id==='S_P15');
  const equal=diagnoseExplodingChildren(mode,{armor:3,durable:1},{equal:0.5,greater:1},
    {direct_contacts:1,blast_contacts:1,blast_distance_m:4.5});
  assert.equal(equal.direct.declared_damage,75);
  assert.equal(equal.explosion.declared_damage,0); // outer AP 2 cannot penetrate armor 3
});

test('undeclared contact and missing distance or outer fields remain unknown',()=>{
  const [item,facts]=pair('heavy_support_rl_77_airburst_rocket_launcher');bindExplodingChildren(item,facts,tiers);
  const mode=facts.modes.find(m=>m.mode_id==='RL-77_P'),target={armor:0,durable:0},ap={equal:0.5,greater:1};
  let d=diagnoseExplodingChildren(mode,target,ap);
  assert.equal(d.declared_combined_damage,null);assert.equal(d.explosion.per_contact_at_distance,null);
  d=diagnoseExplodingChildren(mode,target,ap,{direct_contacts:26});assert.equal(d.reason,'CONTACT_COUNT_OUT_OF_RANGE');
  mode.child_payload.explosion.outer_normal=null;
  d=diagnoseExplodingChildren(mode,target,ap,{direct_contacts:1,blast_contacts:1,blast_distance_m:5});
  assert.equal(d.explosion.declared_damage,null);assert.equal(d.declared_combined_damage,null);
});
