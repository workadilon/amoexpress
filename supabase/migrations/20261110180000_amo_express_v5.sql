-- AMO Express 5.0: migração ADITIVA, para executar após backup.
-- Requer as tabelas e funções da versão 2.4 (não execute sobre uma base vazia).
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.deliveries') IS NULL OR to_regclass('public.drivers') IS NULL OR to_regprocedure('private.is_admin()') IS NULL
 THEN RAISE EXCEPTION 'Instale primeiro o esquema base AMO Express 2.4'; END IF;
END $$;

ALTER TABLE public.deliveries
 ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
 ADD COLUMN IF NOT EXISTS distance_km numeric(10,2) NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS surcharge numeric(10,2) NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS recipient_signature_path text,
 ADD COLUMN IF NOT EXISTS proof_lat numeric(10,7),
 ADD COLUMN IF NOT EXISTS proof_lng numeric(10,7),
 ADD COLUMN IF NOT EXISTS route_order integer;

CREATE TABLE IF NOT EXISTS public.logistics_settings (
 id integer PRIMARY KEY DEFAULT 1 CHECK (id=1),
 per_km numeric(10,2) NOT NULL DEFAULT 0 CHECK (per_km>=0),
 heavy_item_fee numeric(10,2) NOT NULL DEFAULT 0 CHECK (heavy_item_fee>=0),
 heavy_threshold_kg numeric(10,2) NOT NULL DEFAULT 10 CHECK (heavy_threshold_kg>=0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.logistics_settings(id) VALUES (1) ON CONFLICT (id) DO NOTHING;
CREATE TABLE IF NOT EXISTS public.driver_locations (
 user_id uuid PRIMARY KEY REFERENCES public.drivers(user_id) ON DELETE CASCADE,
 latitude numeric(10,7) NOT NULL CHECK(latitude BETWEEN -90 AND 90),
 longitude numeric(10,7) NOT NULL CHECK(longitude BETWEEN -180 AND 180),
 accuracy_m numeric(12,2),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.delivery_ratings (
 delivery_id uuid PRIMARY KEY REFERENCES public.deliveries(id) ON DELETE CASCADE,
 company_id uuid NOT NULL REFERENCES public.companies(id),
 driver_id uuid NOT NULL REFERENCES public.drivers(user_id),
 author_id uuid NOT NULL REFERENCES auth.users(id),
 stars integer NOT NULL CHECK(stars BETWEEN 1 AND 5),
 comment text NOT NULL DEFAULT '' CHECK (length(comment)<=1000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.amo_audit_log (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 table_name text NOT NULL,
 record_id uuid,
 company_id uuid,
 actor_id uuid,
 action text NOT NULL,
 changes jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_amo_audit_company ON public.amo_audit_log(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_amo_audit_record ON public.amo_audit_log(record_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deliveries_schedule ON public.deliveries(scheduled_at) WHERE scheduled_at IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.automation_runs (
 delivery_id uuid NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
 kind text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(delivery_id,kind)
);
CREATE TABLE IF NOT EXISTS public.integration_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 delivery_id uuid REFERENCES public.deliveries(id) ON DELETE CASCADE,
 kind text NOT NULL,
 payload jsonb NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','sent','error')),
 attempts integer NOT NULL DEFAULT 0,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 dispatched_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_integration_pending ON public.integration_outbox(created_at) WHERE state='pending';

ALTER TABLE public.logistics_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.amo_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "settings select" ON public.logistics_settings;
CREATE POLICY "settings select" ON public.logistics_settings FOR SELECT TO authenticated USING (private.is_admin() OR EXISTS (SELECT 1 FROM public.company_members m WHERE m.user_id=(SELECT auth.uid())));
DROP POLICY IF EXISTS "settings admin" ON public.logistics_settings;
CREATE POLICY "settings admin" ON public.logistics_settings FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());
DROP POLICY IF EXISTS "locations view" ON public.driver_locations;
CREATE POLICY "locations view" ON public.driver_locations FOR SELECT TO authenticated USING (
 private.is_admin() OR user_id=(SELECT auth.uid()) OR EXISTS (
 SELECT 1 FROM public.deliveries d WHERE d.assigned_driver_id=driver_locations.user_id AND d.status NOT IN ('Concluída','Cancelada') AND private.is_active_member(d.company_id)));
DROP POLICY IF EXISTS "locations insert" ON public.driver_locations;
CREATE POLICY "locations insert" ON public.driver_locations FOR INSERT TO authenticated WITH CHECK (user_id=(SELECT auth.uid()) AND EXISTS(SELECT 1 FROM public.drivers d WHERE d.user_id=(SELECT auth.uid()) AND d.active));
DROP POLICY IF EXISTS "locations update" ON public.driver_locations;
CREATE POLICY "locations update" ON public.driver_locations FOR UPDATE TO authenticated USING (user_id=(SELECT auth.uid())) WITH CHECK (user_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS "rating read" ON public.delivery_ratings;
CREATE POLICY "rating read" ON public.delivery_ratings FOR SELECT TO authenticated USING (private.is_admin() OR private.is_active_member(company_id) OR driver_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS "rating add" ON public.delivery_ratings;
CREATE POLICY "rating add" ON public.delivery_ratings FOR INSERT TO authenticated WITH CHECK (
 author_id=(SELECT auth.uid()) AND private.is_active_member(company_id) AND EXISTS(
 SELECT 1 FROM public.deliveries d WHERE d.id=delivery_id AND d.company_id=delivery_ratings.company_id AND d.assigned_driver_id=delivery_ratings.driver_id AND d.status='Concluída'));
DROP POLICY IF EXISTS "audit view" ON public.amo_audit_log;
CREATE POLICY "audit view" ON public.amo_audit_log FOR SELECT TO authenticated USING (private.is_admin() OR (company_id IS NOT NULL AND private.is_active_member(company_id)));
DROP POLICY IF EXISTS "automations admin read" ON public.automation_runs;
CREATE POLICY "automations admin read" ON public.automation_runs FOR SELECT TO authenticated USING (private.is_admin());
DROP POLICY IF EXISTS "outbox admin read" ON public.integration_outbox;
CREATE POLICY "outbox admin read" ON public.integration_outbox FOR SELECT TO authenticated USING (private.is_admin());

GRANT SELECT ON public.logistics_settings,public.driver_locations,public.delivery_ratings,public.amo_audit_log,public.automation_runs,public.integration_outbox TO authenticated;
GRANT UPDATE ON public.logistics_settings,public.driver_locations TO authenticated;
GRANT INSERT ON public.driver_locations,public.delivery_ratings TO authenticated;

-- Auditoria sem guardar dados pessoais completos: somente campos operacionais.
CREATE OR REPLACE FUNCTION private.amo_track_changes() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_changes jsonb := '{}'::jsonb; v_company uuid; v_id uuid; v_k text; v_old jsonb; v_new jsonb;
BEGIN
 v_id := CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
 v_company := CASE WHEN TG_OP='DELETE' THEN OLD.company_id ELSE NEW.company_id END;
 v_old := CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
 v_new := CASE WHEN TG_OP='DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
 FOREACH v_k IN ARRAY ARRAY['status','assigned_driver_id','driver_fee','fee','paid_at','driver_paid_at','scheduled_at','distance_km','surcharge','recipient_name','delivered_at','route_order'] LOOP
  IF (v_old -> v_k) IS DISTINCT FROM (v_new -> v_k) THEN v_changes := v_changes || jsonb_build_object(v_k,jsonb_build_object('from',v_old -> v_k,'to',v_new -> v_k)); END IF;
 END LOOP;
 IF TG_OP<>'UPDATE' OR v_changes<>'{}'::jsonb THEN
  INSERT INTO public.amo_audit_log(table_name,record_id,company_id,actor_id,action,changes)
  VALUES ('deliveries',v_id,v_company,(SELECT auth.uid()),TG_OP,v_changes);
 END IF;
 RETURN COALESCE(NEW,OLD);
END $$;
DROP TRIGGER IF EXISTS amo_track_deliveries_v5 ON public.deliveries;
CREATE TRIGGER amo_track_deliveries_v5 AFTER INSERT OR UPDATE OR DELETE ON public.deliveries FOR EACH ROW EXECUTE FUNCTION private.amo_track_changes();

-- Atualiza guard legado: novos campos operacionais protegidos, sem mudar lógica existente.
CREATE OR REPLACE FUNCTION private.delivery_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NOT private.is_admin() AND NOT private.is_driver_of(OLD.id) AND (to_jsonb(NEW) - 'updated_at' - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at' - 'status') THEN
   RAISE EXCEPTION 'Empresa pode alterar somente o status de cancelamento';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
   IF OLD.status IN ('Concluída','Cancelada') THEN RAISE EXCEPTION 'Entrega finalizada não pode mudar de status'; END IF;
   IF NEW.status='Cancelada' AND OLD.status<>'Pendente' THEN RAISE EXCEPTION 'Somente pendentes podem ser canceladas'; END IF;
  END IF;
  IF NEW.assigned_driver_id IS DISTINCT FROM OLD.assigned_driver_id OR NEW.driver_fee IS DISTINCT FROM OLD.driver_fee OR
     NEW.paid_at IS DISTINCT FROM OLD.paid_at OR NEW.driver_paid_at IS DISTINCT FROM OLD.driver_paid_at OR
     NEW.fee IS DISTINCT FROM OLD.fee OR NEW.surcharge IS DISTINCT FROM OLD.surcharge OR
     NEW.route_order IS DISTINCT FROM OLD.route_order THEN
   IF NOT private.is_admin() THEN RAISE EXCEPTION 'Operação restrita à administração'; END IF;
  END IF;
  IF NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at OR NEW.distance_km IS DISTINCT FROM OLD.distance_km THEN
   IF NOT private.is_admin() THEN RAISE EXCEPTION 'Reagendamento e distância restritos à administração'; END IF;
  END IF;
  IF NEW.recipient_name IS DISTINCT FROM OLD.recipient_name OR NEW.proof_path IS DISTINCT FROM OLD.proof_path OR
     NEW.delivered_at IS DISTINCT FROM OLD.delivered_at OR NEW.recipient_signature_path IS DISTINCT FROM OLD.recipient_signature_path OR
     NEW.proof_lat IS DISTINCT FROM OLD.proof_lat OR NEW.proof_lng IS DISTINCT FROM OLD.proof_lng THEN
    IF NOT private.is_admin() AND NOT private.is_driver_of(OLD.id) THEN RAISE EXCEPTION 'Comprovante não autorizado'; END IF;
  END IF;
 END IF;
 NEW.updated_at=now(); RETURN NEW;
END $$;

-- Tarifa calculada no servidor, não no valor enviado pelo navegador.
CREATE OR REPLACE FUNCTION private.validate_delivery() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c record; p record; r record; s record; v_weight numeric := 0;
BEGIN
 IF NOT private.is_active_member(NEW.company_id) THEN RAISE EXCEPTION 'Empresa não autorizada para criar frete'; END IF;
 SELECT id,name,neighborhood INTO c FROM public.clients WHERE id=NEW.client_id AND company_id=NEW.company_id;
 SELECT id,name,weight INTO p FROM public.products WHERE id=NEW.product_id AND company_id=NEW.company_id;
 SELECT neighborhood,fee INTO r FROM public.neighborhood_rates WHERE neighborhood=NEW.neighborhood;
 SELECT * INTO s FROM public.logistics_settings WHERE id=1;
 IF c.id IS NULL OR p.id IS NULL OR r.neighborhood IS NULL THEN RAISE EXCEPTION 'Cliente, produto ou bairro inválido'; END IF;
 IF NEW.distance_km<0 OR NEW.distance_km>2000 THEN RAISE EXCEPTION 'Distância inválida'; END IF;
 IF NEW.scheduled_at IS NOT NULL AND NEW.scheduled_at < now() - interval '5 minutes' THEN RAISE EXCEPTION 'Agendamento anterior ao horário atual'; END IF;
 IF p.weight ~ '^[[:space:]]*[0-9]+([.,][0-9]+)?([[:space:]]*(kg|KG))?[[:space:]]*$' THEN
   v_weight := replace((regexp_match(p.weight,'[0-9]+([.,][0-9]+)?'))[1],',','.')::numeric;
 END IF;
 NEW.client_name=c.name; NEW.product_name=p.name;
 NEW.fee=r.fee + NEW.distance_km*coalesce(s.per_km,0) + CASE WHEN v_weight>coalesce(s.heavy_threshold_kg,10) THEN coalesce(s.heavy_item_fee,0) ELSE 0 END;
 NEW.surcharge=0; NEW.status='Pendente'; RETURN NEW;
END $$;

-- Transição do comprovante mantém RPC legado, com metadados extras protegidos.
CREATE OR REPLACE FUNCTION public.amo_save_proof_metadata(p_delivery_id uuid,p_signature_path text DEFAULT NULL,p_lat numeric DEFAULT NULL,p_lng numeric DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Autenticação exigida'; END IF;
 IF p_signature_path IS NOT NULL AND p_signature_path NOT LIKE p_delivery_id::text||'/'||(SELECT auth.uid())::text||'/%' THEN RAISE EXCEPTION 'Assinatura inválida'; END IF;
 IF NOT private.is_admin() AND NOT private.is_driver_of(p_delivery_id) THEN RAISE EXCEPTION 'Não autorizado'; END IF;
 IF p_lat IS NOT NULL AND (p_lat < -90 OR p_lat > 90) THEN RAISE EXCEPTION 'Latitude inválida'; END IF;
 IF p_lng IS NOT NULL AND (p_lng < -180 OR p_lng > 180) THEN RAISE EXCEPTION 'Longitude inválida'; END IF;
 UPDATE public.deliveries SET recipient_signature_path=p_signature_path, proof_lat=p_lat,proof_lng=p_lng WHERE id=p_delivery_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Entrega indisponível'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.amo_save_proof_metadata(uuid,text,numeric,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.amo_save_proof_metadata(uuid,text,numeric,numeric) TO authenticated;

-- Inserir eventos na fila sem fornecer dados externos secretos ao navegador.
CREATE OR REPLACE FUNCTION private.amo_outbox_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
  INSERT INTO public.integration_outbox(delivery_id,kind,payload) VALUES(NEW.id,'delivery.status',jsonb_build_object('delivery_id',NEW.id,'company_id',NEW.company_id,'status',NEW.status,'occurred_at',now()));
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS amo_outbox_deliveries_v5 ON public.deliveries;
CREATE TRIGGER amo_outbox_deliveries_v5 AFTER INSERT OR UPDATE OF status ON public.deliveries FOR EACH ROW EXECUTE FUNCTION private.amo_outbox_event();

-- Verifica atraso por solicitação explícita do administrador (ou automação externa, após configuração).
CREATE OR REPLACE FUNCTION public.amo_check_delays() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_count integer:=0; r record;
BEGIN
 IF NOT private.is_admin() THEN RAISE EXCEPTION 'Somente administração'; END IF;
 FOR r IN SELECT id,company_id FROM public.deliveries WHERE scheduled_at<now()-interval '30 minutes' AND status NOT IN ('Concluída','Cancelada') LOOP
  INSERT INTO public.automation_runs(delivery_id,kind) VALUES(r.id,'late') ON CONFLICT DO NOTHING;
  IF FOUND THEN
   INSERT INTO public.notifications(user_id,title,body,delivery_id)
    SELECT a.user_id,'Entrega atrasada','O frete #'||left(r.id::text,8)||' está atrasado.',r.id FROM public.app_admins a;
   v_count:=v_count+1;
  END IF;
 END LOOP;
 RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.amo_check_delays() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.amo_check_delays() TO authenticated;

-- Storage: provedor já existente. Criar bucket privado, se ausente.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('delivery-proofs','delivery-proofs',false,5242880,ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;
-- A política antiga do bucket continua em vigor; verifique as regras de upload antes de publicar.

-- Publicação Realtime: adicionar tabela somente se ainda não publicada.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='driver_locations') THEN
   ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_locations;
  END IF;
 END IF;
END $$;
COMMIT;
