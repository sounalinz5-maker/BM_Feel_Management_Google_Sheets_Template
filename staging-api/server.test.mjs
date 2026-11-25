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
test('numeric records cannot be saved without confirmed Google Sheets STAGING',async()=>harness(async r=>{
 const login=await r('/v1/login',{method:'POST',body:{username:options.username,password:options.password}});
 const token=login.data.accessToken;
 const wrong=await r('/v1/meters',{method:'POST',token,body:{nozzle:1,date:'2026-11-25',opening:'10',closing:'9'}});
 assert.equal(wrong.status,400);
 const ok=await r('/v1/meters',{method:'POST',token,body:{nozzle:1,date:'2026-11-25',opening:'10.125',closing:'12.625'}});
 assert.equal(ok.status,503);assert.match(ok.data.error,/Google Sheets STAGING/);
 const list=await r('/v1/meters',{token});assert.equal(list.data.records.length,0);
}));
test('login attempts are rate-limited',async()=>harness(async r=>{
 for(let i=0;i<5;i++)assert.equal((await r('/v1/login',{method:'POST',body:{username:'no',password:'bad'}})).status,401);
 assert.equal((await r('/v1/login',{method:'POST',body:{username:options.username,password:options.password}})).status,429);
}));
test('missing or weak credentials prevent server startup',()=>{
 assert.throws(()=>createStagingServer({username:'x',password:'a',origin:options.origin}),/minimum 12/);
 assert.throws(()=>createStagingServer({username:'x',password:'strong-password-for-test',origin:'*'}),/Unsafe/);
});

test('storage status stays unverified and returns no temporary meter data',async()=>harness(async r=>{
 const login=await r('/v1/login',{method:'POST',body:{username:options.username,password:options.password}});
 const token=login.data.accessToken;
 const status=await r('/v1/storage-status',{token});
 assert.equal(status.status,200);assert.equal(status.data.storage,'google-not-connected');assert.equal(status.data.persisted,false);
 const photo=await r('/v1/meters',{method:'POST',token,body:{nozzle:1,date:'2026-11-25',opening:'1',closing:'2',openPhoto:'sample'}});
 assert.equal(photo.status,400);
 const numeric=await r('/v1/meters',{method:'POST',token,body:{nozzle:1,date:'2026-11-25',opening:'1',closing:'2'}});
 assert.equal(numeric.status,503);
}));
test('authenticated STAGING Google Sheets mock saves numeric-only meters',async()=>{
 const {createGoogleStagingStore}=await import('./google-storage.mjs');
 assert.equal(createGoogleStagingStore({}),null);
 assert.throws(()=>createGoogleStagingStore({BM_STAGING_SHEET_ID:'OTHER_SHEET_RESOURCE_ID'}),/Incomplete/);
 const records=[];
 let verifyCalls=0,saveCalls=0;
 const storage={
   async verify(){verifyCalls++;return true;},
   async listRecords(){return records;},
   async saveRecord(record){
     saveCalls++;
     assert.equal(record.nozzle,2);
     assert.equal(Object.hasOwn(record,'openPhoto'),false);
     assert.ok(!records.some(x=>x.nozzle===record.nozzle&&x.date===record.date));
     const saved={...record,persisted:true,source:'google-staging'};
     records.push(saved);return saved;
   }
 };
 const server=createStagingServer({...options,storage});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const base='http://127.0.0.1:'+server.address().port;
 async function q(path,{method='GET',token,body}={}){
   const headers={Origin:options.origin};if(token)headers.Authorization='Bearer '+token;
   if(body!==undefined)headers['Content-Type']='application/json';
   const res=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
   return {status:res.status,data:await res.json()};
 }
 try{
   assert.equal((await q('/v1/storage-status')).status,401);
   const login=await q('/v1/login',{method:'POST',body:{username:options.username,password:options.password}});
   const token=login.data.accessToken;
   const status=await q('/v1/storage-status',{token});
   assert.equal(status.data.storage,'google-staging');
   assert.equal(status.data.persisted,true);
   assert.equal(status.data.photoEvidence,false);
   assert.equal(verifyCalls,1);
   const record={nozzle:2,date:'2026-11-25',opening:'100.125',closing:'102.625'};
   const invalid=await q('/v1/meters',{method:'POST',token,body:{...record,closePhoto:'not-needed'}});
   assert.equal(invalid.status,400);
   assert.equal(saveCalls,0);
   const saved=await q('/v1/meters',{method:'POST',token,body:record});
   assert.equal(saved.status,201);assert.equal(saved.data.persisted,true);
   assert.equal(saved.data.record.liters,2.5);assert.equal(saveCalls,1);
   const list=await q('/v1/meters',{token});
   assert.equal(list.status,200);assert.equal(list.data.records.length,1);
   assert.equal(list.data.records[0].hasOpenPhoto,undefined);
   assert.equal((await q('/v1/meter-photos/'+saved.data.record.id+'/open',{token})).status,404);
 }finally{await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));}
});
test('STAGING Google Sheets target is locked to approved ID',async()=>{
 const {createGoogleStagingStore}=await import('./google-storage.mjs');
 const creds=JSON.stringify({type:'authorized_user',client_id:'fake',client_secret:'fake',refresh_token:'fake'});
 assert.throws(()=>createGoogleStagingStore({
   BM_STAGING_GOOGLE_AUTH_JSON:creds,BM_STAGING_SHEET_ID:'PRODUCTION_OTHER_SHEET_ID'
 }),/Refusing to access any spreadsheet outside approved/);
});
test('fail-closed when STAGING Google credentials are only partially set',async()=>{
 const {createGoogleStagingStore}=await import('./google-storage.mjs');
 assert.throws(()=>createGoogleStagingStore({
   BM_STAGING_GOOGLE_AUTH_JSON:'{}',BM_STAGING_SHEET_ID:'1OslhbqwN_CQaMEWG92Ktu7OaeJSdEigNSIe8RHry0hU'
 }),/Expected authorized_user OAuth or service_account/);
});
