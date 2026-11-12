import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore'

import { db } from '@/lib/firebase'
import { guardarCache, leerCache } from './cache'

/* ── Docentes ──
   Firebase guarda los datos que se ven en pantalla + el rol (lo que usa el
   login para armar el menú): nombre, dui, nip, telefono, correo, rol +
   estado ('activo' | 'archivado').
   ARCHIVAR NO BORRA el documento: solo cambia su estado.
   El Sheet guarda TODOS los datos (ver lib/sheetDocentes.ts).

   Ruta en Firestore: usuarios > docentes > docentes
   ID del documento: primera parte del nombre + tercera (o la última) → p. ej.
   "Juan Lopez Perez" = "JuanLopez" (si ya existe: JuanLopez2, JuanLopez3…)

   Caché: la lista vive también en localStorage para no pedirle al servidor
   lo mismo en cada visita. Las escrituras son mínimas: cada acción envía
   SOLO el documento tocado y SOLO los campos que cambiaron. */

export interface DocenteBase {
  nombre: string
  dui: string
  nip: string
  telefono: string
  correo: string
  rol: string
}

/* Registro completo: lo que vive en el Sheet */
export interface DocenteCompleto extends DocenteBase {
  fechaNacimiento: string
  anioServicio: string
  especialidad: string
  rol: string
  estado: string
}

/* Registro de Firebase (lo que se muestra en la tabla) */
export type Docente = DocenteBase & { id: string; estado: string }

export const ESTADO_ACTIVO = 'activo'
export const ESTADO_ARCHIVADO = 'archivado'

/* ID del documento: primera parte del nombre + tercera (o la última que exista). */
export function idDesdeNombre(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return ''
  if (partes.length === 1) return partes[0] ?? ''
  return (partes[0] ?? '') + (partes[2] ?? partes[partes.length - 1] ?? '')
}

/* Sugerencia de correo a partir del nombre: primeras 3 partes,
   minúsculas, sin acentos, unidas con punto → "ana.maria.sol" */
export function sugerirCorreoLocal(nombre: string): string {
  const limpio = nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
  const partes = limpio.split(/\s+/).filter(Boolean)
  return partes.slice(0, 3).join('.')
}

function aDocente(id: string, datos: Record<string, unknown>): Docente {
  /* Si un dato no existe, se coloca blanco (nunca "undefined"); sin estado = activo */
  return {
    id,
    nombre: String(datos.nombre ?? ''),
    dui: String(datos.dui ?? ''),
    nip: String(datos.nip ?? ''),
    telefono: String(datos.telefono ?? ''),
    correo: String(datos.correo ?? ''),
    rol: String(datos.rol ?? ''),
    estado: String(datos.estado ?? '').trim() || ESTADO_ACTIVO,
  }
}

const porNombre = (a: Docente, b: Docente) => a.nombre.localeCompare(b.nombre, 'es')

export async function listarDocentes(): Promise<Docente[]> {
  const snap = await getDocs(collection(db, 'usuarios', 'docentes', 'docentes'))
  return snap.docs.map((d) => aDocente(d.id, d.data())).sort(porNombre)
}

async function existeId(id: string): Promise<boolean> {
  const d = await getDoc(doc(db, 'usuarios', 'docentes', 'docentes', id))
  return d.exists()
}

export async function crearDocente(datos: DocenteBase): Promise<string> {
  const base = idDesdeNombre(datos.nombre) || 'docente'
  let id = base
  let numero = 2
  while (await existeId(id)) {
    id = `${base}${numero}`
    numero += 1
  }
  await setDoc(doc(db, 'usuarios', 'docentes', 'docentes', id), {
    nombre: datos.nombre,
    dui: datos.dui,
    nip: datos.nip,
    telefono: datos.telefono,
    correo: datos.correo.trim().toLowerCase(),
    rol: datos.rol,
    estado: ESTADO_ACTIVO,
  })
  return id
}

