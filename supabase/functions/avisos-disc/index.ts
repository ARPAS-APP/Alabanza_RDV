// Edge Function "avisos-disc": notificaciones al celular del módulo Discipulado.
// La llaman la base de datos (disparadores y tareas programadas de 018_disc_notificaciones.sql).
// Publicar con "Verify JWT" DESACTIVADO: la seguridad es el encabezado x-push-secret.
// Usa los mismos secretos que la función "push" de Alabanza:
//   PUSH_SECRET, VAPID_PRIVATE_KEY (y opcional VAPID_PUBLIC_KEY, VAPID_SUBJECT).
import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const APP = 'https://arpas-app.github.io/Alabanza_RDV/';
const VAPID_PUBLICA = Deno.env.get('VAPID_PUBLIC_KEY') ??
  'BOHwraN8Z-aNWAiJPGb6MIKVaJu_lZ5TwvKDrZLXlp44rhwZFesC6-6bUa0_7dM8fZ3N2xyx1rfBBTmYMvhsYRI';
const VAPID_PRIVADA = Deno.env.get('VAPID_PRIVATE_KEY') ?? Deno.env.get('VAPID_PRIVADA') ?? '';
webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:yanisgabriela12@gmail.com', VAPID_PUBLICA, VAPID_PRIVADA);

// Preferencias (profiles.notif); si no hay valor guardado, vale lo de aquí
const DEF: Record<string, boolean> = { d_devocional: true, d_mentoria: true, d_respuestas: true, d_racha: true, d_mentor: true, d_solicitudes: true };
const TZ = 'America/Panama';
const hoyPa = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const hora = (iso: string) => new Date(iso).toLocaleString('es-PA', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const corto = (t: string, n = 90) => (t.length > n ? t.slice(0, n - 1) + '…' : t);
const primer = (n?: string | null) => (n || 'Alguien').split(' ')[0];

type Aviso = { title: string; body: string; url: string; tag?: string };

/** Envía un aviso a varias personas, respetando su preferencia y que sigan en Discipulado. */
async function enviar(perfiles: string[], pref: string, aviso: Aviso, clave?: string) {
  const ids = [...new Set(perfiles.filter(Boolean))];
  if (!ids.length) return 0;
  // Un mismo aviso programado no se repite (push_enviados es la tabla de Alabanza)
  if (clave) {
    const { error } = await sb.from('push_enviados').insert({ clave });
    if (error) return 0;
  }
  const [{ data: perfs }, { data: acc }, { data: subs }] = await Promise.all([
    sb.from('profiles').select('id, notif, estado').in('id', ids),
    sb.from('modulos_acceso').select('perfil_id').eq('modulo', 'discipulado').in('perfil_id', ids),
    sb.from('push_suscripciones').select('id, perfil_id, endpoint, p256dh, auth').in('perfil_id', ids),
  ]);
  const enDisc = new Set((acc ?? []).map((a: any) => a.perfil_id));
  const quiere = new Set((perfs ?? []).filter((p: any) => p.estado === 'aprobado' && enDisc.has(p.id) && ((p.notif ?? {})[pref] ?? DEF[pref])).map((p: any) => p.id));
  const carga = JSON.stringify({ ...aviso, url: APP + aviso.url });
  let n = 0;
  await Promise.all((subs ?? []).filter((s: any) => quiere.has(s.perfil_id)).map(async (s: any) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, carga, { TTL: 3600 * 12 });
      n++;
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) await sb.from('push_suscripciones').delete().eq('id', s.id);
      else console.error('push', e?.statusCode, e?.body);
    }
  }));
  return n;
}

const nombres = async (ids: string[]) => {
  const { data } = await sb.from('profiles').select('id, nombre').in('id', [...new Set(ids.filter(Boolean))]);
  return new Map((data ?? []).map((p: any) => [p.id, p.nombre as string]));
};
const discipulosDe = async (mentor: string) =>
  ((await sb.from('disc_discipulos').select('discipulo_id').eq('mentor_id', mentor)).data ?? []).map((r: any) => r.discipulo_id);
const mentorDe = async (p: string) =>
  (await sb.from('disc_discipulos').select('mentor_id').eq('discipulo_id', p).maybeSingle()).data?.mentor_id as string | undefined;

