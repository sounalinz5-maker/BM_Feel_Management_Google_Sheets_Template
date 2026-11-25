/** BM FUEL — isolated Apps Script STAGING; deploy as owner, access ONLY MYSELF. */
const STAGING_ID='1OslhbqwN_CQaMEWG92Ktu7OaeJSdEigNSIe8RHry0hU';
const HEADERS=['Submission_ID','Date','Nozzle','Fuel','Opening_L','Closing_L','Volume_L','Created_At','Source','Operator'];
const SOURCE='APPS_SCRIPT_STAGING_SAMPLE';
function doGet(){return HtmlService.createHtmlOutput(BM_FUEL_STAGING_HTML).setTitle('BM FUEL STAGING — Google Apps Script').addMetaTag('viewport','width=device-width,initial-scale=1');}
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

// Single-file mobile deployment fallback; same isolated staging logic.
const BM_FUEL_STAGING_HTML="<!doctype html><html lang=\"th\"><head><base target=\"_top\"><style>\n*{box-sizing:border-box}body{font:16px system-ui,sans-serif;background:#07172b;color:#e8f0fa;margin:0}main{max-width:590px;margin:auto;padding:20px}h1{font-size:24px;margin-bottom:6px}small{color:#ffc57d}section,fieldset{background:#102d4a;border:1px solid #426281;border-radius:13px;padding:12px;margin:12px 0}legend{font-weight:bold}label{display:block}input{background:#081e35;border:1px solid #587997;border-radius:7px;color:white;padding:10px;font:inherit;width:100%}input[type=checkbox]{width:auto} .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}button{font:inherit;background:#ffa54e;color:#07172b;font-weight:bold;border:0;border-radius:9px;padding:13px;width:100%}button:disabled{opacity:.5}p{line-height:1.5}output{display:block;color:#b7d7ef;margin-top:8px}#status{white-space:pre-wrap;overflow-wrap:anywhere}\n</style></head><body><main><h1>⛽ BM FUEL STAGING</h1><small>Google Apps Script · Google Sheets · ข้อมูลทดสอบเท่านั้น</small><section id=\"status\" role=\"status\">กำลังตรวจสอบการเชื่อมต่อ…</section><form id=\"meters\"><label>วันที่ทดสอบ<input id=\"day\" type=\"date\" required></label><div id=\"rows\"></div><p><label><input id=\"confirm\" type=\"checkbox\" required> ยืนยันว่าเป็นข้อมูลทดสอบ ไม่ใช่ยอดขายจริง</label></p><button id=\"save\" disabled>บันทึกทั้ง 6 หัวจ่าย</button></form><p>ไม่ใช้ Railway · ไม่แนบรูป · ไม่เก็บรหัสผ่าน</p></main><script>\nconst el=id=>document.getElementById(id),form=el('meters'),save=el('save'),status=el('status');let connected=false,busy=false;\nconst now=new Date();el('day').value=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Vientiane',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);\nfor(let i=1;i<=6;i++){const f=document.createElement('fieldset');f.innerHTML='<legend>หัว '+i+' · '+(i<=3?'ดีเซล':'เบนซิน')+'</legend><div class=\"grid\"><label>มิเตอร์เปิด<input id=\"o'+i+'\" required inputmode=\"decimal\" pattern=\"[0-9]{1,10}([.][0-9]{1,3})?\" placeholder=\"0.000\"></label><label>มิเตอร์ปิด<input id=\"c'+i+'\" required inputmode=\"decimal\" pattern=\"[0-9]{1,10}([.][0-9]{1,3})?\" placeholder=\"0.000\"></label></div><output id=\"v'+i+'\">— ลิตร</output>';el('rows').appendChild(f);f.addEventListener('input',()=>{const a=el('o'+i).value,b=el('c'+i).value;el('v'+i).textContent=a&&b&&Number(b)>=Number(a)?(Number(b)-Number(a)).toFixed(3)+' ลิตร':'— ลิตร';});}\nfunction fail(e){busy=false;save.disabled=!connected;status.textContent='ไม่สำเร็จ: '+(e.message||String(e));}\ngoogle.script.run.withSuccessHandler(r=>{connected=r.ok===true&&r.source==='APPS_SCRIPT_STAGING_SAMPLE';save.disabled=!connected;status.textContent=connected?'เชื่อม Google Sheets STAGING สำเร็จ':'ยังไม่ได้ยืนยันการเชื่อมต่อ';}).withFailureHandler(fail).getStatus();\nform.addEventListener('submit',e=>{e.preventDefault();if(!connected||busy)return;const readings=Array.from({length:6},(_,j)=>({nozzle:j+1,opening:el('o'+(j+1)).value,closing:el('c'+(j+1)).value}));busy=true;save.disabled=true;status.textContent='กำลังบันทึกและตรวจสอบ 6 รายการ…';google.script.run.withSuccessHandler(r=>{busy=false;save.disabled=false;if(r.persisted===true&&r.count===6){status.textContent='บันทึกและอ่านกลับจาก Google Sheets สำเร็จ 6 หัวจ่าย';el('confirm').checked=false;}else{status.textContent='ไม่สามารถยืนยันการบันทึก กรุณาตรวจ Meter_Log';}}).withFailureHandler(fail).saveMeters({date:el('day').value,readings,confirmSample:el('confirm').checked});});\n</script></body></html>";
