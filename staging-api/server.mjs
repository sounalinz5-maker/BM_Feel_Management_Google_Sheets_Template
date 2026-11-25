import {createServer} from 'node:http';
import {randomBytes,createHash,scryptSync,timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createGoogleStagingStore} from './google-storage.mjs';
import {demoSeries,demoTanks,demoActivity,demoDailyLak,demoReceipts} from '../app/demo-data.mjs';
import {meterDifference,NOZZLES,sumByFuel} from '../app/logic.mjs';

// STAGING-only sample server. Uses temporary memory unless explicit isolated Google Sheets credentials are configured.
// Use HTTPS at the public edge (e.g. via an approved HTTPS hosting service).
const SESSION_MS = 6*60*60*1000, BODY_LIMIT = 8192, LOGIN_LIMIT = 5;
function sha(value){return createHash('sha256').update(String(value)).digest('hex');}
function bodyJson(req,limit=BODY_LIMIT){
  return new Promise((resolve,reject)=>{
    let data='',bytes=0,done=false;
    req.on('data',chunk=>{
      if(done)return;
      bytes+=chunk.length;
      if(bytes>limit){done=true;reject(Object.assign(new Error('Payload too large'),{status:413}));req.destroy();return;}
      data+=chunk.toString('utf8');
    });
    req.on('end',()=>{if(done)return;try{resolve(JSON.parse(data||'{}'));}catch{reject(Object.assign(new Error('Invalid JSON'),{status:400}));}});
    req.on('error',err=>{if(!done)reject(err);});
  });
}
function send(res,status,payload,headers={}){
  const raw=JSON.stringify(payload);
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(raw),
    'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
    'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",...headers});
  res.end(raw);
}
export function createStagingServer({
  username=process.env.BM_STAGING_USERNAME,
  password=process.env.BM_STAGING_PASSWORD,
  origin=process.env.BM_STAGING_ORIGIN || 'https://sounalinz5-maker.github.io',
  clock=()=>Date.now(),
  storage=undefined
}={}){
  if(!username||!password||password.length<12)throw Error('Set BM_STAGING_USERNAME and a strong BM_STAGING_PASSWORD (minimum 12 characters)');
  if(!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/.test(origin)&&!/^http:\/\/localhost(?::\d+)?$/.test(origin))throw Error('Unsafe staging browser origin');
  const salt=randomBytes(32);
  const passwordHash=scryptSync(password,salt,64);
  const sessions=new Map(), attempts=new Map(), meters=[];
  const store=storage===undefined ? createGoogleStagingStore() : storage;
  const server=createServer(async(req,res)=>{
    const requestOrigin=req.headers.origin;
    const headers=requestOrigin===origin?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{'Vary':'Origin'};
    if(requestOrigin && requestOrigin!==origin)return send(res,403,{error:'Origin not allowed'},headers);
    if(req.method==='OPTIONS'){
      res.writeHead(204,{...headers,'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Max-Age':'300',
        'Cache-Control':'no-store'});res.end();return;
    }
    const url=new URL(req.url||'/', 'http://localhost');
    const route=url.pathname;
    try{
      if(route==='/v1/health'&&req.method==='GET')return send(res,200,{ok:true,service:'bm-fuel-staging',mode:'sample-only',auth:true,photoEvidence:false},headers);
      if(route==='/v1/login'&&req.method==='POST'){
        const ip=req.socket.remoteAddress||'unknown',now=clock();
        const prev=attempts.get(ip)||{since:now,count:0};
        if(now-prev.since>15*60*1000){prev.count=0;prev.since=now;}
        if(prev.count>=LOGIN_LIMIT)return send(res,429,{error:'Too many attempts. Try again later.'},headers);
        const input=await bodyJson(req);
        const inputPassword=String(input.password??'');
        if(inputPassword.length>2048||String(input.username??'').length>120)return send(res,400,{error:'Invalid input'},headers);
        const inputHash=scryptSync(inputPassword,salt,64);
        const match=timingSafeEqual(inputHash,passwordHash)&&String(input.username||'')===username;
        if(!match){prev.count++;attempts.set(ip,prev);return send(res,401,{error:'Invalid username or password'},headers);}
        attempts.delete(ip);
        const accessToken=randomBytes(32).toString('hex');
        sessions.set(sha(accessToken),{username,role:'OWNER_STAGING',expiresAt:now+SESSION_MS});
        return send(res,200,{ok:true,accessToken,expiresIn:SESSION_MS/1000,user:{displayName:'Staging Owner',role:'OWNER_STAGING'},mode:'sample-only'},headers);
      }
      const auth=(req.headers.authorization||'').match(/^Bearer ([0-9a-f]{64})$/i);
      const tokenHash=auth?sha(auth[1]):'';
      const session=sessions.get(tokenHash);
      if(!session || session.expiresAt<=clock()){
        if(session)sessions.delete(tokenHash);
        return send(res,401,{error:'Session expired or missing'},headers);
      }
      if(route==='/v1/me'&&req.method==='GET')return send(res,200,{ok:true,user:{displayName:'Staging Owner',role:session.role},mode:'sample-only'},headers);
      if(route==='/v1/storage-status'&&req.method==='GET'){
        if(!store)return send(res,200,{ok:true,mode:'sample-only',storage:'memory-only',photoEvidence:false,persisted:false},headers);
        try{await store.verify();return send(res,200,{ok:true,mode:'sample-only',storage:'google-staging',photoEvidence:false,persisted:true},headers);}
        catch(error){return send(res,503,{ok:false,mode:'sample-only',error:'STAGING Google Sheets/Drive has not been verified'},headers);}
      }
      if(route==='/v1/dashboard'&&req.method==='GET'){
        return send(res,200,{ok:true,mode:'sample-only',data:{
          series:demoSeries, tanks:demoTanks, activity:demoActivity,
          dailyLak:demoDailyLak, receipts:demoReceipts, nozzleCount:6,
          meterRecords:store ? (await store.listRecords()).slice(-20) : meters.slice(-20)
        }},headers);
      }
      if(route==='/v1/meters'&&req.method==='GET')
        return send(res,200,{ok:true,mode:'sample-only',storage:store?'google-staging':'memory-only',
          records:(store?await store.listRecords():meters).slice(-50).map(({_openPhotoId,_closePhotoId,...safe})=>safe)},headers);
      if(route==='/v1/meters'&&req.method==='POST'){
        const m=await bodyJson(req);
        const nozzle=Number(m.nozzle),nozzleSpec=NOZZLES.find(n=>n.id===nozzle);
        const date=String(m.date||'');
        const quantity=meterDifference(m.opening,m.closing);
        if(!nozzleSpec||!quantity.ok||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z')))
          return send(res,400,{error:'Invalid nozzle/date/meter reading'},headers);
        if('image' in m || 'openPhoto' in m || 'closePhoto' in m)
          return send(res,400,{error:'Photo fields are not supported for meter records'},headers);
        const saved={id:randomBytes(16).toString('hex'),nozzle,date,fuel:nozzleSpec.fuel,
          opening:quantity.opening,closing:quantity.closing,liters:quantity.liters,createdAt:new Date(clock()).toISOString()};
        if(store){
          const persisted=await store.saveRecord(saved);
          return send(res,201,{ok:true,mode:'sample-only',persisted:true,storage:'google-staging',record:persisted},headers);
        }
        if(meters.some(x=>x.nozzle===nozzle && x.date===date))
          return send(res,409,{error:'Staging meter for this nozzle/date already exists'},headers);
        meters.push(saved);
        return send(res,201,{ok:true,mode:'sample-only',persisted:false,storage:'memory-only',record:saved},headers);
      }
      if(route==='/v1/logout'&&req.method==='POST'){
        sessions.delete(tokenHash);
        return send(res,200,{ok:true},headers);
      }
      return send(res,404,{error:'Not found'},headers);
    }catch(e){
      if(res.destroyed||res.writableEnded)return;
      return send(res,e.status||500,{error:e.status?e.message:'Request failed'},headers);
    }
  });
  return server;
}
if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]){
  const server=createStagingServer();
  // Bind to the injected hosting port; use loopback for local development.
  // This is staging sample data only. HTTPS must terminate at the hosting provider.
  const host=process.env.BM_STAGING_HOST||(process.env.PORT?'0.0.0.0':'127.0.0.1');
  const port=Number(process.env.PORT||8787);
  server.listen(port,host,()=>console.log('BM staging sample-only API listening on '+host+':'+port));
}
