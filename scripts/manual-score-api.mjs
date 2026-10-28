import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {changeManualScores} from '../shared/hd2-loadout/assessment-v2/manual-scores.mjs';

export function manualScoreApi({root,rebuild}) {
  const path=join(root,'shared/hd2-loadout/assessment-v2/manual-scores.json');
  const modelPath=join(root,'shared/hd2-loadout/assessment-v2/equipment.json');
  const digest=s=>createHash('sha256').update(s).digest('hex');
  const read=async()=>{const raw=await readFile(path,'utf8');return {document:JSON.parse(raw),revision:digest(raw)};};
  const send=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
  let saving=false;
  return async(req,res,pathname)=>{
    if(pathname!=='/api/assessment/manual-scores')return false;
    if(req.method==='GET'){try{send(res,200,await read());}catch(e){send(res,500,{error:e.message});}return true;}
    if(req.method!=='POST'){send(res,405,{error:'只接受读取或保存评分'});return true;}
    if(req.headers.origin!==`http://${req.headers.host}`||req.headers['x-hd2-review']!=='1'
      ||!/^application\/json(?:;|$)/i.test(req.headers['content-type']??'')){send(res,403,{error:'请从本地评分页保存'});return true;}
    if(saving){send(res,409,{error:'另一项修改正在保存，请稍后再试'});return true;}
    saving=true;
    let saved=false;
    try {
      const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>65536)throw Error('修改内容过大');chunks.push(chunk);}
      const change=JSON.parse(Buffer.concat(chunks).toString('utf8')),current=await read();
      if(change.revision!==current.revision){send(res,409,{error:'评分记录已有更新。请重新打开编辑窗口后再保存，避免覆盖其他修改。'});return true;}
      const model=JSON.parse(await readFile(modelPath,'utf8'));
      if(model.scenario?.score_scale?.id&&change.score_scale_id!==model.scenario.score_scale.id){
        send(res,409,{error:'评分尺度已更新，请刷新页面后再保存；本次未写入。'});return true;}
      const next=changeManualScores(current.document,change,model);
      const temp=path+'.'+randomUUID()+'.tmp',text=JSON.stringify(next,null,2)+'\n';
      // The persistent history preserves each previous manual value; ordinary
      // generated reports may be rebuilt without rewriting this source file.
      await writeFile(temp,text,{encoding:'utf8',flag:'wx'});
      if((await read()).revision!==current.revision){send(res,409,{error:'评分文件在保存期间改变，未覆盖原文件'});return true;}
      await rename(temp,path);saved=true;
      await rebuild();
      send(res,200,{saved:true,...await read()});
    } catch(e){send(res,saved?500:400,{saved,error:saved?'人工分已保存，但表格重算失败：'+e.message:e.message});}
    finally{saving=false;}
    return true;
  };
}
