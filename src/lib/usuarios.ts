import { collection, getDocs, limit, query, where } from 'firebase/firestore'

import { db } from '@/lib/firebase'

/* ── Roles (indicadores internos: 1=admin, 2=director, 3=docente, 4=estudiante, 5=responsable) ── */
export type Rol = 'admin' | 'director' | 'docente' | 'estudiante' | 'responsable'

export interface Perfil {
  correo: string
  nombre: string
  rol: Rol
  grado?: string
}

/* Etiquetas legibles para mostrar en pantalla */
export const NOMBRES_ROL: Record<Rol, string> = {
  admin: 'Administrador',
  director: 'Director',
  docente: 'Docente',
  estudiante: 'Estudiante',
  responsable: 'Responsable',
}

/* Dominios de correo */
export const DOMINIO_INSTITUCIONAL = '@clases.edu.sv'
export const DOMINIO_RESPONSABLE = '@prados.com'

const limpiar = (valor: unknown) => String(valor ?? '').trim().toLowerCase()

/* Busca el perfil institucional:
   1) usuarios > docentes > docentes  → rol admin | director | docente
   2) usuarios > estudiantes > estudiantes → rol estudiante (con grado)

   Un docente SIN rol en Firebase (o con un rol desconocido) NO inicia
   sesión: sin rol no hay menú ni permisos y la sidebar/userbar quedarían
   vacías o a medio funcionar. Ese caso se rechaza como "no registrado". */
export async function buscarPerfilInstitucional(correo: string): Promise<Perfil | null> {
  const correoBuscado = limpiar(correo)

  const docentesSnap = await getDocs(
    query(
      collection(db, 'usuarios', 'docentes', 'docentes'),
      where('correo', '==', correoBuscado),
      limit(1),
    ),
  )
  const docente = docentesSnap.docs[0]?.data()
  if (docente) {
    const rol = limpiar(docente.rol)
    if (!Object.keys(NOMBRES_ROL).includes(rol)) return null
    return {
      correo: correoBuscado,
      nombre: String(docente.nombre ?? ''),
      rol: rol as Rol,
    }
  }

  const estudiantesSnap = await getDocs(
    query(
      collection(db, 'usuarios', 'estudiantes', 'estudiantes'),
      where('correo', '==', correoBuscado),
      limit(1),
    ),
  )
  const estudiante = estudiantesSnap.docs[0]?.data()
  if (estudiante) {
    return {
      correo: correoBuscado,
      nombre: String(estudiante.nombre ?? ''),
      rol: 'estudiante',
      grado: String(estudiante.grado ?? ''),
    }
  }

  return null
}

/* Busca al estudiante por NIE para validar al responsable.
   El correo del responsable es nie...@prados.com y la contraseña el DUI sin guion. */
export async function buscarEstudiantePorNie(
  nie: string,
): Promise<(Perfil & { dui: string }) | null> {
  const nieBuscado = limpiar(nie)

  const snap = await getDocs(
    query(
      collection(db, 'usuarios', 'estudiantes', 'estudiantes'),
      where('nie', '==', nieBuscado),
      limit(1),
    ),
  )
  const estudiante = snap.docs[0]?.data()
  if (!estudiante) return null

  return {
    correo: `${nieBuscado}${DOMINIO_RESPONSABLE}`,
    nombre: String(estudiante.responsable ?? ''),
    rol: 'responsable',
    dui: String(estudiante.dui ?? '').replace(/-/g, ''),
  }
}
