-- AMO Express 5.1 | migração incremental / NÃO executar no banco sem backup.
-- Para banco 5.0/5.0.1 existente. Não remove tabelas, registros, nem políticas legadas.
-- Postgres 17 / Supabase. Execute uma vez em homologação e depois em produção.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.deliveries') IS NULL OR
    to_regclass('public.driver_locations') IS NULL OR
    to_regclass('public.logistics_settings') IS NULL OR
    to_regprocedure('private.is_admin()') IS NULL OR
    to_regprocedure('private.is_active_member(uuid)') IS NULL OR
    to_regprocedure('private.is_driver_of(uuid)') IS NULL
 THEN RAISE EXCEPTION 'AMO Express 5.0 não encontrado: instale a migração 5.0 primeiro.'; END IF;
END $$;

-- 1) Falhas operacionais: o cliente só registra falha da própria sessão.
CREATE TABLE IF NOT EXISTS public.client_error_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 source text NOT NULL DEFAULT 'web' CHECK(length(source) BETWEEN 1 AND 40),
 code text NOT NULL DEFAULT 'unknown' CHECK(length(code) BETWEEN 1 AND 40),
 message text NOT NULL CHECK(length(message) BETWEEN 1 AND 300),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_amo_error_time ON public.client_error_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_amo_error_user ON public.client_error_events(user_id,created_at DESC);
ALTER TABLE public.client_error_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "amo error read" ON public.client_error_events;
CREATE POLICY "amo error read" ON public.client_error_events FOR SELECT TO authenticated
 USING ((SELECT auth.uid())=user_id OR private.is_admin());
DROP POLICY IF EXISTS "amo error insert" ON public.client_error_events;
CREATE POLICY "amo error insert" ON public.client_error_events FOR INSERT TO authenticated
 WITH CHECK ((SELECT auth.uid())=user_id);
REVOKE ALL ON public.client_error_events FROM PUBLIC,anon;
GRANT SELECT,INSERT ON public.client_error_events TO authenticated;

-- 2) Paradas múltiplas de um mesmo frete.
CREATE TABLE IF NOT EXISTS public.delivery_stops (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 delivery_id uuid NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
 position integer NOT NULL CHECK(position BETWEEN 1 AND 40),
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 100),
 address text NOT NULL CHECK(length(btrim(address)) BETWEEN 1 AND 400),
 status text NOT NULL DEFAULT 'Pendente' CHECK(status IN ('Pendente','Concluída')),
 completed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(delivery_id,position)
);
CREATE INDEX IF NOT EXISTS idx_amo_stops_delivery ON public.delivery_stops(delivery_id,position);
ALTER TABLE public.delivery_stops ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "amo stops view" ON public.delivery_stops;
CREATE POLICY "amo stops view" ON public.delivery_stops FOR SELECT TO authenticated
 USING (EXISTS (SELECT 1 FROM public.deliveries d WHERE d.id=delivery_id AND
   (private.is_admin() OR private.is_active_member(d.company_id) OR private.is_driver_of(d.id))));
DROP POLICY IF EXISTS "amo stops insert" ON public.delivery_stops;
CREATE POLICY "amo stops insert" ON public.delivery_stops FOR INSERT TO authenticated
 WITH CHECK (EXISTS (SELECT 1 FROM public.deliveries d WHERE d.id=delivery_id
  AND d.status NOT IN ('Concluída','Cancelada') AND (private.is_admin() OR private.is_active_member(d.company_id))));
DROP POLICY IF EXISTS "amo stops update" ON public.delivery_stops;
CREATE POLICY "amo stops update" ON public.delivery_stops FOR UPDATE TO authenticated
 USING (EXISTS (SELECT 1 FROM public.deliveries d WHERE d.id=delivery_id AND
   (private.is_admin() OR private.is_driver_of(d.id))))
 WITH CHECK (EXISTS (SELECT 1 FROM public.deliveries d WHERE d.id=delivery_id AND
   (private.is_admin() OR private.is_driver_of(d.id))));
DROP POLICY IF EXISTS "amo stops delete" ON public.delivery_stops;
CREATE POLICY "amo stops delete" ON public.delivery_stops FOR DELETE TO authenticated
 USING (EXISTS (SELECT 1 FROM public.deliveries d WHERE d.id=delivery_id AND
   d.status NOT IN ('Concluída','Cancelada') AND (private.is_admin() OR private.is_active_member(d.company_id))));
