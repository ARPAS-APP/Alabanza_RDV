// Transposición y render de letras con acordes.
// Formatos soportados:
//   1) ChordPro:            [G]Cuan grande es [D]Él
//   2) Acordes sobre letra:  G          D
//                            Cuan grande es Él
//   Secciones:               "Coro:"  o  {Coro}

const SOSTENIDOS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BEMOLES    = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const LATINO = { C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };
const EXTRA = { Cb: 11, Fb: 4, 'E#': 5, 'B#': 0 };
// Tonalidades mayores que se escriben con bemoles: F, Bb, Eb, Ab, Db
const MAYORES_BEMOL = new Set([5, 10, 3, 8, 1]);

export const TONOS_MAYORES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
export const TONOS_MENORES = ['Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm'];
export const TODOS_LOS_TONOS = [...TONOS_MAYORES, ...TONOS_MENORES];

export function indiceNota(n) {
  if (n in EXTRA) return EXTRA[n];
  let i = SOSTENIDOS.indexOf(n);
  if (i < 0) i = BEMOLES.indexOf(n);
  return i;
}

export function parseTono(tono) {
  const m = /^\s*([A-G][#b]?)\s*(m|min|-)?\s*$/.exec(tono || '');
  if (!m) return null;
  const idx = indiceNota(m[1]);
  return idx < 0 ? null : { idx, menor: !!m[2] };
}

export function usaBemoles(tono) {
  const t = typeof tono === 'string' ? parseTono(tono) : tono;
  if (!t) return false;
  if (t.menor && t.idx === 3) return true; // Ebm en lugar de D#m
  const mayorRelativa = t.menor ? (t.idx + 3) % 12 : t.idx;
  return MAYORES_BEMOL.has(mayorRelativa);
}

/** Semitonos para ir de un tono a otro (−5..+6). */
export function distancia(desde, hasta) {
  const a = parseTono(desde), b = parseTono(hasta);
  if (!a || !b) return 0;
  let d = (b.idx - a.idx + 12) % 12;
  if (d > 6) d -= 12;
  return d;
}

function nombreNota(idx, bemoles) {
  return (bemoles ? BEMOLES : SOSTENIDOS)[((idx % 12) + 12) % 12];
}

export function transponerTono(tono, semis) {
  const t = parseTono(tono);
  if (!t) return tono || '';
  const idx = (t.idx + semis + 120) % 12;
  const bem = usaBemoles({ idx, menor: t.menor });
  return nombreNota(idx, bem) + (t.menor ? 'm' : '');
}

const RE_ACORDE = /^([A-G][#b]?)((?:maj|min|dim|aug|sus|add|alt|m|M|°|ø|\+|-|#|b|\d|\(|\)|\.)*)(?:\/([A-G][#b]?))?$/;

export function esAcorde(tok) {
  return RE_ACORDE.test(tok);
}

export function cifrado(nota, latino) {
  if (!latino) return nota;
  return LATINO[nota[0]] + nota.slice(1);
}

export function transponerAcorde(acorde, semis, bemoles, latino = false) {
  const m = RE_ACORDE.exec(acorde.trim());
  if (!m) return acorde;
  const [, raiz, resto, bajo] = m;
  const r = indiceNota(raiz);
  let out = cifrado(nombreNota(r + semis, bemoles), latino) + resto;
  if (bajo) out += '/' + cifrado(nombreNota(indiceNota(bajo) + semis, bemoles), latino);
  return out;
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Separa paréntesis pegados a un acorde: "(Fm" → { pre: '(', ch: 'Fm', post: '' } */
export function partirTok(t) {
  const m = /^([(]*)(.*?)([)]*)$/.exec(t);
  return { pre: m[1], ch: m[2], post: m[3] };
}

// Caracteres invisibles que llegan al copiar cifrados de internet o de un PDF (espacio de ancho cero, BOM, guion suave…)
const INVISIBLES = /[​-‍⁠﻿­]/g;
export const sinInvisibles = s => String(s || '').replace(INVISIBLES, '');

export function esLineaDeAcordes(linea) {
  linea = sinInvisibles(linea);
  if (linea.includes('[')) return false;
  const toks = linea.trim().split(/\s+/).filter(Boolean);
  if (!toks.length) return false;
  // Permitir marcadores comunes como "|", "-", "x2", "(x2)", "(", ")" y acordes entre paréntesis "( Fm Db Eb )"
  const utiles = toks.map(t => partirTok(t).ch).filter(t => t && !/^(\||x\d+|-+|\/+)$/i.test(t));
  return utiles.length > 0 && utiles.every(esAcorde);
}

function transponerLineaDeAcordes(linea, semis, bemoles, latino) {
  // Mantiene posiciones: cada acorde arranca en la misma columna (si cabe)
  let out = '';
  const re = /\S+/g;
  let m;
  while ((m = re.exec(linea))) {
    const p = partirTok(m[0]);
    const tok = esAcorde(p.ch) ? p.pre + transponerAcorde(p.ch, semis, bemoles, latino) + p.post : m[0];
    if (out.length < m.index) out += ' '.repeat(m.index - out.length);
    else if (out.length) out += ' ';
    out += tok;
  }
  return out;
}

// Nombres de partes de la canción (español e inglés)
const PARTES = 'intro|introducci[oó]n|verso|estrofa|pre-?coro|precoro|pre coro|coro|estribillo|refr[aá]n|puente|interludio|instrumental|final|outro|coda|tag|vamp|solo|rap|declaraci[oó]n|ministraci[oó]n|espont[aá]neo|vers[eo]|chorus|pre-?chorus|bridge|interlude|ending|turnaround|post-?coro|post-?chorus|parte\\s+[a-z0-9]';
const RE_PARTE = new RegExp(`^(?:${PARTES})(?:\\s*\\d+)?(?:\\s*\\(?\\s*x\\s*\\d+\\s*\\)?)?$`, 'i');
const limpiaEtiqueta = t => t.replace(/^[\[(\s]+|[\])\s:]+$/g, '').replace(/\s+/g, ' ').trim();
/** Nombre de la parte con mayúscula inicial ("CORO 2" → "Coro 2") */
const bonito = t => (t === t.toUpperCase() ? t.charAt(0) + t.slice(1).toLowerCase() : t.charAt(0).toUpperCase() + t.slice(1));

/** Si la línea es el nombre de una parte (Coro, [Estrofa 1], (Puente), CORO:, Intro x2…) devuelve el nombre. */
export function etiquetaSeccion(linea) {
  const t = linea.trim();
  if (!t) return null;
  let m = /^\{\s*(?:c|comment|soc|sot)?\s*:?\s*([^}]*)\}$/i.exec(t);
  if (m) return m[1].trim();
  // [Coro] solo en la línea: cualquier nombre que no sea acorde ([Parte A], [Final]…)
  m = /^\[\s*([^\]]{1,30}?)\s*\]\s*:?$/.exec(t);
  if (m && !esAcorde(m[1]) && !esLineaDeAcordes(m[1]) && !/^x\s*\d+$/i.test(m[1])) return bonito(m[1].trim());
  if (!t.includes('[') && t.length <= 40 && /:$/.test(t) && !esLineaDeAcordes(t.slice(0, -1))) return bonito(t.slice(0, -1).trim());
  // Coro, ESTROFA 2, Puente x2 (sin dos puntos)
  if (t.length <= 30 && RE_PARTE.test(limpiaEtiqueta(t))) return bonito(limpiaEtiqueta(t));
  return null;
}

/** Tipo de parte para darle color: estrofa, precoro, coro, puente, inst (intro/interludio) o final. */
export function tipoSeccion(nombre) {
  const t = String(nombre || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/pre[\s-]?(coro|chorus)/.test(t)) return 'precoro';
  if (/post[\s-]?(coro|chorus)/.test(t)) return 'coro';
  if (/coro|estribillo|refran|chorus/.test(t)) return 'coro';
  if (/puente|bridge/.test(t)) return 'puente';
  if (/intro|interlud|instrumental|solo|turnaround/.test(t)) return 'inst';
  if (/final|outro|coda|ending|tag|vamp/.test(t)) return 'final';
  if (/estrofa|verso|verse|parte/.test(t)) return 'estrofa';
  return '';
}

/**
 * Ordena formatos comunes antes de leer la letra:
 *  "[Intro] Fm  Db  Eb" / "Intro: Fm Db Eb" / "CORO Fm Db" → "Intro:" + línea de acordes.
 */
export function normalizarLetra(texto) {
  const out = [];
  const limpio = String(texto || '').replace(/\r/g, '')
    // caracteres invisibles que vienen al copiar de páginas web o PDF
    .replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/g, '')
    // espacios raros (duro, fino, etc.) → espacio normal, para que los acordes se reconozcan
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    // ♯ ♭ y barras raras → # b /
    .replace(/♯/g, '#').replace(/♭/g, 'b').replace(/[⁄∕]/g, '/')
    // tabulaciones → espacios respetando la columna (cada 8)
    .split('\n').map(l => l.includes('\t') ? l.split('\t').reduce((acc, parte, i, arr) => acc + parte + (i < arr.length - 1 ? ' '.repeat(8 - ((acc + parte).length % 8)) : ''), '') : l);
  for (const l of limpio) {
    const m = /^(\s*)(\[[^\]]{1,30}\]|\([^)]{1,30}\)|[^\s:\[\]()][^:\[\]()]{0,28}:|\S+(?:\s+\d)?)\s+(.*\S.*)$/.exec(l);
    if (m) {
      const nombre = etiquetaSeccion(m[2]);
      if (nombre !== null && esLineaDeAcordes(m[3])) {
        out.push(nombre + ':');
        out.push(m[3]);
        continue;
      }
    }
    out.push(l);
  }
  return out.join('\n');
}

