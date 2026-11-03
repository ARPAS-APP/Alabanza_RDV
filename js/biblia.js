// =====================================================================
// BIBLIA · versiones en español de uso libre (archivos en biblia/<versión>/<LIBRO>.json)
// Cada archivo es [capítulos][versículos] = texto. Fuente: github.com/seven1m/open-bibles
// =====================================================================

export const VERSIONES = {
  rv1909: { nombre: 'Reina-Valera 1909', corto: 'RV1909', nota: 'Dominio público' },
  bes:    { nombre: 'La Biblia en Español Sencillo', corto: 'BES', nota: 'CC BY 4.0 · Biblia en Español Sencillo' },
  vbl:    { nombre: 'Versión Biblia Libre', corto: 'VBL', nota: 'CC BY-SA 4.0 · Free Bible Ministry' },
  pdt:    { nombre: 'Palabra de Dios para ti', corto: 'PDT', nota: 'CC BY-SA 4.0 · usa nombres hebreos (ʼElohim, YHVH)' },
};
// Versiones con derechos de autor: se abren en Bible Gateway, que tiene la licencia
export const EXTERNAS = [['RVR1960', 'RVR1960'], ['NVI', 'NVI'], ['NTV', 'NTV'], ['LBLA', 'LBLA'], ['DHH', 'DHH']];

// [id, nombre, capítulos, abreviaturas aceptadas]
export const LIBROS = [
  ['GEN', 'Génesis', 50, 'Gn Gén Gen'], ['EXO', 'Éxodo', 40, 'Ex Éx Exo Éxo'], ['LEV', 'Levítico', 27, 'Lv Lev'],
  ['NUM', 'Números', 36, 'Nm Núm Num'], ['DEU', 'Deuteronomio', 34, 'Dt Deut'], ['JOS', 'Josué', 24, 'Jos'],
  ['JDG', 'Jueces', 21, 'Jue Jc'], ['RUT', 'Rut', 4, 'Rt'], ['1SA', '1 Samuel', 31, '1S 1Sa 1Sam'], ['2SA', '2 Samuel', 24, '2S 2Sa 2Sam'],
  ['1KI', '1 Reyes', 22, '1R 1Re 1Rey'], ['2KI', '2 Reyes', 25, '2R 2Re 2Rey'], ['1CH', '1 Crónicas', 29, '1Cr 1Cro 1Crón'],
  ['2CH', '2 Crónicas', 36, '2Cr 2Cro 2Crón'], ['EZR', 'Esdras', 10, 'Esd'], ['NEH', 'Nehemías', 13, 'Neh Ne'],
  ['EST', 'Ester', 10, 'Est'], ['JOB', 'Job', 42, 'Jb'], ['PSA', 'Salmos', 150, 'Salmo Sal Sl'], ['PRO', 'Proverbios', 31, 'Pr Prov'],
  ['ECC', 'Eclesiastés', 12, 'Ec Ecl'], ['SNG', 'Cantares', 8, 'Cnt Cant'], ['ISA', 'Isaías', 66, 'Is Isa'],
  ['JER', 'Jeremías', 52, 'Jer Jr'], ['LAM', 'Lamentaciones', 5, 'Lm Lam'], ['EZK', 'Ezequiel', 48, 'Ez Eze'],
  ['DAN', 'Daniel', 12, 'Dn Dan'], ['HOS', 'Oseas', 14, 'Os'], ['JOL', 'Joel', 3, 'Jl'], ['AMO', 'Amós', 9, 'Am'],
  ['OBA', 'Abdías', 1, 'Abd'], ['JON', 'Jonás', 4, 'Jon'], ['MIC', 'Miqueas', 7, 'Mi Miq'], ['NAM', 'Nahúm', 3, 'Nah'],
  ['HAB', 'Habacuc', 3, 'Hab'], ['ZEP', 'Sofonías', 3, 'Sof'], ['HAG', 'Hageo', 2, 'Hag'], ['ZEC', 'Zacarías', 14, 'Zac'],
  ['MAL', 'Malaquías', 4, 'Mal'], ['MAT', 'Mateo', 28, 'Mt Mat'], ['MRK', 'Marcos', 16, 'Mc Mr Mar'], ['LUK', 'Lucas', 24, 'Lc Luc'],
  ['JHN', 'Juan', 21, 'Jn'], ['ACT', 'Hechos', 28, 'Hch Hech'], ['ROM', 'Romanos', 16, 'Ro Rom'],
  ['1CO', '1 Corintios', 16, '1Co 1Cor'], ['2CO', '2 Corintios', 13, '2Co 2Cor'], ['GAL', 'Gálatas', 6, 'Gá Gál Gal'],
  ['EPH', 'Efesios', 6, 'Ef Efe'], ['PHP', 'Filipenses', 4, 'Flp Fil'], ['COL', 'Colosenses', 4, 'Col'],
  ['1TH', '1 Tesalonicenses', 5, '1Ts 1Tes'], ['2TH', '2 Tesalonicenses', 3, '2Ts 2Tes'], ['1TI', '1 Timoteo', 6, '1Ti 1Tim'],
  ['2TI', '2 Timoteo', 4, '2Ti 2Tim'], ['TIT', 'Tito', 3, 'Tit'], ['PHM', 'Filemón', 1, 'Flm Filem'], ['HEB', 'Hebreos', 13, 'Heb He'],
  ['JAS', 'Santiago', 5, 'Stg Sant'], ['1PE', '1 Pedro', 5, '1P 1Pe 1Ped'], ['2PE', '2 Pedro', 3, '2P 2Pe 2Ped'],
  ['1JN', '1 Juan', 5, '1Jn'], ['2JN', '2 Juan', 1, '2Jn'], ['3JN', '3 Juan', 1, '3Jn'], ['JUD', 'Judas', 1, 'Jud Jds'],
  ['REV', 'Apocalipsis', 22, 'Ap Apoc'],
].map(([id, nombre, caps, abrev], i) => ({ id, nombre, caps, abrev: abrev.split(' '), at: i < 39 }));
export const LIBRO = Object.fromEntries(LIBROS.map(l => [l.id, l]));

