# AMO Express — alterações

## 5.1.0 (2026-11-11)
- Monitoramento de erros e fila offline com confirmação de descarte.
- Rastreamento público com token 256 bits, hash SHA-256 e expiração em 72h.
- QR Code para compartilhamento, WhatsApp por link e recibos imprimíveis.
- Paradas múltiplas (até 40) com RLS e conclusão pelo entregador.
- Rota via Google Maps com até 10 endereços e RPC segura para destino do entregador.
- Distribuição em lote com trava no Postgres e menor carga de fretes.
- Fechamentos financeiros, repasses e lotes imutáveis após finalização.
- KPIs de tempo, pontualidade, avaliações e conclusão.
- Cron opcional para atrasos, permissão de `service_role` mínima para dispatcher de webhooks.
- Mantidos layout, autenticação, Supabase Realtime, GPS e funcionalidades do 5.0.1.

## 5.0.1 (versão-base preservada)
- Corrigida inicialização quando a sessão autenticada expira; PWA e cache versionados.

**Nenhuma migração foi aplicada automaticamente no Supabase de produção.**
