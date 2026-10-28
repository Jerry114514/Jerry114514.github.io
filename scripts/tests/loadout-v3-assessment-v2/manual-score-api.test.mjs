import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {manualScoreApi} from '../../manual-score-api.mjs';

async function fixture(t,rebuild,score_scale) {
  const root=await mkdtemp(join(tmpdir(),'hd2-score-test-'));
  const directory=join(root,'shared/hd2-loadout/assessment-v2');await mkdir(directory,{recursive:true});
  const model={scenario:{score_scale},equipment:[{equipment_id:'test',category:'primary',facts:{},calculated_scores:{chaff:60}}]};
  await writeFile(join(directory,'equipment.json'),JSON.stringify(model));
  await writeFile(join(directory,'manual-scores.json'),JSON.stringify({schema:1,overrides:{},history:[]}));
  let rebuilds=0;
  const api=manualScoreApi({root,rebuild:async()=>{rebuilds++;await rebuild?.();}});
  const server=createServer(async(req,res)=>{if(!await api(req,res,new URL(req.url,'http://local').pathname)){res.writeHead(404);res.end();}});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const origin='http://127.0.0.1:'+server.address().port,url=origin+'/api/assessment/manual-scores';
  t.after(async()=>{await new Promise(r=>server.close(r));
    assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep)&&root.includes('hd2-score-test-'));await rm(root,{recursive:true});});
  return {url,root,origin,rebuilds:()=>rebuilds,read:async()=>await (await fetch(url)).json(),
    save:async(body,headers={})=>{const res=await fetch(url,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-HD2-Review':'1',...headers},body:JSON.stringify(body)});
      return {status:res.status,body:await res.json()};}};
}

test('local editor saves persistently, preserves Chinese notes, rejects stale revisions and restores with history',async t=>{
  const f=await fixture(t),initial=await f.read();
  const body={revision:initial.revision,equipment_id:'test',scores:{chaff:77.25},note:'范围伤害人工校准'};
  const saved=await f.save(body);assert.equal(saved.status,200);assert.equal(f.rebuilds(),1);
  assert.equal(saved.body.document.overrides.test.note,body.note);assert.notEqual(saved.body.revision,initial.revision);
  const reread=await f.read();assert.equal(reread.document.overrides.test.scores.chaff,77.25);
  const disk=JSON.parse(await readFile(join(f.root,'shared/hd2-loadout/assessment-v2/manual-scores.json'),'utf8'));
  assert.deepEqual(disk,reread.document);
  assert.equal((await f.save(body)).status,409);assert.equal(f.rebuilds(),1);
  const restored=await f.save({...body,revision:reread.revision,scores:{chaff:null}});
  assert.equal(restored.status,200);assert.deepEqual(restored.body.document.overrides,{});
  assert.equal(restored.body.document.history.length,2);
  assert.equal(restored.body.document.history[1].before.scores.chaff,77.25);
});

test('bad score, unknown equipment and cross-origin writes leave the source untouched',async t=>{
  const f=await fixture(t),initial=await f.read();
  const body={revision:initial.revision,equipment_id:'test',scores:{chaff:75}};
  assert.equal((await f.save({...body,scores:{chaff:106}})).status,400);
  assert.equal((await f.save({...body,equipment_id:'unknown'})).status,400);
  assert.equal((await f.save(body,{Origin:'https://unrelated.example'})).status,403);
  assert.equal((await f.save(body,{'X-HD2-Review':''})).status,403);
  assert.deepEqual(await f.read(),initial);assert.equal(f.rebuilds(),0);
});

test('failed report rebuild reports an actual saved revision without losing the users edit',async t=>{
  const f=await fixture(t,()=>{throw Error('fixture rebuild failure');}),initial=await f.read();
  const result=await f.save({revision:initial.revision,equipment_id:'test',scores:{chaff:75}});
  assert.equal(result.status,500);assert.equal(result.body.saved,true);
  assert.match(result.body.error,/已保存/);
  assert.equal((await f.read()).document.overrides.test.scores.chaff,75);
});

test('a page using the previous score scale cannot silently save old points as new ones',async t=>{
  const f=await fixture(t,undefined,{id:'review-65-as-60'}),initial=await f.read();
  const body={revision:initial.revision,equipment_id:'test',scores:{chaff:60},mode:'additive'};
  assert.equal((await f.save(body)).status,409);
  assert.deepEqual(await f.read(),initial);assert.equal(f.rebuilds(),0);
  const saved=await f.save({...body,score_scale_id:'review-65-as-60'});
  assert.equal(saved.status,200);assert.equal(f.rebuilds(),1);
  assert.equal(saved.body.document.overrides.test.mode,'additive');
  assert.equal(saved.body.document.overrides.test.scores.chaff,60);
});
