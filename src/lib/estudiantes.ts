import { collection, deleteDoc, doc, getDoc, getDocs, limit, query, setDoc, updateDoc, where } from 'firebase/firestore'

import { db } from '@/lib/firebase'

/* ── Estudiantes: SOLO los datos importantes van a Firebase ──
   Ruta en Firestore: usuarios > estudiantes > estudiantes
   Se guardan: nombre (nombres + apellidos), correo, nie, fechaNacimiento,
   responsable, dui (documento del responsable), telefono (del responsable)
   y grado (texto, p. ej. "Segundo") + estado ('activo', igual que docentes).

   CORREO: si el estudiante es NUEVO INGRESO al sistema de El Salvador aún
   no tiene NIE, así que el correo queda EN BLANCO; se llenará después,
   cuando se edite en Estudiantes › Actualizar.

   ID DEL DOCUMENTO (regla del usuario): el ID DE CLASE (número del grado,
   de -2 a 9) + el NOMBRE COMPLETO (nombres + apellidos) EN MINÚSCULAS y
   SIN ESPACIOS → p. ej. grado "Segundo" (id 2) + "MARIA ELENA RAMOS"
   = "2mariaelenaramos".

   MATRÍCULA INTELIGENTE: antes de guardar se busca si el nombre completo
   ya existe (→ "ya está matriculado") o si el NIE ya pertenece a otra
   persona (→ se dice a quién pertenece). Las búsquedas usan el nombre con
   SU FORMATO GUARDADO (MAYÚSCULAS, sin tildes) y el NIE tal cual. */

export interface DatosFirebaseEstudiante {
  nombres: string
  apellidos: string
  nie: string /* en blanco si es nuevo ingreso y aún no tiene NIE */
  nuevoIngreso: boolean
  fechaNacimiento: string /* yyyy-mm-dd */
  grado: string /* texto del select, p. ej. "Segundo" */
  gradoId: number /* -2 a 9 = el ID DE CLASE */
  responsable: string /* nombre completo */
  documento: string /* DUI, pasaporte u otro documento del responsable */
  telefono: string /* con código de país, p. ej. "+503 7123-4567" */
}

/* Nombres de los grados del select, EN ORDEN (no alfabético: es un orden
   natural de niveles), con su id numérico (= el id de clase) */
export const GRADOS: { id: number; nombre: string }[] = [
  { id: -2, nombre: 'Parvularia 4' },
  { id: -1, nombre: 'Parvularia 5' },
  { id: 0, nombre: 'Parvularia 6' },
  { id: 1, nombre: 'Primero' },
  { id: 2, nombre: 'Segundo' },
  { id: 3, nombre: 'Tercero' },
  { id: 4, nombre: 'Cuarto' },
  { id: 5, nombre: 'Quinto' },
  { id: 6, nombre: 'Sexto' },
  { id: 7, nombre: 'Séptimo' },
  { id: 8, nombre: 'Octavo' },
  { id: 9, nombre: 'Noveno' },
]

export function idDeGrado(nombre: string): number | null {
  return GRADOS.find((g) => g.nombre === nombre)?.id ?? null
}

export const ESTADO_ACTIVO = 'activo'
export const ESTADO_ARCHIVADO = 'archivado'
const RUTA = 'usuarios/estudiantes/estudiantes'

/* Nombre completo tal como se guarda en Firebase (MAYÚSCULAS, un espacio) */
export function nombreCompleto(nombres: string, apellidos: string): string {
  return `${nombres} ${apellidos}`.replace(/ {2,}/g, ' ').trim()
}

/* ID de clase + nombre completo en minúsculas y sin espacios:
   "Segundo" (2) + "MARIA ELENA RAMOS" → "2mariaelenaramos" */
export function idDocumento(gradoId: number, nombres: string, apellidos: string): string {
  return `${gradoId}${nombreCompleto(nombres, apellidos).replace(/ /g, '').toLowerCase()}`
}

/* ── Búsquedas para la matrícula inteligente ── */
export interface CoincidenciaEstudiante {
  nombre: string
  nie: string
  grado: string
}

/* ¿Ya hay un estudiante con ese nombre completo? */
export async function buscarPorNombre(
  nombres: string,
  apellidos: string,
): Promise<CoincidenciaEstudiante | null> {
  const buscado = nombreCompleto(nombres, apellidos)
  if (!buscado) return null
  const snap = await getDocs(
    query(collectionRef(), where('nombre', '==', buscado), limit(1)),
  )
  const datos = snap.docs[0]?.data()
  if (!datos) return null
  return {
    nombre: String(datos.nombre ?? ''),
    nie: String(datos.nie ?? ''),
    grado: String(datos.grado ?? ''),
  }
}

