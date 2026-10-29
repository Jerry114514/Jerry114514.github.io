import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';

const url=new URL('../../../shared/hd2-loadout/assessment-v2/worker.mjs',import.meta.url).href;
const shim=`
import {parentPort,workerData} from 'node:worker_threads';
import {readFileSync} from 'node:fs';
globalThis.self=globalThis;
globalThis.postMessage=value=>parentPort.postMessage(value);
let generation=0;
globalThis.fetch=async (url,options)=>{
  parentPort.postMessage({type:'fetch',url:String(url),cache:options.cache});
  const data=JSON.parse(readFileSync(new URL(url),'utf8'));
  if(String(url).endsWith('/equipment.json')){
    if(workerData.neverPass)data.scenario.heavy_targets=['test_missing_target'];
    data.test_generation=++generation;
  }
  return {ok:true,json:async()=>data};
};
await import(workerData.url);
parentPort.on('message',data=>globalThis.onmessage({data}));
parentPort.postMessage({type:'boot'});
`;
function harness(options={}){
  const worker=new Worker(new URL('data:text/javascript,'+encodeURIComponent(shim)),{workerData:{url,...options}});
  const messages=[],waiting=new Set();
  worker.on('message',m=>{messages.push(m);for(const cb of [...waiting])cb(m);});
  const wait=predicate=>new Promise((resolve,reject)=>{
    const old=messages.find(predicate);if(old){resolve(old);return;}
    const timeout=setTimeout(()=>{waiting.delete(check);reject(Error('worker response timeout'));},15000);
    const check=m=>{if(predicate(m)){clearTimeout(timeout);waiting.delete(check);resolve(m);}};waiting.add(check);
  });
  return {worker,messages,wait,post:m=>worker.postMessage(m),result:id=>wait(m=>m.type==='result'&&m.request_id===id)};
}

test('real worker loads only current model, draws, replaces without scores and changes hash on reload',async()=>{
  const h=harness();try{
    await h.wait(m=>m.type==='boot');h.post({type:'init',request_id:1});
    const ready=await h.wait(m=>m.type==='ready'&&m.request_id===1);
    assert.equal(ready.integration.assessment.ready,true);assert.equal(ready.catalog.equipment.length,201);
    assert.deepEqual(h.messages.filter(m=>m.type==='fetch').map(m=>m.url.split('/').pop()).sort(),['catalog.json','equipment.json']);
    assert.ok(h.messages.filter(m=>m.type==='fetch').every(m=>m.cache==='no-cache'));
    h.post({type:'start',request_id:2,model_hash:ready.model_hash,options:{mode:'assessment',seed:42}});
    const a=(await h.result(2)).value;assert.equal(a.status,'ASSESSMENT_PASS');
    h.post({type:'start',request_id:3,model_hash:ready.model_hash,options:{mode:'assessment',seed:42}});
    assert.deepEqual((await h.result(3)).value,a);
    h.post({type:'start',request_id:4,loadout:a.loadout,slot:'primary',manual:true,options:{mode:'pure'}});
    const menu=(await h.result(4)).value;assert.ok(menu.rows.some(r=>r.status==='UNVERIFIED'));
    h.post({type:'start',request_id:5,loadout:a.loadout,slot:'primary',options:{mode:'pure'}});
    const replaced=(await h.result(5)).value;assert.equal(replaced.status,'UNVERIFIED');assert.equal(replaced.dimensions,undefined);
    assert.notEqual(replaced.loadout.primary,a.loadout.primary);
    h.post({type:'init',request_id:6});const newer=await h.wait(m=>m.type==='ready'&&m.request_id===6);
    assert.notEqual(newer.model_hash,ready.model_hash);
    h.post({type:'start',request_id:7,model_hash:ready.model_hash,options:{mode:'assessment'}});
    assert.match((await h.wait(m=>m.type==='error'&&m.request_id===7)).message,/版本/);
  }finally{await h.worker.terminate();}
});

test('unknown search yields for pause/cancel and old work cannot overwrite a new draw',async()=>{
  const h=harness({neverPass:true});try{
    await h.wait(m=>m.type==='boot');h.post({type:'init',request_id:1});await h.wait(m=>m.type==='ready');
    h.post({type:'start',request_id:2,options:{mode:'assessment',seed:42}});
    await h.wait(m=>m.type==='progress'&&m.request_id===2);
    h.post({type:'pause',request_id:2});await h.wait(m=>m.type==='paused'&&m.request_id===2);
    h.post({type:'resume',request_id:2});h.post({type:'cancel',request_id:2});
    assert.equal((await h.result(2)).value.status,'CANCELLED');
    h.post({type:'start',request_id:3,options:{mode:'pure',seed:42}});
    assert.equal((await h.result(3)).value.status,'UNVERIFIED');
    assert.equal(h.messages.filter(m=>m.type==='result'&&m.request_id===2).length,1);
  }finally{await h.worker.terminate();}
});

test('black-box worker sends no scores, gate details or search statistics and blocks explanations',async()=>{
  const h=harness();try{
    await h.wait(m=>m.type==='boot');h.post({type:'init',request_id:1,black_box:true});await h.wait(m=>m.type==='ready');
    h.post({type:'start',request_id:2,options:{mode:'assessment',seed:42}});
    const result=(await h.result(2)).value;
    assert.equal(result.status,'ASSESSMENT_PASS');
    assert.deepEqual(Object.keys(result).sort(),['loadout','status']);
    for(const m of h.messages.filter(m=>m.type==='progress'))assert.deepEqual(Object.keys(m.value),['status']);
    h.post({type:'explain',request_id:3,loadout:result.loadout});
    assert.match((await h.wait(m=>m.type==='error'&&m.request_id===3)).message,/不提供评价详情/);
  }finally{await h.worker.terminate();}
});
