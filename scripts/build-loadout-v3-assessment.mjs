import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {weaponFacts, sourcePanel,sharedStatusDefinitions} from '../shared/hd2-loadout/assessment-v2/facts.mjs';
import {ordinaryCapabilities, scoreOrdinary} from '../shared/hd2-loadout/assessment-v2/projectile.mjs';
import {assessmentCoverage} from '../shared/hd2-loadout/assessment-v2/coverage.mjs';
import {extractIdentity} from '../shared/hd2-loadout/calibration/practical/strategic-coverage.mjs';
import {selectUpgradedFields} from '../shared/hd2-loadout/calibration/practical/strategic-upgraded.mjs';
import {strategicProfile,assessStrategic} from '../shared/hd2-loadout/assessment-v2/strategic.mjs';
import {applyManualScores} from '../shared/hd2-loadout/assessment-v2/manual-scores.mjs';
import {grenadeChaff} from '../shared/hd2-loadout/assessment-v2/grenade-chaff.mjs';
import {assessAutomatic} from '../shared/hd2-loadout/assessment-v2/automatic.mjs';
import {bindExplodingChildren,diagnoseExplodingChildren} from '../shared/hd2-loadout/assessment-v2/children.mjs';
import {sourceBindings} from '../shared/hd2-loadout/assessment-v2/source-bindings.mjs';
import {bindServiceModes} from '../shared/hd2-loadout/assessment-v2/service-modes.mjs';
import {bindUtility} from '../shared/hd2-loadout/assessment-v2/utility.mjs';
import {bindMountedFeeds} from '../shared/hd2-loadout/assessment-v2/mounted.mjs';
import {assessEquipmentEndurance,attachEnduranceScore} from '../shared/hd2-loadout/assessment-v2/endurance.mjs';
import {equipmentHeavy,equipmentDemolition} from '../shared/hd2-loadout/assessment-v2/equipment-review.mjs';
import {REVIEW_SCALE} from '../shared/hd2-loadout/assessment-v2/score-scale.mjs';
import {DEFAULT_LOADOUT_ENDURANCE_POLICY} from '../shared/hd2-loadout/assessment-v2/loadout-endurance.mjs';
import {bindReviewedMechanisms} from '../shared/hd2-loadout/assessment-v2/mechanism-bindings.mjs';

