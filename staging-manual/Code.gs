/** BM FUEL STAGING v2 — numeric-only, owner-only; never production. */
const STAGING_ID='1OslhbqwN_CQaMEWG92Ktu7OaeJSdEigNSIe8RHry0hU';
const HEADERS=['Submission_ID','Date','Nozzle','Fuel','Opening_L','Closing_L','Volume_L','Created_At','Source','Operator'];
const SOURCE='APPS_SCRIPT_STAGING_SAMPLE';
function doGet(){return HtmlService.createHtmlOutput(BM_FUEL_STAGING_HTML).setTitle('BM FUEL STAGING — เปิด/ปิดมิเตอร์').addMetaTag('viewport','width=device-width,initial-scale=1');}
function sheet_(){
  const book=SpreadsheetApp.openById(STAGING_ID);
  if(book.getName()!=='BM FUEL STAGING')throw Error('ปลายทางไม่ใช่ BM FUEL STAGING');
  const tab=book.getSheetByName('Meter_Log');
  if(!tab||tab.getRange(1,1,1,HEADERS.length).getDisplayValues()[0].some((v,i)=>v!==HEADERS[i]))throw Error('หัวตาราง Meter_Log ไม่ตรง');
  return tab;
}
function date_(v){
  if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))throw Error('วันที่ไม่ถูกต้อง');
  const d=new Date(v+'T00:00:00Z');
  if(!Number.isFinite(d.valueOf())||d.toISOString().slice(0,10)!==v)throw Error('วันที่ไม่ถูกต้อง');
  return v;
}
function meter_(v){
  if(typeof v!=='string'||!/^\d{1,10}(\.\d{1,3})?$/.test(v))throw Error('กรอกเลขมิเตอร์ 0 ขึ้นไป ทศนิยมไม่เกิน 3 ตำแหน่ง');
  return Math.round(Number(v)*1000);
}
function blank_(v){return v===''||v==null;}
function storedMeter_(v){if(blank_(v))throw Error('พบข้อมูลมิเตอร์ไม่สมบูรณ์ กรุณาตรวจชีต');return meter_(String(v));}
function fuel_(n){return n<=3?'diesel':'gasoline';}
function readDay_(tab,day){
  const last=tab.getLastRow(), data=last>1?tab.getRange(2,1,last-1,10).getValues():[];
  const result=Array.from({length:6},(_,i)=>({nozzle:i+1,fuel:fuel_(i+1),state:'empty',opening:null,closing:null,liters:null,row:0}));
  data.forEach((r,i)=>{
    const date=r[1] instanceof Date?Utilities.formatDate(r[1],'Asia/Vientiane','yyyy-MM-dd'):String(r[1]);
    if(date!==day)return;
    const n=Number(r[2]);if(!Number.isInteger(n)||n<1||n>6)throw Error('พบหัวจ่ายไม่ถูกต้องในวันที่เลือก');
    if(result[n-1].row)throw Error('พบรายการซ้ำของหัว '+n+' กรุณาตรวจชีตก่อน');
    const a=storedMeter_(r[4]);const isOpen=blank_(r[5])&&blank_(r[6]);
    const b=isOpen?null:storedMeter_(r[5]),v=isOpen?null:storedMeter_(r[6]);
    if(!isOpen&&(b<a||v!==b-a))throw Error('ยอดมิเตอร์หัว '+n+' ไม่ตรง กรุณาตรวจชีต');
    if(!r[0]||String(r[3])!==fuel_(n))throw Error('ข้อมูลหัวจ่ายเดิมไม่ตรง กรุณาตรวจชีต');
    result[n-1]={nozzle:n,fuel:fuel_(n),state:isOpen?'open':'closed',opening:a/1000,closing:b===null?null:b/1000,liters:v===null?null:v/1000,row:i+2,source:String(r[8]),id:String(r[0])};
  });
  return result;
}
function dayResult_(tab,day){
  const records=readDay_(tab,day).map(({row,source,id,...r})=>r);
  return {ok:true,source:SOURCE,date:day,records,opened:records.filter(r=>r.state!=='empty').length,closed:records.filter(r=>r.state==='closed').length,total:Math.round(records.reduce((s,r)=>s+(r.liters===null?0:Math.round(r.liters*1000)),0))/1000};
}
function getDay(day){return dayResult_(sheet_(),date_(day));}
function saveMeter(payload){
  if(!payload||payload.confirmSample!==true)throw Error('ยืนยันว่าเป็นข้อมูลทดสอบก่อนบันทึก');
  const day=date_(payload.date),n=payload.nozzle,phase=payload.phase;
  if(!Number.isInteger(n)||n<1||n>6||!['open','close'].includes(phase))throw Error('เลือกหัวจ่ายและรอบให้ถูกต้อง');
  const value=meter_(payload.value),lock=LockService.getScriptLock();lock.waitLock(15000);
  try{
    const tab=sheet_(),r=readDay_(tab,day)[n-1];
    if(phase==='open'){
      if(r.state!=='empty')throw Error('หัวนี้มีเลขเปิดแล้ว ไม่สามารถบันทึกซ้ำ');
      const row=tab.getLastRow()+1,id=Utilities.getUuid().replace(/-/g,'');
      if(row>tab.getMaxRows())tab.insertRowsAfter(tab.getMaxRows(),1);
      tab.getRange(row,1,1,2).setNumberFormat('@');
      tab.getRange(row,8,1,3).setNumberFormat('@');
      tab.getRange(row,1,1,10).setValues([[id,day,n,fuel_(n),value/1000,'','',new Date().toISOString(),SOURCE,'Staging Owner']]);
      SpreadsheetApp.flush();
      const after=readDay_(tab,day)[n-1];
      if(after.id!==id||after.state!=='open'||after.opening!==value/1000)throw Error('ยังไม่ยืนยันการบันทึก กรุณาโหลดข้อมูลใหม่ก่อนลองซ้ำ');
    }else{
      if(r.state==='empty')throw Error('ยังไม่มีเลขมิเตอร์เปิดของหัวนี้');
      if(r.state==='closed')throw Error('หัวนี้ปิดมิเตอร์แล้ว ไม่สามารถบันทึกซ้ำ');
      if(r.source!==SOURCE)throw Error('รายการนี้ไม่ได้สร้างจากระบบทดสอบที่อนุญาต');
      const a=storedMeter_(r.opening);
      if(value<a)throw Error('มิเตอร์ปิดต้องไม่น้อยกว่ามิเตอร์เปิด');
      tab.getRange(r.row,6,1,2).setValues([[value/1000,(value-a)/1000]]);
      SpreadsheetApp.flush();
      const after=readDay_(tab,day)[n-1];
      if(after.id!==r.id||after.state!=='closed'||after.opening!==r.opening||after.closing!==value/1000||after.liters!==(value-a)/1000)throw Error('ยังไม่ยืนยันการบันทึก กรุณาโหลดข้อมูลใหม่ก่อนลองซ้ำ');
    }
    return {...dayResult_(tab,day),persisted:true};
  }finally{lock.releaseLock();}
}

