// Cambia el tempo de un audio sin cambiar el tono (WSOLA: superponer y sumar
// buscando la mejor coincidencia). Corre en segundo plano para no trabar la pantalla.
// El cambio de tono lo hace después el reproductor con playbackRate.

/**
 * @param {Float32Array[]} canales  muestras de cada canal
 * @param {number} rate  velocidad (>1 más rápido, <1 más lento)
 * @param {number} sr    frecuencia de muestreo
 * @returns {Float32Array[]}
 */
function estirar(canales, rate, sr) {
  const len = canales[0].length;
  if (Math.abs(rate - 1) < 1e-3) return canales.map(c => c.slice());
  const N = sr > 32000 ? 2048 : 1024;   // ~46 ms a 44,1 kHz · ~46 ms a 22 kHz
  const Hs = N / 2;                     // salto de salida (50 % de superposición)
  const T = Math.round(sr * 0.012);     // radio de búsqueda (~12 ms)
  const D = sr > 32000 ? 4 : 2;         // la búsqueda se hace sobre una versión reducida (más rápido)
  const L = Math.floor(Hs / D);         // largo de la comparación en la versión reducida
  const outLen = Math.floor(len / rate);

  // ventana de Hann periódica: con 50 % de superposición suma 1
  const w = new Float32Array(N);
  for (let i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);

  // mono reducido para buscar
  const mLen = Math.floor(len / D);
  const m = new Float32Array(mLen);
  for (let i = 0; i < mLen; i++) {
    let s = 0;
    for (const c of canales) s += c[i * D];
    m[i] = s / canales.length;
  }
  const corr = (a, b) => {
    let s = 0;
    for (let i = 0; i < L; i++) s += m[a + i] * m[b + i];
    return s;
  };

  const out = canales.map(() => new Float32Array(outLen + N));
  let prev = 0;
  const maxPos = Math.max(0, len - N);
  for (let k = 0; k * Hs < outLen; k++) {
    let pos = Math.min(maxPos, Math.round(k * Hs * rate));
    if (k > 0) {
      // buscar el desplazamiento que mejor continúa el pedazo anterior
      const objetivo = Math.floor((prev + Hs) / D);
      if (objetivo + L < mLen) {
        const ini = Math.max(0, Math.floor((pos - T) / D)), fin = Math.min(mLen - L - 1, Math.floor((pos + T) / D));
        let mejor = -Infinity, mejorJ = Math.floor(pos / D);
        for (let j = ini; j <= fin; j += 2) { const v = corr(j, objetivo); if (v > mejor) { mejor = v; mejorJ = j; } }
        // afinar alrededor del mejor
        for (let j = Math.max(ini, mejorJ - 1); j <= Math.min(fin, mejorJ + 1); j++) { const v = corr(j, objetivo); if (v > mejor) { mejor = v; mejorJ = j; } }
        pos = Math.min(maxPos, Math.max(0, mejorJ * D));
      }
    }
    const o = k * Hs;
    for (let ch = 0; ch < canales.length; ch++) {
      const x = canales[ch], y = out[ch];
      const n = Math.min(N, len - pos);
      for (let i = 0; i < n; i++) y[o + i] += w[i] * x[pos + i];
    }
    prev = pos;
  }
  return out.map(y => y.subarray(0, outLen).slice());
}

if (typeof self !== 'undefined' && typeof self.postMessage === 'function' && typeof window === 'undefined') {
  self.onmessage = e => {
    const { id, canales, rate, sr } = e.data;
    try {
      const res = estirar(canales, rate, sr);
      self.postMessage({ id, canales: res }, res.map(c => c.buffer));
    } catch (err) {
      self.postMessage({ id, error: String(err?.message || err) });
    }
  };
}
if (typeof module !== 'undefined') module.exports = { estirar };
