// Reproductor del audio de referencia de una canción, con cambio de tono y de tempo
// por separado (en el celular, sin extensiones).
//  - Tempo: se estira el audio sin cambiar el tono (js/estirar-worker.js).
//  - Tono: se reproduce más agudo o grave con playbackRate, y el estirado lo compensa.

let worker = null, sigId = 0;
const pendientes = new Map();
function estirarEnFondo(canales, rate, sr) {
  if (!worker) {
    worker = new Worker(new URL('./estirar-worker.js', import.meta.url));
    worker.onmessage = e => {
      const p = pendientes.get(e.data.id);
      if (!p) return;
      pendientes.delete(e.data.id);
      e.data.error ? p.rej(new Error(e.data.error)) : p.res(e.data.canales);
    };
  }
  const id = ++sigId;
  return new Promise((res, rej) => { pendientes.set(id, { res, rej }); worker.postMessage({ id, canales, rate, sr }); });
}

let ctxAudio = null;
const contexto = () => (ctxAudio ??= new (window.AudioContext || window.webkitAudioContext)());
/** Llamar dentro del toque del usuario (iPhone solo deja sonar audio que empezó con un toque). */
export function desbloquearAudio() { const c = contexto(); if (c.state === 'suspended') c.resume(); }

/**
 * crearReproductor(onCambio) → objeto con:
 *   cargar(url), ajustar({ semis, tempo }), alternar(), ir(fraccion), parar(), estado()
 * tempo: 1 = original, 0.9 = 10 % más lento. semis: semitonos (+ sube, − baja).
 */
export function crearReproductor(onCambio = () => {}) {
  // Para no agotar la memoria del celular (iPhone cierra la página si pasa de ~300 MB),
  // el audio se guarda en mono y a 22 kHz: suficiente para ensayar y pesa 4 veces menos.
  let original = null;          // { mono: Float32Array, sr, duration }
  let url = null;
  let semis = 0, tempo = 1;
  let listo = null;             // { buffer, a, r } buffer estirado para el ajuste actual
  let fuente = null, inicioCtx = 0, inicioOrig = 0, tocando = false;
  let posOrig = 0;              // posición en segundos del audio original
  let cargando = false, procesando = false, error = '';
  let trabajo = 0, temporizador = null;

  const estado = () => ({ cargando, procesando, error, tocando, listo: !!listo, pos: posicion(), dur: dur(), semis, tempo });
  const avisar = () => onCambio(estado());
  const r = () => Math.pow(2, semis / 12);

  function posicion() {
    if (!tocando) return posOrig;
    const vel = listo ? listo.a * listo.r : tempo;   // velocidad con la que suena ahora
    return Math.min(dur(), inicioOrig + (contexto().currentTime - inicioCtx) * vel);
  }
  const dur = () => (original ? original.duration : 0);

  function detenerFuente() {
    if (!fuente) return;
    fuente.onended = null;
    try { fuente.stop(); } catch {}
    fuente.disconnect();
    fuente = null;
  }
  function arrancar() {
    if (!listo) return;
    const ctx = contexto();
    detenerFuente();
    fuente = ctx.createBufferSource();
    fuente.buffer = listo.buffer;
    fuente.playbackRate.value = listo.r;
    fuente.connect(ctx.destination);
    // en el buffer estirado, 1 s equivale a "a" segundos del original
    const offset = Math.min(listo.buffer.duration - 0.01, Math.max(0, posOrig / listo.a));
    inicioCtx = ctx.currentTime; inicioOrig = posOrig;
    fuente.start(0, offset);
    fuente.onended = () => { if (tocando) { tocando = false; posOrig = 0; detenerFuente(); avisar(); } };
    tocando = true;
  }

  async function preparar() {
    if (!original) return;
    const n = ++trabajo;
    const rr = r(), a = tempo / rr;              // estirar a, luego tocar a velocidad rr → tempo final = a·rr
    procesando = true; avisar();
    try {
      let datos = original.mono;
      if (Math.abs(a - 1) > 1e-3) {
        [datos] = await estirarEnFondo([original.mono], a, original.sr);
        if (n !== trabajo) return;
      }
      const buffer = contexto().createBuffer(1, datos.length, original.sr);
      buffer.copyToChannel(datos, 0);
      datos = null;
      if (n !== trabajo) return;
      const seguia = tocando;
      if (seguia) { posOrig = posicion(); detenerFuente(); tocando = false; }
      listo = { buffer, a, r: rr };
      procesando = false;
      if (seguia) arrancar();
      avisar();
    } catch (e) {
      if (n !== trabajo) return;
      procesando = false; error = 'No se pudo cambiar el tempo de este audio.'; avisar();
    }
  }

  return {
    async cargar(u) {
      if (url === u && original) return;
      url = u; cargando = true; error = ''; avisar();
      try {
        const resp = await fetch(u);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const datos = await resp.arrayBuffer();
        const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        const SR = 22050;
        const dec = await new Promise((res, rej) => {
          const p = new Off(1, 1, SR).decodeAudioData(datos, res, rej);   // se decodifica ya a 22 kHz
          if (p?.then) p.then(res, rej);
        });
        const mono = new Float32Array(dec.length);
        for (let ch = 0; ch < dec.numberOfChannels; ch++) {
          const x = dec.getChannelData(ch);
          for (let i = 0; i < x.length; i++) mono[i] += x[i] / dec.numberOfChannels;
        }
        original = { mono, sr: dec.sampleRate, duration: dec.duration };
        cargando = false;
        await preparar();
      } catch (e) {
        cargando = false;
        error = navigator.onLine ? 'No se pudo abrir el audio.' : 'Sin internet: abre el audio una vez con señal para guardarlo.';
        avisar();
      }
    },
    ajustar(op) {
      const s = op.semis ?? semis, t = op.tempo ?? tempo;
      if (s === semis && Math.abs(t - tempo) < 1e-4) return;
      semis = s; tempo = t;
      if (!original) return;               // todavía no está cargado: se usa al cargar
      // se prepara un momento después, por si siguen tocando + / −
      clearTimeout(temporizador);
      temporizador = setTimeout(preparar, 350);
      avisar();
    },
    async alternar() {
      const ctx = contexto();
      if (ctx.state === 'suspended') await ctx.resume();
      if (tocando) { posOrig = posicion(); detenerFuente(); tocando = false; }
      else if (listo) arrancar();
      avisar();
    },
    ir(fr) {
      posOrig = Math.max(0, Math.min(1, fr)) * dur();
      if (tocando) arrancar();
      avisar();
    },
    parar() { clearTimeout(temporizador); trabajo++; if (tocando) posOrig = posicion(); detenerFuente(); tocando = false; },
    estado,
  };
}