/* ¿Ya hay un estudiante con ese NIE? */
export async function buscarPorNie(nie: string): Promise<CoincidenciaEstudiante | null> {
  const buscado = nie.trim()
  if (!buscado) return null
  const snap = await getDocs(
    query(collectionRef(), where('nie', '==', buscado), limit(1)),
  )
  const datos = snap.docs[0]?.data()
  if (!datos) return null
  return {
    nombre: String(datos.nombre ?? ''),
    nie: String(datos.nie ?? ''),
    grado: String(datos.grado ?? ''),
  }
}

function collectionRef() {
  return collection(db, RUTA)
}

/* ── Cifras para la vista Inicio ──
   Cuenta la matrícula que está guardada AHORA en Firebase: total, por
   nivel y cuántos grados del catálogo tienen al menos un estudiante.
   REGLA DEL CENTRO para separar niveles por grado:
     menor a "Segundo"  → Primera Infancia (Parvularia 4/5/6 y Primero)
     "Segundo" o mayor  → Educación Básica (Segundo … Noveno)
   El nivel se decide por el GRADO REAL del documento: datos viejos o
   importados pueden no traer "gradoId" (o traerlo en 0), así que primero
   se lee el TEXTO del grado y se busca en el catálogo — sin importar
   mayúsculas ni tildes — y el número guardado es solo de reserva. */
export interface CifrasEstudiantes {
  total: number
  primeraInfancia: number
  basica: number
  gradosConMatricula: number
}

/* El id de "Segundo": todo grado con id menor es Primera Infancia */
const ID_PRIMER_GRADO_BASICA = 2

/* 'SEGUNDO', 'Séptimo', 'segundo ' → el id del catálogo. null si el
   texto no corresponde a ningún grado conocido. */
function idDeGradoFlexible(texto: string): number | null {
  const limpio = texto.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const hallado = GRADOS.find(
    (g) => g.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === limpio,
  )
  return hallado?.id ?? null
}

/* Id de grado de un documento: primero el TEXTO del grado (campos 'grado'
   o 'Grado que cursa', el segundo por si fue importado desde el Sheet) y
   como reserva el número guardado. null = grado desconocido. */
function gradoIdDeDocumento(datos: Record<string, unknown>): number | null {
  for (const campo of ['grado', 'Grado que cursa']) {
    const id = idDeGradoFlexible(String(datos[campo] ?? ''))
    if (id !== null) return id
  }
  const numero = Number(datos['gradoId'])
  return Number.isFinite(numero) ? numero : null
}

export async function contarEstudiantes(): Promise<CifrasEstudiantes> {
  const snap = await getDocs(collectionRef())
  let primeraInfancia = 0
  let basica = 0
  const grados = new Set<number>()
  snap.forEach((d) => {
    const gradoId = gradoIdDeDocumento(d.data())
    /* Sin grado conocido cuenta como Primera Infancia ("menor a Segundo"),
       para que total siga siendo la suma de las dos tarjetas. */
    if (gradoId === null || gradoId < ID_PRIMER_GRADO_BASICA) primeraInfancia += 1
    else basica += 1
    if (gradoId !== null && GRADOS.some((g) => g.id === gradoId)) grados.add(gradoId)
  })
  return { total: snap.size, primeraInfancia, basica, gradosConMatricula: grados.size }
}

/* ── Nómina: lista completa de matriculados ──
   La vista Estudiantes › Nómina lee TODOS los documentos de Firebase y los
   agrupa por grado (en el orden del catálogo). Cada fila lleva también el
   id numérico del grado (resuelto por el TEXTO del grado, como en las
   cifras de Inicio) para poder agrupar y filtrar sin importar mayúsculas
   ni tildes. */
export interface FilaEstudiante {
  id: string
  nombre: string
  nie: string
  correo: string
  fechaNacimiento: string
  responsable: string
  dui: string /* DUI del responsable */
  telefono: string /* teléfono del responsable */
  grado: string
  gradoId: number | null
  estado: string
}

function aFilaEstudiante(id: string, datos: Record<string, unknown>): FilaEstudiante {
  return {
    id,
    nombre: String(datos.nombre ?? ''),
    nie: String(datos.nie ?? ''),
    correo: String(datos.correo ?? ''),
    fechaNacimiento: String(datos.fechaNacimiento ?? ''),
    responsable: String(datos.responsable ?? ''),
    dui: String(datos.dui ?? ''),
    telefono: String(datos.telefono ?? ''),
    grado: String(datos.grado ?? ''),
    gradoId: gradoIdDeDocumento(datos),
    estado: String(datos.estado ?? '').trim() || ESTADO_ACTIVO,
  }
}

