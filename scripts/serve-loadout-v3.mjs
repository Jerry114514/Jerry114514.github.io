// Local preview of the actual files, including ESM workers. No fixture data.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,sep,extname} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {manualScoreApi} from './manual-score-api.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const port=Number(process.env.HD2_LOADOUT_PORT||8790);
const execute=promisify(execFile);
const manualApi=manualScoreApi({root,rebuild:async()=>{
  for(const script of ['build-loadout-v3-assessment.mjs','review-loadout-v3-assessment.mjs'])
    await execute(process.execPath,[resolve(root,'scripts',script)],{cwd:root,windowsHide:true,maxBuffer:1024*1024});
}});
if(!Number.isInteger(port)||port<1||port>65535)throw Error('INVALID_PORT');
const types={'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html; charset=utf-8','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
    if(await manualApi(req,res,pathname))return;
    const path=resolve(root,'.'+(pathname==='/'?'/HD2_Wiki/loadout.html':pathname));
    if(!path.startsWith(root.endsWith(sep)?root:root+sep)){res.writeHead(403);res.end();return;}
    const body=await readFile(path);
    res.setHeader('Content-Type',types[extname(path)]||'application/octet-stream');
    res.setHeader('Cache-Control','no-cache');res.end(req.method==='HEAD'?undefined:body);
  }catch{res.writeHead(404);res.end('Not found');}
});
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log('HD2 preview: http://127.0.0.1:'+port+'/HD2_Wiki/loadout.html'));
