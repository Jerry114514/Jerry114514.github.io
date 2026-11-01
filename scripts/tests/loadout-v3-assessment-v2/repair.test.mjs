import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {beginAssessmentDraw,stepAssessmentDraw} from '../../../shared/hd2-loadout/assessment-v2/draw.mjs';
import {assessmentLegality} from '../../../shared/hd2-loadout/assessment-v2/evaluate.mjs';
import {REPAIR_POLICY,REPAIR_ROLES,repairMeasure,contributionLoss,improvesRepair,weakestContributions,candidateWeight,preferredTrials,bottleneckTrials} from '../../../shared/hd2-loadout/assessment-v2/repair.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../../../shared/hd2-loadout/'+name,import.meta.url)));
const model=read('assessment-v2/equipment.json'),catalog=read('data/catalog.json');
const slots=['primary','secondary','grenade',...Array.from({length:4},(_,i)=>'stratagem:'+i)];
const at=(l,s)=>s.startsWith('stratagem:')?l.stratagems[Number(s.split(':')[1])]:l[s];
const ids=l=>slots.map(s=>at(l,s));
function estimate(scores={},physical='UNKNOWN') {
  const dimensions=Object.fromEntries(REPAIR_ROLES.map(role=>{
    const score=Object.hasOwn(scores,role)?scores[role]:80;
    return [role,{score,threshold:60,status:score!==null&&score>=60?'PASS':'UNKNOWN'}];
  }));
  const pass=physical==='PASS'&&Object.values(dimensions).every(d=>d.status==='PASS');
  return {status:pass?'ESTIMATED_PASS':'UNKNOWN',acceptance_ready:pass,dimensions,
    gates:Object.fromEntries(['legality','heavy_pair','demolition','shared_resources','close_safety'].map(g=>[g,{status:g==='heavy_pair'?physical:'PASS'}]))};
}
const advance=(task,evaluate,condition,preview=evaluate)=>{for(let i=0;i<500;i++){stepAssessmentDraw(task,evaluate,preview);if(condition())return;}assert.fail('test step bound');};

test('contribution compares complete-loadout deficits and capped surplus, protects passed checks and keeps unknown unpassed',()=>{
  const base=repairMeasure(estimate({endurance:50}));
  const redundant=contributionLoss(base,repairMeasure(estimate({endurance:50})));
  const essential=contributionLoss(base,repairMeasure(estimate({chaff:40,endurance:50})));
  assert.equal(redundant.utility_loss,0);assert.deepEqual(redundant.lost_checks,[]);
  assert.ok(essential.lost_checks.includes('score:chaff'));
  assert.equal(repairMeasure(estimate({anti_heavy:100})).utility,repairMeasure(estimate({anti_heavy:1000})).utility);
  assert.ok(!repairMeasure(estimate({endurance:null})).passed.includes('score:endurance'));
  assert.equal(improvesRepair(base,repairMeasure(estimate({endurance:55}))),true);
  assert.equal(improvesRepair(base,repairMeasure(estimate({chaff:59,endurance:100}))),true,'temporary threshold crossing is allowed when total deficit improves');
  assert.equal(improvesRepair(base,repairMeasure(estimate({endurance:50},'PASS'))),true);
  const tied=['a','b','c'].map(slot=>({slot,loss:redundant}));
  assert.equal(weakestContributions([...tied,{slot:'critical',loss:essential}]).length,3,'ties do not prefer slot order');
});

for(const weakestSlot of slots)test(`initial repair can select ${weakestSlot}, measures all seven slots and checks replacement legality`,()=>{
  const task=beginAssessmentDraw(model,catalog,{seed:12});
  let original;const ablations=[];
  const evaluate=(loadout,m,c,options={})=>{
    if(!original)original=structuredClone(loadout);
    if(options.disabled_contributions?.length){
      assert.deepEqual(loadout,original,'ablation keeps all seven IDs');
      const disabled=options.disabled_contributions[0];ablations.push(disabled);
      return estimate({chaff:disabled===at(original,weakestSlot)?50:20,close_defense:disabled===at(original,weakestSlot)?80:30});
    }
    if(ids(loadout).join()===ids(original).join())return estimate({chaff:50});
    const changed=slots.filter(s=>at(loadout,s)!==at(original,s));
    assert.equal(changed.length,1);
    if(changed[0]!==weakestSlot)return estimate({chaff:30});
    assert.equal(assessmentLegality(loadout,catalog,model).status,'PASS');
    return estimate({},'PASS');
  };
  advance(task,evaluate,()=>task.result);
  assert.equal(task.result.status,'ASSESSMENT_PASS');
  assert.deepEqual(new Set(ablations),new Set(ids(original)));
  assert.ok(task.search_stats.local_trials<=REPAIR_POLICY.full_checks_per_round);
});

