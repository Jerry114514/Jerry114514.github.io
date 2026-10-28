import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderSixDimensions} from '../../../scripts/render-loadout-six-dimensions.mjs';
const source=JSON.parse(readFileSync(new URL('../../../shared/hd2-loadout/assessment-v2/equipment.json',import.meta.url)));
function fixture(id) {
 const model=structuredClone(source),r=model.equipment.find(x=>x.equipment_id===id);
 const cells=Array(6).fill('待补');
 return {model,r,records:[{id,cells,calculated_cells:[...cells]}]};
}
test('automatic additions retain labels for both initial and editor rendering',()=>{
 const {model,r,records}=fixture('backpack_ax_ar_23_guard_dog');
 r.dimensions.chaff.contribution_kind='AUXILIARY_ADDITION';
 r.automatic_assessments=[{role:'chaff',contribution:{status:'UNKNOWN',value:null,reason:'REARM'}}];
 const html=renderSixDimensions(model,records);
 assert.match(html,/data-score-role="chaff">待补（加值）/);
 assert.match(html,/自动背包：辅助加值/);assert.match(html,/待补：REARM/);
 assert.match(html,/"default_kinds":\{"chaff":"AUXILIARY_ADDITION"/);
 assert.match(html,/"cells":\["待补"/); // Editor attaches the current mode label itself.
});
test('partial wave, distinct accounts, and status-only direct damage stay explicit',()=>{
 const {model,r,records}=fixture('ar_23_liberator');
 r.capabilities.modes[0].chaff.partial_cohort=true;
 Object.assign(r.capabilities.modes[0].chaff,{count:9,requested_count:28,shots:1});
 Object.assign(r.endurance.rating.scenarios.initial,{independent_accounts:['one','two'],mode_ids:['a','b'],partial:true});
 r.facts.service_modes=[{mode_id:'spray',kind:'projectile',feed_bound:true,element:'Fire',normal:0,durable:0,
   direct_damage_unresolved:true,status_only_lower_bound:true,service_conversion:'STATUS_ONLY_LOWER_BOUND',
   direct_status_effects:[{id:'Fire',normal:100,duration_s:3}]}];
 const html=renderSixDimensions(model,records);
 assert.match(html,/9 \/ 28/);assert.match(html,/部分完成；不是完整波/);
 assert.match(html,/one、two \/ a、b/);assert.match(html,/部分弹池已计；仍有缺项/);
 assert.match(html,/未知 \/ 未知（仅挂火下界）/);assert.doesNotMatch(html,/<h3>光束挂火与转火<\/h3>/);
 assert.match(html,/彼此独立弹池可相加/);
});