REVOKE ALL ON public.delivery_stops FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.delivery_stops TO authenticated;

CREATE OR REPLACE FUNCTION private.amo_guard_stop() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.delivery_id IS DISTINCT FROM OLD.delivery_id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
   RAISE EXCEPTION 'Não é possível transferir parada para outro frete';
  END IF;
  IF NOT private.is_admin() THEN
   IF NOT private.is_driver_of(OLD.delivery_id) THEN RAISE EXCEPTION 'Somente o entregador designado atualiza o andamento'; END IF;
   IF NEW.position IS DISTINCT FROM OLD.position OR NEW.title IS DISTINCT FROM OLD.title OR NEW.address IS DISTINCT FROM OLD.address THEN
    RAISE EXCEPTION 'Entregador só pode concluir paradas';
   END IF;
  END IF;
  IF NEW.status='Concluída' AND OLD.status<>'Concluída' THEN NEW.completed_at=now(); END IF;
  IF NEW.status='Pendente' THEN
   IF OLD.status='Concluída' AND NOT private.is_admin() THEN RAISE EXCEPTION 'Parada concluída não pode ser reaberta pelo entregador'; END IF;
   NEW.completed_at=NULL;
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS amo_guard_stop_v51 ON public.delivery_stops;
CREATE TRIGGER amo_guard_stop_v51 BEFORE UPDATE ON public.delivery_stops
 FOR EACH ROW EXECUTE FUNCTION private.amo_guard_stop();

-- Endereço exato liberado apenas ao entregador designado. Não expõe o cadastro de clientes.
CREATE OR REPLACE FUNCTION public.amo_driver_destination(p_delivery_id uuid)
 RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_address text;
BEGIN
 IF (SELECT auth.uid()) IS NULL OR NOT (private.is_admin() OR private.is_driver_of(p_delivery_id)) THEN
  RAISE EXCEPTION 'Entrega não atribuída a este usuário';
 END IF;
 SELECT c.address INTO v_address FROM public.deliveries d
 LEFT JOIN public.clients c ON c.id=d.client_id AND c.company_id=d.company_id
 WHERE d.id=p_delivery_id;
 RETURN coalesce(v_address,'');