/* Actualiza SOLO los campos que cambiaron (calculados con diffDocente);
   si no cambió nada, ni siquiera se hace una llamada. */
export async function actualizarDocente(id: string, cambios: Partial<DocenteBase>): Promise<void> {
  if (!Object.keys(cambios).length) return
  await updateDoc(doc(db, 'usuarios', 'docentes', 'docentes', id), cambios)
}

/* Archivar / restaurar: el documento NO se borra, solo cambia su estado */
export async function cambiarEstadoDocente(
  id: string,
  estado: typeof ESTADO_ACTIVO | typeof ESTADO_ARCHIVADO,
): Promise<void> {
  await updateDoc(doc(db, 'usuarios', 'docentes', 'docentes', id), { estado })
}

export async function eliminarDocente(id: string): Promise<void> {
  await deleteDoc(doc(db, 'usuarios', 'docentes', 'docentes', id))
}

/* Campos de pantalla que cambian entre dos registros (el correo se compara limpio) */
export function diffDocente(actual: DocenteBase, nuevo: DocenteBase): Partial<DocenteBase> {
  const cambios: Partial<DocenteBase> = {}
  if (actual.nombre !== nuevo.nombre) cambios.nombre = nuevo.nombre
  if (actual.dui !== nuevo.dui) cambios.dui = nuevo.dui
  if (actual.nip !== nuevo.nip) cambios.nip = nuevo.nip
  if (actual.telefono !== nuevo.telefono) cambios.telefono = nuevo.telefono
  const correoActual = actual.correo.trim().toLowerCase()
  const correoNuevo = nuevo.correo.trim().toLowerCase()
  if (correoActual !== correoNuevo) cambios.correo = correoNuevo
  if (actual.rol !== nuevo.rol) cambios.rol = nuevo.rol
  return cambios
}

/* Dos listas son idénticas (id, campos y orden):
   sirve para no tocar la tabla ni el caché si el servidor no trajo nada nuevo */
export function mismosDocentes(a: Docente[], b: Docente[]): boolean {
  if (a.length !== b.length) return false
  return a.every((d, i) => {
    const o = b[i]
    return Boolean(
      o &&
        d.id === o.id &&
        d.nombre === o.nombre &&
        d.dui === o.dui &&
        d.nip === o.nip &&
        d.telefono === o.telefono &&
        d.correo === o.correo &&
        d.rol === o.rol &&
        d.estado === o.estado,
    )
  })
}

/* ── Caché de la lista de docentes (localStorage) ── */
const CLAVE_CACHE = 'docentes'
/* v3: la lista ahora incluye el campo rol (los cachés viejos se descartan) */
const VERSION_CACHE = 3

interface CacheDocentes {
  version: number
  lista: Docente[]
}

export function leerDocentesCache(): Docente[] | null {
  const cache = leerCache<CacheDocentes>(CLAVE_CACHE)
  if (!cache || cache.version !== VERSION_CACHE || !Array.isArray(cache.lista)) return null
  return cache.lista
}

/* Solo escribe si la lista cambió (guardarCache compara antes de escribir) */
export function guardarDocentesCache(lista: Docente[]): void {
  guardarCache(CLAVE_CACHE, { version: VERSION_CACHE, lista })
}

/* Mensajes de error legibles para las notificaciones */
export function mensajeError(e: unknown): string {
  const codigo = (e as { code?: string })?.code ?? ''
  if (codigo === 'permission-denied') {
    return 'Sin permisos para escribir en Firebase. Publica las reglas nuevas (incluyen los campos estado y rol) en Firebase Console → Firestore Database → Reglas.'
  }
  if (codigo === 'not-found') {
    return 'El documento ya no existe en Firebase (quizá se borró desde otro lado).'
  }
  if (codigo === 'unavailable') return 'Firebase no está disponible en este momento.'
  const texto = (e as Error)?.message
  return texto ? String(texto) : 'Ocurrió un error inesperado.'
}
