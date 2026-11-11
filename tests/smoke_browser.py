"""Teste UI sem dados externos: mocks Supabase, Playwright Chromium. Não grava na produção."""
import asyncio, subprocess, json, re
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
PORT=8776
ADMIN='11111111-1111-4111-8111-111111111111'
COMPANY='22222222-2222-4222-8222-222222222222'
DRIVER='33333333-3333-4333-8333-333333333333'
DID='44444444-4444-4444-8444-444444444444'
CLIENT='55555555-5555-4555-8555-555555555555'
PRODUCT='66666666-6666-4666-8666-666666666666'
MOCK=r'''
window.__calls=[];
window.__writes=[];
const U='11111111-1111-4111-8111-111111111111';
const C='22222222-2222-4222-8222-222222222222';
const D='33333333-3333-4333-8333-333333333333';
const DI='44444444-4444-4444-8444-444444444444';
const fixtures={
 companies:[{id:C,name:'Empresa Teste',status:'Ativa',created_at:'2026-11-11T10:00:00Z'}],
 company_members:[{company_id:C,user_id:U}],
 app_admins:[{user_id:U}],
 clients:[{id:'55555555-5555-4555-8555-555555555555',company_id:C,name:'Pessoa Teste',phone:'66999999999',address:'Rua dos Testes 1',neighborhood:'Centro'}],
 products:[{id:'66666666-6666-4666-8666-666666666666',company_id:C,name:'Pacote',default_price:15,weight:'2 kg'}],
 deliveries:[{id:DI,company_id:C,client_id:'55555555-5555-4555-8555-555555555555',product_id:'66666666-6666-4666-8666-666666666666',client_name:'Pessoa Teste',product_name:'Pacote',neighborhood:'Centro',fee:12,driver_fee:6,status:'Pendente',created_at:'2026-11-11T10:00:00Z',updated_at:'2026-11-11T10:00:00Z',assigned_driver_id:null,notes:''}],
 neighborhood_rates:[{id:'77777777-7777-4777-8777-777777777777',neighborhood:'Centro',fee:12}],
 drivers:[{user_id:D,name:'Motoboy Teste',active:true,created_at:'2026-11-11T10:00:00Z'}],
 delivery_events:[],notifications:[],driver_locations:[],delivery_ratings:[],amo_audit_log:[],
 logistics_settings:[{id:1,per_km:0,heavy_item_fee:0,heavy_threshold_kg:10}],
 delivery_stops:[],tracking_tokens:[],financial_settlements:[],financial_settlement_items:[],
 client_error_events:[],integration_outbox:[]
};
function builder(table){
 let eqs=[],limit=Infinity,one=false,payload=null,method='select';
 const obj={
 select(){return this},order(){return this},eq(key,value){eqs.push([key,value]);return this},
 is(){return this},limit(n){limit=n;return this},maybeSingle(){one=true;return this},
 insert(data){method='insert';payload=data;return this},upsert(data){method='upsert';payload=data;return this},
 update(data){method='update';payload=data;return this},delete(){method='delete';return this},
 then(ok,bad){window.__calls.push(table);let rows=(fixtures[table]||[]).filter(r=>eqs.every(([k,v])=>r[k]===v)).slice(0,limit);
 if(method!=='select'){window.__writes.push({table,method,payload});if(method==='insert'&&payload){fixtures[table].push(...(Array.isArray(payload)?payload:[payload]).map(x=>({...x,id:x.id||crypto.randomUUID()})))};}
 return Promise.resolve({data:one?(rows[0]||null):rows,error:null}).then(ok,bad)}
 };
 return obj;
}
window.supabase={createClient(){return {
 auth:{onAuthStateChange(){},getSession:async()=>({data:{session:{access_token:'fake-test-token',user:{id:U,email:'test@invalid.local'}}},error:null}),signInWithPassword:async()=>({data:{user:{id:U}}})},
 from:builder,rpc:async(name,args)=>{window.__calls.push('rpc:'+name);if(name==='amo_assign_pending')return {data:1,error:null};if(name==='amo_close_settlement')return {data:crypto.randomUUID(),error:null};if(name==='amo_public_tracking')return {data:{code:'44444444',status:'Em trânsito',neighborhood:'Centro',scheduled_at:null,updated_at:new Date().toISOString(),delivered_at:null},error:null};return {data:0,error:null}},
 channel(){return {on(){return this},subscribe(fn){fn?.('SUBSCRIBED');return this},unsubscribe(){}}},
 functions:{invoke:async()=>({data:{sent:0,failed:0},error:null})},
 storage:{from(){return {upload:async()=>({data:{},error:null})}}}
 }}};
'''
async def smoke():
 try:
  async with async_playwright() as p:
   browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
   page=await browser.new_page(viewport={'width':390,'height':844})
   page.set_default_timeout(4000)
   errs=[]
   page.on('pageerror',lambda err:errs.append(str(err)))
   async def dropcdn(route):await route.fulfill(status=200,body='/* test CDN offline */',content_type='application/javascript')
   async def config(route):await route.fulfill(status=200,body='window.AMO_CONFIG={supabaseUrl:"https://test.supabase.co",supabaseAnonKey:"sb_publishable_test_key"};',content_type='application/javascript')
   html=ROOT.joinpath('index.html').read_text()
   html=re.sub(r'<script\b[^>]*>.*?</script>','',html,flags=re.I|re.S)
   await page.set_content(html,wait_until='domcontentloaded')
   await page.evaluate('Object.defineProperty(document,"baseURI",{value:"https://amo-express.example.test/",configurable:true})')
   await page.evaluate('window.AMO_CONFIG={supabaseUrl:"https://test.supabase.co",supabaseAnonKey:"sb_publishable_test_key"};')
   await page.evaluate(MOCK)
   await page.add_script_tag(content=ROOT.joinpath('app.js').read_text())
   print('SECURE?',await page.evaluate('window.isSecureContext'))
   await page.wait_for_timeout(800)
   h1=await page.locator('main h1').all_text_contents()
   assert any('Visão geral' in x for x in h1),('home',h1,await page.locator('#app').inner_text())
   await page.locator('[data-act="tab"][data-id="more"]').first.click()
   assert await page.locator('[data-id="financeV51"]').count()
   await page.locator('[data-id="financeV51"]').first.click()
   assert 'Financeiro e repasses' in await page.locator('#app').inner_text()
   await page.locator('[data-act="close-company"]').click()
   assert await page.locator('select[name="party_id"]').count()==1
   await page.locator('[data-act="close"]').first.click()
   # after finance view, nav is "Mais", use nav again
   await page.locator('[data-id="more"][data-act="tab"]').first.click()
   await page.locator('[data-id="monitorV51"][data-act="tab"]').first.click()
   assert 'Saúde e sincronização' in await page.locator('#app').inner_text()
   await page.locator('[data-id="more"][data-act="tab"]').first.click()
   await page.locator('[data-id="operations"][data-act="tab"]').first.click()
   assert 'Indicadores de desempenho' in await page.locator('#app').inner_text()
   await page.locator('[data-id="deliveries"][data-act="tab"]').first.click()
   assert await page.locator('[data-act="stops"]').count()>0
   await page.locator('.tile-details summary').first.click()
   await page.locator('[data-act="stops"]').first.click()
   assert 'Paradas do frete' in await page.locator('#modal').inner_text()
   await page.locator('[data-act="close"]').first.click()
   await page.evaluate('Object.defineProperty(window,"isSecureContext",{value:true, configurable:true})')
   await page.evaluate('''(() => {const orig=window.crypto;Object.defineProperty(window,'crypto',{value:{getRandomValues:(arr)=>orig.getRandomValues(arr),subtle:{digest:async()=>new Uint8Array(32).fill(42).buffer}},configurable:true})})()''')
   await page.locator('[data-act="tracking-link"]').first.click()
   await page.wait_for_timeout(250)
   assert 'Rastreamento temporário' in await page.locator('#modal').inner_text()
   assert await page.locator('#amo-public-link').count()==1
   tracking_url=await page.locator('#amo-public-link').input_value()
   assert 'tracking.html#' in tracking_url and len(tracking_url.split('#')[1])==64
   await page.locator('[data-act="close"]').first.click()
   await page.locator('[data-act="receipt"]').first.click()
   await page.wait_for_timeout(100)
   assert not errs,errs
   print('PASS admin mobile: dashboard, financeiro, monitor, operações, paradas, token, recibo')
   print('calls',len(await page.evaluate('window.__calls')),'writes',await page.evaluate('window.__writes.map(x=>x.table)'))
   track=ROOT.joinpath('tracking.html').read_text()
   track=re.sub(r'<script\b[^>]*>.*?</script>','',track,flags=re.I|re.S)
   await page.set_content(track)
   await page.evaluate('history.replaceState(null,"","#'+('a'*64)+'")')
   await page.add_script_tag(content=ROOT.joinpath('tracking.js').read_text())
   await page.wait_for_timeout(300)
   text=await page.locator('#tracking-result').inner_text()
   assert 'Em trânsito' in text,text
   assert not errs,errs
   print('PASS public tracking (token, page, auth anon simulation)')
   await browser.close()
 finally:
  pass
asyncio.run(smoke())
