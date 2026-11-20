self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil((async()=>{
for(const key of await caches.keys())if(key.startsWith('aspace-shell-')||key==='aspace-rhetoric-texts')await caches.delete(key);
await self.registration.unregister();
})()));