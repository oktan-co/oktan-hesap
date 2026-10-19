// Kurulabilir uygulama için gerekli. Hiçbir şeyi önbelleğe almaz; her zaman güncel sürüm yüklenir.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',()=>{});
