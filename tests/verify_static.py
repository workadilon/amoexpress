"""Verificações estáticas seguras para o pacote AMO Express 5.1.
Não executa DDL nem se conecta ao Supabase de produção.
"""
from pathlib import Path
import subprocess, re, zipfile
root=Path(__file__).resolve().parents[1]
for js in ['app.js','tracking.js','sw.js']:
 subprocess.run(['node','--check',str(root/js)],check=True,stdout=subprocess.PIPE)
s=(root/'supabase/migrations/20261111140000_amo_express_v5_1.sql').read_text()
assert s.startswith('-- AMO Express 5.1')
assert s.count('BEGIN;')==1 and s.count('COMMIT;')==1
for bad in [r'\bDROP\s+TABLE\b',r'\bTRUNCATE\b',r'\bDROP\s+SCHEMA\b']:
 assert not re.search(bad,s,re.I),bad
for table in ['client_error_events','delivery_stops','tracking_tokens','financial_settlements','financial_settlement_items']:
 assert f'ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY;' in s,table
 assert f'GRANT ' in s
for function in ['amo_assign_pending','amo_close_settlement','amo_public_tracking','amo_check_delays_internal']:
 assert function in s
assert 'REVOKE ALL ON FUNCTION public.amo_public_tracking(text) FROM PUBLIC' in s
assert 'GRANT EXECUTE ON FUNCTION public.amo_public_tracking(text) TO anon,authenticated' in s
assert 'GRANT SELECT,UPDATE ON public.integration_outbox TO service_role' in s
assert 'SECURITY INVOKER' in s and 'SECURITY DEFINER' in s
assert (root/'tracking.html').is_file()
assert (root/'LEIA-ME.md').is_file()
assert 'v5-1-0' in (root/'sw.js').read_text()
assert '5.1.0' in (root/'index.html').read_text()
print('PASS: JS syntax, RLS declarations, secure public RPC, service grants, migration non-destructive, app shell')
