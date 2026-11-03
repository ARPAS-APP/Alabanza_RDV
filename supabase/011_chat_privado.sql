-- =====================================================================
-- APP ALABANZA · Actualización 011 · Mensajes privados 1 a 1 en el chat del día
-- Ejecutar DESPUÉS de 004_voz_dirige_chat.sql y 007_menciones_push.sql.
-- Se puede volver a ejecutar sin romper nada.
--
-- - mensajes_evento.para_id: vacío = chat general del día; con valor = mensaje
--   privado para esa persona.
-- - Un privado lo leen solo quien lo escribe, quien lo recibe y los admins.
-- - Al recibir un privado, el destinatario recibe aviso (y push si 008 está activo).
-- =====================================================================

alter table public.mensajes_evento
  add column if not exists para_id uuid references public.profiles(id) on delete cascade;
create index if not exists idx_mensajes_privados
  on public.mensajes_evento (setlist_id, para_id) where para_id is not null;

-- Lectura: el general lo ven todos los aprobados; el privado, solo los dos y los admins
drop policy if exists "msg_ver" on public.mensajes_evento;
create policy "msg_ver" on public.mensajes_evento for select to authenticated
  using (public.es_aprobado() and (
    para_id is null or autor_id = auth.uid() or para_id = auth.uid() or public.es_admin()));

-- Escritura: uno escribe solo como sí mismo, y el privado va a otra persona aprobada
drop policy if exists "msg_crear" on public.mensajes_evento;
create policy "msg_crear" on public.mensajes_evento for insert to authenticated
  with check (public.es_aprobado() and autor_id = auth.uid() and (
    para_id is null or (para_id <> auth.uid()
      and exists (select 1 from public.profiles p where p.id = para_id and p.estado = 'aprobado'))));

-- Menciones: en un privado solo se avisa al destinatario (se ignoran @todos, @voces, etc.)
create or replace function public.extraer_menciones() returns trigger
language plpgsql security definer set search_path = public as $$
declare g text;
begin
  if new.para_id is not null then
    insert into menciones (mensaje_id, perfil_id)
    select new.id, new.para_id where new.para_id <> new.autor_id
    on conflict do nothing;
    return new;
  end if;

  insert into menciones (mensaje_id, perfil_id)
  select new.id, m[1]::uuid
  from regexp_matches(new.texto, '@\[[^\]]+\]\(([0-9a-f-]{36})\)', 'g') as m
  where exists (select 1 from profiles p where p.id = m[1]::uuid and p.estado = 'aprobado')
  on conflict do nothing;

  for g in select (regexp_matches(new.texto, '@\[(todos|voces|musicos|admins|pendientes)\]\(grupo\)', 'g'))[1] loop
    insert into menciones (mensaje_id, perfil_id)
    select distinct new.id, a.perfil_id from asignaciones a
    where a.setlist_id = new.setlist_id
      and (g = 'todos' or (g = 'voces' and a.rol = 'voz') or (g = 'musicos' and a.rol <> 'voz')
           or (g = 'pendientes' and a.estado in ('pendiente','por_confirmar')))
    union
    select new.id, p.id from profiles p where g = 'admins' and p.rol = 'admin' and p.estado = 'aprobado'
    on conflict do nothing;
  end loop;

  delete from menciones where mensaje_id = new.id and perfil_id = new.autor_id;
  return new;
end $$;

drop trigger if exists trg_menciones on public.mensajes_evento;
create trigger trg_menciones after insert on public.mensajes_evento
  for each row execute function public.extraer_menciones();
