import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {normalizeReports,aggregateProduction} from '../production.mjs';
const read=name=>fs.readFileSync(new URL(name,import.meta.url),'utf8');
const source=read('Code.gs');
test('generated browser module preserves source and parses',()=>{
 const html=read('build/Index.html');
 const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
 assert.ok(script.includes(read('../production.js')));
 execFileSync(process.execPath,['--check','--input-type=module'],{input:script});
});
test('API setup errors are not misreported as account permissions; raw errors remain private',async()=>{
 for(const [message,expected] of [['Error: SHEETS_HTTP_403_SERVICE_DISABLED','SERVICE_DISABLED'],['private-id-and-token','公開版の処理またはGoogleの承認状態']]){
   let failure;
   const runner={withSuccessHandler(){return this;},withFailureHandler(fn){failure=fn;return this;},report(){failure({message});}};
   const c=vm.createContext({setTimeout,clearTimeout,google:{script:{run:runner}}});
   vm.runInContext(read('transport.js').split("const catalog=await rpc('offices');")[0],c);
   await assert.rejects(vm.runInContext("rpc('report')",c),e=>e.message.includes(expected)&&!e.message.includes('private-id-and-token'));
 }
});
function context(email){let reads=0;const c=vm.createContext({Session:{getActiveUser:()=>({getEmail:()=>email})},ALLOWED_EMAILS:['owner@example.com'],OFFICES:[{key:'main',id:'fixture',name:'Office'}],UrlFetchApp:{fetch:()=>{reads++;throw Error('unexpected read');}},validDate_:s=>/^2026-09-\d\d$/.test(s)});vm.runInContext(source,c);return {c,reads:()=>reads};}
test('every public endpoint rejects anonymous and nonallowed users before reading',()=>{
 for(const email of ['', 'other@example.com'])for(const call of ['doGet()','offices()',"report('main','2026-09-01','2026-09-30',true)"]){const x=context(email);assert.throws(()=>vm.runInContext(call,x.c),/閲覧権限/);assert.equal(x.reads(),0);}
});
test('invalid office and dates reject before reading; catalog excludes IDs',()=>{
 const x=context('owner@example.com');assert.throws(()=>vm.runInContext("report('8','2026-09-01','2026-09-30',true)",x.c),/対象外/);assert.throws(()=>vm.runInContext("report('main','bad','bad',true)",x.c),/期間/);assert.equal(x.reads(),0);assert.equal(JSON.stringify(vm.runInContext('offices()',x.c)).includes('fixture'),false);
});
test('readonly scope, accessing-user identity and private helpers',()=>{
 assert.deepEqual(JSON.parse(read('appsscript.json')).dependencies.enabledAdvancedServices,[{userSymbol:'Sheets',serviceId:'sheets',version:'v4'}]);
 const manifest=JSON.parse(read('appsscript.json'));assert.equal(manifest.webapp.executeAs,'USER_ACCESSING');assert.equal(manifest.webapp.access,'ANYONE');assert.ok(manifest.oauthScopes.includes('https://www.googleapis.com/auth/spreadsheets.readonly'));assert.ok(!manifest.oauthScopes.includes('https://www.googleapis.com/auth/spreadsheets'));
 const pub=[...source.matchAll(/^function (\w+)\(/gm)].map(m=>m[1]).filter(n=>!n.endsWith('_'));assert.deepEqual(pub,['doGet','offices','report']);assert.ok(!/SpreadsheetApp|DriveApp/.test(source));
});
test('generated cloud aggregation matches local including individual details',()=>{
 const c=vm.createContext({personKey_:name=>createHash('sha256').update(name).digest('hex').slice(0,20)});
 vm.runInContext(read('build/Aggregate.gs'),c);
 const values=[{id:'1',name:'Test A',date:'2026-09-01',minutes:120,activityMinutes:{a:90},activityLabels:{a:'Activity A'}},{id:'2',name:'Test A',date:'2026-09-02',minutes:60},{id:'3',name:'Test B',date:'2026-09-01',minutes:30}].map(JSON.stringify);
 c.values=values;
 const cloud=JSON.parse(JSON.stringify(vm.runInContext("aggregateProduction_(normalizeReports_(values),'2026-09-01','2026-09-30',true)",c)));
 assert.deepEqual(cloud,aggregateProduction(normalizeReports(values),'2026-09-01','2026-09-30',true));
});
