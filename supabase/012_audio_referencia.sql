-- =====================================================================
-- APP ALABANZA · Actualización 012 · Audio de referencia por canción
-- El admin sube el audio de la canción (tal como suena en el disco) y cada
-- integrante lo escucha en el tono elegido y con el tempo que quiera.
-- Se puede volver a ejecutar sin romper nada.
-- =====================================================================

alter table public.canciones add column if not exists audio_url  text;
alter table public.canciones add column if not exists audio_ruta text;   -- ruta en el bucket "audios"
alter table public.canciones add column if not exists audio_tono text;   -- tono en que está grabado (vacío = el original)
alter table public.canciones add column if not exists audio_bpm  int check (audio_bpm between 30 and 260);

-- Bucket público para los audios (máx 20 MB cada uno)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('audios', 'audios', true, 20971520,
        array['audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a','audio/m4a','audio/aac','audio/wav','audio/x-wav','audio/wave','audio/ogg','audio/webm','audio/flac','audio/x-flac'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Suben y borran los admins (los que editan canciones), cada uno en su carpeta
drop policy if exists "audio_subir"  on storage.objects;
drop policy if exists "audio_borrar" on storage.objects;
create policy "audio_subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'audios' and public.es_admin()
              and (storage.foldername(name))[1] = auth.uid()::text);
create policy "audio_borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'audios' and public.es_admin());
