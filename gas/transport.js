const rpc=(method,...args)=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('取得が時間切れになりました。再取得してください。')),90000);
  google.script.run.withSuccessHandler(value=>{clearTimeout(timer);resolve(value);}).withFailureHandler(error=>{
    clearTimeout(timer);
    const message=String(error?.message||'');
    const code=message.match(/SHEETS_HTTP_\d{3}_[A-Za-z_]+/)?.[0];
    const known=['台帳の列構成が一致しません。','このGoogleアカウントには閲覧権限がありません。','集計期間が不正です。','対象外の事業所です。','取得中に記録が変わったため、再取得してください。'].find(text=>message.includes(text));
    const runtime=message.match(/(?:ReferenceError|TypeError): [A-Za-z_][A-Za-z_0-9 .]{0,100}/)?.[0];
    reject(Error(code?'台帳取得エラー（'+code+'）':known|| (runtime?'公開版の処理エラー（'+runtime+'）':'取得に失敗しました。公開版の処理またはGoogleの承認状態を確認してください。')));
  })[method](...args);
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