test('locked slots are neither ablated nor replaced and exclusions constrain local candidates',()=>{
  const fixed='plas_1_scorcher',excluded='ar_23_liberator';
  const task=beginAssessmentDraw(model,catalog,{seed:12,constraints:{locks:{primary:fixed},excluded:[excluded]}});
  let original;const disabled=[];
  const evaluate=(loadout,m,c,options={})=>{
    assert.equal(loadout.primary,fixed);assert.ok(!ids(loadout).includes(excluded));
    original??=structuredClone(loadout);
    if(options.disabled_contributions?.length){disabled.push(options.disabled_contributions[0]);return estimate({chaff:40});}
    return ids(loadout).join()===ids(original).join()?estimate({chaff:50}):estimate({},'PASS');
  };
  advance(task,evaluate,()=>task.result);
  assert.equal(task.result.status,'ASSESSMENT_PASS');assert.equal(disabled.length,6);assert.ok(!disabled.includes(fixed));
});

test('unsuccessful trials preserve their parent, reuse contributions, and restart after a bounded budget',()=>{
  const task=beginAssessmentDraw(model,catalog,{seed:12});let original;const parents=[];
  const evaluate=(loadout,m,c,options={})=>{
    original??=structuredClone(loadout);
    if(options.disabled_contributions?.length){parents.push(structuredClone(loadout));return estimate({chaff:30});}
    return estimate({chaff:ids(loadout).join()===ids(original).join()?50:40});
  };
  advance(task,evaluate,()=>task.search_stats.restarts===1);
  assert.equal(task.search_stats.local_trials,REPAIR_POLICY.full_checks_per_round);
  assert.equal(task.search_stats.ablations,7);assert.equal(task.search_stats.improvements,0);
  assert.ok(parents.every(l=>JSON.stringify(l)===JSON.stringify(original)));
  const previous=task.search_stats.whole_draws;stepAssessmentDraw(task,evaluate);
  assert.equal(task.search_stats.whole_draws,previous+1);
});

test('retained trials remeasure all seven contributions and the local branch has a hard round limit',()=>{
  const task=beginAssessmentDraw(model,catalog,{seed:12});let original;const parents=[];
  const preview=(loadout,m,c,options={})=>{
    if(options.disabled_contributions?.length){parents.push(structuredClone(loadout));return estimate({chaff:20});}
    return estimate({chaff:50});
  };
  const evaluate=loadout=>{
    original??=structuredClone(loadout);
    if(ids(loadout).join()===ids(original).join())return estimate({chaff:40});
    return estimate({chaff:50+task.search_stats.local_trials});
  };
  advance(task,evaluate,()=>task.search_stats.restarts===1,preview);
  assert.equal(task.search_stats.improvements,1);assert.equal(task.search_stats.ablations,14);
  assert.equal(task.search_stats.local_trials,REPAIR_POLICY.full_checks_per_round*REPAIR_POLICY.max_rounds);
  assert.ok(parents.slice(0,7).every(l=>JSON.stringify(l)===JSON.stringify(original)));
  assert.ok(parents.slice(7).every(l=>JSON.stringify(l)!==JSON.stringify(original)));
});

test('a passing ablation is not a passing real loadout and the diagnostic whole-draw path never ablates',()=>{
  const task=beginAssessmentDraw(model,catalog,{seed:12});
  const evaluate=()=>estimate({chaff:20});
  advance(task,evaluate,()=>task.search_stats.local_trials===2,()=>estimate({},'PASS'));
  assert.equal(task.result,null);
  const whole=beginAssessmentDraw(model,catalog,{seed:12,local_repair:false});let calls=0;
  advance(whole,(l,m,c,o)=>{assert.equal(o.disabled_contributions,undefined);return ++calls===2?estimate({},'PASS'):estimate({chaff:20});},()=>whole.result);
  assert.equal(whole.search_stats.ablations,0);assert.equal(whole.search_stats.local_trials,0);
});

