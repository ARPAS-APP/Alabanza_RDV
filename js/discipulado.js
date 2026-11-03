// =====================================================================
// MÓDULO DISCIPULADO
// Devocionales, muro, retos, mentorías, panel del mentor y gestión del pastor.
// La privacidad la aplica la base de datos (supabase/015_modulos_discipulado.sql):
// aquí solo se pide lo que cada persona puede ver.
// =====================================================================

const VIS = {
  yo:        { ico: '🔒', txt: 'Solo yo',    sub: 'Privado' },
  mentor:    { ico: '🤝', txt: 'Mi mentor',  sub: 'Solo tu mentor' },
  grupo:     { ico: '👥', txt: 'Mi grupo',   sub: 'Tu mentor y el grupo' },
  comunidad: { ico: '🌍', txt: 'Comunidad',  sub: 'Todos en Discipulado' },
};
const TIPOS_POST = {
  reflexion:  { ico: '💭', txt: 'Reflexión' },
  testimonio: { ico: '✨', txt: 'Testimonio' },
  oracion:    { ico: '🙏', txt: 'Petición de oración' },
  versiculo:  { ico: '📖', txt: 'Versículo' },
  anuncio:    { ico: '📣', txt: 'Anuncio' },
  logro:      { ico: '🏅', txt: 'Logro' },
};
const ROLES_D = { discipulo: 'Discípulo', mentor: 'Mentor', pastor: 'Mentor (administra)' };
const ROLES_D_PL = { discipulo: 'Discípulos', mentor: 'Mentores', pastor: 'Mentores que administran' };
const MODALIDAD = { presencial: '📍 Presencial', videollamada: '💻 Videollamada', llamada: '📞 Llamada' };
const DIAS_SEM = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const TZ = 'America/Panama';