export async function listarEstudiantes(): Promise<FilaEstudiante[]> {
  const snap = await getDocs(collectionRef())
  return snap.docs.map((d) => aFilaEstudiante(d.id, d.data()))
}

/* Archivar / restaurar: el documento NO se borra, solo cambia su estado
   (igual que docentes). Eliminar SÍ lo quita de Firebase. */
export async function cambiarEstadoEstudiante(
  id: string,
  estado: typeof ESTADO_ACTIVO | typeof ESTADO_ARCHIVADO,
): Promise<void> {
  await updateDoc(doc(db, RUTA, id), { estado })
}

export async function eliminarEstudiante(id: string): Promise<void> {
  await deleteDoc(doc(db, RUTA, id))
}

/* ── Orden de la Nómina (regla del usuario) ──
   Ordenar por las PARTES del nombre completo guardado ("NOMBRES APELLIDOS"):
   nombre[2], nombre[3], nombre[4] si hay, y al final nombre[0] y nombre[1].
   Primero los APELLIDOS (parte 2, 3 y la que siga, p. ej. apellido de
   casada) y por último los nombres:
   "MARIA ELENA RAMOS LOPEZ" → RAMOS, LOPEZ, MARIA, ELENA. */
export function claveOrdenNomina(nombre: string): string[] {
  const partes = nombre.trim().split(/\s+/)
  const p = (i: number): string => partes[i] ?? ''
  return [p(2), p(3), p(4), p(0), p(1)]
}

/* Comparador de la Nómina por esa clave (español: tildes y ñ en su lugar) */
export function compararNomina(a: FilaEstudiante, b: FilaEstudiante): number {
  const ca = claveOrdenNomina(a.nombre)
  const cb = claveOrdenNomina(b.nombre)
  for (let i = 0; i < Math.max(ca.length, cb.length); i += 1) {
    const r = (ca[i] ?? '').localeCompare(cb[i] ?? '', 'es')
    if (r !== 0) return r
  }
  return 0
}

/* 'SEGUNDO', 'séptimo ', 'OCTAVO' → el nombre EXACTO del catálogo (mismo
   criterio flexible que las cifras de Inicio). null si el texto no
   corresponde a ningún grado conocido. */
export function nombreCanonicoDeGrado(texto: string): string | null {
  const id = idDeGradoFlexible(String(texto ?? ''))
  if (id === null) return null
  return GRADOS.find((g) => g.id === id)?.nombre ?? null
}

/* Mensaje legible cuando un duplicado bloquea el paso */
export function mensajeDuplicado(coincidencia: CoincidenciaEstudiante, porNIE: boolean): string {
  const quien = coincidencia.nombre || 'otro estudiante'
  const enGrado = coincidencia.grado ? `, en el grado ${coincidencia.grado}` : ''
  if (porNIE) {
    return `El NIE ${coincidencia.nie} ya pertenece a ${quien}${enGrado}.`
  }
  return `${quien} ya está matriculado(a)${enGrado}. No se puede matricular de nuevo con el mismo nombre y apellidos.`
}

const ESTUDIANTE_REPETIDO = 'ya está matriculado(a)'

async function existeId(id: string): Promise<boolean> {
  const d = await getDoc(doc(db, RUTA, id))
  return d.exists()
}

export async function crearEstudiante(datos: DatosFirebaseEstudiante): Promise<string> {
  const nombre = nombreCompleto(datos.nombres, datos.apellidos)
  if (!nombre) throw new Error('Faltan los nombres y apellidos del estudiante.')

  /* Matrícula inteligente: el nombre no puede repetirse */
  const porNombre = await buscarPorNombre(datos.nombres, datos.apellidos)
  if (porNombre) {
    throw new Error(mensajeDuplicado(porNombre, false))
  }
  /* El NIE tampoco (solo si se escribió uno: el nuevo ingreso puede venir
     sin NIE, y un NIE en blanco no es de nadie) */
  if (datos.nie.trim()) {
    const porNie = await buscarPorNie(datos.nie)
    if (porNie) throw new Error(mensajeDuplicado(porNie, true))
  }

  /* El correo institucional se arma con el NIE; el NUEVO INGRESO queda con
     el correo EN BLANCO hasta que se edite en Estudiantes › Actualizar. */
  const correo = datos.nuevoIngreso
    ? ''
    : `${datos.nie}@clases.edu.sv`.trim().toLowerCase()

  const id = idDocumento(datos.gradoId, datos.nombres, datos.apellidos)
  if (await existeId(id)) {
    /* Mismo id de clase + mismo nombre completo = ya matriculado */
    throw new Error(`${nombre} ${ESTUDIANTE_REPETIDO}. No se puede guardar de nuevo.`)
  }

  await setDoc(doc(db, RUTA, id), {
    nombre,
    correo,
    nie: datos.nie.trim(),
    fechaNacimiento: datos.fechaNacimiento,
    responsable: datos.responsable,
    dui: datos.documento,
    telefono: datos.telefono,
    grado: datos.grado,
    estado: ESTADO_ACTIVO,
  })
  return id
}

