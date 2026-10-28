import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ordinaryCapabilities} from '../../../shared/hd2-loadout/assessment-v2/projectile.mjs';
import {assessStrategic} from '../../../shared/hd2-loadout/assessment-v2/strategic.mjs';
import {coverageValue} from '../../../shared/hd2-loadout/assessment-v2/formulas.mjs';
import {blastAt} from '../../../shared/hd2-loadout/assessment-v2/fragments.mjs';
const model=JSON.parse(readFileSync(new URL('../../../shared/hd2-loadout/assessment-v2/equipment.json',import.meta.url)));
const row=id=>model.equipment.find(r=>r.equipment_id===id);

test('dense ordinary blasts include sourced outer damage and preserve a sparse comparison',()=>{
  const r=row('sg_8p_punisher_plasma'),dense=r.capabilities.modes[0].chaff;
  const sparse=ordinaryCapabilities(r.facts,model.targets,model.ap,{...model.scenario,area:{spacing_samples_m:[3]}}).modes[0].chaff;
  assert.deepEqual(dense.area.spacing_samples_m,[1.5]);
  assert.equal(dense.count,28);assert.ok(dense.shots<sparse.shots);
  assert.ok(dense.area.secondary_blast_contacts>0);
  assert.ok(dense.area.audit.every(p=>p.remaining_hp.every(h=>h===0)));
  assert.equal(dense.action_plan.reduce((s,a)=>s+a.rounds,0),dense.shots);
  assert.equal(dense.action_plan.length,dense.inventory_required);
  assert.equal(dense.area.audit.reduce((s,p)=>s+p.targets,0),28);
});

test('grenades retain outer damage and AP instead of falling back to single-target attacks',()=>{
  const r=row('g_16_impact'),blast=r.facts.service_modes[0].explosion;
  assert.equal(blast.outer_normal,399);assert.equal(blast.outer_durable,399);
  const outer=blastAt(blast,(blast.inner_radius_m+blast.outer_radius_m)/2);
  assert.equal(outer.pen,blast.outer_pen);
  assert.ok(outer.normal>0&&outer.normal<blast.outer_normal);
  assert.ok(r.capabilities.modes[0].chaff.area);
  assert.ok(r.capabilities.modes[0].chaff.shots<28);
  const incomplete=structuredClone(r.facts);delete incomplete.service_modes[0].explosion.outer_normal;
  delete incomplete.service_modes[0].explosion.outer_durable;
  const probe=ordinaryCapabilities(incomplete,model.targets,model.ap,{...model.scenario,area:{spacing_samples_m:[8]}});
  assert.equal(probe.modes[0].chaff.area,undefined,'unknown outer falloff cannot manufacture group kills');
});

test('grenade throughput waits for the last effect but overlaps simultaneous fuses',()=>{
  const r=row('g_123_thermite'),s=r.capabilities.modes[0].chaff;
  assert.ok(s.neutralized_at_ms>s.first_to_last_ms);
  assert.ok(s.sustained.targets_per_second<=1000*s.count/s.neutralized_at_ms);
  assert.ok(s.sustained.targets_per_second<s.sustained.cadence_targets_per_second);
  const delay=r.facts.service_modes[0].detached_delay_ms;
  assert.equal(s.neutralized_at_ms-s.first_to_last_ms,delay,'last fuse only; not N serial fuses');
  assert.equal(s.action_plan.reduce((n,a)=>n+a.rounds,0),s.shots);
  assert.ok(s.action_plan.every(a=>a.effect_delay_ms===delay));
});

test('one Eagle pass cannot count overlapping payload as repeated fresh cohorts',()=>{
  const r=row('eagle_cluster_bomb'),a=assessStrategic(r,model)[0].contribution;
  assert.equal(a.physical.capacity,28);assert.ok(a.physical.uncapped_payload_capacity>28);
  const more=structuredClone(r);more.strategic_profile.payload_per_call*=10;
  const b=assessStrategic(more,model)[0].contribution;
  assert.equal(a.value,b.value,'overkill does not buy more score');
  assert.equal(a.physical.capacity,b.physical.capacity);
  assert.equal(a.combat_adjustment.factor,0.5);
  assert.equal(a.value,a.bare_score*a.coverage_value*a.realization_factor*a.operation_factor*a.combat_adjustment.factor);
});

test('Eagle uses change coverage once; small CD, big CD and deployment delay all matter',()=>{
  const r=row('eagle_airstrike'),base=assessStrategic(r,model)[0].contribution;
  const calls=structuredClone(r);calls.strategic_profile.uses++;
  const extra=assessStrategic(calls,model)[0].contribution;
  assert.equal(extra.bare_score,base.bare_score);assert.equal(extra.physical.capacity,base.physical.capacity);
  assert.ok(extra.value>base.value);
  for(const field of ['small_cd_s','cooldown_s','delay_s']){
    const slower=structuredClone(r);slower.strategic_profile[field]+=120;
    const result=assessStrategic(slower,model)[0].contribution;
    assert.equal(result.bare_score,base.bare_score);assert.ok(result.value<base.value);
  }
  const p=base.profile,T=base.physical.effective_work_s;
  const expected=p.uses*T/(p.uses*T+p.cooldown_s+p.delay_s+(p.uses-1)*Math.max(p.small_cd_s,p.delay_s));
  assert.equal(base.coverage_value,expected);
  const overlap=coverageValue({family:'eagle',uses:3,effective_work_s:10,small_cd_s:5,cooldown_s:120,delay_s:8});
  assert.equal(overlap.value,30/(30+120+8+16));
});
