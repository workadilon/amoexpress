(()=>{'use strict';
const $=id=>document.getElementById(id),cfg=window.AMO_CONFIG||{};
const configured=cfg.supabaseUrl?.startsWith('https://')&&!cfg.supabaseUrl.includes('SEU-PROJETO')&&cfg.supabaseAnonKey&&!cfg.supabaseAnonKey.startsWith('SUA_');
const db=configured&&window.supabase?window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}):null;
const state={user:null,admin:false,companyId:null,tab:'home',company:[],members:[],rates:[],clients:[],products:[],deliveries:[],filter:'Todos',search:'',channel:null,timer:null,drivers:[],events:[],notices:[],driver:null,driverMode:false,offline:false,loading:false,period:'month',companyFilter:'',driverFilter:'',periodFilter:'all',loadedOnce:false,locations:[],ratings:[],audit:[],settingsV5:null,geoWatch:null,refreshPending:false,extrasAvailable:false};
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)||0);
const date=v=>v?new Date(v).toLocaleDateString('pt-BR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'-';
const button=(text,act,id='',cls='btn')=>`<button type="button" class="${cls}" data-act="${act}" data-id="${esc(id)}">${text}</button>`;
const badge=v=>`<span class="badge ${v==='Concluída'?'ok':v==='Em trânsito'||v==='Coletada'?'transit':v==='Cancelada'||v==='Suspensa'?'danger':v==='Aceita'?'ok':''}">${esc(v)}</span>`;
const empty=(title,txt='Os registros aparecerão aqui quando forem adicionados.')=>`<div class="empty"><div class="empty-illustration">📋</div><strong>${esc(title)}</strong><p>${esc(txt)}</p></div>`;
const label=(title,desc,action='')=>`<div class="section-heading"><div><div class="eyebrow">AMO EXPRESS</div><h1>${esc(title)}</h1><p class="subtext">${esc(desc)}</p></div>${action}</div>`;
const section=(title,action='')=>`<div class="inner-heading"><h2>${esc(title)}</h2>${action}</div>`;
const metric=(symbol,title,value,foot,tone='')=>`<div class="metric-card"><span class="metric-icon ${tone}">${symbol}</span><span class="metric-label">${esc(title)}</span><strong class="metric-number">${esc(value)}</strong><span class="metric-foot">${esc(foot)}</span></div>`;
const opt=(items,sel)=>items.map(x=>`<option value="${esc(x.id)}" ${String(sel)===String(x.id)?'selected':''}>${esc(x.label)}</option>`).join('');
const fld=(name,key,value='',type='text',required=true)=>`<label class="field">${esc(name)}<input name="${key}" type="${type}" value="${esc(value)}" ${type==='number'?'min="0" step="0.01"':''} ${required?'required':''}></label>`;
const sel=(name,key,items,v)=>`<label class="field">${esc(name)}<select name="${key}" required>${opt(items,v)}</select></label>`;
const fd=form=>Object.fromEntries(new FormData(form).entries());
const own=rows=>state.admin?rows:rows.filter(r=>r.company_id===state.companyId);
const titleCompany=id=>state.company.find(c=>c.id===id)?.name||'Empresa';
const notify=(text,bad=false)=>{let el=$('toast');el.className='toast'+(bad?' error':'');el.textContent=text;clearTimeout(notify.handle);notify.handle=setTimeout(()=>el.classList.add('hidden'),4300)};
const err=e=>{console.error(e);notify(e?.message||'Não foi possível concluir a operação.',true);v51LogError(e)};
const q=async request=>{const {data,error}=await request;if(error)throw error;return data};
const withTimeout=(promise,ms,message)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(message)),ms);Promise.resolve(promise).then(v=>{clearTimeout(timer);resolve(v)},e=>{clearTimeout(timer);reject(e)})});
const bootReady=()=>{window.AMO_BOOT_READY=true};
// A API Supabase não deve receber leituras privadas com a chave pública
// quando a sessão do usuário foi encerrada ou ainda não foi restaurada.
async function requireAuthenticatedSession(expectedUserId){
 if(!db||!expectedUserId)return false;
 const {data,error}=await db.auth.getSession();
 if(error)throw error;
 const session=data?.session;
 if(state.user?.id!==expectedUserId)return false; // outra conta iniciou sessão durante o carregamento
 if(!session?.access_token||session.user?.id!==expectedUserId){
  if(navigator.onLine){
   state.channel?.unsubscribe();
   login('Sua sessão expirou ou foi encerrada. Entre novamente para continuar.');
  }else{
   throw Error('Sem conexão para restaurar a sessão. Exibindo informações locais, se disponíveis.');
  }
  return false;
 }
 return true;
}
const thisMonth=d=>{let x=new Date(d.created_at),now=new Date;return x.getFullYear()===now.getFullYear()&&x.getMonth()===now.getMonth()};
const sum=xs=>xs.reduce((a,x)=>a+Number(x.fee||0),0);
function nav(){const tabs=state.driverMode?[['home','◫','Início'],['deliveries','🛵','Meus fretes'],['notifications','♧','Avisos'],['settings','⚙','Ajustes']]:state.admin?[['home','◫','Início'],['deliveries','🛵','Fretes'],['companies','▦','Empresas'],['drivers','♙','Entregadores'],['more','☷','Mais']]:[['home','◫','Início'],['deliveries','🛵','Fretes'],['clients','♙','Clientes'],['products','⬡','Produtos'],['more','☷','Mais']];$('nav').innerHTML=tabs.map(([id,icon,txt])=>`<button class="nav-tab ${id===state.tab?'active':''}" data-act="tab" data-id="${id}" aria-current="${id===state.tab?'page':'false'}"><span class="nav-icon">${icon}</span><span>${txt}</span></button>`).join('')}
function more(){return label('Mais opções','Relatórios, alertas e configurações.')+`<div class="quick-grid">${[['reports','▥','Relatórios'],['financeV51','▥','Financeiro'],['monitorV51','◉','Monitor'],['operations','◷','Operação'],['logistics','⌖','Logística'],['auditView','≡','Auditoria'],['notifications','♧','Notificações'],['settings','⚙','Configurações'],...(state.admin?[['rates','⌖','Tarifas'],['drivers','♙','Entregadores']]:[])].map(([id,ic,name])=>`<button class="quick-link" data-act="tab" data-id="${id}"><span>${ic}</span><strong>${name}</strong><b>›</b></button>`).join('')}</div>`}
function driverName(id){return state.drivers.find(x=>x.user_id===id)?.name||'Não atribuído'}
function drivers(){return label('Entregadores','Cadastre e distribua entregas.',button('+ Entregador','new-driver'))+section(`${state.drivers.length} cadastrado(s)`)+`<div class="list-stack">${state.drivers.map(d=>`<article class="item-card"><div class="item-avatar">🛵</div><div class="item-main"><strong>${esc(d.name)}</strong><small>${esc(d.phone||'Sem telefone')}</small><small>${d.active?'Ativo':'Inativo'} · ${state.deliveries.filter(x=>x.assigned_driver_id===d.user_id&& !['Concluída','Cancelada'].includes(x.status)).length} fretes abertos</small></div><button class="btn small subtle" data-act="driver-toggle" data-id="${esc(d.user_id)}">${d.active?'Desativar':'Ativar'}</button></article>`).join('')||empty('Nenhum entregador','Vincule uma conta já criada no Supabase Auth.')}</div>`}
function notifications(){return label('Notificações','Avisos atualizados pelo servidor.',button('Marcar lidas','read-notices','','btn subtle small'))+`<div class="list-stack">${state.notices.map(n=>`<article class="item-card ${n.read_at?'':'unread'}"><div class="item-avatar amber">♧</div><div class="item-main"><strong>${esc(n.title)}</strong><small>${esc(n.body)}</small><small>${date(n.created_at)}</small></div>${n.read_at?'':button('✓','read-notice',n.id,'btn small soft')}</article>`).join('')||empty('Nenhum aviso novo')}</div>`}
function settings(){let offline=state.offline?'Sem rede — dados em cache':'Conectado ao Supabase';return label('Configurações','Preferências e conectividade.')+`<div class="panel"><h3>Conexão</h3><p class="subtext">${offline}</p><p class="subtext">${pendingQueue().length} atualização(ões) aguardando envio</p><div class="actions">${button('Sincronizar agora','reload','','btn small')}${button('Monitor','tab','monitorV51','btn small subtle')}${button('Ativar avisos do navegador','browser-permission','','btn small subtle')}</div></div><div class="panel security-panel"><div class="security-heading"><span class="security-symbol" aria-hidden="true">🔐</span><div><h3>Segurança da conta</h3><p class="subtext">Altere sua senha de acesso com segurança.</p></div></div><div class="mini-row"><span>E-mail da conta</span><strong class="security-email">${esc(state.user?.email||'Não informado')}</strong></div><div class="actions">${button('Alterar minha senha','change-password','','btn small')}${button('Esqueci minha senha','reset-password','','btn small subtle')}</div></div><div class="panel"><h3>Dados e acesso</h3><p class="subtext">As informações consultadas recentemente ficam neste aparelho para leitura offline. Ao sair, o cache local é apagado.</p><div class="actions">${button('Limpar cache local','clear-cache','','btn small subtle')}${button('Sair da conta','signout','','btn small danger')}</div></div>`}

