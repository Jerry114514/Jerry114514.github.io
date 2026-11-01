import {readFileSync, writeFileSync} from 'node:fs';
import {evaluateAssessment} from '../shared/hd2-loadout/assessment-v2/evaluate.mjs';
import {assessStrategic} from '../shared/hd2-loadout/assessment-v2/strategic.mjs';
import {projectileService, ordinaryCapabilities, scoreOrdinary,ordinaryModes} from '../shared/hd2-loadout/assessment-v2/projectile.mjs';
import {mediumResponse} from '../shared/hd2-loadout/assessment-v2/handling.mjs';
import {renderSixDimensions} from './render-loadout-six-dimensions.mjs';
import {manualValue} from '../shared/hd2-loadout/assessment-v2/manual-scores.mjs';
import {contributionScore} from '../shared/hd2-loadout/assessment-v2/score-scale.mjs';
const root = new URL('../', import.meta.url);
const model = JSON.parse(readFileSync(new URL('shared/hd2-loadout/assessment-v2/equipment.json', root)));
const coverage = JSON.parse(readFileSync(new URL('shared/hd2-loadout/assessment-v2/coverage.json', root)));
const catalog = JSON.parse(readFileSync(new URL('shared/hd2-loadout/data/catalog.json', root)));
const tactic = JSON.parse(readFileSync(new URL('shared/hd2-loadout/assessment-v2/tactic-references.json', root))).cases[0];
const examples = [
  {name: '基线分工：机枪清杂，通牒反重，破片拆洞', primary: 'ar_23_liberator', secondary: 'gp_20_ultimatum', grenade: 'g_6_frag',
    stratagems: ['support_mg_43_machine_gun', 'backpack_b_1_supply_pack', 'eagle_airstrike', 'orbital_gas_strike']},
  {name: '铝热与补包：连续粘附处理双泰坦', primary: 'plas_1_scorcher', secondary: 'gp_31_grenade_pistol', grenade: 'g_123_thermite',
    stratagems: ['support_mg_43_machine_gun', 'backpack_b_1_supply_pack', 'eagle_airstrike', 'orbital_gas_strike']},
  {name: '互斥：无后座的弹药背包与补包', primary: 'ar_23_liberator', secondary: 'gp_20_ultimatum', grenade: 'g_6_frag',
    stratagems: ['heavy_support_gr_8_recoilless_rifle', 'backpack_b_1_supply_pack', 'eagle_airstrike', 'orbital_gas_strike']},
  {name: '四发突击兵：同一库存完成双重甲', primary: 'ar_23a_liberator_carbine', secondary: 'gp_31_grenade_pistol', grenade: 'g_6_frag',
    stratagems: ['support_mls_4x_commando', 'backpack_b_1_supply_pack', 'eagle_airstrike', 'orbital_gas_strike']},
  {name: '用户组合：毒矛主战过滤，焦土近防，通牒千兆反重', primary: 'plas_1_scorcher', secondary: 'gp_20_ultimatum', grenade: 'g_48_giga_grenade',
    stratagems: ['support_spear', 'backpack_b_1_supply_pack', 'deployable_gas_mines', 'deployable_flame_sentry']},
];
const results = examples.map(({name, ...loadout}) => ({name, ...evaluateAssessment(loadout, model, catalog,
  loadout.primary === tactic.core_ids[0] && loadout.stratagems.includes(tactic.role_plan.main_weapon) ? {role_plan: tactic.role_plan} : {})}));
const core = examples.at(-1), {name: coreName, ...coreLoadout} = core;
results.push({name: '五件核心：停用毒气地雷和火焰哨戒炮', ...evaluateAssessment(coreLoadout, model, catalog,
  {disabled_contributions: ['deployable_gas_mines', 'deployable_flame_sentry'], role_plan: tactic.role_plan})});
const strategic = model.equipment.filter(r => r.strategic_profile).map(r => ({equipment_id: r.equipment_id, name: r.name,
  assessments: assessStrategic(r, model)}));
const greenAudit = [
  ['br_14_adjudicator', 'bile_spewer:head', 4, 1],
  ['br_14_adjudicator', 'bile_spewer:mouth', 5, 1],
  ['plas_1_scorcher', 'bile_spewer:butt', 1, 0],
].map(([id, part, multiplier, resistance]) => {
  const row = model.equipment.find(r => r.equipment_id === id), mode = row.facts.modes[0];
  const service = projectileService(mode, [{target: model.targets[part], count: 1, acquire_multiplier: multiplier,
    explosion_resistance: resistance}], model.ap, {handling_policy: model.scenario.handling});
  return {equipment_id: id, name: row.name, part, target: model.targets[part], aim_multiplier: multiplier,
    selected: row.capabilities.modes[0].anti_medium.find(t => t.target_id === 'bile_spewer:head').route.measured_target === part,
    weapon: {normal: mode.normal, durable: mode.durable, pen: mode.pen, explosion: mode.explosion,
      rpm: mode.rpm, capacity: mode.capacity, reload_ms: mode.reload_ms}, service,
    response: mediumResponse(service, model.scenario.medium_response)};
});
const comparisonIds = ['support_spear', 'plas_1_scorcher', 'br_14_adjudicator'];
const comparisonRows = comparisonIds.map(id => model.equipment.find(r => r.equipment_id === id));
const sensitivityPolicies = [
  ['当前保守输入', model.scenario.medium_resolution],
  ['不计过穿额外碰撞', {...model.scenario.medium_resolution, cleave_routes: {}}],
  ['混乱残余威胁5%', {...model.scenario.medium_resolution, gas_control: {...model.scenario.medium_resolution.gas_control, residual_threat_fraction: .05}}],
  ['混乱残余威胁20%', {...model.scenario.medium_resolution, gas_control: {...model.scenario.medium_resolution.gas_control, residual_threat_fraction: .2}}],
  ['取消混乱减威胁收益', {...model.scenario.medium_resolution, gas_control: {...model.scenario.medium_resolution.gas_control, residual_threat_fraction: 1}}],
  ['若致死发溢出可扣流血条', {...model.scenario.medium_resolution, overflow_to_constitution: true}],
];
const mediumSensitivity = sensitivityPolicies.map(([label, policy]) => {
  const scenario = {...model.scenario, medium_resolution: policy};
  const caps = comparisonRows.map(r => ordinaryCapabilities(r.facts, model.targets, model.ap, scenario));
  return {label, scores: comparisonRows.map((r, i) => ({id: r.equipment_id,
    score: scoreOrdinary(caps[i], caps[2], {role: 'anti_medium', primary: r.slot === 'primary', reference_primary: true}).score,
    commander: caps[i].modes[0].anti_medium[0]}))};
});
const fragmentSensitivity=['heavy_support_ac_8_autocannon','r_36_eruptor'].flatMap(id=>{
  const row=model.equipment.find(r=>r.equipment_id===id),facts=structuredClone(row.facts);
  for(const mode of [...facts.modes,...facts.service_modes??[]])if(mode.fragments)mode.fragment_policy={...mode.fragment_policy,main_contacts_per_shot:0,max_per_target:0};
  const zero=ordinaryCapabilities(facts,model.targets,model.ap,model.scenario);
  return ordinaryModes(row.facts).map(mode=>({equipment_id:id,name:row.name,mode_id:mode.mode_id,fragment_component:mode.fragments??null,
    scores:Object.fromEntries(['chaff','anti_medium'].map(role=>{
      const reference=model.equipment.find(r=>r.equipment_id===model.references[role]);
      const score=c=>scoreOrdinary({...c,modes:c.modes.filter(m=>m.mode_id===mode.mode_id)},reference.capabilities,
        {role,primary:row.slot==='primary',reference_primary:reference.slot==='primary'}).score;
      return [role,{zero_contact:score(zero),declared_contact:score(row.capabilities)}];})),
    chaff:row.capabilities.modes.find(m=>m.mode_id===mode.mode_id).chaff}));
});
const isSpray=m=>m.service_conversion?.includes('FUEL_UNIT');
const laserSensitivity=model.equipment.filter(r=>r.facts.service_modes?.some(m=>m.ignition_policy&&!isSpray(m))).map(row=>({
  equipment_id:row.equipment_id,name:row.name,
  variants:[null,100,150,200].map(contact=>{
    const facts=structuredClone(row.facts);
    for(const mode of facts.service_modes)if(mode.ignition_policy&&!isSpray(mode)) {
      if(contact===null)delete mode.ignition_policy;else mode.ignition_policy.contact_ms=contact;
    }
    const cap=ordinaryCapabilities(facts,model.targets,model.ap,model.scenario);
    return {contact_ms:contact,scores:Object.fromEntries(['chaff','close_defense'].map(role=>{
      const ref=model.equipment.find(r=>r.equipment_id===model.references[role]);
      return [role,scoreOrdinary(cap,ref.capabilities,{role,primary:row.slot==='primary',reference_primary:ref.slot==='primary'}).score];
    })),chaff_heat_units:cap.modes[0].chaff.shots,
      close_neutralized_ms:cap.modes[0].close_defense.neutralized_at_ms};
  })}));
