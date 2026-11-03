-- =====================================================================
-- APP · Actualización 018 · Discipulado: notificaciones al celular
-- Requiere: 015, 016 y 017, y que ya funcionen las notificaciones de Alabanza
-- (008_push_avisos.sql y el secreto PUSH_SECRET). ANTES de ejecutar, publica la
-- Edge Function "avisos-disc" (supabase/functions/avisos-disc/index.ts) con
-- "Verify JWT" desactivado.
-- Pegar completo en: Supabase → SQL Editor → New query → Run.
-- Se puede volver a ejecutar sin romper nada.
--
-- Avisos:
--  - Devocional de hoy (7:00 a.m. de Panamá) y recordatorio de racha (8:00 p.m.).
--  - Mentorías: agendada, propuesta, aceptada, cambiada, cancelada y 2 horas antes.
--  - Comentarios en mis publicaciones y respuestas a mis preguntas.
--  - Para el mentor: algo compartido solo con él y preguntas de su grupo.
--  - Para quien administra: solicitudes de acceso nuevas.
-- Cada persona los enciende o apaga en Mi perfil (profiles.notif, claves d_*).
-- =====================================================================

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Usa el mismo secreto que las notificaciones de Alabanza (vault: push_secret)
create or replace function public.llamar_avisos_disc(cuerpo jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform net.http_post(
    url     := 'https://xkzdtxughatqjoumrfgi.supabase.co/functions/v1/avisos-disc',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_secret')),
    body    := cuerpo
  );
exception when others then
  -- Un aviso que falla nunca debe impedir guardar el dato
  raise warning 'avisos-disc: %', sqlerrm;
end $$;
revoke all on function public.llamar_avisos_disc(jsonb) from public, anon, authenticated;

create or replace function public.disc_avisar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.llamar_avisos_disc(jsonb_build_object('tipo', tg_argv[0], 'id', new.id));
  return new;
end $$;

create or replace function public.disc_avisar_mentoria() returns trigger
language plpgsql security definer set search_path = public as $$
declare antes jsonb;
begin
  if tg_op = 'UPDATE' then
    if new.estado is not distinct from old.estado and new.inicio is not distinct from old.inicio then return new; end if;
    antes := jsonb_build_object('estado', old.estado, 'inicio', old.inicio);
  end if;
  perform public.llamar_avisos_disc(jsonb_build_object('tipo', 'mentoria', 'op', tg_op, 'id', new.id, 'antes', antes, 'quien', auth.uid()));
  return new;
end $$;

drop trigger if exists trg_disc_aviso_ment on public.disc_mentorias;
create trigger trg_disc_aviso_ment after insert or update of estado, inicio on public.disc_mentorias
  for each row execute function public.disc_avisar_mentoria();

drop trigger if exists trg_disc_aviso_com on public.disc_comentarios;
create trigger trg_disc_aviso_com after insert on public.disc_comentarios
  for each row execute function public.disc_avisar('comentario');

drop trigger if exists trg_disc_aviso_post on public.disc_posts;
create trigger trg_disc_aviso_post after insert on public.disc_posts
  for each row execute function public.disc_avisar('post');

-- Solicitudes de acceso a Discipulado: avisa a quien administra
create or replace function public.disc_avisar_solicitud() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'pendiente' and 'discipulado' = any(new.solicita) then
    perform public.llamar_avisos_disc(jsonb_build_object('tipo', 'solicitud', 'id', new.id));
  end if;
  return new;
end $$;
drop trigger if exists trg_disc_aviso_solicitud on public.profiles;
create trigger trg_disc_aviso_solicitud after insert on public.profiles
  for each row execute function public.disc_avisar_solicitud();

-- Programados (horas en UTC; Panamá es UTC-5)
select cron.schedule('disc-devocional', '0 12 * * *',  $$ select public.llamar_avisos_disc('{"tipo":"devocional"}'::jsonb) $$);
select cron.schedule('disc-racha',      '0 1 * * *',   $$ select public.llamar_avisos_disc('{"tipo":"racha"}'::jsonb) $$);
select cron.schedule('disc-mentoria-pronto', '*/30 * * * *', $$ select public.llamar_avisos_disc('{"tipo":"mentoria_pronto"}'::jsonb) $$);
