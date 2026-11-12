const CACHE_NAME='aspace-shell-v18';
const CORE=['./trainer/panel.html','./trainer/issue-code.html','./appearance.js?v=1','./assets/home/cameo-frame.svg','./assets/home/ribbon-seal.svg','./workspace-theme.css?v=4','./assets/home/art-436105.jpg','./assets/home/art-436535.jpg','./','./psychology/index.html?v=2','./psychology/app.mjs?v=2','./psychology/style.css?v=2','./psychology/course-data.mjs?v=2','./psychology/book-excerpts.mjs','./psychology/excerpt-manifest.json','./psychology/excerpts/activation.mjs','./psychology/excerpts/alliance.mjs','./psychology/excerpts/attention.mjs','./psychology/excerpts/avoidance.mjs','./psychology/excerpts/beliefs.mjs','./psychology/excerpts/biases.mjs','./psychology/excerpts/communication.mjs','./psychology/excerpts/emotions.mjs','./psychology/excerpts/evidence.mjs','./psychology/excerpts/experiments.mjs','./psychology/excerpts/goals.mjs','./psychology/excerpts/homework.mjs','./psychology/excerpts/imagery.mjs','./psychology/excerpts/integration.mjs','./psychology/excerpts/model.mjs','./psychology/excerpts/obstacles.mjs','./psychology/excerpts/problems.mjs','./psychology/excerpts/relapse.mjs','./psychology/excerpts/response.mjs','./psychology/excerpts/rules.mjs','./psychology/excerpts/standards.mjs','./psychology/excerpts/start.mjs','./psychology/excerpts/thoughts.mjs','./psychology/excerpts/worry.mjs','./psychology/index.html','./psychology/style.css','./psychology/app.mjs','./psychology/course-data.mjs','./psychology/worksheets.mjs','./psychology/vault.mjs','./usage-tracker.js','./usage-view.js','./usage-view.js?v=7','./usage.css','./index.html','./config.js','./vendor/pdf.min.js','./vendor/pdf.worker.min.js','./education/speakout-b1plus-builder.html','./cloudflare/runtime.js','./cloudflare/live-board.js','./cloudflare/merge-board.js','./cloudflare/adapter.js','./cloudflare/guest-standby.js','./cloudflare/queue.js'];
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
   const response=await fetch(request,request.mode==='navigate'?{cache:'no-cache'}:{});
   if(response&&response.ok)await cache.put(request,response.clone());
   return response;
  }catch(error){
   return await cache.match(request)||await cache.match('./index.html')||Response.error();
  }
 })());
});