const report = {status: 'ENGINEERING_REVIEW; CALIBRATION_DEFERRED_BY_USER; NOT_PRODUCTION_DRAW',
  score_scale:model.scenario.score_scale,
  score_units:'AUTOMATIC_DIAGNOSTICS_USE_INTERNAL_POINTS; LOADOUT_DIMENSIONS_AND_REVIEW_TABLE_USE_CURRENT_SCALE; MANUAL_VALUES_USE_CURRENT_SCALE',
  manual_calibration:model.manual_calibration,
  manual_scores:model.equipment.filter(r=>r.manual_calibration).map(r=>({equipment_id:r.equipment_id,
    calculated_scores:r.calculated_scores,...r.manual_calibration})),
  laser_ignition_sensitivity:laserSensitivity,
  fragment_sensitivity:fragmentSensitivity,
  grenade_chaff:model.equipment.filter(r=>r.grenade_chaff).map(r=>({equipment_id:r.equipment_id,name:r.name,...r.grenade_chaff})),
  equipment_endurance:model.equipment.map(r=>({equipment_id:r.equipment_id,name:r.name,...r.endurance})),
  equipment_heavy:model.equipment.map(r=>({equipment_id:r.equipment_id,name:r.name,...r.heavy_assessment})),
  equipment_demolition:model.equipment.map(r=>({equipment_id:r.equipment_id,name:r.name,...r.demolition_assessment})),
  pool_coverage:coverage,
  independent_weapon_scoring: true,
  assessment_limits: {
    anti_medium: 'BLEED_AND_PAID_FOLLOWUP_INCLUDED; THREAT_EQUIVALENT_TIME_NOT_GUARANTEED_SAFETY',
    spear_commander: 'USER_BOUND_CLEAVE_WITH_SOURCE_CONFLICT; CONSERVATIVE_OVERFLOW_AND_CONTROL_SENSITIVITY_REPORTED',
    user_observation: 'S11 overpenetration and gas confusion can leave an Alpha Commander with little practical threat; this is not proof of immediate death.'
  }, examples: results, green_target_calculation: greenAudit,
  medium_threat_comparison: comparisonRows.map(r => ({id: r.equipment_id, score: r.dimensions.anti_medium,
    targets: r.capabilities.modes[0].anti_medium})), medium_sensitivity: mediumSensitivity, strategic};
const rows = ['# 七槽新版诊断样例', '', '按最新口径先实现后验收，不进行全局重新校准。武器独立算能力，毒云直接计入所属武器；不建真实命中率，也不推演跨武器削血补刀。人机/后座只作小幅时间修正，精细弱点另付打点成本。反中按场景目标数量加权平均，仍需每类都有已知可用路线。已接入的红绿按新公式末尾加值，缺少关键来源的项目保留未知。此表为工程估算，不是游戏实测。', '',
  '**当前尺度：旧65对应新60，旧60约为55.38，0/100/105保持不变。整套判定及全池六维表使用新尺度；下方机制敏感性诊断保留内部基分。人工输入按新尺度直接采用，可将整件装备改成六维末尾加值，且退出同维度最佳单件竞争；真实资源与物理门槛仍独立检查。**', '',
  '**反中已加入流血、付弹补枪、毒矛的绑定过穿与毒混乱。死亡时间和威胁等效时间分开；后者是评分用的工程估计，不是保证安全的时刻。过穿资料分歧、同发溢出顺序和控制强度假设另列敏感性结果。**', '',
  '| 配装 | 结果 | 清杂/近防/反中 | 双重甲 | 五洞 | 共享轻中资源 |', '|---|---|---|---|---|---|'];
