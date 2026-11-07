// =====================================================================
// Varias cuentas en el mismo teléfono (por ejemplo, mamá e hija).
// Se guarda en el celular el "token de renovación" de cada cuenta para
// cambiar de una a otra sin volver a escribir la contraseña.
// Las sesiones siguen activas en el servidor: cambiar de cuenta NO cierra
// la sesión de la otra. "Cerrar sesión" sí la cierra y la quita de la lista.
// =====================================================================
const K = 'arpas.cuentas';

export function crearCuentas(sb) {
  const leer = () => { try { return JSON.parse(localStorage.getItem(K) || '[]'); } catch { return []; } };
  const escribir = l => { try { localStorage.setItem(K, JSON.stringify(l)); } catch { /* sin almacenamiento */ } };

  // Se llama en cada cambio de sesión: así el token guardado siempre es el último.
  function recordar(session) {
    if (!session?.user || !session.refresh_token) return;
    const l = leer(), i = l.findIndex(c => c.id === session.user.id);
    const c = { ...(l[i] || {}), id: session.user.id, email: session.user.email, rt: session.refresh_token, at: Date.now() };
    if (i >= 0) l[i] = c; else l.push(c);
    escribir(l);
  }
  function nombrar(id, nombre) {
    const l = leer(), c = l.find(x => x.id === id);
    if (c && nombre && c.nombre !== nombre) { c.nombre = nombre; escribir(l); }
  }
  const olvidar = id => escribir(leer().filter(c => c.id !== id));
  const lista = () => leer();

  // Quita la sesión de este navegador sin cerrarla en el servidor (para agregar otra cuenta).
  function soltarLocal() {
    try { Object.keys(localStorage).filter(k => /^sb-.*-auth-token$/.test(k)).forEach(k => localStorage.removeItem(k)); } catch { /* nada */ }
  }

  // Entra a otra cuenta guardada. Si su token ya no sirve, la quita y avisa.
  async function entrar(id) {
    const c = leer().find(x => x.id === id);
    if (!c) throw new Error('Esa cuenta ya no está en este teléfono');
    const { data, error } = await sb.auth.refreshSession({ refresh_token: c.rt });
    if (error || !data?.session) {
      olvidar(id);
      const e = new Error('Hay que volver a entrar a esa cuenta con su contraseña');
      e.email = c.email; e.vencida = true;
      throw e;
    }
    recordar(data.session);
    return data.session;
  }

  return { recordar, nombrar, olvidar, lista, soltarLocal, entrar };
}