const BM_FUEL_STAGING_HTML="<!doctype html><html lang=\"th\"><head><base target=\"_top\"><style>\n*{box-sizing:border-box}body{margin:0;background:#07172b;color:#edf4ff;font:16px system-ui,sans-serif}main{max-width:530px;margin:auto;padding:20px}h1{font-size:23px;margin:0}small{color:#ffc57d}section{background:#102d4a;border:1px solid #395b7c;border-radius:14px;padding:16px;margin:14px 0}label{display:block;font-weight:600;margin:14px 0 6px}input,select{width:100%;color:#fff;background:#081e35;border:1px solid #6c88a3;border-radius:9px;padding:12px;font:inherit}input[readonly]{color:#b5c9dd}input[type=checkbox]{width:auto}button{border:0;background:#ffad58;color:#12253a;font:inherit;font-weight:bold;border-radius:10px;padding:13px;width:100%;cursor:pointer}button:disabled{opacity:.45;cursor:default}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.grid button{background:#233e5a;color:#dbe9f6;border:1px solid #5b7792}.grid button[aria-pressed=true]{background:#ffad58;color:#102234;border-color:#ffad58}.summary{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}.line{display:flex;justify-content:space-between;border-top:1px solid #385673;padding:9px 0;font-size:14px}.muted{color:#b7cce1;font-size:13px}#status{white-space:pre-wrap;overflow-wrap:anywhere}#calc{font-size:24px;font-weight:bold;color:#a3e6bf;margin-top:10px}#reload{background:#284764;color:white;margin-top:10px}[hidden]{display:none!important}\n</style></head><body><main><h1>⛽ BM FUEL STAGING</h1><small>เปิด–ปิดมิเตอร์รายวัน · ข้อมูลทดสอบเท่านั้น</small>\n<section id=\"status\" role=\"status\" aria-live=\"polite\">กำลังเชื่อมต่อ…</section><section><label for=\"day\">วันที่</label><input type=\"date\" id=\"day\" required><label>รอบบันทึก</label><div class=\"grid\"><button id=\"morning\" type=\"button\" aria-pressed=\"true\">☀ เปิดตอนเช้า</button><button id=\"evening\" type=\"button\" aria-pressed=\"false\">☾ ปิดตอนเย็น</button></div>\n<label for=\"nozzle\">เลือกหัวจ่าย</label><select id=\"nozzle\"></select>\n<form id=\"form\"><div id=\"openingBox\" hidden><label for=\"opening\">มิเตอร์เปิด (บันทึกแล้ว)</label><input id=\"opening\" readonly></div><label id=\"valueLabel\" for=\"value\">เลขมิเตอร์เปิด</label><input id=\"value\" inputmode=\"decimal\" required pattern=\"[0-9]{1,10}([.][0-9]{1,3})?\" placeholder=\"0.000\" autocomplete=\"off\"><div id=\"calc\" hidden></div><p class=\"muted\" id=\"hint\"></p><label><input type=\"checkbox\" id=\"confirm\" required> ยืนยันข้อมูลทดสอบ ไม่ใช่ยอดขายจริง</label><button id=\"save\" disabled>บันทึกมิเตอร์เปิด</button></form><button id=\"reload\" type=\"button\">โหลดข้อมูลล่าสุด</button></section>\n<section><strong>ความคืบหน้าของวันที่เลือก</strong><p class=\"summary\"><span id=\"opened\">เปิด —/6</span><span id=\"closed\">ปิด —/6</span></p><div id=\"progress\"></div><p><strong>ยอดรวมเฉพาะหัวที่ปิดแล้ว: <span id=\"total\">—</span> ลิตร</strong></p></section><p class=\"muted\">ไม่ใช้ Railway · ไม่แนบรูป · ไม่เก็บรหัสผ่าน</p></main><script>\nconst el=id=>document.getElementById(id),day=el('day'),nozzle=el('nozzle'),value=el('value'),save=el('save'),status=el('status');let phase='open',busy=false,state=null,serial=0;\nconst fmt=n=>n===null?'—':Number(n).toLocaleString('en-US',{minimumFractionDigits:3,maximumFractionDigits:3});\nday.value=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Vientiane',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());\nconst names=n=>'หัว '+n+' · '+(n<=3?'ดีเซล':'เบนซิน');\nfor(let i=1;i<=6;i++)nozzle.add(new Option(names(i),String(i)));\nfunction selected(){return state?.records.find(r=>r.nozzle===Number(nozzle.value));}\nfunction update(){\n  const r=selected(),closing=phase==='close',allowed=!!r&&(closing?r.state==='open':r.state==='empty');\n  el('morning').setAttribute('aria-pressed',String(!closing));el('evening').setAttribute('aria-pressed',String(closing));\n  [day,nozzle,el('morning'),el('evening'),el('reload')].forEach(x=>x.disabled=busy);\n  el('openingBox').hidden=!closing;el('opening').value=r?.opening!=null?fmt(r.opening):'ยังไม่บันทึก';\n  el('valueLabel').textContent=closing?'เลขมิเตอร์ปิด':'เลขมิเตอร์เปิด';\n  value.disabled=busy||!allowed;el('confirm').disabled=busy||!allowed;\n  save.disabled=busy||!allowed;save.textContent=closing?'บันทึกมิเตอร์ปิด':'บันทึกมิเตอร์เปิด';\n  el('hint').textContent=!r?'โหลดข้อมูลก่อนบันทึก':r.state==='closed'?'ปิดมิเตอร์แล้ว · ขาย '+fmt(r.liters)+' ลิตร':closing?(allowed?'เลขเปิดดึงจากข้อมูลที่บันทึกไว้':'ต้องบันทึกเลขเปิดก่อน'):(allowed?'บันทึกเลขเปิดเพียงครั้งเดียว':'บันทึกเลขเปิดแล้ว '+fmt(r.opening));\n  el('calc').hidden=!closing||!allowed||!value.value||!value.validity.valid||Number(value.value)<r?.opening;\n  if(!el('calc').hidden)el('calc').textContent=fmt((Math.round(Number(value.value)*1000)-Math.round(r.opening*1000))/1000)+' ลิตร';\n  el('opened').textContent='เปิด '+(state?.opened??'—')+'/6';el('closed').textContent='ปิด '+(state?.closed??'—')+'/6';el('total').textContent=state?fmt(state.total):'—';\n  el('progress').replaceChildren();\n  if(state)for(const x of state.records){const line=document.createElement('div');line.className='line';const a=document.createElement('span'),b=document.createElement('span');a.textContent=names(x.nozzle);b.textContent=x.state==='closed'?'ปิดแล้ว ✓':x.state==='open'?'เปิดแล้ว · รอปิด':'ยังไม่เปิด';line.append(a,b);el('progress').append(line);}\n}\nfunction clear(){value.value='';el('confirm').checked=false;}\nfunction load(){if(busy)return;const ticket=++serial;state=null;busy=true;clear();update();status.textContent='กำลังโหลดข้อมูล…';google.script.run.withSuccessHandler(r=>{if(ticket!==serial)return;busy=false;state=r?.ok&&r.source==='APPS_SCRIPT_STAGING_SAMPLE'?r:null;status.textContent=state?'เชื่อม Google Sheets STAGING สำเร็จ':'ยังไม่ยืนยันการเชื่อมต่อ';update();}).withFailureHandler(e=>{if(ticket!==serial)return;busy=false;state=null;status.textContent='โหลดไม่ได้: '+(e.message||e);update();}).getDay(day.value);}\nday.addEventListener('change',load);nozzle.addEventListener('change',()=>{clear();update();});value.addEventListener('input',update);\nel('morning').onclick=()=>{phase='open';clear();update();};el('evening').onclick=()=>{phase='close';clear();update();};el('reload').onclick=load;\nel('form').addEventListener('submit',e=>{e.preventDefault();if(busy||save.disabled||!el('form').reportValidity())return;const payload={date:day.value,nozzle:Number(nozzle.value),phase,value:value.value,confirmSample:el('confirm').checked};busy=true;update();status.textContent='กำลังบันทึกและอ่านกลับ…';google.script.run.withSuccessHandler(r=>{busy=false;state=r?.persisted===true&&r.source==='APPS_SCRIPT_STAGING_SAMPLE'?r:null;status.textContent=state?'บันทึก '+names(payload.nozzle)+' สำเร็จ · '+(payload.phase==='open'?'เปิดมิเตอร์':'ปิดมิเตอร์'):'ยังไม่ยืนยันการบันทึก โปรดโหลดข้อมูลล่าสุด';clear();update();}).withFailureHandler(err=>{busy=false;state=null;status.textContent='บันทึกไม่สำเร็จ: '+(err.message||err)+' · กดโหลดข้อมูลล่าสุดก่อนลองใหม่';update();}).saveMeter(payload);});\nload();\n</script></body></html>";