// Libros que también son nombres de persona (Juan, Marcos, Daniel…) solo cuentan como cita con versículo
const SOLO_CAP = new Set('GEN EXO LEV NUM DEU JDG 1SA 2SA 1KI 2KI 1CH 2CH PSA PRO ECC SNG LAM ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI HEB 1PE 2PE 1JN 2JN 3JN REV'.split(' '));
const norm = s => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, '').toLowerCase();
// nombre o abreviatura (sin tildes ni espacios) -> libro
const ALIAS = new Map();
for (const l of LIBROS) {
  ALIAS.set(norm(l.nombre), { l, corto: false });
  if (l.id === 'SNG') ALIAS.set(norm('Cantar de los Cantares'), { l, corto: false });
  for (const a of l.abrev) if (!ALIAS.has(norm(a))) ALIAS.set(norm(a), { l, corto: a.replace(/^\d/, '').length <= 3 });
}
// Variantes de "1 Juan": 1Juan, 1 Juan, I Juan
const nombresRx = [...new Set(LIBROS.flatMap(l => [l.nombre, ...l.abrev, ...(l.id === 'SNG' ? ['Cantar de los Cantares'] : [])]))]
  .sort((a, b) => b.length - a.length)
  .map(n => n.replace(/^(\d) ?/, '$1 ?').replace(/[áéíóúÁÉÍÓÚ]/g, c => `[${c}${c.normalize('NFD')[0]}]`).replace(/ (?!\?)/g, '\\s+'))
  .join('|');
// Cita: Libro capítulo[:versículo[-versículo]]. Empieza con mayúscula o número.
const RX = new RegExp(`(?<![\\p{L}\\d])((?:${nombresRx}))\\.?\\s+(\\d{1,3})(?:\\s*:\\s*(\\d{1,3})(?:\\s*[-–]\\s*(\\d{1,3}))?)?(?![\\p{L}\\d])`, 'gu');

