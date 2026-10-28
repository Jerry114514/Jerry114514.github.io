import {ordinaryModes} from './projectile.mjs';
import {actionsFor,resourceWeapons,supplyProviders} from './engagement.mjs';
import {executeResourcePlan} from './resources.mjs';
import {totalDamageEndurance} from './endurance-total.mjs';

export function attachEnduranceScore(row,reference,model) {
  const rating=totalDamageEndurance(row,reference,model);
  const previous=row.endurance;
  row.endurance={...previous,
    state:rating.kind==='USER_MELEE_ZERO'?'KNOWN_ZERO':rating.kind==='THROWABLE_AVAILABLE_USES'?'THROWABLE_AVAILABLE_USES':['TOTAL_AMMO_DAMAGE','UNRESOLVED'].includes(previous.state)
      ?Number.isFinite(rating.score)?'TOTAL_AMMO_DAMAGE':'UNRESOLVED':previous.state,
    score:rating.score,without_public_score:rating.scenarios?.initial.score??null,rating,
    reference_id:rating.reference_id,selected_mode:rating.selected_mode??previous.selected_mode,
    scope:rating.scope??previous.scope};
}

// Each role starts from full stock. These are alternative uses of the same
// ammunition, never additive inventories or a proof of mixed-wave survival.
export function enduranceTrials(row,model) {
  const weapons=resourceWeapons([row]);
  if(!weapons.length)return [];
  const pack=model.equipment.find(r=>r.equipment_id==='backpack_b_1_supply_pack');
  const car=model.equipment.find(r=>r.equipment_id==='vehicle_m_103_supply_fast_recon_vehicle');
  const limit=model.scenario.endurance_probe_waves;
  return ['chaff','anti_medium'].map(role=>{
    const targetSet=model.scenario[role==='chaff'?'chaff':'medium'];
    const targets=targetSet.map(({id,count})=>({target:model.targets[id],count}));
    const plan=actionsFor(row,targets,model.ap,model.scenario,model.targets);
    if(!plan?.length)return {role,state:'UNRESOLVED',reason:'EXECUTABLE_ROLE_PLAN_REQUIRED'};
    const steps=Array.from({length:limit},(_,wave)=>plan.map(a=>({...a,
      ...(a.after_step?{after_step:{...a.after_step,index:a.after_step.index+wave*plan.length}}:{})}))).flat();
    const variants=[['initial',[]],['public',supplyProviders([row],model.scenario)],
      ['pack',row.facts.holding.requires_backpack?null:supplyProviders([row,pack],model.scenario)],
      ['vehicle',supplyProviders([row,car],model.scenario)]];
    return {role,state:'EXECUTED_FINITE_RESOURCE_PROBE',targets_per_wave:targetSet.reduce((n,x)=>n+x.count,0),
      rounds_per_wave:plan.reduce((n,x)=>n+x.rounds,0),modes:[...new Set(plan.map(x=>x.mode_id))],
      probe_limit_waves:limit,actions_per_wave:plan.length,
      scenarios:Object.fromEntries(variants.map(([name,providers])=>{
        if(providers===null)return [name,{status:'ILLEGAL',reason:'REQUIRED_AMMO_BACKPACK_CONFLICT'}];
        const r=executeResourcePlan({weapons,providers,steps});
        const completed=r.completed_steps??0;
        return [name,{status:r.status,reason:r.reason??null,completed_waves:Math.floor(completed/plan.length),
          completed_actions:completed,probe_completed:r.status==='COMPLETED',
          elapsed_ms:Math.max(r.elapsed_ms??r.state.time,r.committed_effect_until_ms??0),
          actions_elapsed_ms:r.state.time,completed_effect_actions_at_stop:r.completed_effect_steps??null,
          progress_basis:'COMMITTED_PAID_ACTIONS; ELAPSED_INCLUDES_DECLARED_EFFECT_HORIZON',supplies_taken:r.supplies_taken,
          remaining_stock:Object.fromEntries(Object.entries(r.state.resources).map(([id,v])=>[id,v.value]))}];
      })),scope:'ROLE_SPECIFIC_STOCK_RESET; PACK_OR_CAR_VARIANTS_INCLUDE_ONE_PUBLIC_BOX; NO_GLOBAL_SUPPLY_GUARANTEE'};
  });
}

