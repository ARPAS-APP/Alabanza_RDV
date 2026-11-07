-- =====================================================================
-- APP · Actualización 023 · Discipulado: ficha de servicio y bitácora
-- Requiere: 015 a 018.
-- Pegar completo en: Supabase → SQL Editor → New query → Run.
-- Se puede volver a ejecutar sin romper nada.
--
-- Qué cambia:
--  - Cada persona de Discipulado llena su "ficha de servicio": en qué
--    ministerios sirve, qué hace ahí y a cuántas personas discipula.
--  - Cada vez que la actualiza queda una entrada en su bitácora (con fecha).
--  - El mentor (o quien administra) puede pedir que actualicen la ficha:
--    les aparece en Inicio y les llega un aviso al celular.
--  - La ve la persona, su mentor y quien administra. Nadie más.
-- =====================================================================

-- 1) Ficha actual
create table if not exists public.disc_servicio (
  perfil_id   uuid primary key references public.profiles(id) on delete cascade,
  ministerios text[] not null default '{}',
  rol         text not null default 'ninguno' check (rol in ('servidor','lider','ninguno')),
  discipulas  int  not null default 0 check (discipulas between 0 and 200),
  comentario  text check (char_length(comentario) <= 1000),
  updated_at  timestamptz not null default now()
);
alter table public.disc_servicio enable row level security;
drop policy if exists "serv_ver" on public.disc_servicio;
create policy "serv_ver" on public.disc_servicio for select to authenticated
  using (perfil_id = auth.uid() or public.es_mentor_de(perfil_id) or public.es_pastor());
drop policy if exists "serv_mia" on public.disc_servicio;
create policy "serv_mia" on public.disc_servicio for insert to authenticated
  with check (perfil_id = auth.uid() and public.es_disc());
drop policy if exists "serv_mia_upd" on public.disc_servicio;
create policy "serv_mia_upd" on public.disc_servicio for update to authenticated
  using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());

-- 2) Bitácora: una entrada por cada actualización
create table if not exists public.disc_servicio_hist (
  id          uuid primary key default gen_random_uuid(),
  perfil_id   uuid not null references public.profiles(id) on delete cascade,
  ministerios text[] not null default '{}',
  rol         text not null,
  discipulas  int  not null,
  comentario  text,
  created_at  timestamptz not null default now()
);
create index if not exists disc_servicio_hist_perfil on public.disc_servicio_hist (perfil_id, created_at desc);
alter table public.disc_servicio_hist enable row level security;
drop policy if exists "servh_ver" on public.disc_servicio_hist;
create policy "servh_ver" on public.disc_servicio_hist for select to authenticated
  using (perfil_id = auth.uid() or public.es_mentor_de(perfil_id) or public.es_pastor());

create or replace function public.disc_servicio_bitacora() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into disc_servicio_hist (perfil_id, ministerios, rol, discipulas, comentario)
  values (new.perfil_id, new.ministerios, new.rol, new.discipulas, new.comentario);
  return new;
end $$;
drop trigger if exists trg_disc_servicio_bitacora on public.disc_servicio;
create trigger trg_disc_servicio_bitacora after insert or update on public.disc_servicio
  for each row execute function public.disc_servicio_bitacora();

-- 3) Pedidos de actualización ("encuestas")
--    para_todos = lo pide quien administra a todo Discipulado; si no, solo a los discípulos de mentor_id.
create table if not exists public.disc_encuestas (
  id         uuid primary key default gen_random_uuid(),
  mentor_id  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  para_todos boolean not null default false,
  mensaje    text check (char_length(mensaje) <= 300),
  created_at timestamptz not null default now()
);
alter table public.disc_encuestas enable row level security;
drop policy if exists "enc_ver" on public.disc_encuestas;
create policy "enc_ver" on public.disc_encuestas for select to authenticated
  using (mentor_id = auth.uid() or mentor_id = public.mi_mentor() or (para_todos and public.es_disc()) or public.es_pastor());
drop policy if exists "enc_crear" on public.disc_encuestas;
create policy "enc_crear" on public.disc_encuestas for insert to authenticated
  with check (mentor_id = auth.uid() and public.disc_rol() in ('mentor','pastor') and (not para_todos or public.es_pastor()));

-- 4) Aviso al celular cuando se pide actualizar (usa la función avisos-disc de 018)
create or replace function public.disc_avisar_encuesta() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public.llamar_avisos_disc(jsonb_build_object('tipo', 'encuesta', 'id', new.id));
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists trg_disc_avisar_encuesta on public.disc_encuestas;
create trigger trg_disc_avisar_encuesta after insert on public.disc_encuestas
  for each row execute function public.disc_avisar_encuesta();
