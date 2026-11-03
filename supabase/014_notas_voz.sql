-- =====================================================================
-- APP ALABANZA · Actualización 014 · Notas de voz en el chat del día
-- Sirve para el chat general y para los mensajes privados.
-- Ejecutar DESPUÉS de 011_chat_privado.sql. Se puede volver a ejecutar sin romper nada.
--
-- - mensajes_evento.audio_url / audio_ruta / audio_seg: la nota de voz del mensaje.
--   El texto del mensaje queda como "🎤 Nota de voz", así los avisos y push siguen funcionando.
-- - Bucket "notas-voz": cada persona sube en su propia carpeta (máx 10 MB por nota).
--   Los nombres de archivo son aleatorios, así que nadie puede adivinar la dirección de una nota.
-- =====================================================================

alter table public.mensajes_evento add column if not exists audio_url  text;
alter table public.mensajes_evento add column if not exists audio_ruta text;
alter table public.mensajes_evento add column if not exists audio_seg  int check (audio_seg between 0 and 600);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('notas-voz', 'notas-voz', true, 10485760,
        array['audio/mp4','audio/x-m4a','audio/m4a','audio/aac','audio/webm','audio/ogg','audio/mpeg','audio/wav'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Sube cualquier integrante aprobado, en su carpeta; borra el dueño o un admin
drop policy if exists "nota_voz_subir"  on storage.objects;
drop policy if exists "nota_voz_borrar" on storage.objects;
create policy "nota_voz_subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'notas-voz' and public.es_aprobado()
              and (storage.foldername(name))[1] = auth.uid()::text);
create policy "nota_voz_borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'notas-voz'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.es_admin()));