// ---------------------------------------------------------------------
async function mentoria(id: string, op: string, antes: any, quien: string | null) {
  const { data: m } = await sb.from('disc_mentorias').select('*').eq('id', id).maybeSingle();
  if (!m) return 0;
  const participantes = m.discipulo_id ? [m.discipulo_id] : await discipulosDe(m.mentor_id);
  const nom = await nombres([m.mentor_id, m.discipulo_id]);
  const cuando = hora(m.inicio);
  const url = '#/d/mentorias';
  // Propuesta del discípulo → al mentor
  if (m.estado === 'propuesta' && op === 'INSERT')
    return enviar([m.mentor_id], 'd_mentor', { title: '📅 Te propusieron una mentoría', body: `${primer(nom.get(m.discipulo_id))} propone ${cuando}. Acéptala o cámbiala.`, url, tag: 'ment-' + id });
  // Propuesta aceptada → al discípulo
  if (antes?.estado === 'propuesta' && m.estado === 'agendada')
    return enviar([m.discipulo_id], 'd_mentoria', { title: '🤝 Mentoría confirmada', body: `${primer(nom.get(m.mentor_id))} aceptó: ${cuando}.`, url, tag: 'ment-' + id });
  if (m.estado === 'cancelada') {
    const avisar = quien === m.mentor_id ? participantes : [m.mentor_id];
    return enviar(avisar, quien === m.mentor_id ? 'd_mentoria' : 'd_mentor', { title: '❌ Mentoría cancelada', body: `Se canceló la mentoría del ${cuando}.`, url, tag: 'ment-' + id });
  }
  if (m.estado === 'agendada' && op === 'INSERT')
    return enviar(participantes, 'd_mentoria', { title: '🤝 Nueva mentoría', body: `${primer(nom.get(m.mentor_id))} agendó ${m.discipulo_id ? 'una mentoría contigo' : 'una mentoría con el grupo'}: ${cuando}${m.tema ? ' · ' + m.tema : ''}.`, url, tag: 'ment-' + id });
  if (m.estado === 'agendada' && antes && antes.inicio !== m.inicio)
    return enviar(participantes, 'd_mentoria', { title: '🕒 Cambió la mentoría', body: `Nueva fecha: ${cuando}.`, url, tag: 'ment-' + id });
  return 0;
}

async function mentoriasPronto() {
  const desde = new Date(Date.now() + 90 * 60e3).toISOString(), hasta = new Date(Date.now() + 150 * 60e3).toISOString();
  const { data } = await sb.from('disc_mentorias').select('*').eq('estado', 'agendada').gte('inicio', desde).lt('inicio', hasta);
  let n = 0;
  for (const m of data ?? []) {
    const participantes = m.discipulo_id ? [m.discipulo_id] : await discipulosDe(m.mentor_id);
    const { data: no } = await sb.from('disc_asistencia').select('perfil_id').eq('mentoria_id', m.id).eq('estado', 'no_puedo');
    const fuera = new Set((no ?? []).map((a: any) => a.perfil_id));
    const lugar = m.lugar ? ` · ${m.lugar}` : '';
    n += await enviar([m.mentor_id, ...participantes.filter((p: string) => !fuera.has(p))], 'd_mentoria',
      { title: '⏰ Mentoría en 2 horas', body: `${hora(m.inicio)}${lugar}${m.tema ? ' · ' + m.tema : ''}`, url: '#/d/mentorias', tag: 'ment-' + m.id }, `disc-pronto-${m.id}`);
  }
  return n;
}

async function comentario(id: string) {
  const { data: c } = await sb.from('disc_comentarios').select('id, post_id, autor_id, texto').eq('id', id).maybeSingle();
  if (!c) return 0;
  const { data: p } = await sb.from('disc_posts').select('id, autor_id, tipo, anonimo').eq('id', c.post_id).maybeSingle();
  if (!p || p.autor_id === c.autor_id) return 0;
  const nom = await nombres([c.autor_id]);
  const pregunta = p.tipo === 'pregunta';
  return enviar([p.autor_id], 'd_respuestas', {
    title: pregunta ? '❓ Respondieron tu pregunta' : '💬 Comentaron tu publicación',
    body: `${primer(nom.get(c.autor_id))}: ${corto(c.texto)}`, url: '#/d/muro', tag: 'post-' + p.id,
  });
}

async function post(id: string) {
  const { data: p } = await sb.from('disc_posts').select('*').eq('id', id).maybeSingle();
  if (!p) return 0;
  const nom = await nombres([p.autor_id]);
  // Compartido solo con el mentor → al mentor
  if (p.visibilidad === 'mentor') {
    const mentor = await mentorDe(p.autor_id);
    const ico = p.tipo === 'oracion' ? '🙏' : p.tipo === 'pregunta' ? '❓' : '🤝';
    return enviar([mentor!], 'd_mentor', { title: `${ico} ${primer(nom.get(p.autor_id))} te compartió algo`, body: corto(p.texto), url: '#/d/muro', tag: 'post-' + id });
  }
  // Pregunta en un grupo → al mentor que encabeza el grupo (si no es quien preguntó)
  if (p.tipo === 'pregunta' && p.visibilidad === 'grupo' && p.grupo_id && p.grupo_id !== p.autor_id) {
    const quien = p.anonimo ? 'Alguien de tu grupo' : primer(nom.get(p.autor_id));
    return enviar([p.grupo_id], 'd_mentor', { title: '❓ Pregunta nueva en tu grupo', body: `${quien}: ${corto(p.texto)}`, url: '#/d/muro', tag: 'post-' + id });
  }
  return 0;
}