const round = n => Math.round(n*100)/100;
function budgets(row) {
  let selected=ordinaryModes(row.facts);
  const nominal=row.facts.nominal_inventory;
  if(nominal)selected=row.facts.modes.filter(m=>m.kind==='projectile'&&m.feed_bound).map(m=>({...m,
    capacity:nominal.capacity,total:nominal.total,nominal_only:true}));
  if(row.facts.nominal_modes)selected=row.facts.nominal_modes;
  if(row.equipment_id==='support_cqc_20_breaching_hammer')selected=row.facts.modes.filter(m=>m.kind==='damage').map(m=>({...m,
    explosion:row.facts.areas.find(a=>a.id==='CQC-20_BREACHING_HAMMER_IE'),nominal_only:true}));
  if(row.equipment_id==='support_ms_11_missile_silo')selected=[{mode_id:'nominal:SOLO_SILO_E',normal:0,durable:0,pellets:1,
    explosion:row.facts.areas.find(a=>a.id==='SOLO_SILO_E'),capacity:1,total:1,nominal_only:true}];
  // Nominal full-ammo damage does not require a firing/arming/reload timeline.
  // Keep this separate from executable services and never use raw beam DPS as
  // one round's damage. Explicit blast-only stocks can be listed before fuses.
  if(!selected.length&&row.facts.inventory.kind==='finite') {
    selected=row.facts.modes.filter(m=>m.kind==='projectile'&&m.feed_bound).map(m=>({...m,
      explosion:m.explosion??row.facts.areas.find(a=>a.id===m.area_component_id),nominal_only:true}));
    if(!selected.length&&['throwables','backpack'].includes(row.category)&&row.facts.areas.length===1)
      selected=[{mode_id:`nominal:${row.facts.areas[0].id}`,normal:0,durable:0,pellets:1,explosion:row.facts.areas[0],
        capacity:row.facts.inventory.capacity,total:row.facts.inventory.total,nominal_only:true}];
  }
  return selected.map(mode=>{
    const inventory=nominal??row.facts.service_inventory ?? row.facts.inventory;
    const mounted=[...(row.facts.mounted_accounts??[]),...(row.facts.extra_accounts??[])].find(a=>a.id===mode.resource_id);
    const refill=mounted?.refill ?? nominal?.refill??row.facts.service_refill ?? row.facts.refill;
    const total=mounted ? mounted.loaded+mounted.reserve : mode.total;
    const child=mode.child_pattern?mode.child_payload:null;
    const normal=child?child.count*(child.normal+child.explosion.normal):mode.direct_damage_unresolved||!Number.isFinite(mode.normal)?null:mode.normal*(mode.nominal_arc_count??mode.pellets)+(mode.explosion?.normal??0);
    const durable=child?child.count*(child.durable+child.explosion.durable):mode.direct_damage_unresolved||!Number.isFinite(mode.durable)?null:mode.durable*(mode.nominal_arc_count??mode.pellets)+(mode.explosion?.durable??0);
    const renewable=mode.renewable===true;
    const known=Number.isSafeInteger(total)&&total>0;
    const extra=Number.isSafeInteger(refill.public)?refill.public:null;
    return {mode_id:mode.mode_id,resource_id:mode.resource_id??row.equipment_id,
      renewable,loaded:mode.capacity,total_rounds:known?total:null,direct_damage_unresolved:!!mode.direct_damage_unresolved,
      nominal_only:!!mode.nominal_only,nominal_arc_count:mode.nominal_arc_count??null,
      payload_basis:child?'FULL_CHILD_PAYLOAD; NOT_ALL_HITS_ONE_ENEMY; PARENT_EXCLUDED':mode.nominal_arc_count?'NOMINAL_ARCS_BEFORE_CORPSE_LOSS; NO_BRANCH_MULTIPLIER':'DIRECT_PLUS_BOUND_BLAST',
      standard_damage_per_round:normal,durable_damage_per_round:durable,
      one_public_box_rounds:extra,
      full_stock_standard_damage:known&&Number.isFinite(normal)?round(total*normal):null,
      full_stock_durable_damage:known&&Number.isFinite(durable)?round(total*durable):null,
      plus_one_box_standard_damage:known&&extra!==null&&Number.isFinite(normal)?round((total+extra)*normal):null,
      plus_one_box_durable_damage:known&&extra!==null&&Number.isFinite(durable)?round((total+extra)*durable):null,
      fragment_potential:mode.fragments&&known?{count:total*mode.fragments.count,
        standard_damage:total*mode.fragments.count*mode.fragments.normal,
        durable_damage:total*mode.fragments.count*mode.fragments.durable,
        scope:'EMITTED_FRAGMENT_BUDGET; NOT_ALL_CONTACT_ONE_TARGET; NOT_ADDED_TO_STOCK_INDEX'}:null,
      reload_or_cooldown_ms:mode.reload_ms,
      scope:renewable?'REGENERATING_RESOURCE; TEMPO_AND_COOLING_CHECKED_SEPARATELY'
        :'DIRECT_PLUS_BOUND_BLAST_FULL_STOCK; NO_FREE_DOT_FRAGMENT_OR_MULTIPART_MULTIPLIER',
      limitations:[...(mounted?['MOUNTED_BOUND_FEED_ONLY']:[]),
        ...(inventory.kind==='heat'?['HEAT_SINK_STOCK_NOT_INFINITE']:[]),
        ...(row.facts.effects.length?['STATUS_DAMAGE_REQUIRES_CONTACT_TIME; NOT_MULTIPLIED_BY_AMMO']:[])]};
  });
}

