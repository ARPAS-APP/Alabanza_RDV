// Diagramas de acordes: al tocar un acorde en la letra o el cifrado se abre
// cómo se hace en guitarra (posiciones en el mástil) y en piano (teclas).
// - Piano: las notas salen de la fórmula del acorde, sirve para cualquier acorde.
// - Guitarra: posiciones conocidas para los acordes abiertos más usados y, para el
//   resto, se buscan posiciones tocables (máx. 4 trastes, bajo correcto, 4 dedos).

const SOS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BEM = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const LAT = { C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };
const EXTRA = { Cb: 11, Fb: 4, 'E#': 5, 'B#': 0 };
const idx = n => (n in EXTRA ? EXTRA[n] : SOS.indexOf(n) >= 0 ? SOS.indexOf(n) : BEM.indexOf(n));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Lee un acorde ("F#7b9", "Am/E", "C69", "G2/B") → { raiz, bajo, tonos: [{ st, nombre, esencial }] } */
export function leerAcorde(txt) {
  const m = /^([A-G][#b]?)(.*?)(?:\/([A-G][#b]?))?$/.exec(String(txt || '').trim());
  if (!m) return null;
  const raiz = idx(m[1]);
  if (raiz < 0) return null;
  const bajo = m[3] ? idx(m[3]) : raiz;
  let q = m[2].replace(/[()\s.]/g, '');

  let tercera = 4, quinta = 7, septima = null, sinTercera = false, sinQuinta = false;
  const ext = [];
  if (/^(mmaj|mMaj|minmaj|m\+7|-maj)/.test(q)) { tercera = 3; septima = 11; q = q.replace(/^(mmaj|mMaj|minmaj|-maj)/, ''); q = q.replace(/^\+7/, ''); }
  else if (/^(m(?!aj)|min|-)/.test(q)) { tercera = 3; q = q.replace(/^(min|m|-)/, ''); }
  if (/^ø/.test(q)) { tercera = 3; quinta = 6; septima = 10; q = q.slice(1); }
  if (/^(dim|°)/.test(q)) {
    tercera = 3; quinta = 6; q = q.replace(/^(dim|°)/, '');
    if (/^7/.test(q)) { septima = 9; q = q.slice(1); }
  }
  if (/^(aug|\+)/.test(q)) { quinta = 8; q = q.replace(/^(aug|\+)/, ''); }
  // alteraciones b5 #5 b9 #9 #11 b13
  q = q.replace(/([#b])(5|9|11|13)/g, (_, a, n) => {
    const base = { 5: 7, 9: 14, 11: 17, 13: 21 }[n];
    const st = base + (a === '#' ? 1 : -1);
    if (n === '5') quinta = st; else ext.push(st);
    if ((n === '9' || n === '11' || n === '13') && septima === null) septima = 10;
    return '';
  });
  // sus
  q = q.replace(/sus(2|4)?/g, (_, n) => { sinTercera = true; ext.push(n === '2' ? 2 : 5); return ''; });
  // add
  q = q.replace(/add(\d+)/g, (_, n) => { ext.push({ 2: 2, 9: 14, 4: 5, 11: 17, 6: 9, 13: 21 }[n] ?? 14); return ''; });
  // maj7 / maj9 / maj13 / M7
  q = q.replace(/(maj|M|Δ)(7|9|11|13)?/g, (_, __, n) => {
    septima = 11;
    if (n === '9') ext.push(14);
    if (n === '11') ext.push(14, 17);
    if (n === '13') ext.push(14, 21);
    return '';
  });
  // números que quedan
  if (/^69/.test(q)) { ext.push(9, 14); q = q.slice(2); }
  const nums = [...q.matchAll(/\d+/g)].map(x => +x[0]);
  for (const n of nums) {
    if (n === 5 && !nums.some(k => k !== 5)) { sinTercera = true; }
    else if (n === 6) ext.push(9);
    else if (n === 7) { if (septima === null) septima = 10; }
    else if (n === 9) { if (septima === null) septima = 10; ext.push(14); }
    else if (n === 11) { if (septima === null) septima = 10; ext.push(17); }
    else if (n === 13) { if (septima === null) septima = 10; ext.push(21); }
    else if (n === 2) ext.push(14);
    else if (n === 4) { sinTercera = true; ext.push(5); }
    else if (n === 1) { sinTercera = true; sinQuinta = true; }
  }

  const tonos = [{ st: 0, nombre: '1', esencial: true }];
  if (!sinTercera) tonos.push({ st: tercera, nombre: tercera === 3 ? '♭3' : '3', esencial: true });
  if (!sinQuinta) tonos.push({ st: quinta, nombre: quinta === 7 ? '5' : quinta === 6 ? '♭5' : '♯5', esencial: quinta !== 7 });
  if (septima !== null) tonos.push({ st: septima, nombre: septima === 11 ? '7' : septima === 9 ? '𝄫7' : '♭7', esencial: true });
  const NOMBRE_EXT = { 1: '♭9', 2: '2', 3: '♯9', 5: '4', 6: '♯11', 8: '♭13', 9: '6', 13: '♭9', 14: '9', 15: '♯9', 17: '11', 18: '♯11', 20: '♭13', 21: '13' };
  for (const e of ext) {
    if (tonos.some(t => t.st % 12 === e % 12)) continue;
    tonos.push({ st: e, nombre: NOMBRE_EXT[e] || String(e), esencial: true });
  }
  return { raiz, bajo, tonos };
}

const nombreNota = (pc, bem, latino) => {
  const n = (bem ? BEM : SOS)[((pc % 12) + 12) % 12];
  return latino ? LAT[n[0]] + n.slice(1).replace('#', '♯').replace('b', '♭') : n.replace('#', '♯').replace(/(?<=.)b/, '♭');
};

// ---------------------------------------------------------------------
// Guitarra
// ---------------------------------------------------------------------
const AFINACION = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4 (de la 6.ª a la 1.ª cuerda)

// Formas abiertas comunes (de la 6.ª a la 1.ª cuerda; x = no se toca)
const ABIERTOS = {
  C: 'x32010', 'C7': 'x32310', 'Cmaj7': 'x32000', 'Cadd9': 'x32030', 'C/E': '032010', 'C/G': '332010',
  D: 'xx0232', Dm: 'xx0231', 'D7': 'xx0212', 'Dmaj7': 'xx0222', 'Dsus4': 'xx0233', 'Dsus2': 'xx0230', 'D/F#': '200232', 'Dm7': 'xx0211', 'D2': 'xx0230',
  E: '022100', Em: '022000', 'E7': '020100', 'Em7': '022030', 'Esus4': '022200', 'Emaj7': '021100',
  F: '133211', 'Fmaj7': 'xx3210',
  G: '320003', 'G7': '320001', 'G/B': 'x20003', 'Gmaj7': '320002', 'Gsus4': '330013', 'G2': '320033', 'Gadd9': '320203',
  A: 'x02220', Am: 'x02210', 'A7': 'x02020', 'Am7': 'x02010', 'Amaj7': 'x02120', 'Asus4': 'x02230', 'Asus2': 'x02200', 'A2': 'x02200', 'Am/E': '002210', 'A/C#': 'x42220',
  B7: 'x21202', Bm: 'x24432', 'Bm7': 'x20202',
};

const pcs = (ac) => new Set(ac.tonos.map(t => (ac.raiz + t.st) % 12));

/** Busca posiciones tocables. Devuelve hasta `max` [{ trastes:[-1|0..], base }] */
export function posicionesGuitarra(nombre, max = 3) {
  const ac = leerAcorde(nombre);
  if (!ac) return [];
  const permitidas = pcs(ac);
  const esenciales = new Set(ac.tonos.filter(t => t.esencial).map(t => (ac.raiz + t.st) % 12));
  permitidas.add(ac.bajo); // el bajo de un acorde con barra puede no ser nota del acorde (A7sus4/C#)
  const resultados = [];

  const fijo = ABIERTOS[nombre.replace(/♯/g, '#').replace(/♭/g, 'b')];
  if (fijo) resultados.push(evaluar([...fijo].map(c => (c === 'x' ? -1 : +c))));

  for (let base = 0; base <= 10; base++) {
    const opciones = AFINACION.map(() => {
      const o = [-1];
      if (base <= 1) o.push(0);
      for (let f = Math.max(1, base); f <= base + 3; f++) o.push(f);
      return o;
    });
    const actual = [];
    const recorrer = i => {
      if (i === 6) {
        const r = evaluar(actual.slice());
        if (r) resultados.push(r);
        return;
      }
      for (const f of opciones[i]) {
        if (f >= 0 && !permitidas.has((AFINACION[i] + f) % 12)) continue;
        actual[i] = f;
        recorrer(i + 1);
      }
    };
    recorrer(0);
  }

  function evaluar(tr) {
    const sonando = tr.map((f, i) => (f >= 0 ? i : -1)).filter(i => i >= 0);
    if (sonando.length < 3) return null;
    // las cuerdas sin tocar solo por los extremos (bajos o la 1.ª)
    const primera = sonando[0], ultima = sonando[sonando.length - 1];
    for (let i = primera; i <= ultima; i++) if (tr[i] < 0) return null;
    if (ultima < 4 && sonando.length < 4 && ac.tonos.length > 2) return null; // salvo acordes de potencia (A5)
    // el bajo tiene que ser el correcto
    if ((AFINACION[primera] + tr[primera]) % 12 !== ac.bajo) return null;
    const suenan = new Set(sonando.map(i => (AFINACION[i] + tr[i]) % 12));
    for (const e of esenciales) if (!suenan.has(e)) return null;
    const pisados = sonando.filter(i => tr[i] > 0).map(i => tr[i]);
    const minF = pisados.length ? Math.min(...pisados) : 0;
    const maxF = pisados.length ? Math.max(...pisados) : 0;
    if (maxF - minF > 3) return null;
    // dedos: cejilla en el traste más bajo si se pisa en 2+ cuerdas sin cuerdas al aire debajo
    const enMin = sonando.filter(i => tr[i] === minF && minF > 0);
    const hayAire = sonando.some(i => tr[i] === 0);
    const cejilla = minF > 0 && enMin.length >= 2 && !hayAire;
    const dedos = (cejilla ? 1 : 0) + pisados.filter(f => !(cejilla && f === minF)).length;
    if (dedos > 4) return null;
    let puntos = minF * 1.2 + (6 - sonando.length) * 2 + dedos * 0.6 + (maxF - minF) * 0.8 - (hayAire ? 1 : 0);
    if ((AFINACION[primera] + tr[primera]) % 12 !== ac.raiz && ac.bajo === ac.raiz) puntos += 5;
    return { trastes: tr, cejilla: cejilla ? { traste: minF, desde: enMin[0], hasta: enMin[enMin.length - 1] } : null, puntos };
  }

  // ordenar, quitar repetidas y quedarse con posiciones distintas en el mástil
  const vistos = new Set();
  const salida = [];
  const ordenadas = resultados.filter(Boolean).sort((a, b) => a.puntos - b.puntos);
  if (fijo && resultados[0]) { ordenadas.unshift(resultados[0]); }
  const zonas = [];
  for (const r of ordenadas) {
    const k = r.trastes.join(',');
    if (vistos.has(k)) continue;
    vistos.add(k);
    const pis = r.trastes.filter(f => f > 0);
    const zona = pis.length ? Math.min(...pis) : 0;
    if (zonas.some(z => Math.abs(z - zona) < 2)) continue;
    zonas.push(zona);
    salida.push(r);
    if (salida.length >= max) break;
  }
  return salida;
}

function svgGuitarra(pos, latinoNotas) {
  const { trastes, cejilla } = pos;
  const pis = trastes.filter(f => f > 0);
  const minF = pis.length ? Math.min(...pis) : 1;
  const maxF = pis.length ? Math.max(...pis) : 1;
  const base = maxF <= 4 ? 1 : minF;
  const W = 150, H = 190, x0 = 25, y0 = 40, dx = 20, dy = 30, nTr = 5;
  const X = i => x0 + i * dx;
  const Y = f => y0 + (f - base) * dy + dy / 2;
  let s = `<svg viewBox="0 0 ${W} ${H}" class="dg-gtr" role="img" aria-label="Diagrama de guitarra">`;
  // cejuela o número de traste
  if (base === 1) s += `<rect x="${x0 - 1}" y="${y0 - 5}" width="${dx * 5 + 2}" height="5" class="dg-cejuela"/>`;
  else s += `<text x="${x0 - 8}" y="${y0 + dy / 2 + 4}" class="dg-base" text-anchor="end">${base}</text>`;
  for (let i = 0; i <= nTr; i++) s += `<line x1="${x0}" y1="${y0 + i * dy}" x2="${x0 + dx * 5}" y2="${y0 + i * dy}" class="dg-traste"/>`;
  for (let i = 0; i < 6; i++) s += `<line x1="${X(i)}" y1="${y0}" x2="${X(i)}" y2="${y0 + dy * nTr}" class="dg-cuerda"/>`;
  // dedos: cejilla = 1, el resto según el traste
  // en posición abierta, dedo = traste (1.º traste índice…); arriba del mástil, contando desde el traste más bajo
  const dedo = f => Math.min(4, base === 1 && !cejilla ? f : f - minF + 1);
  if (cejilla) s += `<rect x="${X(cejilla.desde) - 7}" y="${Y(cejilla.traste) - 7}" width="${X(cejilla.hasta) - X(cejilla.desde) + 14}" height="14" rx="7" class="dg-punto"/><text x="${(X(cejilla.desde) + X(cejilla.hasta)) / 2}" y="${Y(cejilla.traste) + 4}" class="dg-dedo" text-anchor="middle">1</text>`;
  trastes.forEach((f, i) => {
    if (f < 0) s += `<text x="${X(i)}" y="${y0 - 12}" class="dg-xo" text-anchor="middle">×</text>`;
    else if (f === 0) s += `<circle cx="${X(i)}" cy="${y0 - 16}" r="5" class="dg-aire"/>`;
    else if (!(cejilla && f === cejilla.traste && i >= cejilla.desde && i <= cejilla.hasta)) {
      s += `<circle cx="${X(i)}" cy="${Y(f)}" r="8" class="dg-punto"/><text x="${X(i)}" y="${Y(f) + 4}" class="dg-dedo" text-anchor="middle">${dedo(f)}</text>`;
    }
    // nota abajo
    if (f >= 0) s += `<text x="${X(i)}" y="${y0 + dy * nTr + 16}" class="dg-nota" text-anchor="middle">${esc(latinoNotas[(AFINACION[i] + f) % 12])}</text>`;
  });
  return s + '</svg>';
}

// ---------------------------------------------------------------------
// Piano
// ---------------------------------------------------------------------
/** Notas para el piano: bajo en la mano izquierda, acorde en posición cerrada a la derecha. */
export function notasPiano(nombre) {
  const ac = leerAcorde(nombre);
  if (!ac) return null;
  const izq = 36 + ac.bajo; // bajo en la octava de C2
  const der = [];
  const raizDer = 60 + ac.raiz - (ac.raiz > 5 ? 12 : 0); // cerca del Do central
  const sts = [...new Set(ac.tonos.map(t => t.st))].sort((a, b) => a - b);
  for (const st of sts) {
    let n = raizDer + st;
    while (n > raizDer + 14) n -= 12; // tensiones (9, 11, 13) cerca del acorde
    der.push(n);
  }
  der.sort((a, b) => a - b);
  return { izq, der: [...new Set(der)], ac };
}

function svgPiano(p, nombres) {
  // teclado de 3 octavas (o más) que incluya todas las notas marcadas
  const todas = [p.izq, ...p.der];
  const desde = 12 * Math.floor(Math.min(...todas) / 12);
  const hasta = Math.max(desde + 36, 12 * Math.ceil((Math.max(...todas) + 1) / 12));
  const blancas = [];
  for (let n = desde; n < hasta; n++) if (![1, 3, 6, 8, 10].includes(n % 12)) blancas.push(n);
  const bw = 14, bh = 80, nw = 9, nh = 50;
  const W = blancas.length * bw + 2;
  const marcadas = new Map([[p.izq, 'izq'], ...p.der.map(n => [n, 'der'])]);
  let s = `<svg viewBox="0 0 ${W} ${bh + 22}" class="dg-piano" role="img" aria-label="Teclado de piano">`;
  blancas.forEach((n, i) => {
    const c = marcadas.get(n);
    s += `<rect x="${1 + i * bw}" y="1" width="${bw}" height="${bh}" class="dg-blanca${c ? ' on ' + c : ''}"/>`;
    if (c) s += `<text x="${1 + i * bw + bw / 2}" y="${bh + 15}" class="dg-nota" text-anchor="middle">${esc(nombres[n % 12])}</text>`;
  });
  for (let n = desde; n < hasta; n++) {
    if (![1, 3, 6, 8, 10].includes(n % 12)) continue;
    const i = blancas.findIndex(b => b > n);
    const x = 1 + i * bw - nw / 2;
    const c = marcadas.get(n);
    s += `<rect x="${x}" y="1" width="${nw}" height="${nh}" rx="1.5" class="dg-negra${c ? ' on ' + c : ''}"/>`;
    if (c) s += `<text x="${x + nw / 2}" y="${bh + 15}" class="dg-nota" text-anchor="middle">${esc(nombres[n % 12])}</text>`;
  }
  return s + '</svg>';
}

// ---------------------------------------------------------------------
// Sonido (para escuchar cómo suena)
// ---------------------------------------------------------------------
let ctx;
function tocar(midis, arpegio = false) {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = ctx.currentTime + 0.02;
    midis.forEach((m, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = 440 * Math.pow(2, (m - 69) / 12);
      const t = t0 + (arpegio ? i * 0.07 : 0);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.18 / Math.sqrt(midis.length), t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0008, t + 1.8);
      o.connect(g).connect(ctx.destination);
      o.start(t); o.stop(t + 1.9);
    });
  } catch { /* sin audio */ }
}

// ---------------------------------------------------------------------
// Ventana
// ---------------------------------------------------------------------
const PREF = 'arpas.diagrama';

/**
 * Contenido de la ventana para un acorde.
 * @param {string} nombre  acorde en cifrado americano (ya transpuesto)
 * @param {string} visto   cómo se ve en pantalla (puede estar en cifrado latino)
 * @param {boolean} latino nombres de notas en Do-Re-Mi
 */
export function htmlAcorde(nombre, visto, latino) {
  const ac = leerAcorde(nombre);
  if (!ac) return `<p class="ayuda">No reconozco el acorde "${esc(visto || nombre)}".</p>`;
  // notas con bemoles si el acorde está escrito con bemoles o su raíz es F
  const bem = /^[A-G]b|\/[A-G]b/.test(nombre) || /^F(?!#)/.test(nombre);
  const nombres = Array.from({ length: 12 }, (_, pc) => nombreNota(pc, bem, latino));
  const formula = ac.tonos.map(t => `<span class="dg-tono"><b>${esc(nombres[(ac.raiz + t.st) % 12])}</b><small>${esc(t.nombre)}</small></span>`).join('');
  const bajo = ac.bajo !== ac.raiz ? `<p class="dg-bajo">Bajo en <b>${esc(nombres[ac.bajo])}</b></p>` : '';
  const posiciones = posicionesGuitarra(nombre, 3);
  const p = notasPiano(nombre);
  const gtr = posiciones.length
    ? `<div class="dg-gtr-lista">${posiciones.map((pos, i) => `<figure>${svgGuitarra(pos, nombres)}<figcaption>${i === 0 ? 'Más común' : 'Otra posición'}</figcaption></figure>`).join('')}</div>`
    : '<p class="ayuda">No encontré una posición cómoda en guitarra para este acorde. Puedes tocar las notas de la fórmula.</p>';
  let pref = 'gtr';
  try { pref = localStorage.getItem(PREF) || 'gtr'; } catch { /* nada */ }
  return `
    <div class="dg" data-dg>
      <div class="dg-formula">${formula}</div>${bajo}
      <div class="segmentado dg-tabs">
        <button type="button" class="${pref === 'gtr' ? 'activo' : ''}" data-dg-tab="gtr">🎸 Guitarra</button>
        <button type="button" class="${pref === 'pno' ? 'activo' : ''}" data-dg-tab="pno">🎹 Piano</button>
      </div>
      <div class="dg-panel" data-dg-panel="gtr" ${pref === 'gtr' ? '' : 'hidden'}>
        ${gtr}
        <p class="dg-ley">● dedo (1 índice, 2 medio, 3 anular, 4 meñique) · ○ cuerda al aire · × no se toca · el número a la izquierda es el traste</p>
      </div>
      <div class="dg-panel" data-dg-panel="pno" ${pref === 'pno' ? '' : 'hidden'}>
        ${svgPiano(p, nombres)}
        <p class="dg-ley"><span class="dg-chip izq"></span> mano izquierda (bajo) · <span class="dg-chip der"></span> mano derecha (acorde)</p>
      </div>
      <div class="dg-acciones">
        <button type="button" class="btn sm" data-dg-oir="junto">🔊 Escuchar</button>
        <button type="button" class="btn sm" data-dg-oir="arpegio">🎶 Nota por nota</button>
      </div>
    </div>`;
}

/** Activa pestañas y sonido dentro del contenido ya insertado. */
export function activarAcorde(body, nombre) {
  const p = notasPiano(nombre);
  body.querySelectorAll('[data-dg-tab]').forEach(b => (b.onclick = () => {
    body.querySelectorAll('[data-dg-tab]').forEach(x => x.classList.toggle('activo', x === b));
    body.querySelectorAll('[data-dg-panel]').forEach(x => (x.hidden = x.dataset.dgPanel !== b.dataset.dgTab));
    try { localStorage.setItem(PREF, b.dataset.dgTab); } catch { /* nada */ }
  }));
  body.querySelectorAll('[data-dg-oir]').forEach(b => (b.onclick = () => p && tocar([p.izq, ...p.der], b.dataset.dgOir === 'arpegio')));
}
