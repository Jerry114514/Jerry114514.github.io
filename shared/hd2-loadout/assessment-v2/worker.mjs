import {sha256,stable} from '../engine/common.mjs';
import {evaluateAssessment} from './evaluate.mjs';
import {beginAssessmentDraw,stepAssessmentDraw,assessmentView,assessmentReplacements,chooseAssessmentReplacement} from './draw.mjs';

let model=null,catalog=null,hash=null,active=null,generation=0,blackBox=false;
const send=(type,request_id,rest={})=>{
  if(blackBox&&rest.value){
    const {status,loadout,rows,reason}=rest.value;
    rest={...rest,value:{status,...(loadout?{loadout}:{}),...(rows?{rows}:{}),...(reason?{reason}:{})}};
  }
  postMessage({type,request_id,model_hash:hash,...rest});
};
const fetchJSON=async url=>{const response=await fetch(url,{cache:'no-cache'});if(!response.ok)throw Error('FETCH_FAILED:'+url);return response.json();};
async function init(request_id){
  const token=++generation;active=null;model=null;catalog=null;hash=null;
  try{
    const [c,m]=await Promise.all([fetchJSON(new URL('../data/catalog.json',import.meta.url)),fetchJSON(new URL('./equipment.json',import.meta.url))]);
    if(token!==generation)return;
    if(!Array.isArray(c.equipment)||!m.scenario||!m.references||!Array.isArray(m.equipment)||
      c.equipment.some(r=>!m.equipment.some(e=>e.equipment_id===r.id)))throw Error('ASSESSMENT_MODEL_INCOMPLETE');
    const digest=await sha256(stable({catalog:c,assessment:m}));
    if(token!==generation)return;
    catalog=c;model=m;hash=digest;
    send('ready',request_id,{catalog,profiles:{profiles:blackBox?[]:[{id:'assessment-n10',name:'内部评估基准'}]},
      integration:{assessment:{ready:true}},coverage:{synthetic:false}});
  }catch(error){if(token===generation)send('error',request_id,{message:error.message});}
}
function run(token){
  if(token!==generation||!active||active.paused)return;
  const request=active,begin=performance.now();
  try{
    let value;
    do{
      value=stepAssessmentDraw(request.task);
      if(value.status!=='SEARCHING'){
        active=null;send('result',request.id,{value});return;
      }
    }while(performance.now()-begin<20);
    if(performance.now()-request.lastProgress>200){send('progress',request.id,{value});request.lastProgress=performance.now();}
    setTimeout(()=>run(token),0);
  }catch(error){active=null;send('error',request.id,{message:error.message});}
}
self.onmessage=({data:message})=>{
  const {type,request_id}=message;
  if(type==='init'){blackBox=message.black_box===true;init(request_id);return;}
  if(type==='cancel'){
    if(active?.id===request_id){generation++;active=null;send('result',request_id,{value:{status:'CANCELLED'}});}return;
  }
  if(type==='pause'||type==='resume'){
    if(active?.id!==request_id)return;
    if(type==='pause'){active.paused=true;generation++;send('paused',request_id);}
    else if(active.paused){active.paused=false;const token=++generation;setTimeout(()=>run(token),0);}return;
  }
  if(!model){send('error',request_id,{message:'资料尚未加载，请重新加载资料。'});return;}
  if(message.model_hash&&message.model_hash!==hash){send('error',request_id,{message:'资料版本已经变化，请重新加载资料。'});return;}
  try{
    if(type==='explain'){
      if(blackBox){send('error',request_id,{message:'此抽取页面不提供评价详情。'});return;}
      generation++;active=null;
      send('explanation',request_id,{value:assessmentView(evaluateAssessment(message.loadout,model,catalog,message.options?.constraints))});return;
    }
    if(type!=='start')return;
    generation++;active=null;
    if(message.slot){
      const value=assessmentReplacements(message.loadout,message.slot,model,catalog,message.options?.constraints);
      send('result',request_id,{value:message.manual||!value.rows?value:chooseAssessmentReplacement(message.loadout,message.slot,value.rows)});return;
    }
    active={id:request_id,paused:false,lastProgress:0,task:beginAssessmentDraw(model,catalog,message.options)};
    const token=generation;setTimeout(()=>run(token),0);
  }catch(error){send('error',request_id,{message:error.message});}
};
