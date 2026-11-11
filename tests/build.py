from pathlib import Path
import re
base=Path(__file__).resolve().parents[1]
p=base/'app.js'
s=(base/'source/app-5-0-1.js').read_text()

def replace(old,new,count=1):
 global s
 n=s.count(old)
 assert n==count,(old[:130],n,count)
 s=s.replace(old,new,count)

replace("const err=e=>{console.error(e);notify(e?.message||'Não foi possível concluir a operação.',true)};",
        "const err=e=>{console.error(e);notify(e?.message||'Não foi possível concluir a operação.',true);v51LogError(e)};")
replace("[['reports','▥','Relatórios'],['operations','◷','Operação']", "[['reports','▥','Relatórios'],['financeV51','▥','Financeiro'],['monitorV51','◉','Monitor'],['operations','◷','Operação']")
replace("const views={home,deliveries,clients,products,companies,rates,reports,drivers,notifications,settings,more,operations,logistics,auditView};",
        "const views={home,deliveries,clients,products,companies,rates,reports,drivers,notifications,settings,more,operations,logistics,auditView,financeV51:v51Finance,monitorV51:v51Monitor};")
replace("${button('Sincronizar agora','reload','','btn small')}${button('Ativar avisos do navegador'", "${button('Sincronizar agora','reload','','btn small')}${button('Monitor','tab','monitorV51','btn small subtle')}${button('Ativar avisos do navegador'")
replace("${button('Acompanhar','timeline',d.id,'btn small subtle')}", "${button('Acompanhar','timeline',d.id,'btn small subtle')}${v51StopButtons(d)}")
replace("${state.admin?button('Verificar atrasos','check-delays','','btn small soft'):''}",
        "${state.admin?button('Verificar atrasos','check-delays','','btn small soft')+button('Distribuir 10 fretes','auto-assign','','btn small'):''}")
replace("${[...late,...active.filter(x=>!late.includes(x))].slice(0,12).map(deliveryCard).join('')||empty('Nenhum frete em aberto')}</div>`}",
        "${[...late,...active.filter(x=>!late.includes(x))].slice(0,12).map(deliveryCard).join('')||empty('Nenhum frete em aberto')}</div>${v51Kpis()}`}\n".replace('\\n','\n'))
replace("async function save(form){let {kind,id}=form.dataset,d=fd(form),submit=form.querySelector('[type=\"submit\"]');submit.disabled=true;try{",
        """async function save(form){let {kind,id}=form.dataset,d=fd(form),submit=form.querySelector('[type="submit"]');
 if(['stops-add','settle-company','settle-driver'].includes(kind)){
  submit.disabled=true;
  try{if(kind==='stops-add')await v51SaveStops(id,d.stops_text);
   else await v51SaveSettlement(kind==='settle-company'?'company':'driver',d)}
  catch(e){err(e)}finally{submit.disabled=false}return;
 }
 submit.disabled=true;try{""")
replace("state.extrasAvailable=!!settings;\n}","state.extrasAvailable=!!settings;\n await v51Load();\n}")
replace("function subscribe(){if(!state.user)return;state.channel?.unsubscribe();state.channel=db.channel('amo-live-'+state.user.id).on('postgres_changes',{event:'*',schema:'public',table:'deliveries'},()=>scheduleRefresh()).on('postgres_changes',{event:'*',schema:'public',table:'notifications'},()=>scheduleRefresh()).on('postgres_changes',{event:'*',schema:'public',table:'driver_locations'},()=>scheduleRefresh()).subscribe();document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.user)load()},{passive:true})}",
"""function subscribe(){
 if(!state.user)return;
 state.channel?.unsubscribe();
 const channel=db.channel('amo-live-'+state.user.id);
 for(const table of ['deliveries','notifications','driver_locations','delivery_stops']){
  channel.on('postgres_changes',{event:'*',schema:'public',table},()=>scheduleRefresh());
 }
 state.channel=channel.subscribe(status=>{
  v51.channelStatus=status==='SUBSCRIBED'?'Tempo real ativo':status;
  if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')$('sync-text').textContent='Reconectando';
 });
 if(!subscribe.visibleBound){subscribe.visibleBound=true;document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.user)load()},{passive:true})}
}""")
replace("state.channel?.unsubscribe();login()", "state.channel?.unsubscribe();if(state.geoWatch!==null){navigator.geolocation?.clearWatch(state.geoWatch);state.geoWatch=null}v51Reset();login()")
replace("function login(message=''){bootReady();state.user=null;", "function login(message=''){bootReady();if(state.geoWatch!==null){navigator.geolocation?.clearWatch(state.geoWatch);state.geoWatch=null}state.channel?.unsubscribe();v51Reset();state.user=null;")
replace("localStorage.removeItem(cacheKey());localStorage.removeItem(queueKey());if(db)await db.auth.signOut();",
        """if(pendingQueue().length&&!confirm('Existem operações offline pendentes. Sair agora DESCARTARÁ essas alterações. Deseja continuar?'))return;
 localStorage.removeItem(cacheKey());localStorage.removeItem(queueKey());if(db)await db.auth.signOut();""")
