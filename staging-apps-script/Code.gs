/** BM FUEL — isolated Apps Script STAGING; deploy as owner, access ONLY MYSELF. */
const STAGING_ID='1OslhbqwN_CQaMEWG92Ktu7OaeJSdEigNSIe8RHry0hU';
const HEADERS=['Submission_ID','Date','Nozzle','Fuel','Opening_L','Closing_L','Volume_L','Created_At','Source','Operator'];
const SOURCE='APPS_SCRIPT_STAGING_SAMPLE';
function doGet(){return HtmlService.createHtmlOutputFromFile('Index').setTitle('BM FUEL STAGING — Google Apps Script').addMetaTag('viewport','width=device-width,initial-scale=1');}
function sheet_(){
  const book=SpreadsheetApp.openById(STAGING_ID);
  if(book.getName()!=='BM FUEL STAGING')throw new Error('Wrong spreadsheet title; no write performed.');
  const tab=book.getSheetByName('Meter_Log');
  if(!tab||tab.getRange(1,1,1,HEADERS.length).getDisplayValues()[0].some((v,i)=>v!==HEADERS[i]))throw new Error('Meter_Log schema mismatch.');
  return tab;
}
function getStatus(){sheet_();return {ok:true,source:SOURCE,mode:'STAGING_SAMPLE_ONLY'};}
function validate_(payload){
  if(!payload||typeof payload.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(payload.date))throw new Error('Invalid date.');
  const date=new Date(payload.date+'T00:00:00Z');
  if(!Number.isFinite(date.valueOf())||date.toISOString().slice(0,10)!==payload.date)throw new Error('Invalid calendar date.');
  if(!Array.isArray(payload.readings)||payload.readings.length!==6)throw new Error('Exactly six nozzles are required.');
  const seen=new Set();
  const num=v=>{if(typeof v!=='string'||!/^\d{1,10}(\.\d{1,3})?$/.test(v))throw new Error('Invalid meter reading (max 3 decimal places).');return Math.round(Number(v)*1000);};
  const rows=payload.readings.map(r=>{
    const n=r.nozzle;if(!Number.isInteger(n)||n<1||n>6||seen.has(n))throw new Error('Invalid or duplicate nozzle.');
    seen.add(n);const a=num(r.opening),b=num(r.closing);if(b<a)throw new Error('Closing meter less than opening: '+n);
    return [n,n<=3?'diesel':'gasoline',a/1000,b/1000,(b-a)/1000];
  }).sort((a,b)=>a[0]-b[0]);
  return {date:payload.date,rows};
}
function saveMeters(payload){
  if(!payload||payload.confirmSample!==true)throw new Error('Confirm sample data only.');
  const data=validate_(payload);
  const lock=LockService.getScriptLock();lock.waitLock(15000);
  try{
    const tab=sheet_(),last=tab.getLastRow();
    const old=last>1?tab.getRange(2,1,last-1,10).getValues():[];
    const dateOf=v=>v instanceof Date?Utilities.formatDate(v,'Asia/Vientiane','yyyy-MM-dd'):String(v);
    if(old.some(r=>dateOf(r[1])===data.date&&Number(r[2])>=1&&Number(r[2])<=6))throw new Error('Existing nozzle/date record; no duplicate write. Verify Meter_Log before retrying.');
    const ids=data.rows.map(()=>Utilities.getUuid().replace(/-/g,''));
    const now=new Date().toISOString();
    const values=data.rows.map((r,i)=>[ids[i],data.date,...r,now,SOURCE,'Staging Owner']);
    const start=last+1;
    if(start+5>tab.getMaxRows())tab.insertRowsAfter(tab.getMaxRows(),start+5-tab.getMaxRows());
    tab.getRange(start,1,6,2).setNumberFormat('@');
    tab.getRange(start,8,6,3).setNumberFormat('@');
    tab.getRange(start,1,6,10).setValues(values);
    SpreadsheetApp.flush();
    const stored=tab.getRange(start,1,6,10).getValues();
    if(stored.some((r,i)=>r.some((v,j)=>String(v)!==String(values[i][j]))))throw new Error('Read-back mismatch. Inspect Meter_Log; do not blindly retry.');
    return {ok:true,persisted:true,count:6,source:SOURCE,ids};
  }finally{lock.releaseLock();}
}
