const CACHE='bm-fuel-launcher-v1';
const CORE=['./','./index.html','./manifest.json','./icons/icon-192.png','./icons/icon-512.png','./icons/maskable-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('bm-fuel-launcher-')&&k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()])));
self.addEventListener('fetch',event=>{
 const req=event.request;if(req.method!=='GET')return;
 const u=new URL(req.url);
 if(u.origin!==self.location.origin||!u.pathname.startsWith(new URL('./',self.location.href).pathname))return;
 if(req.mode==='navigate'){event.respondWith(fetch(req).then(res=>res.ok?res:Promise.reject(new Error('HTTP '+res.status))).catch(()=>caches.match('./index.html')));return;}
 event.respondWith(caches.match(req).then(cached=>cached||fetch(req)));
});