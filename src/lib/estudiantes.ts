import { doc, getDoc, setDoc } from 'firebase/firestore'

import { db } from '@/lib/firebase'

/* ── Estudiantes: SOLO los datos importantes van a Firebase ──
   Ruta en Firestore: usuarios > estudiantes > estudiantes
   Se guardan: nombre (nombres + apellidos), correo (NIE@clases.edu.sv),
   nie, fechaNacimiento, responsable, dui (documento del responsable),
   telefono (del responsable) y grado (texto, p. ej. "Parvularia 4") +
   estado ('activo', igual que los docentes).

   ID del documento: id del GRADO (número de -2 a 9) + NOMBRES sin espacios
   → p. ej. grado "Parvularia 6" (id 0) + "MARIA ELENA" = "0MARIAELENA".
   Si el id ya existe se le agrega 2, 3, 4… como con los docentes.
   El resto de los datos vive SOLO en el Sheet "estudiantes". */

export interface DatosFirebaseEstudiante {
  nombres: string
  apellidos: string
  nie: string
  fechaNacimiento: string /* yyyy-mm-dd */
  grado: string /* texto del select, p. ej. "Primero" */
  gradoId: number /* -2 a 9 */
  responsable: string /* nombre completo */
  documento: string /* DUI o pasaporte del responsable */
  telefono: string /* con código de país, p. ej. "+503 7123-4567" */
}

/* Nombres de los grados del select, EN ORDEN (no alfabético: es un orden
   natural de niveles), con su id numérico */
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

async function existeId(id: string): Promise<boolean> {
  const d = await getDoc(doc(db, 'usuarios', 'estudiantes', 'estudiantes', id))
  return d.exists()
}

export async function crearEstudiante(datos: DatosFirebaseEstudiante): Promise<string> {
  const nombre = `${datos.nombres} ${datos.apellidos}`.trim().replace(/ {2,}/g, ' ')
  const base = `${datos.gradoId}${datos.nombres.replace(/ /g, '')}` || 'estudiante'
  let id = base
  let numero = 2
  while (await existeId(id)) {
    id = `${base}${numero}`
    numero += 1
  }
  await setDoc(doc(db, 'usuarios', 'estudiantes', 'estudiantes', id), {
    nombre,
    correo: `${datos.nie}@clases.edu.sv`.trim().toLowerCase(),
    nie: datos.nie,
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
