import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createProductionService,validDate} from './production.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const offices=JSON.parse(fs.readFileSync(path.join(root,'config.local.json'),'utf8'));
if(!Array.isArray(offices)||!offices.length||new Set(offices.map(o=>o.key)).size!==offices.length||offices.some(o=>! /^(main|[2-7])$/.test(o.key)||typeof o.name!=='string'||!o.name||! /^[\w-]+$/.test(o.id||'')))throw Error('config.local.json の事業所設定を確認してください。');
const production=createProductionService(offices);
const port=Number(process.env.PORT||8797);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
http.createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host)||(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)){res.writeHead(403);res.end();return;}
  if(req.method!=='GET'){res.writeHead(405,{'Allow':'GET'});res.end();return;}
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/api/production'||url.pathname==='/api/production-detail'){
    const start=url.searchParams.get('start'),end=url.searchParams.get('end');
    if(!validDate(start)||!validDate(end)||start>end){res.writeHead(400);res.end();return;}
    try{
      const result=url.pathname==='/api/production'?production.summary(start,end,url.searchParams.get('refresh')==='1'):production.detail(url.searchParams.get('office'),start,end);
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(result));
    }catch(e){res.writeHead(409,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:e.message}));}return;
  }
  const file=url.pathname==='/'?'index.html':url.pathname.slice(1);
  if(!['index.html','style.css','production.css','production.js'].includes(file)){res.writeHead(404);res.end('Not found');return;}
  res.writeHead(200,{'Content-Type':types[path.extname(file)]});fs.createReadStream(path.join(root,file)).pipe(res);
}).listen(port,'127.0.0.1',()=>console.log(`Production dashboard: http://127.0.0.1:${port}/`));