for (const r of results) rows.push(`| ${r.name} | ${r.status} | ${r.dimensions ? ['chaff','close_defense','anti_medium'].map(k => r.dimensions[k].score.toFixed(1)).join(' / ') : '—'} | ${r.gates?.heavy_pair?.status ?? '—'} | ${r.gates?.demolition?.status ?? '—'} | ${r.gates?.shared_resources?.status ?? '—'} |`);
rows.push('', '## 结果解释', '');
for (const r of results) {
  const ids = r.loadout ? [r.loadout.primary, r.loadout.secondary, r.loadout.grenade, ...r.loadout.stratagems] : [];
  rows.push(`### ${r.name}`, '', ids.map(id => catalog.equipment.find(e => e.id === id)?.name ?? id).join('、'), '',
    `结果：${r.status}；未满足或待查：${[...(r.failed ?? []), ...(r.missing ?? [])].join('、') || r.gates?.legality?.reason || '已知检查通过，可人工验收；正式随机尚未接入' }。`, '');
  if (r.gates?.shared_resources?.first_wave_actions) rows.push(`轻中方案：${r.gates.shared_resources.plan_policy}；清杂用 ${r.gates.shared_resources.light_weapon}，反中用 ${r.gates.shared_resources.medium_weapons.join('、')}。共享弹药账已实际执行，此项仅验证方案能否付出资源，不再生成续航分；完成 ${r.gates.shared_resources.completed_actions}/${r.gates.shared_resources.actions_per_wave*r.gates.shared_resources.probe_limit_waves} 个有限弹药动作，探测上限为 ${r.gates.shared_resources.probe_limit_waves} 波；达到上限只代表至少能完成这些波次。`, '');
  if (r.role_plan) rows.push('通牒/千兆保留反重。矛枪的毒云已计入矛枪自身清杂能力，焦土自身评分不因携带矛枪而改变；整套仅做职责覆盖与共用库存检查。用户的实际分工作定性参考，不模拟跨武器补刀流程。', '');
  const titans = r.gates?.heavy_pair?.cases?.find(c => c.targets.every(t => t === 'bile_titan'));
  if (titans?.status === 'PASS' && titans.plan.every(p => p.weapon_id === 'g_123_thermite')) rows.push(
    `双泰坦路线：每只头部粘附${titans.plan[0].rounds}颗铝热，共${titans.plan.reduce((n, p) => n + p.rounds, 0)}颗；取用${titans.supplies_taken.length}次补给；当前工程时序${(titans.elapsed_ms / 1000).toFixed(1)}秒。投掷和取补给占用双手，已粘附的爆炸独立倒计时；只计头部爆伤，不借用燃烧叠加或额外部位。`, '');
  if (r.unresolved_strategic_equipment?.length) rows.push('尚缺关键机制字段的红绿：' + r.unresolved_strategic_equipment.map(id => model.equipment.find(e => e.equipment_id === id).name).join('、') + '。', '');
}
rows.push('## 独立武器样例（当前尺度）', '', '| 装备 | 清杂 | 近防 | 反中 | 特殊能力 |', '|---|---:|---:|---:|---|');
for (const id of ['support_spear','plas_1_scorcher','support_mg_43_machine_gun','ar_23_liberator','br_14_adjudicator']) {
  const r = model.equipment.find(e => e.equipment_id === id); if (!r) continue;
  const cloud = r.capabilities.modes.find(m => m.chaff.cloud)?.chaff.cloud;
  rows.push(`| ${r.name} | ${['chaff','close_defense','anti_medium'].map(k => contributionScore(r.dimensions[k].score,r.dimensions[k].score_origin,model.scenario.score_scale)?.toFixed(1) ?? '待补').join(' | ')} | ${cloud ? `毒云${cloud.damage_per_second} DPS，单云${cloud.exposure_seconds}秒；${cloud.initial_clouds}片初始云＋${cloud.refresh_clouds}片付弹续铺；近防为聚集敌群中的控制后扑估计，非瞬杀或硬控保证` : '按自身来源计算'} |`);
}
rows.push('', '## 本轮曲线与轻甲弱点修正', '',
  '用户要求将参照附近的曲线稍微放缓。现采用 r≤1 时 B=60r²；r>1 时 B=60+45(r−1)/(r−0.625)。两侧斜率均为120，r=1仍为60，r=4为100，顶端渐近105。曲线本身不改伤害或弹数；下面的打点成本另外进入物理时钟。红绿仍在曲线后另乘覆盖价值与分类系数。', '',
  '在有证据的头部、正面弱点和爆炸灌伤路线之间比较响应。所有精确部位都付瞄准成本，不按穿甲等级豁免；一般头部/缝隙暂用×2工程值。绿胖精确头部至少×4、嘴部至少×5为用户给定下限，目前取下限。焦土等爆炸武器可选择大腹部灌伤，使用普通身体瞄准×1。三类中型头部均按100%爆抗处理，转入主体的爆伤只攻击主体血量一次。', '',
  '| 装备 | 目标与实际打点 | 瞄准倍率 | 总发数 | 末发时间 |', '|---|---|---:|---:|---:|');
const mediumLabels = {'alpha_commander:head': '阿尔法指挥官·头部', 'alpha_commander:main': '阿尔法指挥官·主体', 'hive_guard:head': '巢穴护卫·头部',
  'hive_guard:main': '巢穴护卫·主体', 'bile_spewer:head': '胆汁喷吐者·头部', 'bile_spewer:mouth': '胆汁喷吐者·嘴部',
  'bile_spewer:butt': '胆汁喷吐者·大腹部灌伤', 'bile_spewer:main': '胆汁喷吐者·主体'};
for (const id of ['ar_23_liberator', 'br_14_adjudicator', 'plas_1_scorcher']) {
  const row = model.equipment.find(r => r.equipment_id === id);
  for (const hit of row.capabilities.modes[0].anti_medium) rows.push(`| ${row.name} | ${mediumLabels[hit.route.measured_target]} | ${hit.route.acquire_multiplier} | ${hit.shots ?? '待补'} | ${hit.first_to_last_ms ? (hit.first_to_last_ms / 1000).toFixed(3) + '秒' : hit.status} |`);
}
rows.push('', '### 绿胖：审判与焦土的实际代入', '',
  '瞄准时间 A=ceil(300ms×[1+0.15×max(0,(65−人机)/65)]×打点倍率)。射击间隔I取机械间隔和小幅后座修正后的值。本例无需中途换弹，首个击破时间 T₁=A+(BTK−1)I；不是将整段TTK乘4或5。换目标再次付瞄准，允许与已有换弹等待重叠。', '',
  '审判打头：HP300、耐久0、AV3；AP3等甲，单发floor(95×0.65)=61，5发。打嘴：HP250、耐久0、AV0；单发95，3发。焦土大腹部：HP750、耐久100%、AV0、爆抗0；耐伤直击50＋爆伤100=150，5发。爆免头/嘴不会借用爆炸伤害。', '',
  '| 路线 | 是否选用 | 瞄准A | 单发伤害/发数 | 间隔I | 首个击破T₁ | 连续处理Tᵣ | 响应U |',
  '|---|---|---:|---:|---:|---:|---:|---:|');
