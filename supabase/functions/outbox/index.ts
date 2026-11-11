// AMO Express 5.1.1 — webhook outbox (compatível com chamadas pelo navegador).
// Secrets no servidor: AMO_WEBHOOK_URL (HTTPS), AMO_WEBHOOK_TOKEN (opcional),
// AMO_DISPATCH_SECRET (opcional para automações). Nunca expor service role no frontend.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
const cors = {
 'Access-Control-Allow-Origin':'*',
 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-amo-dispatch-secret',
 'Access-Control-Allow-Methods':'POST, OPTIONS',
};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json'}});
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS') return new Response('ok',{headers:cors});
 if(req.method!=='POST')return json({error:'Método não permitido'},405);
 try{
  const base=Deno.env.get('SUPABASE_URL');
  const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const endpoint=Deno.env.get('AMO_WEBHOOK_URL');
  const token=Deno.env.get('AMO_WEBHOOK_TOKEN');
  const secret=Deno.env.get('AMO_DISPATCH_SECRET');
  if(!base||!key)return json({error:'Configuração Supabase indisponível'},503);
  const server=createClient(base,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const provided=req.headers.get('X-AMO-Dispatch-Secret');
  const cron=!!(secret&&provided&&provided===secret);
  if(!cron){
   const bearer=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'').trim();
   if(!bearer)return json({error:'É necessário entrar como administrador'},401);
   const {data,error}=await server.auth.getUser(bearer);
   if(error||!data.user)return json({error:'Sessão inválida ou expirada'},401);
   const {data:admin,error:adminError}=await server.from('app_admins').select('user_id').eq('user_id',data.user.id).maybeSingle();
   if(adminError)return json({error:'Não foi possível verificar o administrador',detail:adminError.message},500);
   if(!admin)return json({error:'Acesso permitido somente à administração'},403);
  }
  if(!endpoint||!/^https:\/\/[^\s]+$/i.test(endpoint))return json({error:'Configure AMO_WEBHOOK_URL com um destino HTTPS em Edge Functions > Secrets'},503);
  const {data:events,error}=await server.from('integration_outbox').select('*').eq('state','pending').lt('attempts',5).order('created_at',{ascending:true}).limit(20);
  if(error)return json({error:'Não foi possível ler a fila',detail:error.message},500);
  let sent=0,failed=0;
  for(const event of events||[]){
   const attempts=Number(event.attempts||0)+1;
   try{
    const headers:Record<string,string>={'Content-Type':'application/json','X-AMO-Event-ID':event.id};
    if(token)headers.Authorization=`Bearer ${token}`;
    const response=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({id:event.id,type:event.kind,payload:event.payload}),signal:AbortSignal.timeout(9000)});
    if(!response.ok)throw new Error(`Webhook HTTP ${response.status}`);
    const {error:updateError}=await server.from('integration_outbox').update({state:'sent',attempts,dispatched_at:new Date().toISOString(),last_error:null}).eq('id',event.id).eq('state','pending');
    if(updateError)throw new Error(`Falha ao registrar envio: ${updateError.message}`);
    sent++;
   }catch(e){
    await server.from('integration_outbox').update({attempts,last_error:String(e).slice(0,300),state:attempts>=5?'error':'pending'}).eq('id',event.id).eq('state','pending');
    failed++;
   }
  }
  return json({sent,failed,processed:sent+failed});
 }catch(e){console.error('outbox',e);return json({error:'Erro interno ao processar fila'},500)}
});
