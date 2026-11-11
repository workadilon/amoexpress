// AMO Express 5.1 | incremento integrado na IIFE principal de app.js.
// Esta fonte é inserida no bundle app.js por tests/build.py.
const v51={stops:[],tokens:[],settlements:[],items:[],errors:[],outbox:[],localErrors:[],lastSync:null,channelStatus:'Desconectado',ready:false};
const v51Terminal=['Concluída','Cancelada'];
function v51Reset(){for(const key of ['stops','tokens','settlements','items','errors','outbox'])v51[key]=[];v51.ready=false;v51.channelStatus='Desconectado'}
async function v51Load(){
 if(!state.user||!navigator.onLine)return;
 const currentUser=state.user.id;
 if(!(await requireAuthenticatedSession(currentUser)))return;
 const requests=[
  db.from('delivery_stops').select('*').order('position'),
  db.from('tracking_tokens').select('delivery_id,expires_at,revoked_at'),
  db.from('financial_settlements').select('*').order('created_at',{ascending:false}).limit(100),
  db.from('financial_settlement_items').select('*').limit(500),
  db.from('client_error_events').select('id,user_id,code,message,source,created_at').order('created_at',{ascending:false}).limit(60),
  db.from('integration_outbox').select('id,kind,state,attempts,created_at,last_error').order('created_at',{ascending:false}).limit(80)
 ];
 const replies=await Promise.allSettled(requests.map(x=>q(x)));
 if(state.user?.id!==currentUser)return;
 const names=['stops','tokens','settlements','items','errors','outbox'];
 replies.forEach((result,index)=>{
  if(result.status==='fulfilled')v51[names[index]]=result.value||[];
  else if(index===0){v51.ready=false;console.warn('Módulo 5.1 não está disponível:',result.reason?.message)}
 });
 v51.ready=replies[0].status==='fulfilled';
 v51.lastSync=new Date().toISOString();
}
function v51LogError(error,source='interface'){
 const code=String(error?.code||'client').slice(0,36).replace(/[^\w.-]/g,'_');
 const message=String(error?.message||'Falha desconhecida')
  .replace(/https?:\/\/\S+/gi,'[URL]')
  .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,'[email]')
  .replace(/eyJ[A-Za-z\d_.-]{20,}/g,'[token]')
  .slice(0,280).trim()||'Erro sem descrição';
 v51.localErrors.unshift({created_at:new Date().toISOString(),code,message,source});
 v51.localErrors=v51.localErrors.slice(0,30);
 if(!db||!state.user||!navigator.onLine)return;
 const user=state.user.id;
 void db.auth.getSession().then(({data})=>{
  if(data?.session?.user?.id!==user||state.user?.id!==user)return;
  return db.from('client_error_events').insert({user_id:user,code,message,source});
 }).catch(()=>{});
}
function v51StopCount(id){return v51.stops.filter(s=>s.delivery_id===id).length}
function v51StopButtons(d){return button('Paradas'+(v51StopCount(d.id)?' · '+v51StopCount(d.id):''),'stops',d.id,'btn small subtle')+
 button('Recibo','receipt',d.id,'btn small subtle')+
 (!state.driverMode?button('Rastrear / QR','tracking-link',d.id,'btn small soft'):'');}
