// ─────────────────────────────────────────────────────────────
// BÚSQUEDA DE PERFILES EN FIRESTORE (solo lectura).
//   usuarios/docentes/docentes/{id}       → { nombre, correo, rol }
//   usuarios/estudiantes/estudiantes/{id} → { nombre, correo, nie, dui, responsable, grado }
// Indicadores de rol (SOLO internos, nunca se muestran):
//   1=admin, 2=director, 3=docente, 4=estudiante, 5=responsable
// ─────────────────────────────────────────────────────────────
import { collection, getDocs, limit, query, where } from 'firebase/firestore'
import { db } from './firebase'

export type Rol = 'admin' | 'director' | 'docente' | 'estudiante' | 'responsable'

// Indicadores internos del proyecto (para filtros y rutas)
export const INDICADORES = {
  admin: 1,
  director: 2,
  docente: 3,
  estudiante: 4,
  responsable: 5,
} as const

export type RolNumero = (typeof INDICADORES)[keyof typeof INDICADORES]

export function numeroDeRol(rol: string): RolNumero {
  return INDICADORES[rol as keyof typeof INDICADORES] ?? 5 // desconocido → el más limitado
}

export interface Perfil {
  correo: string
  nombre: string // nombre COMPLETO (la userbar muestra nombre[0])
  rol: Rol // texto para mostrar en pantalla
  rolNumero: RolNumero // indicador interno para permisos
  grado?: string // solo estudiantes
}

function normalizar(correo: string) {
  return correo.trim().toLowerCase()
}

/** Docentes y estudiantes: busca por el correo de la cuenta Google. */
export async function buscarPerfilInstitucional(correo: string): Promise<Perfil | null> {
  const buscado = normalizar(correo)

  // 1) ¿Está en docentes? → rol del documento (admin | director | docente)
  const qDocentes = query(
    collection(db, 'usuarios', 'docentes', 'docentes'),
    where('correo', '==', buscado),
    limit(1),
  )
  const snapDocentes = await getDocs(qDocentes)
  if (!snapDocentes.empty) {
    const d = snapDocentes.docs[0].data()
    return {
      correo: buscado,
      nombre: d.nombre ?? '',
      rol: d.rol as Rol,
      rolNumero: numeroDeRol(d.rol as string),
    }
  }

  // 2) ¿Está en estudiantes? → rol fijo: estudiante (+ grado)
  const qEstudiantes = query(
    collection(db, 'usuarios', 'estudiantes', 'estudiantes'),
    where('correo', '==', buscado),
    limit(1),
  )
  const snapEstudiantes = await getDocs(qEstudiantes)
  if (!snapEstudiantes.empty) {
    const d = snapEstudiantes.docs[0].data()
    return {
      correo: buscado,
      nombre: d.nombre ?? '',
      rol: 'estudiante',
      rolNumero: INDICADORES.estudiante,
      grado: d.grado as string | undefined,
    }
  }

  return null
}

/** Responsables: busca al estudiante por su NIE (prefijo de nie@prados.com). */
export async function buscarEstudiantePorNie(nie: string) {
  const q = query(
    collection(db, 'usuarios', 'estudiantes', 'estudiantes'),
    where('nie', '==', nie.trim().toLowerCase()),
    limit(1),
  )
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = snap.docs[0].data()
  return {
    dui: String(d.dui ?? ''),
    grado: d.grado as string | undefined,
    nombre: (d.nombre as string) ?? '',
    responsable: (d.responsable as string) ?? '',
  }
}
