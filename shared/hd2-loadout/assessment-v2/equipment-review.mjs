import {heavyRoutes,resourceWeapons,supplyProviders} from './engagement.mjs';
import {executeResourcePlan} from './resources.mjs';
import {assessStrategic} from './strategic.mjs';
import {demolitionRoutes,demolitionResources,demolitionCapability} from './demolition.mjs';
import {heavyCapacityScore,demolitionCapacityScore} from './dimension-scores.mjs';
import {heavyEligibility} from './heavy-eligibility.mjs';

const zero=row=>row.facts.known_noncombat||row.utility?.combat_damage===false||row.strategic_profile?.realization_class==='smoke';
const summarize=r=>({status:r.status,reason:r.reason??null,elapsed_ms:r.elapsed_ms??r.state.time,
  completed_actions:r.completed_steps??0,supplies_taken:r.supplies_taken,
  stock_remaining:Object.fromEntries(Object.entries(r.state.resources).map(([k,v])=>[k,v.value]))});

export function equipmentHeavy(row,model) {
  if(zero(row))return {state:'KNOWN_ZERO',score:0,reason:'NO_OFFENSIVE_HEAVY_DAMAGE'};
  const eligibility=heavyEligibility(row,model);
  if(eligibility.state==='BELOW_THRESHOLD')return {state:'KNOWN_ZERO',score:0,eligibility,
    reason:'BELOW_HEAVY_PENETRATION; INCIDENTAL_WEAKPOINT_NOT_ANTI_HEAVY',
    incidental_routes:model.scenario.heavy_targets.flatMap(id=>heavyRoutes(row,id,model,{incidental_only:true})
      .map(route=>({target_id:id,route:route.route,condition:route.condition,rounds:route.rounds}))),
    scope:'USER_DEFAULT_ZERO; INCIDENTAL_ROUTES_HAVE_NO_SCORE_OR_HEAVY_GATE_CREDIT'};
  if(row.strategic_profile) {
    const assessment=assessStrategic(row,model,{selected_roles:['anti_heavy']})[0];
    return {state:assessment.contribution.status==='KNOWN'?'CONDITIONAL_STRATEGIC_BONUS':'UNRESOLVED',
      score:assessment.contribution.value,assessment,eligibility,
      scope:'MAIN_HP_CAPACITY_PLUS_CD_AND_K; NOT_A_STABLE_TARGETING_OR_TWO_KILL_PROOF'};
  }
  const weapons=resourceWeapons([row]);
  const cases=model.scenario.heavy_targets.map(id=>{
    const routes=heavyRoutes(row,id,model);
    const outcomes=routes.filter(route=>weapons.some(w=>w.id===route.weapon_id)).map(route=>{
      const targets={one:{hp:route.target_hp??1},two:{hp:route.target_hp??1}};
      const steps=['one','two'].map(target_id=>({...route,target_id,switch_ms:model.scenario.weapon_switch_ms}));
      const run=providers=>executeResourcePlan({weapons,providers,steps,targets,deadline_ms:model.scenario.heavy_seconds*1000});
      const providers=supplyProviders([row],model.scenario);
      const initial=run([]),pub=run(providers);
      const mode=(row.facts.service_modes??row.facts.modes).find(m=>m.mode_id===route.mode_id);
      const closeContinuous=mode?.continuous&&(/FUEL_UNIT|UNDERBARREL_FIRST_CANISTER|CANDIDATE_1.4S_BEAM/.test(mode.service_conversion??''));
      const factor=closeContinuous?model.scenario.heavy_scoring.close_continuous_factor??1:1;
      const adjust=score=>({...score,bare_score:score.score,score:Number.isFinite(score.score)?Math.round(score.score*factor*100)/100:null,
        route_factor:factor,route_condition:closeContinuous?'CLOSE_RANGE_CONTINUOUS_HAND_OCCUPANCY; ENGINEERING_CONDITION_FACTOR':'BOUND_STANDARD_ROUTE'});
      const scoreTrial=(p,limited)=>{
        const result=limited.status==='COMPLETED'?limited:executeResourcePlan({weapons,providers:p,steps,targets});
        if(result.status==='COMPLETED')return {...heavyCapacityScore({completed:2,elapsed_ms:result.elapsed_ms,
          window_ms:model.scenario.heavy_seconds*1000}),pair_time_ms:result.elapsed_ms,completed:2};
        if(result.status!=='INSUFFICIENT')return {score:null,reason:result.reason};
        const one=executeResourcePlan({weapons,providers:p,steps:[steps[0]],targets:{one:targets.one}});
        if(one.status!=='COMPLETED'&&one.status!=='INSUFFICIENT')return {score:null,reason:one.reason};
        return {...heavyCapacityScore({completed:one.status==='COMPLETED'?1:0,elapsed_ms:one.elapsed_ms,
          window_ms:model.scenario.heavy_seconds*1000}),completed:one.status==='COMPLETED'?1:0,pair_failure:result.reason};
      };
      return {route,initial:summarize(initial),public:summarize(pub),
        scoring:{initial:adjust(scoreTrial([],initial)),public:adjust(scoreTrial(providers,pub))}};
    }).sort((a,b)=>(b.scoring.public.score??-1)-(a.scoring.public.score??-1)||a.public.elapsed_ms-b.public.elapsed_ms);
    return {target_id:id,state:outcomes.length?'EXECUTED_ROUTE':'NO_BOUND_ROUTE',best:outcomes[0]??null};
  });
  const known=cases.map(c=>c.best?.scoring.public.score).filter(Number.isFinite);
  return {state:cases.some(c=>c.best)?'PARTIAL_TARGET_ROUTES':'UNRESOLVED',cases,eligibility,
    score:known.length?Math.round(known.reduce((n,x)=>n+x,0)/known.length*100)/100:null,
    score_basis:'HEAVY_PENETRATION_GATE_THEN_KNOWN_TWO_KILL_PERFORMANCE; NO_COVERAGE_DIVISOR',
    score_lower_bound:false,scored_targets:known.length,total_targets:cases.length,
    coverage_status:known.length===cases.length?'COMPLETE_SAMPLE':'PARTIAL_SAMPLE',
    conditional_only:known.length>0&&cases.filter(c=>c.best).every(c=>c.best.scoring.public.route_factor<1),
    covered_targets:cases.filter(c=>c.best).length,passed_pairs:cases.filter(c=>c.best?.public.status==='COMPLETED').length,
    scope:'TWO_IDENTICAL_TARGETS_IN_20S; EACH_CASE_FULL_STOCK_RESET; THREE_TARGET_SAMPLE_ONLY'};
}