for (const a of greenAudit) {
  const s = a.service;
  rows.push(`| ${a.name}·${mediumLabels[a.part]} | ${a.selected ? '是' : '保留备选'} | ${s.entries[0].acquire_ms}ms | ${s.entries[0].per_round_damage}/${s.shots}发 | ${s.interval_ms}ms | ${(s.first_to_last_ms / 1000).toFixed(3)}s | ${(a.response.repeat_cycle_ms / 1000).toFixed(3)}s | ${a.response.value.toFixed(4)} |`);
}
rows.push('', 'U=0.75/T₁+0.25/Tᵣ，时间单位为秒；75/25是工程权重。连续处理从弹匣与目标的共同周期计算换弹，瞄准与换弹重叠部分不重复相加。本例BTK均整除弹匣容量，可写Tᵣ=(BTK−1)I+A+(BTK/弹匣容量)×[max(A,I,换弹时长)−max(A,I)]。', '',
  '审判者自己作反中参照，所以仍显示60；这是归一化结果，不能据此说其绿胖短板已经消失。焦土和审判都是主手，1.25槽位倍率相消。逐目标U相除后，按3/3/2求平均，再过曲线：', '',
  '| 焦土相对审判 | 指挥官 | 护卫 | 绿胖 | 加权平均r | 最终反中 |', '|---|---:|---:|---:|---:|---:|');
const scorcherRow = model.equipment.find(r => r.equipment_id === 'plas_1_scorcher');
const adjudicatorRow = model.equipment.find(r => r.equipment_id === 'br_14_adjudicator');
const mediumRatios = scorcherRow.capabilities.modes[0].anti_medium.map(t => t.response.value /
  adjudicatorRow.capabilities.modes[0].anti_medium.find(x => x.target_id === t.target_id).response.value);
rows.push(`| U焦土/U审判 | ${mediumRatios.map(n => n.toFixed(4)).join(' | ')} | ${scorcherRow.dimensions.anti_medium.ratio.toFixed(4)} | ${scorcherRow.dimensions.anti_medium.score} |`);
rows.push('', '反中先按当前3只指挥官、3只护卫、2只喷吐者的构成，对相对响应取加权平均，再过曲线；不是取最低项，也不是直接平均最终分。共享资源检查同样采用平均表现，不暗中保留“每项必须超过审判者”的旧门槛。每类仍需有可执行的路线。', '',
  '焦土对指挥官头部仍只计直击，6发是爆头；更快的完整处理路线为8发主体灌伤，约1.504秒。审判会考虑爆头后付弹补枪清掉流血条，不能强迫它等满自然流血期。反中参照仍为审判者60；没有改写武器伤害或给固定装备加分。', '',
  '弱点与爆抗来源：[Alpha Commander](https://helldivers.wiki.gg/wiki/Alpha_Commander)、[Hive Guard](https://helldivers.wiki.gg/wiki/Hive_Guard)、[Bile Spewer](https://helldivers.wiki.gg/wiki/Bile_Spewer)。', '',
  '## 流血、过穿、毒混乱：三枪反中对比', '',
  '| 武器 | 指挥官：发数 / 威胁等效秒 | 护卫：发数 / 秒 | 绿胖：发数 / 秒 | 最终反中 |',
  '|---|---:|---:|---:|---:|');
for (const r of comparisonRows) rows.push(`| ${r.name} | ${r.capabilities.modes[0].anti_medium.map(t => `${t.shots} / ${(t.response.effective_response_ms / 1000).toFixed(3)}`).join(' | ')} | ${r.dimensions.anti_medium.score} |`);
rows.push('', '| 武器打指挥官 | 部位击破 | 实际死亡估时 | 威胁等效时间 | 连续处理周期 |', '|---|---:|---:|---:|---:|');
for (const r of comparisonRows) {
  const t = r.capabilities.modes[0].anti_medium[0];
  rows.push(`| ${r.name} | ${(t.response.first_part_break_ms / 1000).toFixed(3)}s | ${(t.neutralized_at_ms / 1000).toFixed(3)}s | ${(t.effective_response_ms / 1000).toFixed(3)}s | ${(t.response.repeat_cycle_ms / 1000).toFixed(3)}s |`);
}
rows.push('',
  '指挥官头部流血池300、自然衰减100/秒。模型比较短射后等流血、继续命中残余受伤区付弹清池、直接打可见主体三种路线。后续伤害与自然流血同时推进；主池转伤、爆伤至Main、过穿到另一个部位分别记账。当前保守版不把致死当发的溢出自动扣进流血池，另给开启该假设的对照。继续补枪使用残余受伤区仍可命中的简化情境，不能等同所有动画/角度均可无障碍命中。', '',
  '毒矛当前一发头部直击387，向主体转伤387；绑定的头至主体过穿再计387，只消耗一发，主体剩226。毒伤只打主体，3秒内75伤，不借到头部流血池。自然流血先致死，所以取消这次过穿额外碰撞仍得到同样的处理时间与分数；它不是这次高分的隐藏前提。', '',
  '毒混乱：T等效=T死亡−(1−q)×爆头后被混乱覆盖的时间。当前q=0.10、控制响应等待0.300秒为工程起点；直接命中的Gas Confusion持续5秒来自来源。毒矛T等效=3.642−0.9×2.700=1.212秒。混乱到期后的时间恢复全额危险权重，不算硬控、无敌或提前死亡。高硬直80对指挥官阈值25另列为命中打断依据，未再额外送固定分数。', '',
  'U=0.75/T等效+0.25/T重复，75/25沿用工程权重。重复周期仍计真实射击、换弹和转火；流血与控制不锁住玩家双手。主手1.25仍作用于相对指数，因此最终毒矛与两把主手的比较包含既定槽位偏好。', '',
  '### 假设敏感性', '', '| 改动 | 毒矛 | 焦土 | 审判 |', '|---|---:|---:|---:|');
for (const s of mediumSensitivity) rows.push(`| ${s.label} | ${s.scores.map(r => r.score).join(' | ')} |`);
rows.push('', '过穿限制：用户确认毒矛有该用途，但公开资料的通用算法冲突。当前只对这条明确绑定的路线使用Wiki每次损失1 AP、来源0%穿透减速的候选输入；没有启用“AP差2就必定穿任何敌人”的通则。OTL的另一成本模型注明验证版本6.3.0，低于其页面标示当前7.2.1，不能假定任一描述已完整实测。来源：[Wiki伤害机制](https://helldivers.wiki.gg/wiki/Damage)、[OTL原始研究](https://helldiversotl.com/research/damage-resolution)、[毒矛面板](https://helldivers.wiki.gg/wiki/S-11_Speargun)、[状态效果](https://helldivers.wiki.gg/wiki/Status_Effects)。', '',
  '## 矛枪持续毒云与近防', '',
  '28只轻甲样本采用4片初始云，再花1发续铺不足以收完武斗虫的毒区。云重叠不叠DPS，每只最多计其真实HP；续铺必须在旧云消散前到位。首轮约20.1秒，稳定重复周期12秒；5发共完成4只直击＋24只毒伤，仍须通过真实库存和补给检查。毒云工作时可以装填与继续铺云，原先的逐只残血补射不再是唯一方案。', '',
  '近防单列条件路线：四只Hunter处于2米内圈的声明聚集场景，1发铺云与1秒后扑并行；加入300毫秒混乱响应等待作为工程起点。其意义是借控制脱离，不是1秒杀完，也不是混乱能打断所有已出手攻击的保证。目标分散或控制来得太晚时，该路线不采用。毒云增长速度、真实攻击动作时序仍需实战验收。', '',
  '毒云资料：[S-11 Speargun](https://helldivers.wiki.gg/wiki/S-11_Speargun)、[Status Effects](https://helldivers.wiki.gg/wiki/Status_Effects)。');
