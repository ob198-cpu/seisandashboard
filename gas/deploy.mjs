import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.join(path.dirname(fileURLToPath(import.meta.url)),'build');
const credentials=JSON.parse(await fs.readFile(path.join(os.homedir(),'.clasprc.json'),'utf8')).tokens.default;
const tokenResponse=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:credentials.client_id,client_secret:credentials.client_secret,refresh_token:credentials.refresh_token,grant_type:'refresh_token'}),signal:AbortSignal.timeout(20000)});
const token=await tokenResponse.json();
if(!tokenResponse.ok)throw Error('Google認証の更新に失敗しました。');

async function api(route,method='GET',body){
 const response=await fetch('https://script.googleapis.com/v1/'+route,{method,headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
 const value=await response.json();
 if(!response.ok)throw Error('Apps Script API '+response.status+': '+(value.error?.message||'操作に失敗しました。'));
 return value;
}

let project;
try{project=JSON.parse(await fs.readFile(path.join(here,'.clasp.json'),'utf8'));}catch{}
if(!project){
 const created=await api('projects','POST',{title:'生産活動ダッシュボード'});
 project={scriptId:created.scriptId,rootDir:'.'};
 await fs.writeFile(path.join(here,'.clasp.json'),JSON.stringify(project,null,2)+'\n');
 console.log('Created script project '+created.scriptId);
}
const files=[];
for(const [filename,type] of [['Code.gs','SERVER_JS'],['Aggregate.gs','SERVER_JS'],['Config.gs','SERVER_JS'],['Index.html','HTML'],['appsscript.json','JSON']]){
 const source=await fs.readFile(path.join(here,filename),'utf8');
 files.push({name:filename.replace(/\.(gs|html|json)$/,''),type,source});
}
await api('projects/'+encodeURIComponent(project.scriptId)+'/content','PUT',{files});
const version=await api('projects/'+encodeURIComponent(project.scriptId)+'/versions','POST',{description:'Google account allowlisted integrated dashboard'});
let deployment;
try{deployment=JSON.parse(await fs.readFile(path.join(here,'deployment.json'),'utf8'));}catch{}
const config={scriptId:project.scriptId,versionNumber:version.versionNumber,manifestFileName:'appsscript',description:'Google account allowlisted integrated dashboard'};
const result=deployment?.deploymentId
 ?await api('projects/'+encodeURIComponent(project.scriptId)+'/deployments/'+encodeURIComponent(deployment.deploymentId),'PUT',{deploymentConfig:config})
 :await api('projects/'+encodeURIComponent(project.scriptId)+'/deployments','POST',{versionNumber:config.versionNumber,manifestFileName:config.manifestFileName,description:config.description});
const url=result.entryPoints?.find(item=>item.entryPointType==='WEB_APP')?.webApp?.url;
if(!url)throw Error('WebアプリのURLが返されませんでした。');
await fs.writeFile(path.join(here,'deployment.json'),JSON.stringify({deploymentId:result.deploymentId,url,version:version.versionNumber},null,2)+'\n');
console.log(JSON.stringify({url,version:version.versionNumber}));