const root = new URL('../', import.meta.url);
const read = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const snapshot = read('shared/hd2-loadout/assessment-v2/sources/equipment-expanded.json');
const catalog = read('shared/hd2-loadout/data/catalog.json');
const enemies = read('HD2_Wiki/data/wiki/zh/enemies.json');
const heavy = read('shared/hd2-loadout/calibration/practical/heavy-panel-input.json');
const blastRoutes = read('shared/hd2-loadout/assessment-v2/blast-routes.json');
const mediumRoutes = read('shared/hd2-loadout/assessment-v2/medium-routes.json');
const mediumResolution = read('shared/hd2-loadout/assessment-v2/medium-resolution.json');
const supplementPath = 'docs/ai/assessment-v2-source-completion-20261027/general/parameters.json';
const supplements = sourceBindings(read(supplementPath));
const integrationPath = 'shared/hd2-loadout/assessment-v2/integration-inputs.json';
const integration = read(integrationPath);
for (const [id, values] of Object.entries(integration.weapons)) supplements[id] = {...supplements[id], ...values};
const armor = read('shared/hd2-loadout/calibration/anti-medium-conditions/armor-conditions.json');
const apSource = read('shared/hd2-loadout/calibration/ap-multipliers/source-archive.json');
const ap = {equal: apSource.multipliers.equal.value, greater: apSource.multipliers.greater.value};
const tiers = Object.fromEntries(Object.entries(armor.ordinal_scale.map).map(([n, label]) => [label, Number(n)]));
const armorText = readFileSync(new URL('shared/hd2-loadout/calibration/anti-medium-conditions/raw/Template_Armor.wikitext', root), 'utf8');
for (const m of armorText.matchAll(/^\|\s*(\d+)\s*=.*?\| AP \| (Anti-Tank [IVX]+) \| (Tank [IVX]+)/gm)) { tiers[m[2]] = Number(m[1]); tiers[m[3]] = Number(m[1]); }
const targetIds = [['scavenger','main'],['hunter','main'],['warrior','main'],['alpha_commander','head'],['hive_guard','head'],['bile_spewer','head'],['charger_behemoth','head'],['bile_titan','head'],['impaler','head'],['charger_behemoth','main'],['bile_titan','main'],['impaler','main']];
for (const route of Object.values(mediumRoutes.alternatives)) targetIds.push(route.target_id.split(':'));
for (const route of Object.values(mediumRoutes.explosive_body_routes)) targetIds.push(route.target_id.split(':'));
for (const route of Object.values(mediumRoutes.body_routes)) targetIds.push(route.target_id.split(':'));
targetIds.push(['alpha_commander', 'main'], ['bile_spewer', 'main'],['hive_guard','main']);
const targets = Object.fromEntries(targetIds.map(([id, part]) => [`${id}:${part}`, sourcePanel(enemies, heavy, armor, tiers, id, part)]));
for (const [id, target] of Object.entries(targets)) if (!target) throw Error('TARGET_NOT_PARSED:' + id);
const fireThresholdPath='docs/ai/assessment-v2-mechanisms-20261028/status/enemy-thresholds.json';
for(const panel of read(fireThresholdPath).enemies) {
  const id=panel.name.toLowerCase().replaceAll(' ','_');
  for(const target of Object.values(targets).filter(t=>t.target_id===id))Object.assign(target,{
    fire_threshold_max:panel.fire_threshold_max,fire_multiplier:panel.fire_multiplier,
    status_source_url:panel.source_url,status_source_caveat:'THRESHOLDS_FROM_PATCH_HISTORY; GAS_MULTIPLIER_UNRESOLVED'});
}
const scenario = {
  score_scale:REVIEW_SCALE,
  id: 'n10-rebuild-v2', status: 'ENGINEERING_SCENARIO', heat_environment: 'normal',
  chaff: [{id: 'scavenger:main', count: 12}, {id: 'hunter:main', count: 8}, {id: 'warrior:main', count: 8}],
  medium: [{id: 'alpha_commander:head', count: 3}, {id: 'hive_guard:head', count: 3}, {id: 'bile_spewer:head', count: 2}],
  close_target: 'hunter:main', close_count: 4, close_start_distance_m: 1, close_distance_m: 6, dive_ms: 1000,
  close_escape_model: 'ENGINEERING_LINEAR_DISTANCE; AIM_AND_ESCAPE_CAN_OVERLAP',
  heavy_seconds: 20, heavy_count: 2, demolition_holes: 5,
  heavy_targets: ['charger_behemoth', 'bile_titan', 'impaler'],
  aim_ms: 300, weapon_switch_ms: 500, heavy_aim_ms: 1500, throw_ms: 1500, thermite_effect_ms: 9400, endurance_probe_waves: 4,
  endurance_score:{basis:'TOTAL_AMMO_STANDARD_DAMAGE',reference_id:'ar_23_liberator',reference_score:60,ceiling:105,steepness:1.15,
    curve:'HILL_DAMAGE_RATIO; REFERENCE_AND_CEILING_PRESERVED',status:'ENGINEERING_DISPLAY_SCALE'},
  loadout_endurance:DEFAULT_LOADOUT_ENDURANCE_POLICY,
  throwable_endurance:{basis:'WEIGHTED_CARRIED_PLUS_FINITE_REPLENISHED_USES',reference_carried:4,reference_replenished:2,
    carried_weight:1,replenished_weight:2,reference_display_score:60,ceiling:105,steepness:1.15,
    status:'USER_4_CARRIED_2_REFILL_AT_60; REFILL_WEIGHT_2_IS_ENGINEERING_PARAMETER'},
  heavy_scoring:{minimum_penetration:4,minimum_penetration_label:'Heavy',
    close_continuous_factor:0.7,close_continuous_basis:'USER_CLOSE_CONTINUOUS_HEAVY_DISADVANTAGE; ENGINEERING_INITIAL_FACTOR_NOT_WIKI_MEASUREMENT',
    confirmed_exception_ids:['gp_20_ultimatum',...blastRoutes.conditional_one_shots],
    below_threshold_policy:'ZERO_CONVENTIONAL_SCORE; INCIDENTAL_WEAKPOINTS_INFORMATION_ONLY',
    basis:'USER_HEAVY_PENETRATION_GATE; NOT_TARGET_COUNT_OR_INCIDENTAL_WEAKPOINT',
    aggregation:'MEAN_KNOWN_ROUTE_PERFORMANCE; COVERAGE_REPORTED_SEPARATELY'},
  laser_ignition:{contact_ms:150,contact_range_ms:[100,200],targets:['scavenger','hunter','warrior'],
    basis:'USER_OBSERVED_100_TO_200_MS; MIDPOINT_ESTIMATE_FOR_ORDINARY_LIGHT_ENEMIES',
    evidence:'docs/ai/assessment-v2-laser-ignition-20261028/evidence.json',
    refresh_policy:'ONE_3_SECOND_NONSTACKING_BURN_FROM_IGNITION; NO_REFRESH_CREDIT'},
  spray_ignition:{contact_ms:150,contact_range_ms:[100,200],targets:['scavenger','hunter','warrior'],
    basis:'USER_SPRAY_LIGHT_CONTACT_100_TO_200_MS; MIDPOINT; NOT_PILOT_WARMUP',
    evidence:'docs/ai/assessment-v2-fire-channels-20261028/evidence.json'},
  handling: {status: 'USER_SIMPLIFIED_SMALL_CORRECTION; NO_HIT_PROBABILITY', reference_ergonomics: 65, reference_acquire_ms: 300,
    low_ergo_gain: 0.15, horizontal_ms_per_unit: 2, vertical_ms_per_unit: 1, max_recoil_interval_extra_fraction: 0.15},
  acceptance_policy: {global_recalibration_required: false, corrections_from_rejected_playtest_loadouts: true, real_hit_probability: false},
  cloud: {packet_size: 7, contact_radii_m: [0, 1, 1, 2, 2, 3, 4],
    pressure_control: {residual_threat_fraction: 0.5, onset_delay_ms: 300,
      basis: 'ENGINEERING_RESIDUAL_PRESSURE; USER_CONFIRMS_SIGNIFICANT_CONFUSION; NOT_HIT_PROBABILITY_OR_HARD_STUN',
      application: 'WHILE_CONTINUOUSLY_IN_OWN_FIELD; NONSTACKING_REFRESH; NO_EXTRA_LINGER'},
    contact_policy: 'DECLARED_CONTINUOUS_CLOUD_CONTACT; ONE_NONSTACKING_DPS; NO_EXTRA_LINGER',
    control_score: true, cross_weapon_combos: false,
    close_contact_radii_m: [0, 1, 1, 2], close_activation_delay_ms: 300,
    close_control_basis: 'ENGINEERING_CLUSTER_AND_ATTACK_SETTLE; CONFUSION_IS_NOT_HARD_STUN'},
  strategic: {neighbour_spacing_m: 1.5, instant_coverage: 'REFERENCE_TIME_SAVED',
    eagle_reference_interval: 'ONE_ROLE_COHORT_REFERENCE_SERVICE_TIME',
    manual_operation: 'INCREMENTAL_SERVICE_AFTER_PLAYER_HAND_OCCUPANCY'},
  area:{spacing_samples_m:[1.5],basis:'USER_USUALLY_DENSE_ENEMIES; 1.5M_ENGINEERING_SPACING; 3M_SENSITIVITY_ONLY'},
  fragments:{contact_radius_m:5,scope:'ENGINEERING_COMPACT_CONTACT_SCENE; NOT_SOURCE_FRAGMENT_RANGE; MAX_ONE_MAIN_CONTACT_PER_ENEMY'},
  medium_response: {status: 'ENGINEERING_CANDIDATE_NOT_PLAYER_ANCHOR', first_weight: 0.75, rapid_reference_ms: 2000},
  mounted: {entry_ms:2000,basis:'SOURCE_CALL_AFTER_START; ENGINEERING_MOUNT_ENTRY; STATIONARY_SECTOR; NO_SECOND_CREW_MEMBER'},
  melee: {reposition_ms:750,basis:'ENGINEERING_CONTACT_REPOSITION_PER_ENEMY; NO_REAL_HIT_PROBABILITY',
    ammo_basis:'Wiki Melee Weapons: held attack can continue when stamina is empty',
    source_url:'https://helldivers.wiki.gg/wiki/CQC-2_Saber'},
  medium_weakpoints: mediumRoutes,
  medium_resolution: mediumResolution,
  supply: {public_boxes: 1, backpack_boxes: 4, vehicle_boxes: 8, vehicle_nearby: true, vehicle_turret: false,
    grenade_renewal: {cooldown_ms: 153900, delivery_ms: 0,
      cooldown_basis: 'DERIVED_180S_X_0.95_X_0.9; NOT_A_DIRECT_FULL_UPGRADE_TABLE_ROW',
      delivery_basis: 'NO_UNVERIFIED_DELIVERY_PENALTY; OPTIMISTIC_BOUND',
      evidence: 'docs/ai/assessment-v2-fire-channels-20261028/grenade-supply.json'},
    interaction_ms: {public: 2000, backpack: 1500, vehicle: 4000}, interaction_basis: 'ENGINEERING_ASSUMPTION_NOT_MEASURED'},
  assumptions: ['28轻/8中为用户40怪构成的非重甲部分；具体物种分配为常见组合工程样本', '近防从1米后扑1秒至6米为工程条件；按达到武器安全半径的部分时间计等待，瞄准可并行；不是实测运动轨迹', '20秒双重甲及5洞分别重置满状态，补给动作须在各自窗口内完成'],
};
const sourceById = new Map(snapshot.items.map(e => [e.id, e]));
const sharedEffects=sharedStatusDefinitions(snapshot.items,tiers);
const groundBindings=read('docs/ai/assessment-v2-mechanisms-20261028/status/area-bindings.json').items;
const groundConfirmed=new Set(['g_10_incendiary','g_13_incendiary_impact','g_8_immolation','flam_66_torcher',
  'support_flam_40_flamethrower','p_72_crisper','heavy_support_b_flam_80_flamer',
  'backpack_ax_flam_75_hot_dog','eagle_napalm_airstrike','orbital_napalm_barrage']);
