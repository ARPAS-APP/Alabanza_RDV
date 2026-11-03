-- =====================================================================
-- APP · Actualización 015 · Módulos (Alabanza y Discipulado) + Discipulado
-- Pegar completo en: Supabase → SQL Editor → New query → Run.
-- Se puede volver a ejecutar sin romper nada.
--
-- QUÉ CAMBIA PARA EL EQUIPO DE ALABANZA: nada. Todos los que ya están
-- aprobados quedan con acceso a Alabanza automáticamente, con su rol de siempre.
--
-- 1. Accesos por módulo: cada persona puede tener Alabanza, Discipulado o ambos.
--    - Registrarse no da acceso a nada: la persona queda pendiente.
--    - Un admin (o un pastor, solo para Discipulado) la aprueba eligiendo
--      a qué módulo entra, con qué rol y, en Discipulado, quién es su mentor.
--    - es_aprobado() ahora significa "aprobado Y con acceso a Alabanza", así
--      alguien que solo está en Discipulado no ve canciones, agenda ni chat.
-- 2. Discipulado: devocionales, respuestas con 4 niveles de privacidad,
--    muro, mentorías, notas privadas del mentor, retos y ruta de crecimiento.
--    La privacidad la aplica la base de datos (RLS), no solo la pantalla.
--    Las notas del mentor solo las lee el mentor que las escribió.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ACCESOS POR MÓDULO
-- ---------------------------------------------------------------------
create table if not exists public.modulos_acceso (
  perfil_id  uuid not null references public.profiles(id) on delete cascade,
  modulo     text not null check (modulo in ('alabanza','discipulado')),
  rol        text,   -- solo Discipulado: discipulo | mentor | pastor
  created_at timestamptz not null default now(),
  primary key (perfil_id, modulo),
  constraint modulos_rol_valido check (modulo <> 'discipulado' or rol in ('discipulo','mentor','pastor'))
);
alter table public.modulos_acceso enable row level security;

-- Lo que la persona pidió al registrarse (solo informativo para quien aprueba)
alter table public.profiles add column if not exists solicita text[] not null default '{}';

-- La primera vez: todos los aprobados actuales quedan en Alabanza (nadie pierde acceso)
do $$
begin
  if not exists (select 1 from public.modulos_acceso where modulo = 'alabanza') then
    insert into public.modulos_acceso (perfil_id, modulo)
    select id, 'alabanza' from public.profiles where estado = 'aprobado'
    on conflict do nothing;
  end if;
end $$;

-- Helpers de permisos
create or replace function public.es_aprobado_general() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and estado = 'aprobado');
$$;

create or replace function public.tiene_modulo(m text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p join public.modulos_acceso a on a.perfil_id = p.id and a.modulo = m
    where p.id = auth.uid() and p.estado = 'aprobado');
$$;

-- Todas las reglas de Alabanza usan es_aprobado(): ahora exige acceso a Alabanza.
create or replace function public.es_aprobado() returns boolean
language sql stable security definer set search_path = public as $$
  select public.tiene_modulo('alabanza');
$$;

-- Los perfiles (nombres) los ve cualquier persona aprobada, de cualquier módulo
drop policy if exists "perfiles_ver" on public.profiles;
create policy "perfiles_ver" on public.profiles for select to authenticated
  using (id = auth.uid() or public.es_aprobado_general());

drop policy if exists "modulos_ver" on public.modulos_acceso;
create policy "modulos_ver" on public.modulos_acceso for select to authenticated
  using (perfil_id = auth.uid() or public.es_aprobado_general());
-- (se escribe solo con la función guardar_accesos, más abajo)

-- Guardar lo que pidió al registrarse
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, nombre, instrumento, solicita)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'nombre', ''), split_part(new.email, '@', 1)),
    nullif(new.raw_user_meta_data->>'instrumento', ''),
    coalesce(array(
      select x from jsonb_array_elements_text(
        case when jsonb_typeof(new.raw_user_meta_data->'solicita') = 'array' then new.raw_user_meta_data->'solicita' else '[]'::jsonb end) x
      where x in ('alabanza','discipulado')), '{}')
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- Un miembro no puede cambiarse su rol/estado/email. Excepción: la función
-- guardar_accesos (un pastor aprobando a alguien en Discipulado).
create or replace function public.proteger_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.aprobando', true), '') = 'on' then return new; end if;
  if auth.uid() is not null and not public.es_admin() then
    new.rol    := old.rol;
    new.estado := old.estado;
    new.email  := old.email;
  end if;
  return new;