/**
 * Convierte la letra en HTML.
 * @param {string} texto
 * @param {object} op { semis, bemoles, acordes (mostrar), latino }
 */
export function renderLetra(texto, { semis = 0, bemoles = false, acordes = true, latino = false } = {}) {
  const lineas = normalizarLetra(texto).split('\n');
  const formatoClasico = lineas.some(esLineaDeAcordes);
  const html = [];
  for (const linea of lineas) {
    if (!linea.trim()) { html.push('<div class="l-vacia"></div>'); continue; }
    const sec = etiquetaSeccion(linea);
    if (sec !== null) { const tipo = tipoSeccion(sec); html.push(`<div class="l-seccion${tipo ? ' sec-' + tipo : ''}"><span>${esc(sec)}</span></div>`); continue; }

    if (esLineaDeAcordes(linea)) {
      if (acordes) html.push(`<div class="l-acordes mono">${esc(transponerLineaDeAcordes(linea, semis, bemoles, latino))}</div>`);
      continue;
    }

    if (linea.includes('[')) {
      const partes = [];
      const re = /\[([^\]]*)\]/g;
      let ultimo = 0, acorde = null, m;
      while ((m = re.exec(linea))) {
        const txt = linea.slice(ultimo, m.index);
        if (txt || acorde !== null) partes.push({ acorde, txt });
        acorde = m[1];
        ultimo = re.lastIndex;
      }
      partes.push({ acorde, txt: linea.slice(ultimo) });
      if (!acordes) {
        html.push(`<div class="l-letra">${esc(partes.map(p => p.txt).join(''))}</div>`);
        continue;
      }
      // Cada palabra es un bloque para que las líneas largas puedan saltar de renglón;
      // el acorde queda pegado a la primera palabra que le sigue.
      const seg = (ch, txt) =>
        `<span class="seg"><span class="ch">${ch ? esc(ch) : '&nbsp;'}</span><span class="ly">${txt ? esc(txt).replace(/ /g, '&nbsp;') : '&nbsp;'}</span></span>`;
      const segs = [];
      for (const p of partes) {
        const ch = p.acorde ? transponerAcorde(p.acorde, semis, bemoles, latino) : '';
        const palabras = p.txt.match(/\S*\s*/g).filter(Boolean);
        if (!palabras.length) { segs.push(seg(ch, '')); continue; }
        palabras.forEach((w, i) => segs.push(seg(i === 0 ? ch : '', w)));
      }
      html.push(`<div class="l-chordpro">${segs.join('')}</div>`);
      continue;
    }

    html.push(`<div class="l-letra${formatoClasico ? ' mono' : ''}">${esc(linea)}</div>`);
  }
  return html.join('');
}

