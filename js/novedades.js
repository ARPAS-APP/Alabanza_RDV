// =====================================================================
// Novedades: guía corta de cada función nueva.
// Cada vez que se publica algo visible para las personas, se agrega una
// entrada AL INICIO de esta lista. Al abrir la app, a cada persona le
// aparecen una sola vez las que le corresponden; después las puede repasar
// en Mi perfil → Novedades y guías.
//
//  id      texto único que no se repite (por ejemplo 'aaaa-mm-dd-tema')
//  fecha   'aaaa-mm-dd' de publicación
//  modulo  'alabanza' | 'discipulado' | 'todos'
//  para    (opcional) quién la ve. En Discipulado: 'discipulo' | 'mentor' | 'pastor'.
//          'admin' = administradores de Alabanza. Sin "para" la ven todos los del módulo.
//  titulo, resumen, pasos [{ t, d }] y, si aplica, ir: ruta para "Ir ahora" e irTxt.
// =====================================================================
export const NOVEDADES = [
  {
    id: '2026-11-06-numeros-discipulado',
    fecha: '2026-11-06',
    modulo: 'discipulado',
    para: ['pastor'],
    titulo: 'Discipulado en números',
    resumen: 'En tu inicio ahora ves cuántas personas hay en Discipulado, cuántas están activas y quién aprobó a quién.',
    pasos: [
      { t: 'Abre el Inicio de Discipulado', d: 'Baja hasta la sección "Discipulado en números".' },
      { t: 'Lee los totales', d: 'Total de personas, activos esta semana y este mes, mentores, discípulos y nuevos del mes.' },
      { t: 'Qué cuenta como activo', d: 'Quien respondió un devocional, publicó, comentó o marcó un reto en ese período.' },
      { t: 'Revisa las aprobaciones', d: 'Debajo aparece cada aprobación de los mentores, por ejemplo "Carlos aprobó a Rosa". También te llega un aviso al celular.' },
    ],
    ir: '#/d/inicio',
    irTxt: 'Ver mis números',
  },
  {
    id: '2026-11-06-invitar-discipulos',
    fecha: '2026-11-06',
    modulo: 'discipulado',
    para: ['mentor', 'pastor'],
    titulo: 'Invita y aprueba a tus discípulos',
    resumen: 'Ahora tienes tu propio link de invitación. Quien se registra con él te aparece a ti y tú lo apruebas.',
    pasos: [
      { t: 'Abre "Mis discípulos"', d: 'Está en el Inicio de Discipulado.' },
      { t: 'Copia tu link', d: 'Toca "Copiar mi link de invitación" y envíalo por WhatsApp a la persona con quien ya conversaste.' },
      { t: 'Espera su registro', d: 'Cuando se registre te llega un aviso y aparece arriba en "Mis discípulos".' },
      { t: 'Apruébalo', d: 'Toca "Aprobar" y queda como tu discípulo. Si no es tuyo, toca "No es mi discípulo" y la solicitud pasa a quien administra.' },
    ],
    ir: '#/d/discipulos',
    irTxt: 'Ir a Mis discípulos',
  },
  {
    id: '2026-11-06-guias',
    fecha: '2026-11-06',
    modulo: 'todos',
    titulo: 'Guías de lo nuevo',
    resumen: 'Cada vez que la app tenga algo nuevo para ti, te aparecerá una guía corta como esta.',
    pasos: [
      { t: 'Una sola vez', d: 'La guía aparece al abrir la app y no se repite cuando tocas "Entendido".' },
      { t: 'Solo lo tuyo', d: 'Ves únicamente lo que corresponde a tus ministerios y a tu rol.' },
      { t: 'Repásalas cuando quieras', d: 'Entra a Mi perfil → "Novedades y guías".' },
    ],
  },
];