export function crearDiscipulado(api) {
  const { sb, st, app, $, esc, toast, fallo, abrirModal, cerrarModal, ocupado, encabezado, iniciales, nombreDe, haceCuanto } = api;

  // ---------- utilidades ----------
  const rol = () => api.discRol();
  const esPastor = () => rol() === 'pastor';
  const fechaPa = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);   // YYYY-MM-DD
  const sumarDias = (f, n) => { const d = new Date(f + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const fechaTxt = (f, opt = { weekday: 'long', day: 'numeric', month: 'long' }) => new Date(f + 'T12:00:00Z').toLocaleDateString('es-PA', { ...opt, timeZone: 'UTC' });
  const horaTxt = iso => new Date(iso).toLocaleTimeString('es-PA', { hour: 'numeric', minute: '2-digit' });
  const diaTxt = iso => new Date(iso).toLocaleDateString('es-PA', { weekday: 'short', day: 'numeric', month: 'short' });
  const aLocal = iso => { const d = new Date(iso); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
  const haceDias = f => {
    if (!f) return 'nunca';
    const n = Math.round((new Date(fechaPa() + 'T12:00:00Z') - new Date(f + 'T12:00:00Z')) / 86400e3);
    return n <= 0 ? 'hoy' : n === 1 ? 'ayer' : `hace ${n} días`;
  };
  const parrafos = t => esc(t || '').split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
  const avatar = (id, cls = '') => `<span class="avatar sm d-av ${cls}">${esc(iniciales(nombreDe(id)))}</span>`;
  const vacio = (ico, txt) => `<div class="vacio"><span class="grande">${ico}</span>${txt}</div>`;
  const esc1 = s => esc(s).replace(/\n/g, '<br>');

  // Estructura: quién es mentor de quién (se guarda un minuto)
  let est = null, estT = 0;
  async function estructura(forzar = false) {
    if (est && !forzar && Date.now() - estT < 60e3) return est;
    const { data, error } = await api.conCache('disc:estructura', sb.from('disc_discipulos').select('discipulo_id, mentor_id'));
    if (error) { fallo(error, 'Discipulado'); return est || { mentorDe: new Map(), discipulosDe: new Map() }; }
    const mentorDe = new Map(), discipulosDe = new Map();
    for (const r of data || []) {
      mentorDe.set(r.discipulo_id, r.mentor_id);
      (discipulosDe.get(r.mentor_id) || discipulosDe.set(r.mentor_id, []).get(r.mentor_id)).push(r.discipulo_id);
    }
    est = { mentorDe, discipulosDe }; estT = Date.now();
    return est;
  }
  const miMentor = e => e.mentorDe.get(st.uid) || null;
  const misDiscipulos = e => e.discipulosDe.get(st.uid) || [];
  // Un mentor también puede ser discípulo: entonces tiene dos grupos posibles
  const primer = id => nombreDe(id).split(' ')[0];
  const gruposDe = e => [
    ...(misDiscipulos(e).length ? [{ id: st.uid, txt: 'Mis discípulos', sub: 'Tú y tu grupo' }] : []),
    ...(miMentor(e) ? [{ id: miMentor(e), txt: misDiscipulos(e).length ? `Grupo de ${primer(miMentor(e))}` : 'Mi grupo', sub: `${primer(miMentor(e))} y su grupo` }] : []),
  ];
  const visDe = r => r.visibilidad === 'grupo'
    ? { ico: '👥', txt: r.grupo_id === st.uid ? 'Mis discípulos' : `Grupo de ${primer(r.grupo_id)}` } : VIS[r.visibilidad];
  // Botones de "¿Quién puede verlo?": claves yo | mentor | grupo:<id> | comunidad
  const opcionesVis = (e, claves) => {
    const out = [];
    for (const k of claves) {
      if (k === 'grupo') {
        const gs = gruposDe(e);
        if (!gs.length) out.push({ k: 'grupo', ico: '👥', txt: 'Mi grupo', sub: 'Aún no tienes grupo', off: true });
        gs.forEach(g => out.push({ k: 'grupo:' + g.id, ico: '👥', txt: g.txt, sub: g.sub }));
      } else out.push({ k, ...VIS[k], ...(k === 'mentor' && !miMentor(e) ? { sub: 'Aún no tienes mentor', off: true } : {}) });
    }
    return out;
  };
  const botonesVis = (ops, sel) => ops.map(o => `<button type="button" data-vis="${o.k}" class="${o.k === sel ? 'activo' : ''}" ${o.off ? 'disabled' : ''} aria-pressed="${o.k === sel}"><b>${o.ico} ${esc(o.txt)}</b><small>${esc(o.sub)}</small></button>`).join('');
  const partirVis = k => k.startsWith('grupo:') ? { visibilidad: 'grupo', grupo_id: k.slice(6) } : { visibilidad: k, grupo_id: null };
  const miembrosDisc = () => [...st.perfiles.values()].filter(p => p.estado === 'aprobado' && st.modsDe.get(p.id)?.discipulado);

  function cab(titulo, opts = {}) { return encabezado(titulo, opts); }
  function cargando(titulo, opts) { app.innerHTML = cab(titulo, opts) + '<div class="spinner"></div>'; }

  // ===================================================================
  // INICIO
  // ===================================================================
  async function vistaInicio(ctx) {
    const nombre = (st.perfil?.nombre || '').split(' ')[0];
    cargando(`Hola, ${nombre}`, { sub: fechaTxt(fechaPa()) });
    const hoyF = fechaPa();
    const lunes = sumarDias(hoyF, -((new Date(hoyF + 'T12:00:00Z').getUTCDay() + 6) % 7));
    const e = await estructura();
    const [racha, devs, resp, prox, retos, resumen] = await Promise.all([
      sb.rpc('disc_racha').then(r => r.data?.[0] || { actual: 0, maxima: 0 }),
      sb.from('disc_devocionales').select('id, fecha, titulo, pasaje_ref, serie').gte('fecha', lunes).lte('fecha', hoyF),
      sb.from('disc_respuestas').select('devocional_id').eq('autor_id', st.uid),
      sb.from('disc_mentorias').select('*').eq('estado', 'agendada').gte('inicio', new Date(Date.now() - 2 * 3600e3).toISOString()).order('inicio').limit(1),
      sb.from('disc_retos_part').select('reto_id, inicio, completado_at, reto:disc_retos(titulo, dias), marcas:disc_retos_marcas(fecha)').eq('perfil_id', st.uid).is('completado_at', null),
      misDiscipulos(e).length ? sb.rpc('disc_resumen') : Promise.resolve({ data: [] }),
    ]);
    if (!ctx.vigente()) return;
    if (devs.error) return falta(devs.error);
    const hechos = new Set((resp.data || []).map(r => r.devocional_id));
    const devHoy = (devs.data || []).find(d => d.fecha === hoyF);
    const porFecha = new Map((devs.data || []).map(d => [d.fecha, d]));
    const semana = DIAS_SEM.map((l, i) => {
      const f = sumarDias(lunes, i), d = porFecha.get(f);
      let c = 'futuro';
      if (f < hoyF) c = d ? (hechos.has(d.id) ? 'hecho' : 'perdido') : 'sin';
      else if (f === hoyF) c = d ? (hechos.has(d.id) ? 'hecho' : 'hoy') : 'sin';
      return `<div class="d-dia"><span>${l}</span><i class="${c}" title="${esc(fechaTxt(f, { weekday: 'long', day: 'numeric' }))}"></i></div>`;
    }).join('');
    const reto = (retos.data || [])[0];
    const m = (prox.data || [])[0];
    const atencion = (resumen.data || []).filter(r => !r.ultimo || r.ultimo < sumarDias(hoyF, -6)).length;
    const pendientes = (api.esAdmin() || esPastor()) ? [...st.perfiles.values()].filter(p => p.estado === 'pendiente').length : 0;

    app.innerHTML = cab(`Hola, ${nombre}`, { sub: fechaTxt(hoyF) }) + `
      ${pendientes ? `<a class="card d-aviso" href="#/d/personas"><b>🔑 ${pendientes} ${pendientes === 1 ? 'solicitud' : 'solicitudes'} de acceso</b><span>Revísalas cuando hayas conversado con cada persona ›</span></a>` : ''}
      <div class="d-hero">
        <div class="d-racha"><span class="d-fuego">🔥</span><div><b>${racha.actual} ${racha.actual === 1 ? 'día seguido' : 'días seguidos'}</b><small>Tu racha de devocionales${racha.maxima > racha.actual ? ` · récord ${racha.maxima}` : ''}</small></div></div>
        <div class="d-semana">${semana}</div>
      </div>
      ${devHoy ? `<a class="card d-dev" href="#/d/devocional">
          <span class="d-eti">Devocional de hoy${devHoy.serie ? ' · ' + esc(devHoy.serie) : ''}</span>
          <h2>${esc(devHoy.titulo)}</h2>
          ${devHoy.pasaje_ref ? `<span class="d-ref">${esc(devHoy.pasaje_ref)}</span>` : ''}
          <span class="btn prim blk">${hechos.has(devHoy.id) ? '✓ Completado · ver de nuevo' : 'Empezar devocional'}</span>
        </a>` : `<div class="card d-dev"><span class="d-eti">Devocional de hoy</span><p class="ayuda" style="margin:6px 0 0">Hoy no hay devocional publicado.${esPastor() ? ' <a href="#/d/gestion">Publicar uno ›</a>' : ' Puedes repasar los anteriores en la pestaña Devocional.'}</p></div>`}
      <div class="d-par">
        <a class="card d-mini" href="#/d/mentorias">
          <span class="d-mini-ico">🤝</span><small>Próxima mentoría</small>
          ${m ? `<b>${esc(diaTxt(m.inicio))} · ${esc(horaTxt(m.inicio))}</b><small>${m.mentor_id === st.uid ? (m.discipulo_id ? 'con ' + esc(nombreDe(m.discipulo_id)) : 'con tu grupo') : 'con ' + esc(nombreDe(m.mentor_id))}</small>` : '<b>Sin agendar</b><small>Agenda o propón una fecha</small>'}
        </a>
        <a class="card d-mini d-mini-reto" href="#/d/retos">
          <span class="d-mini-ico">🎯</span><small>Reto activo</small>
          ${reto ? `<b>${esc(reto.reto?.titulo || '')}</b>${barra(reto.marcas.length, reto.reto?.dias || 1)}<small>${reto.marcas.length} de ${reto.reto?.dias} días</small>` : '<b>Ninguno</b><small>Elige un reto nuevo</small>'}
        </a>
      </div>
      ${misDiscipulos(e).length ? `<a class="item d-fila" href="#/d/discipulos"><span class="d-mini-ico">🌱</span><div class="info"><b>Mis discípulos (${misDiscipulos(e).length})</b><small>${atencion ? `${atencion} ${atencion === 1 ? 'necesita' : 'necesitan'} atención` : 'Todos al día'}</small></div>›</a>` : ''}
      ${esPastor() ? `<a class="item d-fila" href="#/d/gestion"><span class="d-mini-ico">🛠️</span><div class="info"><b>Gestionar Discipulado</b><small>Devocionales, retos y personas</small></div>›</a>` : ''}
      ${!miMentor(e) && !misDiscipulos(e).length && !esPastor() ? '<p class="ayuda" style="text-align:center">Todavía no tienes mentor asignado. El pastor te lo asignará pronto.</p>' : ''}`;
  }

  const barra = (n, total) => `<div class="d-barra"><i style="width:${Math.min(100, Math.round(100 * n / Math.max(1, total)))}%"></i></div>`;

  function falta(error) {
    if (/disc_|relation|does not exist|PGRST20/i.test((error?.message || '') + (error?.code || ''))) {
      app.innerHTML = cab('Discipulado') + `<div class="card"><p style="margin:0">Falta activar Discipulado en la base de datos.</p>
        <p class="ayuda">Un administrador debe ejecutar <b>supabase/015_modulos_discipulado.sql</b> en Supabase → SQL Editor.</p></div>`;
    } else fallo(error, 'Discipulado');
  }

  // ===================================================================
  // DEVOCIONAL
  // ===================================================================
  async function vistaDevocional(ctx) {
    cargando('Devocional');
    const e = await estructura();
    const hoyF = fechaPa();
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(ctx.partes[1] || '') ? ctx.partes[1] : hoyF;
    const [{ data: dev, error }, { data: lista }] = await Promise.all([
      sb.from('disc_devocionales').select('*').eq('fecha', fecha).maybeSingle(),
      sb.from('disc_devocionales').select('id, fecha, titulo').lte('fecha', hoyF).order('fecha', { ascending: false }).limit(30),
    ]);
    if (!ctx.vigente()) return;
    if (error) return falta(error);
    const ids = (lista || []).map(d => d.id);
    const { data: mias } = ids.length ? await sb.from('disc_respuestas').select('devocional_id').eq('autor_id', st.uid).in('devocional_id', ids) : { data: [] };
    const hechos = new Set((mias || []).map(r => r.devocional_id));
    const otros = (lista || []).filter(d => d.fecha !== fecha);
    const listaHtml = otros.length ? `<div class="seccion-t">Anteriores</div><div class="lista">${otros.map(d => `
      <a class="item" href="#/d/devocional/${d.fecha}"><span class="d-chk ${hechos.has(d.id) ? 'si' : ''}">${hechos.has(d.id) ? '✓' : ''}</span>
      <div class="info"><b>${esc(d.titulo)}</b><small>${esc(fechaTxt(d.fecha, { weekday: 'short', day: 'numeric', month: 'short' }))}</small></div>›</a>`).join('')}</div>` : '';

    if (!dev) {
      app.innerHTML = cab('Devocional', { atras: fecha !== hoyF ? '#/d/devocional' : null }) + `
        <div class="card">${fecha === hoyF ? 'Hoy no hay devocional publicado.' : 'No hay devocional en esa fecha.'}
        ${esPastor() ? '<a class="btn prim blk" href="#/d/gestion">Publicar devocional</a>' : ''}</div>${listaHtml}`;
      return;
    }

    const [{ data: mia }, { data: compartidas }] = await Promise.all([
      sb.from('disc_respuestas').select('*').eq('devocional_id', dev.id).eq('autor_id', st.uid).maybeSingle(),
      sb.from('disc_respuestas').select('id, autor_id, texto, visibilidad, grupo_id, created_at').eq('devocional_id', dev.id).neq('autor_id', st.uid).order('created_at'),
    ]);
    if (!ctx.vigente()) return;
    const mentor = miMentor(e);
    const ops = opcionesVis(e, ['yo', 'mentor', 'grupo', 'comunidad']);
    let vis = mia ? (mia.visibilidad === 'grupo' ? 'grupo:' + mia.grupo_id : mia.visibilidad) : (mentor ? 'mentor' : 'yo');
    if (!ops.some(o => o.k === vis && !o.off)) vis = 'yo';

    app.innerHTML = cab(dev.titulo, { sub: (dev.serie ? dev.serie + ' · ' : '') + fechaTxt(dev.fecha, { weekday: 'long', day: 'numeric', month: 'short' }), atras: fecha !== hoyF ? '#/d/devocional' : null }) + `
      ${dev.pasaje_texto || dev.pasaje_ref ? `<div class="d-hero d-pasaje"><span class="d-eti">Lee</span>${dev.pasaje_texto ? `<blockquote>${esc1(dev.pasaje_texto)}</blockquote>` : ''}${dev.pasaje_ref ? `<small>${esc(dev.pasaje_ref)}</small>` : ''}</div>` : ''}
      ${dev.reflexion ? `<div class="card d-bloque"><span class="d-eti">Reflexiona</span>${parrafos(dev.reflexion)}</div>` : ''}
      ${dev.aplicacion ? `<div class="card d-bloque d-aplica"><span class="d-eti">Aplica hoy</span>${parrafos(dev.aplicacion)}</div>` : ''}
      <form id="fResp" class="card">
        <label for="tResp" style="margin-top:0;font-size:15px;color:var(--texto)">${esc(dev.pregunta || '¿Qué te habló Dios hoy?')}</label>
        <textarea id="tResp" name="texto" maxlength="4000" placeholder="Escribe tu respuesta…">${esc(mia?.texto || '')}</textarea>
        <label>¿Quién puede verla?</label>
        <div class="d-vis" id="segVis">${botonesVis(ops, vis)}</div>
        <button class="btn prim blk">${mia ? 'Guardar cambios' : 'Guardar y sumar a mi racha 🔥'}</button>
        ${mia ? `<p class="ayuda" style="text-align:center">✓ Completado ${esc(haceCuanto(mia.created_at))}</p>` : ''}
      </form>
      ${compartidas?.length ? `<div class="seccion-t">Lo que compartieron (${compartidas.length})</div><div class="lista">${compartidas.map(r => `
        <div class="card d-post"><div class="d-post-h">${avatar(r.autor_id)}<div class="info"><b>${esc(nombreDe(r.autor_id))}</b><small>${esc(haceCuanto(r.created_at))}</small></div><span class="tag">${visDe(r).ico} ${esc(visDe(r).txt)}</span></div>
        <div class="d-post-t">${esc1(r.texto)}</div></div>`).join('')}</div>` : ''}
      ${listaHtml}`;

    $('#segVis').onclick = ev => {
      const b = ev.target.closest('[data-vis]');
      if (!b || b.disabled) return;
      vis = b.dataset.vis;
      $('#segVis').querySelectorAll('button').forEach(x => { x.classList.toggle('activo', x === b); x.setAttribute('aria-pressed', x === b); });
    };
    $('#fResp').onsubmit = ev => {
      ev.preventDefault();
      const texto = $('#tResp').value.trim();
      if (!texto) { toast('Escribe tu respuesta antes de guardar', true); return; }
      ocupado(ev.target.querySelector('button.prim'), async () => {
        const fila = { devocional_id: dev.id, autor_id: st.uid, texto, ...partirVis(vis), updated_at: new Date().toISOString() };
        const { error } = await sb.from('disc_respuestas').upsert(fila, { onConflict: 'devocional_id,autor_id' });
        if (error) return fallo(error, 'Devocional');
        if (!mia) {
          const { data: r } = await sb.rpc('disc_racha');
          toast(`¡Devocional completado! 🔥 Racha de ${r?.[0]?.actual ?? 1}`);
        } else toast('Guardado');
        api.rutear();
      });
    };
  }

  // ===================================================================
  // MURO
  // ===================================================================
  let filtroMuro = 'todo';
  async function vistaMuro(ctx) {
    cargando('Muro');
    const e = await estructura();
    const { data: posts, error } = await sb.from('disc_posts')
      .select('*, reac:disc_reacciones(perfil_id, tipo), com:disc_comentarios(id, autor_id, texto, created_at)')
      .order('created_at', { ascending: false }).limit(60);
    if (!ctx.vigente()) return;
    if (error) return falta(error);
    const grupos = gruposDe(e);
    const abiertos = vistaMuro._abiertos || (vistaMuro._abiertos = new Set());
    const pinta = () => {
      const lista = (posts || []).filter(p => filtroMuro === 'todo' || (filtroMuro === 'grupo' ? p.visibilidad === 'grupo' : filtroMuro === 'mentor' ? p.visibilidad === 'mentor' : p.visibilidad === 'comunidad'));
      app.innerHTML = cab('Muro', { sub: 'Discipulado', derecha: '' }) + `
        <div class="segmentado" id="segMuro">${[['todo', 'Todo'], ['comunidad', '🌍 Comunidad'], ...(grupos.length ? [['grupo', grupos.length > 1 ? '👥 Grupos' : '👥 Mi grupo']] : []), ...(misDiscipulos(e).length ? [['mentor', '🤝 Para mí']] : [])]
          .map(([k, v]) => `<button type="button" data-f="${k}" class="${filtroMuro === k ? 'activo' : ''}">${v}</button>`).join('')}</div>
        ${filtroMuro === 'grupo' ? `<p class="ayuda d-candado">🔒 Solo lo ven los de cada grupo: ${grupos.map(g => esc(g.sub)).join(' · ')}.</p>` : ''}
        ${filtroMuro === 'mentor' ? '<p class="ayuda d-candado">🔒 Lo que tus discípulos compartieron solo contigo.</p>' : ''}
        <div class="lista">${lista.length ? lista.map(p => tarjeta(p)).join('') : vacio('🌱', 'Todavía no hay publicaciones aquí. ¡Comparte la primera!')}</div>
        <button class="fab" id="fabPost" aria-label="Compartir">＋</button>`;
    };
    const tarjeta = p => {
      const t = TIPOS_POST[p.tipo] || TIPOS_POST.reflexion;
      const n = k => p.reac.filter(r => r.tipo === k).length;
      const mia = k => p.reac.some(r => r.tipo === k && r.perfil_id === st.uid);
      const com = [...(p.com || [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
      const ab = abiertos.has(p.id);
      return `<article class="card d-post" data-id="${p.id}">
        <div class="d-post-h">${avatar(p.autor_id)}<div class="info"><b>${esc(nombreDe(p.autor_id))}</b><small>${esc(haceCuanto(p.created_at))} · ${visDe(p).ico} ${esc(visDe(p).txt)}</small></div>
          ${p.autor_id === st.uid || (esPastor() && p.visibilidad === 'comunidad') ? `<button class="btn-ico sm" data-acc="borrar" aria-label="Borrar publicación">🗑</button>` : ''}</div>
        <span class="tag d-tipo-${p.tipo} d-tipo">${t.ico} ${t.txt}</span>
        <div class="d-post-t">${esc1(p.texto)}</div>
        <div class="reacciones">
          <button class="reac ${mia('orando') ? 'mia' : ''}" data-acc="reac" data-t="orando" aria-pressed="${mia('orando')}">🙏 Orando <small>${n('orando') || ''}</small></button>
          <button class="reac ${mia('amen') ? 'mia' : ''}" data-acc="reac" data-t="amen" aria-pressed="${mia('amen')}">🙌 Amén <small>${n('amen') || ''}</small></button>
          <button class="reac" data-acc="com" aria-expanded="${ab}">💬 <small>${com.length || ''}</small></button>
        </div>
        ${ab ? `<div class="d-coms">${com.map(c => `<div class="d-com"><b>${esc(nombreDe(c.autor_id))}</b> ${esc1(c.texto)} <small>${esc(haceCuanto(c.created_at))}</small>
            ${c.autor_id === st.uid || esPastor() ? `<button class="btn-link" data-acc="borrarCom" data-c="${c.id}">Borrar</button>` : ''}</div>`).join('')}
          <form class="d-com-f" data-acc="comentar"><input name="t" maxlength="2000" placeholder="Escribe un comentario…" aria-label="Comentario" autocomplete="off"><button class="btn sm prim">Enviar</button></form></div>` : ''}
      </article>`;
    };
    pinta();

    const recargar = () => api.rutear();
    app.onclick = async ev => {
      const f = ev.target.closest('[data-f]');
      if (f) { filtroMuro = f.dataset.f; pinta(); return; }
      if (ev.target.closest('#fabPost')) return modalPost(e, recargar);
      const b = ev.target.closest('[data-acc]');
      if (!b || b.tagName === 'FORM') return;
      const card = b.closest('[data-id]'), id = card?.dataset.id, p = posts.find(x => x.id === id);
      if (!p) return;
      if (b.dataset.acc === 'reac') {
        const t = b.dataset.t, ya = p.reac.some(r => r.tipo === t && r.perfil_id === st.uid);
        b.disabled = true;
        const { error } = ya
          ? await sb.from('disc_reacciones').delete().match({ post_id: id, perfil_id: st.uid, tipo: t })
          : await sb.from('disc_reacciones').insert({ post_id: id, perfil_id: st.uid, tipo: t });
        if (error) { b.disabled = false; return fallo(error, 'Reacción'); }
        p.reac = ya ? p.reac.filter(r => !(r.tipo === t && r.perfil_id === st.uid)) : [...p.reac, { perfil_id: st.uid, tipo: t }];
        card.outerHTML = tarjeta(p);
      } else if (b.dataset.acc === 'com') {
        abiertos.has(id) ? abiertos.delete(id) : abiertos.add(id);
        card.outerHTML = tarjeta(p);
        $(`[data-id="${id}"] input`)?.focus();
      } else if (b.dataset.acc === 'borrar') {
        if (!confirm('¿Borrar esta publicación?')) return;
        const { error } = await sb.from('disc_posts').delete().eq('id', id);
        if (error) return fallo(error, 'Borrar');
        toast('Publicación borrada'); recargar();
      } else if (b.dataset.acc === 'borrarCom') {
        const { error } = await sb.from('disc_comentarios').delete().eq('id', b.dataset.c);
        if (error) return fallo(error, 'Borrar');
        p.com = p.com.filter(c => c.id !== b.dataset.c);
        card.outerHTML = tarjeta(p);
      }
    };
    app.onsubmit = async ev => {
      const fm = ev.target.closest('[data-acc="comentar"]');
      if (!fm) return;
      ev.preventDefault();
      const card = fm.closest('[data-id]'), p = posts.find(x => x.id === card.dataset.id);
      const texto = fm.t.value.trim();
      if (!texto) return;
      fm.querySelector('button').disabled = true;
      const { data, error } = await sb.from('disc_comentarios').insert({ post_id: p.id, autor_id: st.uid, texto }).select().single();
      if (error) { fm.querySelector('button').disabled = false; return fallo(error, 'Comentario'); }
      p.com = [...(p.com || []), data];
      card.outerHTML = tarjeta(p);
    };

    // Tiempo real: publicaciones nuevas
    const canal = sb.channel('disc-muro-' + Date.now())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'disc_posts' }, ({ new: n }) => {
        if (n.autor_id !== st.uid && ctx.vigente() && !$('#avisoMuro')) {
          const a = document.createElement('button');
          a.id = 'avisoMuro'; a.className = 'aviso-version'; a.type = 'button';
          a.textContent = '🌱 Hay publicaciones nuevas · Toca para ver';
          a.onclick = () => { a.remove(); recargar(); };
          document.body.appendChild(a);
        }
      }).subscribe();
    st.limpiar.push(() => { sb.removeChannel(canal); $('#avisoMuro')?.remove(); app.onsubmit = null; });
  }

  function modalPost(e, alGuardar) {
    const mentor = miMentor(e);
    const puedeAnunciar = misDiscipulos(e).length || esPastor();
    const ops = opcionesVis(e, ['comunidad', 'grupo', 'mentor']);
    let vis = 'comunidad';
    const body = abrirModal('Compartir', `
      <form id="fPost">
        <label style="margin-top:0">Tipo</label>
        <select name="tipo">${Object.entries(TIPOS_POST).filter(([k]) => k !== 'logro' && (k !== 'anuncio' || puedeAnunciar)).map(([k, v]) => `<option value="${k}">${v.ico} ${v.txt}</option>`).join('')}</select>
        <label>Mensaje</label><textarea name="texto" maxlength="4000" required placeholder="Comparte lo que Dios está haciendo, un versículo o una petición…"></textarea>
        <label>¿Quién puede verlo?</label>
        <div class="d-vis" id="pVis">${botonesVis(ops, vis)}</div>
        <button class="btn prim blk">Publicar</button>
      </form>`);
    $('#pVis', body).onclick = ev => {
      const b = ev.target.closest('[data-vis]'); if (!b || b.disabled) return;
      vis = b.dataset.vis;
      $('#pVis', body).querySelectorAll('button').forEach(x => { x.classList.toggle('activo', x === b); x.setAttribute('aria-pressed', x === b); });
    };
    $('[name=tipo]', body).onchange = ev => {
      // Las peticiones de oración se sugieren privadas, pero la persona decide
      if (ev.target.value === 'oracion' && mentor && vis === 'comunidad') $('#pVis [data-vis="mentor"]', body)?.click();
    };
    $('#fPost', body).onsubmit = ev => {
      ev.preventDefault();
      const f = Object.fromEntries(new FormData(ev.target));
      ocupado(ev.target.querySelector('button.prim'), async () => {
        const { error } = await sb.from('disc_posts').insert({ autor_id: st.uid, tipo: f.tipo, texto: f.texto.trim(), ...partirVis(vis) });
        if (error) return fallo(error, 'Publicar');
        cerrarModal(); toast('Publicado'); alGuardar();
      });
    };
  }

  // ===================================================================
  // RETOS
  // ===================================================================
  async function vistaRetos(ctx) {
    cargando('Retos');
    const hoyF = fechaPa();
    const [niveles, perfil, retos, mios, racha] = await Promise.all([
      sb.from('disc_niveles').select('*').order('n'),
      sb.from('disc_perfil').select('nivel').eq('perfil_id', st.uid).maybeSingle(),
      sb.from('disc_retos').select('*').eq('activo', true).order('nivel').order('created_at'),
      sb.from('disc_retos_part').select('*, reto:disc_retos(*), marcas:disc_retos_marcas(fecha)').eq('perfil_id', st.uid),
      sb.rpc('disc_racha').then(r => r.data?.[0] || { actual: 0, maxima: 0 }),
    ]);
    if (!ctx.vigente()) return;
    if (retos.error) return falta(retos.error);
    const nivel = perfil.data?.nivel || 1;
    const part = new Map((mios.data || []).map(p => [p.reto_id, p]));
    const enCurso = (mios.data || []).filter(p => !p.completado_at && p.reto);
    const hechos = (mios.data || []).filter(p => p.completado_at && p.reto);
    const disponibles = (retos.data || []).filter(r => !part.has(r.id));
    const delNivel = (retos.data || []).filter(r => r.nivel === nivel);
    const hechosNivel = delNivel.filter(r => part.get(r.id)?.completado_at).length;
    const insignias = [
      ['Primer devocional', racha.maxima >= 1, '📖'], ['Primera semana', racha.maxima >= 7, '🔥'], ['Racha de 30', racha.maxima >= 30, '🔥'],
      ['Primer reto', hechos.length >= 1, '🎯'], ['5 retos', hechos.length >= 5, '🏅'], ['Nivel Tallo', nivel >= 2, '🌿'],
      ['Nivel Rama', nivel >= 3, '🌳'], ['Nivel Fruto', nivel >= 4, '🍇'],
    ];
    const filaReto = (p, r) => {
      const hoyMarcado = p?.marcas?.some(m => m.fecha === hoyF);
      return `<div class="card d-reto" data-reto="${r.id}">
        <div class="d-reto-h"><div class="info"><b>${esc(r.titulo)}</b><small>${r.dias} ${r.dias === 1 ? 'día' : 'días'} · Nivel ${r.nivel}</small></div>
          ${p ? `<span class="d-num">${p.marcas.length}/${r.dias}</span>` : `<button class="btn sm prim" data-acc="unir">Unirme</button>`}</div>
        ${r.descripcion ? `<p class="ayuda" style="margin:6px 0 0">${esc1(r.descripcion)}</p>` : ''}
        ${p ? `${barra(p.marcas.length, r.dias)}<div class="fila" style="margin-top:10px">
          <button class="btn sm ${hoyMarcado ? '' : 'prim'}" data-acc="${hoyMarcado ? 'desmarcar' : 'marcar'}">${hoyMarcado ? '✓ Hoy cumplido · deshacer' : '✓ Cumplí hoy'}</button>
          <button class="btn sm peligro" data-acc="dejar" style="flex:0 0 auto">Dejar</button></div>` : ''}
      </div>`;
    };

    app.innerHTML = cab('Retos', { sub: `${hechos.length} ${hechos.length === 1 ? 'completado' : 'completados'}` }) + `
      <div class="d-hero">
        <div class="d-ruta-h"><b>Tu ruta de crecimiento</b><span>Nivel ${nivel}</span></div>
        <div class="d-ruta">${(niveles.data || []).map(n => `<div class="${n.n < nivel ? 'hecho' : n.n === nivel ? 'actual' : ''}"><i>${n.n}</i><b>${esc(n.nombre)}</b><small>${esc(n.descripcion || '')}</small></div>`).join('')}</div>
        ${delNivel.length ? `${barra(hechosNivel, delNivel.length)}<small class="d-ruta-pie">${hechosNivel} de ${delNivel.length} retos de este nivel. Tu mentor te acompaña a pasar al siguiente.</small>` : '<small class="d-ruta-pie">Tu mentor te acompaña a pasar al siguiente nivel.</small>'}
      </div>
      ${enCurso.length ? `<div class="seccion-t">En curso</div>${enCurso.map(p => filaReto(p, p.reto)).join('')}` : ''}
      <div class="seccion-t">Nuevos retos</div>
      ${disponibles.length ? disponibles.map(r => filaReto(null, r)).join('') : `<p class="ayuda">${(retos.data || []).length ? 'Ya te uniste a todos los retos disponibles. 🙌' : 'Todavía no hay retos publicados.'}${esPastor() ? ' <a href="#/d/gestion">Crear un reto ›</a>' : ''}</p>`}
      ${hechos.length ? `<div class="seccion-t">Completados</div><div class="lista">${hechos.map(p => `<div class="item" style="cursor:default"><span class="d-chk si">✓</span><div class="info"><b>${esc(p.reto.titulo)}</b><small>${esc(haceCuanto(p.completado_at))}</small></div>
        <button class="btn sm" data-acc="compartir" data-t="${esc(p.reto.titulo)}">Compartir</button></div>`).join('')}</div>` : ''}
      <div class="seccion-t">Insignias</div>
      <div class="d-insignias">${insignias.map(([t, ok, ico]) => `<div class="${ok ? 'ok' : ''}"><i aria-hidden="true">${ico}</i><small>${esc(t)}</small>${ok ? '' : '<span class="sr">Bloqueada</span>'}</div>`).join('')}</div>`;

    app.onclick = async ev => {
      const b = ev.target.closest('[data-acc]');
      if (!b) return;
      if (b.dataset.acc === 'compartir') {
        const { error } = await sb.from('disc_posts').insert({ autor_id: st.uid, tipo: 'logro', texto: `Completé el reto «${b.dataset.t}». ¡Gloria a Dios!`, visibilidad: 'comunidad' });
        if (error) return fallo(error, 'Compartir');
        toast('Compartido en el muro 🏅'); return;
      }
      const id = b.closest('[data-reto]')?.dataset.reto;
      const reto = (retos.data || []).find(r => r.id === id) || part.get(id)?.reto;
      b.disabled = true;
      let r;
      if (b.dataset.acc === 'unir') r = await sb.from('disc_retos_part').insert({ reto_id: id, perfil_id: st.uid });
      else if (b.dataset.acc === 'marcar') r = await sb.from('disc_retos_marcas').insert({ reto_id: id, perfil_id: st.uid, fecha: hoyF });
      else if (b.dataset.acc === 'desmarcar') r = await sb.from('disc_retos_marcas').delete().match({ reto_id: id, perfil_id: st.uid, fecha: hoyF });
      else if (b.dataset.acc === 'dejar') {
        if (!confirm('¿Dejar este reto? Se borra tu avance.')) { b.disabled = false; return; }
        r = await sb.from('disc_retos_part').delete().match({ reto_id: id, perfil_id: st.uid });
      }
      if (r?.error) { b.disabled = false; return fallo(r.error, 'Retos'); }
      if (b.dataset.acc === 'marcar') {
        const p = part.get(id);
        toast((p?.marcas.length || 0) + 1 >= (reto?.dias || 1) ? '🏅 ¡Reto completado!' : '✓ ¡Bien! Un día más');
      }
      api.rutear();
    };
  }

  // ===================================================================
  // MENTORÍAS
  // ===================================================================
  async function vistaMentorias(ctx) {
    cargando('Mentorías');
    const e = await estructura();
    const desde = new Date(Date.now() - 30 * 86400e3).toISOString();
    const { data, error } = await sb.from('disc_mentorias').select('*, asis:disc_asistencia(perfil_id, estado)')
      .gte('inicio', desde).neq('estado', 'cancelada').order('inicio');
    if (!ctx.vigente()) return;
    if (error) return falta(error);
    const ahora = Date.now() - 2 * 3600e3;
    const prox = (data || []).filter(m => new Date(m.inicio) >= ahora);
    const pasadas = (data || []).filter(m => new Date(m.inicio) < ahora).reverse().slice(0, 10);
    const mentor = miMentor(e), discs = misDiscipulos(e);
    const conQuien = m => m.mentor_id === st.uid ? (m.discipulo_id ? 'con ' + nombreDe(m.discipulo_id) : 'con todo tu grupo') : (m.discipulo_id ? 'con ' + nombreDe(m.mentor_id) : `con ${nombreDe(m.mentor_id)} y el grupo`);
    const fila = (m, pasada = false) => {
      const d = new Date(m.inicio);
      const mia = m.asis.find(a => a.perfil_id === st.uid)?.estado;
      const soyMentor = m.mentor_id === st.uid;
      const si = m.asis.filter(a => a.estado === 'confirmado').length, no = m.asis.filter(a => a.estado === 'no_puedo').length;
      return `<div class="card d-ment ${pasada ? 'pasada' : ''}" data-m="${m.id}">
        <div class="d-fecha"><small>${esc(d.toLocaleDateString('es-PA', { weekday: 'short' }).replace('.', ''))}</small><b>${d.getDate()}</b><small>${esc(d.toLocaleDateString('es-PA', { month: 'short' }).replace('.', ''))}</small></div>
        <div class="info">
          <b>${esc(horaTxt(m.inicio))} · ${esc(MODALIDAD[m.modalidad] || m.modalidad)}</b>
          <small>${esc(conQuien(m))}${m.lugar ? ' · ' + esc(m.lugar) : ''}</small>
          ${m.tema ? `<small>Tema: ${esc(m.tema)}</small>` : ''}
          ${m.estado === 'propuesta' ? `<span class="tag warn">Propuesta${soyMentor ? ' · responde' : ' · esperando respuesta'}</span>` : ''}
          ${soyMentor && m.estado === 'agendada' ? `<small>✅ ${si} · ❌ ${no}</small>` : ''}
          ${!pasada ? `<div class="fila d-acc">${soyMentor
            ? (m.estado === 'propuesta'
              ? `<button class="btn sm prim" data-acc="aceptar">Aceptar</button><button class="btn sm" data-acc="editar">Cambiar</button><button class="btn sm peligro" data-acc="cancelar">Rechazar</button>`
              : `<button class="btn sm" data-acc="editar">Editar</button><button class="btn sm peligro" data-acc="cancelar">Cancelar</button>`)
            : (m.estado === 'agendada'
              ? `<button class="btn sm ${mia === 'confirmado' ? 'prim' : ''}" data-acc="asis" data-e="confirmado" aria-pressed="${mia === 'confirmado'}">${mia === 'confirmado' ? '✅ Confirmada' : 'Confirmar'}</button><button class="btn sm ${mia === 'no_puedo' ? 'peligro' : ''}" data-acc="asis" data-e="no_puedo" aria-pressed="${mia === 'no_puedo'}">${mia === 'no_puedo' ? '❌ No puedo' : 'No puedo'}</button>`
              : (m.creado_por === st.uid ? `<button class="btn sm peligro" data-acc="retirar">Retirar propuesta</button>` : ''))}</div>` : ''}
        </div></div>`;
    };

    app.innerHTML = cab('Mentorías') + `
      ${mentor ? `<div class="item d-fila" style="cursor:default">${avatar(mentor, 'grande')}<div class="info"><small>Tu mentor</small><b>${esc(nombreDe(mentor))}</b></div></div>` : ''}
      ${discs.length ? `<p class="ayuda">Acompañas a ${discs.length} ${discs.length === 1 ? 'persona' : 'personas'}: ${discs.map(d => esc(nombreDe(d))).join(', ')}.</p>` : ''}
      <div class="seccion-t">Próximas</div>
      ${prox.length ? prox.map(m => fila(m)).join('') : '<p class="ayuda">No hay mentorías agendadas.</p>'}
      <div class="fila" style="margin-top:6px">
        ${discs.length ? '<button class="btn prim" data-acc="nueva">＋ Agendar mentoría</button>' : ''}
        ${mentor ? `<button class="btn ${discs.length ? '' : 'prim'}" data-acc="proponer">＋ Proponer fecha</button>` : ''}
      </div>
      ${!mentor && !discs.length ? '<p class="ayuda">Cuando tengas mentor asignado podrás proponerle fechas aquí.</p>' : ''}
      <div class="d-hero d-cal">
        <b>Tus mentorías en el calendario del celular</b>
        <small>Te suscribes una vez y cada fecha nueva aparece sola en Google Calendar o en el calendario del iPhone.</small>
        <button class="btn blk d-cal-btn" data-acc="calendario">📅 Agregar a mi calendario</button>
      </div>
      ${pasadas.length ? `<div class="seccion-t">Anteriores</div>${pasadas.map(m => fila(m, true)).join('')}` : ''}`;

    app.onclick = async ev => {
      const b = ev.target.closest('[data-acc]');
      if (!b) return;
      const acc = b.dataset.acc;
      if (acc === 'calendario') return api.modalCalendario();
      if (acc === 'nueva') return modalMentoria(e, null, { mentor: true });
      if (acc === 'proponer') return modalMentoria(e, null, { mentor: false });
      const m = (data || []).find(x => x.id === b.closest('[data-m]')?.dataset.m);
      if (!m) return;
      let r;
      if (acc === 'editar') return modalMentoria(e, m, { mentor: true });
      if (acc === 'aceptar') r = await sb.from('disc_mentorias').update({ estado: 'agendada' }).eq('id', m.id);
      else if (acc === 'cancelar') { if (!confirm(m.estado === 'propuesta' ? '¿Rechazar esta propuesta?' : '¿Cancelar esta mentoría?')) return; r = await sb.from('disc_mentorias').update({ estado: 'cancelada' }).eq('id', m.id); }
      else if (acc === 'retirar') { if (!confirm('¿Retirar tu propuesta?')) return; r = await sb.from('disc_mentorias').delete().eq('id', m.id); }
      else if (acc === 'asis') {
        const ya = m.asis.find(a => a.perfil_id === st.uid)?.estado === b.dataset.e;
        r = ya ? await sb.from('disc_asistencia').delete().match({ mentoria_id: m.id, perfil_id: st.uid })
          : await sb.from('disc_asistencia').upsert({ mentoria_id: m.id, perfil_id: st.uid, estado: b.dataset.e, updated_at: new Date().toISOString() });
      }
      if (r?.error) return fallo(r.error, 'Mentorías');
      toast(acc === 'aceptar' ? 'Mentoría agendada' : 'Listo');
      api.rutear();
    };
  }

  function modalMentoria(e, m, { mentor, discipulo = null }) {
    const discs = misDiscipulos(e);
    const def = m ? aLocal(m.inicio) : (() => { const d = new Date(Date.now() + 86400e3); d.setHours(19, 0, 0, 0); return aLocal(d.toISOString()); })();
    const quien = m ? (m.discipulo_id || '') : (discipulo || '');
    const body = abrirModal(m ? 'Editar mentoría' : mentor ? 'Agendar mentoría' : 'Proponer fecha a tu mentor', `
      <form id="fMent">
        ${mentor ? `<label style="margin-top:0">Con quién</label><select name="quien">
          <option value="">👥 Todo el grupo</option>${discs.map(id => `<option value="${id}" ${id === quien ? 'selected' : ''}>${esc(nombreDe(id))}</option>`).join('')}</select>` : `<p class="ayuda" style="margin-top:0">${esc(nombreDe(miMentor(e)))} recibirá tu propuesta y podrá aceptarla o cambiarla.</p>`}
        <div class="fila"><div><label>Fecha y hora</label><input type="datetime-local" name="inicio" required value="${def}"></div>
          <div style="flex:0 0 110px"><label>Duración</label><select name="dur">${[30, 45, 60, 90, 120].map(n => `<option value="${n}" ${(m?.duracion_min || 60) === n ? 'selected' : ''}>${n} min</option>`).join('')}</select></div></div>
        <label>Modalidad</label><select name="modalidad">${Object.entries(MODALIDAD).map(([k, v]) => `<option value="${k}" ${m?.modalidad === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <label>Lugar o link (opcional)</label><input name="lugar" maxlength="200" value="${esc(m?.lugar || '')}" placeholder="Ej. el templo, un café o el link de la videollamada">
        <label>Tema (opcional)</label><input name="tema" maxlength="200" value="${esc(m?.tema || '')}" placeholder="De qué van a conversar">
        <button class="btn prim blk">${m ? 'Guardar' : mentor ? 'Agendar' : 'Enviar propuesta'}</button>
      </form>`);
    $('#fMent', body).onsubmit = ev => {
      ev.preventDefault();
      const f = Object.fromEntries(new FormData(ev.target));
      ocupado(ev.target.querySelector('button.prim'), async () => {
        const fila = {
          inicio: new Date(f.inicio).toISOString(), duracion_min: +f.dur, modalidad: f.modalidad,
          lugar: f.lugar.trim() || null, tema: f.tema.trim() || null,
        };
        let r;
        if (m) r = await sb.from('disc_mentorias').update({ ...fila, ...(mentor ? { discipulo_id: f.quien || null } : {}), estado: 'agendada' }).eq('id', m.id);
        else if (mentor) r = await sb.from('disc_mentorias').insert({ ...fila, mentor_id: st.uid, discipulo_id: f.quien || null, estado: 'agendada' });
        else r = await sb.from('disc_mentorias').insert({ ...fila, mentor_id: miMentor(e), discipulo_id: st.uid, estado: 'propuesta' });
        if (r.error) return fallo(r.error, 'Mentoría');
        cerrarModal(); toast(m ? 'Guardado' : mentor ? 'Mentoría agendada' : 'Propuesta enviada');
        if (location.hash.startsWith('#/d/mentorias')) api.rutear(); else location.hash = '#/d/mentorias';
      });
    };
  }

  // ===================================================================
  // PANEL DEL MENTOR
  // ===================================================================
  let verTodos = false;
  async function vistaDiscipulos(ctx) {
    cargando('Mis discípulos');
    const e = await estructura(true);
    const todos = verTodos && esPastor();
    const { data, error } = await sb.rpc('disc_resumen', { p_todos: todos });
    if (!ctx.vigente()) return;
    if (error) return falta(error);
    const hoyF = fechaPa();
    const filas = (data || []).sort((a, b) => nombreDe(a.perfil_id).localeCompare(nombreDe(b.perfil_id)));
    const frios = filas.filter(r => !r.ultimo || r.ultimo < sumarDias(hoyF, -6));
    const alDia = filas.filter(r => r.ultimo === hoyF).length;
    const semana = filas.filter(r => r.proxima && new Date(r.proxima) - Date.now() < 7 * 86400e3).length;
    app.innerHTML = cab(todos ? 'Todos los discípulos' : 'Mis discípulos', { sub: todos ? 'Vista de administración' : 'Panel del mentor', atras: '#/d/inicio' }) + `
      ${esPastor() ? `<div class="segmentado" id="segTodos"><button data-t="0" class="${!todos ? 'activo' : ''}">Mis discípulos</button><button data-t="1" class="${todos ? 'activo' : ''}">Toda la iglesia</button></div>` : ''}
      <div class="d-stats"><div><b>${filas.length}</b><small>Discípulos</small></div><div><b>${alDia}</b><small>Al día hoy</small></div><div><b>${semana}</b><small>Mentorías esta semana</small></div></div>
      ${frios.length ? `<div class="card d-alerta">⚠️ <span>${frios.map(r => `<b>${esc(nombreDe(r.perfil_id))}</b> ${r.ultimo ? 'no hace el devocional desde ' + esc(haceDias(r.ultimo)) : 'aún no ha hecho ningún devocional'}${r.proxima ? '' : ' y no tiene mentoría agendada'}`).join('. ')}.</span></div>` : ''}
      <div class="lista">${filas.length ? filas.map(r => `
        <a class="item" href="#/d/discipulo/${r.perfil_id}">${avatar(r.perfil_id)}
          <div class="info"><b>${esc(nombreDe(r.perfil_id))}</b><small>Último devocional: ${esc(haceDias(r.ultimo))}${todos ? ' · mentor: ' + esc(nombreDe(r.mentor_id)) : ''}</small>
          <small>${r.proxima ? 'Próxima: ' + esc(diaTxt(r.proxima)) : 'Sin mentoría agendada'} · Nivel ${r.nivel}</small></div>
          <span class="d-chip-racha ${r.racha ? '' : 'cero'}">🔥 ${r.racha}</span></a>`).join('') : vacio('🌱', todos ? 'Todavía no hay discípulos asignados.' : 'Todavía no tienes discípulos asignados.')}</div>`;
    $('#segTodos') && ($('#segTodos').onclick = ev => { const b = ev.target.closest('[data-t]'); if (b) { verTodos = b.dataset.t === '1'; api.rutear(); } });
  }

  async function vistaDiscipulo(ctx) {
    const id = ctx.partes[1];
    cargando(nombreDe(id), { atras: '#/d/discipulos' });
    const e = await estructura();
    const soyMentor = e.mentorDe.get(id) === st.uid;
    const [res, resp, posts, notas, retos, niveles] = await Promise.all([
      sb.rpc('disc_resumen', { p_todos: esPastor() && !soyMentor }),
      sb.from('disc_respuestas').select('id, texto, visibilidad, grupo_id, created_at, dev:disc_devocionales(titulo, fecha)').eq('autor_id', id).order('created_at', { ascending: false }).limit(10),
      sb.from('disc_posts').select('*').eq('autor_id', id).neq('visibilidad', 'comunidad').order('created_at', { ascending: false }).limit(10),
      soyMentor ? sb.from('disc_notas').select('*').eq('discipulo_id', id).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
      sb.from('disc_retos_part').select('completado_at, reto:disc_retos(titulo, dias), marcas:disc_retos_marcas(fecha)').eq('perfil_id', id),
      sb.from('disc_niveles').select('*').order('n'),
    ]);
    if (!ctx.vigente()) return;
    if (res.error) return falta(res.error);
    const r = (res.data || []).find(x => x.perfil_id === id) || { racha: 0, maxima: 0, nivel: 1, retos_hechos: 0 };
    app.innerHTML = cab(nombreDe(id), { sub: soyMentor ? 'Tu discípulo' : 'Mentor: ' + nombreDe(e.mentorDe.get(id)), atras: '#/d/discipulos' }) + `
      <div class="d-stats"><div><b>🔥 ${r.racha}</b><small>Racha (récord ${r.maxima})</small></div><div><b>${r.retos_hechos}</b><small>Retos hechos</small></div><div><b>${r.nivel}</b><small>Nivel</small></div></div>
      <div class="card"><b>Último devocional:</b> ${esc(haceDias(r.ultimo))}<br><b>Próxima mentoría:</b> ${r.proxima ? esc(diaTxt(r.proxima) + ' · ' + horaTxt(r.proxima)) : 'sin agendar'}
        ${soyMentor ? '<button class="btn prim blk" data-acc="agendar">＋ Agendar mentoría</button>' : ''}</div>
      <div class="card"><label for="selNivel" style="margin-top:0">Ruta de crecimiento</label>
        <select id="selNivel">${(niveles.data || []).map(n => `<option value="${n.n}" ${n.n === r.nivel ? 'selected' : ''}>${n.n}. ${esc(n.nombre)} · ${esc(n.descripcion || '')}</option>`).join('')}</select>
        <p class="ayuda">Súbelo de nivel cuando veas que está listo.</p></div>
      ${soyMentor ? `<div class="d-hero d-notas">
        <span class="d-eti">🔒 Mis notas · solo yo las veo</span>
        ${(notas.data || []).map(n => `<div class="d-nota"><span>${esc1(n.texto)}</span><small>${esc(haceCuanto(n.created_at))} <button class="btn-link" data-acc="borrarNota" data-n="${n.id}">Borrar</button></small></div>`).join('') || '<p class="d-nota-vacia">Aún no tienes notas sobre esta persona.</p>'}
        <form id="fNota"><label for="tNota" class="sr">Nueva nota</label><textarea id="tNota" maxlength="4000" placeholder="Escribe una nota nueva…"></textarea><button class="btn sm d-cal-btn">Guardar nota</button></form>
      </div>` : ''}
      <div class="seccion-t">Devocionales que compartió contigo</div>
      ${(resp.data || []).length ? (resp.data || []).map(x => `<div class="card d-post"><div class="d-post-h"><div class="info"><b>${esc(x.dev?.titulo || '')}</b><small>${esc(haceCuanto(x.created_at))}</small></div><span class="tag">${visDe(x).ico} ${esc(visDe(x).txt)}</span></div><div class="d-post-t">${esc1(x.texto)}</div></div>`).join('') : '<p class="ayuda">Todavía no ha compartido respuestas contigo.</p>'}
      <div class="seccion-t">Peticiones y mensajes para ti o el grupo</div>
      ${(posts.data || []).length ? (posts.data || []).map(p => `<div class="card d-post"><div class="d-post-h"><div class="info"><b>${TIPOS_POST[p.tipo]?.ico || ''} ${esc(TIPOS_POST[p.tipo]?.txt || '')}</b><small>${esc(haceCuanto(p.created_at))}</small></div><span class="tag">${visDe(p).ico} ${esc(visDe(p).txt)}</span></div><div class="d-post-t">${esc1(p.texto)}</div></div>`).join('') : '<p class="ayuda">Nada por ahora.</p>'}
      <div class="seccion-t">Retos</div>
      ${(retos.data || []).length ? `<div class="lista">${retos.data.filter(x => x.reto).map(x => `<div class="item" style="cursor:default"><span class="d-chk ${x.completado_at ? 'si' : ''}">${x.completado_at ? '✓' : ''}</span><div class="info"><b>${esc(x.reto.titulo)}</b><small>${x.marcas.length} de ${x.reto.dias} días</small></div></div>`).join('')}</div>` : '<p class="ayuda">No se ha unido a ningún reto.</p>'}`;

    $('#selNivel').onchange = async ev => {
      const { error } = await sb.from('disc_perfil').upsert({ perfil_id: id, nivel: +ev.target.value, updated_at: new Date().toISOString() });
      if (error) { ev.target.value = r.nivel; return fallo(error, 'Nivel'); }
      toast('Nivel actualizado 🌱');
    };
    app.onclick = async ev => {
      const b = ev.target.closest('[data-acc]');
      if (!b) return;
      if (b.dataset.acc === 'agendar') return modalMentoria(e, null, { mentor: true, discipulo: id });
      if (b.dataset.acc === 'borrarNota') {
        if (!confirm('¿Borrar esta nota?')) return;
        const { error } = await sb.from('disc_notas').delete().eq('id', b.dataset.n);
        if (error) return fallo(error, 'Nota');
        api.rutear();
      }
    };
    const fn = $('#fNota');
    if (fn) fn.onsubmit = ev => {
      ev.preventDefault();
      const texto = $('#tNota').value.trim();
      if (!texto) return;
      ocupado(fn.querySelector('button'), async () => {
        const { error } = await sb.from('disc_notas').insert({ mentor_id: st.uid, discipulo_id: id, texto });
        if (error) return fallo(error, 'Nota');
        toast('Nota guardada'); api.rutear();
      });
    };
  }

  // ===================================================================
  // GESTIÓN (pastor): devocionales y retos
  // ===================================================================
  async function vistaGestion(ctx) {
    if (!esPastor()) { location.replace('#/d/inicio'); return; }
    cargando('Gestionar', { atras: '#/d/inicio' });
    const hoyF = fechaPa();
    const [devs, retos] = await Promise.all([
      sb.from('disc_devocionales').select('*').gte('fecha', sumarDias(hoyF, -14)).order('fecha'),
      sb.from('disc_retos').select('*').order('nivel').order('created_at'),
    ]);
    if (!ctx.vigente()) return;
    if (devs.error) return falta(devs.error);
    const fechas = new Set((devs.data || []).map(d => d.fecha));
    const huecos = [0, 1, 2, 3, 4, 5, 6].map(n => sumarDias(hoyF, n)).filter(f => !fechas.has(f));
    app.innerHTML = cab('Gestionar', { sub: 'Discipulado', atras: '#/d/inicio' }) + `
      <a class="item d-fila" href="#/d/personas"><span class="d-mini-ico">🔑</span><div class="info"><b>Personas y accesos</b><small>Aprobar solicitudes, roles y mentores</small></div>›</a>
      <div class="seccion-t">Devocionales</div>
      ${huecos.length ? `<p class="ayuda">Días sin devocional esta semana: ${huecos.map(f => `<button class="chip" data-nuevo="${f}">${esc(fechaTxt(f, { weekday: 'short', day: 'numeric' }))}</button>`).join(' ')}</p>` : '<p class="ayuda">✓ La semana está cubierta.</p>'}
      <div class="lista">${(devs.data || []).slice().reverse().map(d => `<button class="item" data-dev="${d.id}" style="text-align:left;font:inherit;width:100%">
        <span class="d-chk ${d.fecha <= hoyF ? 'si' : ''}">${d.fecha === hoyF ? '●' : d.fecha < hoyF ? '✓' : ''}</span>
        <div class="info"><b>${esc(d.titulo)}</b><small>${esc(fechaTxt(d.fecha, { weekday: 'short', day: 'numeric', month: 'short' }))}${d.fecha > hoyF ? ' · programado' : ''}${d.serie ? ' · ' + esc(d.serie) : ''}</small></div>✎</button>`).join('')}</div>
      <button class="btn prim blk" data-nuevo="">＋ Nuevo devocional</button>
      <div class="seccion-t">Retos</div>
      <div class="lista">${(retos.data || []).map(r => `<button class="item" data-reto="${r.id}" style="text-align:left;font:inherit;width:100%">
        <div class="info"><b>${esc(r.titulo)} ${r.activo ? '' : '<span class="tag">Oculto</span>'}</b><small>${r.dias} ${r.dias === 1 ? 'día' : 'días'} · Nivel ${r.nivel}</small></div>✎</button>`).join('') || '<p class="ayuda">Aún no hay retos.</p>'}</div>
      <button class="btn blk" data-reto="">＋ Nuevo reto</button>`;
    app.onclick = ev => {
      const n = ev.target.closest('[data-nuevo]');
      if (n) return modalDevocional(null, n.dataset.nuevo || sumarDias([...fechas].sort().pop() || sumarDias(hoyF, -1), 1));
      const d = ev.target.closest('[data-dev]');
      if (d) return modalDevocional(devs.data.find(x => x.id === d.dataset.dev));
      const r = ev.target.closest('[data-reto]');
      if (r) return modalReto(retos.data.find(x => x.id === r.dataset.reto) || null);
    };
  }

  function modalDevocional(d, fecha) {
    const body = abrirModal(d ? 'Editar devocional' : 'Nuevo devocional', `
      <form id="fDev">
        <div class="fila"><div><label style="margin-top:0">Fecha</label><input type="date" name="fecha" required value="${esc(d?.fecha || fecha)}"></div>
          <div><label style="margin-top:0">Serie (opcional)</label><input name="serie" maxlength="80" value="${esc(d?.serie || '')}" placeholder="Ej. Permanecer"></div></div>
        <label>Título</label><input name="titulo" required maxlength="120" value="${esc(d?.titulo || '')}">
        <label>Pasaje (cita)</label><input name="pasaje_ref" maxlength="120" value="${esc(d?.pasaje_ref || '')}" placeholder="Ej. Juan 15:1-8">
        <label>Texto del pasaje</label><textarea name="pasaje_texto" maxlength="4000" placeholder="Pega el texto. Reina-Valera 1909 es de dominio público.">${esc(d?.pasaje_texto || '')}</textarea>
        <label>Reflexión</label><textarea name="reflexion" maxlength="6000">${esc(d?.reflexion || '')}</textarea>
        <label>Aplica hoy</label><textarea name="aplicacion" maxlength="2000" style="min-height:60px">${esc(d?.aplicacion || '')}</textarea>
        <label>Pregunta para responder</label><input name="pregunta" maxlength="300" value="${esc(d?.pregunta || '')}" placeholder="Ej. ¿Qué área de tu vida intentas sostener sola?">
        <button class="btn prim blk">${d ? 'Guardar' : 'Publicar'}</button>
        ${d ? '<button type="button" class="btn peligro blk" id="bBorrarDev">Borrar devocional</button>' : ''}
      </form>`);
    $('#fDev', body).onsubmit = ev => {
      ev.preventDefault();
      const f = Object.fromEntries(new FormData(ev.target));
      for (const k of Object.keys(f)) f[k] = f[k].trim() || null;
      ocupado(ev.target.querySelector('button.prim'), async () => {
        const r = d ? await sb.from('disc_devocionales').update(f).eq('id', d.id) : await sb.from('disc_devocionales').insert(f);
        if (r.error) return fallo(r.error.code === '23505' ? { message: 'Ya hay un devocional en esa fecha' } : r.error, 'Devocional');
        cerrarModal(); toast(d ? 'Guardado' : 'Devocional publicado'); api.rutear();
      });
    };
    const bb = $('#bBorrarDev', body);
    if (bb) bb.onclick = async () => {
      if (!confirm('¿Borrar este devocional? También se borran las respuestas que tenga.')) return;
      const { error } = await sb.from('disc_devocionales').delete().eq('id', d.id);
      if (error) return fallo(error, 'Borrar');
      cerrarModal(); toast('Borrado'); api.rutear();
    };
  }

  function modalReto(r) {
    const body = abrirModal(r ? 'Editar reto' : 'Nuevo reto', `
      <form id="fReto">
        <label style="margin-top:0">Título</label><input name="titulo" required maxlength="100" value="${esc(r?.titulo || '')}" placeholder="Ej. 21 días de oración">
        <label>Descripción</label><textarea name="descripcion" maxlength="1000" style="min-height:60px" placeholder="Qué hay que hacer cada día">${esc(r?.descripcion || '')}</textarea>
        <div class="fila"><div><label>Días</label><input type="number" name="dias" min="1" max="365" required value="${r?.dias || 7}"></div>
          <div><label>Nivel de la ruta</label><select name="nivel">${[1, 2, 3, 4].map(n => `<option value="${n}" ${(r?.nivel || 1) === n ? 'selected' : ''}>Nivel ${n}</option>`).join('')}</select></div></div>
        <label class="check"><input type="checkbox" name="activo" ${r?.activo === false ? '' : 'checked'}> Visible para todos</label>
        <button class="btn prim blk">${r ? 'Guardar' : 'Crear reto'}</button>
        ${r ? '<button type="button" class="btn peligro blk" id="bBorrarReto">Borrar reto</button>' : ''}
      </form>`);
    $('#fReto', body).onsubmit = ev => {
      ev.preventDefault();
      const f = Object.fromEntries(new FormData(ev.target));
      const fila = { titulo: f.titulo.trim(), descripcion: f.descripcion.trim() || null, dias: +f.dias, nivel: +f.nivel, activo: !!f.activo };
      ocupado(ev.target.querySelector('button.prim'), async () => {
        const x = r ? await sb.from('disc_retos').update(fila).eq('id', r.id) : await sb.from('disc_retos').insert(fila);
        if (x.error) return fallo(x.error, 'Reto');
        cerrarModal(); toast('Guardado'); api.rutear();
      });
    };
    const bb = $('#bBorrarReto', body);
    if (bb) bb.onclick = async () => {
      if (!confirm('¿Borrar este reto? Se pierde el avance de quienes lo estén haciendo. Si solo quieres esconderlo, desmarca "Visible".')) return;
      const { error } = await sb.from('disc_retos').delete().eq('id', r.id);
      if (error) return fallo(error, 'Borrar');
      cerrarModal(); toast('Borrado'); api.rutear();
    };
  }

  // ===================================================================
  // PERSONAS Y ACCESOS (admin o pastor)
  // ===================================================================
  async function vistaPersonas(ctx) {
    if (!api.esAdmin() && !esPastor()) { location.replace('#/d/inicio'); return; }
    cargando('Personas', { atras: esPastor() ? '#/d/gestion' : '#/d/inicio' });
    await api.recargarPerfiles();
    const e = await estructura(true);
    if (!ctx.vigente()) return;
    const pend = [...st.perfiles.values()].filter(p => p.estado === 'pendiente' || (p.estado === 'aprobado' && !st.modsDe.get(p.id)));
    const miembros = miembrosDisc();
    const porRol = { pastor: [], mentor: [], discipulo: [] };
    miembros.forEach(p => porRol[st.modsDe.get(p.id).discipulado]?.push(p));
    const sinMentor = porRol.discipulo.filter(p => !e.mentorDe.has(p.id)).length;
    const link = `${location.origin}${location.pathname}#/registro?m=discipulado`;
    const pedido = p => (p.solicita?.length ? 'Pidió: ' + p.solicita.map(m => m === 'alabanza' ? 'Alabanza' : 'Discipulado').join(' y ') : 'No indicó módulo');
    app.innerHTML = cab('Personas', { sub: `${miembros.length} en Discipulado`, atras: esPastor() ? '#/d/gestion' : '#/d/inicio' }) + `
      ${pend.length ? `<div class="seccion-t" style="color:var(--peligro)">Solicitudes pendientes (${pend.length})</div>
        <p class="ayuda" style="margin-top:-4px">Conversa con cada persona antes de darle acceso.</p>
        <div class="lista">${pend.map(p => `<button class="item" data-p="${p.id}" style="text-align:left;font:inherit;width:100%">
          <span class="avatar sm">${esc(iniciales(p.nombre))}</span><div class="info"><b>${esc(p.nombre)}</b><small>${esc(pedido(p))} · ${esc(p.email || '')}</small></div><span class="btn sm prim">Revisar</span></button>`).join('')}</div>` : ''}
      ${sinMentor ? `<div class="card d-alerta">⚠️ <span>${sinMentor} ${sinMentor === 1 ? 'discípulo no tiene' : 'discípulos no tienen'} mentor asignado.</span></div>` : ''}
      ${Object.entries(porRol).map(([k, lista]) => lista.length ? `<div class="seccion-t">${lista.length === 1 ? ROLES_D[k] : ROLES_D_PL[k]} (${lista.length})</div>
        <div class="lista">${lista.sort((a, b) => a.nombre.localeCompare(b.nombre)).map(p => `<button class="item" data-p="${p.id}" style="text-align:left;font:inherit;width:100%">
          <span class="avatar sm">${esc(iniciales(p.nombre))}</span><div class="info"><b>${esc(p.nombre)}</b>
          <small>${e.mentorDe.has(p.id) ? 'Mentor: ' + esc(nombreDe(e.mentorDe.get(p.id))) : (k === 'discipulo' ? '⚠️ Sin mentor' : 'Sin mentor')}${e.discipulosDe.get(p.id)?.length ? ` · acompaña a ${e.discipulosDe.get(p.id).length}` : ''}</small></div>✎</button>`).join('')}</div>` : '').join('')}
      <div class="seccion-t">Invitar</div>
      <div class="card"><p class="ayuda" style="margin-top:0">Después de conversar con alguien, mándale este link. Al registrarse queda pendiente hasta que lo apruebes aquí.</p>
        <button class="btn blk" id="bLink" style="margin-top:0">📋 Copiar link de registro</button></div>`;
    $('#bLink').onclick = async () => { try { await navigator.clipboard.writeText(link); toast('Link copiado'); } catch { prompt('Copia este link:', link); } };
    app.onclick = ev => {
      const b = ev.target.closest('[data-p]');
      if (b) api.modalAccesos(st.perfiles.get(b.dataset.p), () => { est = null; api.rutear(); });
    };
  }

  // ===================================================================
  // Router del módulo
  // ===================================================================
  const VISTAS = {
    inicio: vistaInicio, devocional: vistaDevocional, muro: vistaMuro, retos: vistaRetos, mentorias: vistaMentorias,
    discipulos: vistaDiscipulos, discipulo: vistaDiscipulo, gestion: vistaGestion, personas: vistaPersonas,
  };
  const TAB = { discipulos: 'inicio', discipulo: 'inicio', gestion: 'inicio', personas: 'inicio' };
  return {
    tabDe: sub => TAB[sub] || (VISTAS[sub] ? sub : 'inicio'),
    vista(ctx) { (VISTAS[ctx.partes[0]] || vistaInicio)(ctx); },
    olvidar() { est = null; filtroMuro = 'todo'; verTodos = false; },
  };
}
