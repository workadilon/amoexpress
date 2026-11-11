-- OPCIONAL: execute somente após validar a migração 5.1, pg_cron e backup.
-- Este script cria um job no projeto Supabase; a função chamada é privada.
-- Verifique pg_cron em Database -> Extensions ou Supabase Cron.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.schedule('amo_express_alertas_10min','*/10 * * * *',
 $$SELECT private.amo_check_delays_internal();$$);
-- Para desativar: SELECT cron.unschedule('amo_express_alertas_10min');
