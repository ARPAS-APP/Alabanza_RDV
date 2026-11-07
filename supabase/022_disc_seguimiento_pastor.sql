-- =====================================================================
-- APP · Actualización 022 · Discipulado: el pastor ve las notas de seguimiento
-- y un resumen de la labor de cada mentor.
-- Requiere: 015 a 019.
-- Pegar completo en: Supabase → SQL Editor → New query → Run.
-- Se puede volver a ejecutar sin romper nada.
--
-- Qué cambia:
--  - Las notas de cada mentor sobre sus discípulos ahora las lee también quien
--    administra Discipulado (rol "Mentor (administra)", el pastor). Solo leer:
--    no puede editarlas ni borrarlas.
--  - Las mentorías el pastor ya las veía todas (desde 015).
--  - Nueva función disc_seguimiento_mentores(): por cada mentor, discípulos,
--    mentorías realizadas en 30 días, próximas, canceladas, notas en 30 días y
--    cuántos discípulos llevan 30 días sin mentoría.
-- =====================================================================

-- 1) Notas: el mentor que las escribió y el pastor
drop policy if exists "notas_solo_mentor" on public.disc_notas;
drop policy if exists "notas_ver" on public.disc_notas;
create policy "notas_ver" on public.disc_notas for select to authenticated
  using (mentor_id = auth.uid() or public.es_pastor());

-- 2) Labor de cada mentor (solo para quien administra)
create or replace function public.disc_seguimiento_mentores()
returns table (
  mentor_id uuid,
  discipulos int,
  mentorias_30 int,
  proximas int,
  canceladas_30 int,
  ultima_mentoria timestamptz,
  notas_30 int,
  ultima_nota timestamptz,
  sin_mentoria_30 int,
  invitados_pendientes int
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_pastor() then raise exception 'Solo para quien administra Discipulado'; end if;
  return query
  with mentores as (
    select a.perfil_id as mid from modulos_acceso a
    join profiles p on p.id = a.perfil_id and p.estado = 'aprobado'
    where a.modulo = 'discipulado' and a.rol in ('mentor','pastor')
  ), hechas as (   -- mentorías ya realizadas (agendadas y en el pasado)
    select m.mentor_id, m.discipulo_id, m.inicio from disc_mentorias m
    where m.estado = 'agendada' and m.inicio <= now()
  )
  select
    x.mid,
    (select count(*)::int from disc_discipulos d where d.mentor_id = x.mid),
    (select count(*)::int from hechas h where h.mentor_id = x.mid and h.inicio > now() - interval '30 days'),
    (select count(*)::int from disc_mentorias m where m.mentor_id = x.mid and m.estado in ('agendada','propuesta') and m.inicio > now()),
    (select count(*)::int from disc_mentorias m where m.mentor_id = x.mid and m.estado = 'cancelada' and m.inicio > now() - interval '30 days'),
    (select max(h.inicio) from hechas h where h.mentor_id = x.mid),
    (select count(*)::int from disc_notas n where n.mentor_id = x.mid and n.created_at > now() - interval '30 days'),
    (select max(n.created_at) from disc_notas n where n.mentor_id = x.mid),
    (select count(*)::int from disc_discipulos d where d.mentor_id = x.mid and not exists (
       select 1 from hechas h where h.mentor_id = x.mid and h.inicio > now() - interval '30 days'
         and (h.discipulo_id = d.discipulo_id or h.discipulo_id is null))),
    (select count(*)::int from profiles p where p.invitado_por = x.mid and p.estado = 'pendiente')
  from mentores x;
end $$;
revoke all on function public.disc_seguimiento_mentores() from public, anon;
grant execute on function public.disc_seguimiento_mentores() to authenticated;