function changePasswordForm(){
  if(!db||!state.user?.email){notify('Entre na sua conta para alterar sua senha.',true);return}
  const fields=`<p class="subtext">Esta alteração vale somente para a conta <strong>${esc(state.user.email)}</strong>.</p>
    ${fld('Senha atual','current_password','','password')}
    ${fld('Nova senha (mínimo de 8 caracteres)','new_password','','password')}
    ${fld('Confirmar nova senha','confirm_password','','password')}
    <label class="password-toggle"><input type="checkbox" data-password-toggle> Mostrar senhas</label>
    <p class="security-hint">Use uma senha exclusiva com letras, números e símbolos. Nunca compartilhe suas credenciais.</p>`;
  modal('Alterar minha senha',fields,'change-password');
  const form=$('modal').querySelector('form');
  ['current_password','new_password','confirm_password'].forEach(n=>{form.elements[n].minLength=n==='current_password'?1:8;form.elements[n].autocomplete=n==='current_password'?'current-password':'new-password'});
  form.querySelector('button[type=submit]').textContent='Atualizar senha';
}
async function savePassword(form){
  const submit=form.querySelector('[type="submit"]');
  if(submit.disabled)return;
  const current=form.elements.current_password.value;
  const next=form.elements.new_password.value;
  const confirmation=form.elements.confirm_password.value;
  const errorBox=form.querySelector('.password-error')||document.createElement('div');
  errorBox.className='password-error hidden';errorBox.setAttribute('role','alert');
  if(!errorBox.isConnected)form.insertBefore(errorBox,form.querySelector('.form-actions'));
  const fail=message=>{errorBox.textContent=message;errorBox.classList.remove('hidden');notify(message,true)};
  if(!navigator.onLine)return fail('É necessário estar conectado à internet para alterar a senha.');
  if(!state.user?.email)return fail('Sua sessão expirou. Entre novamente.');
  if(next.length<8)return fail('A nova senha deve ter no mínimo 8 caracteres.');
  if(next!==confirmation)return fail('A confirmação não corresponde à nova senha.');
  if(current===next)return fail('A nova senha deve ser diferente da senha atual.');
  submit.disabled=true;submit.textContent='Verificando…';
  try{
    // Cliente isolado evita trocar a sessão principal ao validar a senha atual.
    const verifier=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'amo-password-verifier'}
    });
    const verify=await withTimeout(verifier.auth.signInWithPassword({email:state.user.email,password:current}),12000,'Não foi possível validar a senha atual. Tente novamente.');
    if(verify.error||verify.data?.user?.id!==state.user.id){return fail('Senha atual incorreta ou não foi possível validar as credenciais.');}
    submit.textContent='Salvando…';
    const changed=await withTimeout(db.auth.updateUser({password:next}),15000,'A atualização demorou demais. Verifique sua conexão.');
    if(changed.error)throw changed.error;
    form.reset();close();notify('Senha alterada com sucesso! Use a nova senha no próximo acesso.');
  }catch(error){
    console.error('Falha ao atualizar senha',error);
    const message=/nonce|reauth|reauthenticat/i.test(error.message||'')?'O Supabase exige uma confirmação adicional. Use a opção “Esqueci minha senha” para redefinir por e-mail.':(error.message||'Não foi possível alterar a senha.');
    fail(message);
  }finally{submit.disabled=false;submit.textContent='Atualizar senha'}
}
async function sendPasswordReset(){
  if(!db||!state.user?.email)return notify('Entre na sua conta para recuperar a senha.',true);
  if(!navigator.onLine)return notify('Conecte-se à internet para solicitar a recuperação.',true);
  if(!confirm(`Enviar um link de recuperação para ${state.user.email}?`))return;
  try{
    const {error}=await db.auth.resetPasswordForEmail(state.user.email,{redirectTo:location.origin+location.pathname});
    if(error)throw error;
    notify('Solicitação enviada. Verifique seu e-mail e a pasta de spam.');
  }catch(error){err(error)}
}
function render(){if(!state.user)return;bootReady();$('context-label').textContent=state.driverMode?'Portal do entregador':state.admin?'Painel de administração':titleCompany(state.companyId);$('nav').classList.remove('hidden');$('logout').classList.remove('hidden');nav();const views={home,deliveries,clients,products,companies,rates,reports,drivers,notifications,settings,more,operations,logistics,auditView,financeV51:v51Finance,monitorV51:v51Monitor};$('app').innerHTML=(views[state.tab]||home)()}
function hero(){let list=visibleDeliveries(),month=list.filter(thisMonth),pending=list.filter(x=>x.status==='Pendente');return `<div class="dashboard-hero"><div class="hero-overline">${state.driverMode?'SUAS ENTREGAS':state.admin?'CONTROLE DE OPERAÇÕES':'RESUMO DO SEU MÊS'}</div><div class="hero-number">${money(sum(month))}</div><div class="hero-caption">${state.driverMode?'Valor de entregas atribuídas no mês':state.admin?'Volume financeiro de fretes no mês':'Total em fretes neste mês'}</div><div class="hero-row"><span class="hero-chip">◉ ${month.length} fretes no mês</span><span class="hero-chip">◷ ${pending.length} pendentes</span>${state.admin||state.driverMode?'':button('+ Novo frete','new-delivery','','hero-button')}</div></div>`}
function home(){const list=visibleDeliveries(),month=list.filter(thisMonth);let g=state.admin;return `<div class="eyebrow">OLÁ, BEM-VINDO 👋</div><h1>${g?'Visão geral':'Suas entregas'}</h1><p class="subtext" style="margin-bottom:21px">${g?'Veja como está a operação em tempo real.':'Tudo o que você precisa para gerenciar seus fretes.'}</p>${hero()}<div class="metric-grid">${metric('◫',g?'Empresas ativas':'Fretes no mês',g?state.company.filter(x=>x.status==='Ativa').length:month.length,g?'Empresas em operação':'Solicitações realizadas')}${metric('◷','Pendentes',list.filter(x=>x.status==='Pendente').length,'Aguardando atendimento','amber')}${metric('➜','Em trânsito',list.filter(x=>x.status==='Em trânsito').length,'A caminho do destino')}${metric('✓','Concluídas',list.filter(x=>x.status==='Concluída').length,'Entregas finalizadas','green')}</div>${section('Últimas solicitações',button('Ver todas →','tab','deliveries','muted-link'))}<div class="delivery-tiles">${list.length?list.slice(0,4).map(deliveryCard).join(''):empty('Nenhum frete registrado','Crie seu primeiro frete para começar.')}</div>`}
function visibleDeliveries(){return state.driverMode?state.deliveries.filter(d=>d.assigned_driver_id===state.user?.id):own(state.deliveries)}
function deliveryCard(d){
  const isDriver=state.driverMode,assigned=!!d.assigned_driver_id;
  const client=state.clients.find(c=>c.id===d.client_id),phone=client?.phone?.replace(/\D/g,'');
  const themes={'Pendente':'pending','Aceita':'accepted','Coletada':'picked','Em trânsito':'travel','Concluída':'done','Cancelada':'cancelled'};
  const theme=themes[d.status]||'pending';
  const icons={'Pendente':'◷','Aceita':'✓','Coletada':'▣','Em trânsito':'➜','Concluída':'✓','Cancelada':'×'};
  const day=new Date(d.created_at),dayLabel=Number.isNaN(day.getTime())?'ENTREGA':day.toLocaleDateString('pt-BR',{weekday:'long'}).toUpperCase();
  const shortDate=Number.isNaN(day.getTime())?'—':day.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
  const mainAction=state.admin?button(assigned?'Reatribuir':'Atribuir','assign',d.id,'btn small soft'):isDriver&&d.status==='Pendente'?button('Aceitar','driver-status',d.id+'|Aceita','btn small'):isDriver&&d.status==='Aceita'?button('Coletado','driver-status',d.id+'|Coletada','btn small'):isDriver&&d.status==='Coletada'?button('Em trânsito','driver-status',d.id+'|Em trânsito','btn small'):isDriver&&d.status==='Em trânsito'?button('Confirmar entrega','proof',d.id,'btn small'):!state.admin&&!isDriver&&d.status==='Pendente'?button('Cancelar','cancel-delivery',d.id,'btn small danger'):'';
  return `<article class="delivery-tile tile-${theme}" data-status="${esc(d.status)}">
    <div class="tile-date"><span>${esc(dayLabel)}</span><strong>${esc(shortDate)}</strong></div>
    <div class="tile-status"><span aria-hidden="true">${icons[d.status]||'◷'}</span> ${esc(d.status)}</div>
    <h3 class="tile-destination" title="${esc(d.neighborhood)}">${esc(d.neighborhood)}</h3>
    <div class="tile-client" title="${esc(d.client_name)}">${esc(d.client_name)}</div>
    <div class="tile-stats"><span>🛵 ${esc(driverName(d.assigned_driver_id))}</span><strong>${money(d.fee)}</strong></div>
    <details class="tile-details"><summary aria-label="Ver resumo da entrega para ${esc(d.client_name)}">Resumo <span class="tile-chevron" aria-hidden="true">⌄</span></summary>
      <div class="tile-expanded">
        <div class="tile-detail-line"><span>Código</span><strong>#${esc(d.id.slice(0,8).toUpperCase())}</strong></div>
        <div class="tile-detail-line"><span>Solicitado em</span><strong>${date(d.created_at)}</strong></div>
        ${state.admin?`<div class="tile-detail-line"><span>Empresa</span><strong>${esc(titleCompany(d.company_id))}</strong></div>`:''}
        <div class="tile-detail-line"><span>Produto</span><strong>${esc(d.product_name)}</strong></div>
        <div class="tile-detail-line"><span>Cliente</span><strong>${esc(d.client_name)}</strong></div>
        ${d.scheduled_at?`<div class="tile-detail-line"><span>Agendado</span><strong>${date(d.scheduled_at)}</strong></div>`:''}${d.distance_km?`<div class="tile-detail-line"><span>Distância informada</span><strong>${esc(d.distance_km)} km</strong></div>`:''}${d.notes?`<p class="tile-notes">${esc(d.notes)}</p>`:''}
        ${mainAction?`<div class="tile-actions">${mainAction}</div>`:''}
        <div class="tile-actions">${button('Acompanhar','timeline',d.id,'btn small subtle')}${v51StopButtons(d)}${phone?`<a class="btn small subtle" target="_blank" rel="noopener noreferrer" href="https://wa.me/55${esc(phone)}?text=${encodeURIComponent('Olá! Sua entrega AMO Express #'+d.id.slice(0,8)+' está: '+d.status+'.')}">WhatsApp</a>`:''}${d.proof_path?button('Foto','view-proof',d.id,'btn small soft'):''}${d.recipient_signature_path?button('Assinatura','view-signature',d.id,'btn small soft'):''}${state.admin?button('Pagamento','payment',d.id,'btn small subtle')+button('Agendar','schedule',d.id,'btn small subtle'):''}${!state.driverMode&&d.status==='Concluída'&&d.assigned_driver_id?button('Avaliar','rate-delivery',d.id,'btn small soft'):''}</div>
        ${state.admin?`<div class="tile-admin">${sel('Atualizar status','new_status',['Pendente','Aceita','Coletada','Em trânsito','Concluída','Cancelada'].map(x=>({id:x,label:x})),d.status).replace('name="new_status"',`data-status-id="${esc(d.id)}" name="new_status"`)}</div>`:''}
      </div>
    </details>
  </article>`;
}
function timeline(id){let d=state.deliveries.find(x=>x.id===id);if(!d)return;let es=state.events.filter(x=>x.delivery_id===id).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));modal('Acompanhamento #'+id.slice(0,8),`<div class="timeline">${es.map(e=>`<div class="timeline-step"><span class="timeline-dot"></span><div><strong>${esc(e.status)}</strong><small>${date(e.created_at)}</small>${e.note?`<small>${esc(e.note)}</small>`:''}</div></div>`).join('')||'<p>Aguardando a primeira atualização.</p>'}</div>`,'readonly',id)}
function assignForm(id){let d=state.deliveries.find(x=>x.id===id);if(!d)return;let active=state.drivers.filter(x=>x.active),scores=active.map(driver=>({driver,count:state.deliveries.filter(x=>x.assigned_driver_id===driver.user_id&&!['Concluída','Cancelada'].includes(x.status)).length})).sort((a,b)=>a.count-b.count||a.driver.name.localeCompare(b.driver.name)),recommend=scores[0];modal('Atribuir entregador',`<div class="notice">Sugestão automática: ${esc(recommend?.driver.name||'Sem entregadores ativos')} (${recommend?.count??0} fretes em aberto). Critério: menor carga atual, não distância de GPS.</div>`+sel('Entregador','assigned_driver_id',[{id:'',label:'Sem entregador'},...scores.map(x=>({id:x.driver.user_id,label:x.driver.name+' · '+x.count+' aberto(s)'}))],d.assigned_driver_id||recommend?.driver.user_id||'')+fld('Repasse ao entregador (R$)','driver_fee',d.driver_fee??0,'number'),'assign',id)}
function proofForm(id){modal('Comprovante de entrega',fld('Nome de quem recebeu','recipient_name')+`<label class="field">Foto (opcional)<input type="file" name="photo" accept="image/jpeg,image/png,image/webp" capture="environment"></label><label class="field">Assinatura (desenhe com o dedo)<canvas id="signature-pad" width="340" height="145" class="signature-pad"></canvas></label><div class="actions"><button type="button" class="btn small subtle" data-act="clear-signature">Limpar assinatura</button></div><label class="field"><span><input type="checkbox" name="proof_position"> Incluir minha localização atual (opcional)</span></label><div class="notice">A foto e assinatura são guardadas em armazenamento privado. É necessária conexão para concluir.</div>`,'proof',id);initSignaturePad()}
function paymentForm(id){let d=state.deliveries.find(x=>x.id===id);if(!d)return;modal('Fechamento financeiro',`<p>Frete: <strong>${money(d.fee)}</strong> · Repasse: <strong>${money(d.driver_fee)}</strong></p>${sel('Cobrança da empresa','paid',['Não recebido','Recebido'].map((x,i)=>({id:String(i),label:x})),d.paid_at?'1':'0')}${sel('Pagamento ao entregador','driver_paid',['Não pago','Pago'].map((x,i)=>({id:String(i),label:x})),d.driver_paid_at?'1':'0')}`,'payment',id)}

