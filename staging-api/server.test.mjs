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
 assert.equal(photo.status,400);
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