rows.push('', '## 红绿末尾加值', '', '这里是经过覆盖价值与分类系数后的加值，不是单件裸分。飞鹰额外系数仍为0.5；本轮按用户进一步下调要求，普通哨戒炮k从0.45改为0.30、激光塔专属k从0.15改为0.10、迫击炮额外系数从0.5改为0.25、轨道加特林散射k从0.5改为0.25。这些新幅度是待验收工程起点，激光专属k包含通用损失，不再叠乘普通炮塔k。人工最终分不重复修正。烟雾与绿色拆洞仍为0；手动炮位另计占用双手后的增量能力。', '',
  '飞鹰改用有限工作量：每轮杀伤Q不超过当次声明敌群数量，不把重叠投弹或过杀当成额外新敌人。T=Q/同职责参照处理速率，V=NT/[NT+大CD+延迟+(N−1)×max(小CD,延迟)]；N为大CD前次数。最终为曲线后基分×V×分类k×额外战斗系数。T表示省下的处理工作时间，不是飞鹰持续覆盖时长；小CD和生效等待可重叠，不再给每次调用无条件分配整波工作量。', '',
  '| 装备 | 清杂加值 | 反中加值 | 额外战斗系数（清杂/反中） | 未决项 |', '|---|---:|---:|---|---|');
for (const s of strategic) rows.push(`| ${s.name} | ${s.assessments.filter(a=>['chaff','anti_medium'].includes(a.role)).map(a => a.contribution.status === 'KNOWN' ? a.contribution.value.toFixed(2) : '待补').join(' | ')} | ${s.assessments.filter(a=>['chaff','anti_medium'].includes(a.role)).map(a=>a.contribution.combat_adjustment?.factor??'—').join(' / ')} | ${[...new Set(s.assessments.filter(a => a.contribution.status !== 'KNOWN').map(a => a.contribution.reason))].join('、') || '—'} |`);
rows.push('', '来源与边界：固定Wiki快照，加上本轮 `docs/ai/assessment-v2-wiki-round2-20261027/` 的补证。部分网页为搜索索引，可能滞后；机枪塔射速630/660保留来源差异并采用630的声明下界。飞鹰自动耗尽整备120秒与带弹手动召回108秒分开。工程几何与操作参数均未伪装成游戏实测。', '');
rows.push('## 全池实际计算覆盖（2026-10-28）','',
  `池内${coverage.counts.equipment}件；${coverage.counts.three_role_calculation_ready}件已有适用的三项主要能力计算或明确零值，${coverage.counts.with_unresolved_role}件仍有适用项未接通。红绿${coverage.counts.strategic_calculation_ready}/38件可计算清杂和反中末尾加值。`, '',
  '已有三项数值不代表整件装备已完成：链电、其他子弹药、喷流点燃积累、自动目标选择等仍有缺口；重甲、拆洞和整套共享资源也需分别检查。所有正式抽取开关保持关闭。', '',
  '本轮接入常温热循环、有限散热器、强制冷却、连续光束时间积分、喷射燃料、投掷引信、飞刀、绑定电弧、有限范围伤害和独立载具弹药。近战仅采用当前页面有频率的四件、主体接触与每目标0.75秒工程转位，不给予远程弱点或额外挥砍命中；其余近战继续待查。载具开局需等来源10.5秒到场并支付2秒工程登乘，缺装填时序时只计首个已装弹匣，补车炮塔排除。', '',
  '喷流采用已有直击、单份Fire和有限燃料；燃烧弹新增连续射击状态积累，未知阈值仍不填数。钗与三叉戟接射击间隙散热及有限快换，耗尽备用散热器后自然冷却。三叉戟六束不附火。缓和使者每发10弧，电弧雷按用户确认每跳10弧共5次；两者锁尸体候选系数0.5，电弧雷后四跳另各乘0.2，当前为9弧等价。以上损失系数与1秒放电间隔均为工程参数。空爆火箭/轨道空爆接各自25/12颗子弹，声明散布几何，母弹不重复加伤。', '',
  '六项都显示分数。战斗与拆迁沿用曲线S(r)：r≤1时60r²，r>1时60+45(r−1)/(r−0.625)。反重每类完整双杀r=20秒/实际用时；只能付出一只时r最多0.5，避免速杀一只掩盖缺弹。已知路线表现取平均，覆盖情况另列，不再按覆盖几类÷三折分；未知目标不充零。先检查直击或爆炸AP4重穿门槛，低于默认反重0，火毒状态AP不能绕过；弱点战例只作说明，不参与分数或整套反重过线。达到门槛后按实际双杀耗时、BTK和库存计算，不额外要求Anti-Tank标签；已确认的稳定爆炸反重手段保留。红绿反重仍为经CD/分类修正的条件加值。拆迁r=首轮可完成洞数/5，探测25洞，达到上限只报分数下界；绿战备恒0，不等大CD补次数。单次直击或爆炸拆迁力≥40即可具备拆迁能力，不累加拆迁力；红战备不按名称白名单筛选。仅核有限库存时不因未知起爆时间丢分，也不声称完成时间。', '',
  '枪械续航已按用户要求简化为全弹总伤D=可用总弹量×单发伤害，直击与已绑定爆炸合计一次；肉伤用于分数，耐伤总量单列。不再查敌人、BTK、AP、击杀波数、职责、换弹或后座。显示换算暂用令r=D/D参照，S=105r^1.15/(r^1.15+0.75)，参照附近斜率提高15%，参照为解放者满弹＋一盒公共总伤68850，60分是工程显示刻度。补给先增加有限弹量再算总伤，不固定送满分。红绿续航统一为0；CD/兑现系数继续用于其他战斗能力。', '',
  '手雷续航按携带颗数＋有限补给颗数计，不乘伤害；用户参照4携带＋一盒补2为显示60分。补给每颗权重暂取携带的2倍（工程参数），真实库存不加权。手雷次数暂单列，不混入枪械续航；整套续航采用主力＋备用汇总，见后文。反重与拆迁将各件最终分直接相加，不压缩总分；真实弹药、20秒双重甲和五洞检查保留。', '',
  '| 装备 | 清杂 | 近防 | 反中 | 反重 | 续航：一盒公共 | 拆迁：五洞 |', '|---|---:|---:|---:|---|---|---|');
