-- =====================================================================
-- 021 · Actividades como programa: momentos dentro de cada bloque,
--        canciones del día en su bloque, lema, horarios y citas bíblicas
-- Requiere 020_actividades_medleys.sql. Ejecutar en Supabase → SQL Editor.
-- Se puede ejecutar más de una vez.
-- =====================================================================

-- 1. Datos del programa en la actividad
alter table public.actividades add column if not exists lema        text;   -- "Una adoración sin principio ni fin"
alter table public.actividades add column if not exists hora_inicio text;   -- 7:00 p. m.
alter table public.actividades add column if not exists hora_cierre text;   -- 10:00 p. m.
alter table public.actividades add column if not exists hora_limite text;   -- a más tardar

-- 2. Datos del bloque
alter table public.actividad_bloques add column if not exists etiqueta text;  -- "Urbano", "Antes de la creación"
alter table public.actividad_bloques add column if not exists hora_fin text;  -- el bloque va de "hora" a "hora_fin"
alter table public.actividad_bloques add column if not exists citas    text;  -- "Juan 1:1-3 · Salmos 90:2"

-- 3. Momentos dentro de cada bloque
create table if not exists public.bloque_momentos (
  id         uuid primary key default gen_random_uuid(),
  bloque_id  uuid not null references public.actividad_bloques(id) on delete cascade,
  hora       text check (hora is null or char_length(hora) <= 20),
  titulo     text not null check (char_length(titulo) between 1 and 150),
  detalle    text check (detalle is null or char_length(detalle) <= 1000),
  minutos    int check (minutos is null or minutos between 0 and 600),
  destacado  boolean not null default false,
  orden      int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_momentos_bloque on public.bloque_momentos (bloque_id, orden);

alter table public.bloque_momentos enable row level security;
drop policy if exists "mom_ver"   on public.bloque_momentos;
drop policy if exists "mom_admin" on public.bloque_momentos;
create policy "mom_ver"   on public.bloque_momentos for select to authenticated using (public.es_aprobado());
create policy "mom_admin" on public.bloque_momentos for all    to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- 4. Cada canción del repertorio de un día puede ir en un bloque de la actividad de ese día
alter table public.setlist_items
  add column if not exists bloque_id uuid references public.actividad_bloques(id) on delete set null;
create index if not exists idx_setlist_items_bloque on public.setlist_items (bloque_id);

-- 5. Programa público (link de solo lectura): todo lo anterior, sin comentarios
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
             'lema', a.lema,
             'hora_inicio', a.hora_inicio, 'hora_cierre', a.hora_cierre, 'hora_limite', a.hora_limite,
             'bloques', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'titulo', b.titulo, 'etiqueta', b.etiqueta, 'hora', b.hora, 'hora_fin', b.hora_fin,
                        'citas', b.citas, 'descripcion', b.descripcion,
                        'momentos', coalesce((
                          select jsonb_agg(jsonb_build_object('hora', m.hora, 'titulo', m.titulo, 'detalle', m.detalle,
                                                              'minutos', m.minutos, 'destacado', m.destacado)
                                           order by m.orden, m.created_at)
                          from bloque_momentos m where m.bloque_id = b.id), '[]'::jsonb),
                        'canciones', coalesce((
                          select jsonb_agg(c.titulo order by si.orden)
                          from setlist_items si join canciones c on c.id = si.cancion_id
                          where si.bloque_id = b.id and si.setlist_id = a.setlist_id), '[]'::jsonb))
                      order by b.orden, b.created_at)
               from actividad_bloques b where b.actividad_id = a.id), '[]'::jsonb))
           order by a.created_at)
    from actividades a
    join setlists s on s.id = a.setlist_id
    where s.fecha >= p_desde and s.fecha < p_hasta
  ), '[]'::jsonb);
end $$;
grant execute on function public.bloques_publicos(text, timestamptz, timestamptz) to anon, authenticated;
