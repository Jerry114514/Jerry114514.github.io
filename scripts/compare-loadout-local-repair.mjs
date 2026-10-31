import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {beginAssessmentDraw,stepAssessmentDraw} from '../shared/hd2-loadout/assessment-v2/draw.mjs';
import {REPAIR_ROLES,REPAIR_POLICY,repairMeasure} from '../shared/hd2-loadout/assessment-v2/repair.mjs';
import {seeded,uniformInt} from '../shared/hd2-loadout/engine/rng.mjs';

const arg=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const count=Number(arg('--count',300)),start=Number(arg('--start',240000));
if(!Number.isSafeInteger(count)||count<1||!Number.isSafeInteger(start)||start<0||start+count>0xffffffff)throw Error('INVALID_SAMPLE_RANGE');
const output=resolve(arg('--output','scripts/.loadout-artifacts/local-repair-comparison.json'));
const root=new URL('../',import.meta.url),modelBytes=readFileSync(new URL('shared/hd2-loadout/assessment-v2/equipment.json',root));
const model=JSON.parse(modelBytes),catalog=JSON.parse(readFileSync(new URL('shared/hd2-loadout/data/catalog.json',root)));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const report={schema:1,seed_start:start,count_requested:count,policy:REPAIR_POLICY,model_sha256:hash(modelBytes),
  revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  runtime_hashes:Object.fromEntries(['draw.mjs','repair.mjs','evaluate.mjs','resources.mjs','../engine/ledger.mjs'].map(name=>[name,hash(readFileSync(new URL('shared/hd2-loadout/assessment-v2/'+name,root)))])),
  metric:'MEAN_OF_SIX_FINAL_SCORES_CAPPED_AT_100; MODEL_PROXY_NOT_GAMEPLAY',pairs:[]};
const mean=a=>a.length?a.reduce((s,n)=>s+n,0)/a.length:null;
const quantile=(a,q)=>{if(!a.length)return null;const s=[...a].sort((a,b)=>a-b);return s[Math.floor((s.length-1)*q)];};
function run(seed,local_repair){
  const task=beginAssessmentDraw(model,catalog,{seed,local_repair}),begin=performance.now();let value,steps=0;
  do {value=stepAssessmentDraw(task);steps++;}while(value.status==='SEARCHING'&&steps<100000&&performance.now()-begin<60000);
  const elapsed_ms=performance.now()-begin;
  if(value.status!=='ASSESSMENT_PASS')return {status:value.status,elapsed_ms,steps,search_stats:task.search_stats};
  const scores=Object.fromEntries(REPAIR_ROLES.map(role=>[role,value.dimensions[role].score]));
  if(REPAIR_ROLES.some(role=>value.dimensions[role].status!=='PASS'||scores[role]<60-1e-10)
    ||Object.values(value.gates).some(gate=>gate.status!=='PASS'))throw Error('UNACCEPTABLE_OUTPUT');
  return {status:value.status,loadout:value.loadout,scores,quality:mean(Object.values(scores).map(n=>Math.min(100,n))),
    weakest:Math.min(...Object.values(scores)),layers:repairMeasure(value).groups,elapsed_ms,steps,completed:task.completed,search_stats:task.search_stats};
}
function summarize(){
  report.summary={};
  for(const mode of ['whole','repair']){
    const all=report.pairs.map(p=>p[mode]),rows=all.filter(r=>r.status==='ASSESSMENT_PASS'),frequency={};
    for(const r of rows)for(const id of [r.loadout.primary,r.loadout.secondary,r.loadout.grenade,...r.loadout.stratagems])frequency[id]=(frequency[id]??0)+1;
    const distinct=slot=>new Set(rows.flatMap(r=>slot==='stratagem'?r.loadout.stratagems:[r.loadout[slot]])).size;
    report.summary[mode]={completed:rows.length,failed_or_timeout:all.length-rows.length,mean_quality:mean(rows.map(r=>r.quality)),
      median_quality:quantile(rows.map(r=>r.quality),.5),mean_weakest:mean(rows.map(r=>r.weakest)),
      role_means:Object.fromEntries(REPAIR_ROLES.map(role=>[role,mean(rows.map(r=>Math.min(100,r.scores[role])))])),
      elapsed_ms:{mean:mean(all.map(r=>r.elapsed_ms)),median:quantile(all.map(r=>r.elapsed_ms),.5),p95:quantile(all.map(r=>r.elapsed_ms),.95),max:Math.max(...all.map(r=>r.elapsed_ms))},
      layer_means:Object.fromEntries(['routine','addition'].map(group=>[group,Object.fromEntries(REPAIR_ROLES.map(role=>[role,mean(rows.map(r=>r.layers[group][role]))]))])),
      layer_minima:Object.fromEntries(['routine','addition'].map(group=>[group,mean(rows.map(r=>Math.min(...Object.values(r.layers[group]))))])),
      over_bot_deadline:all.filter(r=>r.elapsed_ms>15000).length,
      average_search:Object.fromEntries(Object.keys(all[0].search_stats).map(key=>[key,mean(all.map(r=>r.search_stats[key]))])),
      unique_equipment:Object.fromEntries(['primary','secondary','grenade','stratagem'].map(slot=>[slot,distinct(slot)])),
      top_equipment:Object.entries(frequency).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([id,n])=>({id,name:catalog.equipment.find(r=>r.id===id)?.name,count:n})),
      frequency};
  }
  const deltas=report.pairs.filter(p=>Number.isFinite(p.whole.quality)&&Number.isFinite(p.repair.quality)).map(p=>p.repair.quality-p.whole.quality);
  const rng=seeded(20261101),boot=[];
  if(deltas.length)for(let b=0;b<2000;b++)boot.push(mean(Array.from({length:deltas.length},()=>deltas[uniformInt(deltas.length,rng)])));
  report.paired={n:deltas.length,mean_delta:mean(deltas),bootstrap_95:[quantile(boot,.025),quantile(boot,.975)]};
}
mkdirSync(dirname(output),{recursive:true});
for(let i=0;i<count;i++){
  const seed=start+i,pair={seed};
  for(const mode of i%2?['repair','whole']:['whole','repair'])pair[mode]=run(seed,mode==='repair');
  report.pairs.push(pair);
  if((i+1)%10===0||i===count-1){summarize();writeFileSync(output,JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({completed:i+1,whole:report.summary.whole.mean_quality,repair:report.summary.repair.mean_quality,
      mean_ms:[report.summary.whole.elapsed_ms.mean,report.summary.repair.elapsed_ms.mean],paired:report.paired}));}
}
console.log('Saved '+output);
