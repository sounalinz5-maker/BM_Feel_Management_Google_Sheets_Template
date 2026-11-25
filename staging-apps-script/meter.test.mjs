import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code=fs.readFileSync(new URL('./Code.gs',import.meta.url),'utf8');
function setup(){
 const rows=[['Submission_ID','Date','Nozzle','Fuel','Opening_L','Closing_L','Volume_L','Created_At','Source','Operator']];
 const tab={getLastRow:()=>rows.length,getMaxRows:()=>1000,getRange:(r,c,n,m)=>({getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>rows[r+i-1]?.[c+j-1]??'')),getDisplayValues:()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>String(rows[r+i-1]?.[c+j-1]??''))),setNumberFormat:()=>{},setValues:v=>v.forEach((a,i)=>{const row=rows[r+i-1]??(rows[r+i-1]=[]);a.forEach((x,j)=>row[c+j-1]=x);})})};
 let id=0;
 const ctx=vm.createContext({SpreadsheetApp:{openById:id=>{assert.equal(id,'1OslhbqwN_CQaMEWG92Ktu7OaeJSdEigNSIe8RHry0hU');return {getName:()=> 'BM FUEL STAGING',getSheetByName:()=>tab};},flush:()=>{}},Utilities:{getUuid:()=>String(++id).padStart(32,'0')},LockService:{getScriptLock:()=>({waitLock:()=>{},releaseLock:()=>{}})}});
 vm.runInContext(code,ctx);
 const save=(nozzle,phase,value,date='2026-11-25')=>ctx.saveMeter({date,nozzle,phase,value,confirmSample:true});
 return {rows,save,day:()=>ctx.getDay('2026-11-25')};
}
test('six independent opening and closing readings use six rows; blanks not zero',()=>{const {rows,save,day}=setup();for(let i=1;i<=6;i++)save(i,'open',String(i*1000));assert.equal(rows.length,7);assert.equal(day().opened,6);assert.equal(day().closed,0);assert.equal(rows[1][5],'');for(let i=1;i<=6;i++)save(i,'close',String(i*1000+100));assert.equal(rows.length,7);assert.equal(day().closed,6);assert.equal(day().total,600);});
test('reject close before open, duplicate opening and closing, reversed values',()=>{const {save,rows}=setup();assert.throws(()=>save(1,'close','100'));save(1,'open','100');assert.throws(()=>save(1,'open','100'));assert.throws(()=>save(1,'close','99'));save(1,'close','100');assert.throws(()=>save(1,'close','100'));assert.equal(rows.length,2);assert.equal(rows[1][6],0);});
test('decimal precision and date separation',()=>{const {save,day}=setup();save(1,'open','100.001');save(1,'close','100.004');assert.equal(day().total,0.003);save(1,'open','100.004','2026-11-26');assert.equal(day().closed,1);assert.throws(()=>save(2,'open','-1'));assert.throws(()=>save(2,'open','1.0001'));});
