const CACHE="bm-fuel-staging-shell-v2";
const CORE=["./","./index.html","./staging.mjs","./manifest.json","../app/styles.css"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("bm-fuel-staging-shell-")&&k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()])));
self.addEventListener("fetch",e=>{
 const url=new URL(e.request.url),base=new URL("./",self.location.href);
 if(e.request.method!=="GET"||url.origin!==base.origin||!url.pathname.startsWith(base.pathname))return;
 if(e.request.mode==="navigate"){e.respondWith(fetch(e.request).catch(()=>caches.match("./index.html")));return}
 e.respondWith(fetch(e.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(e.request,copy));}return response;}).catch(()=>caches.match(e.request)));
});