const numeric=(value,lower=false)=>Number.isFinite(value)?value>0&&value<.01?'<0.01':`${lower?'≥':''}${value.toFixed(2)}`:'待补';
const point=(v,origin,lower=false)=>numeric(contributionScore(v,origin,model.scenario.score_scale),lower);
const heavyDisplay=h=>h.score_origin==='MANUAL_CALIBRATED'?`${numeric(h.score)}（人工）`:h.state==='KNOWN_ZERO'?'0':h.state==='CONDITIONAL_STRATEGIC_BONUS'?`${point(h.score)}（条件加值）`
  :Number.isFinite(h.score)?`${point(h.score)}（${h.conditional_only?'条件路线；':''}已接${h.scored_targets}/${h.total_targets}类）`:'待接反重路线';
const demolitionDisplay=d=>d.score_origin==='MANUAL_CALIBRATED'?`${numeric(d.score)}（人工）`:d.state==='KNOWN_ZERO'?'0':d.capability?.qualifies&&!Number.isFinite(d.score)?'可拆迁（库存待接）':d.best?`${point(d.score,undefined,d.score_lower_bound)}（${d.best.public.completed_actions}/5洞）`:'待接拆迁路线';
const enduranceDisplay=e=>e.rating?.kind==='USER_MELEE_ZERO'?'0（近战，不计续航）':e.score_origin==='MANUAL_CALIBRATED'?`${numeric(e.score)}（人工）`:e.rating?.kind==='USER_RED_GREEN_ZERO'?'0（不计续航）':e.state==='NOT_APPLICABLE'?'—':`${point(e.score)}${e.state==='SUPPLY_PROVIDER'?'（供给参照）':''}`;
const display = (item, audit, role) => {
  const grenadeBonus=role==='chaff'&&item.grenade_chaff;
  if(Number.isFinite(manualValue(item,role)))return `${numeric(manualValue(item,role))}${grenadeBonus?'（加值）':''}（人工）`;
  if(grenadeBonus)return `${point(item.dimensions.chaff.score)}（加值）`;
  const state = audit.role_states[role];
  if (state === 'NOT_APPLICABLE_HELD_WEAPON_TEST') return '—';
  if (state === 'UTILITY_NOT_QUANTIFIED') return '控制/防护待接';
  const bonus = item.strategic_profile ? assessStrategic(item,model).find(s=>s.role===role)?.contribution : null;
  const value = bonus?.status === 'KNOWN' ? bonus.value : !item.strategic_profile ? item.dimensions[role].score : null;
  return Number.isFinite(value) ? point(value) + (bonus ? '（加值）' : '') : '待补';
};
const sixDimensionRows=[];
for (const audit of coverage.equipment) {
  const item=model.equipment.find(r=>r.equipment_id===audit.equipment_id);
  const automatic=structuredClone(item);delete automatic.manual_calibration;
  for(const target of [...Object.values(automatic.dimensions),automatic.heavy_assessment,automatic.endurance,automatic.demolition_assessment]) {
    if('calculated_score' in target)target.score=target.calculated_score;
    if(target.calculated_state)target.state=target.calculated_state;
    delete target.score_origin;
  }
  const cells=r=>[...['chaff','close_defense','anti_medium'].map(role=>display(r,audit,role)),
    heavyDisplay(r.heavy_assessment),enduranceDisplay(r.endurance),demolitionDisplay(r.demolition_assessment)];
  sixDimensionRows.push({id:item.equipment_id,cells:cells(item),calculated_cells:cells(automatic)});
  rows.push(`| ${item.name} | ${['chaff','close_defense','anti_medium'].map(role=>display(item,audit,role)).join(' | ')} | ${heavyDisplay(item.heavy_assessment)} | ${enduranceDisplay(item.endurance)} | ${demolitionDisplay(item.demolition_assessment)} |`);
}
rows.push('', '## 手雷清杂：有限补给辅助加值', '',
  '手雷短时裸分保留，但整套清杂采用有限补给折算加值。T=计入的补充颗数×每颗有限样本有效目标数÷机枪参照速率；V=T/(T＋补给CD＋投放＋取箱＋引信)，自动加值=B×V。初始库存单列，不在每个补给周期免费重现，补包与补车也不免费循环。当前补给投放延迟无可靠值，按0计算，属于偏乐观上界。该加值不降低主力武器的共享弹药门槛；人工校准仍替换最终加值。', '',
  '| 手雷 | 短时裸分 | 初始/每盒补充/计入 | 每颗有效目标 | 参照只/秒 | T/补给周期（秒） | V | 自动加值 |',
  '|---|---:|---|---:|---:|---|---:|---:|');
for(const r of model.equipment.filter(r=>r.grenade_chaff)) {
  const g=r.grenade_chaff;
  rows.push(`| ${r.name} | ${numeric(g.bare_score)} | ${g.initial_rounds??'待补'} / ${g.refill_rounds??'待补'} / ${g.credited_rounds??'待补'} | ${numeric(g.targets_per_grenade)} | ${numeric(g.reference_rate)} | ${numeric(g.equivalent_work_s)} / ${Number.isFinite(g.cycle_ms)?numeric(g.cycle_ms/1000):'待补'} | ${g.coverage_value?.toFixed(4)??'待补'} | ${numeric(g.score)} |`);
}
rows.push('', '## 连续光束挂火后转火', '',
  '用户确认普通轻甲约0.1～0.2秒接触可稳挂火，主表取0.15秒中值；只绑定拾荒虫、Hunter和武斗虫。燃烧采用来源100基础DPS、3秒上限，再按目标火伤倍率与AP结算；持续时间从点燃开始，未赠送每个积分步重触发/刷新。照射付热量，转火付瞄准时间；清杂允许脱手燃烧，近防比较四只Hunter实际死亡用时，不能把挂火时间当作安全时间。未将轻甲接触时长泛化至中重甲或自动背包/炮塔；反中暂维持已有直击路线。', '',
  '| 装备 | 接触时间 | 清杂 | 近防 | 28只轻甲耗热单位 | 四只Hunter死亡用时 |', '|---|---:|---:|---:|---:|---:|');