function v51Stops(id){
 const d=state.deliveries.find(x=>x.id===id);if(!d)return;
 const stops=v51.stops.filter(s=>s.delivery_id===id).sort((a,b)=>a.position-b.position);
 const canAdd=!state.driverMode&&!v51Terminal.includes(d.status);
 const canComplete=state.driverMode&&d.assigned_driver_id===state.user?.id;
 const items=stops.map(s=>`<div class="mini-row"><div><strong>${esc(s.position)}. ${esc(s.title)}</strong><small class="stack-small">${esc(s.address)}</small><small>${esc(s.status)}${s.completed_at?' · '+date(s.completed_at):''}</small></div><div class="actions compact">${s.status!=='Concluída'&&canComplete?button('✓ Concluir','stop-done',s.id,'btn small soft'):''}${canAdd?button('Excluir','stop-delete',s.id,'btn small subtle'):''}</div></div>`).join('')||empty('Nenhuma parada adicional');
 modal('Paradas do frete #'+id.slice(0,8),`<div class="panel">${items}</div>${stops.length?button('Traçar rota','driver-route',id,'btn small soft'):''}`+(canAdd?`<div class="notice">Adicione até 40 paradas. Uma por linha, no formato <strong>Nome | Endereço</strong>. Não inclui o destino final da entrega automaticamente.</div><label class="field">Novas paradas<textarea name="stops_text" rows="5" placeholder="Retirada | Rua Exemplo, 100\nParada intermediária | Avenida Central, 20"></textarea></label>`:''),canAdd?'stops-add':'readonly',id);
}
async function v51SaveStops(id,text){
 if(!navigator.onLine)throw Error('Conecte-se à internet para salvar paradas.');
 const current=v51.stops.filter(s=>s.delivery_id===id);
 const lines=String(text||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 if(!lines.length)throw Error('Informe pelo menos uma parada.');
 if(current.length+lines.length>40)throw Error('Máximo de 40 paradas por frete.');
 const start=current.reduce((m,s)=>Math.max(m,s.position),0);
 const records=lines.map((line,i)=>{
  const idx=line.indexOf('|');if(idx<1)throw Error('Use o formato Nome | Endereço na linha '+(i+1));
  const title=line.slice(0,idx).trim(),address=line.slice(idx+1).trim();
  if(!title||!address||title.length>100||address.length>400)throw Error('Confira a parada '+(i+1));
  return {delivery_id:id,position:start+i+1,title,address};
 });
 await q(db.from('delivery_stops').insert(records));
 close();await load();v51Stops(id);notify('Paradas adicionadas.');
}
async function v51MarkStop(id){try{const stop=v51.stops.find(s=>s.id===id);if(!stop)return;await q(db.from('delivery_stops').update({status:'Concluída'}).eq('id',id));await load();v51Stops(stop.delivery_id);notify('Parada concluída.')}catch(e){err(e)}}
async function v51DeleteStop(id){let stop=v51.stops.find(s=>s.id===id);if(!stop||!confirm('Excluir esta parada?'))return;try{await q(db.from('delivery_stops').delete().eq('id',id));await load();v51Stops(stop.delivery_id)}catch(e){err(e)}}
async function v51Route(id){
 const d=state.deliveries.find(x=>x.id===id);if(!d)return;
 const addresses=v51.stops.filter(s=>s.delivery_id===id&&s.status!=='Concluída').sort((a,b)=>a.position-b.position).map(s=>s.address);
 const c=state.clients.find(x=>x.id===d.client_id);
 let address=c?.address||'';
 if(state.driverMode){
  try{address=await q(db.rpc('amo_driver_destination',{p_delivery_id:id}))||''}
  catch(e){console.warn('Destino exato indisponível',e)}
 }
 const destination=[address,d.neighborhood].filter(Boolean).join(', ');
 if(destination)addresses.push(destination);
 if(!addresses.length)return notify('Cadastre endereços das paradas e do cliente.',true);
 if(addresses.length>10)notify('O Google Maps suporta número limitado de paradas. Exibindo as 10 primeiras.',true);
 const route=addresses.slice(0,10);
 const url='https://www.google.com/maps/dir/?api=1&travelmode=driving&destination='+encodeURIComponent(route[route.length-1])+ (route.length>1?'&waypoints='+encodeURIComponent(route.slice(0,-1).join('|')):'');
 window.open(url,'_blank','noopener,noreferrer');
}
async function v51TrackingLink(id){
 try{
  if(!window.crypto?.subtle||!window.isSecureContext)throw Error('O link protegido exige HTTPS.');
  if(!navigator.onLine)throw Error('É necessário internet para criar o rastreamento.');
  const bytes=crypto.getRandomValues(new Uint8Array(32));
  const token=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  const token_hash=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
  const expiresAt=new Date(Date.now()+72*60*60*1000).toISOString();
  await q(db.from('tracking_tokens').upsert({delivery_id:id,token_hash,created_by:state.user.id,expires_at:expiresAt,revoked_at:null},{onConflict:'delivery_id'}));
  const link=new URL('./tracking.html',document.baseURI);link.hash=token;
  const url=link.href;
  const d=state.deliveries.find(x=>x.id===id),c=state.clients.find(x=>x.id===d?.client_id);
  const digits=String(c?.phone||'').replace(/\D/g,'');
  const whatsapp=digits?`<a class="btn small soft" href="https://wa.me/${digits.startsWith('55')?digits:'55'+digits}?text=${encodeURIComponent('Acompanhe a sua entrega AMO Express pelo link: '+url)}" target="_blank" rel="noopener noreferrer">WhatsApp</a>`:'';
  modal('Rastreamento temporário',`<div class="notice">Link privado válido por 72 horas. Gerar outro link invalida o anterior. Não compartilhe publicamente.</div><label class="field">Link para compartilhar<input type="text" readonly value="${esc(url)}" id="amo-public-link"></label><div class="qr-wrap"><canvas id="amo-tracking-qr" width="210" height="210" aria-label="QR Code do rastreamento"></canvas></div><div class="actions">${button('Copiar link','copy-tracking',url,'btn small')}${whatsapp}</div>`,'readonly',id);
  if(window.QRCode?.toCanvas){window.QRCode.toCanvas($('amo-tracking-qr'),url,{width:210,margin:2,errorCorrectionLevel:'M'},e=>{if(e)console.warn('QR não disponível',e)})}
  else $('amo-tracking-qr')?.replaceWith(Object.assign(document.createElement('p'),{textContent:'QR Code indisponível sem a biblioteca; o link pode ser copiado.'}));
  await v51Load();
 }catch(e){err(e)}
}
async function v51CopyLink(url){try{await navigator.clipboard.writeText(url);notify('Link copiado.')}catch{prompt('Copie o link:',url)}}
function v51PrintableReceipt(id){
 const d=state.deliveries.find(x=>x.id===id);if(!d)return;
 const c=state.clients.find(x=>x.id===d.client_id),company=titleCompany(d.company_id);
 const rows=[['Frete',d.id],['Empresa',company],['Cliente',d.client_name],['Produto',d.product_name],['Bairro',d.neighborhood],['Endereço',c?.address||'-'],['Situação',d.status],['Solicitado em',date(d.created_at)],['Entregue em',date(d.delivered_at)],['Recebido por',d.recipient_name||'-'],['Valor do frete',money(d.fee)]];
 if(state.admin||state.driverMode)rows.push(['Repasse',money(d.driver_fee||0)]);
 const html=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Recibo AMO Express</title><style>body{font:16px system-ui;margin:30px;color:#153054;max-width:760px}header{border-bottom:3px solid #2563eb;padding-bottom:15px}h1{margin:0}table{border-collapse:collapse;width:100%;margin:22px 0}td{border-bottom:1px solid #ddd;padding:9px 3px}td:first-child{color:#576579;width:42%}footer{font-size:12px;color:#657184;margin-top:28px}@media print{button{display:none}}</style></head><body><header><h1>AMO Express</h1><p>Comprovante de serviço de entrega</p></header><table>${rows.map(([k,v])=>`<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table><p><strong>Observação:</strong> este recibo registra os dados operacionais e não substitui documento fiscal.</p><button onclick="window.print()">Imprimir / salvar em PDF</button><footer>Gerado em ${esc(new Date().toLocaleString('pt-BR'))} · AMO Express</footer></body></html>`;
 const win=window.open('','_blank');if(!win)return notify('Permita pop-ups para emitir o recibo.',true);
 win.document.open();win.document.write(html);win.document.close();
}
function v51Finance(){
 if(!state.admin&&!state.driverMode){
  const rows=visibleDeliveries();return label('Financeiro da empresa','Acompanhe cobranças e valores em aberto.')+
  `<div class="metric-grid">${metric('◷','A receber',money(sum(rows.filter(x=>x.status==='Concluída'&&!x.paid_at))),'Entregas concluídas')}${metric('✓','Recebido',money(sum(rows.filter(x=>!!x.paid_at))),'Cobranças pagas','green')}</div>`+
  section('Entregas e cobranças')+`<div class="list-stack">${rows.slice(0,80).map(d=>`<div class="mini-row"><span>#${esc(d.id.slice(0,8))} · ${esc(d.client_name)}</span><strong>${money(d.fee)} · ${d.paid_at?'Pago':'Pendente'}</strong></div>`).join('')||empty('Sem lançamentos')}</div>`;
 }
 if(!state.admin)return label('Financeiro','Disponível para a administração e empresas.');
 const all=visibleDeliveries();const done=all.filter(d=>d.status==='Concluída');
 const receivables=done.filter(d=>!d.paid_at),payouts=done.filter(d=>d.assigned_driver_id&&!d.driver_paid_at);
 const avg=done.length?done.reduce((a,d)=>a+Number(d.fee||0),0)/done.length:0;
 return label('Financeiro e repasses','Fechamentos por período, cobranças e produtividade.',button('Exportar CSV','export-payments','','btn small soft'))+
 `<div class="metric-grid">${metric('◷','A receber',money(sum(receivables)),'Entregas concluídas')}${metric('♧','A repassar',money(payouts.reduce((a,d)=>a+Number(d.driver_fee||0),0)),'Pagamentos pendentes','amber')}${metric('✓','Recebido',money(sum(all.filter(x=>x.paid_at))),'Pagamentos marcados','green')}${metric('▥','Tíquete médio',money(avg),done.length+' entregas concluídas')}</div>`+
 `<div class="panel"><h3>Fechamento de período</h3><p class="subtext">Registra um lote, inclui fretes concluídos ainda não pagos e atualiza os campos de pagamento em uma transação.</p><div class="actions">${button('Fechar cobrança de empresa','close-company','','btn small')}${button('Fechar repasse de entregador','close-driver','','btn small soft')}</div></div>`+
 section('Lotes finalizados')+`<div class="list-stack">${v51.settlements.map(x=>`<article class="item-card"><div class="item-avatar">▥</div><div class="item-main"><strong>${x.kind==='company'?'Cobrança':'Repasse'} · ${money(x.total)}</strong><small>${esc(x.date_from)} a ${esc(x.date_to)} · ${esc(x.item_count)} fretes</small><small>${date(x.created_at)}</small></div>${button('CSV','settlement-csv',x.id,'btn small soft')}</article>`).join('')||empty('Nenhum lote gerado')}</div>`;
}
function v51SettlementForm(kind){
 const options=kind==='company'?state.company.map(x=>({id:x.id,label:x.name})):state.drivers.filter(x=>x.active).map(x=>({id:x.user_id,label:x.name}));
 if(!options.length)return notify('Nenhum destinatário disponível.',true);
 const now=new Date(),first=new Date(now.getFullYear(),now.getMonth(),1),end=now.toISOString().slice(0,10),start=first.toISOString().slice(0,10);
 modal(kind==='company'?'Fechar cobrança de empresa':'Fechar repasses',
  sel(kind==='company'?'Empresa':'Entregador','party_id',options,options[0].id)+
  `<label class="field">Data inicial<input type="date" name="date_from" value="${start}" required></label><label class="field">Data final<input type="date" name="date_to" value="${end}" required></label><div class="notice">Somente fretes concluídos e ainda não pagos serão incluídos. Não é possível desfazer este fechamento pelo aplicativo.</div>`,kind==='company'?'settle-company':'settle-driver');
}
async function v51SaveSettlement(kind,v){
 if(!navigator.onLine)throw Error('Conecte-se para confirmar um fechamento.');
 if(!confirm('Confirmar fechamento financeiro? Esta operação registrará os pagamentos das entregas incluídas.'))return;
 const id=await q(db.rpc('amo_close_settlement',{p_kind:kind,p_party:v.party_id,p_from:v.date_from,p_to:v.date_to}));
 close();await load();notify('Fechamento registrado: #'+String(id).slice(0,8));
}
function v51SettlementCSV(id){
 const b=v51.settlements.find(x=>x.id===id);if(!b)return;
 const rows=v51.items.filter(x=>x.settlement_id===id);
 exportTable('amo-fechamento-'+id.slice(0,8)+'.csv',[
  ['Lote','Tipo','Início','Fim','Entrega','Valor','Total do lote'],
  ...rows.map(x=>[b.id,b.kind,b.date_from,b.date_to,x.delivery_id,x.amount,b.total])
 ]);
}
async function v51AutoAssign(){
 if(!state.admin)return;
 if(!confirm('Distribuir até 10 fretes pendentes sem entregador pela menor carga atual?'))return;
 try{const n=await q(db.rpc('amo_assign_pending',{p_limit:10}));notify(`${n} frete(s) atribuídos.`);await load()}catch(e){err(e)}
}
async function v51Dispatch(){
 try{
  if(!state.admin)throw Error('Ação restrita à administração.');
  const {data,error}=await db.functions.invoke('dispatch-integrations',{body:{source:'admin-panel'}});
  if(error)throw error;
  notify(`Integrações processadas: ${data?.sent||0} enviadas, ${data?.failed||0} falhas.`);
  await v51Load();render();
 }catch(e){err(e)}
}
function v51Monitor(){
 const qlist=pendingQueue(),rows=v51.errors;
 const sync=v51.lastSync?date(v51.lastSync):'Não sincronizado';
 return label('Saúde e sincronização','Diagnóstico de conexão, erros e operações pendentes.',button('Atualizar','reload','','btn small soft'))+
 `<div class="metric-grid">${metric('◉','Conexão',navigator.onLine?'Online':'Offline',v51.channelStatus)}${metric('⇄','Fila local',String(qlist.length),'Aguardando envio')}${metric('!','Erros registrados',String(rows.length),'Últimos 60 registros','amber')}${metric('✓','Último sync',sync,'Consulta concluída')}</div>`+
 `<div class="panel"><h3>Fila offline</h3>${qlist.map((op,i)=>`<div class="mini-row"><span>${esc(op.type==='insert'?'Criar '+op.table:'Status '+op.status)} · ${esc(op.queued_at||'-')}</span><div>${button('Remover','queue-discard',String(i),'btn small danger')}</div></div>`).join('')||'<p class="subtext">Sem operações pendentes.</p>'}<div class="actions">${button('Reenviar pendências','queue-retry','','btn small soft')}</div></div>`+
 `<div class="panel"><h3>Erros do aplicativo</h3>${[...v51.localErrors,...rows].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,40).map(x=>`<div class="mini-row"><span>${esc(x.code||'erro')} · ${esc(x.message)}</span><small>${date(x.created_at)}</small></div>`).join('')||'<p class="subtext">Nenhum erro registrado.</p>'}</div>`+
 (state.admin?`<div class="panel"><h3>Integrações externas</h3><p class="subtext">${v51.outbox.filter(x=>x.state==='pending').length} evento(s) pendentes · ${v51.outbox.filter(x=>x.state==='error').length} erro(s). O webhook deve ser configurado apenas no servidor.</p>${button('Enviar fila de webhooks','dispatch-integrations','','btn small soft')}</div>`:'');
}
function v51Kpis(){
 const rows=visibleDeliveries(),done=rows.filter(d=>d.status==='Concluída');
 const durations=done.filter(d=>d.delivered_at).map(d=>(new Date(d.delivered_at)-new Date(d.created_at))/60000).filter(x=>x>=0&&Number.isFinite(x));
 const avg=durations.length?Math.round(durations.reduce((a,b)=>a+b,0)/durations.length):null;
 const ontime=done.filter(d=>d.scheduled_at&&d.delivered_at),onCount=ontime.filter(d=>new Date(d.delivered_at)<=new Date(d.scheduled_at)).length;
 const reviews=v51.ready?state.ratings:[];
 return `<div class="panel"><h3>Indicadores de desempenho</h3><div class="metric-grid">${metric('◷','Tempo médio',avg===null?'—':avg+' min',durations.length+' fretes com horário')}${metric('✓','Pontualidade',ontime.length?Math.round(onCount/ontime.length*100)+'%':'—','Com prazo e confirmação')}${metric('★','Avaliações',reviews.length? (reviews.reduce((a,r)=>a+Number(r.stars),0)/reviews.length).toFixed(1)+'/5':'—',reviews.length+' avaliações')}${metric('▥','Conversão',rows.length?Math.round(done.length/rows.length*100)+'%':'—','Concluídas / solicitações')}</div></div>`;
}
