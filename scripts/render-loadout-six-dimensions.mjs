import {SCORE_ROLES,lockedScoreRoles,contributionKind} from '../shared/hd2-loadout/assessment-v2/manual-scores.mjs';
import {rescaleScore,contributionScore} from '../shared/hd2-loadout/assessment-v2/score-scale.mjs';
import {assessStrategic} from '../shared/hd2-loadout/assessment-v2/strategic.mjs';
import {ordinaryCapabilities,ordinaryModes} from '../shared/hd2-loadout/assessment-v2/projectile.mjs';
const esc=v=>String(v??'待补').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const table=(headers,rows)=>`<div class="scroll"><table><thead><tr>${headers.map(v=>`<th>${esc(v)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const seconds=v=>Number.isFinite(v)?`${(v/1000).toFixed(2)}秒`:'待查';
const targetNames={charger_behemoth:'巨兽冲锋虫',bile_titan:'泰坦',impaler:'穿刺虫'};
const cases={initial:'仅满弹',public:'满弹＋一盒公共',pack:'再带补包',vehicle:'再带附近补车'};
const status={COMPLETED:'完成探测',INSUFFICIENT:'资源或窗口不足',UNKNOWN:'尚缺机制/资料',ILLEGAL:'背包互斥'};
const roleNames={chaff:'清杂',anti_medium:'反中',anti_heavy:'反重'};
const score=v=>Number.isFinite(v)?v>0&&v<.01?'<0.01':v.toFixed(2):'待补';
const isSpray=m=>/FUEL_UNIT|UNDERBARREL_FIRST_CANISTER|STATUS_ONLY_LOWER_BOUND/.test(m.service_conversion??'');
const cellWithKind=(r,c,i)=>String(c).replace(/（(?:条件)?加值）/g,'')+(contributionKind(r,SCORE_ROLES[i])==='AUXILIARY_ADDITION'?'（加值）':'');
const cloudPressure=m=>m.chaff?.cloud?.control?.pressure??m.chaff?.pressure;
function details(r,laserSensitivity,model) {
  const h=r.heavy_assessment,e=r.endurance,d=r.demolition_assessment,parts=[];
  const final=v=>score(contributionScore(v.score,v.score_origin,model.scenario.score_scale));
  const points=v=>score(rescaleScore(v,model.scenario.score_scale));
  parts.push('<section data-manual-summary hidden></section>');
  if(r.child_assessments?.length){
    parts.push('<h3>爆炸子弹药：条件伤害与接入状态</h3><p>下表单颗爆伤用于核对组件。已接入的空爆采用声明散布圆盘，按每个子弹落点到目标的距离计算爆伤、穿甲和外圈衰减，母弹不重复计入。散布半径与时序包含待验收工程参数，不代表全部子弹命中同一个部位；其他未绑定模式仍仅作诊断。</p>');
    parts.push(table(['父模式 / 目标部位','发射子弹数','单颗条件爆伤','每次原弹成本','时序与散布'],r.child_assessments.flatMap(a=>a.targets.map(t=>[
      `${a.mode_id} / ${t.target_id}`,t.emitted_count,score(t.declared_combined_damage),`${t.ammo_cost}${t.requires_full_magazine?'（须整匣）':''}`,
      (()=>{const m=r.facts.modes.find(m=>m.mode_id===a.mode_id);return m?.child_pattern?`已接入：${m.child_pattern.radius_m}米工程散布半径；延迟${seconds(m.detached_delay_ms)}`:'待补；未加入主分';})()]))));
  }
  const arcModes=ordinaryModes(r.facts).filter(m=>m.arc_policy);
  if(arcModes.length){
    parts.push('<h3>电弧数量、连锁与兑现损失</h3><p>理论数量与实际计分分开。电弧雷每跳10弧、共5次来自用户确认；锁尸体与后续弹跳落到无人区分别扣除。锁尸体保留50%、后四跳各保留20%是待验收工程参数，不是实测概率。未查明的分叉衰减不计额外收益；近防仍受起爆等待和自伤场景限制。</p>');
    parts.push(table(['模式','每次电弧 / 次数','尸体损失后保留','各次落点系数','计分等价首级电弧','连锁伤害比例','全部效果等待'],arcModes.map(m=>[
      m.mode_id,`${m.arc_policy.bolts} / ${m.arc_policy.pulses??1}`,m.arc_policy.live_target_fraction??1,
      (m.arc_policy.pulse_location_factors??[1]).join(' / '),m.pellets,m.arc_policy.chains.join(' / '),seconds(m.detached_delay_ms??0)])));
    if(r.equipment_id==='g_31_arc')parts.push('<p>当前按3秒引信＋后四次各间隔1秒，将伤害保守记在末次放电。1秒间隔尚无可靠测量；不把50弧算成即时命中。当前首级有效量为10×(1＋4×0.2)×0.5＝9弧等价伤害，名义全弹总伤仍保留50弧，不借连锁无限放大。</p>');
    if(r.equipment_id==='support_gl_52_conciliator')parts.push('<p>缓和使者每发10根首级电弧，扣锁尸体候选损失后为5弧等价。当前按主体攻击；Wiki战术描述与补丁自伤说明存在差异，近距离暂按10米放电危险区保守检查，未认定可安全贴脸射击。</p>');
  }
  const thermal=ordinaryModes(r.facts).filter(m=>m.finite_heat_sinks);
  if(thermal.length)parts.push('<h3>常温热循环与有限散热器</h3><p>钗与三叉戟计入射击间隙散热；有备用散热器时可快换，用尽后改为较慢的自然冷却。三叉戟的六束可分配给紧凑敌群，但没有附赠燃烧异常。</p>',table(['模式','热量额度对应发数','备用散热器','快换 / 自然冷却'],thermal.map(m=>[m.mode_id,m.capacity,m.spare_sink_rounds/m.capacity,`${seconds(m.reload_ms)} / ${seconds(m.cooling_ms)}`])));
  if(r.equipment_id==='p_34_breacher')parts.push('<p>P-34按用户授权的4秒铝热引信简化：直击、持续铝热与最终爆炸分别绑定，保守在4秒后结算。不再附赠一层普通Fire；库存仅计实际弹药和有限补给。</p>');
  if(r.equipment_id==='backpack_b_md_c4_pack')parts.push('<p>C4按用户授权简化为触爆，引信0秒；投掷、取下一颗与有限库存仍计入，不等于零操作时间。</p>');
  if(r.grenade_chaff) {
    const g=r.grenade_chaff;
    parts.push('<h3>手雷清杂：有限补给辅助加值</h3><p>手雷保留短时清杂能力，整套清杂只加下表的补给折算值。每颗有效工作量来自有限敌群，T=计入的补充颗数×每颗有效目标数÷机枪参照速率，V=T/(T＋补给周期)，自动加值=裸分×V。初始库存单列，不视为每轮自动补满；这个加值不能替代主力武器的共享弹药检查。人工校准仍可修改最终加值。</p>');
    parts.push(table(['短时裸分','初始/每盒补充/本轮计入','每颗有效目标数','参照速率（只/秒）','等价工作T','补给周期（含取箱/引信）','V','自动加值'],[[
      score(g.bare_score),`${g.initial_rounds??'待补'} / ${g.refill_rounds??'待补'} / ${g.credited_rounds??'待补'}`,
      score(g.targets_per_grenade),score(g.reference_rate),seconds(g.equivalent_work_s*1000),seconds(g.cycle_ms),g.coverage_value?.toFixed(4),points(g.score)]]));
    parts.push(`<p>当前清杂最终加值：<span data-effective-score="chaff">${final(r.dimensions.chaff)}</span>。补给投放延迟暂无可靠值，当前按0计算，属于偏乐观上界；便携补给不免费循环。整套携带补包或补车时，会在同一首波弹药账中消耗补给，额外完成的手雷仅提高首个补给窗口加值；本单件表仍显示一盒公共基线。口径：${esc(g.scope)}。</p>`);
  }
  if(r.automatic_assessments?.length) {
    parts.push('<h3>自动背包：辅助加值</h3><p>无人机提供辅助能力，不占用玩家主枪；所列加值是有条件的工程候选，自动转火、目标可及性和返包时序可能仍待确认。人工校准可覆盖最终加值，但不会补齐机制。</p>');
    parts.push(table(['职责','辅助加值','状态与限制','首匣条件工作量'],r.automatic_assessments.map(a=>{
      const c=a.contribution??{},p=c.physical??{};
      return [roleNames[a.role]??(a.role==='close_defense'?'近防':a.role),points(c.value),
        c.status==='KNOWN'?'工程候选；仅在说明的条件下成立':`待补：${c.reason??'资料不足'}`,
        Number.isFinite(p.conditional_target_equivalents)?`${p.conditional_target_equivalents.toFixed(2)}（${p.first_magazine_rounds}发；假定命中，非保证）`:'待补'];
    })));
  }
  const partialModes=r.capabilities.modes.filter(m=>m.chaff?.partial_cohort);
  if(partialModes.length)parts.push('<h3>有限库存清杂</h3><p>只计本轮实际能处理的目标，不把部分完成写成清完整波；目标可及性和命中条件仍需满足。</p>',
    table(['模式','本轮完成 / 请求数','消耗发数','状态'],partialModes.map(m=>[m.mode_id,
      `${m.chaff.count??'待补'} / ${m.chaff.requested_count??'待补'}`,m.chaff.shots,'部分完成；不是完整波'])));
  const areaModes=r.capabilities.modes.filter(m=>m.chaff?.area);
  if(areaModes.length) {
    const sparse=ordinaryCapabilities(r.facts,model.targets,model.ap,{...model.scenario,
      area:{...model.scenario.area,spacing_samples_m:[3]}});
    parts.push('<h3>群体清杂：紧凑敌群</h3><p>按用户“敌人通常挤得紧密”的反馈，主表用1.5米间距作工程起点；3米只作疏散队形对照。爆炸逐距离结算，散弹/多束只分配已有弹丸，电弧另扣兑现损失。目标采用主体血量，死亡目标不再计收益。实际间距未经游戏测量，不代表每次交战都能命中这些邻近目标。</p>');
    parts.push(table(['模式','内圈/外圈半径','紧凑队形发数及完成数','3米对照发数及完成数','非主目标爆伤接触'],areaModes.map(m=>[
      m.mode_id,`${m.chaff.area.inner_radius_m?.toFixed(2)??'无爆炸内圈'} / ${m.chaff.area.outer_radius_m?.toFixed(2)??'无爆炸外圈'}米`,
      `${m.chaff.shots??'待补'}发；${m.chaff.count??'待补'}/${m.chaff.requested_count??28}${m.chaff.partial_cohort?'（部分完成）':''}`,
      (()=>{const c=sparse.modes.find(x=>x.mode_id===m.mode_id)?.chaff;return c?`${c.shots??'待补'}发；${c.count??'待补'}/${c.requested_count??28}${c.partial_cohort?'（部分完成）':''}`:'待补';})(),m.chaff.area.secondary_blast_contacts])));
    parts.push('<p class="note">上表是清杂收益；近防仍检查自伤距离，反中仍按单目标响应。全弹总伤续航不乘敌人数量。</p>');
  }
  const fireModes=ordinaryModes(r.facts).filter(m=>m.element==='Fire'||m.explosion?.element==='Fire'
    ||m.direct_status_effects?.some(e=>e.id==='Fire')||m.explosion?.status==='Fire');
  if(fireModes.length||r.facts.ground_fire) {
    parts.push('<h3>火焰：直击、挂火与地火接触</h3><p>Fire元素直击与Fire持续燃烧分别结算，并应用目标火伤倍率；同一目标只保留一份同种Fire持续伤害，地火接触不再额外叠一层Fire。燃烧弹按连续射击积累状态强度，达到已知目标阈值才挂火；换弹等长间隔保守清空积累。未知阈值不套用激光0.15秒。舰船火伤倍率只应用一次。下表为名义组件值，实际伤害还受护甲、耐久和剩余血量约束。</p>');
    if(fireModes.length)parts.push(table(['模式','直击/爆炸元素','单位直击肉伤/耐伤','Fire基础DPS/最长持续','挂火依据'],fireModes.map(m=>{
      const fire=m.direct_status_effects?.find(e=>e.id==='Fire')??m.status_applications?.find(e=>e.id==='Fire')?.effect
        ??r.facts.effects?.find(e=>e.id==='Fire');
      return [m.mode_id,`${m.element??'非Fire'} / ${m.explosion?.element??'无Fire爆炸'}`,`${m.direct_damage_unresolved?'未知':m.normal??'待补'} / ${m.direct_damage_unresolved?'未知':m.durable??'待补'}${m.status_only_lower_bound?'（仅挂火下界）':''}`,
        `${fire?.normal??'待补'} / ${seconds(fire?.duration_s*1000)}`,isSpray(m)?`喷流普通轻甲接触${seconds(m.ignition_policy?.contact_ms)}`:'来源状态强度与目标点燃阈值'];
    })));
    if(fireModes.some(m=>m.status_only_lower_bound))parts.push('<p>部分喷流直伤尚未知，当前仅计已绑定的挂火下界；不能把直伤占位值解释为真实零DPS，也不代表完整武器能力。</p>');
    if(fireModes.some(m=>m.service_conversion?.includes('UNDERBARREL_FIRST_CANISTER')))parts.push('<p>司炉下挂喷流目前采用首罐燃料和来源对照所得的候选伤害；装填与补给仍待确认，不代表完整续航。</p>');
    const sprays=fireModes.filter(isSpray);
    if(sprays.length) {
      parts.push('<p>喷流普通小虫按用户0.1～0.2秒接触挂火，主表取150ms；燃料积分步长与点火预热均不是挂火阈值。此用户时长不直接外推到中重甲或自动背包/炮塔；其他目标若有估计，采用明确标注的状态强度积分。</p>');
      parts.push(table(['喷流模式/轻甲目标','每只喷射时间','单份Fire已计伤害','最后停喷/死亡'],sprays.flatMap(m=>
        (r.capabilities.modes.find(c=>c.mode_id===m.mode_id)?.chaff?.entries??[]).map(e=>[
          `${m.mode_id} / ${e.target_id}`,seconds(e.btk*m.work_ms),score(e.resolution?.main_damage.fire_before_death),
          `${seconds(e.resolution?.last_shot_ms)} / ${seconds(e.resolution?.death_ms)}`]))));
    }
    if(r.facts.ground_fire) {
      const g=r.facts.ground_fire;
      parts.push('<p>地火按用户确认的“接触即挂火”处理。只有明确接触点才计入；未知地火范围不能借用爆炸半径，未知持续时间不填数，也不追加独立地火DPS。</p>');
      parts.push(table(['地火来源组件','来源持续时间','独立地火半径','接触/叠加口径'],[[
        g.producer_component_id,seconds(Number.isFinite(g.duration_s)?g.duration_s*1000:null),Number.isFinite(g.radius_m)?`${g.radius_m}米`:'未知；不借爆炸范围',g.scope]]));
    }
    const fireAreas=areaModes.filter(m=>{const f=m.chaff.area.fire;return f&&(f.damage>0||f.applications>0||f.explicit_ground_contacts>0);});
    if(fireAreas.length)parts.push(table(['范围模式','Fire已计伤害','挂火应用次数','明确地火接触次数','记账口径'],fireAreas.map(m=>{
      const f=m.chaff.area.fire;return [m.mode_id,score(f.damage),f.applications,f.explicit_ground_contacts,f.policy];
    })));
  }
  const cloudModes=r.capabilities.modes.filter(m=>m.chaff?.cloud);
  if(cloudModes.length) {
    parts.push('<h3>毒气云：持续暴露与有限铺设</h3><p>单云25基础DPS按连续暴露结算，重叠云不叠毒伤，不额外赠送离云残留。初铺、续铺和补射都消耗本装备弹药。混乱的杀伤与减压收益分开：控制按存活敌人的受控时间降低敌群压力，仅在清杂原始比值中折算一次，不增加DPS、击杀数，也不缩短实际死亡时间。手雷随后仍乘有限补给覆盖价值。</p>');
    parts.push(table(['模式/来源组件','来源半径','连续暴露/基础DPS','初铺/续铺/总耗弹','控制持续','本波全部死亡估时','工程间距/几何'],cloudModes.map(m=>{
      const c=m.chaff.cloud;return [`${m.mode_id} / ${c.source_component}`,`${c.radius_m}米`,`${c.exposure_seconds}秒 / ${c.damage_per_second}`,
        `${c.initial_clouds} / ${c.refresh_clouds} / ${c.own_ammo_rounds}`,seconds(c.control?.duration_s*1000),seconds(m.chaff.neutralized_at_ms),
        `${c.spacing_m??'按声明接触点'} / ${c.geometry??'声明有限接触场景'}`];
    })));
    parts.push(table(['模式','暴露口径','几何/接触限制'],cloudModes.map(m=>[m.mode_id,m.chaff.cloud.policy,m.chaff.cloud.conditions?.join('；')])));
    const controlled=cloudModes.filter(cloudPressure);
    if(controlled.length)parts.push(table(['模式','无控制基准/控制覆盖（敌人·秒）','受控残余压力比例','减少的累计敌人·秒','清杂原始比值倍率','控制口径'],controlled.map(m=>{
      const p=cloudPressure(m);return [m.mode_id,`${score(p.uncontrolled_enemy_ms/1000)} / ${score(p.controlled_enemy_ms/1000)}`,
        score(p.residual_threat_fraction),score(p.avoided_enemy_ms/1000),`×${p.score_ratio_gain?.toFixed(4)??'待补'}`,p.basis];
    })));
    parts.push('<p>普通完整敌人的混乱残余压力暂取50%，是工程起点；没有套用指挥官爆头后的10%。控制可降低压力，但不代表硬控、额外击杀或立即安全，已出手攻击也不保证被打断。</p>');
    parts.push('<p class="note">来源半径只约束接触场景。敌人间距、每片云覆盖目标数与持续留在云内均为工程假设，不是Wiki实测；未模拟云增长和敌人离场。</p>');
  }
  const strategic=r.strategic_profile?assessStrategic(r,model,{selected_roles:['chaff','anti_medium','anti_heavy']}):[];
  const pressure=strategic.filter(a=>a.contribution.efficiency?.pressure);
  if(pressure.length)parts.push('<h3>毒气混乱：压力指标修正</h3><p>混乱只修正裸能力指标，未增加伤害、击杀数或覆盖工作时间；目标持续接触和剩余压力是工程条件，结果为候选。范围采用声明的紧凑间距与内外圈，不能视作实战命中保证。</p>',
    table(['职责','未控制压力（敌人·秒）','减少压力（敌人·秒）','裸指标倍率'],pressure.map(a=>{
      const c=a.contribution,p=c.efficiency.pressure;
      return [roleNames[a.role],score(p.uncontrolled_enemy_ms/1000),score(p.avoided_enemy_ms/1000),
        Number.isFinite(c.pressure_index_multiplier)?`×${c.pressure_index_multiplier.toFixed(4)}`:'待补'];
    })));
  const adjusted=strategic.filter(a=>a.contribution.combat_adjustment);
  if(adjusted.length)parts.push('<h3>红绿战斗能力附加修正</h3><p>此项在原有曲线、覆盖价值和分类系数之后另乘；人工校准替换最终加值，不再重复乘系数。</p>',
    table(['职责','额外系数','自动最终加值'],adjusted.map(a=>{const c=a.contribution;return [roleNames[a.role],c.combat_adjustment.factor,
      points(c.score_origin==='MANUAL_CALIBRATED'?c.calculated_value:c.value)];})));
  if(r.strategic_profile?.family==='eagle') {
    parts.push('<h3>飞鹰：有限杀伤与回转</h3><p>每轮杀伤Q最多计当次敌群，不把同一只怪的过杀重复记账。将Q除以同职责参照武器的处理速率，得到省下的工作时间T；覆盖价值V=NT/[NT+大CD+延迟+(N−1)×max(小CD,延迟)]。N是整备前可用次数，次数只进入V一次。最终加值=曲线后基分×V×分类兑现系数k×上列额外战斗系数。T不是飞鹰真实持续时间；这是待验收的工程价值函数。</p>');
    parts.push(table(['职责','一轮有效工作量/敌群上限','基分','次数/小CD/大CD/延迟','工作时间T','V','k','自动加值'],
      strategic.map(a=>{const c=a.contribution,p=c.profile;return [
        roleNames[a.role],c.physical?`${c.physical.capacity.toFixed(2)} / ${c.physical.single_pass_target_limit}`:'待补',score(c.bare_score),
        p?`${p.uses} / ${p.small_cd_s}s / ${p.cooldown_s}s / ${p.delay_s}s`:'待补',seconds(c.physical?.effective_work_s*1000),
        c.coverage_value?.toFixed(4),c.realization_factor,points(c.score_origin==='MANUAL_CALIBRATED'?c.calculated_value:c.value)];})));
  }
  const laser=r.facts.service_modes?.find(m=>m.ignition_policy&&!isSpray(m)&&m.service_conversion?.includes('CONTINUOUS_50MS_INTEGRAL'));
  if(laser) {
    parts.push('<h3>光束挂火与转火</h3><p>普通轻甲按用户给出的0.1～0.2秒持续接触挂火，主表取0.15秒。燃烧从点燃时起最多3秒、同种不叠加，不再额外赠送转火后的刷新。50ms只是伤害/热量积分步长。清杂允许挂火后转火；近防选择四只Hunter实际解除威胁更快的射击方案。中重甲与自动背包/炮塔不套用这个轻甲时长。</p>');
    const cap=r.capabilities.modes.find(m=>m.mode_id===laser.mode_id);
    if(cap?.chaff?.entries)parts.push(table(['轻甲目标','每只照射时间','燃烧总伤（含照射期间）','最后一只停射/死亡'],cap.chaff.entries.map(e=>[
      e.target_id,seconds(e.btk*laser.work_ms),e.resolution?.main_damage.fire_before_death?.toFixed(1),
      `${seconds(e.resolution?.last_shot_ms)} / ${seconds(e.resolution?.death_ms)}`])));
    if(cap?.close_defense)parts.push(`<p>近防四只Hunter：照射结束${seconds(cap.close_defense.first_to_last_ms)}，全部解除威胁${seconds(cap.close_defense.neutralized_at_ms)}。燃烧不作为硬控；续航仍按名义全弹总伤。</p>`);
    const variants=laserSensitivity?.find(x=>x.equipment_id===r.equipment_id)?.variants;
    if(variants)parts.push(table(['挂火时间假设','清杂分','近防分','四只Hunter死亡时间'],variants.map(v=>[
      v.contact_ms===null?'仅直击':seconds(v.contact_ms),points(v.scores.chaff),points(v.scores.close_defense),seconds(v.close_neutralized_ms)])));
  }
  parts.push('<h3>反重</h3>');
  parts.push(`<p>反重分：<span data-effective-score="anti_heavy">${final(h)}</span>。直击或爆炸先达到重穿门槛（当前数据AP4），低于门槛默认0；附带火毒的穿甲与特殊轻甲弱点不能绕过门槛，用户明确确认的稳定反重手段单独保留。达到门槛后按两只20秒的实际用时与库存评分，穿甲本身不保证及格。已知样本取平均，覆盖${h.scored_targets??'—'}/${h.total_targets??'—'}类另列，不能代表所有重甲都能处理。以下为自动计算依据；人工校准只替换显示及计分值。</p>`);
  if(h.eligibility)parts.push(`<p>已知直击/爆炸最高AP：${esc(h.eligibility.max_penetration)}；${h.eligibility.state==='BELOW_THRESHOLD'?'低于重穿，常规反重为0':h.eligibility.state==='ELIGIBLE'?'具备参与反重计算的条件':'穿甲资料仍待补'}。</p>`);
  if(h.incidental_routes?.length)parts.push('<p>以下是仍能处理特定弱点的战例，仅作说明，不计反重分，也不用于整套反重过线。</p>',table(['目标','条件','每只耗弹'],h.incidental_routes.map(x=>[targetNames[x.target_id],x.condition,x.rounds])));
  if(h.cases)parts.push(table(['目标（两只/20秒）','每只耗弹','打点条件','仅满弹','一盒公共','一盒条件下耗时'],h.cases.map(c=>[
    targetNames[c.target_id],c.best?.route.rounds,c.best?.route.condition??'暂无已接入路线',status[c.best?.initial.status]??'待接',status[c.best?.public.status]??'待接',seconds(c.best?.public.elapsed_ms)])));
  if(h.cases)parts.push(table(['反重目标','仅满弹分','一盒公共分','完整两只耗时（不截断20秒）'],h.cases.map(c=>[
    targetNames[c.target_id],points(c.best?.scoring.initial.score),points(c.best?.scoring.public.score),
    seconds(c.best?.scoring.public.pair_time_ms)])));
  else if(h.assessment) {
    const c=h.assessment.contribution;
    parts.push(table(['条件反重加值','曲线后基分','CD覆盖价值','分类系数','手动操作系数','能力边界'],[[
      points(c.value),c.bare_score?.toFixed(2),c.coverage_value?.toFixed(4),c.realization_factor,c.operation_factor,
      c.status==='KNOWN'?'按主体血量的压力估计；不作20秒稳定双杀证明':c.reason]]));
  } else parts.push(`<p>${h.state==='KNOWN_ZERO'?'该装备没有直接反重贡献。':'反重路线未接通，不能解释为已验证的零分。'}</p>`);
  const rating=e.rating;
  const throwable=rating?.kind==='THROWABLE_AVAILABLE_USES';
  parts.push(throwable?'<h3>续航：携带与有限补给颗数</h3>':'<h3>续航：全弹总伤</h3>');
  if(throwable){
    const p=rating.curve;
    parts.push(`<p>续航分：<span data-effective-score="endurance">${final(e)}</span>。按颗数计，不乘伤害、毒云或燃烧。用户参照为携带${p.reference_carried}颗＋一盒补${p.reference_replenished}颗＝显示${p.reference_display_score}分。计分量W＝携带颗数×${p.carried_weight}＋实际有限补给颗数×${p.replenished_weight}，参照W＝${rating.reference_weighted_uses}；补给权重2是可调工程起点，用户只确认它应高于携带权重。真实可用颗数不加权。</p>`);
    parts.push('<p>各情境独立计算，按消耗后取用补给，不把已满库存丢失的补给额外送入。补包4盒，公共补给至多再恢复1盒补包；补车8盒。手雷次数续航暂单列，不与枪械总伤续航混算；整套续航采用下方主力＋备用公式。烟雾等效用物品有库存不代表有战斗收益。</p>');
    parts.push(table(['情境','原携带','有限补充','实际可用颗数','计分量W（非颗数）','续航分'],Object.entries(rating.scenarios).map(([k,v])=>[
      cases[k],v.carried,v.replenished,v.rounds,v.weighted_uses,points(v.score)])));
    if(e.modes?.length)parts.push('<h4>名义伤害诊断（不参与手雷续航分）</h4>');
  }else parts.push(rating?.kind==='USER_RED_GREEN_ZERO'?'<p>按用户规则，红绿战备续航统一为0。下面的载荷信息只用于其他战斗能力。</p>':`<p>续航分：<span data-effective-score="endurance">${final(e)}</span>。只按总弹量×单发基础伤害计算，已绑定直击与爆炸合计一次，肉伤用于换分、耐伤单列。不查敌人、不算击杀耗弹，不使用清杂/反中/反重职责。暂以解放者满弹＋一盒公共的${rating?.reference_standard_damage??'待查'}肉伤总量为内部基分60（新尺度55.38）；令r=D/D参照，S=105r^1.15/(r^1.15+0.75)，参照附近斜率提高15%。这是工程显示刻度。</p>`);
  if(rating?.scenarios&&rating.kind!=='USER_RED_GREEN_ZERO'&&!throwable)parts.push(table(['情境','可用弹量','肉伤总量','耐伤总量','续航分','已计弹池 / 模式','完整性'],Object.entries(rating.scenarios).map(([k,v])=>[
    cases[k],v.renewable?'可再生':v.rounds,v.standard_damage,v.durable_damage,v.reason==='REQUIRED_AMMO_BACKPACK_CONFLICT'?'互斥':points(v.score),
    `${v.independent_accounts?.join('、')??'待补'} / ${v.mode_ids?.join('、')??v.mode_id??'待补'}`,v.partial?'部分弹池已计；仍有缺项':v.reason?'待补或互斥':'已绑定弹池'])));
  if(rating?.kind==='FIRST_CYCLE_TOTAL_DAMAGE')parts.push(table(['首轮可调用','首轮肉伤总量','首轮耐伤总量','续航分'],[[rating.calls,rating.standard_damage,rating.durable_damage,points(rating.score)]]));
  if(rating?.kind==='SUPPLY_TOTAL_DAMAGE_REFERENCE')parts.push(`<p>供给参照：在解放者上增加这件有限供给，可用${rating.supplied?.rounds??'待查'}发、${rating.supplied?.standard_damage??'待查'}肉伤总量。不是无限补给保证；实际组合仍检查背包互斥。</p>`);
  if(e.modes?.length)parts.push(table(['模式','已装/总弹量','每盒公共补充','满弹肉伤/耐伤','一盒后肉伤/耐伤','换弹/冷却'],e.modes.map(m=>[
    m.mode_id,`${m.loaded}/${m.renewable?'可再生':m.total_rounds??'待查'}`,m.one_public_box_rounds,
    `${m.full_stock_standard_damage??'—'}/${m.full_stock_durable_damage??'—'}`,`${m.plus_one_box_standard_damage??'—'}/${m.plus_one_box_durable_damage??'—'}`,seconds(m.reload_or_cooldown_ms)])));
  for(const t of e.combat_trials??[]) {
    parts.push(`<h4>独立战斗诊断（不参与续航分）：${t.role==='chaff'?'清杂：28只轻甲一波':'反中：8只中型一波'}，每波${esc(t.rounds_per_wave)}发</h4>`);
    if(t.scenarios)parts.push(table(['情境','完整波数','完成动作/每波动作','结果','耗时','取补给次数'],Object.entries(t.scenarios).map(([id,v])=>[
      cases[id],v.completed_waves===undefined?'—':`${v.probe_completed?'≥':''}${v.completed_waves}`,`${v.completed_actions??'—'}/${t.actions_per_wave}`,
      status[v.status]??v.status,seconds(v.elapsed_ms),v.supplies_taken?.length??'—'])));
    else parts.push('<p>该职责尚未形成可执行的有限弹药计划。</p>');
  }
  if(e.state==='STRATEGIC_CYCLE')parts.push(table(['单次载荷','本轮可调用','单次肉伤/耐伤总量','连续工作估时','大CD/小CD','生效延迟'],[[
    e.units_per_deployment,e.first_cycle_calls,`${e.full_deployment_standard_damage??'待补'}/${e.full_deployment_durable_damage??'待补'}`,
    e.uninterrupted_fire_s?`${e.uninterrupted_fire_s.toFixed(2)}秒`:'待查',`${e.cooldown_s??'待查'}/${e.small_cd_s??'—'}秒`,`${e.delay_s??'待查'}秒`]]));
  if(e.state==='SUPPLY_PROVIDER')parts.push(`<p>${e.charges}盒有限补给，缺资源时才取用；收益在所补武器和整套账目中计算。补车炮塔不计。</p>`);
  parts.push('<p class="note">总伤是已绑定直击＋爆炸的名义伤害；破片潜力和持续伤害条件仍单列，未假定所有碎片命中或无限群伤。共享同一弹池的模式只取该池最佳模式；彼此独立弹池可相加，未绑定的弹池保留缺项。红绿续航恒为0，CD和兑现系数仍作用于其他战斗能力。上面的战斗诊断不参与续航分，各次资源独立。补包/补车情境仍只带一盒公共补给。</p>');
  parts.push('<h3>拆迁：5个不同普通虫洞</h3>');
  parts.push('<p>单次直击或单次爆炸的拆迁力≥40，默认具备拆迁能力；不把两个组件或多次命中的拆迁力相加。原有洞内爆炸≥20、洞内任意≥30的条件仍保留，绿色战备恒0。具备能力与库存能拆几洞分开判断。</p>');
  parts.push(`<p>拆迁分：<span data-effective-score="demolition">${final(d)}</span>${d.score_lower_bound?'（计算探测下界）':''}。S（可完成洞数÷5）；5洞内部基分60（新尺度55.38），10洞内部基分92.73，20洞100分；物理门槛仍是5洞。只用首轮资源，不等大CD；未引入未确认的跑图速度加分。</p>`);
  if(d.best?.scoring)parts.push(table(['情境','可完成洞数','拆迁分'],['initial','public'].map(k=>[
    cases[k],`${d.best.scoring[k].lower_bound?'≥':''}${d.best.scoring[k].completed_actions}`,points(d.best.scoring[k].score)])));
  if(d.best)parts.push(table(['路线','每洞消耗','仅满弹','一盒公共','限制'],[[
    d.best.route.route==='outside'?'洞外直接作用':'投射物进入洞内',d.best.route.rounds,
    `${d.best.initial.completed_actions}/5`,`${d.best.public.completed_actions}/5`,r.strategic_profile?'每次调用只计1洞，不等大CD再次可用':'只计已绑定供弹的组件，不借用子组件库存'] ]));
  else parts.push(`<p>${d.state==='KNOWN_ZERO'?(r.category==='deployable'?'绿色战备按用户规则恒为0。':'已知组件不具备普通虫洞拆迁条件。'):d.capability?.qualifies?'已具备拆迁能力；库存或供弹绑定仍待补，尚不能给出五洞库存分。':'拆迁能力资料尚未接通，不能当成零分或通过。'}</p>`);
  if(d.best?.route.inventory_only)parts.push('<p>此项只核算首轮有限库存：每次调用或每份炸药记一洞，不赠送多洞，也不等待大CD。未使用或编造装填、起爆时间，不提供完成耗时。</p>');
  if(d.candidates?.length)parts.push(table(['攻击组件','拆迁力','组件类别'],d.candidates.map(c=>[c.component_id,c.force,c.attack_type])));
  return parts.join('');
}
function routineEnduranceReview(model,results) {
  if(!results.length)return '';
  const name=id=>model.equipment.find(r=>r.equipment_id===id)?.name??id??'待定';
  return '<section id="loadout-endurance-review"><h2>整套常驻续航：主力＋备用</h2>'
    +'<p>每把常驻枪沿用一盒公共补给基线与人工校准。清杂、近防、反中各以60为参照截到0～1，再按60%／30%／10%合成适配度q；每枪有效贡献＝q×单件续航。常态分＝最高贡献＋其余贡献的35%，最高100分。权重是可调工程起点，q不是使用时间或命中率。手雷次数独立；红绿不拖平均。携带补包或补车时，最终续航补到至少100；两者不重复加分，原本超过100不降低。</p>'
    +'<p>明确保留反重的装备退出常态枪池；人工整件加值在末尾只加一次。补给不改动单枪续航，人工0保持0。最终续航100不等于真实无限弹药，有限补给次数与资源门槛仍单独检查。未知数据保留缺口；没有新增续航分数硬门槛，物理检查仍独立。</p>'
    +'<p class="note">下表是当前保存数据的计算结果。修改人工评分后刷新页面，可查看重新生成的整套结果。<a href="/docs/loadout-v3-endurance-algorithm.md">查看公式与边界说明</a></p>'
    +table(['示例配装','常态汇总','补给修正前（含人工加值）','最终续航','主力贡献项'],results.filter(r=>r.endurance_assessment).map(r=>[
      r.name,score(r.endurance_assessment.score),score(r.dimensions.endurance.supply_adjustment?.before_score??r.dimensions.endurance.score),
      score(r.dimensions.endurance.score)+(r.dimensions.endurance.lower_bound?'（下界）':''),name(r.endurance_assessment.primary_id)]))
    +results.filter(r=>r.endurance_assessment).map(r=>'<details><summary>'+esc(r.name)+'：计算明细</summary>'
      +table(['常驻武器','单件续航E','适配度q','主力候选贡献V'],r.endurance_assessment.items.map(i=>[
        name(i.equipment_id),score(i.score),score(i.suitability.value),score(i.value)]))
      +`<p>主力贡献${score(r.endurance_assessment.primary_value)}＋折后备用${score(r.endurance_assessment.backup_value)}。`+(r.dimensions.endurance.supply_adjustment?'携带补包或补车，末尾将最终续航补到至少100分。':'未触发补包/补车最终分修正。')+'真实有限资源单独检查，不按这个分数发放弹药。</p></details>').join('')+'</section>';
}
export function renderSixDimensions(model,records,laserSensitivity=[],results=[]) {
  const categories={primary:'主手',secondary:'副手',throwables:'手雷',support:'支援武器',backpack:'背包',orbital:'轨道',eagle:'飞鹰',deployable:'绿战备',vehicle:'载具'};
  const body=records.map(x=>{
    const r=model.equipment.find(r=>r.equipment_id===x.id);
    return `<tbody data-equipment-id="${esc(r.equipment_id)}" data-search="${esc(`${r.name} ${r.equipment_id}`.toLowerCase())}" data-category="${esc(r.category)}"><tr><th><button class="expand" aria-expanded="false">${esc(r.name)} <small>查看明细</small></button><button class="edit" data-edit-score="${esc(r.equipment_id)}">校准</button></th>${x.cells.map((c,i)=>`<td data-score-role="${SCORE_ROLES[i]}">${esc(cellWithKind(r,c,i))}</td>`).join('')}</tr><tr class="detail" hidden><td colspan="7">${details(r,laserSensitivity,model)}</td></tr></tbody>`;
  }).join('');
  const editorData=JSON.stringify(records.map(x=>{const r=model.equipment.find(r=>r.equipment_id===x.id);
    return {id:x.id,name:r.name,base:Object.fromEntries(Object.entries(r.calculated_scores).map(([k,v])=>[k,rescaleScore(v,model.scenario.score_scale)])),
      score_scale_id:model.scenario.score_scale?.id,default_kinds:Object.fromEntries(SCORE_ROLES.map(role=>[role,contributionKind(r,role,{automatic:true})])),
      locks:lockedScoreRoles(r),cells:x.calculated_cells};})).replaceAll('<','\\u003c');
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>七槽配装 · 六维验收</title><style>
  :root{color-scheme:dark}body{margin:0;background:#11151b;color:#e6edf3;font:15px/1.6 system-ui,"Microsoft YaHei",sans-serif}main{max-width:1600px;margin:32px auto;padding:0 24px}h1{font-size:26px}h2,h3{font-size:18px}p{max-width:1200px}.note,small{color:#a5b3c2}input,select,button{font:inherit;background:#1c2633;color:inherit;border:1px solid #44556a;border-radius:6px;padding:8px}input{width:min(420px,60vw)}button{cursor:pointer}button.expand{background:transparent;border:0;text-align:left;padding:0}small{display:block;font-size:12px}.filters{position:sticky;top:0;z-index:3;background:#11151b;padding:12px 0;display:flex;gap:12px;align-items:center}.scroll{overflow:auto}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #303b4a;padding:11px 12px;text-align:left;vertical-align:top}thead{background:#202c3a}#pool{min-width:1150px}#pool>tbody>tr:first-child:hover{background:#192332}.detail>td{background:#17212d;padding:20px}.detail table{font-size:14px}.detail th{color:#b9d4f3}[hidden]{display:none!important}.pill{color:#f5d884}a{color:#8ac9ff}
  .edit{font-size:12px;margin-top:8px;padding:2px 8px;display:block}.manual-value{color:#8ee3bb}dialog{width:min(700px,90vw);border:1px solid #52677e;border-radius:12px;background:#17212d;color:inherit;padding:24px}dialog::backdrop{background:#0009}#score-fields{display:grid;grid-template-columns:1fr 1fr;gap:14px}.score-field{display:flex;flex-direction:column;gap:6px}.score-field input{width:auto}.score-field small{font-size:12px}textarea{width:100%;box-sizing:border-box;background:#11151b;color:inherit;border:1px solid #52677e;font:inherit}dialog .actions{display:flex;gap:10px;justify-content:flex-end;margin-top:20px}#score-editor-status{min-height:48px}button:disabled{opacity:.5}input:disabled{opacity:.5}.manual-tools{display:flex;gap:16px;align-items:center;flex-wrap:wrap}@media(max-width:600px){#score-fields{grid-template-columns:1fr}.filters{flex-wrap:wrap}}
  </style><main><h1>七槽配装 · 六维验收</h1><p class="pill">新尺度：旧65分对应现在60分，旧60分约为55.38分；0、100和105保持原值。及格线仍显示60，实际门槛已提高。人工输入直接采用新尺度。</p><p class="pill">200件逐项展示。六项均使用分数；仍缺资料的项目保留待补。工程估计，正式随机尚未启用。</p><p>战斗能力与拆迁沿用原曲线；枪械续航单独简化为全弹总伤映射：令r=D/D参照，S=105r^1.15/(r^1.15+0.75)。公式先生成内部基分，再完成上述刻度换算；下方展开的中间计算值仍标作基分。六项不能互相抵账。</p><p>反重先过重穿AP4门槛，低于默认0；再按两只20秒与有限库存计分，覆盖情况单列；枪械续航只看总弹量×单发基础伤害，以解放者满弹加一盒公共总伤暂作内部基分60（新尺度55.38）参照，肉伤换分、耐伤单列；拆迁以首轮五洞为参照，绿战备恒为0。红绿的战斗能力分包含CD和分类修正；红绿续航统一为0，不因飞鹰次数增加续航分。</p><p>手雷续航按携带颗数与有限补给颗数计分，以4携带＋一盒补2为60分；补给权重暂取携带的2倍，不乘伤害。反重、拆迁将各件最终分直接相加，不作总分压缩；真实弹药、20秒双重甲与五洞检查仍独立保留。手雷次数暂不混入枪械续航，整套常驻续航采用下方主力＋备用公式。</p><p>点击装备可看逐目标分数、补给变体、肉伤/耐伤总量和完整耗时。续航不使用敌人、打点、BTK、击杀波数、DPS或换弹时间。其他战斗诊断单独保留，不参与续航分。反重不按覆盖种类折分；低穿甲弱点战例不计反重分，缺目标不能当作全目标通过。</p><p>爆炸清杂默认紧凑敌群（1.5米工程间距，另列3米对照），已接内外圈伤害。飞鹰每轮按有限敌群杀伤核算省下的工作时间，再结合次数、小CD、大CD和延迟计算末尾加值。</p><div class="manual-tools"><button id="export-manual-scores">导出人工校准记录</button><span id="manual-count" aria-live="polite">正在读取人工评分…</span></div><p class="note">点击“校准”可直接改六项最终分，原始计算值和修改历史会保留。留空并保存可恢复自动值；红绿续航、绿色拆迁等已确认零值仍固定。人工分不代表补齐了资料，也不改变伤害、弹药或互斥检查。</p>${routineEnduranceReview(model,results)}<div class="filters"><input id="search" aria-label="搜索装备" placeholder="搜索装备名称或编号"><select id="category" aria-label="装备类别"><option value="">全部类别</option>${Object.entries(categories).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select><span id="count">200件</span></div><div class="scroll"><table id="pool"><thead><tr>${['装备','清杂','近防','反中','反重','续航：一盒公共','拆迁：五洞'].map(s=>`<th>${s}</th>`).join('')}</tr></thead>${body}</table></div></main>
  <dialog id="score-editor" aria-labelledby="score-editor-title"><form><h2 id="score-editor-title">装备评分</h2><p><label>计分方式 <select name="mode" aria-label="计分方式"><option value="auto">跟随装备默认</option><option value="base">单件能力：常规能力取最高值</option><option value="additive">套装加值：各维加到整套末尾</option></select></label></p><p class="note">套装加值不再同时占用单件能力分；空白分数沿用自动值。反重与拆迁在任何模式下均逐件相加；手雷次数续航暂单列。输入按当前新尺度保存，人工分不会再乘CD或分类系数。恢复计算值也会恢复默认方式。</p><div id="score-fields"></div><p><label>备注（可选）<textarea name="note" maxlength="1000" rows="2"></textarea></label></p><p id="score-editor-status" aria-live="polite"></p><div class="actions"><button id="score-editor-reset" type="button">恢复计算值</button><button id="score-editor-close" type="button">关闭</button><button type="submit">保存评分</button></div></form></dialog>
  <script type="application/json" id="manual-score-data">${editorData}</script><script type="module" src="/scripts/manual-score-editor.mjs"></script><script>
  const groups=[...document.querySelectorAll('#pool>tbody')],q=document.querySelector('#search'),c=document.querySelector('#category');
  function filter(){let n=0;for(const g of groups){g.hidden=!(g.dataset.search.includes(q.value.trim().toLowerCase())&&(!c.value||g.dataset.category===c.value));if(!g.hidden)n++;}document.querySelector('#count').textContent=n+'件';}q.addEventListener('input',filter);c.addEventListener('change',filter);document.querySelectorAll('.expand').forEach(b=>b.addEventListener('click',()=>{const d=b.closest('tbody').querySelector('.detail');d.hidden=!d.hidden;b.setAttribute('aria-expanded',String(!d.hidden));}));
  </script></html>`;
}
