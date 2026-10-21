// Kurulabilir uygulama ve bildirimler için gerekli. Hiçbir şeyi önbelleğe almaz; her zaman güncel sürüm yüklenir.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',()=>{});
// Sunucudan gelen son ödeme bildirimini göster (başlık ve metin "data" içinde gelir).
self.addEventListener('push',e=>{
  let d={};try{d=e.data.json()}catch(x){}
  const n=d.notification||{},dt=d.data||{};
  const tag=dt.tag||undefined;
  e.waitUntil(self.registration.showNotification(n.title||dt.title||'Oktan Hesap Takip',{body:n.body||dt.body||'',icon:'icon-192.png',badge:'icon-192.png',tag,renotify:!!tag}));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(l=>{
    for(const c of l){if('focus' in c)return c.focus()}
    return self.clients.openWindow(self.registration.scope);
  }));
});
