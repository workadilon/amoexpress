(()=>{'use strict';
const el=document.getElementById('tracking-result');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>v?new Date(v).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'Ainda não informado';
const raw=location.hash.slice(1);
if(!/^[0-9a-f]{64}$/.test(raw)){el.innerHTML='<p class="track-error">Link inválido ou incompleto.</p>';return;}
const cfg=window.AMO_CONFIG||{};
if(!cfg.supabaseUrl||!cfg.supabaseAnonKey||!window.supabase){el.innerHTML='<p>Servidor indisponível. Tente novamente mais tarde.</p>';return;}
const db=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
let busy=false;
async function refresh(){
 if(busy||document.hidden)return;
 if(!navigator.onLine){el.textContent='Sem internet. Reconecte para consultar o andamento da entrega.';return;}
 busy=true;
 try{
  const {data,error}=await db.rpc('amo_public_tracking',{p_token:raw});
  if(error)throw error;
  if(!data){el.innerHTML='<div class="track-error"><h2>Link indisponível</h2><p>O compartilhamento expirou, foi substituído ou não existe. Solicite um novo link à empresa.</p></div>';return;}
  const steps=['Pendente','Aceita','Coletada','Em trânsito','Concluída'];const index=steps.indexOf(data.status);
  el.innerHTML=`<div class="track-heading"><span class="status-dot"></span><strong>Frete #${esc(data.code)}</strong><span class="badge">${esc(data.status)}</span></div>`+
   `<p class="subtext">Destino: <strong>${esc(data.neighborhood||'—')}</strong></p>`+
   `<div class="track-steps">${steps.map((s,i)=>`<div class="track-step ${index>=i&&index!==-1?'done':''}"><span>${index>=i&&index!==-1?'✓':i+1}</span><strong>${esc(s)}</strong></div>`).join('')}</div>`+
   (data.status==='Cancelada'?'<p class="notice">Esta entrega foi cancelada.</p>':'')+
   `<div class="mini-row"><span>Agendamento</span><strong>${esc(fmt(data.scheduled_at))}</strong></div>`+
   `<div class="mini-row"><span>Última atualização</span><strong>${esc(fmt(data.updated_at))}</strong></div>`+
   `<div class="mini-row"><span>Concluída em</span><strong>${esc(fmt(data.delivered_at))}</strong></div>`;
 }catch(e){el.innerHTML='<div class="track-error"><h2>Não foi possível atualizar</h2><p>Verifique a conexão ou tente novamente mais tarde.</p><button id="try-again" class="btn small">Tentar novamente</button></div>';document.getElementById('try-again').onclick=refresh;}
 finally{busy=false}
}
refresh();setInterval(refresh,30000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
})();