export function equipmentDemolition(row,model) {
  if(row.category==='deployable'||zero(row))return {state:'KNOWN_ZERO',score:0,reason:row.category==='deployable'?'USER_GREEN_DEMOLITION_ZERO':'NO_DEMOLITION_ROUTE'};
  const capability=demolitionCapability(row);
  const candidates=row.facts.demolition_components.filter(c=>!c.backblast&&c.attack_type!=='status'&&Number.isFinite(c.force)&&c.force>=20);
  const routes=demolitionRoutes(row,model.scenario),weapons=demolitionResources([row]);
  const trials=routes.filter(route=>weapons.some(w=>w.id===route.weapon_id)).map(route=>{
    const steps=Array.from({length:model.scenario.demolition_holes},()=>route);
    const initial=executeResourcePlan({weapons,providers:[],steps});
    const pub=executeResourcePlan({weapons,providers:supplyProviders([row],model.scenario),steps});
    const probeLimit=model.scenario.demolition_holes*5;
    const probe=providers=>{
      const r=executeResourcePlan({weapons,providers,steps:Array.from({length:probeLimit},()=>route)});
      return {...summarize(r),...(route.inventory_only?{elapsed_ms:null,timing_status:'INVENTORY_ONLY'}:{}),...(['COMPLETED','INSUFFICIENT'].includes(r.status)
        ?demolitionCapacityScore(r.completed_steps,model.scenario.demolition_holes):{score:null,reason:r.reason}),
        probe_limit:probeLimit,lower_bound:r.status==='COMPLETED'};
    };
    const summary=r=>({...summarize(r),...(route.inventory_only?{elapsed_ms:null,timing_status:'INVENTORY_ONLY'}:{})});
    return {route,initial:summary(initial),public:summary(pub),
      scoring:{initial:probe([]),public:probe(supplyProviders([row],model.scenario))}};
  }).sort((a,b)=>b.public.completed_actions-a.public.completed_actions||a.public.elapsed_ms-b.public.elapsed_ms);
  const best=trials[0];
  const knownNone=capability.state==='KNOWN_ZERO';
  return {state:best?'EXECUTED_INVENTORY':knownNone?'KNOWN_ZERO':capability.qualifies?'CAPABLE_STOCK_UNRESOLVED':'UNRESOLVED',
    capability,score:best?.scoring.public.score??(knownNone?0:null),
    score_lower_bound:best?.scoring.public.lower_bound??false,
    score_basis:'S_FIRST_CYCLE_HOLES_DIVIDED_BY_5; NO_LARGE_CD_REFILL; NO_SPEED_BONUS',
    max_demolition_force:candidates.length?Math.max(...candidates.map(c=>c.force)):null,
    candidates,best:best??null,scope:'FIVE_DISTINCT_ORDINARY_HOLES; ONE_PAID_ACTION_PER_HOLE; NO_TRAVEL_DEADLINE',
    caveats:row.strategic_profile?['FIRST_CYCLE_ONLY; NO_LARGE_CD_RECHARGE','USER_DEFAULT_QUALIFIED_CONTACT; ONE_HOLE_PER_CALL; NO_TIME_CLAIM']
      :['INSIDE_ANY_30_FROM_ARCHIVED_MISSIONS_EQUIVALENCE; CURRENT_BUG_HOLE_PAGE_OMITS_THIS_BRANCH']};
}
