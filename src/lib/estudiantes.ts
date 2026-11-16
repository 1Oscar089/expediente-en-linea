import { collection, doc, getDoc, getDocs, limit, query, setDoc, where } from 'firebase/firestore'

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

const ESTADO_ACTIVO = 'activo'
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
