import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceHandling} from '../../../shared/hd2-loadout/assessment-v2/facts.mjs';
import {beginAssessmentDraw,stepAssessmentDraw} from '../../../shared/hd2-loadout/assessment-v2/draw.mjs';

const read=p=>JSON.parse(readFileSync(new URL('../../../shared/hd2-loadout/'+p,import.meta.url)));
const model=read('assessment-v2/equipment.json'),catalog=read('data/catalog.json');
const source=read('assessment-v2/sources/equipment-expanded.json');
const id='ar_23l_liberator_legacy',legacy=source.items.find(r=>r.id===id);
const gun=model.equipment.find(r=>r.equipment_id===id),base=model.equipment.find(r=>r.equipment_id==='ar_23_liberator');
const finish=task=>{
  for(let i=0;i<6000;i++){const r=stepAssessmentDraw(task);if(r.status!=='SEARCHING')return r;}
  assert.fail('No balanced result within the bounded test budget');
};

test('new recoil vectors use a labelled proxy without treating scalar recoil as an axis',()=>{
  const {handling,sources}=sourceHandling(legacy);
  assert.deepEqual(handling,{ergonomics:60,recoil_horizontal:10,recoil_vertical:26});
  assert.match(sources.recoil_horizontal.basis,/ENGINEERING_AXIS_MAX/);
  const incomplete=structuredClone(legacy);
  incomplete.tables.find(t=>t.kind==='weapon_stats').rows.find(r=>r.key==='climb_recoil').raw='unresolved';
  const result=sourceHandling(incomplete);
  assert.equal(result.handling.recoil_horizontal,null);
  assert.equal(result.handling.recoil_vertical,null);
  const standard=sourceHandling(source.items.find(r=>r.id==='ar_23_liberator'));
  assert.deepEqual(standard.handling,{ergonomics:65,recoil_horizontal:6,recoil_vertical:15});
  assert.equal(standard.sources.recoil_horizontal.basis,undefined);
});

test('Legacy uses Liberator resources but pays its own ergonomics and recoil cost',()=>{
  assert.deepEqual(gun.facts.inventory,base.facts.inventory);
  assert.deepEqual(gun.facts.refill,base.facts.refill);
  assert.equal(gun.facts.reload_ms,base.facts.reload_ms);
  assert.equal(gun.facts.ergonomic,60);
  assert.equal(base.facts.ergonomic,65);
  assert.equal(gun.facts.handling_source.ergonomics.detailed,'60');
  const m=gun.facts.modes[0],b=base.facts.modes[0];
  for(const k of ['normal','durable','pen','pellets','capacity','total','reload_ms'])assert.equal(m[k],b[k],k);
  assert.equal(m.rpm,660);
  assert.deepEqual(m.handling,{ergonomics:60,recoil_horizontal:10,recoil_vertical:26});
  assert.ok(gun.capabilities.modes[0].chaff.handling.acquire_ms>base.capabilities.modes[0].chaff.handling.acquire_ms);
  assert.equal(gun.endurance.score,base.endurance.score);
  for(const role of ['chaff','close_defense','anti_medium'])assert.ok(Number.isFinite(gun.dimensions[role].score));
  assert.equal(gun.heavy_assessment.score,0);
  assert.equal(gun.demolition_assessment.score,0);
  assert.equal(read('assessment-v2/manual-scores.json').overrides[id],undefined,'computed from parameters, not a fabricated manual score');
});

test('Legacy is in the normal primary pool and can survive a real balanced draw',()=>{
  const initial=beginAssessmentDraw(model,catalog,{seed:42});
  assert.ok(initial.prepared.values.primary.includes(id));
  const balanced=finish(beginAssessmentDraw(model,catalog,{seed:42,constraints:{locks:{primary:id}}}));
  assert.equal(balanced.status,'ASSESSMENT_PASS');
  assert.equal(balanced.loadout.primary,id);
  for(const d of Object.values(balanced.dimensions))assert.equal(d.status,'PASS');
  for(const g of Object.values(balanced.gates))assert.equal(g.status,'PASS');
  let found=false;
  for(let seed=0;seed<512&&!found;seed++)found=finish(beginAssessmentDraw(model,catalog,{mode:'pure',seed})).loadout.primary===id;
  assert.ok(found,'unlocked ordinary random selection can return Legacy');
});
