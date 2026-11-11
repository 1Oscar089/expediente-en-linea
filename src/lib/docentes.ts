import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
} from 'firebase/firestore'

import { db } from '@/lib/firebase'

/* ── Docentes ──
   Firebase guarda SOLO los datos que se muestran en pantalla:
   nombre, dui, nip, telefono + correo (no se muestra pero es obligatorio).
   El Sheet guarda TODOS los datos (ver lib/sheetDocentes.ts).

   Ruta en Firestore: usuarios > docentes > docentes
   ID del documento: nombre[0] + nombre[2]  →  p. ej. "Juan Lopez Perez" = "JuanLopez"
   (si ya existe ese ID, se agrega un número: JuanLopez2, JuanLopez3…) */

export interface DocenteBase {
  nombre: string
  dui: string
  nip: string
  telefono: string
  correo: string
}

/* Registro completo: lo que vive en el Sheet */
export interface DocenteCompleto extends DocenteBase {
  fechaNacimiento: string
  anioServicio: string
  especialidad: string
  rol: string
  estado: string
}

export type Docente = DocenteBase & { id: string }

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
  /* Si un dato no existe, se coloca blanco (nunca "undefined") */
  return {
    id,
    nombre: String(datos.nombre ?? ''),
    dui: String(datos.dui ?? ''),
    nip: String(datos.nip ?? ''),
    telefono: String(datos.telefono ?? ''),
    correo: String(datos.correo ?? ''),
  }
}

export async function listarDocentes(): Promise<Docente[]> {
  const snap = await getDocs(collection(db, 'usuarios', 'docentes', 'docentes'))
  const lista = snap.docs.map((d) => aDocente(d.id, d.data()))
  return lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
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
  })
  return id
}

export async function actualizarDocente(id: string, datos: DocenteBase): Promise<void> {
  await setDoc(doc(db, 'usuarios', 'docentes', 'docentes', id), {
    nombre: datos.nombre,
    dui: datos.dui,
    nip: datos.nip,
    telefono: datos.telefono,
    correo: datos.correo.trim().toLowerCase(),
  })
}

export async function eliminarDocente(id: string): Promise<void> {
  await deleteDoc(doc(db, 'usuarios', 'docentes', 'docentes', id))
}

/* Mensajes de error legibles para las notificaciones */
export function mensajeError(e: unknown): string {
  const codigo = (e as { code?: string })?.code ?? ''
  if (codigo === 'permission-denied') return 'Sin permisos para escribir en Firebase.'
  if (codigo === 'unavailable') return 'Firebase no está disponible en este momento.'
  const texto = (e as Error)?.message
  return texto ? String(texto) : 'Ocurrió un error inesperado.'
}