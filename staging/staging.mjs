import {meterDifference,formatLiters,formatLak,escapeHtml} from '../app/logic.mjs';
const $=id=>document.getElementById(id);
let api='',accessToken='',accessExpiry=0,busy=false,googleStorageReady=false;
const photoPreviewUrls={open:null,close:null};
const API_STORAGE='BM_FUEL_STAGING_API_URL';
const USERNAME_STORAGE='BM_FUEL_STAGING_SAVED_USERNAME';
function validApiUrl(raw){
  try {
    const value=new URL(raw);
    const local=value.hostname==='localhost'||value.hostname==='127.0.0.1';
    if(value.username||value.password||value.search||value.hash || !(value.protocol==='https:'||(local&&value.protocol==='http:')))return null;
    return value.origin+value.pathname.replace(/\/+$/,'');
  }catch{return null;}
}
function status(id,message,ok=null){
  const el=$(id);el.textContent=message;el.classList.remove('bad','ok');
  if(ok===false)el.classList.add('bad');if(ok===true)el.classList.add('ok');
}
async function request(path,{method='GET',body,token=accessToken,server=api}={}){
 const ctrl=new AbortController();
 const kill=setTimeout(()=>ctrl.abort(),16000);
 try {
   const headers={'Accept':'application/json'};
   if(body!==undefined)headers['Content-Type']='application/json';
   if(token)headers['Authorization']='Bearer '+token;
   const response=await fetch(server+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',mode:'cors',redirect:'error',credentials:'omit',signal:ctrl.signal});
   let result;
   try{result=await response.json();}catch{throw Error('API ไม่ได้ส่งข้อมูล JSON');}
   if(!response.ok)throw Error(result.error||'HTTP '+response.status);
   if(result.mode!=='sample-only'&&path!=='/v1/logout')throw Error('API ไม่ใช่ระบบ STAGING ข้อมูลตัวอย่าง');
   return result;
 }finally{clearTimeout(kill);}
}
function err(e){return e?.name==='AbortError'?'เชื่อมต่อหมดเวลา (16 วินาที)':String(e?.message||e);}
function today(){
 const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
}
function reset(){
 accessToken='';accessExpiry=0;
 $('dashboard').hidden=true;$('meter').hidden=true;$('auth').hidden=false;
 googleStorageReady=false;
 $('submitMeter').disabled=true;
 $('setup').hidden=true;
 $('sPassword').value='';
}
async function check(){
 const proposed=validApiUrl($('apiUrl').value.trim());
 if(!proposed){status('apiStatus','กรุณาใส่ URL HTTPS ของ API STAGING ที่ถูกต้อง (ไม่มีรหัสผ่านใน URL)',false);return;}
 api=proposed;reset();$('auth').hidden=true;
 status('apiStatus','กำลังตรวจสอบ API STAGING…');
 try {
   const r=await request('/v1/health',{server:proposed,token:''});
   if(!r.ok||r.service!=='bm-fuel-staging'||r.auth!==true)throw Error('ไม่พบ BM FUEL staging API ที่รองรับ');
   sessionStorage.setItem(API_STORAGE,api);
   status('apiStatus','เชื่อมต่อ API STAGING สำเร็จ · ข้อมูลจำลองเท่านั้น',true);
   status('connectionHint','● ระบบทดสอบออนไลน์ · เชื่อมต่อ HTTPS สำเร็จ',true);
   $('setup').hidden=true;
   $('auth').hidden=false;
 }catch(e){$('setup').hidden=false;status('apiStatus','เชื่อมต่อไม่ได้: '+err(e)+' — ตรวจ URL, HTTPS, CORS และสถานะเซิร์ฟเวอร์',false);}
}
function plot(series){
 const list=series.slice(-7),max=Math.max(1,...list.flatMap(x=>[Number(x.diesel)||0,Number(x.gasoline)||0]));
 $('barChart').innerHTML=list.map(x=>{
  const diesel=Math.max(0,Number(x.diesel)||0),gasoline=Math.max(0,Number(x.gasoline)||0);
  return '<div style="display:grid;grid-template-columns:55px 1fr;align-items:center;gap:8px;margin:7px 0;font-size:10px;color:#b5cde4"><span>'+
   escapeHtml(String(x.date).slice(5))+'</span><div><div class="s-bar"><div class="s-fill" style="width:'+(diesel/max*100).toFixed(1)+'%"></div></div><div class="s-bar" style="margin:3px 0;background:#18354d"><div style="width:'+(gasoline/max*100).toFixed(1)+'%;height:100%;background:linear-gradient(90deg,#ff8c10,#ffc15a)"></div></div></div></div>';
 }).join('')+'<p style="font-size:10px;color:#bdd3ea">สีน้ำเงิน: ดีเซล | สีส้ม: เบนซิน · หน่วย: ลิตร</p>';
}
async function refresh(){
 if(!accessToken || Date.now()>=accessExpiry){reset();status('authStatus','เซสชันทดสอบหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง',false);return;}
 try{
  const r=await request('/v1/dashboard');
  const d=r.data,last=d.series.at(-1);
  $('saleLak').textContent=formatLak(d.dailyLak);
  $('saleLiters').textContent=formatLiters(Number(last.diesel)+Number(last.gasoline));
  $('tankDiesel').textContent=formatLiters(d.tanks.diesel);
  $('tankGasoline').textContent=formatLiters(d.tanks.gasoline);
  plot(d.series);
  const meters=await request('/v1/meters');
  const records=Array.isArray(meters.records)?meters.records:[];
  $('meterList').innerHTML=records.length?records.slice().reverse().map(item=>
    '<div class="s-row"><span>หัว '+escapeHtml(item.nozzle)+' · '+escapeHtml(item.date)+
    (item.hasOpenPhoto&&item.hasClosePhoto?' <small>📷 2 รูป</small>':'')+'</span><strong>'+
    formatLiters(item.liters)+' ลิตร</strong></div>').join(''):'ไม่มีรายการทดสอบ';
 }catch(e){
  status('meterResult','โหลดข้อมูลไม่ได้: '+err(e),false);
  if(String(e.message||'').match(/Session expired|missing|401/))reset();
 }
}
$('checkApi').addEventListener('click',check);
$('toggleApi').addEventListener('click',()=>{$('setup').hidden=!$('setup').hidden;});
try{
 const saved=localStorage.getItem(USERNAME_STORAGE)||'';
 if(saved && saved.length<=120){$('sUsername').value=saved;$('rememberUsername').checked=true;}
}catch{}
$('rememberUsername').addEventListener('change',()=>{
 if(!$('rememberUsername').checked){try{localStorage.removeItem(USERNAME_STORAGE);}catch{}}
});
$('authForm').addEventListener('submit',async e=>{
 e.preventDefault();if(busy)return;busy=true;status('authStatus','กำลังตรวจชื่อผู้ใช้และรหัสผ่านกับเซิร์ฟเวอร์ STAGING');
 try{
  const r=await request('/v1/login',{method:'POST',token:'',body:{username:$('sUsername').value.trim(),password:$('sPassword').value}});
  if(!r.ok||!/^[a-f0-9]{64}$/i.test(r.accessToken))throw Error('ข้อมูล Session ไม่ถูกต้อง');
  accessToken=r.accessToken;accessExpiry=Date.now()+r.expiresIn*1000;
  try{
    if($('rememberUsername').checked)localStorage.setItem(USERNAME_STORAGE,$('sUsername').value.trim());
    else localStorage.removeItem(USERNAME_STORAGE);
  }catch{}
  $('sPassword').value='';
  $('auth').hidden=true;$('dashboard').hidden=false;$('meter').hidden=false;
  $('welcome').textContent='ยินดีต้อนรับ '+(r.user.displayName||'STAGING')+' · สถานะ '+r.user.role;
  await refresh();
  await checkStagingStorage();
 }catch(error){status('authStatus','เข้าสู่ระบบไม่สำเร็จ: '+err(error),false);}
 finally{busy=false;}
});
$('refresh').addEventListener('click',refresh);
$('logout').addEventListener('click',async()=>{
 try{await request('/v1/logout',{method:'POST'});}catch{}
 reset();status('authStatus','ออกจากระบบ STAGING แล้ว',true);
});
async function checkStagingStorage(){
  googleStorageReady=false;
  $('submitMeter').disabled=true;
  status('storageStatus','กำลังตรวจสอบ Google Sheets และ Drive ของ STAGING…');
  try{
    const data=await request('/v1/storage-status');
    if(data.storage==='google-staging' && data.persisted===true && data.photoEvidence===true){
      googleStorageReady=true;
      $('submitMeter').disabled=false;
      status('storageStatus','● พร้อมบันทึกถาวรลง Google Sheets และ Drive เฉพาะ STAGING',true);
    }else{
      status('storageStatus','ยังไม่เชื่อม Google Sheets/Drive ของ STAGING — ปิดการบันทึกพร้อมรูปถ่ายเพื่อป้องกันข้อมูลหาย',false);
    }
  }catch(e){status('storageStatus','ตรวจสอบที่เก็บ STAGING ไม่สำเร็จ: '+err(e),false);}
}
function readAndPreparePhoto(file){
 return new Promise((resolve,reject)=>{
   if(!file){reject(new Error('กรุณาถ่ายรูปมิเตอร์เปิดและปิดให้ครบ'));return;}
   if(!file.type.startsWith('image/')){reject(new Error('ไฟล์รูปภาพไม่ถูกต้อง'));return;}
   if(file.size>12*1024*1024){reject(new Error('รูปภาพต้นฉบับต้องไม่เกิน 12MB'));return;}
   const image=new Image(),url=URL.createObjectURL(file);
   image.onload=()=>{
     try{
       const maxSide=1280,scale=Math.min(1,maxSide/Math.max(image.naturalWidth,image.naturalHeight));
       const canvas=document.createElement('canvas');
       canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);
       if(!canvas.width||!canvas.height)throw new Error('ขนาดภาพไม่ถูกต้อง');
       const ctx=canvas.getContext('2d');
       ctx.drawImage(image,0,0,canvas.width,canvas.height);
       let result;
       for(const quality of [0.77,0.65,0.5,0.4]){
         result=canvas.toDataURL('image/jpeg',quality);
         if(result.length<830000)break;
       }
       if(!result||result.length>=830000)throw new Error('รูปภาพมีขนาดใหญ่เกินไป กรุณาถ่ายรูปใหม่');
       resolve(result);
     }catch(error){reject(error);}finally{URL.revokeObjectURL(url);}
   };
   image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('เปิดรูปภาพนี้ไม่ได้'));};
   image.src=url;
 });
}
function setupPreview(inputId,previewId,key){
 $(inputId).addEventListener('change',()=>{
   const previous=photoPreviewUrls[key];
   if(previous)URL.revokeObjectURL(previous);
   const file=$(inputId).files?.[0];
   photoPreviewUrls[key]=file?URL.createObjectURL(file):null;
   $(previewId).hidden=!file;
   if(file)$(previewId).src=photoPreviewUrls[key];
   else $(previewId).removeAttribute('src');
 });
}
setupPreview('photoOpen','previewOpen','open');
setupPreview('photoClose','previewClose','close');
function meterCalc(){
 const result=meterDifference($('meterOpen').value,$('meterClose').value);
 status('meterCalculation',result.ok?'จำนวนลิตรขาย '+formatLiters(result.liters)+' ลิตร':result.error,result.ok?true:null);
}
$('meterOpen').addEventListener('input',meterCalc);
$('meterClose').addEventListener('input',meterCalc);
$('meterForm').addEventListener('submit',async e=>{
 e.preventDefault();
 if(!googleStorageReady){status('meterResult','ยังไม่ได้ตั้งค่า Google Sheets และ Drive ของ STAGING จึงไม่สามารถบันทึกพร้อมรูปได้',false);return;}
 const calculation=meterDifference($('meterOpen').value,$('meterClose').value);
 if(!calculation.ok){status('meterResult',calculation.error,false);return;}
 if(!$('photoOpen').files?.[0]||!$('photoClose').files?.[0]){
  status('meterResult','กรุณาถ่ายรูปมิเตอร์เปิดและปิดให้ครบสองรูปก่อนบันทึก',false);return;
 }
 if(!window.confirm('บันทึกมิเตอร์และรูปถ่ายเข้า Google Sheets/Drive สำหรับ STAGING เท่านั้น?'))return;
 if(busy)return;busy=true;$('submitMeter').disabled=true;
 try{
  status('meterResult','กำลังเตรียมรูปถ่ายและส่งไปยัง STAGING…');
  const [openPhoto,closePhoto]=await Promise.all([
    readAndPreparePhoto($('photoOpen').files[0]),readAndPreparePhoto($('photoClose').files[0])
  ]);
  const r=await request('/v1/meters',{method:'POST',body:{
   nozzle:Number($('nozzle').value),date:$('meterDate').value,
   opening:calculation.opening,closing:calculation.closing,openPhoto,closePhoto
  }});
  if(r.persisted!==true||!r.record.hasOpenPhoto||!r.record.hasClosePhoto)
    throw new Error('ไม่พบหลักฐานยืนยันว่าบันทึกข้อมูลและรูปถาวร');
  status('meterResult','บันทึก STAGING สำเร็จ: หัว '+r.record.nozzle+' · '+formatLiters(r.record.liters)+' ลิตร · พร้อมรูปสองภาพ',true);
  $('meterForm').reset();$('meterDate').value=today();
  for(const [key,id] of [['open','previewOpen'],['close','previewClose']]){
    if(photoPreviewUrls[key])URL.revokeObjectURL(photoPreviewUrls[key]);
    photoPreviewUrls[key]=null;$(id).hidden=true;$(id).removeAttribute('src');
  }
  await refresh();
 }catch(error){status('meterResult','บันทึกไม่สำเร็จ: '+err(error),false);}
 finally{busy=false;$('submitMeter').disabled=!googleStorageReady;}
});
$('meterDate').value=today();
const DEFAULT_STAGING_API='https://bm-fuel-staging-api-staging.up.railway.app';
const stored=sessionStorage.getItem(API_STORAGE);
$('apiUrl').value=(stored && validApiUrl(stored)) ? stored : DEFAULT_STAGING_API;
check();
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{}));