const equipment = catalog.equipment.map(entry => {
  const item = sourceById.get(entry.id);
  if (!item) throw Error('SOURCE_ITEM_MISSING:' + entry.id);
  const facts = bindMountedFeeds(item, bindServiceModes(bindReviewedMechanisms(bindExplodingChildren(item,weaponFacts(item, tiers, supplements,sharedEffects),tiers),scenario), scenario), scenario);
  // Separate nominal stock from executable automatic timing; a known total
  // does not make an unbound drone reload or missile launch executable.
  if(entry.id==='backpack_ax_ar_23_guard_dog')facts.nominal_inventory={kind:'finite',feed:'magazine',capacity:45,reserve:360,total:405,
    refill:{public:360,portable:null},source:'docs/ai/assessment-v2-pool-completion-20261028/remaining-modes/evidence.json'};
  if(entry.id==='support_ms_11_missile_silo')facts.nominal_inventory={kind:'finite',feed:'loose',capacity:1,reserve:0,total:1,
    refill:{public:0,portable:0},scope:'ONE_KNOWN_WARHEAD; IMPACT_COMPONENT_NOT_ADDED_AGAIN'};
  if(entry.id==='p_34_breacher'&&!facts.modes.length){
    const damage=item.infobox.find(r=>r.key==='damage')?.values??[];
    const direct=damage.find(s=>/Ballistic$/.test(s)),blast=damage.find(s=>/Explosion$/.test(s));
    if(direct&&blast)facts.nominal_modes=[{mode_id:'nominal:BREACHER_PANEL',normal:Number.parseFloat(direct.replaceAll(',',''))+Number.parseFloat(blast.replaceAll(',','')),
      durable:null,pellets:1,capacity:facts.inventory.capacity,total:facts.inventory.total,nominal_only:true,
      source:'OWN_INFOBOX_STANDARD_DAMAGE; DURABLE_AND_TRIGGER_UNRESOLVED; FIRE_DOT_EXCLUDED'}];
  }
  const ground=groundBindings.find(g=>g.id===entry.id);
  if(ground&&groundConfirmed.has(entry.id))facts.ground_fire={producer_component_id:ground.producer_component_id,
    duration_s:ground.persistent_area_duration_s,radius_m:ground.area_radius_m,
    ignition:'USER_IMMEDIATE_ON_CONTACT',source_url:ground.source_url,
    scope:'EXPLICIT_CONTACT_ONLY; NO_EXPLOSION_RADIUS_AS_GROUND_GEOMETRY; SAME_NONSTACKING_FIRE'};
  return {equipment_id: entry.id, name: entry.name ?? entry.name_en, slot: entry.selection_slot,
    category: item.category, facts, capabilities: ordinaryCapabilities(facts, targets, ap, scenario),
    child_assessments:facts.modes.filter(m=>m.child_payload).map(m=>({mode_id:m.mode_id,
      targets:[...scenario.chaff,...scenario.medium].map(({id})=>({target_id:id,
        ...diagnoseExplodingChildren(m,targets[id],ap,{direct_contacts:0,blast_contacts:1,blast_distance_m:0})})),
      scope:'ONE_CONDITIONAL_INNER_BLAST; SCATTER_AND_DELAY_UNKNOWN; NOT_ADDED_TO_ROLE_SCORE'})),
    strategic_profile: strategicProfile(item, facts, integration.strategic[entry.id]),
    strategic_source: ['eagle', 'orbital', 'deployable'].includes(item.category)
      ? selectUpgradedFields(extractIdentity(item)).map(f => ({field: f.field, part: f.part ?? null,
        full_upgrade_status: f.full_upgrade_status, selected: f.selected_full_upgrade,
        observed_upgraded: f.observed_upgraded, caveats: f.caveats})) : null};
});
// Reuse the same named Gas status only when all source definitions agree and
// the receiving item's own damage table matches it. This is source linking,
// not a guessed gas duration for an unrelated effect or an old score override.
const gasDefinitions = equipment.flatMap(row => row.facts.effects.filter(e => e.id === 'Gas')
  .map(effect => ({effect, source_ref: row.facts.source_ref})));
