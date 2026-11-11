-- AMO Express 5.1 — Verificações SOMENTE LEITURA.
-- Execute após instalar a migração 5.1 no projeto de homologação ou produção.
SELECT c.relname AS tabela,c.relrowsecurity AS rls_ativo,
 has_table_privilege('anon',c.oid,'SELECT') AS anon_pode_ler,
 has_table_privilege('authenticated',c.oid,'SELECT') AS autenticado_pode_ler,
 has_table_privilege('authenticated',c.oid,'INSERT') AS autenticado_pode_inserir
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN
 ('delivery_stops','tracking_tokens','financial_settlements','financial_settlement_items','client_error_events','integration_outbox')
ORDER BY c.relname;

SELECT p.proname AS funcao,p.prosecdef AS executa_com_privilegios_de_criador,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_pode_executar,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS autenticado_pode_executar
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN
 ('amo_public_tracking','amo_driver_destination','amo_assign_pending','amo_close_settlement');

SELECT has_table_privilege('service_role','public.integration_outbox','SELECT') AS webhook_pode_ler_fila,
 has_table_privilege('service_role','public.integration_outbox','UPDATE') AS webhook_pode_marcar_envio,
 has_table_privilege('service_role','public.app_admins','SELECT') AS webhook_pode_validar_admin;

SELECT count(*) FILTER (WHERE state='pending') AS eventos_pendentes,
 count(*) FILTER (WHERE state='error') AS eventos_com_erro
FROM public.integration_outbox;
