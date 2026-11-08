const CACHE_NAME='aspace-shell-v4';
const CORE=['./','./index.html','./config.js','./vendor/pdf.min.js','./vendor/pdf.worker.min.js','./education/speakout-b1plus-builder.html','./cloudflare/runtime.js','./cloudflare/live-board.js','./cloudflare/merge-board.js','./cloudflare/adapter.js','./cloudflare/guest-standby.js','./cloudflare/queue.js'];
self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE_NAME);
  await Promise.all(CORE.map(async path=>{try{const response=await fetch(path,{cache:'reload'});if(response.ok)await cache.put(path,response)}catch{}}));
  await self.skipWaiting();
 })());
});
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith('aspace-shell-')&&key!==CACHE_NAME).map(key=>caches.delete(key)));
  await self.clients.claim();
 })());
});
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET')return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin)return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE_NAME);
  try{
   const response=await fetch(request);
   if(response&&response.ok)await cache.put(request,response.clone());
   return response;
  }catch(error){
   return await cache.match(request)||await cache.match('./index.html')||Response.error();
  }
 })());
});