function filteredDeliveries(){let f=state.filter,qry=state.search.toLowerCase().trim(),now=Date.now();return visibleDeliveries().filter(d=>{let age=now-new Date(d.created_at).getTime();return (f==='Todos'||d.status===f)&&(!qry||[d.neighborhood,d.client_name,d.product_name,d.id,titleCompany(d.company_id)].some(v=>String(v||'').toLowerCase().includes(qry)))&&(!state.companyFilter||d.company_id===state.companyFilter)&&(!state.driverFilter||d.assigned_driver_id===state.driverFilter)&&(state.periodFilter==='all'||(state.periodFilter==='today'&&new Date(d.created_at).toDateString()===new Date().toDateString())||(state.periodFilter==='week'&&age>=0&&age<7*86400000)||(state.periodFilter==='month'&&thisMonth(d)))})}
function advancedFilters(){return `<div class="advanced-filters">${sel('Período','period_filter',[{id:'all',label:'Todo o período'},{id:'today',label:'Hoje'},{id:'week',label:'Últimos 7 dias'},{id:'month',label:'Mês atual'}],state.periodFilter).replace('name="period_filter"','data-filter-key="periodFilter" name="period_filter"')}${state.admin?sel('Empresa','company_filter',[{id:'',label:'Todas as empresas'},...state.company.map(x=>({id:x.id,label:x.name}))],state.companyFilter).replace('name="company_filter"','data-filter-key="companyFilter" name="company_filter"'):''}${!state.driverMode?sel('Entregador','driver_filter',[{id:'',label:'Todos os entregadores'},...state.drivers.map(x=>({id:x.user_id,label:x.name}))],state.driverFilter).replace('name="driver_filter"','data-filter-key="driverFilter" name="driver_filter"'):''}</div>`}