replace("case'forgot':{if(!db)return notify('Configure o Supabase antes.',true);",
        """case'stops':v51Stops(id);break;
 case'stop-done':await v51MarkStop(id);break;
 case'stop-delete':await v51DeleteStop(id);break;
 case'driver-route':v51Route(id);break;
 case'receipt':v51PrintableReceipt(id);break;
 case'tracking-link':await v51TrackingLink(id);break;
 case'copy-tracking':await v51CopyLink(id);break;
 case'close-company':v51SettlementForm('company');break;
 case'close-driver':v51SettlementForm('driver');break;
 case'settlement-csv':v51SettlementCSV(id);break;
 case'auto-assign':await v51AutoAssign();break;
 case'queue-retry':await flushQueue();await load();break;
 case'queue-discard':{const ops=pendingQueue();const i=Number(id);if(Number.isInteger(i)&&ops[i]&&confirm('Excluir permanentemente esta operação pendente?')){ops.splice(i,1);localStorage.setItem(queueKey(),JSON.stringify(ops));render()}break}
 case'dispatch-integrations':await v51Dispatch();break;
 case'forgot':{if(!db)return notify('Configure o Supabase antes.',true);""")
# Avoid reading pending ops using expired tokens, and do not delete until server confirms the result.
start=s.index('async function flushQueue(){')
end=s.index('\nfunction queueInsert(',start)
old=s[start:end]
new="""async function flushQueue(){
 if(!navigator.onLine||!state.user||!pendingQueue().length)return;
 if(!(await requireAuthenticatedSession(state.user.id)))return;
 let ops=pendingQueue();let failed=false;
 for(let i=0;i<ops.length;){
  const op=ops[i];
  try{
   if(op.type==='insert'){
    if(!['deliveries','clients','products'].includes(op.table)||!op.record?.id)throw Error('Tipo de operação offline inválido.');
    try{await withTimeout(q(db.from(op.table).insert(op.record)),12000,'Tempo limite ao enviar registro.');}
    catch(e){
     if(e.code!=='23505')throw e;
     const prior=await q(db.from(op.table).select('id,company_id').eq('id',op.record.id).maybeSingle());
     if(!prior||prior.company_id!==op.record.company_id)throw Error('Conflito de identificador offline. Revise a fila.');
    }
   }else{
    const data=await q(db.from('deliveries').select('status,assigned_driver_id').eq('id',op.id).maybeSingle());
    if(!data||data.assigned_driver_id!==state.user.id)throw Error('Frete não atribuído a este entregador. Operação retida.');
    if(data.status!==op.status){
     const valid={'Pendente':'Aceita','Aceita':'Coletada','Coletada':'Em trânsito'};
     if(valid[data.status]!==op.status)throw Error('Conflito de status: servidor '+data.status+', fila '+op.status+'. Revise no monitor.');
     await withTimeout(q(db.rpc('driver_update_status',{p_delivery_id:op.id,p_status:op.status})),12000,'Tempo limite ao sincronizar status.');
    }
   }
   ops.splice(i,1);localStorage.setItem(queueKey(),JSON.stringify(ops));
  }catch(e){
   console.warn('Operação offline retida',op,e);
   v51LogError(e,'fila-offline');failed=true;break;
  }
 }
 if(failed){$('sync-text').textContent='Pendente';return}
 if(!ops.length&&state.loadedOnce)state.refreshPending=true;
}"""
s=s[:start]+new+s[end:]
# Add extension source before registration and initialization.
marker="if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register"
assert marker in s
s=s.replace(marker,(base/'source/features-v5-1.js').read_text()+"\n"+marker,1)
p.write_text(s)
print('build ok size',len(s))
