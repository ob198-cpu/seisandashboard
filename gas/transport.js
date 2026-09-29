const rpc=(method,...args)=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('取得が時間切れになりました。再取得してください。')),90000);
  google.script.run.withSuccessHandler(value=>{clearTimeout(timer);resolve(value);}).withFailureHandler(()=>{clearTimeout(timer);reject(Error('取得できません。ログインアカウント・台帳の閲覧権限を確認してください。'));})[method](...args);
});
const catalog=await rpc('offices');
let cloudRows=[],cloudPeriod='',cloudRunning=false,cloudStarted=0;
async function refreshCloud(start,end){
  cloudRunning=true;cloudStarted=Date.now();cloudPeriod=`${start}:${end}`;
  cloudRows=catalog.map(o=>({...o,status:'loading'}));
  try{for(let i=0;i<catalog.length;i++){
    try{cloudRows[i]=await rpc('report',catalog[i].key,start,end,false);}
    catch(e){cloudRows[i]={...catalog[i],status:'error',error:e.message};}
  }}finally{cloudRunning=false;}
}
async function fetch(input){
  const url=new URL(input,'https://dashboard.invalid');
  const start=url.searchParams.get('start'),end=url.searchParams.get('end');
  if(url.pathname==='/api/production'){
    const period=`${start}:${end}`;
    if(cloudRunning&&cloudPeriod!==period)return {ok:true,json:async()=>({running:true,offices:catalog.map(o=>({...o,status:'loading'}))})};
    if(!cloudRunning&&(period!==cloudPeriod||Date.now()-cloudStarted>300000||(url.searchParams.get('refresh')==='1'&&Date.now()-cloudStarted>30000)))void refreshCloud(start,end);
    const snapshot=JSON.parse(JSON.stringify({running:cloudRunning,offices:cloudRows}));
    return {ok:true,json:async()=>snapshot};
  }
  if(url.pathname==='/api/production-detail'){
    try{const result=await rpc('report',url.searchParams.get('office'),start,end,true);return {ok:true,json:async()=>result};}
    catch(e){return {ok:false,json:async()=>({error:e.message})};}
  }
  throw Error('対象外の通信です。');
}