function deliveries(){let list=filteredDeliveries(),f=state.filter;return label('Fretes',state.driverMode?'Atualize o andamento das entregas atribuídas.':state.admin?'Gerencie as solicitações recebidas.':'Acompanhe seus pedidos em um só lugar.',state.admin||state.driverMode?'':button('<span class="round-plus">+</span> Novo frete','new-delivery'))+`<div class="searchbar"><span>⌕</span><input type="search" id="search-input" value="${esc(state.search)}" placeholder="Buscar por cliente, bairro ou código" autocomplete="off"></div><div class="filters">${['Todos','Pendente','Aceita','Coletada','Em trânsito','Concluída','Cancelada'].map(x=>`<button class="filter-chip ${x===f?'active':''}" data-act="filter" data-id="${esc(x)}">${esc(x)}</button>`).join('')}</div>${advancedFilters()}<div id="delivery-results" class="delivery-tiles">${list.length?list.map(deliveryCard).join(''):empty('Nenhum frete encontrado','Experimente alterar a busca ou os filtros.')}</div>`}
function clients(){let rows=state.clients.filter(x=>x.company_id===state.companyId);return label('Clientes','Mantenha seus contatos sempre à mão.',button('<span class="round-plus">+</span> Novo','new-client'))+section(`${rows.length} cliente${rows.length===1?'':'s'}`)+`<div class="list-stack">${rows.length?rows.map(c=>`<div class="item-card"><div class="item-avatar">♙</div><div class="item-main"><strong>${esc(c.name)}</strong><small>${esc(c.phone||'Sem telefone')}</small><small>${esc(c.address)} · ${esc(c.neighborhood)}</small></div><div class="item-tools"><button class="tool" data-act="edit-client" data-id="${esc(c.id)}" aria-label="Editar cliente">✎</button><button class="tool danger" data-act="del-client" data-id="${esc(c.id)}" aria-label="Excluir cliente">×</button></div></div>`).join(''):empty('Você ainda não tem clientes','Cadastre um cliente para agilizar novos fretes.')}</div>`}
function products(){let rows=state.products.filter(x=>x.company_id===state.companyId);return label('Produtos','Organize os itens enviados com frequência.',button('<span class="round-plus">+</span> Novo','new-product'))+section(`${rows.length} produto${rows.length===1?'':'s'}`)+`<div class="list-stack">${rows.length?rows.map(p=>`<div class="item-card"><div class="item-avatar green">⬡</div><div class="item-main"><strong>${esc(p.name)}</strong><small>Peso: ${esc(p.weight||'Não informado')}</small><span class="item-price">${money(p.default_price)}</span></div><div class="item-tools"><button class="tool" data-act="edit-product" data-id="${esc(p.id)}" aria-label="Editar produto">✎</button><button class="tool danger" data-act="del-product" data-id="${esc(p.id)}" aria-label="Excluir produto">×</button></div></div>`).join(''):empty('Nenhum produto cadastrado','Cadastre seus itens para adicioná-los aos fretes.')}</div>`}
function companies(){return label('Empresas','Parceiros e controle de acesso.',button('<span class="round-plus">+</span> Cadastrar','new-company'))+section(`${state.company.length} empresa${state.company.length===1?'':'s'}`)+`<div class="list-stack">${state.company.length?state.company.map(c=>`<article class="delivery-card"><div class="card-top"><div><h3 class="card-title">${esc(c.name)}</h3><p class="card-sub">⌖ ${esc(c.neighborhood)} · ${esc(c.phone)}</p></div>${badge(c.status)}</div><div class="detail">◇ Plano ${esc(c.plan)}</div><div class="actions">${button('Editar','edit-company',c.id,'btn small subtle')}${button('Vincular conta','link-user',c.id,'btn small soft')}${button(c.status==='Ativa'?'Suspender':'Ativar','toggle-company',c.id,'btn small subtle')}</div></article>`).join(''):empty('Nenhuma empresa cadastrada')}</div>`}
function rates(){return label('Tarifas','Defina o valor de cada bairro.',button('<span class="round-plus">+</span> Bairro','new-rate'))+section(`${state.rates.length} bairro${state.rates.length===1?'':'s'}`)+`<div class="list-stack">${state.rates.length?state.rates.map(r=>`<div class="item-card"><div class="item-avatar amber">⌖</div><div class="item-main"><strong>${esc(r.neighborhood)}</strong><span class="item-price">${money(r.fee)} por frete</span></div><div class="item-tools"><button class="tool" data-act="edit-rate" data-id="${esc(r.id)}" aria-label="Editar tarifa">✎</button><button class="tool danger" data-act="del-rate" data-id="${esc(r.id)}" aria-label="Excluir tarifa">×</button></div></div>`).join(''):empty('Nenhuma tarifa cadastrada','Adicione bairros para que empresas solicitem entregas.')}</div>`}
function reports(){const rows=visibleDeliveries(),month=rows.filter(thisMonth),freq={};rows.forEach(d=>freq[d.neighborhood]=(freq[d.neighborhood]||0)+1);const sorted=Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,7),weeks=Array.from({length:5},()=>({qty:0,value:0}));month.forEach(d=>{let k=Math.min(4,Math.floor((new Date(d.created_at).getDate()-1)/7));weeks[k].qty++;weeks[k].value+=Number(d.fee)});let highest=Math.max(1,...weeks.map(w=>w.qty));return label('Relatórios','Números reais para acompanhar seu desempenho.')+hero()+`<div class="metric-grid">${metric('⬡','Total de fretes',rows.length,'Desde o primeiro registro')}${metric('▣','Valor acumulado',money(sum(rows)),'Todos os períodos','green')}${metric('✓','Concluídas',rows.filter(x=>x.status==='Concluída').length,'Entregas finalizadas','green')}${metric('◷','Pendentes',rows.filter(x=>x.status==='Pendente').length,'Solicitações abertas','amber')}</div><div class="panel" style="margin-bottom:14px"><h3>Fretes por semana — mês atual</h3><div class="charts">${weeks.map((w,i)=>`<div class="chart-line"><div class="mini-row" style="padding:1px 0;border:0"><span>Semana ${i+1}</span><strong>${w.qty} · ${money(w.value)}</strong></div><div class="progress-track"><div class="progress-fill" style="width:${w.qty/highest*100}%"></div></div></div>`).join('')}</div></div><div class="panel"><h3>Fechamento financeiro</h3><div class="mini-row"><span>Fretes concluídos</span><strong>${money(sum(rows.filter(x=>x.status==='Concluída')))}</strong></div><div class="mini-row"><span>Recebido das empresas</span><strong>${money(sum(rows.filter(x=>x.paid_at)))}</strong></div><div class="mini-row"><span>A receber</span><strong>${money(sum(rows.filter(x=>x.status==='Concluída'&&!x.paid_at)))}</strong></div><div class="mini-row"><span>Repasses aos entregadores pendentes</span><strong>${money(rows.filter(x=>x.status==='Concluída'&&!x.driver_paid_at).reduce((a,x)=>a+Number(x.driver_fee||0),0))}</strong></div>${button('Exportar CSV','export-csv','','btn small soft')}${button('Financeiro CSV','export-payments','','btn small subtle')}${button('Backup JSON','export-json','','btn small subtle')}</div><div class="panel"><h3>Desempenho dos entregadores</h3>${state.drivers.map(x=>{let deliveries=rows.filter(d=>d.assigned_driver_id===x.user_id),done=deliveries.filter(d=>d.status==='Concluída'),scores=state.ratings.filter(r=>r.driver_id===x.user_id),score=scores.length?(scores.reduce((a,r)=>a+r.stars,0)/scores.length).toFixed(1):'-';return `<div class="mini-row"><span>${esc(x.name)} · ★ ${score} (${scores.length})</span><strong>${done.length}/${deliveries.length}</strong></div>`}).join('')||'<p class="subtext">Sem indicadores.</p>'}</div><div class="panel"><h3>Destinos mais frequentes</h3>${sorted.length?sorted.map(([name,count])=>`<div class="mini-row"><span>${esc(name)}</span><strong>${count} · ${Math.round(count/rows.length*100)}%</strong></div>`).join(''):empty('Ainda não há fretes para analisar')}</div>`}
function modal(title,fields,kind,id='new'){let m=$('modal');m.innerHTML=`<div class="dialog" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="dialog-header"><h2>${esc(title)}</h2><button type="button" class="modal-x" data-act="close" aria-label="Fechar">×</button></div>${kind==='readonly'?fields:`<form id="data-form" class="form-stack" data-kind="${kind}" data-id="${esc(id)}">${fields}<div class="form-actions"><button type="button" class="btn subtle" data-act="close">Cancelar</button><button type="submit" class="btn">Salvar alterações</button></div></form>`}</div>`;m.classList.remove('hidden');m.querySelector('input, select')?.focus()}
const close=()=>{$('modal').classList.add('hidden');$('modal').innerHTML=''};
function clientForm(id){let c=state.clients.find(x=>x.id===id)||{};modal(id?'Editar cliente':'Novo cliente',fld('Nome completo','name',c.name)+fld('WhatsApp / telefone','phone',c.phone,'tel')+fld('Bairro','neighborhood',c.neighborhood)+fld('Endereço','address',c.address),'client',id)}
function productForm(id){let p=state.products.find(x=>x.id===id)||{};modal(id?'Editar produto':'Novo produto',fld('Descrição do produto','name',p.name)+fld('Peso estimado','weight',p.weight,'text',false)+fld('Valor de referência (R$)','default_price',p.default_price??0,'number'),'product',id)}
function companyForm(id){let c=state.company.find(x=>x.id===id)||{};modal(id?'Editar empresa':'Nova empresa',fld('Nome da empresa','name',c.name)+fld('Bairro','neighborhood',c.neighborhood)+fld('Telefone','phone',c.phone,'tel')+sel('Plano','plan',['Padrão','Premium'].map(x=>({id:x,label:x})),c.plan||'Padrão'),'company',id)}
function rateForm(id){let r=state.rates.find(x=>x.id===id)||{};modal(id?'Editar tarifa':'Nova tarifa',fld('Bairro de destino','neighborhood',r.neighborhood)+fld('Valor do frete (R$)','fee',r.fee??0,'number'),'rate',id)}
function deliveryForm(){let clients=state.clients.filter(x=>x.company_id===state.companyId),prods=state.products.filter(x=>x.company_id===state.companyId);if(!clients.length||!prods.length){notify('Cadastre ao menos um cliente e um produto antes de criar um frete.',true);return}if(!state.rates.length){notify('A administração precisa cadastrar tarifas por bairro.',true);return}modal('Solicitar frete',sel('Cliente','client_id',clients.map(x=>({id:x.id,label:x.name})))+sel('Produto','product_id',prods.map(x=>({id:x.id,label:x.name})))+sel('Destino','rate_id',state.rates.map(x=>({id:x.id,label:`${x.neighborhood} — ${money(x.fee)}`})))+`<label class="field">Agendar entrega (opcional)<input type="datetime-local" name="scheduled_at"></label><label class="field">Distância estimada (km)<input type="number" min="0" max="2000" step="0.1" value="0" name="distance_km"></label><label class="field">Instruções para entrega<textarea name="notes" placeholder="Ex.: deixar na recepção, produto frágil..."></textarea></label><div class="price-preview"><span>Valor calculado do frete</span><strong id="price-preview">${money(state.rates[0].fee)}</strong></div>`,'delivery');let f=$('data-form');f.elements.client_id.addEventListener('change',()=>{let c=clients.find(x=>x.id===f.elements.client_id.value),r=state.rates.find(x=>x.neighborhood?.toLowerCase()===c?.neighborhood?.toLowerCase());if(r)f.elements.rate_id.value=r.id;refreshPreview()});f.elements.rate_id.addEventListener('change',refreshPreview);f.elements.distance_km.addEventListener('input',refreshPreview);f.elements.client_id.dispatchEvent(new Event('change'))}
function driverForm(){modal('Cadastrar entregador',fld('Nome do entregador','name')+fld('E-mail já cadastrado no Supabase Auth','email','','email')+fld('Telefone / WhatsApp','phone','','tel'),'driver')}