const gasKey = e => JSON.stringify([e.normal, e.durable, e.pen, e.duration_s]);
if (gasDefinitions.length && new Set(gasDefinitions.map(d => gasKey(d.effect))).size === 1) {
  for (const row of equipment.filter(r => r.strategic_profile?.gas && !r.facts.effects.some(e => e.id === 'Gas'))) {
    const item = sourceById.get(row.equipment_id), damage = item.tables.find(t => t.kind === 'attack_damage');
    const raw = key => damage?.rows.find(r => r.key === key)?.raw;
    const effect = gasDefinitions[0].effect;
    if (raw('element') === 'Gas' && Number.parseFloat(raw('damage_standard')) === effect.normal
      && Number.parseFloat(raw('damage_durable')) === effect.durable && tiers[raw('pen_direct')] === effect.pen) {
      row.facts.effects.push({...effect, linked_definition_refs: gasDefinitions.map(d => d.source_ref),
        basis: 'MATCHING_NAMED_STATUS_AND_OWN_DAMAGE_PANEL'});
    }
  }
}
const byId = new Map(equipment.map(row => [row.equipment_id, row]));
const references = {chaff: 'support_mg_43_machine_gun', close_defense: 'ar_23_liberator', anti_medium: 'br_14_adjudicator'};
for (const row of equipment) {
  bindUtility(row);
  row.dimensions = {};
  for (const [role, referenceId] of Object.entries(references)) {
    const reference = byId.get(referenceId);
    row.dimensions[role] = scoreOrdinary(row.capabilities, reference.capabilities,
      {primary: row.slot === 'primary', reference_primary: reference.slot === 'primary', role});
  }
  if (row.category === 'throwables') {
    row.grenade_chaff = grenadeChaff(row, byId.get(references.chaff), scenario);
    row.dimensions.chaff = {...row.dimensions.chaff, ...row.grenade_chaff, contribution_kind: 'AUXILIARY_ADDITION'};
  }
}
const inputPaths = ['shared/hd2-loadout/assessment-v2/mechanism-bindings.mjs','docs/ai/assessment-v2-mechanism-review-20261028/evidence-terra.json',supplementPath, 'shared/hd2-loadout/assessment-v2/source-bindings.mjs', 'shared/hd2-loadout/assessment-v2/sources/equipment-expanded.json','shared/hd2-loadout/data/catalog.json','HD2_Wiki/data/wiki/zh/enemies.json',
  'shared/hd2-loadout/assessment-v2/automatic.mjs',
  'shared/hd2-loadout/assessment-v2/children.mjs',
  'shared/hd2-loadout/assessment-v2/score-scale.mjs',
  'docs/ai/assessment-v2-pool-completion-20261028/fire-gas/evidence.json',
  'docs/ai/assessment-v2-pool-completion-20261028/payload-inventory/evidence.json',
  'docs/ai/assessment-v2-pool-completion-20261028/remaining-modes/evidence.json',
  'shared/hd2-loadout/assessment-v2/grenade-chaff.mjs','shared/hd2-loadout/assessment-v2/elemental-damage.mjs',
  'shared/hd2-loadout/assessment-v2/strategic-adjustments.mjs',
  'docs/ai/assessment-v2-fire-channels-20261028/evidence.json','docs/ai/assessment-v2-fire-channels-20261028/grenade-supply.json',
  'docs/ai/assessment-v2-mechanisms-20261028/status/area-bindings.json',
  'shared/hd2-loadout/calibration/practical/heavy-panel-input.json','shared/hd2-loadout/calibration/anti-medium-conditions/armor-conditions.json',
  'shared/hd2-loadout/calibration/anti-medium-conditions/raw/Template_Armor.wikitext','shared/hd2-loadout/calibration/ap-multipliers/source-archive.json',
  'shared/hd2-loadout/assessment-v2/facts.mjs','shared/hd2-loadout/assessment-v2/projectile.mjs','shared/hd2-loadout/assessment-v2/formulas.mjs',
  'shared/hd2-loadout/assessment-v2/handling.mjs','shared/hd2-loadout/assessment-v2/timing.mjs',
  'shared/hd2-loadout/assessment-v2/strategic.mjs','shared/hd2-loadout/assessment-v2/service-modes.mjs','shared/hd2-loadout/assessment-v2/area.mjs','shared/hd2-loadout/assessment-v2/fragments.mjs','shared/hd2-loadout/assessment-v2/utility.mjs', integrationPath,
  'shared/hd2-loadout/assessment-v2/cloud.mjs','shared/hd2-loadout/assessment-v2/resources.mjs',
  'shared/hd2-loadout/assessment-v2/blast-routes.json','shared/hd2-loadout/assessment-v2/blast-routes.mjs',
  'shared/hd2-loadout/assessment-v2/medium-routes.json',fireThresholdPath,'shared/hd2-loadout/assessment-v2/status.mjs',
  'docs/ai/assessment-v2-laser-ignition-20261028/evidence.json',
  'docs/ai/assessment-v2-mechanisms-20261028/fragments/findings.json',
  'docs/ai/assessment-v2-mechanisms-20261028/gaps/mode-and-stock-bindings.json',
  'shared/hd2-loadout/assessment-v2/medium-resolution.json','shared/hd2-loadout/assessment-v2/medium-resolution.mjs',
  'shared/hd2-loadout/assessment-v2/engagement.mjs','shared/hd2-loadout/assessment-v2/mechanisms.mjs',
  'shared/hd2-loadout/assessment-v2/coverage.mjs','shared/hd2-loadout/assessment-v2/mounted.mjs','shared/hd2-loadout/assessment-v2/endurance.mjs',
  'shared/hd2-loadout/assessment-v2/equipment-review.mjs','shared/hd2-loadout/assessment-v2/demolition.mjs',
  'shared/hd2-loadout/assessment-v2/heavy-eligibility.mjs',
  'shared/hd2-loadout/assessment-v2/manual-scores.mjs','shared/hd2-loadout/assessment-v2/manual-scores.json',
  'shared/hd2-loadout/assessment-v2/dimension-scores.mjs',
  'shared/hd2-loadout/assessment-v2/endurance-total.mjs',
  'shared/hd2-loadout/assessment-v2/loadout-endurance.mjs',
  'shared/hd2-loadout/assessment-v2/score-exclusions.mjs',
  'shared/hd2-loadout/calibration/practical/endurance-capacity.mjs','shared/hd2-loadout/calibration/practical/attack-mode-core.mjs',
  'shared/hd2-loadout/demolition/extract.mjs',
  'shared/hd2-loadout/demolition/sources.mjs','shared/hd2-loadout/calibration/practical/strategic-coverage.mjs',
  'shared/hd2-loadout/calibration/practical/strategic-upgraded.mjs'];
