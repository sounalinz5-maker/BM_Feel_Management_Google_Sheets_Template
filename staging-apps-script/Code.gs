/** BM FUEL STAGING v2 — numeric-only, owner-only; never production. */
const STAGING_ID='1OslhbqwN_CQaMEWG92Ktu7OaeJSdEigNSIe8RHry0hU';
const HEADERS=['Submission_ID','Date','Nozzle','Fuel','Opening_L','Closing_L','Volume_L','Created_At','Source','Operator'];
const SOURCE='APPS_SCRIPT_STAGING_SAMPLE';
function doGet(){return HtmlService.createHtmlOutputFromFile('Index').setTitle('BM FUEL STAGING — เปิด/ปิดมิเตอร์').addMetaTag('viewport','width=device-width,initial-scale=1');}
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
