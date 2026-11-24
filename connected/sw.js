const CACHE="bm-fuel-connected-preview-v1";const CORE=["./","./index.html","./manifest.json"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));
self.addEventListener("fetch",e=>{if(e.request.method!=="GET")return;let u=new URL(e.request.url),root=new URL("./",self.location.href);if(u.origin!==root.origin||!u.pathname.startsWith(root.pathname))return;
if(e.request.mode==="navigate"){e.respondWith(fetch(e.request).catch(()=>caches.match("./index.html")));return}
e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)))});
