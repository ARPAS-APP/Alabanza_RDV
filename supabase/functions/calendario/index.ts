// Edge Function "calendario": devuelve los días de una persona en formato .ics
// para suscribirse desde el calendario del celular (iPhone, Google Calendar, Outlook).
// URL: https://<proyecto>.supabase.co/functions/v1/calendario?t=<token>
// Publicar con "Verify JWT" DESACTIVADO (los calendarios no envían sesión; la seguridad es el token).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const APP = 'https://arpas-app.github.io/Alabanza_RDV/';
const ROLES: Record<string, string> = {
  voz: 'Voz', piano: 'Piano / Teclado', guitarra: 'Guitarra acústica', guitarra_electrica: 'Guitarra eléctrica',
  bajo: 'Bajo', bateria: 'Batería', percusion: 'Percusión menor', otro: 'Otro',
};
const ESTADO: Record<string, string> = { pendiente: 'Sin responder', por_confirmar: 'Por confirmar', confirmado: 'Confirmado' };
const MODALIDAD: Record<string, string> = { presencial: 'Presencial', videollamada: 'Videollamada', llamada: 'Llamada' };

// Mentorías donde la persona es mentor, discípulo o parte del grupo. Si no tiene Discipulado
// o la base de datos aún no lo tiene, devuelve una lista vacía y el calendario sigue como antes.
async function mentoriasDe(perfil: string, desde: string) {
  const acc = await sb.from('modulos_acceso').select('rol').eq('perfil_id', perfil).eq('modulo', 'discipulado').maybeSingle();
  if (acc.error || !acc.data) return [];
  const { data: rel } = await sb.from('disc_discipulos').select('mentor_id').eq('discipulo_id', perfil).maybeSingle();
  const filtro = [`mentor_id.eq.${perfil}`, `discipulo_id.eq.${perfil}`];
  if (rel?.mentor_id) filtro.push(`and(mentor_id.eq.${rel.mentor_id},discipulo_id.is.null)`);
  const { data, error } = await sb.from('disc_mentorias')
    .select('id, mentor_id, discipulo_id, inicio, duracion_min, modalidad, lugar, tema, estado, mentor:profiles!disc_mentorias_mentor_id_fkey(nombre), disc:profiles!disc_mentorias_discipulo_id_fkey(nombre), asis:disc_asistencia(perfil_id, estado)')
    .or(filtro.join(',')).neq('estado', 'cancelada').gte('inicio', desde);
  if (error) return [];
  // si la persona avisó que no puede, no se muestra
  return (data ?? []).filter((m: any) => !(m.asis ?? []).some((a: any) => a.perfil_id === perfil && a.estado === 'no_puedo'));
}

const txt = (s: string) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const fecha = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
// Las líneas de un .ics no pueden pasar de 75 bytes: se parten y siguen con un espacio
function plegar(linea: string) {
  const enc = new TextEncoder();
  if (enc.encode(linea).length <= 75) return linea;
  const out: string[] = [];
  let actual = '', bytes = 0, limite = 75;
  for (const ch of linea) {
    const b = enc.encode(ch).length;
    if (bytes + b > limite) { out.push(actual); actual = ' '; bytes = 1; limite = 75; }
    actual += ch; bytes += b;
  }
  out.push(actual);
  return out.join('\r\n');
}