/** Detecta el primer acorde de la letra (útil para sugerir el tono original). */
export function primerAcorde(texto) {
  texto = normalizarLetra(texto);
  // primer [acorde] que de verdad sea acorde (no [Coro] ni [Bridge])
  const ac = [...texto.matchAll(/\[([^\]]+)\]/g)].map(x => x[1].trim()).find(esAcorde);
  const m = ac && /^([A-G][#b]?)(m(?!aj))?/.exec(ac);
  if (m) return m[1] + (m[2] || '');
  for (const l of String(texto || '').split('\n')) {
    if (esLineaDeAcordes(l)) {
      const tok = l.trim().split(/\s+/).find(esAcorde);
      const p = tok && /^([A-G][#b]?)(m(?!aj))?/.exec(tok);
      if (p) return p[1] + (p[2] || '');
    }
  }
  return null;
}

/** Acordes sugeridos para un tono: los del grado (diatónicos) y algunos comunes en alabanza. */
export function acordesDelTono(tono) {
  const t = parseTono(tono);
  if (!t) return { diatonicos: [], extras: [] };
  const bem = usaBemoles(t);
  const n = s => nombreNota(t.idx + s, bem);
  if (!t.menor) {
    const diatonicos = [n(0), n(2) + 'm', n(4) + 'm', n(5), n(7), n(9) + 'm', n(11) + 'dim'];
    const extras = [`${n(0)}/${n(4)}`, `${n(7)}/${n(11)}`, `${n(7)}sus4`, `${n(0)}sus4`, `${n(5)}maj7`, `${n(0)}2`, `${n(9)}m7`, nombreNota(t.idx + 10, true), `${n(5)}/${n(9)}`, `${n(4)}`];
    return { diatonicos, extras };
  }
  const diatonicos = [n(0) + 'm', n(2) + 'dim', n(3), n(5) + 'm', n(7) + 'm', n(8), n(10)];
  const extras = [n(7), `${n(7)}7`, `${n(0)}m7`, `${n(3)}/${n(7)}`, `${n(10)}/${n(2)}`, `${n(5)}m7`, `${n(0)}sus4`];
  return { diatonicos, extras };
}

/**
 * Convierte el formato "acordes en la línea de arriba" al formato con corchetes,
 * respetando la columna donde está cada acorde.
 */
export function aCorchetes(texto) {
  const lineas = normalizarLetra(texto).split('\n');
  const out = [];
  // Línea con solo acordes entre corchetes ("[A]      [D]") encima de la letra: se trata como línea de acordes
  const soloCorchetes = l => /^\s*(\[[^\]]+\]\s*)+$/.test(l) && [...l.matchAll(/\[([^\]]+)\]/g)].every(x => esAcorde(x[1].trim()));
  for (let i = 0; i < lineas.length; i++) {
    let l = lineas[i];
    if (soloCorchetes(l)) {
      const sig = lineas[i + 1];
      if (sig !== undefined && sig.trim() && !esLineaDeAcordes(sig) && !soloCorchetes(sig) && !sig.includes('[') && etiquetaSeccion(sig) === null) {
        l = l.replace(/\[([^\]]+)\]/g, (_, ch) => ch.trim() + ' '.repeat(Math.max(0, _.length - ch.trim().length)));
      } else { out.push(l); continue; }
    }
    if (!esLineaDeAcordes(l)) { out.push(l); continue; }
    const acordes = [];
    const re = /\S+/g; let m;
    while ((m = re.exec(l))) acordes.push({ col: m.index, ch: m[0] });
    const sig = lineas[i + 1];
    const esLetra = sig !== undefined && sig.trim() && !esLineaDeAcordes(sig) && etiquetaSeccion(sig) === null;
    const corch = t => { const p = partirTok(t); return esAcorde(p.ch) ? `${p.pre}[${p.ch}]${p.post}` : t; };
    if (!esLetra) { out.push(acordes.map(a => corch(a.ch)).join(' ')); continue; }
    let letra = sig;
    const largo = Math.max(...acordes.map(a => a.col));
    if (letra.length < largo) letra = letra.padEnd(largo, ' ');
    for (const a of [...acordes].reverse()) {
      const p = partirTok(a.ch);
      const tok = esAcorde(p.ch) ? `[${p.ch}]` : '';
      letra = letra.slice(0, a.col) + tok + letra.slice(a.col);
    }
    out.push(letra.replace(/\s+$/, ''));
    i++;
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------
// Medleys
// ---------------------------------------------------------------------
/**
 * Divide la letra en partes según sus títulos (Coro, Estrofa 1, [Puente]…).
 * Devuelve [{ nombre, texto }]. Lo que va antes del primer título queda como "Inicio";
 * una letra sin títulos es una sola parte "Toda la canción".
 */
export function seccionesDe(texto) {
  const partes = [];
  let actual = null, hayTitulos = false;
  for (const linea of normalizarLetra(texto).split('\n')) {
    const sec = etiquetaSeccion(linea);
    if (sec !== null) { hayTitulos = true; actual = { nombre: sec, lineas: [] }; partes.push(actual); continue; }
    if (!actual) { if (!linea.trim()) continue; actual = { nombre: 'Inicio', lineas: [] }; partes.push(actual); }
    actual.lineas.push(linea);
  }
  if (!hayTitulos && partes.length === 1) partes[0].nombre = 'Toda la canción';
  return partes
    .map(p => { while (p.lineas.length && !p.lineas[p.lineas.length - 1].trim()) p.lineas.pop(); return { nombre: p.nombre, texto: p.lineas.join('\n') }; })
    .filter(p => p.texto.trim());
}

/** Transpone todos los acordes de un texto ([G]letra o líneas de acordes), sin tocar títulos ni letra. */
export function transponerTexto(texto, semis, bemoles = false) {
  if (!semis) return String(texto || '');
  return String(texto || '').split('\n').map(l => {
    if (etiquetaSeccion(l) !== null) return l;
    if (esLineaDeAcordes(l)) return transponerLineaDeAcordes(l, semis, bemoles, false);
    return l.replace(/\[([^\]]+)\]/g, (m, ch) => (esAcorde(ch.trim()) ? `[${transponerAcorde(ch.trim(), semis, bemoles)}]` : m));
  }).join('\n');
}

/**
 * Arma la letra de un medley.
 * @param partes [{ cancion_id, secciones: [índices], tono }]   (secciones vacío = toda la canción)
 * @param canciones Map id -> { titulo, tono_original, letra }
 * Cada parte queda en su propio tono; entre partes con distinto tono se marca el cambio.
 */
export function componerMedley(partes, canciones) {
  const out = [];
  let tonoAnterior = null;
  for (const p of partes) {
    const c = canciones.get(p.cancion_id);
    if (!c) continue;
    const secs = seccionesDe(c.letra || '');
    const elegidas = p.secciones?.length ? p.secciones.map(i => secs[i]).filter(Boolean) : secs;
    if (!elegidas.length) continue;
    const tono = parseTono(p.tono) ? p.tono : c.tono_original;
    const semis = parseTono(c.tono_original) && parseTono(tono) ? distancia(c.tono_original, tono) : 0;
    const bem = parseTono(tono) ? usaBemoles(tono) : false;
    if (tonoAnterior && parseTono(tono) && tono !== tonoAnterior) out.push(`{c: Cambio de tono → ${tono}}`);
    if (parseTono(tono)) tonoAnterior = tono;
    for (const s of elegidas) {
      const unica = s.nombre === 'Toda la canción';
      out.push(`{c: ${unica ? c.titulo : `${s.nombre} · ${c.titulo}`}}`);
      out.push(transponerTexto(s.texto, semis, bem));
      out.push('');
    }
  }
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return out.join('\n');
}
