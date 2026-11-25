import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createStagingServer} from './server.mjs';
const options={username:'staging-test',password:'local-test-only-long-secret',origin:'http://localhost:45000'};
async function harness(fn){
  const server=createStagingServer(options);
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port;
  async function request(path,{method='GET',body,token,origin=options.origin}={}){
    const headers={'Origin':origin};
    if(body!==undefined)headers['Content-Type']='application/json';
    if(token)headers.Authorization='Bearer '+token;
    const response=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
    const data=await response.json();
    return {status:response.status,headers:response.headers,data};
  }
  try{await fn(request);}finally{await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
}
test('protects dashboard and rejects wrong web origin',async()=>harness(async r=>{
 assert.equal((await r('/v1/dashboard')).status,401);
 assert.equal((await r('/v1/health',{origin:'https://evil.example'})).status,403);
 const h=await r('/v1/health');assert.equal(h.status,200);assert.equal(h.data.mode,'sample-only');
}));
test('login is real server-side verification; logout revokes access',async()=>harness(async r=>{
 const wrong=await r('/v1/login',{method:'POST',body:{username:options.username,password:'bad'}});
 assert.equal(wrong.status,401);
 const res=await r('/v1/login',{method:'POST',body:{username:options.username,password:options.password}});
 assert.equal(res.status,200);assert.match(res.data.accessToken,/^[a-f0-9]{64}$/);
 const tok=res.data.accessToken;
 const db=await r('/v1/dashboard',{token:tok});
 assert.equal(db.status,200);assert.equal(db.data.data.series.length,30);
 assert.equal(db.data.data.nozzleCount,6);
 assert.equal(db.data.mode,'sample-only');
 assert.equal((await r('/v1/logout',{method:'POST',token:tok})).status,200);
 assert.equal((await r('/v1/me',{token:tok})).status,401);
}));
test('staging meter writes remain ephemeral and cannot contain photo data',async()=>harness(async r=>{
 const login=await r('/v1/login',{method:'POST',body:{username:options.username,password:options.password}});const token=login.data.accessToken;
 const bad=await r('/v1/meters',{method:'POST',token,body:{nozzle:1,date:'2026-11-25',opening:'12',closing:'10'}});
 assert.equal(bad.status,400);
 const photo=await r('/v1/meters',{method:'POST',token,body:{nozzle:1,date:'2026-11-25',opening:'10',closing:'12',openPhoto:'image'}});
 assert.equal(photo.status,503);
 const good=await r('/v1/meters',{method:'POST',token,body:{nozzle:1,date:'2026-11-25',opening:'10.125',closing:'12.625'}});
 assert.equal(good.status,201);assert.equal(good.data.record.liters,2.5);assert.equal(good.data.persisted,false);
 const rec=await r('/v1/meters',{token});assert.equal(rec.data.records.length,1);
}));
test('login attempts are rate-limited',async()=>harness(async r=>{
 for(let i=0;i<5;i++)assert.equal((await r('/v1/login',{method:'POST',body:{username:'no',password:'bad'}})).status,401);
 assert.equal((await r('/v1/login',{method:'POST',body:{username:options.username,password:options.password}})).status,429);
}));
test('missing or weak credentials prevent server startup',()=>{
 assert.throws(()=>createStagingServer({username:'x',password:'a',origin:options.origin}),/minimum 12/);
 assert.throws(()=>createStagingServer({username:'x',password:'strong-password-for-test',origin:'*'}),/Unsafe/);
});

test('photo uploads require isolated staging Google configuration',async()=>harness(async r=>{
 const login=await r('/v1/login',{method:'POST',body:{username:options.username,password:options.password}});
 const token=login.data.accessToken;
 const status=await r('/v1/storage-status',{token});
 assert.equal(status.status,200);assert.equal(status.data.storage,'memory-only');
 const photo=await r('/v1/meters',{method:'POST',token,body:{
   nozzle:1,date:'2026-11-25',opening:'1',closing:'2',openPhoto:'data:image/jpeg;base64,AA=='
 }});
 assert.equal(photo.status,503);
}));
test('authenticated STAGING Sheets/Drive mock saves two photo evidence objects',async()=>{
 const {createGoogleStagingStore}=await import('./google-storage.mjs');
 assert.equal(createGoogleStagingStore({}),null);
 assert.throws(()=>createGoogleStagingStore({BM_STAGING_SHEET_ID:'STAGINGONLYRESOURCEID'}),/Incomplete/);
 let records=[],verifyCalls=0,saveCalls=0,photoReads=0;
 const storage={
   async verify(){verifyCalls++;return true;},
   async listRecords(){return records;},
   async saveRecord(record,opening,closing){
     saveCalls++;
     assert.equal(opening[0],0xff);assert.equal(closing[1],0xd8);
     assert.ok(!records.some(x=>x.nozzle===record.nozzle&&x.date===record.date));
     const saved={...record,persisted:true,source:'google-staging',hasOpenPhoto:true,hasClosePhoto:true,
       _openPhotoId:'PHOTOIDOPEN123456789',_closePhotoId:'PHOTOIDCLOSE123456789'};
     records.push(saved);return saved;
   },
   async readPhoto(){photoReads++;return jpegBytes;}
 };
 const jpegBytes=Buffer.concat([Buffer.from([0xff,0xd8]),Buffer.alloc(120),Buffer.from([0xff,0xd9])]);
 const image='data:image/jpeg;base64,'+jpegBytes.toString('base64');
 const server=createStagingServer({...options,storage});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const base='http://127.0.0.1:'+server.address().port;
 async function q(path,{method='GET',token,body}={}){
   const headers={Origin:options.origin};if(token)headers.Authorization='Bearer '+token;
   if(body!==undefined)headers['Content-Type']='application/json';
   const res=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
   let data=undefined; if(res.headers.get('content-type')?.includes('application/json'))data=await res.json();
   return {status:res.status,data,headers:res.headers};
 }
 try{
   const unauthorized=await q('/v1/storage-status');assert.equal(unauthorized.status,401);
   const login=await q('/v1/login',{method:'POST',body:{username:options.username,password:options.password}});
   const token=login.data.accessToken;
   const status=await q('/v1/storage-status',{token});
   assert.equal(status.data.storage,'google-staging');assert.equal(status.data.persisted,true);
   assert.equal(verifyCalls,1);
   const record={nozzle:2,date:'2026-11-25',opening:'100.125',closing:'102.625',openPhoto:image,closePhoto:image};
   const bad=await q('/v1/meters',{method:'POST',token,body:{...record,closePhoto:'data:image/png;base64,AAAA'}});
   assert.equal(bad.status,400);assert.equal(saveCalls,0);
   const saved=await q('/v1/meters',{method:'POST',token,body:record});
   assert.equal(saved.status,201);assert.equal(saved.data.persisted,true);
   assert.equal(saved.data.record.liters,2.5);assert.equal(saveCalls,1);
   const list=await q('/v1/meters',{token});
   assert.equal(list.status,200);assert.equal(list.data.records.length,1);
   assert.equal(list.data.records[0]._openPhotoId,undefined);
   const photo=await q('/v1/meter-photos/'+saved.data.record.id+'/open',{token});
   assert.equal(photo.status,200);assert.equal(photo.headers.get('content-type'),'image/jpeg');assert.equal(photoReads,1);
   assert.equal((await q('/v1/meter-photos/'+saved.data.record.id+'/open')).status,401);
 }finally{await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));}
});
test('fail-closed when STAGING Google credentials are only partially set',async()=>{
 const {createGoogleStagingStore}=await import('./google-storage.mjs');
 assert.throws(()=>createGoogleStagingStore({
   BM_STAGING_GOOGLE_AUTH_JSON:'{}',BM_STAGING_SHEET_ID:'STAGINGONLY123456',BM_STAGING_DRIVE_FOLDER_ID:'STAGINGONLY123456'
 }),/Expected authorized_user OAuth or service_account/);
});
