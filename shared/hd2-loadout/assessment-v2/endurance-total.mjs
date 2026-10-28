import {resourceWeapons,supplyProviders} from './engagement.mjs';
import {originalScore} from './score-scale.mjs';
import {isMeleeEquipment} from './score-exclusions.mjs';

const known=n=>Number.isFinite(n)&&n>=0;
const round=n=>Math.round(n*100)/100;
export function totalDamageScore(damage,reference,{reference_score=60,ceiling=105,steepness=1.15}={}) {
  if(!known(damage)||!(reference>0)||!(ceiling>reference_score&&reference_score>0)||!(steepness>0))return null;
  // Preserve the reference and ceiling; increase local slope modestly by 15%.
  const ratio=(damage/reference)**steepness,offset=ceiling/reference_score-1;
  return round(ceiling*ratio/(ratio+offset));
}

export function nominalAmmo(weapon,providers=[]) {
  if(!weapon)return {rounds:null,reason:'INVENTORY_REQUIRED'};
  if(weapon.renewable)return {rounds:null,renewable:true};
  let rounds=weapon.loaded+weapon.reserve;
  const cap=['loose','belt'].includes(weapon.feed)?weapon.capacity:weapon.reserve_capacity;
  for(const p of providers.filter(p=>p.charges>0)) {
    const refill=weapon.refill?.[p.refill_kind];
    if(!Number.isSafeInteger(refill)||refill<0)return {rounds:null,reason:'REFILL_AMOUNT_REQUIRED'};
    if(p.ready_at_ms===null)return {rounds:null,reason:'SUPPLY_ACCESS_REQUIRED'};
    const restored=p.kind==='backpack'?providers.filter(x=>x.refills_pack&&weapon.refill?.[x.refill_kind]>0)
      .reduce((n,x)=>n+x.charges,0):0;
    rounds+=(p.charges+restored)*Math.min(cap,refill);
  }
  return {rounds};
}

function variants(row,model) {
  const pack=model.equipment.find(r=>r.equipment_id==='backpack_b_1_supply_pack');
  const car=model.equipment.find(r=>r.equipment_id==='vehicle_m_103_supply_fast_recon_vehicle');
  return {initial:[],public:supplyProviders([row],model.scenario),
    pack:row.facts.holding.requires_backpack||row.category==='backpack'?null:supplyProviders([row,pack],model.scenario),
    vehicle:supplyProviders([row,car],model.scenario)};
}

// Count finite uses independently of damage, fire, gas or control. User requests
// refill efficiency to weigh more than carried stock; real stock stays unweighted.
export function throwableEndurance(row,model) {
  const policy=model.scenario.throwable_endurance,inv=row.facts.service_inventory??row.facts.inventory;
  const refill=row.facts.service_refill??row.facts.refill;
  const weapon={id:row.equipment_id,loaded:inv.capacity,capacity:inv.capacity,reserve:inv.reserve,
    reserve_capacity:inv.reserve,feed:inv.feed,refill};
  const valid=Number.isSafeInteger(inv.total)&&inv.total>=0&&Number.isSafeInteger(inv.capacity)&&inv.capacity>0
    &&Number.isSafeInteger(inv.reserve)&&inv.reserve>=0;
  const referenceUses=policy.reference_carried*policy.carried_weight+policy.reference_replenished*policy.replenished_weight;
  const scenarios=Object.fromEntries(Object.entries(variants(row,model)).map(([key,providers])=>{
    const stock=!valid?{rounds:null,reason:'THROWABLE_INVENTORY_REQUIRED'}:providers===null?
      {rounds:null,reason:'REQUIRED_AMMO_BACKPACK_CONFLICT'}:nominalAmmo(weapon,providers);
    const referenceScore=originalScore(policy?.reference_display_score,model.scenario.score_scale);
    const replenished=known(stock.rounds)?stock.rounds-inv.total:null;
    const weightedUses=known(stock.rounds)?inv.total*policy.carried_weight+replenished*policy.replenished_weight:null;
    const score=totalDamageScore(weightedUses,referenceUses,
      {reference_score:referenceScore,ceiling:policy?.ceiling,steepness:policy?.steepness});
    return [key,{...stock,score,score_status:score===null?'AWAITING_SCORE_REFERENCE_OR_STOCK':'CALCULATED',unit:'USES',carried:valid?inv.total:null,
      replenished,weighted_uses:weightedUses}];
  }));
  return {kind:'THROWABLE_AVAILABLE_USES',score:scenarios.public.score,scenarios,carried:inv.total,
    refill_per_box:{public:refill.public,portable:refill.portable},reference_weighted_uses:referenceUses,
    reference_display_score:policy.reference_display_score,curve:policy,score_status:policy.status,
    scope:'SLOT_RESOURCE_ENDURANCE; FINITE_CARRIED_AND_SUPPLIED_USES; EXCLUDED_FROM_GUN_ENDURANCE_AGGREGATE',
    damage_basis:'NO_DAMAGE_OR_STATUS_MULTIPLIER; UTILITY_STOCK_IS_NOT_COMBAT_BENEFIT'};
}

