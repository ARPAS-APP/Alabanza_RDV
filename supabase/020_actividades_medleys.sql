-- =====================================================================
-- 020 · Actividades por bloques (con comentarios) y medleys de canciones
-- Ejecutar en Supabase → SQL Editor. Se puede ejecutar más de una vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. MEDLEYS: una canción que une partes de otras canciones
--    medley = [{ "cancion_id": uuid, "secciones": [0, 2], "nombres": ["Coro","Puente"], "tono": "G" }]
--    secciones vacío = toda la canción. La letra unida se guarda en canciones.letra.
-- ---------------------------------------------------------------------
alter table public.canciones add column if not exists medley jsonb;

-- ---------------------------------------------------------------------
-- 2. ACTIVIDADES, BLOQUES Y COMENTARIOS
-- ---------------------------------------------------------------------
create table if not exists public.actividades (
  id          uuid primary key default gen_random_uuid(),
  titulo      text not null check (char_length(titulo) between 1 and 150),
  descripcion text,
  fecha       date,
  setlist_id  uuid references public.setlists(id) on delete set null,   -- día de la agenda (opcional)
  creado_por  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_actividades_fecha   on public.actividades (fecha);
create index if not exists idx_actividades_setlist on public.actividades (setlist_id);

create table if not exists public.actividad_bloques (
  id             uuid primary key default gen_random_uuid(),
  actividad_id   uuid not null references public.actividades(id) on delete cascade,
  titulo         text not null check (char_length(titulo) between 1 and 120),
  hora           text check (hora is null or char_length(hora) <= 20),
  descripcion    text,
  responsable_id uuid references public.profiles(id) on delete set null,
  orden          int not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists idx_bloques_actividad on public.actividad_bloques (actividad_id, orden);

create table if not exists public.bloque_comentarios (
  id         uuid primary key default gen_random_uuid(),
  bloque_id  uuid not null references public.actividad_bloques(id) on delete cascade,
  autor_id   uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  texto      text not null check (char_length(texto) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists idx_bloque_com on public.bloque_comentarios (bloque_id, created_at);

drop trigger if exists trg_actividades_upd on public.actividades;
create trigger trg_actividades_upd before update on public.actividades
  for each row execute function public.set_updated_at();

-- ¿Puede comentar en este bloque?
--  · admins siempre
--  · si la actividad está ligada a un día: quienes sirven ese día
--  · si no tiene día: todo el equipo aprobado
create or replace function public.puede_comentar_bloque(p_bloque uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.es_admin() or exists (
    select 1
    from actividad_bloques b
    join actividades a on a.id = b.actividad_id
    where b.id = p_bloque
      and public.es_aprobado()
      and (a.setlist_id is null
           or exists (select 1 from asignaciones s where s.setlist_id = a.setlist_id and s.perfil_id = auth.uid()))
  );
$$;

alter table public.actividades        enable row level security;
alter table public.actividad_bloques  enable row level security;
alter table public.bloque_comentarios enable row level security;

drop policy if exists "act_ver"   on public.actividades;
drop policy if exists "act_admin" on public.actividades;
create policy "act_ver"   on public.actividades for select to authenticated using (public.es_aprobado());
create policy "act_admin" on public.actividades for all    to authenticated
  using (public.es_admin()) with check (public.es_admin());

drop policy if exists "blq_ver"   on public.actividad_bloques;
drop policy if exists "blq_admin" on public.actividad_bloques;
create policy "blq_ver"   on public.actividad_bloques for select to authenticated using (public.es_aprobado());
create policy "blq_admin" on public.actividad_bloques for all    to authenticated
  using (public.es_admin()) with check (public.es_admin());

drop policy if exists "bcom_ver"    on public.bloque_comentarios;
drop policy if exists "bcom_crear"  on public.bloque_comentarios;
drop policy if exists "bcom_borrar" on public.bloque_comentarios;
create policy "bcom_ver"    on public.bloque_comentarios for select to authenticated using (public.es_aprobado());
create policy "bcom_crear"  on public.bloque_comentarios for insert to authenticated
  with check (autor_id = auth.uid() and public.puede_comentar_bloque(bloque_id));
create policy "bcom_borrar" on public.bloque_comentarios for delete to authenticated
  using (autor_id = auth.uid() or public.es_admin());

-- ---------------------------------------------------------------------
-- 3. PROGRAMA PÚBLICO (link de solo lectura): bloques de cada día, sin comentarios
-- ---------------------------------------------------------------------
create or replace function public.bloques_publicos(p_token text, p_desde timestamptz, p_hasta timestamptz)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from acceso_publico where id = 1 and token = p_token and activo) then
    raise exception 'Link no válido o desactivado';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'setlist_id', a.setlist_id,
             'titulo', a.titulo,
             'bloques', coalesce((
               select jsonb_agg(jsonb_build_object('titulo', b.titulo, 'hora', b.hora, 'descripcion', b.descripcion)
                                order by b.orden, b.created_at)
               from actividad_bloques b where b.actividad_id = a.id), '[]'::jsonb))
           order by a.created_at)
    from actividades a
    join setlists s on s.id = a.setlist_id
    where s.fecha >= p_desde and s.fecha < p_hasta
  ), '[]'::jsonb);
end $$;
grant execute on function public.bloques_publicos(text, timestamptz, timestamptz) to anon, authenticated;