const result = {schema: 2, kind: 'capacity-assessment', status: 'PARTIAL_REBUILD_NOT_FOR_DRAW',
  scenario, ap, targets, references, equipment, blast_routes: blastRoutes,
  sources: snapshot.items.map(item => ({id: `wiki:${item.id}@${item.provenance.revid}`, url: item.source_url, ...item.provenance})),
  input_hashes: Object.fromEntries(inputPaths.map(path => [path, createHash('sha256').update(readFileSync(new URL(path, root))).digest('hex')]))};
for (const row of equipment) {
  row.endurance=assessEquipmentEndurance(row,byId.get(references.chaff),result);
  row.heavy_assessment=equipmentHeavy(row,result);
  row.demolition_assessment=equipmentDemolition(row,result);
}
for(const row of equipment)attachEnduranceScore(row,byId.get(scenario.endurance_score.reference_id),result);
for(const row of equipment) {
  row.automatic_assessments=assessAutomatic(row,result);
  for(const a of row.automatic_assessments)row.dimensions[a.role]={state:a.contribution.status==='KNOWN'?'ENGINEERING_ESTIMATE':'UNRESOLVED',
    score:a.contribution.value,contribution_kind:'AUXILIARY_ADDITION',reason:a.contribution.reason,scope:'AUTOMATIC_BACKPACK; NOT_HELD_GUN'};
  const bonuses=row.strategic_profile?assessStrategic(row,result):[];
  row.calculated_scores={...Object.fromEntries(Object.entries(row.dimensions).map(([role,v])=>[role,
    row.strategic_profile?bonuses.find(b=>b.role===role)?.contribution?.value??null:v.score])),
    anti_heavy:row.heavy_assessment.score,endurance:row.endurance.score,demolition:row.demolition_assessment.score};
}
applyManualScores(result,read('shared/hd2-loadout/assessment-v2/manual-scores.json'));
const content = JSON.stringify(result, null, 2) + '\n';
const output = new URL('shared/hd2-loadout/assessment-v2/equipment.json', root);
if (process.argv.includes('--check')) {
  if (readFileSync(output, 'utf8') !== content) throw Error('ASSESSMENT_DATA_DRIFT');
} else writeFileSync(output, content);
const coveragePath = new URL('shared/hd2-loadout/assessment-v2/coverage.json', root);
const coverageContent = JSON.stringify(assessmentCoverage(equipment, result), null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (readFileSync(coveragePath, 'utf8') !== coverageContent) throw Error('ASSESSMENT_COVERAGE_DRIFT');
} else writeFileSync(coveragePath, coverageContent);
console.log(JSON.stringify({equipment: equipment.length, ordinary: equipment.filter(e => e.capabilities.status === 'PROJECTILE_ESTIMATE').length,
  role_estimates: Object.fromEntries(Object.keys(references).map(role => [role, equipment.filter(e => e.dimensions[role].state === 'ENGINEERING_ESTIMATE').length])),
  known_zero: Object.fromEntries(Object.keys(references).map(role => [role, equipment.filter(e => e.dimensions[role].state === 'KNOWN_ZERO').length])),
  status: result.status}));