/** Busca citas en un texto. Devuelve [{ i, fin, texto, libro, cap, v1, v2 }] */
export function buscarCitas(t) {
  const out = [];
  for (const m of String(t || '').matchAll(RX)) {
    const nombre = m[1];
    if (!/^[\dA-ZÁÉÍÓÚÑ]/.test(nombre)) continue;              // "mi 2 hijos" no es Miqueas
    const a = ALIAS.get(norm(nombre));
    if (!a) continue;
    const cap = +m[2], v1 = m[3] ? +m[3] : null, v2 = m[4] ? +m[4] : null;
    if (!v1 && (a.corto || !SOLO_CAP.has(a.l.id))) continue;       // "Is 5" o "Juan 3 veces" no; "Juan 3:16" y "Salmo 23" sí
    if (cap < 1 || cap > a.l.caps) continue;
    out.push({ i: m.index, fin: m.index + m[0].length, texto: m[0], libro: a.l.id, cap, v1, v2: v2 && v2 >= (v1 || 0) ? v2 : null });
  }
  return out;
}
export const leerCita = t => buscarCitas(t)[0] || null;
export const citaTxt = c => `${LIBRO[c.libro].nombre} ${c.cap}${c.v1 ? ':' + c.v1 + (c.v2 && c.v2 !== c.v1 ? '-' + c.v2 : '') : ''}`;
export const citaClave = c => `${c.libro}.${c.cap}${c.v1 ? '.' + c.v1 + (c.v2 ? '-' + c.v2 : '') : ''}`;
export function claveACita(k) {
  const m = /^([1-3]?[A-Z]{2,3})\.(\d+)(?:\.(\d+)(?:-(\d+))?)?$/.exec(k || '');
  return m && LIBRO[m[1]] ? { libro: m[1], cap: +m[2], v1: m[3] ? +m[3] : null, v2: m[4] ? +m[4] : null } : null;
}
export const urlGateway = (c, version) => `https://www.biblegateway.com/passage/?search=${encodeURIComponent(citaTxt(c))}&version=${version}`;

/**
 * Pone enlaces en las citas de un texto YA ESCAPADO para HTML.
 * Como el texto escapado puede tener entidades, se busca sobre el texto original y se escapa por partes.
 */
export function enlazarCitas(original, esc) {
  const citas = buscarCitas(original);
  if (!citas.length) return esc(original);
  let html = '', k = 0;
  for (const c of citas) {
    html += esc(original.slice(k, c.i)) + `<button type="button" class="cita" data-cita="${citaClave(c)}">${esc(c.texto)}</button>`;
    k = c.fin;
  }
  return html + esc(original.slice(k));
}

// ---------- texto ----------
const cache = new Map();
export async function capitulo(version, libro, cap) {
  const k = version + '/' + libro;
  if (!cache.has(k)) {
    const p = fetch(`biblia/${version}/${libro}.json`).then(r => { if (!r.ok) throw new Error('No se encontró el libro'); return r.json(); });
    cache.set(k, p);
    p.catch(() => cache.delete(k));
  }
  return (await cache.get(k))[cap - 1] || [];
}
/** Versículos de una cita: [{ n, t }] */
export async function versiculos(version, c) {
  const caps = await capitulo(version, c.libro, c.cap);
  const desde = c.v1 || 1, hasta = c.v2 || c.v1 || caps.length;
  const out = [];
  for (let n = desde; n <= Math.min(hasta, caps.length); n++) if (caps[n - 1]) out.push({ n, t: caps[n - 1] });
  return out;
}

const LS = 'arpas.biblia';
export const preferida = () => { try { const v = JSON.parse(localStorage.getItem(LS) || '{}').version; return VERSIONES[v] ? v : 'rv1909'; } catch { return 'rv1909'; } };
export const guardarPreferida = v => { try { localStorage.setItem(LS, JSON.stringify({ version: v })); } catch {} };
