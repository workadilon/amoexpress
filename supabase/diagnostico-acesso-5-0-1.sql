-- AMO Express 5.0.1 — diagnóstico SOMENTE LEITURA.
-- Executar no Supabase SQL Editor, em caso de novos erros 42501.
-- A coluna anon_select DEVE ficar false (dados privados).
-- As colunas authenticated_select e rls_enabled DEVEM ficar true.
SELECT
 c.relname AS tabela,
 c.relrowsecurity AS rls_enabled,
 has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated_select,
 has_table_privilege('anon',c.oid,'SELECT') AS anon_select,
 CASE WHEN c.relrowsecurity AND has_table_privilege('authenticated',c.oid,'SELECT') AND NOT has_table_privilege('anon',c.oid,'SELECT')
      THEN 'OK: requer JWT autenticado e política RLS'
      ELSE 'ATENÇÃO: revisar GRANT/RLS' END AS diagnostico
FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public'
 AND c.relname IN ('driver_locations','delivery_ratings','amo_audit_log','logistics_settings')
ORDER BY c.relname;

-- Se o navegador continuar gerando erros, verifique se o usuário está logado
-- e possui JWT válido. Nunca aplique GRANT SELECT ... TO anon nessas tabelas.
