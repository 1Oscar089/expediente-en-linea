import type { Rol } from '@/lib/usuarios'

/* ── Estructura del menú ──
   Cada sección y subsección declara su lista de roles.
   Indicadores internos: 1=admin, 2=director, 3=docente, 4=estudiante, 5=responsable */
export interface SubSeccion {
  id: string
  nombre: string
  roles: Rol[]
}

export interface Seccion {
  id: string
  nombre: string
  icono: string
  roles: Rol[]
  subsecciones?: SubSeccion[]
}

/* Iconos SVG: SOLO TRAZO, sin relleno. Heredan el color del texto (currentColor). */
const svg = (trazo: string) =>
  `<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${trazo}</svg>`

const TODOS: Rol[] = ['admin', 'director', 'docente', 'estudiante', 'responsable']
const DIRECCION: Rol[] = ['admin', 'director']
const ACADEMICO: Rol[] = ['admin', 'director', 'docente']

/* Orden dentro del arreglo: Inicio primero, el resto alfabético
   (Configuración, Docentes, Estudiantes).
   REGLA: Inicio es de TODOS los roles — no se le ponen restricciones. */
export const MENU: Seccion[] = [
  {
    id: 'inicio',
    nombre: 'Inicio',
    roles: TODOS,
    icono: svg(
      '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    ),
  },
  {
    id: 'configuracion',
    nombre: 'Configuración',
    roles: DIRECCION,
    icono: svg(
      '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    ),
    /* Subsecciones en orden alfabético. Cada una vive en SU hoja del libro
       "configuracion" (una hoja por subsección) y se construye por etapas. */
    subsecciones: [
      { id: 'asignaturas', nombre: 'Asignaturas', roles: DIRECCION },
      { id: 'avisos', nombre: 'Avisos', roles: DIRECCION },
      { id: 'backup', nombre: 'Backup y respaldo', roles: DIRECCION },
      { id: 'cde', nombre: 'CDE', roles: DIRECCION },
      { id: 'ciclo-escolar', nombre: 'Ciclo Escolar', roles: DIRECCION },
      { id: 'consola', nombre: 'Consola', roles: DIRECCION },
      { id: 'fondos', nombre: 'Fondos', roles: DIRECCION },
      { id: 'informacion-ce', nombre: 'Informacion CE', roles: DIRECCION },
      { id: 'inventarios', nombre: 'Inventarios', roles: DIRECCION },
      { id: 'programaciones', nombre: 'Programaciones', roles: DIRECCION },
      { id: 'recursos', nombre: 'Recursos', roles: DIRECCION },
      { id: 'secciones', nombre: 'Secciones', roles: DIRECCION },
    ],
  },
  {
    id: 'docentes',
    nombre: 'Docentes',
    roles: DIRECCION,
    icono: svg('<path d="M2 3h20"/><path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3"/><path d="m7 21 5-5 5 5"/>'),
  },
  {
    id: 'estudiantes',
    nombre: 'Estudiantes',
    roles: ACADEMICO,
    icono: svg(
      '<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
    ),
    subsecciones: [
      { id: 'actualizar', nombre: 'Actualizar', roles: ACADEMICO },
      { id: 'archivar', nombre: 'Archivar', roles: DIRECCION },
      { id: 'descargables', nombre: 'Descargables', roles: DIRECCION },
      { id: 'matricular', nombre: 'Matricular', roles: ACADEMICO },
      { id: 'nomina', nombre: 'Nomina', roles: ACADEMICO },
      { id: 'promocion', nombre: 'Promocion', roles: DIRECCION },
      { id: 'retirar', nombre: 'Retirar', roles: DIRECCION },
    ],
  },
]

/* Filtra el menú por rol.
   REGLA BLINDADA: Inicio SIEMPRE aparece (cualquier rol) y SIEMPRE va primero,
   aunque su lista de roles cambie por error. El resto se ordena alfabético (es). */
export function menuParaRol(rol: Rol | null): Seccion[] {
  if (!rol) return []

  const inicio = MENU.find((seccion) => seccion.id === 'inicio')

  const resto = MENU.filter((seccion) => seccion.id !== 'inicio' && seccion.roles.includes(rol))
    .map((seccion) => ({
      ...seccion,
      subsecciones: seccion.subsecciones?.filter((sub) => sub.roles.includes(rol)),
    }))
    .filter((seccion) => !seccion.subsecciones || seccion.subsecciones.length > 0)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  return inicio ? [{ ...inicio }, ...resto] : resto
}