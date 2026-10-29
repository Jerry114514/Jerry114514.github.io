import {DIMENSIONS, SLOTS, profileReady, equipmentIDs, withinExosuitLimit} from '../engine/common.mjs';
import {replaceAt} from '../engine/sampling.mjs';
const CN = {anti_heavy:'反重', chaff:'清杂', sustain:'续航', anti_medium:'反中', close_defense:'近防', demolition:'拆迁'};
const LABEL = {primary:'主手', secondary:'副手', grenade:'手雷'};
const TEXT = {CERTIFIED:'已通过六维及格线', UNVERIFIED:'未认证 · 纯随机', FAIL_PROVED:'已证明失败', UNKNOWN_DATA:'资料不足', UNKNOWN_COVERAGE:'打法覆盖不足', PROFILE_NOT_CERTIFIED:'场景尚未校准，暂不能认证', PRODUCTION_NOT_CERTIFIED:'该配装未通过六维及格线', CONTEXT_BLOCKED:'认证场景资料或政策未就绪，本轮已停止（不做无限重扫）', EMPTY_SLOT_POOL:'可选装备不足，请检查排除设置', INVALID_LOCKS:'锁定与候选池冲突', ATTEMPTS_EXHAUSTED:'本轮未找到可认证配装，可继续新一轮', NO_CERTIFIABLE_LOADOUT:'已检查全部候选，当前模型下无可认证配装', NO_LEGAL_LOADOUT:'当前条件下没有合法配装', NO_LEGAL_REPLACEMENT:'该槽位没有符合选取规则的替代装备', CANCELLED:'已取消', REQUEST_INVALIDATED:'输入已改变，旧结果已作废', INVALID_INPUT:'输入或模型不完整'};
Object.assign(TEXT,{QUALIFIED:'旧标尺达线 · 不作新版合格依据',REJECTED:'旧标尺未达线或装备互斥',DEPENDENCIES_REQUIRED:'评价资料尚不完整',NO_QUALIFIED_LOADOUT:'旧模型在当前约束下未找到达线配装'});
Object.assign(TEXT,{ASSESSMENT_PASS:'通过当前规则 · 待实战验收',NO_ACCEPTABLE_LOADOUT:'已检查全部候选，当前条件下没有通过新版检查的配装；可解除锁定或扩大装备池'});
const REASONS = {CALIBRATION_EVIDENCE_MISSING:'缺少场景校准证据', SCENARIO_FACTS_UNVERIFIED:'场景引用的事实尚未核实', UNMODELED_UNAVOIDABLE_EFFECT:'选中装备带有尚未建模的强制效果', INITIAL_SLOT_NOT_IN_LOADOUT:'场景预设槽位越出当前配装', MODEL_VERSION_CHANGED:'资料与评价标准版本不一致，请重新加载资料', MODEL_RELOADED:'资料已重新加载，旧请求作废', SLOT_LOCKED:'该槽位已锁定', LOCKED_LOADOUT_MISMATCH:'当前配装与锁定设置不一致', PRODUCTION_DEPENDENCIES:'该配装的生产资料不完备（计为资料未知，不算不及格）', PRODUCTION_DATA_UNAVAILABLE:'生产资料层尚未发布，已按预检报告停止而不是反复重扫', PRODUCTION_CONTEXT_INCOMPLETE:'生产上下文不完备（全局资料或政策缺口）'};
const DIM_STATUS = {UNKNOWN_DATA:'资料不足', UNKNOWN_COVERAGE:'打法覆盖不足', FAIL_PROVED:'已证明失败', INVALID_INPUT:'输入不完整', BLOCKED:'被阻断'};
Object.assign(DIM_STATUS,{PASS:'达线',FAIL:'未达线',UNKNOWN:'资料不足'});
Object.assign(DIM_STATUS,{ADVISORY:'参考分'});
const reasonNote = value => {
  if (!value) return '';
  const bits = [];
  if (REASONS[value.reason]) bits.push(REASONS[value.reason]);
  if (Array.isArray(value.missing_actions) && value.missing_actions.length) bits.push('缺少已验证动作：' + value.missing_actions.join('、'));
  if (Array.isArray(value.equipment_effects) && value.equipment_effects.length) bits.push('未建模效果涉及：' + value.equipment_effects.map(e => typeof e === 'string' ? e : e.equipment_id || e.id).filter(Boolean).join('、'));
  return bits.length ? '（' + bits.join('；') + '）' : '';
};
const caseName = c => (typeof c.title === 'string' && c.title) || c.id;
const caseCover = profile => {
  const map = {};
  for (const c of profile?.cases || []) for (const g of c.goals || []) if (DIMENSIONS.includes(g.dimension)) (map[g.dimension] ||= []).push(caseName(c));
  return map;
};
  const cellNote = cell => cell && [cell.note, cell.summary, cell.detail].find(v => typeof v === 'string' && v);
  const gapNote = gap => {
    if (!gap || gap.status === 'CERTIFIED') return '';
    const bits = [DIM_STATUS[gap.status] || gap.status];
    if (gap.case_id) bits.push(gap.case_id);
    if (Array.isArray(gap.missing_actions) && gap.missing_actions.length) bits.push('缺少已验证动作 ' + gap.missing_actions.length + ' 项');
    return bits.join(' · ');
  };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const SLOT_GLYPH = {primary:'🔫', secondary:'🗡️', grenade:'💣', stratagem:'🚀'};
