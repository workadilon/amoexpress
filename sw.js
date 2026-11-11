/* AMO Express 5.1.3 — atualizações sem cache obsoleto */
const CACHE='amo-express-shell-v5-1-3';
const SHELL=['./index.html','./tracking.html','./tracking.js','./styles.css','./app.js','./config.js','./manifest.webmanifest'];
const ASSETS=['./icons/icon-192.png','./icons/icon-512.png'];
const SUPA='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/dist/umd/supabase.js';
const QR='https://cdn.jsdelivr.net/npm/qrcode@1.5.4/lib/browser.min.js';
const scopedPath=path=>new URL(path,self.registration.scope).pathname;
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await Promise.allSettled([...SHELL,...ASSETS,SUPA].map(path=>cache.add(new Request(path,{cache:'no-store'}))));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith('amo-express-shell-')&&key!==CACHE).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});
async function networkFirst(request,fallbackPath){
  const cache=await caches.open(CACHE);
  try{
    // Ignora o cache HTTP para buscar a versão publicada, sem apagar a cópia offline.
    const response=await fetch(request,{cache:'no-store'});
    if(response.ok){try{await cache.put(request,response.clone())}catch(error){console.warn('Não foi possível atualizar o cache',error)}}
    return response;
  }catch(error){
    const cached=await cache.match(request,{ignoreSearch:true}) || (fallbackPath&&await cache.match(fallbackPath));
    if(cached)return cached;
    throw error;
  }
}
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin===self.location.origin){
    if(event.request.mode==='navigate'){
      event.respondWith(networkFirst(event.request,url.pathname.endsWith('/tracking.html')?'./tracking.html':'./index.html'));
      return;
    }
    if(SHELL.some(path=>scopedPath(path)===url.pathname)){
      event.respondWith(networkFirst(event.request));
      return;
    }
    if(ASSETS.some(path=>scopedPath(path)===url.pathname)){
      event.respondWith(caches.match(event.request,{ignoreSearch:true}).then(hit=>hit||networkFirst(event.request)));
    }
    return;
  }
  // O SDK é externo: manter cache para funcionamento offline, mas nunca interceptar Supabase Auth/API.
  if(event.request.url===SUPA||event.request.url===QR){
    event.respondWith(networkFirst(event.request));
  }
});
