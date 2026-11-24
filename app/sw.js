/* BM FUEL preview PWA, cache only local UI assets. Never cache Apps Script or private data. */
const CACHE_NAME="bm-fuel-pwa-preview-v2";
const ROOT=new URL("./",self.location.href);
const ASSETS=["./","./index.html","./styles.css","./app.mjs","./logic.mjs","./demo-data.mjs","./manifest.json","../mobile/icons/icon-192.png","../mobile/icons/icon-512.png","../mobile/icons/maskable-512.png"];
self.addEventListener("install",event=>event.waitUntil(
  caches.open(CACHE_NAME).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())
));
self.addEventListener("activate",event=>event.waitUntil(Promise.all([
  caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("bm-fuel-pwa-preview-")&&key!==CACHE_NAME).map(key=>caches.delete(key)))),
  self.clients.claim()
])));
self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET"||request.headers.has("Authorization"))return;
  const url=new URL(request.url);
  if(url.origin!==ROOT.origin || !url.pathname.startsWith(ROOT.pathname))return;
  if(request.mode==="navigate"){
    event.respondWith(fetch(request).catch(()=>caches.match("./index.html")));
    return;
  }
  event.respondWith(caches.match(request).then(cached=>cached||fetch(request)));
});