// Raw inventory display. The endurance score consumes only nominal total damage.
export function assessEquipmentEndurance(row, reference, model) {
  if (['backpack_b_1_supply_pack','vehicle_m_103_supply_fast_recon_vehicle'].includes(row.equipment_id)) return {
    state:'SUPPLY_PROVIDER',score:null,charges:row.equipment_id==='backpack_b_1_supply_pack'?4:8,
    public_boxes:1,scope:'ADDS_FINITE_RESOURCES_WHEN_NEEDED; LOADOUT_LEDGER_COMPUTES_ACTUAL_GAIN',vehicle_turret:false};
  if (row.strategic_profile) {
    const p=row.strategic_profile,key=id=>id?.replaceAll('/','').replaceAll(' ','_');
    const mode=p.payload_mode_id?row.facts.modes.find(m=>m.mode_id===p.payload_mode_id):row.facts.modes.find(m=>m.feed_bound);
    const area=row.facts.areas.find(a=>a.id&&a.id===mode?.explosion?.id||key(a.id)&&key(a.id)===key(mode?.area_component_id))
      ??(row.facts.areas.length===1?row.facts.areas[0]:null);
    const stream=mode?.kind==='beam'||mode?.mode_id==='ORBITAL_LASER_DPS';
    const units=stream?p.lifetime_s??p.duration_s:p.family==='green'?p.ammo:p.payload_per_call;
    const normal=(mode?.normal??0)*(mode?.pellets??1)+(area?.normal??0),durable=(mode?.durable??0)*(mode?.pellets??1)+(area?.durable??0);
    return {state:'STRATEGIC_CYCLE',score:null,ammo_per_deployment:p.ammo,payload_per_call:p.payload_per_call,
      uses_before_rearm:p.uses,cooldown_s:p.cooldown_s,small_cd_s:p.small_cd_s,delay_s:p.delay_s,
      payload_component:mode?.mode_id??area?.id,units_per_deployment:units,unit:stream?'DAMAGE_SECONDS':'PROJECTILES_OR_FUEL_UNITS',
      full_deployment_standard_damage:units>0?round(units*normal):null,
      full_deployment_durable_damage:units>0?round(units*durable):null,
      first_cycle_calls:p.family==='eagle'?p.uses:1,
      uninterrupted_fire_s:p.family==='green'&&p.rate_per_second>0&&p.ammo>0?p.ammo/p.rate_per_second:stream?units:null,
      scope:'NOMINAL_DIRECT_PLUS_BOUND_BLAST; NO_FREE_STATUS_OR_SECOND_BODY_PART; REALIZATION_AND_CD_IN_ROLE_BONUS'};
  }
  if(row.utility?.combat_damage===false)return {state:'NOT_APPLICABLE',score:null,scope:'NON_DAMAGE_UTILITY; NOT_A_WEAPON_AMMO_BUDGET'};
  const modes=budgets(row);
  const best=modes.filter(m=>m.plus_one_box_standard_damage!==null).sort((a,b)=>b.plus_one_box_standard_damage-a.plus_one_box_standard_damage)[0];
  return {state:best?'TOTAL_AMMO_DAMAGE':'UNRESOLVED',score:null,
    without_public_score:null,selected_mode:best?.mode_id??null,
    reference_id:reference.equipment_id,public_boxes:1,modes,combat_trials:enduranceTrials(row,model),
    scope:'RAW_FULL_AMMO_DAMAGE; NO_TARGET_OR_ROLE_SCORING',
    mode_policy:'ALTERNATIVE_MODES_SHARE_ONE_STOCK; NEVER_SUMMED',
    replenishable_score_policy:'100_DENOTES_NO_FINITE_AMMO_EXHAUSTION; DOES_NOT_REMOVE_COOLING_OR_CONTACT_LIMITS'};
}