function refreshPreview(){let form=$('data-form'),r=state.rates.find(x=>x.id===form?.elements.rate_id?.value),p=state.products.find(x=>x.id===form?.elements.product_id?.value),weight=parseFloat(String(p?.weight||'0').replace(',','.'))||0,setting=state.settingsV5||{};if($('price-preview'))$('price-preview').textContent=money(Number(r?.fee||0)+Number(form?.elements.distance_km?.value||0)*Number(setting.per_km||0)+(weight>Number(setting.heavy_threshold_kg||10)?Number(setting.heavy_item_fee||0):0))}
async function save(form){let {kind,id}=form.dataset,d=fd(form),submit=form.querySelector('[type="submit"]');
 if(['stops-add','settle-company','settle-driver'].includes(kind)){
  submit.disabled=true;
  try{if(kind==='stops-add')await v51SaveStops(id,d.stops_text);
   else await v51SaveSettlement(kind==='settle-company'?'company':'driver',d)}
  catch(e){err(e)}finally{submit.disabled=false}return;
 }
 submit.disabled=true;try{
 if(!navigator.onLine&&['delivery','client','product'].includes(kind)&&id==='new'){
  const rid=crypto.randomUUID();
  if(kind==='delivery'){
   let c=state.clients.find(x=>x.id===d.client_id),p=state.products.find(x=>x.id===d.product_id),r=state.rates.find(x=>x.id===d.rate_id);
   if(!c||!p||!r)throw Error('Cliente, produto ou bairro indisponível no cache');
   const record={id:rid,company_id:state.companyId,client_id:c.id,product_id:p.id,client_name:c.name,product_name:p.name,neighborhood:r.neighborhood,fee:Number(r.fee),status:'Pendente',notes:d.notes.trim(),scheduled_at:d.scheduled_at?new Date(d.scheduled_at).toISOString():null,distance_km:Number(d.distance_km||0)};
   queueInsert('deliveries',record);
  }else if(kind==='client')queueInsert('clients',{id:rid,company_id:state.companyId,name:d.name.trim(),phone:d.phone.trim(),neighborhood:d.neighborhood.trim(),address:d.address.trim()});
  else queueInsert('products',{id:rid,company_id:state.companyId,name:d.name.trim(),weight:d.weight.trim(),default_price:Number(d.default_price)});
  return;
 }
 if(kind==='delivery'){let c=state.clients.find(x=>x.id===d.client_id),p=state.products.find(x=>x.id===d.product_id),r=state.rates.find(x=>x.id===d.rate_id);if(!c||!p||!r)throw Error('Selecione cliente, produto e destino válidos.');await q(db.from('deliveries').insert({company_id:state.companyId,client_id:c.id,product_id:p.id,client_name:c.name,product_name:p.name,neighborhood:r.neighborhood,fee:r.fee,status:'Pendente',notes:d.notes.trim(),scheduled_at:d.scheduled_at?new Date(d.scheduled_at).toISOString():null,distance_km:Number(d.distance_km||0)}));}else if(kind==='client'){let v={name:d.name.trim(),phone:d.phone.trim(),neighborhood:d.neighborhood.trim(),address:d.address.trim()};await q(id==='new'?db.from('clients').insert({...v,company_id:state.companyId}):db.from('clients').update(v).eq('id',id));}else if(kind==='product'){let v={name:d.name.trim(),weight:d.weight.trim(),default_price:Number(d.default_price)};await q(id==='new'?db.from('products').insert({...v,company_id:state.companyId}):db.from('products').update(v).eq('id',id));}else if(kind==='company'){let v={name:d.name.trim(),neighborhood:d.neighborhood.trim(),phone:d.phone.trim(),plan:d.plan};await q(id==='new'?db.from('companies').insert({...v,status:'Ativa'}):db.from('companies').update(v).eq('id',id));}else if(kind==='rate'){let v={neighborhood:d.neighborhood.trim(),fee:Number(d.fee)};await q(id==='new'?db.from('neighborhood_rates').insert(v):db.from('neighborhood_rates').update(v).eq('id',id));}else if(kind==='driver'){await q(db.rpc('admin_link_driver',{p_email:d.email.trim(),p_name:d.name.trim(),p_phone:d.phone.trim()}))}else if(kind==='assign'){await q(db.from('deliveries').update({assigned_driver_id:d.assigned_driver_id||null,driver_fee:Number(d.driver_fee)}).eq('id',id))}else if(kind==='payment'){await q(db.from('deliveries').update({paid_at:d.paid==='1'?new Date().toISOString():null,driver_paid_at:d.driver_paid==='1'?new Date().toISOString():null}).eq('id',id))}else if(kind==='proof'){if(!navigator.onLine)throw Error('É necessário internet para confirmar a entrega com comprovante.');const file=form.elements.photo.files[0];let path=null,signPath=null,uploaded=[];try{if(file){if(file.size>5*1024*1024)throw Error('Foto excede 5 MB.');if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Use JPG, PNG ou WEBP.');path=`${id}/${state.user.id}/${crypto.randomUUID()}.${file.type.split('/')[1].replace('jpeg','jpg')}`;await q(db.storage.from('delivery-proofs').upload(path,file,{contentType:file.type,upsert:false}));uploaded.push(path)}if(signatureTouched){const blob=await new Promise(res=>$('signature-pad').toBlob(res,'image/png'));signPath=`${id}/${state.user.id}/${crypto.randomUUID()}-signature.png`;await q(db.storage.from('delivery-proofs').upload(signPath,blob,{contentType:'image/png'}));uploaded.push(signPath)}let coords=null;if(form.elements.proof_position.checked)coords=await getLocation();if(signPath||coords)await q(db.rpc('amo_save_proof_metadata',{p_delivery_id:id,p_signature_path:signPath,p_lat:coords?.latitude??null,p_lng:coords?.longitude??null}));await q(db.rpc('driver_complete_delivery',{p_delivery_id:id,p_recipient:d.recipient_name.trim(),p_proof_path:path}))}catch(e){if(uploaded.length)await db.storage.from('delivery-proofs').remove(uploaded);throw e}}else if(kind==='schedule'){await q(db.from('deliveries').update({scheduled_at:d.scheduled_at?new Date(d.scheduled_at).toISOString():null,distance_km:Number(d.distance_km||0)}).eq('id',id))}else if(kind==='rating'){let v=state.deliveries.find(x=>x.id===id);await q(db.from('delivery_ratings').insert({delivery_id:id,company_id:v.company_id,driver_id:v.assigned_driver_id,author_id:state.user.id,stars:Number(d.stars),comment:d.comment.trim()}))}else if(kind==='logistics'){await q(db.from('logistics_settings').update({per_km:Number(d.per_km),heavy_item_fee:Number(d.heavy_item_fee),heavy_threshold_kg:Number(d.heavy_threshold_kg),updated_at:new Date().toISOString()}).eq('id',1))}else if(kind==='link'){await q(db.rpc('admin_link_company_user',{p_company_id:id,p_email:d.email.trim()}))}close();notify(kind==='delivery'?'Frete solicitado com sucesso!':'Informações salvas com sucesso!');await load()}catch(e){err(e)}finally{submit.disabled=false}}
async function del(table,id){if(!confirm('Deseja realmente excluir este registro?'))return;try{await q(db.from(table).delete().eq('id',id));notify('Registro excluído.');await load()}catch(e){err(e)}}
async function updateStatus(id,status){try{if(state.driverMode){if(!navigator.onLine){enqueue({id,status});notify('Sem internet: atualização salva para sincronizar.');return}await q(db.rpc('driver_update_status',{p_delivery_id:id,p_status:status}))}else await q(db.from('deliveries').update({status}).eq('id',id));notify('Status atualizado!');await load()}catch(e){if(state.driverMode&&(e?.message?.toLowerCase().includes('fetch')||!navigator.onLine)){enqueue({id,status});notify('Atualização salva para sincronizar.')}else{err(e);await load()}}}
async function toggle(id){let c=state.company.find(x=>x.id===id);if(!c)return;try{await q(db.from('companies').update({status:c.status==='Ativa'?'Suspensa':'Ativa'}).eq('id',id));notify('Situação da empresa atualizada.');await load()}catch(e){err(e)}}
const cacheKey=()=>`amo_cache_${state.user?.id||'none'}`,queueKey=()=>`amo_queue_${state.user?.id||'none'}`;
function pendingQueue(){try{return JSON.parse(localStorage.getItem(queueKey())||'[]')}catch{return []}}
function enqueue(op){let arr=pendingQueue();if(!arr.some(x=>x.id===op.id&&x.status===op.status))arr.push({...op,queued_at:new Date().toISOString()});localStorage.setItem(queueKey(),JSON.stringify(arr));let row=state.deliveries.find(x=>x.id===op.id);if(row){row.status=op.status;render()}$('sync-text').textContent='Pendente';}
async function flushQueue(){
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
}
function queueInsert(table,record){let ops=pendingQueue();ops.push({type:'insert',table,record,queued_at:new Date().toISOString()});localStorage.setItem(queueKey(),JSON.stringify(ops));state[table].unshift({...record,created_at:record.created_at||new Date().toISOString()});snapshot();notify('Registro salvo neste dispositivo. Será enviado ao reconectar.');close();render()}

function snapshot(){let {company,members,clients,products,deliveries,rates,drivers,events,notices,admin,driver,companyId,locations,ratings,audit,settingsV5}=state;try{localStorage.setItem(cacheKey(),JSON.stringify({company,members,clients,products,deliveries,rates,drivers,events,notices,admin,driver,companyId,locations,ratings,audit,settingsV5,ts:Date.now()}))}catch(e){console.warn('Cache local cheio',e)}}
async function load(){if(!state.user)return;if(state.loading){state.refreshPending=true;return;}const loadingUserId=state.user.id;state.loading=true;try{if(!(await requireAuthenticatedSession(loadingUserId)))return;$('sync').classList.remove('offline');$('sync-text').textContent='Atualizando';let [company,members,admins,clients,products,deliveries,rates,drivers,events,notices]=await withTimeout(Promise.all([q(db.from('companies').select('*').order('created_at',{ascending:false})),q(db.from('company_members').select('*').eq('user_id',state.user.id)),q(db.from('app_admins').select('user_id').eq('user_id',state.user.id)),q(db.from('clients').select('*').order('created_at',{ascending:false})),q(db.from('products').select('*').order('created_at',{ascending:false})),q(db.from('deliveries').select('*').order('created_at',{ascending:false})),q(db.from('neighborhood_rates').select('*').order('neighborhood')),q(db.from('drivers').select('*').order('name')),q(db.from('delivery_events').select('*').order('created_at',{ascending:false}).limit(500)),q(db.from('notifications').select('*').order('created_at',{ascending:false}).limit(100))]),15000,'A consulta ao Supabase demorou demais. Verifique a conexão e tente novamente.');for(const op of pendingQueue())if(op.type==='insert'&&['deliveries','clients','products'].includes(op.table)){
  const list={deliveries,clients,products}[op.table];if(!list.some(row=>row.id===op.record.id))list.unshift({...op.record,created_at:op.record.created_at||new Date().toISOString()});
 }let unseen=notices.filter(n=>!n.read_at&&!state.notices.some(old=>old.id===n.id));if(state.loadedOnce&&unseen.length&&'Notification' in window&&Notification.permission==='granted'&&document.visibilityState==='visible'){new Notification('AMO Express',{body:unseen[0].title+' · '+unseen[0].body,icon:'./icons/icon-192.png'})}if(state.user?.id!==loadingUserId)return;let driver=drivers.find(x=>x.user_id===state.user.id)||null;Object.assign(state,{company,members,admin:admins.length>0,clients,products,deliveries,rates,drivers,events,notices,driver,offline:false});if(!state.admin){let ids=members.map(x=>x.company_id);state.companyId=ids.includes(state.companyId)?state.companyId:ids[0]||null;state.driverMode=!state.companyId&&!!driver?.active;if(!state.companyId&&!state.driverMode){$('nav').classList.add('hidden');$('context-label').textContent='Aguardando acesso';$('app').innerHTML=`${label('Acesso pendente','Sua conta ainda não está vinculada a uma empresa nem cadastrada como entregador.')}<div class="panel"><h3>Falta apenas um passo</h3><p class="subtext">Peça ao administrador para vincular a conta <strong>${esc(state.user.email)}</strong>.</p><div style="margin-top:15px">${button('Verificar novamente','reload')}</div></div>`;$('sync-text').textContent='Conectado';bootReady();return}if(['companies','rates','drivers','clients','products'].includes(state.tab)&&state.driverMode)state.tab='home';if(['companies','rates','drivers'].includes(state.tab)&&!state.driverMode)state.tab='home'}else state.driverMode=false;if(!(await requireAuthenticatedSession(loadingUserId)))return;await flushQueue();if(!(await requireAuthenticatedSession(loadingUserId)))return;await loadExtras();if(state.user?.id!==loadingUserId)return;snapshot();state.loadedOnce=true;$('sync-text').textContent='Online';render()}catch(e){$('sync').classList.add('offline');$('sync-text').textContent='Offline';state.offline=true;try{let data=JSON.parse(localStorage.getItem(cacheKey())||'null');if(!data)throw Error('Sem cache');Object.assign(state,data);state.driverMode=!state.admin&&!state.companyId&&!!state.driver;render();notify('Sem conexão: exibindo últimos dados sincronizados.')}catch{$('app').innerHTML=`${empty('Não foi possível carregar',e?.message||'Conecte à internet para a primeira sincronização.')}<div style="margin-top:14px">${button('Tentar novamente','reload')}</div>`;bootReady();err(e)}}finally{state.loading=false;if(state.refreshPending){state.refreshPending=false;setTimeout(load,250)}}}

function subscribe(){
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
}
function login(message=''){bootReady();if(state.geoWatch!==null){navigator.geolocation?.clearWatch(state.geoWatch);state.geoWatch=null}state.channel?.unsubscribe();v51Reset();state.user=null;$('logout').classList.add('hidden');$('nav').classList.add('hidden');$('context-label').textContent='Sua entrega, sem complicação.';$('sync').classList.add('offline');$('sync-text').textContent='Acesso';$('app').innerHTML=`<div class="login-wrap"><div class="login-card"><div class="login-hero"><div class="login-circle">🛵</div><div class="eyebrow">BEM-VINDO AO AMO EXPRESS</div><h1>Entregas mais simples.</h1><p class="subtext">Tudo organizado, de onde você estiver.</p></div><div class="login-panel"><h2>Entre na sua conta</h2><p class="subtext">Acesse sua empresa ou o painel administrativo.</p>${message?`<div class="notice">${esc(message)}</div>`:''}<form id="login-form" class="form-stack">${fld('E-mail','email','','email')}${fld('Senha','password','','password')}<button class="btn block" type="submit">Entrar na plataforma →</button></form><button class="muted-link" data-act="forgot">Esqueci minha senha</button></div></div></div>`}
function recovery(){bootReady();state.user=null;$('nav').classList.add('hidden');$('app').innerHTML=`<div class="login-wrap"><div class="login-card"><h2>Definir nova senha</h2><form id="recovery-form" class="form-stack">${fld('Nova senha (mínimo de 8 caracteres)','password','','password')}<button type="submit" class="btn">Alterar senha</button></form></div></div>`}

async function init(){if(!db){login(!configured?'Preencha a URL e a chave pública no arquivo config.js para conectar o Supabase.':'Não foi possível carregar a biblioteca do Supabase. Verifique a conexão.');return}db.auth.onAuthStateChange((type,session)=>{if(type==='PASSWORD_RECOVERY'){recovery()}else if(type==='SIGNED_OUT'){state.channel?.unsubscribe();if(state.geoWatch!==null){navigator.geolocation?.clearWatch(state.geoWatch);state.geoWatch=null}v51Reset();login()}else if(type==='SIGNED_IN'&&session?.user&&state.user?.id!==session.user.id){state.user=session.user;state.tab='home';setTimeout(async()=>{await load();subscribe()},0)}});try{let {data,error}=await withTimeout(db.auth.getSession(),12000,'A recuperação da sessão demorou demais.');if(error)throw error;if(data?.session?.user){state.user=data.session.user;await load();subscribe()}else if(!state.user)login()}catch(e){console.error('Erro ao recuperar sessão',e);if(state.user){await load();subscribe();return}bootReady();$('sync-text').textContent='Falha ao iniciar';$('app').innerHTML=`${empty('Não foi possível iniciar',e?.message||'Falha ao recuperar a sessão.')}<div style="margin-top:14px"><button type="button" class="btn" onclick="location.reload()">Tentar novamente</button></div>`}}
$('logout').addEventListener('click',async()=>{try{if(state.geoWatch!==null){navigator.geolocation.clearWatch(state.geoWatch);state.geoWatch=null}if(pendingQueue().length&&!confirm('Existem operações offline pendentes. Sair agora DESCARTARÁ essas alterações. Deseja continuar?'))return;
 localStorage.removeItem(cacheKey());localStorage.removeItem(queueKey());if(db)await db.auth.signOut();login()}catch(e){err(e)}});
$('app').addEventListener('submit',async e=>{if(e.target.id==='recovery-form'){e.preventDefault();try{let password=e.target.elements.password.value;if(password.length<8)throw Error('Use pelo menos 8 caracteres.');await q(db.auth.updateUser({password}));notify('Senha alterada.');await load()}catch(ex){err(ex)}return}if(e.target.id!=='login-form')return;e.preventDefault();if(!db){notify('Configure o Supabase primeiro.',true);return}let v=fd(e.target),btn=e.target.querySelector('button');btn.disabled=true;try{let {data,error}=await db.auth.signInWithPassword({email:v.email.trim(),password:v.password});if(error)throw error;state.user=data.user;state.tab='home';await load();subscribe()}catch(e){err(e)}finally{btn.disabled=false}});
$('modal').addEventListener('click',e=>{if(e.target===$('modal'))close()});$('modal').addEventListener('change',e=>{if(e.target.matches('[data-password-toggle]')){const form=e.target.closest('form');if(form?.dataset.kind==='change-password')form.querySelectorAll('input[name$="_password"]').forEach(input=>input.type=e.target.checked?'text':'password')}});$('modal').addEventListener('submit',e=>{if(e.target.id==='data-form'){e.preventDefault();if(e.target.dataset.kind==='change-password')savePassword(e.target);else save(e.target)}});
function searchResults(){let list=filteredDeliveries();if($('delivery-results'))$('delivery-results').innerHTML=list.length?list.map(deliveryCard).join(''):empty('Nenhum frete encontrado','Experimente alterar a busca ou os filtros.')}

document.addEventListener('input',e=>{if(e.target.id==='search-input'){state.search=e.target.value;searchResults()}});
document.addEventListener('change',e=>{if(e.target.matches('[data-status-id]'))updateStatus(e.target.dataset.statusId,e.target.value);if(e.target.matches('[data-filter-key]')){state[e.target.dataset.filterKey]=e.target.value;searchResults()}});
document.addEventListener('click',async e=>{let el=e.target.closest('[data-act]');if(!el)return;const {act,id}=el.dataset;switch(act){case'tab':state.tab=id;state.search='';state.filter='Todos';state.companyFilter='';state.driverFilter='';state.periodFilter='all';render();window.scrollTo({top:0,behavior:'smooth'});break;case'filter':state.filter=id;document.querySelectorAll('.filter-chip').forEach(x=>x.classList.toggle('active',x.dataset.id===id));searchResults();break;case'close':close();break;case'reload':await load();break;case'new-delivery':deliveryForm();break;case'new-driver':driverForm();break;case'driver-toggle':{let d=state.drivers.find(x=>x.user_id===id);if(d){try{await q(db.from('drivers').update({active:!d.active}).eq('user_id',id));await load()}catch(ex){err(ex)}}break}case'assign':assignForm(id);break;case'timeline':timeline(id);break;case'proof':proofForm(id);break;case'payment':paymentForm(id);break;case'driver-status':{let [di,st]=id.split('|');await updateStatus(di,st);break}case'view-proof':await showProofAsset(id,'proof_path');break;case'read-notice':await q(db.from('notifications').update({read_at:new Date().toISOString()}).eq('id',id));await load();break;case'read-notices':await q(db.from('notifications').update({read_at:new Date().toISOString()}).is('read_at',null));await load();break;case'change-password':changePasswordForm();break;case'reset-password':await sendPasswordReset();break;case'clear-cache':localStorage.removeItem(cacheKey());notify('Cache local apagado.');break;case'signout':$('logout').click();break;case'browser-permission':if('Notification'in window){let permission=await Notification.requestPermission();notify(permission==='granted'?'Notificações ativadas neste navegador.':'Permissão não concedida.')}else notify('Navegador não suporta avisos.',true);break;case'export-csv':exportCsv();break;case'export-json':exportJson();break;case'export-payments':exportPayments();break;case'route':openRoute();break;case'geo-toggle':toggleGPS();break;case'clear-signature':clearSignature();break;case'check-delays':await runAutomations();break;case'schedule':scheduleForm(id);break;case'rate-delivery':ratingForm(id);break;case'config-logistics':logisticsForm();break;case'view-signature':await showProofAsset(id,'recipient_signature_path');break;case'view-audit':showAudit(id);break;case'new-client':clientForm();break;case'edit-client':clientForm(id);break;case'del-client':await del('clients',id);break;case'new-product':productForm();break;case'edit-product':productForm(id);break;case'del-product':await del('products',id);break;case'new-company':companyForm();break;case'edit-company':companyForm(id);break;case'toggle-company':await toggle(id);break;case'link-user':modal('Vincular conta',`<div class="notice">A conta deve existir em Authentication → Users no Supabase. Informe exatamente o e-mail dessa conta.</div>${fld('E-mail do usuário','email','','email')}`,'link',id);break;case'new-rate':rateForm();break;case'edit-rate':rateForm(id);break;case'del-rate':await del('neighborhood_rates',id);break;case'cancel-delivery':if(confirm('Deseja cancelar este frete?'))await updateStatus(id,'Cancelada');break;case'stops':v51Stops(id);break;
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
 case'forgot':{if(!db)return notify('Configure o Supabase antes.',true);let email=prompt('Informe seu e-mail para redefinir a senha:');if(email){let {error}=await db.auth.resetPasswordForEmail(email.trim(),{redirectTo:location.origin+location.pathname});if(error)err(error);else notify('Se a conta existir, as instruções chegarão por e-mail.')}break}}});
window.addEventListener('online',()=>{if(state.user)load()});window.addEventListener('offline',()=>{state.offline=true;$('sync-text').textContent='Offline'});

// === AMO Express 5.0: funcionalidades adicionais, sem substituir cadastros legados ===
let signatureTouched=false;
function scheduleRefresh(){clearTimeout(state.timer);state.timer=setTimeout(()=>load(),400)}
async function optional(table,query){try{return await q(query||db.from(table).select('*'))}catch(e){console.warn('Módulo opcional '+table,e.message);return null}}
async function loadExtras(){
 if(!state.user)return;
 const extrasUserId=state.user.id;
 if(!(await requireAuthenticatedSession(extrasUserId)))return;
 const [locations,ratings,audit,settings]=await Promise.all([
 optional('driver_locations'),optional('delivery_ratings'),optional('amo_audit_log',db.from('amo_audit_log').select('*').order('created_at',{ascending:false}).limit(150)),optional('logistics_settings')
 ]);
 if(state.user?.id!==extrasUserId)return;
 if(locations!==null)state.locations=locations;
 if(ratings!==null)state.ratings=ratings;
 if(audit!==null)state.audit=audit;
 if(settings!==null)state.settingsV5=settings?.[0]||null;
 state.extrasAvailable=!!settings;
 await v51Load();
}
function operations(){let rows=visibleDeliveries(),statuses=['Pendente','Aceita','Coletada','Em trânsito','Concluída','Cancelada'],active=rows.filter(x=>!['Concluída','Cancelada'].includes(x.status)),late=active.filter(x=>x.scheduled_at&&Date.now()>new Date(x.scheduled_at).getTime()+30*60000);return label('Central de operações','Painel operacional com atualização automática.',button('Atualizar','reload','','btn small soft'))+`<div class="metric-grid">${metric('◷','Em aberto',active.length,'Aguardando conclusão')}${metric('!','Atrasadas',late.length,'30 min após agendamento','amber')}${metric('✓','Concluídas',rows.filter(x=>x.status==='Concluída').length,'Histórico')}${metric('▥','Recebido',money(sum(rows.filter(x=>x.paid_at))),'Pagamentos registrados','green')}</div><div class="panel"><h3>Fluxo das entregas</h3>${statuses.map(x=>`<div class="mini-row"><span>${badge(x)}</span><strong>${rows.filter(d=>d.status===x).length}</strong></div>`).join('')}${state.admin?button('Verificar atrasos','check-delays','','btn small soft')+button('Distribuir 10 fretes','auto-assign','','btn small'):''}</div>${section('Entregas que precisam de atenção')}<div class="delivery-tiles">${[...late,...active.filter(x=>!late.includes(x))].slice(0,12).map(deliveryCard).join('')||empty('Nenhum frete em aberto')}</div>${v51Kpis()}`}

function logistics(){let rows=visibleDeliveries(),places=rows.filter(x=>!['Concluída','Cancelada'].includes(x.status)),group=Object.entries(places.reduce((o,d)=>{(o[d.neighborhood]??=[]).push(d);return o},{}));return label('Inteligência logística','Rotas agrupadas, localização e distribuição de fretes.')+`<div class="panel"><h3>Rota sugerida por bairros</h3><p class="subtext">Agrupamento geográfico aproximado, não otimização por tempo de trânsito. Confirme a rota no aplicativo de mapas.</p>${group.map(([name,ds])=>`<div class="mini-row"><span>${esc(name)}</span><strong>${ds.length} frete(s)</strong></div>`).join('')||empty('Sem entregas ativas')}${button('Abrir rota no Google Maps','route','','btn small soft')}</div>${state.admin?`<div class="panel"><h3>Configuração de tarifas</h3><p>Base por bairro + distância declarada + adicional por peso.</p><p class="subtext">Valor por km: ${money(state.settingsV5?.per_km||0)} · Peso extra: ${money(state.settingsV5?.heavy_item_fee||0)} acima de ${esc(state.settingsV5?.heavy_threshold_kg||10)} kg.</p>${button('Editar parâmetros','config-logistics','','btn small soft')}</div>`:''}<div class="panel"><h3>GPS dos entregadores</h3><p class="subtext">Compartilhamento voluntário enquanto a página estiver aberta. Sem rastreamento oculto.</p>${state.driverMode?button(state.geoWatch===null?'Ativar localização':'Parar compartilhamento','geo-toggle','','btn small soft'):''}${state.locations.filter(l=>state.admin||l.user_id===state.user.id||places.some(d=>d.assigned_driver_id===l.user_id)).map(l=>`<div class="mini-row"><span>${esc(driverName(l.user_id))} · ${date(l.updated_at)}</span><a class="btn small subtle" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${Number(l.latitude)},${Number(l.longitude)}">Ver mapa</a></div>`).join('')||'<p class="subtext">Nenhuma localização compartilhada.</p>'}</div>`}
function auditView(){if(state.driverMode)return label('Auditoria','Disponível para administradores e empresas.');return label('Auditoria e histórico','Alterações de entregas registradas no servidor.')+`<div class="list-stack">${state.audit.map(a=>`<article class="item-card"><div class="item-avatar">≡</div><div class="item-main"><strong>${esc(a.action)} · #${esc((a.record_id||'').slice(0,8))}</strong><small>${date(a.created_at)}</small><small>${esc(Object.keys(a.changes||{}).join(', ')||'Novo registro')}</small></div>${button('Detalhes','view-audit',String(a.id),'btn small soft')}</article>`).join('')||empty('Nenhuma alteração auditada','Os registros novos aparecerão depois da migração.')}</div>`}
function showAudit(id){let a=state.audit.find(x=>String(x.id)===id);if(!a)return;modal('Registro de auditoria',`<div class="panel"><p><strong>${esc(a.action)} · ${date(a.created_at)}</strong></p>${Object.entries(a.changes||{}).map(([k,v])=>`<div class="mini-row"><span>${esc(k)}</span><small>${esc(JSON.stringify(v.from??null))} → ${esc(JSON.stringify(v.to??null))}</small></div>`).join('')}</div>`,'readonly')}
function scheduleForm(id){let d=state.deliveries.find(x=>x.id===id);if(!d)return;let value=d.scheduled_at?new Date(new Date(d.scheduled_at).getTime()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16):'';modal('Agendar frete',`<label class="field">Data e hora<input name="scheduled_at" type="datetime-local" value="${esc(value)}"></label>${fld('Distância em km','distance_km',d.distance_km||0,'number',false)}`,'schedule',id)}
function ratingForm(id){let d=state.deliveries.find(x=>x.id===id);if(!d)return;let prev=state.ratings.find(x=>x.delivery_id===id);if(prev){notify('Este frete já foi avaliado.');return}modal('Avaliar entregador',sel('Nota','stars',[1,2,3,4,5].map(v=>({id:String(v),label:'★'.repeat(v)+' ('+v+'/5)'})),'5')+`<label class="field">Comentário<textarea name="comment" maxlength="1000" placeholder="Opcional"></textarea></label>`,'rating',id)}
function logisticsForm(){let s=state.settingsV5||{};modal('Parâmetros de frete',fld('Adicional por quilômetro (R$)','per_km',s.per_km??0,'number')+fld('Adicional por peso (R$)','heavy_item_fee',s.heavy_item_fee??0,'number')+fld('Peso limite (kg)','heavy_threshold_kg',s.heavy_threshold_kg??10,'number'),'logistics','1')}
function getLocation(){return new Promise((resolve,reject)=>{if(!navigator.geolocation)return reject(Error('GPS indisponível.'));navigator.geolocation.getCurrentPosition(p=>resolve({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy}),e=>reject(Error(e.message)),{enableHighAccuracy:true,timeout:15000,maximumAge:30000})})}
async function toggleGPS(){if(state.geoWatch!==null){navigator.geolocation.clearWatch(state.geoWatch);state.geoWatch=null;notify('Compartilhamento interrompido.');render();return}if(!navigator.geolocation||!window.isSecureContext)return notify('Use HTTPS para compartilhar localização.',true);state.geoWatch=navigator.geolocation.watchPosition(async p=>{if(!navigator.onLine)return;try{await q(db.from('driver_locations').upsert({user_id:state.user.id,latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy_m:p.coords.accuracy,updated_at:new Date().toISOString()},{onConflict:'user_id'}))}catch(e){console.warn(e)}},e=>{notify('Não foi possível acessar o GPS: '+e.message,true);if(state.geoWatch!==null){navigator.geolocation.clearWatch(state.geoWatch);state.geoWatch=null}},{enableHighAccuracy:false,timeout:20000,maximumAge:20000});render()}
function initSignaturePad(){signatureTouched=false;let canvas=$('signature-pad');if(!canvas)return;let ctx=canvas.getContext('2d'),drawing=false;ctx.lineWidth=2.5;ctx.strokeStyle='#172d53';ctx.lineCap='round';function pos(e){let r=canvas.getBoundingClientRect();return [(e.clientX-r.left)*canvas.width/r.width,(e.clientY-r.top)*canvas.height/r.height]}canvas.addEventListener('pointerdown',e=>{e.preventDefault();canvas.setPointerCapture(e.pointerId);drawing=true;let [x,y]=pos(e);ctx.beginPath();ctx.moveTo(x,y)});canvas.addEventListener('pointermove',e=>{if(!drawing)return;e.preventDefault();let [x,y]=pos(e);ctx.lineTo(x,y);ctx.stroke();signatureTouched=true});canvas.addEventListener('pointerup',()=>drawing=false);canvas.addEventListener('pointercancel',()=>drawing=false)}
function clearSignature(){let c=$('signature-pad');if(c){c.getContext('2d').clearRect(0,0,c.width,c.height);signatureTouched=false}}
async function showProofAsset(id,key){let d=state.deliveries.find(x=>x.id===id);if(!d?.[key])return;try{let {data,error}=await db.storage.from('delivery-proofs').createSignedUrl(d[key],90);if(error)throw error;window.open(data.signedUrl,'_blank','noopener,noreferrer')}catch(e){err(e)}}
function openRoute(){let rows=visibleDeliveries().filter(x=>!['Concluída','Cancelada'].includes(x.status)).sort((a,b)=>a.neighborhood.localeCompare(b.neighborhood,'pt-BR'));if(!rows.length)return notify('Sem entregas para planejar.');let stops=rows.slice(0,9).map(x=>{let c=state.clients.find(c=>c.id===x.client_id);return [c?.address,x.neighborhood].filter(Boolean).join(', ')}).filter(Boolean);if(!stops.length)return notify('Cadastre os endereços dos clientes.',true);let url='https://www.google.com/maps/dir/?api=1&travelmode=driving&destination='+encodeURIComponent(stops.at(-1));if(stops.length>1)url+='&waypoints='+encodeURIComponent(stops.slice(0,-1).join('|'));window.open(url,'_blank','noopener,noreferrer')}
async function runAutomations(){try{let n=await q(db.rpc('amo_check_delays'));notify(`${n} aviso(s) de atraso criado(s).`);await load()}catch(e){err(e)}}
function exportJson(){let data={version:5,exported_at:new Date().toISOString(),deliveries:visibleDeliveries(),companies:state.admin?state.company:state.company.filter(c=>c.id===state.companyId),ratings:state.ratings,audit:state.audit};downloadFile('amo-express-backup.json',JSON.stringify(data,null,2),'application/json')}
function exportPayments(){let rows=visibleDeliveries(),head=['Frete','Empresa','Status','Tarifa','Repasse','Recebido em','Entregador pago em','Saldo bruto'];exportTable('amo-express-financeiro.csv',[head,...rows.map(d=>[d.id,titleCompany(d.company_id),d.status,d.fee,d.driver_fee||0,d.paid_at||'',d.driver_paid_at||'',Number(d.fee)-Number(d.driver_fee||0)])])}
function downloadFile(name,content,type){let u=URL.createObjectURL(new Blob([content],{type}));let a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),3000)}
function exportTable(name,rows){downloadFile(name,'\ufeff'+rows.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\r\n'),'text/csv;charset=utf-8')}

function exportCsv(){let headings=['Código','Data','Empresa','Cliente','Bairro','Produto','Status','Entregador','Frete','Repasse','Recebido','Entregador pago'];let lines=[headings,...visibleDeliveries().map(d=>[d.id,d.created_at,titleCompany(d.company_id),d.client_name,d.neighborhood,d.product_name,d.status,driverName(d.assigned_driver_id),d.fee,d.driver_fee||0,d.paid_at?'Sim':'Não',d.driver_paid_at?'Sim':'Não'])];let csv='\ufeff'+lines.map(row=>row.map(x=>'"'+String(x??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');let a=document.createElement('a'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.href=url;a.download='amo-express-fretes.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000)}
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

if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(reg=>reg.update().catch(console.warn)).catch(console.warn);
init();
})();