Deno.serve(async (req) => {
  const t = new URL(req.url).searchParams.get('t') || '';
  if (!/^[0-9a-f-]{36}$/i.test(t)) return new Response('Link no válido', { status: 404 });
  const { data: tok } = await sb.from('calendario_tokens').select('perfil_id').eq('token', t).maybeSingle();
  if (!tok) return new Response('Link no válido o cambiado', { status: 404 });

  const desde = new Date(Date.now() - 60 * 86400e3).toISOString();
  const { data, error } = await sb.from('asignaciones')
    .select('rol, estado, dirige, setlist:setlists!inner(id, titulo, fecha, ensayo_fecha, lugar, notas, te:tipos_evento(nombre, emoji), setlist_items(orden, tono, cantante_id, cancion:canciones(titulo, tono_original)))')
    .eq('perfil_id', tok.perfil_id).neq('estado', 'rechazado').gte('setlist.fecha', desde);
  if (error) return new Response('Error: ' + error.message, { status: 500 });

  // agrupar por día (una persona puede tener varios roles el mismo día)
  const dias = new Map<string, { s: any; asig: any[] }>();
  for (const a of data ?? []) {
    const s = (a as any).setlist;
    if (!s) continue;
    const d = dias.get(s.id) ?? { s, asig: [] };
    d.asig.push(a); dias.set(s.id, d);
  }

  // Mentorías de Discipulado (si la persona tiene ese módulo y ya se ejecutó 015)
  const mentorias = await mentoriasDe(tok.perfil_id, desde);

  const ahora = fecha(new Date());
  const L: string[] = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Alabanza RDV//Mis dias//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${mentorias.length ? 'Arpas' : 'Alabanza RDV'} · Mis días`, 'X-WR-TIMEZONE:America/Panama',
    'REFRESH-INTERVAL;VALUE=DURATION:PT2H', 'X-PUBLISHED-TTL:PT2H',
  ];
  for (const { s, asig } of dias.values()) {
    const roles = asig.map((a) => (ROLES[a.rol] ?? a.rol) + (a.dirige ? ' (dirige)' : '')).join(', ');
    const sinConfirmar = asig.some((a) => a.estado !== 'confirmado');
    const estado = ESTADO[asig.find((a) => a.estado !== 'confirmado')?.estado ?? 'confirmado'];
    const emoji = s.te?.emoji ?? '📅';
    const items = (s.setlist_items ?? []).filter((i: any) => i.cancion).sort((a: any, b: any) => a.orden - b.orden);
    const rep = items.map((i: any, k: number) => `${k + 1}. ${i.cancion.titulo}${(i.tono || i.cancion.tono_original) ? ` (${i.tono || i.cancion.tono_original})` : ''}${i.cantante_id === tok.perfil_id ? ' · la cantas tú' : ''}`).join('\n');
    const desc = [`Te toca: ${roles}`, `Estado: ${estado}`, s.notas ? `\n${s.notas}` : '', rep ? `\nRepertorio:\n${rep}` : '', `\nAbrir en la app: ${APP}#/dia/${s.id}`].filter(Boolean).join('\n');
    const evento = (uid: string, ini: Date, min: number, titulo: string) => {
      L.push('BEGIN:VEVENT', `UID:${uid}@alabanza-rdv`, `DTSTAMP:${ahora}`, `DTSTART:${fecha(ini)}`,
        `DTEND:${fecha(new Date(ini.getTime() + min * 60e3))}`, `SUMMARY:${txt(titulo)}`, `DESCRIPTION:${txt(desc)}`,
        `URL:${APP}#/dia/${s.id}`);
      if (s.lugar) L.push(`LOCATION:${txt(s.lugar)}`);
      L.push(`STATUS:${sinConfirmar ? 'TENTATIVE' : 'CONFIRMED'}`,
        'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${txt(titulo)}`, 'TRIGGER:-PT2H', 'END:VALARM', 'END:VEVENT');
    };
    evento(`dia-${s.id}`, new Date(s.fecha), 120, `${sinConfirmar ? '⏳ ' : ''}${emoji} ${s.titulo} · ${roles}`);
    if (s.ensayo_fecha) evento(`ensayo-${s.id}`, new Date(s.ensayo_fecha), 90, `🎹 Ensayo · ${s.titulo} · ${roles}`);
  }
  for (const m of mentorias) {
    const soyMentor = m.mentor_id === tok.perfil_id;
    const con = soyMentor ? (m.discipulo_id ? `con ${m.disc?.nombre ?? 'tu discípulo'}` : 'con tu grupo') : (m.discipulo_id ? `con ${m.mentor?.nombre ?? 'tu mentor'}` : `con ${m.mentor?.nombre ?? 'tu mentor'} y el grupo`);
    const propuesta = m.estado === 'propuesta';
    const titulo = `${propuesta ? '⏳ ' : ''}🤝 Mentoría ${con}`;
    const desc = [m.tema ? `Tema: ${m.tema}` : '', `Modalidad: ${MODALIDAD[m.modalidad] ?? m.modalidad}`, propuesta ? 'Estado: propuesta (falta que el mentor la acepte)' : '', `\nAbrir en la app: ${APP}#/d/mentorias`].filter(Boolean).join('\n');
    const ini = new Date(m.inicio);
    L.push('BEGIN:VEVENT', `UID:mentoria-${m.id}@alabanza-rdv`, `DTSTAMP:${ahora}`, `DTSTART:${fecha(ini)}`,
      `DTEND:${fecha(new Date(ini.getTime() + (m.duracion_min ?? 60) * 60e3))}`, `SUMMARY:${txt(titulo)}`, `DESCRIPTION:${txt(desc)}`,
      `URL:${APP}#/d/mentorias`);
    if (m.lugar) L.push(`LOCATION:${txt(m.lugar)}`);
    L.push(`STATUS:${propuesta ? 'TENTATIVE' : 'CONFIRMED'}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${txt(titulo)}`, 'TRIGGER:-PT1H', 'END:VALARM', 'END:VEVENT');
  }
  L.push('END:VCALENDAR');

  return new Response(L.map(plegar).join('\r\n') + '\r\n', {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'public, max-age=900', 'Content-Disposition': 'inline; filename="alabanza-rdv.ics"' },
  });
});
