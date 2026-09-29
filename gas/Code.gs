function access_() {
  const email=String(Session.getActiveUser().getEmail()||'').trim().toLowerCase();
  if(!email||!ALLOWED_EMAILS.includes(email))throw Error('このGoogleアカウントには閲覧権限がありません。');
}
function doGet(){access_();return HtmlService.createHtmlOutputFromFile('Index').setTitle('生産活動ダッシュボード').addMetaTag('viewport','width=device-width,initial-scale=1');}
function offices(){access_();return OFFICES.map(o=>({key:o.key,name:o.name}));}
function report(officeKey,start,end,detail){
  access_();
  if(!validDate_(start)||!validDate_(end)||start>end)throw Error('集計期間が不正です。');
  const office=OFFICES.find(o=>o.key===officeKey);
  if(!office)throw Error('対象外の事業所です。');
  const read=()=>{
    const url='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(office.id)+'/values/'+encodeURIComponent('Reports!N:N')+'?valueRenderOption=UNFORMATTED_VALUE';
    const response=UrlFetchApp.fetch(url,{method:'get',headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},muteHttpExceptions:true});
    if(response.getResponseCode()!==200)throw Error('台帳を読み取れません。このGoogleアカウントの閲覧権限を確認してください。');
    const values=JSON.parse(response.getContentText()).values||[];
    if(values[0]?.[0]!=='json')throw Error('台帳の列構成が一致しません。');
    return values.slice(1).map(row=>row[0]).filter(v=>v!==undefined&&v!==null&&v!=='');
  };
  let before=read();
  for(let i=0;i<2;i++){
    const after=read();
    if(JSON.stringify(before)===JSON.stringify(after))return Object.assign({key:office.key,name:office.name,status:'ok',readAt:new Date().toISOString()},aggregateProduction_(normalizeReports_(after),start,end,detail===true));
    before=after;
  }
  throw Error('取得中に記録が変わったため、再取得してください。');
}
function personKey_(name){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,name,Utilities.Charset.UTF_8).map(v=>(v&255).toString(16).padStart(2,'0')).join('').slice(0,20);}
