-- =====================================================================
-- APP ALABANZA · Actualización 013 · Historial del repertorio de cada día
-- Cada vez que alguien cambia las canciones de un día (agrega, quita, ordena,
-- cambia tono, cantante o notas) se guarda cómo quedó. Un admin puede ver las
-- versiones anteriores y restaurar una.
-- - Los cambios seguidos de la misma persona (menos de 5 minutos) cuentan como uno.
-- - Antes del primer cambio se guarda cómo estaba ("Versión inicial").
-- - Se guardan las últimas 40 versiones de cada día.
-- Se puede volver a ejecutar sin romper nada.
-- =====================================================================

create table if not exists public.historial_repertorio (
  id            uuid primary key default gen_random_uuid(),
  setlist_id    uuid not null references public.setlists(id) on delete cascade,
  autor_id      uuid references public.profiles(id) on delete set null,
  items         jsonb not null default '[]'::jsonb,   -- cómo quedó el repertorio
  inicial       boolean not null default false,       -- cómo estaba antes del primer cambio
  restaurado_de uuid,                                 -- si es una restauración, de qué versión
  created_at    timestamptz not null default clock_timestamp(),
  updated_at    timestamptz not null default clock_timestamp()
);
create index if not exists idx_hist_rep on public.historial_repertorio (setlist_id, created_at desc);

alter table public.historial_repertorio enable row level security;
drop policy if exists "hist_rep_ver" on public.historial_repertorio;
create policy "hist_rep_ver" on public.historial_repertorio for select to authenticated using (public.es_aprobado());
-- No hay políticas de escritura: solo escriben los disparadores y la función de restaurar.

-- Estado actual del repertorio de un día, como JSON ordenado
create or replace function public._repertorio_json(p_setlist uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(si) order by si.orden, si.id), '[]'::jsonb)
  from setlist_items si where si.setlist_id = p_setlist;
$$;

-- ANTES de cambiar: si el día no tiene historial, guarda cómo estaba
create or replace function public.historial_rep_antes() returns trigger
language plpgsql security definer set search_path = public as $$
declare sid uuid := coalesce(new.setlist_id, old.setlist_id);
begin
  if current_setting('app.restaurando', true) is not null and current_setting('app.restaurando', true) <> '' then return coalesce(new, old); end if;
  if not exists (select 1 from setlists where id = sid) then return coalesce(new, old); end if;
  if not exists (select 1 from historial_repertorio where setlist_id = sid) then
    insert into historial_repertorio (setlist_id, autor_id, items, inicial)
    values (sid, null, _repertorio_json(sid), true);
  end if;
  return coalesce(new, old);
end $$;

-- DESPUÉS de cambiar: guarda cómo quedó (o actualiza la última versión si es la misma persona hace poco)
create or replace function public.historial_rep_despues() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  sid uuid := coalesce(new.setlist_id, old.setlist_id);
  ult historial_repertorio;
begin
  if current_setting('app.restaurando', true) is not null and current_setting('app.restaurando', true) <> '' then return null; end if;
  if not exists (select 1 from setlists where id = sid) then return null; end if;   -- se está borrando el día
  select * into ult from historial_repertorio where setlist_id = sid order by created_at desc limit 1;
  if found and not ult.inicial and ult.restaurado_de is null
     and ult.autor_id is not distinct from auth.uid() and ult.updated_at > clock_timestamp() - interval '5 minutes' then
    update historial_repertorio set items = _repertorio_json(sid), updated_at = clock_timestamp() where id = ult.id;
  else
    insert into historial_repertorio (setlist_id, autor_id, items) values (sid, auth.uid(), _repertorio_json(sid));
    delete from historial_repertorio where setlist_id = sid and id not in (
      select id from historial_repertorio where setlist_id = sid order by created_at desc limit 40);
  end if;
  return null;
end $$;

drop trigger if exists trg_hist_rep_antes   on public.setlist_items;
drop trigger if exists trg_hist_rep_despues on public.setlist_items;
create trigger trg_hist_rep_antes before insert or update or delete on public.setlist_items
  for each row execute function public.historial_rep_antes();
create trigger trg_hist_rep_despues after insert or update or delete on public.setlist_items
  for each row execute function public.historial_rep_despues();

-- Restaurar una versión (solo admins). Deja también la restauración en el historial.
create or replace function public.restaurar_repertorio(p_version uuid) returns void
language plpgsql security definer set search_path = public as $$
declare h historial_repertorio;
begin
  if not public.es_admin() then raise exception 'Solo un admin puede restaurar el repertorio'; end if;
  select * into h from historial_repertorio where id = p_version;
  if not found then raise exception 'Esa versión ya no existe'; end if;

  perform set_config('app.restaurando', p_version::text, true);
  create temp table if not exists _rep_restaurar (like public.setlist_items) on commit drop;
  delete from _rep_restaurar;
  insert into _rep_restaurar select * from jsonb_populate_recordset(null::public.setlist_items, h.items);
  delete from _rep_restaurar where cancion_id not in (select id from canciones);           -- canciones borradas
  update _rep_restaurar set cantante_id = null
    where cantante_id is not null and cantante_id not in (select id from profiles);         -- personas borradas
  update _rep_restaurar set setlist_id = h.setlist_id;

  delete from setlist_items where setlist_id = h.setlist_id;
  insert into setlist_items select * from _rep_restaurar;
  perform set_config('app.restaurando', '', true);

  insert into historial_repertorio (setlist_id, autor_id, items, restaurado_de)
  values (h.setlist_id, auth.uid(), _repertorio_json(h.setlist_id), p_version);
end $$;
revoke all on function public.restaurar_repertorio(uuid) from public, anon;
grant execute on function public.restaurar_repertorio(uuid) to authenticated;
