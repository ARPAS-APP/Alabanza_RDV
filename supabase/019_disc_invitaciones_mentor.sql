-- =====================================================================
-- APP · Actualización 019 · Discipulado: cada mentor invita y aprueba a sus discípulos
-- Requiere: 015 a 018.
-- Pegar completo en: Supabase → SQL Editor → New query → Run.
-- Se puede volver a ejecutar sin romper nada.
--
-- Qué cambia:
--  - Cada mentor tiene su propio link de registro (…#/registro?m=discipulado&mentor=<su id>).
--  - Quien se registra con ese link le aparece SOLO a ese mentor, que lo aprueba
--    como discípulo suyo (nunca como mentor, nunca con acceso a Alabanza).
--  - Si el mentor dice "No es mi discípulo", la solicitud pasa a quien administra.
--  - Quien administra recibe un aviso de cada aprobación y ve en su inicio el
--    total de personas y las activas.
-- =====================================================================

-- 1) Quién invitó y quién aprobó
alter table public.profiles add column if not exists invitado_por uuid references public.profiles(id) on delete set null;
alter table public.profiles add column if not exists aprobado_por uuid references public.profiles(id) on delete set null;
alter table public.profiles add column if not exists aprobado_at  timestamptz;

-- 2) Al registrarse, guarda el mentor del link (solo si de verdad es mentor)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare m text := new.raw_user_meta_data->>'mentor'; mid uuid;
begin
  if m ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select a.perfil_id into mid from public.modulos_acceso a
    where a.perfil_id = m::uuid and a.modulo = 'discipulado' and a.rol in ('mentor','pastor');
  end if;
  insert into public.profiles (id, email, nombre, instrumento, solicita, invitado_por)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'nombre', ''), split_part(new.email, '@', 1)),
    nullif(new.raw_user_meta_data->>'instrumento', ''),
    coalesce(array(
      select x from jsonb_array_elements_text(
        case when jsonb_typeof(new.raw_user_meta_data->'solicita') = 'array' then new.raw_user_meta_data->'solicita' else '[]'::jsonb end) x
      where x in ('alabanza','discipulado')), '{}'),
    mid
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- 3) Nadie puede cambiarse a sí mismo quién lo invitó o aprobó
create or replace function public.proteger_invitacion() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.aprobando', true), '') = 'on' then return new; end if;
  if auth.uid() is not null and not public.es_admin() then
    new.invitado_por := old.invitado_por;
    new.aprobado_por := old.aprobado_por;
    new.aprobado_at  := old.aprobado_at;
  end if;
  return new;
end $$;
drop trigger if exists trg_proteger_invitacion on public.profiles;
create trigger trg_proteger_invitacion before update on public.profiles
  for each row execute function public.proteger_invitacion();

-- 4) El mentor ve a quienes se registraron con su link
drop policy if exists "perfiles_ver_invitados" on public.profiles;
create policy "perfiles_ver_invitados" on public.profiles for select to authenticated
  using (invitado_por = auth.uid());

-- 5) El mentor aprueba (o devuelve) a sus invitados
create or replace function public.disc_aprobar_invitado(p_perfil uuid, p_aprobar boolean)
returns void language plpgsql security definer set search_path = public as $$
declare yo uuid := auth.uid();
begin
  if coalesce(public.disc_rol(), '') not in ('mentor','pastor') then
    raise exception 'Solo un mentor puede aprobar discípulos';
  end if;
  if not exists (select 1 from profiles where id = p_perfil and invitado_por = yo and estado = 'pendiente') then
    raise exception 'Esta solicitud ya no está pendiente o no es para ti';
  end if;

  perform set_config('app.aprobando', 'on', true);
  if p_aprobar then
    insert into modulos_acceso (perfil_id, modulo, rol) values (p_perfil, 'discipulado', 'discipulo')
      on conflict (perfil_id, modulo) do nothing;
    insert into disc_discipulos (discipulo_id, mentor_id) values (p_perfil, yo)
      on conflict (discipulo_id) do nothing;
    update profiles set estado = 'aprobado', aprobado_por = yo, aprobado_at = now() where id = p_perfil;
  else
    -- "No es mi discípulo": la solicitud pasa a quien administra
    update profiles set invitado_por = null where id = p_perfil;
  end if;
  perform set_config('app.aprobando', 'off', true);

  -- Avisos (si fallan, la aprobación igual queda hecha)
  begin
    perform public.llamar_avisos_disc(
      case when p_aprobar then jsonb_build_object('tipo', 'aprobado', 'id', p_perfil, 'mentor', yo)
           else jsonb_build_object('tipo', 'solicitud', 'id', p_perfil) end);
  exception when others then null;
  end;
end $$;
revoke all on function public.disc_aprobar_invitado(uuid, boolean) from public, anon;
grant execute on function public.disc_aprobar_invitado(uuid, boolean) to authenticated;

-- 6) Números para quien administra
--    Activo = respondió un devocional, publicó, comentó o marcó un reto en el período.
create or replace function public.disc_estadisticas() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.es_pastor() then raise exception 'Solo para quien administra Discipulado'; end if;
  with miembros as (
    select a.perfil_id, a.rol, a.created_at
    from modulos_acceso a join profiles p on p.id = a.perfil_id and p.estado = 'aprobado'
    where a.modulo = 'discipulado'
  ), act as (
    select autor_id as pid, created_at as t from disc_respuestas
    union all select autor_id, created_at from disc_posts
    union all select autor_id, created_at from disc_comentarios
    union all select autor_id, created_at from disc_dev_comentarios
    union all select perfil_id, (fecha::timestamp at time zone 'America/Panama') from disc_retos_marcas
  )
  select jsonb_build_object(
    'total',      (select count(*) from miembros),
    'mentores',   (select count(*) from miembros where rol in ('mentor','pastor')),
    'discipulos', (select count(*) from miembros where rol = 'discipulo'),
    'activos7',   (select count(distinct pid) from act where t > now() - interval '7 days'  and pid in (select perfil_id from miembros)),
    'activos30',  (select count(distinct pid) from act where t > now() - interval '30 days' and pid in (select perfil_id from miembros)),
    'nuevos30',   (select count(*) from miembros where created_at > now() - interval '30 days'),
    'esperan_mentor', (select count(*) from profiles where estado = 'pendiente' and invitado_por is not null),
    'recientes', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.at desc) from (
        select id as perfil, aprobado_por as mentor, aprobado_at as at from profiles
        where aprobado_por is not null and aprobado_at > now() - interval '30 days'
        order by aprobado_at desc limit 8) x), '[]'::jsonb)
  ) into r;
  return r;
end $$;
revoke all on function public.disc_estadisticas() from public, anon;
grant execute on function public.disc_estadisticas() to authenticated;
