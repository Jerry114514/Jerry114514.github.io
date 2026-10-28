import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bindServiceModes} from '../../../shared/hd2-loadout/assessment-v2/service-modes.mjs';
import {bindMountedFeeds} from '../../../shared/hd2-loadout/assessment-v2/mounted.mjs';
import {ordinaryModes,projectileService} from '../../../shared/hd2-loadout/assessment-v2/projectile.mjs';
import {executeResourcePlan} from '../../../shared/hd2-loadout/assessment-v2/resources.mjs';
const read = p => JSON.parse(readFileSync(new URL('../../../'+p, import.meta.url)));
const model=read('shared/hd2-loadout/assessment-v2/equipment.json');
const inputs=read('shared/hd2-loadout/assessment-v2/sources/equipment-expanded.json');
const row=id=>model.equipment.find(x=>x.equipment_id===id);

test('Stoker retains bullet feed and charges its finite flame feed separately',()=>{
 const f=structuredClone(row('smg_flam_34_stoker').facts); bindServiceModes(f,model.scenario);
 const [bullet,flame]=ordinaryModes(f); const account=f.extra_accounts[0];
 assert.equal(bullet.mode_id,'SMGFLAM-34_P'); assert.equal(bullet.total,270);
 assert.equal(flame.resource_id,account.id); assert.equal(account.loaded,50);
 assert.equal(flame.work_ms,122); assert.equal(flame.normal,18.3);
 assert.equal(flame.disposable,true); assert.equal(flame.fire_channel,'spray');
 assert.equal(flame.ignition_policy,model.scenario.spray_ignition);
 assert.deepEqual(account.refill,{public:0,portable:0});
 const service=projectileService(flame,[{target:model.targets['scavenger:main'],count:1}],model.ap);
 assert.equal(service.sustained.status,'FINITE_ONLY');
 const step={weapon_id:account.id,rounds:51,prepare_ms:0,interval_ms:122,effect_delay_ms:0};
 assert.equal(executeResourcePlan({weapons:[account],providers:[],steps:[step]}).status,'INSUFFICIENT');
});

test('Lumberer retains cannon and separates status-only fuel from unknown direct DPS',()=>{
 const id='vehicle_exo_51_lumberjack_exosuit'; const f=structuredClone(row(id).facts);
 bindMountedFeeds(inputs.items.find(x=>x.id===id),f,model.scenario);
 assert.equal(f.mounted_accounts.length,2); assert.equal(f.mounted_accounts[0].loaded,25);
 assert.ok(f.service_modes.some(m=>m.source_mode_id==='P8'));
 const flame=f.service_modes.find(m=>m.source_mode_id==='LUMBERER_FLAMETHROWER_S');
 assert.equal(f.mounted_accounts.find(a=>a.id===flame.resource_id).loaded,500);
 assert.equal(flame.work_ms,125); assert.equal(flame.normal,0);
 assert.equal(flame.disposable,true); assert.equal(flame.fire_channel,'spray');
 assert.equal(flame.direct_damage_unresolved,true); assert.equal(flame.status_only_lower_bound,true);
 assert.deepEqual(flame.ignition_policy.targets,['scavenger','hunter']);
 const service=projectileService(flame,[{target:model.targets['scavenger:main'],count:1}],model.ap);
 assert.equal(service.sustained.status,'FINITE_ONLY');
});

test('entrenchment tool uses listed melee rate without guessing unknown rates',()=>{
 const f=structuredClone(row('cqc_73_entrenchment_tool').facts); bindServiceModes(f,model.scenario);
 const m=ordinaryModes(f)[0]; assert.equal(m.rpm,150); assert.equal(m.normal,165); assert.equal(m.durable,83);
 for (const id of ['cqc_19_stun_lance','cqc_30_stun_baton','support_cqc_9_defoliation_tool']) {
   const unknown=structuredClone(row(id).facts); bindServiceModes(unknown,model.scenario);
   assert.ok(!ordinaryModes(unknown).some(m=>m.traits==='MELEE_CONTACT'));
 }
});

test('Pyrotech binds final blast while leaving sparks and timing conflict explicit',()=>{
 const f=structuredClone(row('g_142_pyrotech').facts); bindServiceModes(f,model.scenario);
 const m=ordinaryModes(f)[0]; assert.equal(m.explosion.normal,50);
 assert.equal(m.explosion.status_applications.find(a=>a.id==='Fire').strength,100);
 assert.equal(m.detached_delay_ms,2900); assert.match(m.source_timing_conflict,/PREBLAST_SPARKS_NOT_INCLUDED/);
});

test('Meltagun spends one finite round for an approximately 1.4 second beam',()=>{
 const f=structuredClone(row('support_40_k_thermal_gun').facts); bindServiceModes(f,model.scenario);
 const m=ordinaryModes(f)[0]; assert.equal(m.capacity,3); assert.equal(m.total,15);
 assert.equal(m.reload_ms,3350); assert.equal(m.work_ms,1400); assert.equal(m.normal,3640);
 assert.ok(60000/m.rpm >= m.work_ms); assert.equal(m.range_m,15);
 assert.match(m.damage_basis,/CANDIDATE/); assert.ok(!m.direct_status_effects.some(e=>e.id==='Fire'));
});
