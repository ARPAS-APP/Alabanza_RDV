-- =====================================================================
-- APP · Actualización 017 · Discipulado: devocionales interactivos
-- Ejecutar DESPUÉS de 015. Pegar completo en Supabase → SQL Editor → Run.
-- Se puede volver a ejecutar sin romper nada.
--
-- 1. Comentarios en cada devocional, visibles para todo Discipulado.
-- 2. Quien administra ve quién completó cada devocional (solo el nombre y
--    la hora, no lo que escribió, si la respuesta es privada). Un mentor ve
--    lo mismo de sus propios discípulos.
-- =====================================================================

create table if not exists public.disc_dev_comentarios (
  id            uuid primary key default gen_random_uuid(),
  devocional_id uuid not null references public.disc_devocionales(id) on delete cascade,
  autor_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  texto         text not null check (length(texto) between 1 and 2000),
  created_at    timestamptz not null default now()
);
create index if not exists disc_dev_com_dev on public.disc_dev_comentarios (devocional_id, created_at);
alter table public.disc_dev_comentarios enable row level security;
drop policy if exists "dvc_ver"    on public.disc_dev_comentarios;
drop policy if exists "dvc_crear"  on public.disc_dev_comentarios;
drop policy if exists "dvc_borrar" on public.disc_dev_comentarios;
create policy "dvc_ver" on public.disc_dev_comentarios for select to authenticated
  using (public.es_disc() and exists (select 1 from public.disc_devocionales d where d.id = devocional_id));
create policy "dvc_crear" on public.disc_dev_comentarios for insert to authenticated
  with check (public.es_disc() and autor_id = auth.uid() and exists (select 1 from public.disc_devocionales d where d.id = devocional_id));
create policy "dvc_borrar" on public.disc_dev_comentarios for delete to authenticated
  using (autor_id = auth.uid() or public.es_pastor());

-- Quién completó un devocional: quien administra ve a todos; un mentor, a sus discípulos
create or replace function public.disc_completaron(p_dev uuid)
returns table (perfil_id uuid, hecho_at timestamptz, visibilidad text)
language sql stable security definer set search_path = public as $$
  select r.autor_id, r.created_at, r.visibilidad
  from disc_respuestas r
  where r.devocional_id = p_dev and public.es_disc()
    and (public.es_pastor() or public.es_mentor_de(r.autor_id) or r.autor_id = auth.uid())
  order by r.created_at;
$$;
revoke all on function public.disc_completaron(uuid) from public, anon;
grant execute on function public.disc_completaron(uuid) to authenticated;