for(const r of laserSensitivity)for(const v of r.variants)rows.push(`| ${r.name} | ${v.contact_ms===null?'只计直击':`${v.contact_ms}ms`} | ${numeric(v.scores.chaff)} | ${numeric(v.scores.close_defense)} | ${v.chaff_heat_units} | ${(v.close_neutralized_ms/1000).toFixed(3)}s |`);
rows.push('', '机制资料：[激光补证](ai/assessment-v2-laser-ignition-20261028/evidence.json)。挂火时间来自用户实战范围，来源并未给出可靠状态tick；计算步长不是游戏tick。', '',
  '## 破片独立计算与接触条件', '',
  '机炮APHET不带该破片组件；FLAK和爆裂铳各产生30片AC-8 P2，单片110肉伤/35耐伤，正面AP3。破片按自身穿甲与耐久结算，不继承爆伤，也不能把30片全部加到同一个致命部位。FLAK采用3米近炸，不再同时送满额直击和内圈爆伤。', '',
  '当前声明场景：5米内每个存活目标至多接触两片，单次总接触不超过发出的30片；这是工程情境，不是Wiki给出的命中数或散布半径。对照列取消破片接触，保留同一爆炸落点和衰减；另在本轮机制复核报告列0/1/2/3片敏感性。空爆子弹另按自身爆炸组件计算，不套用弹道破片。', '',
  '| 模式 | 清杂：零接触 / 声明接触 | 反中：零接触 / 声明接触 | 清杂消耗 |', '|---|---:|---:|---:|');
for(const r of fragmentSensitivity)rows.push(`| ${r.name}·${r.mode_id} | ${['chaff','anti_medium'].map(role=>`${r.scores[role].zero_contact??'待补'} / ${r.scores[role].declared_contact??'待补'}`).join(' | ')} | ${r.chaff.shots??'待补'}发 |`);
rows.push('', '## 火毒已接入与真实缺项', '',
  'Fire元素直击、单份Fire持续伤害与地火接触分别记录。直击与持续伤害应用敌人火伤倍率，燃烧只扣主体血量；同种Fire不叠DPS，舰船火伤加成只应用一次。喷流普通小虫按用户150ms接触挂火，其他目标的名义状态强度积分另列工程假设；喷流不会进入光束敏感性表。未知激光tick、喷流粒子数不以数值积分步长冒充。LAS-16不对敌点火，LAS-17自燃不计敌人燃烧。', '',
  'SG-225IE高燃破裂者与SG-451野炊可比较短射后燃烧致死，资源账使用相同发数。地火按用户确认的接触即挂火，只在明确接触点计入；地火与已有燃烧共用同一份Fire，不额外叠层。G-8/G-10/G-13的地火时长已有来源，但独立地火范围仍未知，不能借爆炸半径补齐。下表的area.fire是已实际记入的燃烧伤害及接触次数。', '',
  '毒云按有限几何与连续暴露核算，每颗/每发初铺与续铺都付弹，重叠云不叠毒伤，不额外赠送离云后6秒。来源半径、工程目标间距和云内停留假设分开；几何策略不是Wiki实测，云增长与敌人离场未模拟。Gas Confusion另以存活敌人的受控时间折算减压收益，仅进入清杂原始比值一次，不改DPS、击杀数、实际死亡时间或耗弹；手雷随后仍乘补给V。普通完整敌人的受控残余压力暂取50%工程起点，不套用指挥官爆头后的10%。控制不等于硬控、额外击杀或立即安全；近防自伤区仍受限制。敌人毒气倍率暂无明确来源，保留1的工程基准。', '',
  '仍缺：部分敌人的点燃阈值；激光实际状态tick、喷流实际粒子接触；独立火池半径与区域刷新细节；同类不同来源Gas/Gas Var2相互覆盖规则；部分子弹药的展开、触发与目标分配。', '',
  '新增资料：[火焰通道补证](ai/assessment-v2-fire-channels-20261028/evidence.json)、[破片证据](ai/assessment-v2-mechanisms-20261028/fragments/README.md)、[模式与库存](ai/assessment-v2-mechanisms-20261028/gaps/mode-and-stock-bindings.md)、[火毒矩阵](ai/assessment-v2-mechanisms-20261028/status/equipment-matrix.json)、[区域绑定](ai/assessment-v2-mechanisms-20261028/status/area-bindings.json)。', '',
  '| 喷流装备/目标 | 直击元素 | 用户轻甲挂火 | 每只喷射/死亡（秒） | 已计单份Fire伤害 |', '|---|---|---:|---|---:|');
