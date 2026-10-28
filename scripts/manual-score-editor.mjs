const roles=['chaff','close_defense','anti_medium','anti_heavy','endurance','demolition'];
const names=['清杂','近防','反中','反重','续航','拆迁'];
const data=JSON.parse(document.querySelector('#manual-score-data').textContent);
const dialog=document.querySelector('#score-editor'),form=dialog.querySelector('form');
const fields=document.querySelector('#score-fields'),status=document.querySelector('#score-editor-status');
let snapshot=null,selected=null;
const api='/api/assessment/manual-scores';
const number=v=>Number.isFinite(v)?v.toFixed(2):'待补';
const kind=(row,manual,role)=>['anti_heavy','demolition'].includes(role)?'AUXILIARY_ADDITION':manual?.mode==='additive'?'AUXILIARY_ADDITION':manual?.mode==='base'?'BASE_CAPABILITY':row.default_kinds[role];
async function load(){const r=await fetch(api,{cache:'no-store'});if(!r.ok)throw Error('无法读取人工评分。请确认本地服务已更新。');snapshot=await r.json();return snapshot;}
function updateRows(){
  for(const row of data){const group=document.querySelector('tbody[data-equipment-id="'+row.id+'"]');
    const manual=snapshot.document.overrides[row.id];
    roles.forEach((role,index)=>{const cell=group.querySelector('[data-score-role="'+role+'"]');
      const changed=Number.isFinite(manual?.scores[role]),modeChanged=manual?.mode&&manual.mode!=='auto';
      cell.textContent=(changed?number(manual.scores[role]):row.cells[index].replace(/（(?:条件)?加值）/g,''))
        +(kind(row,manual,role)==='AUXILIARY_ADDITION'?'（加值）':'')+(changed?'（人工）':modeChanged?'（人工方式）':'');
      cell.classList.toggle('manual-value',changed||modeChanged);
      group.querySelectorAll('[data-effective-score="'+role+'"]').forEach(v=>v.textContent=
        Number.isFinite(manual?.scores[role])?number(manual.scores[role])+'（人工）':number(row.base[role]));});
    const summary=group.querySelector('[data-manual-summary]');summary.replaceChildren();summary.hidden=!manual;
    if(manual){const title=document.createElement('h3');title.textContent='人工校准';summary.append(title);
      const mode=document.createElement('p');mode.textContent='计分方式：'+({additive:'套装加值',base:'单件能力',auto:'跟随装备默认'}[manual.mode??'auto'])+'。反重与拆迁始终逐件相加；手雷颗数续航单列，暂不混入枪械续航。';summary.append(mode);
      for(const [role,value]of Object.entries(manual.scores)){const p=document.createElement('p');
        p.textContent=names[roles.indexOf(role)]+'：计算原值 '+number(row.base[role])+' → 人工采用 '+number(value);summary.append(p);}
      const note=document.createElement('p');note.textContent=manual.note||'未填写备注';summary.append(note);
      const hint=document.createElement('p');hint.className='note';hint.textContent='下面保留自动计算依据与资料缺口；人工分不会将缺失机制标记为完成。';summary.append(hint);}
  }
  document.querySelector('#manual-count').textContent='已校准 '+Object.keys(snapshot.document.overrides).length+' 件装备；修改保存在项目文件中。';
}
document.querySelectorAll('[data-edit-score]').forEach(button=>button.addEventListener('click',async()=>{
  selected=data.find(r=>r.id===button.dataset.editScore);
  status.textContent='读取评分中…';fields.replaceChildren();dialog.showModal();form.querySelector('[type=submit]').disabled=true;
  try{await load();updateRows();const current=snapshot.document.overrides[selected.id];
    document.querySelector('#score-editor-title').textContent=selected.name;
    fields.replaceChildren();
    roles.forEach((role,i)=>{const label=document.createElement('label');label.className='score-field';
      const caption=document.createElement('span');caption.textContent=names[i]+' · 计算原值 '+number(selected.base[role]);
      const input=document.createElement('input');input.type='number';input.min='0';input.max='105';input.step='0.01';input.name=role;
      input.placeholder='留空使用计算原值';input.value=current?.scores[role]??'';input.disabled=Boolean(selected.locks[role]);
      label.append(caption,input);if(selected.locks[role]){const hint=document.createElement('small');hint.textContent=selected.locks[role];label.append(hint);}fields.append(label);});
    form.elements.note.value=current?.note??'';status.textContent='保存后采用人工分；伤害、弹药、互斥和物理通过条件保持独立核算。';
    form.elements.mode.value=current?.mode??'auto';
    form.querySelector('[type=submit]').disabled=false;
  }catch(e){status.textContent=e.message;}
}));
form.addEventListener('submit',async event=>{
  event.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;
  const scores={};for(const role of roles){const input=form.elements[role];if(!input||input.disabled)continue;
    scores[role]=input.value.trim()===''?null:Number(input.value);}
  status.textContent='正在保存并更新评分表，约需数秒…';
  try{const response=await fetch(api,{method:'POST',headers:{'Content-Type':'application/json','X-HD2-Review':'1'},
    body:JSON.stringify({revision:snapshot.revision,equipment_id:selected.id,scores,note:form.elements.note.value,
      mode:form.elements.mode.value,score_scale_id:selected.score_scale_id})});
    const result=await response.json();if(!response.ok){if(result.saved){await load();updateRows();}throw Error(result.error??'保存失败');}
    snapshot=result;updateRows();status.textContent='已保存。可继续修改；刷新页面可查看重新生成的整套续航结果。';
  }catch(e){status.textContent=e.message;}finally{button.disabled=false;}
});
document.querySelector('#score-editor-close').addEventListener('click',()=>dialog.close());
document.querySelector('#score-editor-reset').addEventListener('click',()=>{
  for(const role of roles)if(form.elements[role]&&!form.elements[role].disabled)form.elements[role].value='';
  form.elements.mode.value='auto';
  status.textContent='已清空输入并恢复默认计分方式；点击保存后生效，旧修改仍保留在历史记录中。';
});
document.querySelector('#export-manual-scores').addEventListener('click',async()=>{
  try{await load();const url=URL.createObjectURL(new Blob([JSON.stringify(snapshot.document,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='hd2-manual-scores.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){document.querySelector('#manual-count').textContent=e.message;}
});
load().then(updateRows).catch(e=>{document.querySelector('#manual-count').textContent=e.message;});
