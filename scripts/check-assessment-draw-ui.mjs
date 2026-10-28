// Actual page + module Worker smoke check. Reads the live local model only.
// Args: existing Playwright package, browser executable, optional origin.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {evaluateAssessment} from '../shared/hd2-loadout/assessment-v2/evaluate.mjs';
const {chromium}=createRequire(import.meta.url)(process.argv[2]??'playwright');
const origin=process.argv[4]??'http://127.0.0.1:8791';
const entry=process.argv[5]??'/HD2_Wiki/loadout.html';
const output=new URL('../scripts/.loadout-artifacts/pr-browser/'+(entry.includes('Galatic')?'main/':'wiki/'),import.meta.url);
const read=async path=>JSON.parse(await readFile(new URL('../shared/hd2-loadout/'+path,import.meta.url),'utf8'));
const [model,catalog]=await Promise.all([read('assessment-v2/equipment.json'),read('data/catalog.json')]);
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{})});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[],requests=[],draws=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  await page.addInitScript(()=>{
    const NativeWorker=window.Worker;window.drawProbe={sent:[],received:[]};
    window.Worker=class extends NativeWorker{
      constructor(...args){super(...args);this.addEventListener('message',e=>window.drawProbe.received.push(e.data));}
      postMessage(message,...rest){window.drawProbe.sent.push(message);super.postMessage(message,...rest);}
    };
  });
  await page.goto(origin+entry);
  const balanced=page.getByRole('button',{name:'新版平衡抽取'});
  await balanced.waitFor({timeout:30000});
  await page.locator('.lo-status').filter({hasText:'装备已就绪'}).waitFor();
  const noScores=async()=>{
    assert.equal(await page.locator('[data-role="dimensions"],[data-role="certificate"],[data-role="version"],[data-act="explain"],[data-role="profile"]').count(),0);
    assert.doesNotMatch(await page.locator('[data-hd2-loadout]').textContent(),/评分|估分|种子|校验模型|评价详情|及格线|参考分|场景|虫族|N10/);
  };
  await noScores();
  let current;
  for(let i=0;i<10;i++){
    const start=Date.now();await balanced.click();
    await page.locator('.lo-status[data-state="DRAWN"]').waitFor({timeout:30000});
    const value=await page.evaluate(()=>window.drawProbe.received.filter(m=>m.type==='result').at(-1).value);
    assert.equal(value.status,'ASSESSMENT_PASS');
    assert.deepEqual(Object.keys(value).sort(),['loadout','status']);
    assert.equal(await page.locator('.lo-card').count(),7);
    await noScores();
    // Acceptance remains enforced internally; the page receives none of it.
    assert.equal(evaluateAssessment(value.loadout,model,catalog).acceptance_ready,true);
    assert.ok(value.loadout.stratagems.filter(id=>id.startsWith('vehicle_exo_')).length<=1);
    const names=await page.locator('.lo-card h3').allTextContents();
    draws.push({elapsed_ms:Date.now()-start,names,loadout:structuredClone(value.loadout)});current=value.loadout;
  }
  await page.screenshot({path:fileURLToPath(new URL('desktop.png',output)),fullPage:true});
  await page.locator('[data-act="swap"][data-slot="primary"]').click();
  await page.locator('.lo-status').filter({hasText:'已更换装备'}).waitFor();
  await noScores();
  assert.equal(await page.evaluate(()=>window.drawProbe.sent.at(-1).options.mode),'pure');
  const pick=async(slot,id)=>{
    await page.locator(`[data-act="manual"][data-slot="stratagem:${slot}"]`).click();
    await page.locator(`dialog [data-equipment-id="${id}"]:enabled`).click();
    current.stratagems[slot]=id;
  };
  const mechs=catalog.equipment.filter(e=>e.id.startsWith('vehicle_exo_')).map(e=>e.id);
  let mechSlot=current.stratagems.findIndex(id=>mechs.includes(id));
  if(mechSlot<0){mechSlot=0;await pick(mechSlot,mechs[0]);}
  const otherSlot=(mechSlot+1)%4,newMech=mechs.find(id=>!current.stratagems.includes(id));
  await page.locator(`[data-act="manual"][data-slot="stratagem:${otherSlot}"]`).click();
  const forbidden=page.locator(`dialog [data-equipment-id="${newMech}"]`);
  await forbidden.waitFor();assert.equal(await forbidden.isDisabled(),true);
  assert.match(await forbidden.textContent(),/最多携带一台机甲/);
  await page.getByRole('button',{name:'关闭替换列表'}).click();
  await pick(mechSlot,newMech); // Swapping the one existing mech remains allowed.
  for(let i=0;i<3;i++){
    await page.locator(`[data-act="swap"][data-slot="stratagem:${otherSlot}"]`).click();
    await page.locator('.lo-status').filter({hasText:'已更换装备'}).waitFor();
    current=await page.evaluate(()=>window.drawProbe.received.filter(m=>m.type==='result').at(-1).value.loadout);
    assert.equal(current.stratagems.filter(id=>mechs.includes(id)).length,1);
  }
  const heavy=['heavy_support_gr_8_recoilless_rifle','heavy_support_ac_8_autocannon'].find(id=>!current.stratagems.includes(id));
  await pick(2,heavy);
  const backpack=['backpack_b_1_supply_pack','backpack_sh_32_shield_generator_pack'].find(id=>!current.stratagems.includes(id));
  await pick(3,backpack);
  assert.equal(await page.locator('dialog').isVisible(),false);
  assert.match(await page.locator('.lo-status').textContent(),/已更换装备/);
  assert.equal(await page.evaluate(()=>window.drawProbe.sent.some(m=>m.type==='explain')),false);
  assert.equal(await page.evaluate(()=>window.drawProbe.sent.some(m=>m.options&&'profile_id' in m.options)),false);
  await noScores();
  // Other holding conflicts remain allowed in edits, but not in initial draws.
  for(const n of [2,3])await page.locator(`[data-act="lock"][data-slot="stratagem:${n}"]`).click();
  await balanced.click();await page.locator('.lo-status').filter({hasText:'锁定的装备组合冲突'}).waitFor();
  for(const n of [2,3])await page.locator(`[data-act="lock"][data-slot="stratagem:${n}"]`).click();
  await page.getByRole('button',{name:'重新加载资料'}).click();
  await page.locator('.lo-status').filter({hasText:'装备已就绪'}).waitFor();
  await page.getByRole('button',{name:'七格纯随机'}).click();
  await page.locator('.lo-status[data-state="DRAWN"]').waitFor();
  assert.equal(await page.locator('.lo-card').count(),7);
  await noScores();
  await balanced.click();await page.locator('.lo-status[data-state="DRAWN"]').waitFor();
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  await page.screenshot({path:fileURLToPath(new URL('mobile.png',output)),fullPage:true});
  assert.deepEqual(errors,[]);
  // Shared damage/pressure helpers still live in historical folders. They are
  // not the retired score table or evaluator; check those actual entry points.
  assert.ok(!requests.some(u=>/\/practical\/(worker|evaluate)\.mjs|equipment-capabilities\.json/.test(u)),JSON.stringify(requests));
  const report={origin,draws,checks:['10 balanced draws pass actual evaluator','single mech in initial and replacement draws','manual second mech disabled, replacing existing mech allowed','no score/details/explain DOM or result payload','random replacement without evaluation','manual heavy support and backpack still allowed','conflicting locks rejected for new draws','reload','pure random','mobile no horizontal overflow'],errors};
  await writeFile(new URL('ui-result.json',output),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({checks:report.checks,draws:draws.map(({elapsed_ms})=>({elapsed_ms})),errors},null,2));
}finally{await browser.close();}
