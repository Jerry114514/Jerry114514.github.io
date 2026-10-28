// Source units -> existing shot clock. Continuous quanta consume firing time,
// heat and finite sinks; they are not free instantaneous projectiles.
export function arcEquivalentContacts(policy) {
  const value=policy.bolts*(policy.live_target_fraction??1)
    *Array.from({length:policy.pulses??1},(_,i)=>policy.pulse_location_factors?.[i]??1).reduce((a,b)=>a+b,0);
  return Math.round(value*1e9)/1e9;
}

export function bindServiceModes(facts, scenario) {
  const converted = [], extra = facts.supplements ?? {};
  if (facts.id === 'smg_flam_34_stoker') {
    const main = facts.modes.filter(m => m.kind === 'projectile' && m.feed_bound);
    const spray = facts.modes.find(m => m.kind === 'spray' && m.mode_id === 'Underbarrel_SMGFLAM-34_STOKER_0_S');
    if (main.length && spray && spray.normal > 0 && spray.direct_status_effects?.some(e => e.id === 'Fire')) {
      const capacity = 50, exactWork = 6100 / capacity, work = Math.ceil(exactWork);
      const id = `${facts.id}#underbarrel_fuel`;
      facts.extra_accounts = [{id, equipment_id:facts.id, loaded:capacity, capacity, reserve:0,
        reserve_capacity:0, reload_ms:0, feed:'belt', refill:{public:0,portable:0}, renewable:false,
        inventory_limitation:'INITIAL_CANISTER_ONLY; RESUPPLY_AND_RELOAD_UNKNOWN'}];
      facts.service_modes = [...main, {...spray, kind:'projectile', feed_bound:true, resource_id:id,
        capacity, total:capacity, rpm:60000/work, continuous:true, work_ms:work,
        normal:150*exactWork/1000, durable:150*(spray.durable/spray.normal)*exactWork/1000,
        ignition_policy:scenario.spray_ignition, fire_channel:'spray', reload_ms:0, renewable:false, disposable:true,
        nominal_status_strength_per_second:150/spray.normal*spray.status_strength,
        status_rate_basis:'IDEAL_PANEL_EXPOSURE; NO_MEASURED_PARTICLE_RATE; CONTINUOUS_CONTACT_ONLY',
        service_conversion:'UNDERBARREL_FIRST_CANISTER; 150_DPS_CANDIDATE_FROM_P72_COMPARISON; NO_RESUPPLY_CREDIT',
        inventory_limitation:'INITIAL_CANISTER_ONLY; RESUPPLY_AND_RELOAD_UNKNOWN',
        evidence_url:'https://helldivers.wiki.gg/wiki/Stoker'}];
      return facts;
    }
  }
  if(facts.id==='sg_20_halt') {
    const main=facts.modes.find(m=>m.mode_id==='SG-20_P');
    if(main) {
      converted.push({...main,capacity:8,total:68,
        service_conversion:'ONE_8_ROUND_FLECHETTE_TUBE; SHARED_RESERVE_60; SECOND_STUN_TUBE_NOT_SPENDABLE',
        inventory_limitation:'8_STUN_SHELLS_OMITTED; NO_FREE_SWAP_OR_DOUBLE_RESERVE'});
      facts.unbound_modes=['SG-20_P1:SECOND_TUBE_SWITCH_TIMING_AND_CONTROL_ROUTE'];
    }
  }
  // Reuse the already declared thermite fuse policy; no additional damage is
  // invented and the heavy head route still has its own two-sticky requirement.
  const throwDelay = facts.id === 'g_123_thermite' ? scenario.thermite_effect_ms : facts.fuse_ms;
  if (/\bMelee\b/i.test(facts.traits ?? '') && facts.listed_fire_rate > 0) {
    for (const m of facts.modes.filter(m=>m.kind === 'damage' && m.feed_bound)) converted.push({...m,
      kind:'projectile',rpm:facts.listed_fire_rate,capacity:1,total:null,reload_ms:0,renewable:true,
      pellets:1,charge_ms:0,traits:'MELEE_CONTACT',target_policy:'MAIN_ONLY',acquire_floor_ms:scenario.melee.reposition_ms,
      service_conversion:'ONE_SWING_ONE_CONTACT; HELD_ATTACK_CONTINUES_WITH_EMPTY_STAMINA',
      range_condition:'ENEMIES_ENTER_MELEE_CONTACT; NO_RANGED_WEAKPOINT_OR_SWING_CLEAVE_CREDIT'});
  }
  if (facts.id === 'k_2_throwing_knife' && facts.modes[0]) converted.push({...facts.modes[0],
    kind: 'projectile', feed_bound: true, reload_ms: 0, charge_ms: scenario.throw_ms, rpm: 60000 / scenario.throw_ms,
    warmup_ms: 0, handling: {ergonomics: 65, recoil_horizontal: 0, recoil_vertical: 0},
    renewable: false, service_conversion: 'FINITE_THROWN_KNIFE; NO_RECOVERY_CREDIT'});
  if (['support_gl_52_conciliator','g_31_arc'].includes(facts.id)) {
    const area = facts.areas.find(a => a.arc_id);
    const key = s => String(s).replaceAll(' ', '_').toLowerCase();
    const arc = facts.modes.find(m => m.kind === 'arc' && key(m.mode_id) === key(area?.arc_id));
    const carrier = facts.modes.find(m => m.feed_bound && m.kind === 'projectile');
    const policy={...arc?.arc_policy,bolts:10,pulses:carrier?1:5,live_target_fraction:.5,pulse_interval_ms:carrier?0:1000,
      pulse_location_factors:carrier?[1]:[1,.2,.2,.2,.2],
      location_basis:carrier?'AIMED_SINGLE_IMPACT':'USER_LATER_BOUNCES_OFTEN_EMPTY; 0.2_ENGINEERING_CANDIDATE_PER_LATER_PULSE',
      count_basis:carrier?'WIKI_TEN_PRIMARY_ARCS':'USER_TEN_ARCS_PER_BOUNCE_FIVE_BOUNCES',
      loss_basis:'USER_CORPSE_LOCK_LOSS; 0.5_ENGINEERING_CANDIDATE_NOT_MEASURED_HIT_RATE',
      timing_basis:carrier?'SINGLE_IMPACT':'1S_PULSE_INTERVAL_CANDIDATE; ALL_DAMAGE_AT_LAST_PULSE_CONSERVATIVE'};
    if (arc && (carrier || facts.fuse_ms >= 0)) converted.push({...arc,
      kind: 'projectile', feed_bound: true, explosion: null, pellets: arcEquivalentContacts(policy),
      nominal_arc_count:carrier?10:50,
      capacity: facts.inventory.capacity, total: facts.inventory.total,
      rpm: carrier?.rpm ?? 60000 / scenario.throw_ms, charge_ms: carrier?.charge_ms ?? (carrier ? 0 : scenario.throw_ms),
      reload_ms: carrier?.reload_ms ?? 0, handling: carrier?.handling ?? {ergonomics: 65, recoil_horizontal: 0, recoil_vertical: 0},
      arming_distance_m: carrier?.arming_distance_m ?? 0, detached_delay_ms: carrier ? 0 : facts.fuse_ms+4000,
      round_reload_profile:carrier?.round_reload_profile,
      arc_self_risk_m:10,
      arc_policy:policy,
      renewable: false, service_conversion: 'BOUND_ARC_FINITE_BOLTS; DISTRIBUTED_CONTACTS_NOT_TENFOLD_SINGLE_TARGET',
      target_policy: 'MAIN_ONLY', traits: 'BOUND_ARC'});
  }
  if (facts.category === 'throwables' && !['g_50_seeker','g_60_anti_tank_seeker'].includes(facts.id)
    && Number.isFinite(throwDelay) && facts.areas[0]?.normal > 0 && facts.inventory.capacity > 0) {
    const area = facts.areas[0];
    converted.push({mode_id: `throw:${area.id}`, kind: 'projectile', feed_bound: true, normal: 0, durable: 0, pen: 0, pellets: 1,
      explosion: {...area,status_effects:area.status_applications?.map(a=>a.effect).filter(Boolean)
        ??facts.effects.filter(e=>e.id?.replaceAll('_',' ')===area.status?.replaceAll('_',' '))},
      fire_module_multiplier:facts.fire_damage_multiplier,
      area_component_id: area.id, direct_status_effects: [],
      capacity: facts.inventory.capacity, total: facts.inventory.total, reload_ms: 0, renewable: false,
      rpm: 60000 / scenario.throw_ms, charge_ms: scenario.throw_ms, warmup_ms: 0,
      detached_delay_ms: throwDelay, traits: 'THROWN; BLAST_ONLY_NO_FREE_FRAGMENTS',
      ...(facts.id === 'g_142_pyrotech' ? {source_timing_conflict:'TABLE_FUSE_2.9S; TEXT_SPARKS_4S_NOT_EQUIVALENT; PREBLAST_SPARKS_NOT_INCLUDED'} : {}),
      handling: {ergonomics: 65, recoil_horizontal: 0, recoil_vertical: 0},
      service_conversion: 'FINITE_THROW; FULL_FUSE_AFTER_RELEASE_CONSERVATIVE'});
  }
  if (!['primary', 'secondary', 'support', 'throwables'].includes(facts.category)) return facts;
  if (facts.id === 'support_40_k_thermal_gun' && facts.inventory.capacity === 3
    && facts.inventory.total === 15 && facts.reload_ms > 0) {
    const beam = facts.modes.find(m=>m.mode_id === '40-K_MELTAGUN_B' && m.kind === 'beam' && m.normal === 2600);
    if (beam) converted.push({...beam,kind:'projectile',feed_bound:true,continuous:true,work_ms:1400,
      // The nominal 50 RPM interval is shorter than the candidate beam work;
      // cap the shot clock to prevent overlapping two 1.4 s emissions.
      rpm:60000/1400,normal:beam.normal*1400/1000,durable:beam.durable*1400/1000,
      capacity:3,total:15,reload_ms:facts.reload_ms,renewable:false,
      service_conversion:'CANDIDATE_1.4S_BEAM_AT_LISTED_DPS; NO_ORDINARY_FIRE',
      damage_basis:'CANDIDATE_ENGINEERING_APPROXIMATION_2600_DPS_FOR_1.4S',
      range_condition:'15M_CLOSE_RANGE_CONTINUOUS_CONTACT',
      evidence_url:'https://helldivers.wiki.gg/wiki/40-K_Meltagun'});
  }
  if (facts.inventory.kind === 'finite' && extra.full_fire_seconds > 0 && facts.declared_dps > 0) {
    for (const m of facts.modes.filter(m => m.kind === 'spray' && m.feed_bound)) {
      const exactWork = extra.full_fire_seconds * 1000 / facts.inventory.capacity, work = Math.ceil(exactWork);
      const scale = facts.fire_damage_multiplier ?? 1;
      converted.push({...m, kind: 'projectile', continuous: true, work_ms: work, rpm: 60000 / work,
        normal: scale * facts.declared_dps * exactWork / 1000, durable: scale * facts.declared_dps * (m.durable / m.normal) * exactWork / 1000,
        source_fire_module_multiplier: scale,
        ignition_policy:m.direct_status_effects.some(e=>e.id==='Fire')?scenario.spray_ignition:undefined,
        nominal_status_strength_per_second:m.normal>0&&m.status_strength>0?facts.declared_dps/m.normal*m.status_strength:null,
        status_rate_basis:'IDEAL_PANEL_EXPOSURE; NO_MEASURED_PARTICLE_RATE; CONTINUOUS_CONTACT_ONLY',
        warmup_ms: extra.pilot_ms, reload_ms: facts.reload_ms, renewable: false,
        service_conversion: 'FUEL_UNIT_INTEGRAL; DECLARED_DPS; NO_FREE_PARTICLE_OR_FIRE_STATUS_MULTIPLIER'});
    }
  }
  if (facts.inventory.kind === 'unlimited') {
    for (const mode of facts.modes.filter(m => m.kind === 'arc' && m.rpm > 0)) converted.push({...mode,
      kind: 'projectile', feed_bound: true, capacity: 1, total: null, reload_ms: 0,
      service_conversion: 'ARC_DISCHARGE; DECLARED_DISTINCT_CHAIN_TARGETS', renewable: true});
  }
  if (facts.inventory.kind === 'heat') {
    // LAS17's LAS16 reference is not another feed; select its cool own tier.
    const own = facts.id === 'las_17_double_edge_sickle'
      ? facts.modes.filter(m => m.mode_id === 'LAS-17_P') : facts.modes.filter(m => m.feed_bound);
    for (const source of own) {
      let mode = {...source}, unitHeat = mode.heat_per_shot;
      if (mode.kind === 'beam' && extra.beams_per_shot > 0) mode = {...mode, kind: 'projectile', pellets: extra.beams_per_shot,
        service_conversion: 'PULSED_BEAM_PACKET; SOURCE_BEAM_COUNT'};
      const forced = extra.forced_cooldown_ms ?? (extra.observed_recharge_ms !== undefined
        ? Math.max(extra.observed_recharge_ms, Math.ceil(mode.overheat_at / mode.cool_per_second * 1000)) : null);
      if (Number.isFinite(forced)) {
        converted.push({...mode, kind: 'projectile', feed_bound: true, capacity: 1,
          total: null, renewable: true, reload_ms: forced,
          charge_ms: extra.charge_ms ?? mode.warmup_ms, warmup_ms: 0,
          service_conversion: 'FORCED_PER_SHOT_COOLING; CHARGE_AFTER_COOLING'});
        continue;
      }
      if (mode.kind === 'beam' && mode.heat_per_second > 0) {
        const quantum = 50;
        mode = {...mode, kind: 'projectile', traits: mode.traits.replace(/Beam|Continuous/g, ''),
          normal: mode.normal * quantum / 1000, durable: mode.durable * quantum / 1000,
          rpm: 60000 / quantum, continuous: true, work_ms: quantum,
          ignition_policy: source.direct_status_effects?.some(e=>e.id==='Fire') ? scenario.laser_ignition : undefined,
          service_conversion: 'CONTINUOUS_50MS_INTEGRAL; IGNITION_USES_SEPARATE_CONTACT_TIME'};
        unitHeat = mode.heat_per_second * quantum / 1000;
      }
      if (mode.kind !== 'projectile' || !(unitHeat > 0) || !(mode.overheat_at > 0)) continue;
      const limit = facts.id === 'las_17_double_edge_sickle' ? Math.min(100, mode.overheat_at) : mode.overheat_at;
      const betweenShots=['las_12_sai','las_13_trident'].includes(facts.id);
      const passive = (betweenShots||Number.isFinite(extra.cooling_delay_ms)) && mode.cool_per_second > 0;
      const netHeat=betweenShots?Math.max(.0001,unitHeat-mode.cool_per_second*60/mode.rpm):unitHeat;
      const capacity = betweenShots?Math.max(1,Math.ceil((limit-unitHeat)/netHeat))
        :passive ? Math.max(1, Math.ceil(limit / unitHeat) - 1) : Math.floor(limit / unitHeat);
      if (!capacity || !passive && !(facts.reload_ms > 0 && Number.isInteger(facts.inventory.spare_heat_sinks))) continue;
      const cooling = passive ? Math.ceil((extra.cooling_delay_ms??0) + (betweenShots?unitHeat+(capacity-1)*netHeat:capacity*unitHeat) / mode.cool_per_second * 1000
        + (mode.warmup_ms ?? 0)) : facts.reload_ms;
      const finiteSinks=betweenShots&&Number.isSafeInteger(facts.inventory.spare_heat_sinks)&&facts.reload_ms>0;
      const reload=finiteSinks?Math.min(cooling,facts.reload_ms):cooling;
      converted.push({...mode, capacity, total: passive ? null : capacity * (1 + facts.inventory.spare_heat_sinks),
        reload_ms: reload, renewable: passive, feed_bound: true,
        ...(finiteSinks?{finite_heat_sinks:true,cooling_ms:cooling,spare_sink_rounds:capacity*facts.inventory.spare_heat_sinks}:{}),
        service_conversion: mode.service_conversion ?? 'THERMAL_PROJECTILE',
        thermal_policy: betweenShots?'SOURCE_BETWEEN_SHOT_COOLING; FINITE_FAST_SINK_SWAPS_THEN_PASSIVE_COOLING':passive ? 'STOP_BEFORE_OVERHEAT; NO_COOLING_CREDIT_DURING_FIRE'
          : 'FINITE_HEAT_SINK_SWAPS; PASSIVE_COOLING_NOT_CREDITED',
        heat_per_service_unit: unitHeat});
    }
  }
  if (!converted.length) return facts;
  const first = converted[0];
  facts.service_modes = converted;
  facts.service_inventory = {kind: 'finite', feed: ['belt','loose'].includes(facts.inventory.feed) ? facts.inventory.feed : 'magazine', capacity: first.capacity,
    total: first.total, reserve: first.finite_heat_sinks?first.spare_sink_rounds:first.renewable ? 0 : first.total - first.capacity,
    finite_heat_sinks:first.finite_heat_sinks,cooling_ms:first.cooling_ms,renewable: first.renewable, reload_ms: first.reload_ms};
  facts.service_refill = first.renewable&&!first.finite_heat_sinks ? {public:0,portable:0} : facts.inventory.kind !== 'heat' ? facts.refill : Object.fromEntries(
    ['public','portable'].map(k => [k, Number.isFinite(facts.refill[k]) ? facts.refill[k] * first.capacity : null]));
  return facts;
}