function modeScore(mode,weapon,providers,reference,policy) {
  if(providers===null)return {score:null,reason:'REQUIRED_AMMO_BACKPACK_CONFLICT'};
  const stock=nominalAmmo(weapon,providers);
  if(stock.renewable)return {score:100,renewable:true,rounds:null,standard_damage:null,durable_damage:null};
  const standard=known(stock.rounds)&&known(mode.standard_damage_per_round)?stock.rounds*mode.standard_damage_per_round:null;
  const durable=known(stock.rounds)&&known(mode.durable_damage_per_round)?stock.rounds*mode.durable_damage_per_round:null;
  return {...stock,standard_damage:standard,durable_damage:durable,score:totalDamageScore(standard,reference,policy),mode_id:mode.mode_id};
}

export function totalDamageEndurance(row,reference,model) {
  if(isMeleeEquipment(row))return {score:0,kind:'USER_MELEE_ZERO',
    scenarios:Object.fromEntries(['initial','public','pack','vehicle'].map(k=>[k,{score:0}])),
    scope:'USER_RULE; MELEE_EXCLUDED_FROM_LOADOUT_ENDURANCE'};
  if(['orbital','eagle','deployable'].includes(row.category))return {score:0,kind:'USER_RED_GREEN_ZERO',
    scenarios:Object.fromEntries(['initial','public','pack','vehicle'].map(k=>[k,{score:0}])),
    scope:'USER_RULE; RED_GREEN_DO_NOT_CONTRIBUTE_TO_ENDURANCE'};
  if(row.category==='throwables')return throwableEndurance(row,model);
  const policy=model.scenario.endurance_score;
  const refMode=reference.endurance.modes?.filter(m=>known(m.plus_one_box_standard_damage))
    .sort((a,b)=>b.plus_one_box_standard_damage-a.plus_one_box_standard_damage)[0];
  const refDamage=refMode?.plus_one_box_standard_damage;
  const base={kind:'TOTAL_AMMO_DAMAGE',reference_id:reference.equipment_id,reference_standard_damage:refDamage,
    curve:policy,scope:'FULL_AMMO_TIMES_NOMINAL_DAMAGE; NO_TARGET_BTK_DPS_RELOAD_OR_ROLE_SELECTION',
    damage_basis:'BOUND_DIRECT_PLUS_BLAST; STANDARD_SCORE; DURABLE_TOTAL_LISTED_SEPARATELY'};
  if(row.endurance.state==='NOT_APPLICABLE')return {...base,score:null,reason:'NOT_A_WEAPON_AMMO_BUDGET'};
  if(row.endurance.state==='SUPPLY_PROVIDER') {
    const weapon=resourceWeapons([reference]).find(w=>w.id===refMode?.resource_id);
    const supply=modeScore(refMode,weapon,supplyProviders([reference,row],model.scenario),refDamage,policy);
    return {...base,kind:'SUPPLY_TOTAL_DAMAGE_REFERENCE',score:supply.score,supplied:supply,
      scope:'REFERENCE_GUN_FULL_DAMAGE_WITH_FINITE_SUPPLIES; NOT_UNLIMITED'};
  }
  if(row.utility?.combat_damage===false||row.facts.known_noncombat||row.strategic_profile?.realization_class==='smoke')return {...base,score:0,kind:'KNOWN_ZERO'};
  if(['backpack_ax_arc_3_k_9','backpack_ax_las_5_guard_dog_rover'].includes(row.equipment_id))return {...base,
    score:100,kind:'RENEWABLE_AUTOMATIC_ENERGY',scenarios:Object.fromEntries(Object.keys(variants(row,model)).map(k=>[k,{score:100,renewable:true}])),
    scope:'NO_FINITE_AMMUNITION_EXHAUSTION; CADENCE_CONTACT_COOLING_REMAIN_SEPARATE',
    source:'docs/ai/assessment-v2-pool-completion-20261028/remaining-modes/evidence.json'};
  const weapons=resourceWeapons([row]),contexts=variants(row,model);
  const inv=row.facts.nominal_inventory??row.facts.service_inventory??row.facts.inventory;
  if(!weapons.some(w=>w.id===row.equipment_id)&&inv.kind==='finite'&&Number.isSafeInteger(inv.total)&&inv.total>0)
    weapons.push({id:row.equipment_id,loaded:inv.capacity,capacity:inv.capacity,reserve:inv.reserve,reserve_capacity:inv.reserve,
      feed:inv.feed,refill:inv.refill??row.facts.service_refill??row.facts.refill,nominal_only:true});
  const modes=(row.endurance.modes??[]).map(mode=>({mode_id:mode.mode_id,resource_id:mode.resource_id,
    scenarios:Object.fromEntries(Object.entries(contexts).map(([k,p])=>[k,modeScore(mode,
      weapons.find(w=>w.id===mode.resource_id),p,refDamage,policy)]))}));
  const scenarios=Object.fromEntries(Object.keys(contexts).map(key=>{
    const groups=[...new Set(modes.map(m=>m.resource_id))].map(id=>modes.filter(m=>m.resource_id===id)
      .map(m=>({...m.scenarios[key],resource_id:id})).filter(x=>known(x.score)).sort((a,b)=>b.score-a.score)[0]);
    const selected=groups.filter(Boolean);
    if(!selected.length)return [key,{score:null,reason:contexts[key]===null?'REQUIRED_AMMO_BACKPACK_CONFLICT':'TOTAL_DAMAGE_REQUIRED'}];
    if(selected.some(x=>x.renewable))return [key,{...selected.find(x=>x.renewable),independent_accounts:selected.map(x=>x.resource_id)}];
    const standard=selected.reduce((n,x)=>n+x.standard_damage,0),durable=selected.every(x=>known(x.durable_damage))
      ?selected.reduce((n,x)=>n+x.durable_damage,0):null;
    return [key,{...selected[0],standard_damage:standard,durable_damage:durable,
      score:totalDamageScore(standard,refDamage,policy),mode_ids:selected.map(x=>x.mode_id),
      independent_accounts:selected.map(x=>x.resource_id),partial:groups.length!==selected.length,
      rounds:selected.reduce((n,x)=>n+x.rounds,0)}];
  }));
  return {...base,score:scenarios.public.score,selected_mode:scenarios.public.mode_id,modes,scenarios,
    mode_policy:'BEST_MODE_PER_AMMO_ACCOUNT; SUM_INDEPENDENT_FEEDS; SHARED_AMMUNITION_NEVER_ADDED_TWICE',
    component_limits:'DOT_AND_FRAGMENT_POTENTIAL_REMAIN_SEPARATE; NO_ASSUMED_MULTIPLE_TARGETS_OR_PARTS'};
}