end $$;

-- Si alguien se aprueba "a la antigua" (sin elegir módulo), entra a Alabanza como antes
create or replace function public.modulo_por_defecto() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.modulos_acceso where perfil_id = new.id) then
    insert into public.modulos_acceso (perfil_id, modulo) values (new.id, 'alabanza') on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists trg_modulo_por_defecto on public.profiles;
create trigger trg_modulo_por_defecto after update of estado on public.profiles
  for each row when (new.estado = 'aprobado' and old.estado is distinct from 'aprobado')
  execute function public.modulo_por_defecto();

-- El calendario personal ahora sirve para cualquier módulo
create or replace function public.mi_token_calendario(p_nuevo boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  if not public.es_aprobado_general() then raise exception 'Cuenta no aprobada'; end if;
  if p_nuevo then delete from calendario_tokens where perfil_id = auth.uid(); end if;
  insert into calendario_tokens (perfil_id) values (auth.uid()) on conflict (perfil_id) do nothing;
  select token into t from calendario_tokens where perfil_id = auth.uid();
  return t;
end $$;
revoke all on function public.mi_token_calendario(boolean) from public, anon;
grant execute on function public.mi_token_calendario(boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 2. DISCIPULADO · estructura (quién es mentor de quién)
-- ---------------------------------------------------------------------
create or replace function public.hoy_panama() returns date
language sql stable as $$ select (now() at time zone 'America/Panama')::date; $$;

create or replace function public.disc_rol() returns text
language sql stable security definer set search_path = public as $$
  select a.rol from public.modulos_acceso a join public.profiles p on p.id = a.perfil_id and p.estado = 'aprobado'
  where a.perfil_id = auth.uid() and a.modulo = 'discipulado';
$$;
create or replace function public.es_disc() returns boolean
language sql stable security definer set search_path = public as $$ select public.disc_rol() is not null; $$;
create or replace function public.es_pastor() returns boolean
language sql stable security definer set search_path = public as $$ select coalesce(public.disc_rol() = 'pastor', false); $$;

-- Un discípulo tiene un solo mentor. Un mentor también puede tener su propio mentor.
create table if not exists public.disc_discipulos (
  discipulo_id uuid primary key references public.profiles(id) on delete cascade,
  mentor_id    uuid not null references public.profiles(id) on delete cascade,
  desde        date not null default public.hoy_panama(),
  check (discipulo_id <> mentor_id)
);
alter table public.disc_discipulos enable row level security;
drop policy if exists "dd_ver" on public.disc_discipulos;
create policy "dd_ver" on public.disc_discipulos for select to authenticated using (public.es_disc() or public.es_admin());

create or replace function public.mi_mentor() returns uuid
language sql stable security definer set search_path = public as $$
  select mentor_id from public.disc_discipulos where discipulo_id = auth.uid();
$$;
create or replace function public.es_mentor_de(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.disc_discipulos where discipulo_id = p and mentor_id = auth.uid());
$$;
-- "Mi grupo" = un mentor y sus discípulos. g es el mentor que encabeza el grupo.
create or replace function public.en_grupo(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select g is not null and (g = auth.uid() or g = public.mi_mentor());
$$;

-- Aprobar / cambiar accesos. Admin: todo. Pastor: solo la parte de Discipulado.
create or replace function public.guardar_accesos(
  p_perfil uuid, p_alabanza boolean, p_disc_rol text, p_mentor uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare admin boolean := public.es_admin(); pastor boolean := public.es_pastor();
begin
  if not admin and not pastor then raise exception 'No tienes permiso para dar accesos'; end if;
  if p_disc_rol is not null and p_disc_rol not in ('discipulo','mentor','pastor') then raise exception 'Rol no válido'; end if;
  if p_mentor is not null and p_mentor = p_perfil then raise exception 'Una persona no puede ser su propio mentor'; end if;
  if p_mentor is not null and not exists (
    select 1 from modulos_acceso where perfil_id = p_mentor and modulo = 'discipulado' and rol in ('mentor','pastor')) then
    raise exception 'El mentor elegido no tiene rol de mentor o pastor';
  end if;

  -- Alabanza (solo admin)
  if admin then
    if p_alabanza then insert into modulos_acceso (perfil_id, modulo) values (p_perfil, 'alabanza') on conflict do nothing;
    else delete from modulos_acceso where perfil_id = p_perfil and modulo = 'alabanza'; end if;
  end if;

  -- Discipulado
  if p_disc_rol is null then
    delete from modulos_acceso where perfil_id = p_perfil and modulo = 'discipulado';
    delete from disc_discipulos where discipulo_id = p_perfil or mentor_id = p_perfil;
  else
    insert into modulos_acceso (perfil_id, modulo, rol) values (p_perfil, 'discipulado', p_disc_rol)
    on conflict (perfil_id, modulo) do update set rol = excluded.rol;
    if p_disc_rol = 'discipulo' then delete from disc_discipulos where mentor_id = p_perfil; end if;
    if p_mentor is null then delete from disc_discipulos where discipulo_id = p_perfil;
    else
      insert into disc_discipulos (discipulo_id, mentor_id) values (p_perfil, p_mentor)
      on conflict (discipulo_id) do update set mentor_id = excluded.mentor_id, desde = public.hoy_panama();
    end if;
  end if;

  -- Si estaba pendiente y ya tiene algún módulo, queda aprobado
  if exists (select 1 from modulos_acceso where perfil_id = p_perfil) then
    perform set_config('app.aprobando', 'on', true);
    update profiles set estado = 'aprobado' where id = p_perfil and estado = 'pendiente';
    perform set_config('app.aprobando', 'off', true);
  end if;
end $$;
revoke all on function public.guardar_accesos(uuid, boolean, text, uuid) from public, anon;
grant execute on function public.guardar_accesos(uuid, boolean, text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. DEVOCIONALES (uno por fecha; los publica el pastor)
-- ---------------------------------------------------------------------
create table if not exists public.disc_devocionales (
  id           uuid primary key default gen_random_uuid(),
  fecha        date not null unique,
  serie        text,
  titulo       text not null,
  pasaje_ref   text,
  pasaje_texto text,
  reflexion    text,
  pregunta     text,
  aplicacion   text,
  autor_id     uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
alter table public.disc_devocionales enable row level security;
drop policy if exists "dev_ver"    on public.disc_devocionales;
drop policy if exists "dev_pastor" on public.disc_devocionales;
create policy "dev_ver" on public.disc_devocionales for select to authenticated
  using (public.es_disc() and (fecha <= public.hoy_panama() or public.es_pastor()));
create policy "dev_pastor" on public.disc_devocionales for all to authenticated
  using (public.es_pastor()) with check (public.es_pastor());

-- Respuestas: yo | mentor | grupo | comunidad
create table if not exists public.disc_respuestas (
  id            uuid primary key default gen_random_uuid(),
  devocional_id uuid not null references public.disc_devocionales(id) on delete cascade,
  autor_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  texto         text not null default '' check (length(texto) <= 4000),
  visibilidad   text not null default 'mentor' check (visibilidad in ('yo','mentor','grupo','comunidad')),
  grupo_id      uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (devocional_id, autor_id)
);
alter table public.disc_respuestas enable row level security;
drop policy if exists "resp_ver"    on public.disc_respuestas;
drop policy if exists "resp_crear"  on public.disc_respuestas;
drop policy if exists "resp_editar" on public.disc_respuestas;
drop policy if exists "resp_borrar" on public.disc_respuestas;
create policy "resp_ver" on public.disc_respuestas for select to authenticated using (
  autor_id = auth.uid() or (public.es_disc() and (
    (visibilidad = 'mentor' and public.es_mentor_de(autor_id)) or
    (visibilidad = 'grupo' and public.en_grupo(grupo_id)) or
    visibilidad = 'comunidad')));
create policy "resp_crear" on public.disc_respuestas for insert to authenticated
  with check (public.es_disc() and autor_id = auth.uid() and (visibilidad <> 'grupo' or public.en_grupo(grupo_id)));
create policy "resp_editar" on public.disc_respuestas for update to authenticated
  using (autor_id = auth.uid())
  with check (autor_id = auth.uid() and (visibilidad <> 'grupo' or public.en_grupo(grupo_id)));
create policy "resp_borrar" on public.disc_respuestas for delete to authenticated using (autor_id = auth.uid());

-- Racha: devocionales publicados seguidos que la persona respondió.
-- El de hoy sin responder no rompe la racha (todavía tiene el día).
create or replace function public.disc_racha(p uuid default auth.uid())
returns table (actual int, maxima int, ultimo date)
language plpgsql stable security definer set search_path = public as $$
declare r record; hoy date := public.hoy_panama(); corriendo int := 0; contando boolean := true; primero boolean := true;
begin
  if not (p = auth.uid() or public.es_mentor_de(p) or public.es_pastor()) then raise exception 'Sin permiso'; end if;
  actual := 0; maxima := 0;
  for r in
    select d.fecha, exists (select 1 from disc_respuestas x where x.devocional_id = d.id and x.autor_id = p) as hecho
    from disc_devocionales d where d.fecha <= hoy order by d.fecha desc
  loop
    if r.hecho then
      corriendo := corriendo + 1;
      if contando then actual := actual + 1; end if;
    else
      if not (primero and r.fecha = hoy) then contando := false; end if;
      maxima := greatest(maxima, corriendo); corriendo := 0;
    end if;
    primero := false;
  end loop;
  maxima := greatest(maxima, corriendo);
  select max((created_at at time zone 'America/Panama')::date) into ultimo from disc_respuestas where autor_id = p;
  return next;
end $$;
grant execute on function public.disc_racha(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. MURO (comunidad, mi grupo o solo mi mentor)
-- ---------------------------------------------------------------------
create table if not exists public.disc_posts (
  id          uuid primary key default gen_random_uuid(),
  autor_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  tipo        text not null default 'reflexion' check (tipo in ('testimonio','oracion','versiculo','reflexion','logro','anuncio')),
  texto       text not null check (length(texto) between 1 and 4000),
  visibilidad text not null default 'comunidad' check (visibilidad in ('mentor','grupo','comunidad')),
  grupo_id    uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists disc_posts_fecha on public.disc_posts (created_at desc);
alter table public.disc_posts enable row level security;
drop policy if exists "dpost_ver"    on public.disc_posts;
drop policy if exists "dpost_crear"  on public.disc_posts;
drop policy if exists "dpost_editar" on public.disc_posts;
drop policy if exists "dpost_borrar" on public.disc_posts;
create policy "dpost_ver" on public.disc_posts for select to authenticated using (
  public.es_disc() and (autor_id = auth.uid() or visibilidad = 'comunidad' or
    (visibilidad = 'grupo' and public.en_grupo(grupo_id)) or
    (visibilidad = 'mentor' and public.es_mentor_de(autor_id))));
create policy "dpost_crear" on public.disc_posts for insert to authenticated
  with check (public.es_disc() and autor_id = auth.uid() and (visibilidad <> 'grupo' or public.en_grupo(grupo_id)));
create policy "dpost_editar" on public.disc_posts for update to authenticated
  using (autor_id = auth.uid()) with check (autor_id = auth.uid() and (visibilidad <> 'grupo' or public.en_grupo(grupo_id)));
create policy "dpost_borrar" on public.disc_posts for delete to authenticated
  using (autor_id = auth.uid() or (public.es_pastor() and visibilidad = 'comunidad'));

create table if not exists public.disc_reacciones (
  post_id   uuid not null references public.disc_posts(id) on delete cascade,
  perfil_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  tipo      text not null check (tipo in ('orando','amen')),
  primary key (post_id, perfil_id, tipo)
);
alter table public.disc_reacciones enable row level security;
drop policy if exists "dreac_ver"    on public.disc_reacciones;
drop policy if exists "dreac_crear"  on public.disc_reacciones;
drop policy if exists "dreac_borrar" on public.disc_reacciones;
-- (la subconsulta respeta las reglas de disc_posts: solo ves reacciones de lo que puedes ver)
create policy "dreac_ver" on public.disc_reacciones for select to authenticated
  using (exists (select 1 from public.disc_posts p where p.id = post_id));
create policy "dreac_crear" on public.disc_reacciones for insert to authenticated
  with check (perfil_id = auth.uid() and exists (select 1 from public.disc_posts p where p.id = post_id));
create policy "dreac_borrar" on public.disc_reacciones for delete to authenticated using (perfil_id = auth.uid());

create table if not exists public.disc_comentarios (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.disc_posts(id) on delete cascade,
  autor_id   uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  texto      text not null check (length(texto) between 1 and 2000),
  created_at timestamptz not null default now()
);
alter table public.disc_comentarios enable row level security;
drop policy if exists "dcom_ver"    on public.disc_comentarios;
drop policy if exists "dcom_crear"  on public.disc_comentarios;
drop policy if exists "dcom_borrar" on public.disc_comentarios;
create policy "dcom_ver" on public.disc_comentarios for select to authenticated
  using (exists (select 1 from public.disc_posts p where p.id = post_id));
create policy "dcom_crear" on public.disc_comentarios for insert to authenticated
  with check (autor_id = auth.uid() and exists (select 1 from public.disc_posts p where p.id = post_id));
create policy "dcom_borrar" on public.disc_comentarios for delete to authenticated
  using (autor_id = auth.uid() or public.es_pastor());

-- ---------------------------------------------------------------------
-- 5. MENTORÍAS (individuales o con todo el grupo) y asistencia
-- ---------------------------------------------------------------------
create table if not exists public.disc_mentorias (
  id           uuid primary key default gen_random_uuid(),
  mentor_id    uuid not null references public.profiles(id) on delete cascade,
  discipulo_id uuid references public.profiles(id) on delete cascade,   -- null = con todo el grupo
  inicio       timestamptz not null,
  duracion_min int not null default 60 check (duracion_min between 15 and 480),
  modalidad    text not null default 'presencial' check (modalidad in ('presencial','videollamada','llamada')),
  lugar        text,
  tema         text,
  estado       text not null default 'agendada' check (estado in ('propuesta','agendada','cancelada')),
  creado_por   uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists disc_mentorias_inicio on public.disc_mentorias (inicio);
alter table public.disc_mentorias enable row level security;
drop policy if exists "ment_ver"    on public.disc_mentorias;
drop policy if exists "ment_crear"  on public.disc_mentorias;
drop policy if exists "ment_editar" on public.disc_mentorias;
drop policy if exists "ment_borrar" on public.disc_mentorias;
create policy "ment_ver" on public.disc_mentorias for select to authenticated using (
  public.es_disc() and (mentor_id = auth.uid() or discipulo_id = auth.uid() or
    (discipulo_id is null and mentor_id = public.mi_mentor()) or public.es_pastor()));
create policy "ment_crear" on public.disc_mentorias for insert to authenticated with check (
  public.es_disc() and (
    (mentor_id = auth.uid() and (discipulo_id is null or public.es_mentor_de(discipulo_id))) or
    (discipulo_id = auth.uid() and mentor_id = public.mi_mentor() and estado = 'propuesta')));
create policy "ment_editar" on public.disc_mentorias for update to authenticated
  using (mentor_id = auth.uid() or (discipulo_id = auth.uid() and estado = 'propuesta'))
  with check (
    (mentor_id = auth.uid() and (discipulo_id is null or public.es_mentor_de(discipulo_id))) or
    (discipulo_id = auth.uid() and mentor_id = public.mi_mentor() and estado in ('propuesta','cancelada')));
create policy "ment_borrar" on public.disc_mentorias for delete to authenticated
  using (mentor_id = auth.uid() or (creado_por = auth.uid() and estado = 'propuesta'));

create table if not exists public.disc_asistencia (
  mentoria_id uuid not null references public.disc_mentorias(id) on delete cascade,
  perfil_id   uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  estado      text not null check (estado in ('confirmado','no_puedo')),
  updated_at  timestamptz not null default now(),
  primary key (mentoria_id, perfil_id)
);
alter table public.disc_asistencia enable row level security;
drop policy if exists "asis_ver"  on public.disc_asistencia;
drop policy if exists "asis_mia"  on public.disc_asistencia;
create policy "asis_ver" on public.disc_asistencia for select to authenticated
  using (exists (select 1 from public.disc_mentorias m where m.id = mentoria_id));
create policy "asis_mia" on public.disc_asistencia for all to authenticated
  using (perfil_id = auth.uid())
  with check (perfil_id = auth.uid() and exists (select 1 from public.disc_mentorias m where m.id = mentoria_id));

-- ---------------------------------------------------------------------
-- 6. NOTAS PRIVADAS DEL MENTOR (solo las lee quien las escribió)
-- ---------------------------------------------------------------------
create table if not exists public.disc_notas (
  id           uuid primary key default gen_random_uuid(),
  mentor_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  discipulo_id uuid not null references public.profiles(id) on delete cascade,
  texto        text not null check (length(texto) between 1 and 4000),
  created_at   timestamptz not null default now()
);
alter table public.disc_notas enable row level security;
drop policy if exists "notas_solo_mentor" on public.disc_notas;
drop policy if exists "notas_crear"       on public.disc_notas;
drop policy if exists "notas_borrar"      on public.disc_notas;
create policy "notas_solo_mentor" on public.disc_notas for select to authenticated using (mentor_id = auth.uid());
create policy "notas_crear" on public.disc_notas for insert to authenticated
  with check (mentor_id = auth.uid() and public.es_mentor_de(discipulo_id));
create policy "notas_borrar" on public.disc_notas for delete to authenticated using (mentor_id = auth.uid());

-- ---------------------------------------------------------------------
-- 7. RETOS Y RUTA DE CRECIMIENTO
-- ---------------------------------------------------------------------
create table if not exists public.disc_niveles (
  n           int primary key check (n between 1 and 4),
  nombre      text not null,
  descripcion text
);
insert into public.disc_niveles (n, nombre, descripcion) values
  (1, 'Raíz',  'Fundamentos de la fe'),
  (2, 'Tallo', 'Vida devocional'),
  (3, 'Rama',  'Servir'),
  (4, 'Fruto', 'Discipular a otros')
on conflict (n) do nothing;
alter table public.disc_niveles enable row level security;
drop policy if exists "niv_ver"    on public.disc_niveles;
drop policy if exists "niv_pastor" on public.disc_niveles;
create policy "niv_ver" on public.disc_niveles for select to authenticated using (public.es_disc());
create policy "niv_pastor" on public.disc_niveles for update to authenticated using (public.es_pastor()) with check (public.es_pastor());

-- Nivel de cada persona: lo sube su mentor (o un pastor)
create table if not exists public.disc_perfil (
  perfil_id  uuid primary key references public.profiles(id) on delete cascade,
  nivel      int not null default 1 check (nivel between 1 and 4),
  updated_at timestamptz not null default now()
);
alter table public.disc_perfil enable row level security;
drop policy if exists "dperf_ver"    on public.disc_perfil;
drop policy if exists "dperf_crear"  on public.disc_perfil;
drop policy if exists "dperf_editar" on public.disc_perfil;
create policy "dperf_ver" on public.disc_perfil for select to authenticated using (public.es_disc());
create policy "dperf_crear" on public.disc_perfil for insert to authenticated
  with check (public.es_mentor_de(perfil_id) or public.es_pastor());
create policy "dperf_editar" on public.disc_perfil for update to authenticated
  using (public.es_mentor_de(perfil_id) or public.es_pastor())
  with check (public.es_mentor_de(perfil_id) or public.es_pastor());

create table if not exists public.disc_retos (
  id          uuid primary key default gen_random_uuid(),
  titulo      text not null,
  descripcion text,
  dias        int not null default 7 check (dias between 1 and 365),
  nivel       int not null default 1 references public.disc_niveles(n),
  activo      boolean not null default true,
  creado_por  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table public.disc_retos enable row level security;
drop policy if exists "reto_ver"    on public.disc_retos;
drop policy if exists "reto_pastor" on public.disc_retos;
create policy "reto_ver" on public.disc_retos for select to authenticated using (public.es_disc());
create policy "reto_pastor" on public.disc_retos for all to authenticated using (public.es_pastor()) with check (public.es_pastor());

create table if not exists public.disc_retos_part (
  reto_id       uuid not null references public.disc_retos(id) on delete cascade,
  perfil_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  inicio        date not null default public.hoy_panama(),
  completado_at timestamptz,
  primary key (reto_id, perfil_id)
);
alter table public.disc_retos_part enable row level security;
drop policy if exists "rpart_ver"   on public.disc_retos_part;
drop policy if exists "rpart_mia"   on public.disc_retos_part;
create policy "rpart_ver" on public.disc_retos_part for select to authenticated
  using (perfil_id = auth.uid() or public.es_mentor_de(perfil_id) or public.es_pastor());
create policy "rpart_mia" on public.disc_retos_part for all to authenticated
  using (perfil_id = auth.uid()) with check (perfil_id = auth.uid() and public.es_disc());

create table if not exists public.disc_retos_marcas (
  reto_id   uuid not null,
  perfil_id uuid not null default auth.uid(),
  fecha     date not null default public.hoy_panama(),
  primary key (reto_id, perfil_id, fecha),
  foreign key (reto_id, perfil_id) references public.disc_retos_part(reto_id, perfil_id) on delete cascade
);
alter table public.disc_retos_marcas enable row level security;
drop policy if exists "rmarca_ver" on public.disc_retos_marcas;
drop policy if exists "rmarca_mia" on public.disc_retos_marcas;
create policy "rmarca_ver" on public.disc_retos_marcas for select to authenticated
  using (perfil_id = auth.uid() or public.es_mentor_de(perfil_id) or public.es_pastor());
create policy "rmarca_mia" on public.disc_retos_marcas for all to authenticated
  using (perfil_id = auth.uid()) with check (perfil_id = auth.uid() and fecha <= public.hoy_panama());

-- Al llegar a los días del reto, queda completado
create or replace function public.disc_completar_reto() returns trigger
language plpgsql security definer set search_path = public as $$
declare r_id uuid := coalesce(new.reto_id, old.reto_id); p_id uuid := coalesce(new.perfil_id, old.perfil_id);
begin
  update disc_retos_part rp set completado_at =
    case when (select count(*) from disc_retos_marcas m where m.reto_id = r_id and m.perfil_id = p_id)
              >= (select dias from disc_retos where id = r_id)
         then coalesce(rp.completado_at, now()) else null end
  where rp.reto_id = r_id and rp.perfil_id = p_id;
  return null;
end $$;
drop trigger if exists trg_completar_reto on public.disc_retos_marcas;
create trigger trg_completar_reto after insert or delete on public.disc_retos_marcas
  for each row execute function public.disc_completar_reto();

-- ---------------------------------------------------------------------
-- 8. PANEL DEL MENTOR: resumen de sus discípulos (o de todos, para el pastor)
-- ---------------------------------------------------------------------
create or replace function public.disc_resumen(p_todos boolean default false)
returns table (perfil_id uuid, mentor_id uuid, racha int, maxima int, ultimo date, proxima timestamptz, nivel int, retos_hechos int)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_todos and not public.es_pastor() then raise exception 'Solo pastores'; end if;
  return query
    select d.discipulo_id, d.mentor_id, r.actual, r.maxima, r.ultimo,
      (select min(m.inicio) from disc_mentorias m
        where m.estado = 'agendada' and m.inicio > now() and m.mentor_id = d.mentor_id
          and (m.discipulo_id = d.discipulo_id or m.discipulo_id is null)),
      coalesce((select dp.nivel from disc_perfil dp where dp.perfil_id = d.discipulo_id), 1),
      (select count(*)::int from disc_retos_part rp where rp.perfil_id = d.discipulo_id and rp.completado_at is not null)
    from disc_discipulos d
    cross join lateral public.disc_racha(d.discipulo_id) r
    where (p_todos or d.mentor_id = auth.uid());
end $$;
grant execute on function public.disc_resumen(boolean) to authenticated;

-- Tiempo real para el muro
do $$
begin
  begin alter publication supabase_realtime add table public.disc_posts; exception when duplicate_object then null; end;
end $$;

-- ---------------------------------------------------------------------
-- DESPUÉS DE EJECUTAR: date el rol de pastor en Discipulado (cambia el correo si hace falta).
-- Desde ahí puedes aprobar personas, asignar mentores y publicar devocionales y retos.
-- ---------------------------------------------------------------------
-- insert into public.modulos_acceso (perfil_id, modulo, rol)
-- select id, 'discipulado', 'pastor' from public.profiles where email = 'yanisgabriela12@gmail.com'
-- on conflict (perfil_id, modulo) do update set rol = 'pastor';
