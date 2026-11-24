// Pure BM FUEL business helpers. Values displayed in DEMO are not production totals.
export const NOZZLES = Object.freeze([
  {id:1,fuel:"diesel"},{id:2,fuel:"diesel"},{id:3,fuel:"diesel"},
  {id:4,fuel:"gasoline"},{id:5,fuel:"gasoline"},{id:6,fuel:"gasoline"}
]);
export const TANK_CAPACITY = Object.freeze({diesel:30000,gasoline:20000});
export function parseMeter(value){
  const str=String(value??"").trim().replace(",",".");
  if(!/^\d{1,12}(?:\.\d{1,3})?$/.test(str)) return null;
  const n=Number(str);
  return Number.isFinite(n)&&n>=0 ? Math.round(n*1000)/1000 : null;
}
export function meterDifference(opening,closing){
  const a=parseMeter(opening),b=parseMeter(closing);
  if(a===null||b===null)return {ok:false,error:"กรุณากรอกเลขมิเตอร์ให้ถูกต้อง ไม่เกิน 3 ตำแหน่งทศนิยม"};
  if(b<a)return {ok:false,error:"มิเตอร์ปิดต้องไม่น้อยกว่ามิเตอร์เปิด"};
  return {ok:true,opening:a,closing:b,liters:Math.round((b-a)*1000)/1000};
}
export function sumByFuel(rows){
  const totals={diesel:0,gasoline:0,total:0};
  for(const row of rows){
    const fuel=row?.fuel,liters=Number(row?.liters);
    if(!["diesel","gasoline"].includes(fuel)||!Number.isFinite(liters)||liters<0)continue;
    totals[fuel]+=liters;
    totals.total+=liters;
  }
  for(const key of Object.keys(totals))totals[key]=Math.round(totals[key]*1000)/1000;
  return totals;
}
export function getRangeBars(series,days){
  const n=days===1?1:days===30?30:7;
  return series.slice(-n).map(row=>({
    date:String(row.date),
    diesel:Math.max(0,Number(row.diesel)||0),
    gasoline:Math.max(0,Number(row.gasoline)||0)
  }));
}
export function formatLiters(value){return Number(value||0).toLocaleString("en-US",{minimumFractionDigits:3,maximumFractionDigits:3});}
export function formatLak(value){return Math.round(Number(value)||0).toLocaleString("en-US");}
export function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));}