const slotGlyph = slot => SLOT_GLYPH[slot.startsWith('stratagem:') ? 'stratagem' : slot] || '🎯';
const iconHTML = (e, slot) => {
  const glyph = slotGlyph(slot);
  return e?.icon
    ? `<span class="lo-icon" data-fb="${glyph}"><img src="${esc(e.icon)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.outerHTML='<span class=lo-ic-fb>'+this.parentElement.dataset.fb+'</span>'"></span>`
    : `<span class="lo-icon"><span class="lo-ic-fb">${glyph}</span></span>`;
};
export function mount(root) {
  if (!root || root.dataset.mounted) return;
  const blackBox=root.dataset.presentation==='black-box';
  root.dataset.mounted = 'true'; root.classList.add('hd2-loadout');
  root.innerHTML = `<div class="lo-toolbar"><button data-act="pure" disabled>🎲 七格纯随机</button><button data-act="certified" disabled>${blackBox?'⚖️ 新版平衡抽取':'⚖️ 六维及格随机'}</button>${blackBox?'':'<label>场景 <select data-role="profile" aria-label="场景"></select></label>'}<button data-act="pause" hidden>暂停</button><button data-act="cancel" hidden>取消</button></div><p data-role="profile-note"></p><p class="lo-status" role="status" aria-live="polite">正在加载装备…</p><div class="lo-cards" data-role="cards"></div>${blackBox?'':'<div class="lo-dimensions" data-role="dimensions"></div>'}<details class="lo-pool"><summary>可选装备 / 解锁与排除</summary><input type="search" data-role="search" placeholder="搜索名称或编号" aria-label="搜索可选装备"><button data-act="all">全选</button><div data-role="pool"></div></details>${blackBox?'':'<details><summary>认证详情</summary><pre data-role="certificate">尚无认证结果。</pre></details><p class="lo-foot" data-role="version"></p>'}<dialog data-role="dialog"><div class="lo-dialog-head"><h3>人工替换</h3><button data-act="close-dialog" aria-label="关闭替换列表">关闭</button></div><p>${blackBox?'固定其余六件，自由选择替代装备。换装仅保留最多一台机甲的限制，不重新检查能力或其他装备互斥。':'固定其余六件，自行选择替代装备，不重新检查能力标准。替换后原认证作废。'}</p><div data-role="replacements"></div></dialog>`;
  const find = role => root.querySelector(`[data-role="${role}"]`), button = act => root.querySelector(`[data-act="${act}"]`);
  const status = root.querySelector('.lo-status');
  let catalog, profiles, hash, coverage, production = null, practical = null, assessment = null, current = null, certificate = null, gaps = null, mode = 'pure', locks = {}, excluded = new Set(), request = 0, busy = false, paused = false, purpose = null, replacementSlot = null, loading = false, initRequest = 0, uiExplaining = false;
  const reloadButton=document.createElement('button');reloadButton.dataset.act='reload';reloadButton.textContent='重新加载资料';root.querySelector('.lo-toolbar').append(reloadButton);
  const explainButton=document.createElement('button');explainButton.dataset.act='explain';explainButton.textContent='解释当前配装';explainButton.disabled=true;if(!blackBox)root.querySelector('.lo-toolbar').append(explainButton);
  const worker = new Worker(new URL(root.dataset.evaluator==='assessment'?'../assessment-v2/worker.mjs':root.dataset.evaluator==='practical'?'../practical/worker.mjs':'../worker.mjs', import.meta.url), {type:'module'});
  const byID = () => new Map((catalog?.equipment || []).map(e => [e.id,e]));
  function options(nextMode = mode) { return {mode:nextMode, ...(!blackBox?{profile_id:find('profile').value}:{}), until_success:true, constraints:{excluded:[...excluded].sort(), locks:structuredClone(locks)}}; }
  function say(text, state = '') { status.textContent = text; status.dataset.state = state; }
  function controls() {
    reloadButton.disabled=loading;button('all').disabled=loading;
    if(!blackBox)find('profile').disabled=loading;
    button('pure').disabled = !catalog || busy;
    const p = blackBox?undefined:profiles?.profiles.find(p => p.id === find('profile').value);
    const productionReady = !!(production?.policy_ready);
    button('certified').disabled = !catalog || busy || !(assessment?.ready || practical?.ready || profileReady(p) || productionReady);
    button('certified').textContent=assessment?.ready?'⚖️ 新版平衡抽取':practical?.ready?'⚖️ 旧模型随机（参考）':'⚖️ 六维及格随机';
    button('certified').title = assessment?.ready ? '完整随机七件，未通过继续抽；通过当前评分与物理检查后输出' : practical?.ready ? '旧评分尺度已弃用；此入口保留历史行为，结果不作新版合格依据' : profileReady(p) ? '完整七格配装须全部六维通过'
      : productionReady ? '六维及格线来自已核验的生产政策；资料缺口会在预检时明确报告'
      : '等待游戏版本、场景及格线和路径校准';
    button('pause').hidden = !busy; button('cancel').hidden = !busy && !uiExplaining;
    button('pause').textContent = paused ? '继续' : '暂停';
    explainButton.disabled = !current || busy;
    explainButton.textContent = uiExplaining ? '重新解释' : '解释当前配装';
    find('profile-note').textContent = (assessment?.ready ? '当前规则：清杂、近防达到60，并通过20秒双重甲、五洞、共享资源和近防安全检查。其余分数供参考。换装只检查互斥；修改人工评分后请重新加载资料。结果等待你的实战验收。' : practical?.ready ? '评分体系正在重建。旧模型结果仅作历史参考，不表示达到新版及格线；七格纯随机可用，换装只检查选取规则。' : p && !profileReady(p) ? '虫族机动作战场景待校准。七格纯随机已开放；平衡认证将在版本证据与及格线核验后启用。' : '六项要求分别校验，任何一项缺少证据时整套不认证；强力组合保留抽中机会。') + (coverage?.synthetic ? '当前资料为本地合成检查数据，只用于界面检查，不代表真实游戏平衡。' : '');
    if(blackBox){
      button('certified').title='自动抽取一套配装';
      find('profile-note').textContent='抽取主手、副手、手雷和四个战备。可以锁定装备、调整候选池，或在抽取后自由换装。';
    }
    root.querySelectorAll('[data-slot]').forEach(b => b.disabled = !catalog || loading || busy || b.dataset.act !== 'lock' && isLocked(b.dataset.slot));
    root.querySelectorAll('[data-equipment]').forEach(b=>b.disabled=loading);
  }
  function reload() {
    initRequest=++request;busy=false;paused=false;loading=true;uiExplaining=false;certificate=null;gaps=null;catalog=undefined;profiles=undefined;hash=undefined;coverage=undefined;production=null;practical=null;assessment=null;
    if(find('dialog').open)find('dialog').close();
    say(blackBox?'正在加载装备…':'正在重新校验装备资料，原认证已作废。');renderCards();
    worker.postMessage({type:'init',request_id:initRequest,black_box:blackBox});
  }
  function isLocked(slot) { return slot.startsWith('stratagem:') ? locks.stratagems?.[Number(slot.split(':')[1])] : locks[slot]; }
  function idAt(slot) { return slot.startsWith('stratagem:') ? current.stratagems[Number(slot.split(':')[1])] : current[slot]; }
  function renderCards() {
    const map = byID();
    const card = slot => {
      const e = map.get(idAt(slot)), locked = !!isLocked(slot);
      return `<article class="lo-card${locked ? ' lo-locked' : ''}"><div class="lo-card-main"><span class="lo-slot">${LABEL[slot] || '战备 '+(Number(slot.split(':')[1])+1)}</span><h3>${esc(e?.name || e?.name_en || idAt(slot))}</h3><small>${esc(e?.name_en || e?.id)}</small></div>${iconHTML(e, slot)}<div class="lo-card-actions"><button data-act="lock" data-slot="${slot}" aria-pressed="${locked}">${locked?'🔒 已锁定':'锁定'}</button><button data-act="swap" data-slot="${slot}">随机换一件</button><button data-act="manual" data-slot="${slot}">人工点选</button></div></article>`;
    };
    const placeholder = slot => `<article class="lo-card lo-card-empty"><span class="lo-slot">${LABEL[slot] || '战备 '+(Number(slot.split(':')[1])+1)}</span><span class="lo-empty-mark">${slotGlyph(slot)}</span><small>待抽取</small></article>`;
    const grid = (slots, cls) => `<div class="lo-grid ${cls}">${(current ? slots.map(slot => card(slot)) : slots.map(slot => placeholder(slot))).join('')}</div>`;
    find('cards').innerHTML = `<section class="lo-section"><header class="lo-section-head"><h2>武器装备</h2><span>PRIMARY · SECONDARY · GRENADE</span></header>${grid(SLOTS, 'lo-grid-weapons')}</section><section class="lo-section"><header class="lo-section-head"><h2>战略配备</h2><span>STRATAGEMS · ×4</span></header>${grid([0,1,2,3].map(n => 'stratagem:'+n), 'lo-grid-stratagems')}</section>${current ? '' : '<p class="lo-empty-hint">抽取主手、副手、手雷与四个战备。你可以锁住喜欢的装备，再抽其余位置。</p>'}`;
    if(blackBox){controls();return;}
    const cover = caseCover(profiles?.profiles.find(p => p.id === find('profile').value));
    find('dimensions').innerHTML = DIMENSIONS.map(d => {
      const entry=certificate?.dimensions?.[d]??gaps?.[d];
      const cases = cover[d], note = cellNote(entry) || gapNote(gaps?.[d]);
      const state=certificate?.evidence_grade==='assessment_estimate'?(DIM_STATUS[entry?.status]??'待评价'):certificate?.status==='QUALIFIED'?(DIM_STATUS[entry?.status]??'待评价'):certificate?.status==='CERTIFIED'?'通过':assessment?.ready||practical?.ready?'待评价':'未认证';
      const score=certificate?.evidence_grade==='assessment_estimate'&&Number.isFinite(entry?.score)?`<small>${entry.score.toFixed(1)}${entry.threshold!=null?' / '+entry.threshold:''}</small>`:certificate?.status==='QUALIFIED'&&Number.isFinite(entry?.score)?`<small>旧估分 ${esc(entry.score)} / 旧阈值 ${esc(entry.threshold)}</small>`:'';
      return `<div><span>${CN[d]}</span><b>${state}</b>${score}${cases ? `<small>职责：${esc(cases.join('、'))}</small>` : ''}${note ? `<small>${esc(note)}</small>` : ''}</div>`;
    }).join('');
    renderCertificate();
    controls();
  }
  function renderCertificate() {
    if(blackBox)return;
    const box = find('certificate');
    if(certificate?.evidence_grade==='assessment_estimate'){box.textContent=assessmentDetails(certificate);return;}
    if(certificate?.status==='QUALIFIED'){
      const lines=['旧模型回放：旧标尺达线，不作新版合格依据'];
      for(const d of DIMENSIONS){const e=certificate.dimensions?.[d];lines.push(`${CN[d]}：${DIM_STATUS[e?.status]??'待评价'}${Number.isFinite(e?.score)?' · '+e.score+' / '+e.threshold:''}`);}
      const heavy=certificate.hard_checks?.anti_heavy;
      if(heavy)lines.push(`反重底线：${heavy.window_ms/1000}秒内处理${heavy.required_kills}只常见重甲。`);
      const demo=certificate.hard_checks?.demolition;
      if(demo)lines.push(`独立拆洞库存：${demo.holes} / ${demo.min_holes}洞。`);
      if(certificate.completed)lines.push(`本轮完成 ${certificate.completed} 个候选。`);
      box.textContent=lines.join('\n');return;
    }
    if (certificate?.status !== 'CERTIFIED') { box.textContent = assessment?.ready||practical?.ready?'当前配装没有有效的分项评价。自行换装后不会自动重新评分。':'当前配装未认证。资料未知不会被换算成通过分数。'; return; }
    const p = profiles?.profiles.find(p => p.id === find('profile').value);
    const cover = caseCover(p);
    const lines = [`认证场景：${p?.name || certificate.profile_id}`];
    for (const d of DIMENSIONS) {
      const note = cellNote(certificate.dimensions?.[d]);
      lines.push(`${CN[d]}：通过${cover[d] ? ' · ' + cover[d].join('、') : ''}${note ? ' · ' + note : ''}`);
    }
    if (typeof certificate.completed === 'number') lines.push(`本轮完成 ${certificate.completed} 个候选。`);
    lines.push(`校验模型 ${(certificate.model_hash || '').slice(0, 12)}`);
    box.textContent = lines.join('\n');
  }
  function assessmentDetails(value){
    const names={legality:'装备互斥',heavy_pair:'20秒双重甲',demolition:'五洞库存',shared_resources:'共享弹药与补给',close_safety:'近防安全'};
    const lines=[value.acceptance_ready?'通过当前规则，等待实战验收。':'当前配装未通过新版检查。'];
    for(const d of DIMENSIONS){const e=value.dimensions?.[d];if(e)lines.push(`${CN[d]}：${Number.isFinite(e.score)?e.score.toFixed(1):'待补'}${e.threshold!=null?' / '+e.threshold:'（参考分）'} · ${DIM_STATUS[e.status]??e.status}`);}
    for(const [id,g] of Object.entries(value.gates??{}))lines.push(`${names[id]??id}：${{PASS:'通过',FAIL:'未通过',UNKNOWN:'待补资料'}[g.status]??g.status}${g.reason?' · '+g.reason:''}`);
    const heavyCases=value.gates?.heavy_pair?.cases;
    if(heavyCases?.length&&heavyCases.every(c=>c.status==='PASS'))lines.push(`已建模双重甲组合 ${heavyCases.length} 组，最慢 ${(Math.max(...heavyCases.map(c=>c.elapsed_ms))/1000).toFixed(2)} 秒；各组从满状态独立测试。`);
    const supply=value.dimensions?.sustain?.supply_adjustment;
    if(supply)lines.push(`补给修正：续航 ${Number(supply.before_score??0).toFixed(1)} → ${value.dimensions.sustain.score.toFixed(1)}。`);
    if(value.completed!=null)lines.push(`本轮抽取 ${value.completed} 套；互斥 ${value.counts?.REJECTED_ILLEGAL??0}，资料不足或未达线 ${value.counts?.UNKNOWN??0}，明确未通过 ${value.counts?.ESTIMATED_FAIL??0}。`);
    if(value.seed!=null)lines.push(`种子：${value.seed}；模型：${hash?.slice(0,12)}。`);
    lines.push('当前只代表已建模条件下通过；手动换装后不自动复评。');
    return lines.join('\n');
  }
  function renderPool() {
    const query = find('search').value.trim().toLowerCase();
    find('pool').innerHTML = (catalog?.equipment || []).filter(e => [e.name,e.name_en,e.id,...(e.aliases||[])].join(' ').toLowerCase().includes(query)).map(e => `<label><input type="checkbox" data-equipment="${esc(e.id)}" ${excluded.has(e.id)?'':'checked'}><span>${LABEL[e.selection_slot] || '战备'} · ${esc(e.name || e.name_en || e.id)}</span></label>`).join('');
  }
  function invalidate() {
    if (busy) worker.postMessage({type:'cancel',request_id:request});
    request++; busy = false; paused = false; certificate = null; gaps = null; uiExplaining = false;
    if(find('dialog').open)find('dialog').close();
    say(blackBox?'选项已更新。':'选项已更新，当前配装的认证已作废。'); renderCards();
  }
  function cancelCurrent() {
    if (!busy && !uiExplaining) return;
    worker.postMessage({type:'cancel',request_id:request});
    request++;busy=false;paused=false;purpose=null;uiExplaining=false;
    if(find('dialog').open)find('dialog').close();
    say('已取消，保留当前配装。','CANCELLED');controls();
  }
  function requestExplain() {
    if (blackBox || !current || busy) return;
    request++; certificate = null; gaps = null; uiExplaining = true;
    say('正在用实际抽取的同一链路解释当前配装…');
    find('certificate').textContent = '正在生成当前配装的解释（可随时取消）…';
    controls();
    worker.postMessage({type:'explain', request_id:request, loadout:current, options:options(assessment?.ready?'assessment':practical?.ready?'practical':'production')});
  }
  function closeDialog() {
    if(busy)cancelCurrent();else say('已关闭替换列表，配装保持不变。');
    find('dialog').close();
  }
  function start(nextMode, slot = null, manual = false) {
    if (busy || loading || !catalog) return;
    if (slot && isLocked(slot)) return;
    mode = nextMode==='certified'&&assessment?.ready?'assessment':nextMode==='certified'&&practical?.ready?'practical':nextMode; purpose = manual ? 'manual' : 'random'; replacementSlot = slot; request++; busy = true; paused = false; uiExplaining = false; gaps = null;
    if (manual) { find('replacements').textContent = '正在准备可选装备…'; find('dialog').showModal(); }
    say(slot ? '正在固定其余六件，准备替代装备…' : blackBox?'正在抽取配装，可随时取消…':(mode==='pure'?'正在完整抽取七格配装…':'正在寻找及格配装，合格后自动输出；可随时取消…'));
    controls(); worker.postMessage({type:'start', request_id:request, model_hash:hash, options:options(slot?'pure':mode), loadout:current, slot, manual});
  }
  function applyResult(value) {
    if(!withinExosuitLimit(equipmentIDs(value.loadout))){say('最多只能携带一台机甲。');return;}
    current = value.loadout; gaps = null;
    if(blackBox){certificate=null;say(value.reason==='USER_ADJUSTMENT'?'已更换装备。':'配装已生成。','DRAWN');renderCards();return;}
    certificate = value.status==='ASSESSMENT_PASS'&&value.evidence_grade==='assessment_estimate'?value:value.status==='QUALIFIED'&&value.evidence_grade==='practical_estimate'?value:value.status === 'CERTIFIED' ? (value.certificate ? {...value.certificate, completed: value.completed} : value) : null;
    say(value.reason==='USER_ADJUSTMENT'?(assessment?.ready||practical?.ready?'已自行调整 · 未重新评价':'已自行调整 · 当前配装未认证'):`${TEXT[value.status] || value.status}${value.completed ? ' · 本轮完成 '+value.completed+' 个候选' : ''}${reasonNote(value)}`,value.status); renderCards();
  }
  function renderExplanation(value) {
    if(blackBox)return;
    const box = find('certificate');
    if(value.evidence_grade==='assessment_estimate'){
      certificate=value;renderCards();say(value.acceptance_ready?'已主动复评：通过当前规则，待实战验收。':'已主动复评：当前配装未通过新版检查。');return;
    }
    if(value.evidence_grade==='practical_estimate'){
      const lines=[`当前估计：${TEXT[value.status]??value.status}（评分仍在校准）`];
      for(const d of DIMENSIONS){const e=value.dimensions?.[d];if(e)lines.push(`${CN[d]}：${DIM_STATUS[e.status]??e.status}${Number.isFinite(e.score)?' · '+e.score+' / '+e.threshold:''}`);}
      if(value.unknowns?.length)lines.push(`尚有${value.unknowns.length}项能力资料待补齐。`);
      box.textContent=lines.join('\n');say('已生成当前配装的分项估计。');return;
    }
    const lines = [`解释（与实际抽取同一链路）：${value.summary || TEXT[value.status] || value.status}`];
    for (const d of DIMENSIONS) {
      const entry = value.dimensions?.[d];
      if (!entry) continue;
      if (entry.status === 'CERTIFIED') lines.push(`${CN[d]}：通过${entry.cases?.length ? ' · ' + entry.cases.join('、') : ''}`);
      else lines.push(`${CN[d]}：${DIM_STATUS[entry.status] || entry.status}${entry.case_id ? ' · ' + entry.case_id : ''}${Array.isArray(entry.missing_actions) && entry.missing_actions.length ? ' · 缺少已验证动作 ' + entry.missing_actions.length + ' 项' : ''}`);
    }
    if (Array.isArray(value.parameter_dependencies) && value.parameter_dependencies.length) lines.push(`未决资料依赖 ${value.parameter_dependencies.length} 项（不计为不及格）。`);
    if (typeof value.cases_certified === 'number') lines.push(`通过 case ${value.cases_certified} 个。`);
    box.textContent = lines.join('\n');
    say('解释已生成（与实际抽取同一结果，不另算一套）。');
  }
  function manualRows(rows) {
    const map = byID(); find('replacements').innerHTML = '';
    for (const row of rows || []) {
      const e = map.get(row.id), item = document.createElement('button');
      item.className = 'lo-replacement'; item.dataset.equipmentId=row.id; item.textContent = `${e?.name || e?.name_en || row.id} · ${row.status==='UNVERIFIED'?'可选':row.reason==='MULTIPLE_EXOSUITS'?'最多携带一台机甲':'不符合选取规则'}`;
      item.disabled = row.status !== 'UNVERIFIED';
      item.addEventListener('click',()=> { applyResult({status:row.status,loadout:replaceAt(current,replacementSlot,row.id),reason:'USER_ADJUSTMENT'}); find('dialog').close(); });
      find('replacements').append(item);
    }
    if (!rows?.length) find('replacements').textContent = '当前槽位没有可选替代。';
  }
  worker.onmessage = ({data}) => {
    if (data.type === 'ready') {
      if(data.request_id!==initRequest)return;
      loading=false;busy=false;paused=false;
      catalog = data.catalog; profiles = data.profiles; hash = data.model_hash; coverage = data.coverage;
      production = data.integration?.production || null;
      practical = data.integration?.practical || null;
      assessment = data.integration?.assessment || null;
      if(!blackBox&&(practical?.ready||assessment?.ready))root.querySelector('details:last-of-type summary')?.replaceChildren?.(document.createTextNode('评价详情'));
      if(!blackBox)find('profile').innerHTML = profiles.profiles.map(p=>`<option value="${esc(p.id)}">${esc(p.name || p.id)}${practical?.ready||assessment?.ready?'':profileReady(p)?'':'（待校准）'}</option>`).join('');
      if(!blackBox)find('version').textContent = `规范装备 ${catalog.equipment.length} 件 · 校验模型 ${hash.slice(0, 12)}`;
      say(blackBox?'装备已就绪，可以开始抽取。':'资料校验完成，可以抽取七格配装。'); renderPool(); renderCards(); return;
    }
    if (data.request_id !== request || data.model_hash && data.model_hash !== hash) return;
    if (data.type === 'error') { busy=false;loading=false; say((blackBox?'抽取暂时不可用：':'资料或评价器出错：')+data.message); controls(); return; }
    if (data.type === 'paused') { paused=true; say(blackBox?'已暂停。':'已暂停；继续时仍评价当前候选。'); controls(); return; }
    if (data.type === 'progress') { const v=data.value; say(blackBox?'正在抽取配装，可随时取消…':v.status==='PAUSED_EVALUATION'?`正在逐项核对当前候选${v.progress?.case_id ? '（'+v.progress.case_id+'）' : ''}…`:`已完成 ${v.completed ?? v.index ?? 0} 个候选${v.total ? ' / '+v.total : ''}…`); return; }
    if (data.type === 'explanation') { uiExplaining = false; renderExplanation(data.value); controls(); return; }
    if (data.type === 'result') {
      busy=false;paused=false; const value=data.value;
      if (purpose==='manual' && value.rows) { manualRows(value.rows); say(blackBox?'请选择替代装备。':'请选择替代装备；自行调整不检查能力标准。'); controls(); }
      else if (value.loadout) applyResult(value);
      else { gaps = value.dimensions && value.status !== 'CERTIFIED' ? value.dimensions : null; certificate = null;
        say(blackBox?value.status==='INVALID_LOCKS'?'锁定的装备组合冲突，请解除部分锁定。':value.status==='NO_ACCEPTABLE_LOADOUT'?'当前条件下未找到配装，请解除部分锁定或扩大装备池。':(TEXT[value.status] || value.status):(TEXT[value.status] || value.status) + reasonNote(value), value.status); renderCards(); }
    }
  };
  worker.onerror = event => { busy=false;loading=false; say('装备模块加载失败：'+event.message); controls(); };
  root.addEventListener('click', e => {
    const b=e.target.closest('button[data-act]'); if(!b||!root.contains(b)) return;
    const act=b.dataset.act, slot=b.dataset.slot;
    if(act==='pure'||act==='certified') start(act);
    if(act==='reload') reload();
    if(act==='swap'||act==='manual') start(mode,slot,act==='manual');
    if(act==='explain') requestExplain();
    if(act==='pause') { worker.postMessage({type:paused?'resume':'pause',request_id:request});paused=!paused;controls(); }
    if(act==='cancel') cancelCurrent();
    if(act==='close-dialog') closeDialog();
    if(act==='all') { excluded.clear();invalidate();renderPool(); }
    if(act==='lock') {
      const value=isLocked(slot)?null:idAt(slot);
      if(slot.startsWith('stratagem:')) { locks.stratagems ||= [null,null,null,null];locks.stratagems[Number(slot.split(':')[1])]=value; } else locks[slot]=value;
      invalidate();
    }
  });
  root.addEventListener('change',e=>{
    if(e.target.dataset.equipment) { if(e.target.checked) excluded.delete(e.target.dataset.equipment);else excluded.add(e.target.dataset.equipment);invalidate(); }
    if(e.target.dataset.role==='profile') invalidate();
  });
  find('search').addEventListener('input',renderPool);
  find('dialog').addEventListener('cancel',event=>{event.preventDefault();closeDialog();});
  reload();
  return {destroy(){worker.terminate();root.dataset.mounted='';}};
}
for (const root of document.querySelectorAll('[data-hd2-loadout]')) mount(root);