test('an initial passing loadout is returned immediately without any optimization or strength ceiling',()=>{
  const task=beginAssessmentDraw(model,catalog,{seed:12});let calls=0;
  advance(task,()=>{calls++;return estimate(Object.fromEntries(REPAIR_ROLES.map(r=>[r,105])),'PASS');},()=>task.result);
  assert.equal(calls,1);assert.equal(task.search_stats.ablations,0);assert.equal(task.search_stats.local_trials,0);
  assert.equal(task.result.status,'ASSESSMENT_PASS');
});

test('candidate hints prefer a missing ability without making any legal equipment unselectable',()=>{
  const measure=repairMeasure(estimate({endurance:30},'PASS'));
  const neutral={dimensions:{},endurance:{score:0}};
  const supply={dimensions:{},endurance:{state:'SUPPLY_PROVIDER',score:0}};
  assert.equal(candidateWeight(neutral,measure),1);
  assert.equal(candidateWeight(supply,measure),4);
  assert.equal(candidateWeight(null,measure),1);
});

test('actual trial selection rejects physical regressions and keeps multiple near-best improvements',()=>{
  const parent=repairMeasure(estimate({chaff:40},'PASS'));
  const trials=[{id:'a',measure:repairMeasure(estimate({chaff:50},'PASS'))},
    {id:'b',measure:repairMeasure(estimate({chaff:49},'PASS'))},
    {id:'c',measure:repairMeasure(estimate({chaff:48},'PASS'))},
    {id:'regression',measure:repairMeasure(estimate({},'UNKNOWN'))}];
  assert.deepEqual(preferredTrials(parent,trials).map(t=>t.id),['a','b']);
});


function splitEstimate(routine={},addition={}) {
  const value=estimate({},'PASS');
  for(const role of REPAIR_ROLES) {
    const base=routine[role]??80,bonus=addition[role]??0,score=base+bonus;
    value.dimensions[role]={score,base_score:base,auxiliary_bonus:bonus,status:score>=60?'PASS':'UNKNOWN'};
  }
  return repairMeasure(value);
}

test('routine and additive bottlenecks each nominate a trial without comparing their raw increment sizes',()=>{
  const parent=splitEstimate({chaff:30},{chaff:20});
  const routine={id:'routine',measure:splitEstimate({chaff:70},{chaff:20})};
  const smallerRoutine={id:'second-routine',measure:splitEstimate({chaff:60},{chaff:20})};
  const addition={id:'addition',measure:splitEstimate({chaff:30},{chaff:24})};
  const result=bottleneckTrials(parent,[routine,smallerRoutine,addition]);
  assert.deepEqual(result.candidates.map(c=>c.id),['routine','addition']);
  assert.deepEqual(result.directions.map(d=>[d.group,d.roles]),[['routine',['chaff']],['addition',['chaff']]]);
});

test('structural zeros in covered roles do not create separate admission requirements',()=>{
  const parent=splitEstimate({chaff:30,anti_heavy:0},{chaff:20,anti_heavy:100});
  const result=bottleneckTrials(parent,[{id:'chaff',measure:splitEstimate({chaff:45,anti_heavy:0},{chaff:20,anti_heavy:100})},
    {id:'redundant-heavy',measure:splitEstimate({chaff:30,anti_heavy:50},{chaff:20,anti_heavy:100})}]);
  assert.ok(result.directions.every(d=>!d.roles.includes('anti_heavy')));
  assert.equal(result.directions[0].group,'routine');
  assert.equal(result.candidates[0].id,'chaff');
});

test('unimprovable zero additions do not consume a physical trial, and tied weakest roles can improve one at a time',()=>{
  const parent=splitEstimate({chaff:20,close_defense:20,endurance:50},{chaff:10,close_defense:10});
  const result=bottleneckTrials(parent,[{id:'one',measure:splitEstimate({chaff:35,close_defense:20,endurance:50},{chaff:10,close_defense:10})},
    {id:'bonus',measure:splitEstimate({chaff:20,close_defense:20,endurance:50},{chaff:13,close_defense:10})}]);
  assert.deepEqual(result.directions.map(d=>d.roles),[['chaff','close_defense'],['chaff','close_defense']]);
  assert.equal(result.candidates.length,2);
});

test('the supply floor improves the routine endurance layer once without inventing an additive stock',()=>{
  const value=estimate();value.dimensions.endurance={score:100,base_score:40,auxiliary_bonus:5,status:'PASS',
    supply_adjustment:{before_score:45,added_score:55}};
  const measure=repairMeasure(value);
  assert.equal(measure.groups.routine.endurance,95);assert.equal(measure.groups.addition.endurance,5);
  assert.equal(measure.needs.endurance,0);
});
