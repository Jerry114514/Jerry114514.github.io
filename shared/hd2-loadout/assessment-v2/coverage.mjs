import {assessStrategic} from './strategic.mjs';
import {heavyRoutes, resourceWeapons} from './engagement.mjs';
// Coverage follows executed calculations, not raw beam/heat/area trait flags.
// A useful lower bound is not completion of every optional mechanism.
export function assessmentCoverage(equipment, model) {
  const rows = equipment.map(row => {
    const {facts} = row, data = new Set(), integration = new Set(), review = new Set();
    const strategic = model ? assessStrategic(row, model,{selected_roles:['chaff','anti_medium']}).map(s=>({...s,
      contribution:{...s.contribution,status:s.contribution.calculated_status??s.contribution.status,
        value:s.contribution.score_origin==='MANUAL_CALIBRATED'?s.contribution.calculated_value:s.contribution.value}})) : [];
    const bound = facts.service_modes ?? facts.modes;
    if (!facts.known_noncombat && !row.utility) {
      if (!facts.modes.length) integration.add('SOURCE_ATTACK_OR_UTILITY_ADAPTER');
      const inventory = facts.service_inventory ?? facts.inventory;
      if (['primary', 'secondary', 'support', 'throwables'].includes(row.category)
        && inventory.kind === 'finite' && !inventory.renewable && !Number.isFinite(inventory.total)) {
        data.add(/Melee/.test(facts.traits) ? 'MELEE_CADENCE_AND_CONTACT_SEMANTICS' : 'FINITE_INVENTORY_TOTAL');
      }
      for (const mode of bound) {
        if(mode.unbound_child_projectiles)integration.add('SUBMUNITION_IMPACT_AND_DETONATION:'+mode.unbound_child_projectiles.component_id);
        if (mode.kind === 'projectile' && mode.feed_bound && ['primary', 'secondary', 'support'].includes(row.category)) {
          if (!(mode.rpm > 0)) data.add('FIRING_RATE');
          for (const key of ['ergonomics', 'recoil_horizontal', 'recoil_vertical']) if (!Number.isFinite(mode.handling?.[key])) data.add('HANDLING_' + key.toUpperCase());
          if (mode.unresolved_impact) data.add('BOUND_IMPACT_COMPONENT');
          if (!Number.isFinite(mode.reload_ms) && !mode.disposable) data.add('RELOAD_TIME');
        }
        if (mode.explosion && !row.capabilities.modes?.some(m => m.mode_id === mode.mode_id && m.chaff?.area)) integration.add('OPTIONAL_OUTER_BLAST_OR_FRAGMENT_ALLOCATION');
        if (mode.pellets > 1) review.add('STABLE_PELLET_HIT_ROUTE');
        if (mode.kind === 'arc') integration.add('FINITE_ARC_TARGET_ALLOCATION');
        if (mode.kind === 'beam') integration.add('DPS_UNIT_AND_CONTINUOUS_DAMAGE_BINDING');
        if (mode.kind === 'spray') integration.add('FUEL_TIME_AND_AREA_ROUTE');
      }
      if (facts.inventory.kind === 'heat' && !facts.service_modes) {
        integration.add('HEAT_ACCOUNT_AND_NORMAL_CLIMATE_CYCLE');
        data.add('COOLING_START_DELAY_AND_FIRING_HEAT_SEMANTICS');
      }
      if (facts.effects.length) integration.add(row.capabilities.modes?.some(m => m.chaff?.cloud)
        ? 'OTHER_STATUS_OR_CONTROL_BENEFITS; OWN_GAS_CHAFF_BOUND' : 'STATUS_APPLICATION_STACKING_AND_CONTROL_ROUTE');
      if (['orbital', 'eagle', 'deployable'].includes(row.category) && strategic.some(s=>s.contribution.status !== 'KNOWN')) {
        for (const s of strategic.filter(s=>s.contribution.status !== 'KNOWN')) data.add(s.contribution.reason);
      }
      if (['backpack', 'vehicle'].includes(row.category)) integration.add('PASSIVE_OR_MANUAL_OPERATION_ROUTE');
      review.add('STABLE_AIM_AND_RANGE_CONDITIONS');
    }
    if (bound.some(m=>m.service_conversion?.includes('LOWER_BOUND'))) integration.add('ADDITIONAL_ARC_CONTACT_ALLOCATION');
    for(const gap of facts.unbound_modes??[])integration.add(gap);
    const hasFire=facts.effects.some(e=>e.id==='Fire');
    const fireUsed=row.capabilities.modes?.some(m=>[m.chaff,m.close_defense,...m.anti_medium].some(s=>
      s.area?.fire?.damage>0 || s.entries?.some(e=>e.resolution?.fire)));
    const mechanismStates={
      fragments:bound.some(m=>m.fragments)?'SEPARATE_AP_DURABLE_BUDGET; DECLARED_CONTACT_SCENARIO':'NO_BOUND_FRAGMENT_COMPONENT',
      fire:!hasFire?'NO_FIRE_EFFECT':fireUsed&&bound.some(m=>m.ignition_policy)
        ?'USER_LIGHT_BEAM_OR_SPRAY_CONTACT_BURN_BOUND; AUTO_SWITCH_NOT_EXTRAPOLATED'
        :fireUsed?'GUARANTEED_PACKET_BURN_BOUND; UNKNOWN_TARGET_THRESHOLDS_REMAIN'
        :'DIRECT_ONLY_OR_STRATEGIC_PACKET; CONTINUOUS_BUILDUP_GROUND_ROUTE_NOT_COMPLETE',
      gas:facts.effects.some(e=>/^Gas/.test(e.id))?(row.capabilities.modes?.some(m=>m.chaff.cloud)
        ?'OWN_CLOUD_BOUND; CONTINUOUS_CONTACT_ASSUMPTION':'STATUS_OR_STRATEGIC_DOSE; OTHER_ROUTES_PENDING'):'NO_GAS_EFFECT',
      endurance:row.endurance?.state??'UNRESOLVED'};
    for (const gap of facts.mounted_omissions ?? []) integration.add(gap.reason + ':' + gap.section);
    if (bound.some(m=>m.thermal_policy?.includes('FINITE_HEAT_SINK'))) data.add('OPTIONAL_PASSIVE_COOLING_DELAY');
    if (row.utility?.defensive_effect === 'NOT_YET_QUANTIFIED') integration.add('UTILITY_SAFETY_OR_CONTROL_ROUTE');
    const roleStates = Object.fromEntries(Object.entries(row.dimensions).map(([role, value]) => [role, value.calculated_state??value.state]));
    for (const s of strategic) roleStates[s.role] = s.contribution.status === 'KNOWN'
      ? s.contribution.value === 0 ? 'KNOWN_ZERO' : 'ENGINEERING_ESTIMATE' : 'UNRESOLVED';
    // Red/green strikes are evaluated as bonuses, not as a held close weapon.
    if (row.strategic_profile) roleStates.close_defense = row.utility ? 'UTILITY_NOT_QUANTIFIED' : 'NOT_APPLICABLE_HELD_WEAPON_TEST';
    const heavy = model ? Object.fromEntries(model.scenario.heavy_targets.map(id=>[id,heavyRoutes(row,id,model).length])) : null;
    return {equipment_id: row.equipment_id, name: row.name, category: row.category, source_ref: facts.source_ref,
      role_states: roleStates, heavy_bound_routes: heavy,
      mechanism_states:mechanismStates,
      additional_dimensions:{anti_heavy:row.heavy_assessment?.state??'UNRESOLVED',
        demolition:row.demolition_assessment?.state??'UNRESOLVED',
        endurance_trials:row.endurance?.combat_trials?.filter(t=>t.state==='EXECUTED_FINITE_RESOURCE_PROBE').length??0},
      finite_resource_accounts: resourceWeapons([row]).map(w=>({id:w.id,loaded:w.loaded,reserve:w.reserve,renewable:w.renewable})),
      calculation_ready: Object.values(roleStates).every(s=>['ENGINEERING_ESTIMATE','KNOWN_ZERO','NOT_APPLICABLE_HELD_WEAPON_TEST'].includes(s)),
      calculation_scope: 'THREE_LIGHT_MEDIUM_ROLES_ONLY; MAY_BE_LOWER_BOUND; HEAVY_AND_SHARED_STOCK_STILL_REQUIRED',
      source_fields_to_resolve: [...data], implementation_bindings: [...integration], scenario_judgments: [...review],
      disposition: facts.known_noncombat ? 'OFFENSIVE_ZERO_CONFIRMED; SUPPLY_LEDGER_BOUND' : 'ESTIMATE_OR_UNRESOLVED; NOT_CERTIFIED'};
  });
  return {schema: 2, status: 'EXECUTED_COVERAGE_AND_REMAINING_MECHANISMS; NOT_ALL_EQUIPMENT_CERTIFICATION',
    calibration_policy: 'USER_DEFERRED_UNTIL_REVIEW_FEEDBACK; NOT_A_REQUIRED_PRE_REVIEW_TASK',
    hit_probability_model: 'EXCLUDED_BY_USER; SMALL_ERGONOMICS_RECOIL_TIME_CORRECTION_ONLY',
    independent_weapon_scoring: true,
    engineering_choices: ['BOUNDED_HANDLING_TIME_MAPPING', 'MEDIUM_FIRST_EFFECT_WEIGHT',
      'DECLARED_FINITE_AREA_GEOMETRY', 'INSTANT_ORBITAL_REFERENCE_TIME_SAVED',
      'EAGLE_FINITE_WORK_SAVED_SHARE', 'MANNED_INCREMENTAL_SERVICE_RATE'],
    feedback_review_items: ['CROWD_SAFE_WINDOW_AND_ARRIVALS', 'ROLE_THRESHOLD_BEHAVIOR', 'OUTLIER_LOADOUTS'],
    user_fixed: {heat_environment: 'normal', heavy_seconds: 20, heavy_count: 2, demolition_holes: 5,
      green_demolition: 0, supply_vehicle_turret: false},
    counts: {equipment: rows.length, three_role_calculation_ready: rows.filter(r=>r.calculation_ready).length,
      with_unresolved_role:rows.filter(r=>Object.values(r.role_states).some(s=>s==='UNRESOLVED'||s==='UTILITY_NOT_QUANTIFIED')).length,
      strategic_calculation_ready:rows.filter(r=>['eagle','orbital','deployable'].includes(r.category)
        &&['chaff','anti_medium'].every(k=>['KNOWN_ZERO','ENGINEERING_ESTIMATE'].includes(r.role_states[k]))).length,
      with_source_work: rows.filter(r => r.source_fields_to_resolve.length).length,
      heavy_with_executed_routes:equipment.filter(r=>r.heavy_assessment?.covered_targets>0).length,
      strategic_heavy_conditionally_computed:equipment.filter(r=>r.heavy_assessment?.state==='CONDITIONAL_STRATEGIC_BONUS').length,
      demolition_with_executed_inventory:equipment.filter(r=>r.demolition_assessment?.state==='EXECUTED_INVENTORY').length,
      demolition_known_zero:equipment.filter(r=>r.demolition_assessment?.state==='KNOWN_ZERO').length,
      weapons_with_endurance_trials:equipment.filter(r=>r.endurance?.combat_trials?.some(t=>t.state==='EXECUTED_FINITE_RESOURCE_PROBE')).length,
      with_heavy_score:equipment.filter(r=>Number.isFinite(r.heavy_assessment?.score)).length,
      with_endurance_score:equipment.filter(r=>Number.isFinite(r.endurance?.score)).length,
      with_demolition_score:equipment.filter(r=>Number.isFinite(r.demolition_assessment?.score)).length,
      with_implementation_work: rows.filter(r => r.implementation_bindings.length).length}, equipment: rows};
}