END $$;
REVOKE ALL ON FUNCTION public.amo_driver_destination(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.amo_driver_destination(uuid) TO authenticated;

-- 3) Rastreamento público por token secreto / temporário (hash, não token em claro).
CREATE TABLE IF NOT EXISTS public.tracking_tokens (
 delivery_id uuid PRIMARY KEY REFERENCES public.deliveries(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[0-9a-f]{64}$'),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tracking_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "amo tracking read" ON public.tracking_tokens;
CREATE POLICY "amo tracking read" ON public.tracking_tokens FOR SELECT TO authenticated
 USING (EXISTS (SELECT 1 FROM public.deliveries d WHERE d.id=delivery_id AND
 (private.is_admin() OR private.is_active_member(d.company_id))));
DROP POLICY IF EXISTS "amo tracking add" ON public.tracking_tokens;
CREATE POLICY "amo tracking add" ON public.tracking_tokens FOR INSERT TO authenticated
 WITH CHECK (created_by=(SELECT auth.uid()) AND expires_at>now() AND expires_at<=now()+interval '7 days' AND
 EXISTS (SELECT 1 FROM public.deliveries d WHERE d.id=delivery_id AND
 (private.is_admin() OR private.is_active_member(d.company_id))));
DROP POLICY IF EXISTS "amo tracking change" ON public.tracking_tokens;
CREATE POLICY "amo tracking change" ON public.tracking_tokens FOR UPDATE TO authenticated
 USING (EXISTS (SELECT 1 FROM public.deliveries d WHERE d.id=delivery_id AND
 (private.is_admin() OR private.is_active_member(d.company_id))))
 WITH CHECK (created_by=(SELECT auth.uid()) AND expires_at>now() AND expires_at<=now()+interval '7 days' AND
 EXISTS (SELECT 1 FROM public.deliveries d WHERE d.id=delivery_id AND
 (private.is_admin() OR private.is_active_member(d.company_id))));
REVOKE ALL ON public.tracking_tokens FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE ON public.tracking_tokens TO authenticated;

-- Esta é a ÚNICA operação de rastreamento acessível sem login.
-- Nunca retorna dados pessoais, endereços, GPS ou documentos.
CREATE OR REPLACE FUNCTION public.amo_public_tracking(p_token text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.deliveries%ROWTYPE;
BEGIN
 IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
 SELECT d.* INTO v FROM public.tracking_tokens t
 JOIN public.deliveries d ON d.id=t.delivery_id
 WHERE t.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex')
   AND t.revoked_at IS NULL AND t.expires_at>now();
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('code',left(v.id::text,8),'status',v.status,
 'neighborhood',v.neighborhood,'scheduled_at',v.scheduled_at,
 'updated_at',v.updated_at,'delivered_at',v.delivered_at);
END $$;
REVOKE ALL ON FUNCTION public.amo_public_tracking(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.amo_public_tracking(text) TO anon,authenticated;

-- 4) Fechamento financeiro por período com trilha indivisível.
CREATE TABLE IF NOT EXISTS public.financial_settlements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 kind text NOT NULL CHECK(kind IN ('company','driver')),
 party_id uuid NOT NULL,
 date_from date NOT NULL,
 date_to date NOT NULL,
 total numeric(14,2) NOT NULL DEFAULT 0 CHECK(total>=0),
 item_count integer NOT NULL DEFAULT 0 CHECK(item_count>=0),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(date_to>=date_from),
 finalized boolean NOT NULL DEFAULT false
);
ALTER TABLE public.financial_settlements ADD COLUMN IF NOT EXISTS finalized boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS public.financial_settlement_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 settlement_id uuid NOT NULL REFERENCES public.financial_settlements(id) ON DELETE RESTRICT,
 delivery_id uuid NOT NULL REFERENCES public.deliveries(id) ON DELETE RESTRICT,
 kind text NOT NULL CHECK(kind IN ('company','driver')),
 amount numeric(14,2) NOT NULL CHECK(amount>=0),
 UNIQUE(kind,delivery_id)
);
CREATE INDEX IF NOT EXISTS idx_amo_settlements_time ON public.financial_settlements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_amo_settlement_items_batch ON public.financial_settlement_items(settlement_id);
ALTER TABLE public.financial_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_settlement_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "amo settlements admin read" ON public.financial_settlements;
CREATE POLICY "amo settlements admin read" ON public.financial_settlements FOR SELECT TO authenticated USING (private.is_admin());
DROP POLICY IF EXISTS "amo settlements admin insert" ON public.financial_settlements;
CREATE POLICY "amo settlements admin insert" ON public.financial_settlements FOR INSERT TO authenticated WITH CHECK (private.is_admin() AND created_by=(SELECT auth.uid()));
DROP POLICY IF EXISTS "amo settlements admin update" ON public.financial_settlements;
CREATE POLICY "amo settlements admin update" ON public.financial_settlements FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK(private.is_admin());
DROP POLICY IF EXISTS "amo items admin read" ON public.financial_settlement_items;
CREATE POLICY "amo items admin read" ON public.financial_settlement_items FOR SELECT TO authenticated USING (private.is_admin());
DROP POLICY IF EXISTS "amo items admin insert" ON public.financial_settlement_items;
CREATE POLICY "amo items admin insert" ON public.financial_settlement_items FOR INSERT TO authenticated WITH CHECK(private.is_admin());
REVOKE ALL ON public.financial_settlements, public.financial_settlement_items FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE ON public.financial_settlements TO authenticated;
GRANT SELECT,INSERT ON public.financial_settlement_items TO authenticated;

-- SECURITY INVOKER: respeita as políticas e grants das tabelas envolvidas.
CREATE OR REPLACE FUNCTION public.amo_close_settlement(p_kind text,p_party uuid,p_from date,p_to date)
 RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_batch uuid; v_count int;
BEGIN
 IF NOT private.is_admin() THEN RAISE EXCEPTION 'Somente administração'; END IF;
 IF p_kind NOT IN ('company','driver') OR p_party IS NULL OR p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to>current_date+1 OR p_to-p_from>366 THEN
  RAISE EXCEPTION 'Parâmetros de fechamento inválidos';
 END IF;
 IF (p_kind='company' AND NOT EXISTS (SELECT 1 FROM public.companies WHERE id=p_party)) OR
    (p_kind='driver' AND NOT EXISTS (SELECT 1 FROM public.drivers WHERE user_id=p_party)) THEN
  RAISE EXCEPTION 'Empresa ou entregador não encontrado';
 END IF;
 INSERT INTO public.financial_settlements(kind,party_id,date_from,date_to,created_by)
 VALUES(p_kind,p_party,p_from,p_to,(SELECT auth.uid())) RETURNING id INTO v_batch;
 WITH candidates AS (
  SELECT d.id,d.fee,d.driver_fee FROM public.deliveries d
  WHERE d.status='Concluída' AND d.created_at >= (p_from::timestamp AT TIME ZONE 'America/Cuiaba')
    AND d.created_at < ((p_to+1)::timestamp AT TIME ZONE 'America/Cuiaba')
    AND ((p_kind='company' AND d.company_id=p_party AND d.paid_at IS NULL)
      OR (p_kind='driver' AND d.assigned_driver_id=p_party AND d.driver_paid_at IS NULL))
  ORDER BY d.created_at FOR UPDATE OF d SKIP LOCKED
 )
 INSERT INTO public.financial_settlement_items(settlement_id,delivery_id,kind,amount)
 SELECT v_batch,id,p_kind,CASE WHEN p_kind='company' THEN fee ELSE driver_fee END FROM candidates;
 GET DIAGNOSTICS v_count=ROW_COUNT;
 IF v_count=0 THEN RAISE EXCEPTION 'Nenhum frete concluído e não pago neste período'; END IF;
 IF p_kind='company' THEN
  UPDATE public.deliveries SET paid_at=now() WHERE id IN (SELECT delivery_id FROM public.financial_settlement_items WHERE settlement_id=v_batch);
 ELSE
  UPDATE public.deliveries SET driver_paid_at=now() WHERE id IN (SELECT delivery_id FROM public.financial_settlement_items WHERE settlement_id=v_batch);
 END IF;
 UPDATE public.financial_settlements SET finalized=true,item_count=v_count,
   total=(SELECT coalesce(sum(amount),0) FROM public.financial_settlement_items WHERE settlement_id=v_batch)
 WHERE id=v_batch;
 RETURN v_batch;
END $$;
REVOKE ALL ON FUNCTION public.amo_close_settlement(text,uuid,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.amo_close_settlement(text,uuid,date,date) TO authenticated;

-- Lotes concluídos são imutáveis pelo aplicativo, mesmo para admin.
-- A única atualização permitida antes da finalização é total/quantidade/finalized.
CREATE OR REPLACE FUNCTION private.amo_settlement_guard() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.finalized THEN RAISE EXCEPTION 'Não crie lotes finalizados diretamente'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.finalized THEN RAISE EXCEPTION 'Fechamento já finalizado; não pode ser alterado'; END IF;
  IF (to_jsonb(NEW) - 'total' - 'item_count' - 'finalized')
    IS DISTINCT FROM (to_jsonb(OLD) - 'total' - 'item_count' - 'finalized') THEN
    RAISE EXCEPTION 'Identificação e período do fechamento são imutáveis';
  END IF;
  IF NOT NEW.finalized THEN RAISE EXCEPTION 'O fechamento deve ser finalizado'; END IF;
  IF NEW.item_count <> (SELECT count(*) FROM public.financial_settlement_items i WHERE i.settlement_id=NEW.id)
     OR NEW.total <> (SELECT coalesce(sum(i.amount),0) FROM public.financial_settlement_items i WHERE i.settlement_id=NEW.id) THEN
    RAISE EXCEPTION 'Totais do fechamento não conferem com seus itens';
  END IF;
  RETURN NEW;
 END IF;
 RAISE EXCEPTION 'Lotes financeiros não podem ser excluídos';
END $$;
DROP TRIGGER IF EXISTS amo_settlement_guard_v51 ON public.financial_settlements;
CREATE TRIGGER amo_settlement_guard_v51 BEFORE INSERT OR UPDATE OR DELETE ON public.financial_settlements
 FOR EACH ROW EXECUTE FUNCTION private.amo_settlement_guard();

CREATE OR REPLACE FUNCTION private.amo_settlement_item_guard() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_batch public.financial_settlements%ROWTYPE; v_delivery public.deliveries%ROWTYPE;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Itens financeiros são imutáveis'; END IF;
 SELECT * INTO v_batch FROM public.financial_settlements WHERE id=NEW.settlement_id;
 SELECT * INTO v_delivery FROM public.deliveries WHERE id=NEW.delivery_id;
 IF NOT FOUND OR v_batch.id IS NULL OR v_batch.finalized OR v_batch.kind<>NEW.kind THEN
  RAISE EXCEPTION 'Lote ou entrega inválidos';
 END IF;
 IF v_delivery.status<>'Concluída' THEN RAISE EXCEPTION 'Apenas entregas concluídas'; END IF;
 IF (v_delivery.created_at AT TIME ZONE 'America/Cuiaba')::date NOT BETWEEN v_batch.date_from AND v_batch.date_to THEN
  RAISE EXCEPTION 'A entrega está fora do período do fechamento';
 END IF;
 IF (NEW.kind='company' AND (v_batch.party_id<>v_delivery.company_id OR v_delivery.paid_at IS NOT NULL OR NEW.amount<>v_delivery.fee))
    OR (NEW.kind='driver' AND (v_batch.party_id IS DISTINCT FROM v_delivery.assigned_driver_id OR v_delivery.driver_paid_at IS NOT NULL OR NEW.amount<>v_delivery.driver_fee)) THEN
  RAISE EXCEPTION 'Item não corresponde ao destinatário, valor ou pagamento';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS amo_settlement_item_guard_v51 ON public.financial_settlement_items;
CREATE TRIGGER amo_settlement_item_guard_v51 BEFORE INSERT OR UPDATE OR DELETE ON public.financial_settlement_items
 FOR EACH ROW EXECUTE FUNCTION private.amo_settlement_item_guard();

-- 5) Distribuidor com travas, preserva atribuições existentes.
CREATE OR REPLACE FUNCTION public.amo_assign_pending(p_limit integer DEFAULT 10)
 RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_delivery record; v_driver uuid; v_total integer:=0;
BEGIN
 IF NOT private.is_admin() THEN RAISE EXCEPTION 'Somente administração'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Limite deve estar entre 1 e 50'; END IF;
 FOR v_delivery IN
  SELECT d.id FROM public.deliveries d
  WHERE d.status='Pendente' AND d.assigned_driver_id IS NULL
    AND (d.scheduled_at IS NULL OR d.scheduled_at <= now()+interval '2 hours')
  ORDER BY d.scheduled_at NULLS LAST,d.created_at
  LIMIT p_limit FOR UPDATE OF d SKIP LOCKED
 LOOP
  SELECT u.user_id INTO v_driver FROM public.drivers u WHERE u.active=true
  ORDER BY (SELECT count(*) FROM public.deliveries a
    WHERE a.assigned_driver_id=u.user_id AND a.status NOT IN ('Concluída','Cancelada')) ASC,
    u.created_at,u.user_id LIMIT 1;
  IF v_driver IS NULL THEN EXIT; END IF;
  UPDATE public.deliveries SET assigned_driver_id=v_driver WHERE id=v_delivery.id AND assigned_driver_id IS NULL;
  v_total=v_total+1;
 END LOOP;
 RETURN v_total;
END $$;
REVOKE ALL ON FUNCTION public.amo_assign_pending(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.amo_assign_pending(integer) TO authenticated;

-- 6) Automação SQL confiável. Não exposta na API / usada opcionalmente pelo cron.
CREATE OR REPLACE FUNCTION private.amo_check_delays_internal()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r record; v_count int:=0;
BEGIN
 FOR r IN SELECT id,company_id FROM public.deliveries
  WHERE scheduled_at < now()-interval '30 minutes' AND status NOT IN ('Concluída','Cancelada')
 LOOP
  INSERT INTO public.automation_runs(delivery_id,kind) VALUES(r.id,'late') ON CONFLICT DO NOTHING;
  IF FOUND THEN
   INSERT INTO public.notifications(user_id,title,body,delivery_id)
   SELECT a.user_id,'Entrega atrasada','Frete #'||left(r.id::text,8)||' está atrasado.',r.id FROM public.app_admins a;
   v_count=v_count+1;
  END IF;
 END LOOP;
 RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION private.amo_check_delays_internal() FROM PUBLIC,anon,authenticated;

-- A Edge Function de webhooks utiliza service_role, que bypassa RLS mas
-- ainda precisa dos GRANTs PostgreSQL explícitos. Não conceder a anon.
GRANT SELECT ON public.app_admins TO service_role;
GRANT SELECT,UPDATE ON public.integration_outbox TO service_role;

-- Publication para paradas em tempo real, uma única vez.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime')
  AND NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='delivery_stops') THEN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_stops;
 END IF;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
