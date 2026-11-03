-- =====================================================================
-- APP · Actualización 016 · Discipulado: fotos, PDFs y preguntas
-- Ejecutar DESPUÉS de 015_modulos_discipulado.sql.
-- Pegar completo en: Supabase → SQL Editor → New query → Run.
-- Se puede volver a ejecutar sin romper nada.
--
-- 1. Fotos y PDFs en las publicaciones del muro (bucket "disc-archivos").
--    Cada persona sube en su propia carpeta; nombres aleatorios (no se pueden adivinar).
-- 2. Preguntas: nuevo tipo "pregunta", la mejor respuesta y preguntas anónimas.
--    En una pregunta anónima nadie ve quién preguntó, salvo su propio mentor.
--    El nombre se oculta en la base de datos (vistas disc_muro y disc_comentarios_v),
--    no solo en la pantalla.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ARCHIVOS
-- ---------------------------------------------------------------------
alter table public.disc_posts add column if not exists adjuntos jsonb not null default '[]'::jsonb;
alter table public.disc_posts drop constraint if exists disc_posts_adjuntos_ok;
alter table public.disc_posts add constraint disc_posts_adjuntos_ok
  check (jsonb_typeof(adjuntos) = 'array' and jsonb_array_length(adjuntos) <= 6);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('disc-archivos', 'disc-archivos', true, 10485760,
        array['image/jpeg','image/png','image/webp','image/gif','application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "disc_arch_subir"  on storage.objects;
drop policy if exists "disc_arch_borrar" on storage.objects;
create policy "disc_arch_subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'disc-archivos' and public.es_disc()
              and (storage.foldername(name))[1] = auth.uid()::text);
create policy "disc_arch_borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'disc-archivos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------
-- 2. PREGUNTAS
-- ---------------------------------------------------------------------
alter table public.disc_posts drop constraint if exists disc_posts_tipo_check;
alter table public.disc_posts add constraint disc_posts_tipo_check
  check (tipo in ('testimonio','oracion','versiculo','reflexion','logro','anuncio','pregunta'));
alter table public.disc_posts add column if not exists anonimo  boolean not null default false;
alter table public.disc_posts add column if not exists mejor_id uuid references public.disc_comentarios(id) on delete set null;
alter table public.disc_posts drop constraint if exists disc_posts_anonimo_ok;
alter table public.disc_posts add constraint disc_posts_anonimo_ok check (not anonimo or tipo = 'pregunta');

-- ¿Puedo ver esta publicación? (incluye las anónimas)
create or replace function public.disc_puede_ver_post(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from disc_posts x where x.id = p and public.es_disc() and (
    x.autor_id = auth.uid() or x.visibilidad = 'comunidad' or
    (x.visibilidad = 'grupo' and public.en_grupo(x.grupo_id)) or
    (x.visibilidad = 'mentor' and public.es_mentor_de(x.autor_id))));
$$;
-- ¿Ese autor está oculto para mí en esa publicación? (quien hizo una pregunta anónima)
create or replace function public.disc_autor_oculto(p uuid, autor uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from disc_posts x where x.id = p and x.anonimo and x.autor_id = autor
    and autor <> auth.uid() and not public.es_mentor_de(autor));
$$;

-- Leer la tabla directa nunca muestra quién hizo una pregunta anónima
drop policy if exists "dpost_ver" on public.disc_posts;
create policy "dpost_ver" on public.disc_posts for select to authenticated using (
  public.es_disc() and (autor_id = auth.uid() or (
    (not anonimo or public.es_mentor_de(autor_id)) and (
      visibilidad = 'comunidad' or
      (visibilidad = 'grupo' and public.en_grupo(grupo_id)) or
      (visibilidad = 'mentor' and public.es_mentor_de(autor_id))))));

drop policy if exists "dreac_ver"   on public.disc_reacciones;
drop policy if exists "dreac_crear" on public.disc_reacciones;
create policy "dreac_ver" on public.disc_reacciones for select to authenticated
  using (public.disc_puede_ver_post(post_id));
create policy "dreac_crear" on public.disc_reacciones for insert to authenticated
  with check (perfil_id = auth.uid() and public.disc_puede_ver_post(post_id));

drop policy if exists "dcom_ver"   on public.disc_comentarios;
drop policy if exists "dcom_crear" on public.disc_comentarios;
create policy "dcom_ver" on public.disc_comentarios for select to authenticated
  using (autor_id = auth.uid() or (public.disc_puede_ver_post(post_id) and not public.disc_autor_oculto(post_id, autor_id)));
create policy "dcom_crear" on public.disc_comentarios for insert to authenticated
  with check (autor_id = auth.uid() and public.disc_puede_ver_post(post_id));

-- Lo que la app lee en el muro: con el nombre oculto donde corresponde
drop view if exists public.disc_muro;
create view public.disc_muro as
  select p.id,
         case when public.disc_autor_oculto(p.id, p.autor_id) then null else p.autor_id end as autor_id,
         p.autor_id = auth.uid() as mio,
         p.tipo, p.texto, p.visibilidad, p.grupo_id, p.created_at, p.anonimo, p.adjuntos, p.mejor_id
  from public.disc_posts p
  where public.disc_puede_ver_post(p.id);
revoke all on public.disc_muro from anon, public;
grant select on public.disc_muro to authenticated;

drop view if exists public.disc_comentarios_v;
create view public.disc_comentarios_v as
  select c.id, c.post_id,
         case when public.disc_autor_oculto(c.post_id, c.autor_id) then null else c.autor_id end as autor_id,
         c.autor_id = auth.uid() as mio,
         c.texto, c.created_at
  from public.disc_comentarios c
  where public.disc_puede_ver_post(c.post_id);
revoke all on public.disc_comentarios_v from anon, public;
grant select on public.disc_comentarios_v to authenticated;

-- Marcar la mejor respuesta: quien preguntó, su mentor o quien administra
create or replace function public.disc_marcar_mejor(p_post uuid, p_com uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a uuid;
begin
  select autor_id into a from disc_posts where id = p_post;
  if a is null then raise exception 'La publicación no existe'; end if;
  if not (a = auth.uid() or public.es_mentor_de(a) or public.es_pastor()) then raise exception 'Sin permiso'; end if;
  if p_com is not null and not exists (select 1 from disc_comentarios where id = p_com and post_id = p_post) then
    raise exception 'Esa respuesta no es de esta pregunta';
  end if;
  update disc_posts set mejor_id = p_com where id = p_post;
end $$;
revoke all on function public.disc_marcar_mejor(uuid, uuid) from public, anon;
grant execute on function public.disc_marcar_mejor(uuid, uuid) to authenticated;
