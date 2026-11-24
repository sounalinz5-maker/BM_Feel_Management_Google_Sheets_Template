import {NOZZLES,TANK_CAPACITY,parseMeter,meterDifference,sumByFuel,getRangeBars,formatLiters,formatLak,escapeHtml} from "./logic.mjs";
import {demoSeries,demoTanks,demoActivity,demoDailyLak,demoReceipts} from "./demo-data.mjs";

const $=id=>document.getElementById(id);
const state={screen:"login",page:"home",days:7,photos:{open:null,close:null},records:[],ocrLoading:false};
let deferredPrompt=null,toastTimeout=0;
function toast(message){
  const el=$("toast");el.textContent=message;el.hidden=false;
  window.clearTimeout(toastTimeout);toastTimeout=window.setTimeout(()=>el.hidden=true,3600);
}
function dateNow(){
  // Device-local date is appropriate only for a DEMO form; production uses server-local Asia/Vientiane time.
  const d=new Date(),y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");
  return [y,m,day].join("-");
}
function updateDisplayModeInfo(){
  const fullscreen=window.matchMedia("(display-mode: fullscreen)").matches;
  const standalone=window.matchMedia("(display-mode: standalone)").matches || navigator.standalone===true;
  const description=fullscreen
    ?"โหมดเต็มจอเปิดอยู่ — ไม่มีแถบ URL ของ Chrome"
    :standalone
      ?"เปิดจากไอคอนแอปแล้ว — ไม่มีแถบ URL (อาจเห็นแถบสถานะของโทรศัพท์)"
      :"ตอนนี้ยังเปิดอยู่ในเบราว์เซอร์ — ติดตั้งและเปิดจากไอคอน Home เพื่อซ่อน URL";
  const a=$("displayModeInfo"),b=$("displayModeDetails");
  if(a)a.textContent=description;
  if(b)b.textContent=description;
}
for(const mode of ["fullscreen","standalone"]){
  const media=window.matchMedia("(display-mode: "+mode+")");
  if(media.addEventListener)media.addEventListener("change",updateDisplayModeInfo);
}
function installAdvice(){
  if(deferredPrompt)return;
  $("installGuide").hidden=false;
  toast("Android: Chrome ⋮ → ติดตั้งแอป | iPhone: Safari แชร์ → เพิ่มไปยังหน้าจอโฮม");
}
async function install(){
  if(window.matchMedia("(display-mode: standalone)").matches || navigator.standalone===true){toast("คุณเปิด BM FUEL จากไอคอนแอปอยู่แล้ว");return;}
  if(!deferredPrompt){installAdvice();return;}
  const prompt=deferredPrompt;deferredPrompt=null;
  try {
    await prompt.prompt();
    const choice=await prompt.userChoice;
    toast(choice.outcome==="accepted"?"รับคำขอติดตั้งแล้ว กรุณาดูไอคอนบนหน้าจอ Home":"ยังไม่ได้ติดตั้ง คุณใช้เมนู Chrome เพื่อติดตั้งได้");
  }catch(e){installAdvice();}
}
window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();deferredPrompt=event;});
window.addEventListener("appinstalled",()=>{deferredPrompt=null;toast("ติดตั้งไอคอน BM FUEL สำเร็จ");updateDisplayModeInfo();});
function statusOnline(){
  $("offlineBanner").hidden=navigator.onLine;
}
window.addEventListener("online",statusOnline);
window.addEventListener("offline",statusOnline);
statusOnline();
function toggleScreen(demo){
  state.screen=demo?"demo":"login";
  $("loginScreen").hidden=demo;
  $("appShell").hidden=!demo;
  if(demo)navigate("home");
  window.scrollTo({top:0,behavior:"instant"});
}
function navigate(view){
  if(!["home","meter","stock","reports","settings"].includes(view))return;
  state.page=view;
  for(const element of document.querySelectorAll(".view"))element.classList.toggle("active",element.id==="view-"+view);
  for(const btn of document.querySelectorAll(".nav-button"))btn.classList.toggle("active",btn.dataset.go===view);
  if(view==="home")renderDashboard();
  if(view==="reports")renderReports();
  window.scrollTo({top:0,behavior:"instant"});
}
function renderDashboard(){
  const today=demoSeries.at(-1);
  $("todaySales").textContent=formatLak(demoDailyLak);
  $("todayLiters").textContent=formatLiters(today.diesel+today.gasoline);
  $("todayTransactions").textContent=formatLak(demoReceipts);
  for(const fuel of ["diesel","gasoline"]){
    const percentage=100*demoTanks[fuel]/TANK_CAPACITY[fuel];
    const isDiesel=fuel==="diesel";
    $(isDiesel?"dieselPct":"gasPct").textContent=percentage.toFixed(1)+"%";
    $(isDiesel?"dieselStock":"gasStock").textContent=formatLiters(demoTanks[fuel]);
    $(isDiesel?"dieselBar":"gasBar").style.width=Math.min(100,percentage)+"%";
  }
  $("pumpGrid").innerHTML=NOZZLES.map(n=>'<div class="pump-unit"><strong>P'+n.id+'</strong><small>'+(n.fuel==="diesel"?"ดีเซล":"เบนซิน")+'</small><div class="pump-status">● บันทึกตัวอย่าง</div></div>').join("");
  $("recentActivity").innerHTML=demoActivity.map(a=>'<div class="activity-item"><span class="activity-icon">'+escapeHtml(a.icon)+'</span><div class="activity-copy"><strong>'+escapeHtml(a.label)+'</strong><small>'+escapeHtml(a.details)+'</small></div><span class="activity-time">'+escapeHtml(a.time)+'</span></div>').join("");
  renderChart(state.days);
}
function renderChart(days){
  state.days=days;
  const data=getRangeBars(demoSeries,days);
  const perDay=data.map(x=>({fuel:"diesel",liters:x.diesel}));
  const total=sumByFuel(data.flatMap(x=>[{fuel:"diesel",liters:x.diesel},{fuel:"gasoline",liters:x.gasoline}]));
  $("chartDiesel").textContent=formatLiters(total.diesel);
  $("chartGas").textContent=formatLiters(total.gasoline);
  $("chartTotal").textContent=formatLiters(total.total);
  for(const tab of document.querySelectorAll("[data-days]"))tab.classList.toggle("selected",Number(tab.dataset.days)===days);
  const width=days===30?1180:days===7?470:325,height=214,margin={left:37,right:12,top:16,bottom:37};
  const innerW=width-margin.left-margin.right,innerH=height-margin.top-margin.bottom;
  const max=Math.max(...data.map(x=>Math.max(x.diesel,x.gasoline)),1);
  const axisMax=Math.ceil(max/400)*400;
  const step=innerW/data.length,barW=Math.max(5,Math.min(19,step*.29));
  let svg='<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="กราฟจำนวนลิตรดีเซลสีน้ำเงิน และเบนซินสีส้ม" viewBox="0 0 '+width+' '+height+'" preserveAspectRatio="xMidYMid meet">';
  for(let t=0;t<=4;t++){
    const y=margin.top+(innerH*t/4);
    svg+='<line x1="'+margin.left+'" y1="'+y+'" x2="'+(width-margin.right)+'" y2="'+y+'" stroke="#416184" stroke-width="1" stroke-dasharray="3 4" opacity=".7"/>';
    svg+='<text fill="#a8c1db" x="'+(margin.left-6)+'" y="'+(y+4)+'" text-anchor="end" font-size="10">'+Math.round(axisMax*(4-t)/4).toLocaleString("en-US")+'</text>';
  }
  data.forEach((r,i)=>{
    const mid=margin.left+step*(i+.5);
    for(const [n,value,color] of [[-1,r.diesel,"#229dff"],[1,r.gasoline,"#ff9725"]]){
      const h=(value/axisMax)*innerH;
      const x=mid+(n===-1?-barW-2:2);
      svg+='<rect x="'+x.toFixed(2)+'" y="'+(margin.top+innerH-h).toFixed(2)+'" width="'+barW.toFixed(2)+'" height="'+h.toFixed(2)+'" rx="2" fill="'+color+'"><title>'+escapeHtml(r.date)+" "+(n===-1?"ดีเซล":"เบนซิน")+" "+formatLiters(value)+' ลิตร</title></rect>';
    }
    const label=days===30?(i%3===0?r.date.slice(8):""):(r.date.slice(8)+"/"+r.date.slice(5,7));
    svg+='<text x="'+mid.toFixed(2)+'" y="'+(height-13)+'" text-anchor="middle" fill="#c4dbf0" font-size="10">'+label+"</text>";
  });
  svg+="</svg>";
  $("chartPlot").style.minWidth=(days===30?"900px":"310px");
  $("chartPlot").innerHTML=svg;
}
function renderReports(){
  const rows=getRangeBars(demoSeries,7),totals=sumByFuel(rows.flatMap(x=>[{fuel:"diesel",liters:x.diesel},{fuel:"gasoline",liters:x.gasoline}]));
  $("reportTotals").innerHTML='<div class="report-pill">🔵 ดีเซล<strong>'+formatLiters(totals.diesel)+'</strong>ลิตร</div><div class="report-pill">🟠 เบนซิน<strong>'+formatLiters(totals.gasoline)+'</strong>ลิตร</div>';
  $("reportRows").innerHTML='<div class="report-row"><b>วันที่</b><b>ดีเซล (ลิตร)</b><b>เบนซิน (ลิตร)</b></div>'+
    rows.map(x=>'<div class="report-row"><span>'+escapeHtml(x.date)+'</span><strong>'+formatLiters(x.diesel)+'</strong><strong>'+formatLiters(x.gasoline)+'</strong></div>').join("");
}
function updateMeter(){
  const a=$("meterOpen").value,b=$("meterClose").value;
  const res=meterDifference(a,b);
  $("meterResult").innerHTML=(res.ok?formatLiters(res.liters):"0.000")+" <small>ลิตร</small>";
  $("meterError").textContent=res.ok?"คำนวณจากผลต่างมิเตอร์สะสม 3 ตำแหน่ง":res.error;
  $("meterError").style.color=res.ok?"#8ff3c2":"#ffd1b2";
  const count=Number(!!state.photos.open)+Number(!!state.photos.close);
  $("evidenceState").textContent=count===2?"มีรูปหลักฐานครบทั้งสองช่วง (ยังไม่ได้ส่งตรวจสอบจริง)":"แนบรูปแล้ว "+count+"/2 ภาพ — ถ้าขาดรูปต้องรอตรวจสอบหลักฐาน";
  return res;
}
function assignPhoto(stage,file){
  const old=state.photos[stage];
  if(old?.url)URL.revokeObjectURL(old.url);
  state.photos[stage]=file?{file,url:URL.createObjectURL(file)}:null;
  const btn=$(stage==="open"?"viewOpenPhoto":"viewClosePhoto");
  btn.hidden=!file;
  btn.textContent="🔎 ดูภาพมิเตอร์"+(stage==="open"?"เปิด":"ปิด")+(file?" ("+file.name.slice(0,26)+")":"");
  updateMeter();
}
function showPhoto(stage){
  const item=state.photos[stage];
  if(!item)return;
  $("photoTitle").textContent="ตรวจรูปมิเตอร์"+(stage==="open"?"เปิด":"ปิด");
  $("photoImage").src=item.url;
  $("photoDialog").showModal();
}
function resetOcr(stage){$(stage==="open"?"openOcrNote":"closeOcrNote").textContent="กำลังอ่านภาพด้วย OCR บนเครื่อง…";}
async function readOcr(stage){
  const item=state.photos[stage];
  if(!item){toast("กรุณาแนบรูปมิเตอร์"+(stage==="open"?"เปิด":"ปิด")+"ก่อนอ่าน OCR");return;}
  if(state.ocrLoading){toast("กำลังประมวลผลรูปก่อนหน้า");return;}
  if(!window.confirm("ต้องโหลดไลบรารี OCR จาก CDN ผ่านอินเทอร์เน็ตเพื่ออ่านรูปบนเครื่อง คุณต้องการดำเนินการหรือไม่?"))return;
  const note=$(stage==="open"?"openOcrNote":"closeOcrNote");
  state.ocrLoading=true;resetOcr(stage);
  try{
    if(!window.Tesseract){
      await new Promise((resolve,reject)=>{
        const sc=document.createElement("script");
        sc.src="https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js";
        sc.onload=resolve;sc.onerror=()=>reject(new Error("โหลด OCR ไม่สำเร็จ"));
        document.head.append(sc);
      });
    }
    // Tesseract browser OCR is only an estimate, not trustworthy evidence by itself.
    const result=await window.Tesseract.recognize(item.file,"eng");
    const raw=String(result?.data?.text||"");
    const candidates=(raw.match(/\d{1,12}(?:[.,]\d{1,3})?/g)||[]).map(parseMeter).filter(x=>x!==null);
    if(!candidates.length){note.textContent="OCR อ่านเลขไม่ได้ กรุณาพิมพ์เองแล้วตรวจเทียบกับภาพ";return;}
    const guess=candidates.sort((x,y)=>String(y).length-String(x).length)[0];
    const input=$(stage==="open"?"meterOpen":"meterClose");
    input.value=String(guess.toFixed(3));
    note.textContent="OCR ได้ค่า "+formatLiters(guess)+" (ความมั่นใจของ OCR ไม่ใช่หลักฐานยืนยัน) โปรดตรวจเทียบภาพจริง";
    updateMeter();
  }catch(e){note.textContent="OCR ไม่สำเร็จ: "+String(e.message||e)+" — คุณยังคีย์เลขเองได้";}
  finally{state.ocrLoading=false;}
}
function checkSubmission(event){
  event.preventDefault();
  const result=updateMeter();
  if(!result.ok){toast(result.error);return;}
  const date=$("meterDate").value;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){toast("กรุณาเลือกวันที่");return;}
  const nozzle=Number($("nozzle").value);
  if(!NOZZLES.some(n=>n.id===nozzle)){toast("หัวจ่ายไม่ถูกต้อง");return;}
  if(!window.confirm("ยืนยันตรวจรายการ DEMO เท่านั้น ข้อมูลและภาพจะไม่ถูกส่ง Google Sheets?"))return;
  const fuel=NOZZLES.find(n=>n.id===nozzle).fuel;
  state.records.unshift({date,nozzle,fuel,opening:result.opening,closing:result.closing,liters:result.liters,proofCount:Number(!!state.photos.open)+Number(!!state.photos.close)});
  $("meterDemoRecords").innerHTML=state.records.map(r=>
    '<div class="demo-record"><strong>หัวจ่าย '+r.nozzle+' · '+(r.fuel==="diesel"?"ดีเซล":"เบนซิน")+' · '+formatLiters(r.liters)+' ลิตร</strong><small>'+escapeHtml(r.date)+' · เปิด '+formatLiters(r.opening)+' / ปิด '+formatLiters(r.closing)+' · รูป '+r.proofCount+'/2 · ไม่ได้บันทึกจริง</small></div>').join("");
  toast("ตรวจรายการ DEMO แล้ว — ยังไม่ส่ง Google Sheets");
}
function installHandlers(){
  $("enterDemo").addEventListener("click",()=>toggleScreen(true));
  $("leaveDemo").addEventListener("click",()=>toggleScreen(false));
  $("installEntry").addEventListener("click",install);
  $("installSettings").addEventListener("click",install);
  $("settingsShortcut").addEventListener("click",()=>navigate("settings"));
  for(const button of document.querySelectorAll("[data-go]"))button.addEventListener("click",()=>navigate(button.dataset.go));
  for(const button of document.querySelectorAll("[data-days]"))button.addEventListener("click",()=>renderChart(Number(button.dataset.days)));
  for(const id of ["meterOpen","meterClose"])$(id).addEventListener("input",updateMeter);
  for(const [id,stage] of [["openPhoto","open"],["closePhoto","close"]])$(id).addEventListener("change",e=>assignPhoto(stage,e.target.files?.[0]||null));
  for(const button of document.querySelectorAll("[data-ocr]"))button.addEventListener("click",()=>readOcr(button.dataset.ocr));
  $("viewOpenPhoto").addEventListener("click",()=>showPhoto("open"));
  $("viewClosePhoto").addEventListener("click",()=>showPhoto("close"));
  $("closePhotoDialog").addEventListener("click",()=>$("photoDialog").close());
  $("meterForm").addEventListener("submit",checkSubmission);
}
function init(){
  $("meterDate").value=dateNow();
  installHandlers();
  updateDisplayModeInfo();
  updateMeter();
  if("serviceWorker" in navigator){
    window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js",{scope:"./"}).catch(error=>console.warn("Service Worker:",error)));
  }
}
init();
