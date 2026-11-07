-- =====================================================================
-- APP · Actualización 022 · Varias cuentas en el mismo teléfono
-- Pegar completo en: Supabase → SQL Editor → New query → Run.
-- Se puede volver a ejecutar sin romper nada.
--
-- Qué cambia:
--  - Un mismo celular puede recibir notificaciones de varias cuentas
--    (por ejemplo, la mamá y su hija). Antes cada celular quedaba ligado
--    a una sola cuenta.
-- =====================================================================
alter table public.push_suscripciones drop constraint if exists push_suscripciones_endpoint_key;
drop index if exists public.push_suscripciones_perfil_endpoint;
create unique index push_suscripciones_perfil_endpoint on public.push_suscripciones (perfil_id, endpoint);
