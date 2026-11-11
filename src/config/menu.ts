// ─────────────────────────────────────────────────────────────
// DATOS DEL MENÚ.
// Cada sección/subsección declara QUIÉN la ve (roles = indicadores
// internos 1-5) y a qué ruta lleva. El orden en pantalla lo calcula
// menuParaRol(): Inicio SIEMPRE primero, resto alfabético (es).
// ─────────────────────────────────────────────────────────────
import type { RolNumero } from '@/lib/usuarios'

export interface SubSeccion {
  id: string
  nombre: string
  ruta: string
  roles: RolNumero[]
}

export interface Seccion {
  id: string
  nombre: string
  icono: string // markup interno del SVG (sin relleno)
  ruta: string
  roles: RolNumero[]
  subsecciones?: SubSeccion[]
}

export const MENU: Seccion[] = [
  {
    id: 'inicio',
    nombre: 'Inicio',
    icono: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    ruta: '/inicio',
    roles: [1, 2, 3, 4, 5], // todos
  },
  {
    id: 'docentes',
    nombre: 'Docentes',
    icono:
      '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    ruta: '/docentes',
    roles: [1, 2], // admin y director
  },
  {
    id: 'estudiantes',
    nombre: 'Estudiantes',
    icono:
      '<path d="M2 10l10-5 10 5-10 5z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
    ruta: '/estudiantes',
    roles: [1, 2, 3], // admin, director y docente
    subsecciones: [
      {
        id: 'est-matricular',
        nombre: 'Matricular',
        ruta: '/estudiantes/matricular',
        roles: [1, 2, 3],
      },
      { id: 'est-retirar', nombre: 'Retirar', ruta: '/estudiantes/retirar', roles: [1, 2] }, // solo admin y director
      {
        id: 'est-actualizar',
        nombre: 'Actualizar',
        ruta: '/estudiantes/actualizar',
        roles: [1, 2, 3],
      },
      { id: 'est-nomina', nombre: 'Nómina', ruta: '/estudiantes/nomina', roles: [1, 2, 3] },
      { id: 'est-archivar', nombre: 'Archivar', ruta: '/estudiantes/archivar', roles: [1, 2] }, // solo admin y director
      { id: 'est-promocion', nombre: 'Promoción', ruta: '/estudiantes/promocion', roles: [1, 2] }, // solo admin y director
    ],
  },
]

/** Menú visible para un rol: Inicio primero, resto alfabético (también las subsecciones). */
export function menuParaRol(rol: RolNumero): Seccion[] {
  const visibles = MENU.filter((seccion) => seccion.roles.includes(rol)).map((seccion) => ({
    ...seccion,
    subsecciones: seccion.subsecciones
      ?.filter((sub) => sub.roles.includes(rol))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
  }))

  const inicio = visibles.filter((seccion) => seccion.id === 'inicio')
  const resto = visibles
    .filter((seccion) => seccion.id !== 'inicio')
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  return [...inicio, ...resto]
}