async function quienesAdministran() {
  const [{ data: admins }, { data: pastores }] = await Promise.all([
    sb.from('profiles').select('id').eq('rol', 'admin').eq('estado', 'aprobado'),
    sb.from('modulos_acceso').select('perfil_id').eq('modulo', 'discipulado').eq('rol', 'pastor'),
  ]);
  return [...(admins ?? []).map((a: any) => a.id), ...(pastores ?? []).map((a: any) => a.perfil_id)];
}

async function solicitud(id: string) {
  const { data: p } = await sb.from('profiles').select('nombre, invitado_por, estado').eq('id', id).maybeSingle();
  if (!p || p.estado !== 'pendiente') return 0;
  // Si se registró con el link de un mentor, le llega solo a ese mentor
  if (p.invitado_por) {
    return enviar([p.invitado_por], 'd_solicitudes', { title: '🌱 Quiere ser tu discípulo', body: `${p.nombre ?? 'Alguien'} se registró con tu link. Apruébalo en Mis discípulos.`, url: '#/d/discipulos', tag: 'sol-' + id });
  }
  return enviar(await quienesAdministran(), 'd_solicitudes', { title: '🔑 Solicitud de acceso', body: `${p.nombre ?? 'Alguien'} quiere entrar a Discipulado.`, url: '#/d/personas', tag: 'sol-' + id });
}

async function aprobado(id: string, mentor: string) {
  const { data: ps } = await sb.from('profiles').select('id, nombre').in('id', [id, mentor]);
  const nom = (x: string) => (ps ?? []).find((p: any) => p.id === x)?.nombre ?? 'Alguien';
  const ids = (await quienesAdministran()).filter(x => x !== mentor);
  return enviar(ids, 'd_solicitudes', { title: '✅ Nuevo discípulo', body: `${primer(nom(mentor))} aprobó a ${nom(id)} como su discípulo.`, url: '#/d/inicio', tag: 'apr-' + id });
}

async function devocionalDeHoy() {
  const hoy = hoyPa();
  const { data: d } = await sb.from('disc_devocionales').select('titulo, pasaje_ref').eq('fecha', hoy).maybeSingle();
  if (!d) return 0;
  const { data: acc } = await sb.from('modulos_acceso').select('perfil_id').eq('modulo', 'discipulado');
  return enviar((acc ?? []).map((a: any) => a.perfil_id), 'd_devocional',
    { title: '📖 Tu devocional de hoy', body: `${d.titulo}${d.pasaje_ref ? ' · ' + d.pasaje_ref : ''}`, url: '#/d/devocional', tag: 'dev-' + hoy }, `disc-dev-${hoy}`);
}

async function racha() {
  const hoy = hoyPa();
  const { data: d } = await sb.from('disc_devocionales').select('id').eq('fecha', hoy).maybeSingle();
  if (!d) return 0;
  const [{ data: acc }, { data: hechos }, { data: ayer }] = await Promise.all([
    sb.from('modulos_acceso').select('perfil_id').eq('modulo', 'discipulado'),
    sb.from('disc_respuestas').select('autor_id').eq('devocional_id', d.id),
    // Solo a quien tiene racha: respondió el devocional publicado anterior
    sb.from('disc_devocionales').select('id').lt('fecha', hoy).order('fecha', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!ayer) return 0;
  const { data: conRacha } = await sb.from('disc_respuestas').select('autor_id').eq('devocional_id', ayer.id);
  const ya = new Set((hechos ?? []).map((r: any) => r.autor_id));
  const racha = new Set((conRacha ?? []).map((r: any) => r.autor_id));
  const ids = (acc ?? []).map((a: any) => a.perfil_id).filter((p: string) => racha.has(p) && !ya.has(p));
  return enviar(ids, 'd_racha', { title: '🔥 No pierdas tu racha', body: 'Todavía tienes tiempo para el devocional de hoy.', url: '#/d/devocional', tag: 'racha-' + hoy }, `disc-racha-${hoy}`);
}

// ---------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.headers.get('x-push-secret') !== Deno.env.get('PUSH_SECRET')) return new Response('No autorizado', { status: 401 });
  if (!VAPID_PRIVADA) return new Response('Falta el secreto VAPID_PRIVATE_KEY', { status: 500 });
  let b: any = {};
  try { b = await req.json(); } catch {}
  try {
    let n = 0;
    switch (b.tipo) {
      case 'mentoria': n = await mentoria(b.id, b.op, b.antes, b.quien ?? null); break;
      case 'mentoria_pronto': n = await mentoriasPronto(); break;
      case 'comentario': n = await comentario(b.id); break;
      case 'post': n = await post(b.id); break;
      case 'solicitud': n = await solicitud(b.id); break;
      case 'aprobado': n = await aprobado(b.id, b.mentor); break;
      case 'devocional': n = await devocionalDeHoy(); break;
      case 'racha': n = await racha(); break;
      default: return new Response('Tipo desconocido', { status: 400 });
    }
    return Response.json({ enviados: n });
  } catch (e) {
    console.error(e);
    return new Response('Error: ' + (e as Error).message, { status: 500 });
  }
});