for(const r of model.equipment)for(const m of (r.facts.service_modes??[]).filter(isSpray)) {
  const cap=r.capabilities.modes.find(c=>c.mode_id===m.mode_id);
  for(const e of cap?.chaff.entries??[])rows.push(`| ${r.name} / ${e.target_id} | ${m.element??'待补'} | ${m.ignition_policy?.contact_ms??'待补'}ms | ${numeric(e.btk*m.work_ms/1000)} / ${Number.isFinite(e.resolution?.death_ms)?numeric(e.resolution.death_ms/1000):'待补'} | ${numeric(e.resolution?.main_damage.fire_before_death)} |`);
}
rows.push('', '| 地火装备 | 来源持续秒数 | 独立范围 | 模式Fire伤害/挂火次数/明确地火接触次数 |', '|---|---:|---|---|');
for(const r of model.equipment.filter(r=>r.facts.ground_fire)) {
  const g=r.facts.ground_fire;
  const burns=r.capabilities.modes.filter(m=>m.chaff?.area?.fire).map(m=>{const f=m.chaff.area.fire;return `${m.mode_id}: ${numeric(f.damage)} / ${f.applications} / ${f.explicit_ground_contacts}`;});
  rows.push(`| ${r.name} | ${numeric(g.duration_s)} | ${Number.isFinite(g.radius_m)?`${g.radius_m}米`:'未知；不借爆炸半径'} | ${burns.join('；')||'无范围燃烧记账；地火不额外叠层'} |`);
}
rows.push('', '| 毒云装备/模式 | 来源半径 | 暴露秒数/DPS | 初铺/续铺/总耗弹 | 控制秒数 | 间距/几何策略 |', '|---|---:|---|---|---:|---|');
for(const r of model.equipment)for(const m of r.capabilities.modes.filter(m=>m.chaff?.cloud)) {
  const c=m.chaff.cloud;
  rows.push(`| ${r.name} / ${m.mode_id} | ${c.radius_m}米 | ${c.exposure_seconds} / ${c.damage_per_second} | ${c.initial_clouds} / ${c.refresh_clouds} / ${c.own_ammo_rounds} | ${numeric(c.control?.duration_s)} | ${c.spacing_m??'声明接触点'} / ${c.geometry??c.policy} |`);
}
rows.push('', '| 自身毒云控制 | 无控制基准/控制覆盖（敌人·秒） | 残余压力比例 | 减少的累计敌人·秒 | 清杂原始比值倍率 |', '|---|---|---:|---:|---:|');
for(const r of model.equipment)for(const m of r.capabilities.modes.filter(m=>m.chaff?.cloud?.control?.pressure)) {
  const p=m.chaff.cloud.control.pressure;
  rows.push(`| ${r.name} / ${m.mode_id} | ${numeric(p.uncontrolled_enemy_ms/1000)} / ${numeric(p.controlled_enemy_ms/1000)} | ${numeric(p.residual_threat_fraction)} | ${numeric(p.avoided_enemy_ms/1000)} | ×${p.score_ratio_gain?.toFixed(4)??'待补'} |`);
}
rows.push('',
  '## 续航库存与整套续航', '',
  '整套现用固定“主力＋备用”算法，无大模型或在线资料查询。每把枪沿用一盒公共补给基线与人工校准；清杂/近防/反中各按分数÷60截到0～1，以60%/30%/10%加权得到适配度q。每枪贡献V=q×单件续航分；常态续航=min(100,最大V＋35%×其余V之和)。这些权重为待验收工程参数，不是玩家真实使用时间。专职工具不会通过均值拖低主力；无限弹副手也须经过q。', '',
  '补包/补车不参与最高分或平均，而在最终结算把整套续航补到至少100，两者不叠加、原本超过100不降低；红绿、手雷、自动背包和载具不参与常驻枪池。明确保留反重的装备退出常态池。人工整件加值只在末尾加一次；手雷次数仍独立。人工单件续航及人工0保持原值；补给只改变最终分，不把真实弹药变成无限。缺资料标记未知或下界，不回退成参照枪。平衡抽取须六维最终分全部达到60；先应用补包/补车修正，再检查续航及格。真实弹药与其他物理检查保留。', '',
  '| 诊断配装 | 常态汇总 | 补给修正前（含人工加值） | 最终续航 | 主力贡献项 |',
  '|---|---:|---:|---:|---|',
  ...results.filter(r=>r.endurance_assessment).map(r=>`| ${r.name} | ${numeric(r.endurance_assessment.score)} | ${numeric(r.dimensions.endurance.supply_adjustment?.before_score??r.dimensions.endurance.score)} | ${numeric(r.dimensions.endurance.score)} | ${model.equipment.find(x=>x.equipment_id===r.endurance_assessment.primary_id)?.name??'待定'} |`), '',
  '枪械续航现在只使用名义全弹总伤，不再使用同职责目标工作量。每个模式都列已装＋全备弹、补给追加弹量、肉伤/耐伤总量。不同模式共享弹药，选可用模式而不相加。近战武器续航固定为0，完全退出整套续航计算，不占主力、备用或平均分母，也不能作为人工续航加值。已有四波战斗诊断仍供核对其他能力，但完全不参与续航计分。', '',
  '本简化版合计已绑定直击与基础爆炸，破片潜力和持续伤害仍单列条件，不假定全部命中/无限群伤，因此相关项目的基础总伤不代表完整特殊效果。补包4盒、补车8盒，补车炮塔不计；额外弹药受接收容量和实际补给量限制。可冷却资源保持100的无限弹药标识，冷却等待只影响其他能力。红绿续航统一为0，载荷资料仅供其他战斗能力使用。', '',
  '| 装备 | 满状态肉伤总量 | 满状态耐伤总量 | 加一盒后的肉伤 / 耐伤 | 续航分：无公共 / 一盒 |', '|---|---:|---:|---:|---:|');
for(const id of ['support_mg_43_machine_gun','ar_23_liberator','br_14_adjudicator','plas_1_scorcher','support_spear','r_36_eruptor','heavy_support_ac_8_autocannon','heavy_support_gl_28_belt_fed_grenade_launcher']) {
  const r=model.equipment.find(r=>r.equipment_id===id),e=r.endurance,b=e.modes?.find(m=>m.mode_id===e.selected_mode);
  rows.push(`| ${r.name} | ${b?.full_stock_standard_damage??'待补'} | ${b?.full_stock_durable_damage??'待补'} | ${b?.plus_one_box_standard_damage??'待补'} / ${b?.plus_one_box_durable_damage??'待补'} | ${e.without_public_score??'待补'} / ${e.score??'待补'} |`);
}
rows.push('', '### 尚有主要能力缺口的装备', '', '| 装备 | 来源/实现缺口 |', '|---|---|');
for (const audit of coverage.equipment.filter(r=>!r.calculation_ready)) rows.push(`| ${audit.name} | ${[...audit.source_fields_to_resolve,...audit.implementation_bindings].join('；') || '当前机制未接通'} |`);
rows.push('', '### 已查来源仍缺的字段', '',
  '上面的缺口包括尚未实现的计算，不能全叫“缺资料”。本轮另核了40件候选、全池攻击模式与43件火毒/激光记录；下面列来源仍缺或有冲突的条目。已有来源而代码未绑定的条目仍保留在逐项交付包，不会改成“已完成”。', '',
  '| 装备 | 仍需来源/语义证据 |', '|---|---|');
const research=JSON.parse(readFileSync(new URL('docs/ai/assessment-v2-mechanisms-20261028/gaps/field-matrix.json',root),'utf8'));
for(const r of research.equipment) {
  const pending=r.entries.filter(e=>['已查缺','源冲突'].includes(e.status)||e.unresolved?.length);
  if(pending.length)rows.push(`| ${r.name} | ${pending.map(e=>e.note??`${e.field}：${e.unresolved?.join('、')??e.status}`).join('；').replaceAll('|','/')} |`);
}
rows.push('', '六个红绿未接通项的关键字段继续保留未知：[来源核对](ai/assessment-v2-mechanisms-20261028/gaps/strategic-blockers.json)。例如500kg的战斗时序仍缺落地起爆延迟；拆迁库存现已可按单次40拆组件及首轮次数核算，不用延迟猜值。飞鹰可用次数仍不能替代战斗计算中的单次投弹数量。', '',
  '已有补证包：docs/ai/assessment-v2-source-completion-20261028/、docs/ai/assessment-v2-mechanisms-20261028/。原生6.1 Terra的返回已区分来源数值、冲突和未查得；Wiki未公开的时序不填零。来源包含搜索索引，未做游戏内测量。', '');
const json = JSON.stringify(report, null, 2) + '\n', markdown = rows.join('\n').trimEnd() + '\n';
for (const [file, content] of [['docs/loadout-v3-diagnostic-20261027.json', json], ['docs/loadout-v3-diagnostic-20261027.md', markdown],
  ['docs/loadout-v3-six-dimensions-20261028.html',renderSixDimensions(model,sixDimensionRows,laserSensitivity,results)]]) {
  const path = new URL(file, root);
  if (process.argv.includes('--check')) {
    if (readFileSync(path, 'utf8') !== content) throw Error('DIAGNOSTIC_REPORT_DRIFT:' + file);
  } else writeFileSync(path, content);
}
console.log(JSON.stringify(results.map(r => ({name: r.name, status: r.status, missing: r.missing, reason: r.gates?.legality?.reason}))));