/* ── Estudiantes › Actualizar: guarda los cambios de un estudiante ya
   matriculado. Se lo busca por su nombre ANTERIOR (el que la fila del
   Sheet tenía al leerse); si cambió el nombre o el grado, el id del
   documento cambia con ellos: se crea el documento nuevo y se borra el
   viejo (regla del usuario: el id no importa, los datos sí).
   El correo se recalcula igual que en la matrícula: el NUEVO INGRESO que
   aún no tiene NIE queda con el correo EN BLANCO. ── */
export async function actualizarEstudiante(
  nombreAnterior: string,
  datos: DatosFirebaseEstudiante,
): Promise<void> {
  const nombre = nombreCompleto(datos.nombres, datos.apellidos)
  if (!nombre) throw new Error('Faltan los nombres y apellidos del estudiante.')

  /* Documento actual, por el nombre anterior (único en el sistema) */
  const snap = await getDocs(
    query(collectionRef(), where('nombre', '==', nombreAnterior), limit(1)),
  )
  const viejo = snap.docs[0]

  /* El nombre nuevo no puede pertenecer a OTRA persona */
  if (nombre !== nombreAnterior) {
    const porNombre = await getDocs(
      query(collectionRef(), where('nombre', '==', nombre), limit(1)),
    )
    if (porNombre.docs[0]) {
      throw new Error(mensajeDuplicado(aCoincidencia(porNombre.docs[0].data()), false))
    }
  }

  /* El NIE tampoco (un mismo documento puede cambiar su propio NIE) */
  if (datos.nie.trim()) {
    const porNie = await getDocs(
      query(collectionRef(), where('nie', '==', datos.nie.trim()), limit(1)),
    )
    const dueno = porNie.docs[0]
    if (dueno && (!viejo || dueno.id !== viejo.id)) {
      throw new Error(mensajeDuplicado(aCoincidencia(dueno.data()), true))
    }
  }

  const correo = datos.nuevoIngreso ? '' : `${datos.nie}@clases.edu.sv`.trim().toLowerCase()
  const registro = {
    nombre,
    correo,
    nie: datos.nie.trim(),
    fechaNacimiento: datos.fechaNacimiento,
    responsable: datos.responsable,
    dui: datos.documento,
    telefono: datos.telefono,
    grado: datos.grado,
    estado: ESTADO_ACTIVO,
  }
  const idNuevo = idDocumento(datos.gradoId, datos.nombres, datos.apellidos)

  /* Nombre y grado intactos: solo se actualiza el documento existente */
  if (viejo && viejo.id === idNuevo) {
    await updateDoc(doc(db, RUTA, viejo.id), registro)
    return
  }
  /* El id cambia (nuevo nombre o nuevo grado) o no estaba en Firebase:
     el destino no puede estar ocupado por otra persona */
  if (await existeId(idNuevo)) {
    throw new Error(
      `${nombre} ya está matriculado(a) en el grado ${datos.grado}. No se puede mover a ese lugar.`,
    )
  }
  await setDoc(doc(db, RUTA, idNuevo), registro)
  if (viejo) await deleteDoc(doc(db, RUTA, viejo.id))
}

/* Datos legibles de un documento para los mensajes de duplicado */
function aCoincidencia(datos: Record<string, unknown>): CoincidenciaEstudiante {
  return {
    nombre: String(datos.nombre ?? ''),
    nie: String(datos.nie ?? ''),
    grado: String(datos.grado ?? ''),
  }
}

/* Mensaje legible para las notificaciones (mismo criterio que docentes) */
export function mensajeError(e: unknown): string {
  const codigo = (e as { code?: string })?.code ?? ''
  if (codigo === 'permission-denied') {
    return 'Sin permisos para escribir en Firebase. Publica las reglas de Firestore en Firebase Console → Firestore Database → Reglas.'
  }
  if (codigo === 'unavailable') return 'Firebase no está disponible en este momento.'
  const texto = (e as Error)?.message
  return texto ? String(texto) : 'Ocurrió un error inesperado.'
}
