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
    id: '2026-11-06-actividades-programa',
    fecha: '2026-11-06',
    modulo: 'alabanza',
    titulo: 'Actividades como programa',
    resumen: 'Cada actividad se ve ahora como un programa: lema, horarios, una barra de tiempo y bloques con sus momentos, citas y canciones del día.',
    pasos: [
      { t: 'Lee el programa', d: 'Arriba ves la fecha, el lema y los horarios. La barra muestra cuánto dura cada bloque.' },
      { t: 'Recorre los bloques', d: 'Cada bloque trae sus citas bíblicas, sus momentos con hora y minutos, y sus canciones. Lo destacado aparece en dorado.' },
      { t: 'Abre tus canciones', d: 'Toca una canción del bloque para verla en el tono del día.', para: ['miembro'] },
      { t: 'En el día también', d: 'En el repertorio del día, cada canción dice en qué bloque va (📋).', para: ['miembro'] },
      { t: 'Completa la actividad', d: 'Con ✏️ arriba agrega el lema y las horas de inicio, cierre y a más tardar.', para: ['admin'] },
      { t: 'Arma cada bloque', d: 'En ✏️ del bloque pon etiqueta, desde y hasta (así aparece en la barra) y las citas bíblicas.', para: ['admin'] },
      { t: 'Agrega momentos', d: 'Toca "＋ Momento": hora, qué pasa, detalle, minutos y ⭐ para destacar. Ordénalos con ↑ ↓.', para: ['admin'] },
      { t: 'Pon las canciones del día', d: 'Toca "🎵 Canciones del día" en el bloque, o elige el bloque al agregar una canción en el día. La actividad debe estar ligada a ese día.', para: ['admin'] },
    ],
    ir: '#/actividades',
    irTxt: 'Ver actividades',
  },
  {
    id: '2026-11-06-actividades',
    fecha: '2026-11-06',
    modulo: 'alabanza',
    titulo: 'Actividades por bloques',
    resumen: 'Nueva pestaña Actividades: cada actividad se divide en bloques (Bienvenida, Alabanza, Ofrenda…) y cada bloque tiene sus comentarios.',
    pasos: [
      { t: 'Abre la pestaña Actividades', d: 'Está en el menú de abajo, junto a Agenda. También aparece arriba en el día que tenga una actividad.' },
      { t: 'Entra a una actividad', d: 'Verás sus bloques en orden, con hora, responsable y detalles.' },
      { t: 'Comenta en un bloque', d: 'Escribe abajo de cada bloque para preguntar o avisar algo de esa parte.', para: ['miembro'] },
      { t: 'Quién puede comentar', d: 'Si la actividad es de un día, comentan quienes sirven ese día; los demás pueden leer.', para: ['miembro'] },
      { t: 'Crea una actividad', d: 'Toca + y ponle nombre. Si la ligas a un día de la agenda, comenta quien sirve ese día y los bloques salen en el link de solo lectura.', para: ['admin'] },
      { t: 'Agrega y ordena los bloques', d: 'Dentro de la actividad toca "Agregar bloque": hora, nombre, responsable y detalles. Usa ↑ ↓ para ordenarlos y ✏️ para editarlos.', para: ['admin'] },
      { t: 'Modera los comentarios', d: 'Puedes comentar en cualquier bloque y borrar comentarios con 🗑️.', para: ['admin'] },
    ],
    ir: '#/actividades',
    irTxt: 'Ver actividades',
  },
  {
    id: '2026-11-06-medleys',
    fecha: '2026-11-06',
    modulo: 'alabanza',
    para: ['admin'],
    titulo: 'Medleys sin duplicar canciones',
    resumen: 'Une partes de 2 o más canciones del repertorio en un medley, cada parte en su tono, sin volver a escribirlas.',
    pasos: [
      { t: 'Ve a Canciones y toca +', d: 'Elige "Medley o mashup".' },
      { t: 'Elige las canciones', d: 'Agrega 2 o más y ordénalas con las flechas.' },
      { t: 'Marca solo lo que se canta', d: 'Por ejemplo, el coro de una y el puente de otra. Sin marcar, va la canción completa.' },
      { t: 'Ajusta el tono de cada parte', d: 'Mira la vista previa y guarda. El medley se agrega a un día como cualquier canción.' },
    ],
    ir: '#/canciones',
    irTxt: 'Crear un medley',
  },
  {
    id: '2026-11-06-medleys-equipo',
    fecha: '2026-11-06',
    modulo: 'alabanza',
    para: ['miembro'],
    titulo: 'Medleys en el repertorio',
    resumen: 'Ahora un día puede tener medleys: partes de varias canciones unidas en una sola.',
    pasos: [
      { t: 'Cómo reconocerlos', d: 'En Canciones y en el repertorio del día aparecen con 🔗.' },
      { t: 'Ábrelos como cualquier canción', d: 'Ves la letra con acordes, solo con las partes que se cantan y en orden.' },
      { t: 'Atento al cambio de tono', d: 'Cuando una parte va en otro tono, aparece marcado "Cambio de tono". Si transpones, se mueve todo el medley.' },
      { t: 'Repasa cada canción completa', d: 'Arriba aparecen las canciones del medley: toca una para verla entera.' },
    ],
  },
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
