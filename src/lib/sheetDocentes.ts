import type { DocenteCompleto } from './docentes'

/* ── Cliente del Sheet de docentes (Apps Script) ──
   La URL se configura en VITE_SHEET_DOCENTES_URL.
   El POST se envía como text/plain (sin header Content-Type) para evitar
   el preflight de CORS, que Apps Script no atiende. */

const URL_SHEET = (import.meta.env.VITE_SHEET_DOCENTES_URL ?? '').trim()

export const sheetConfigurado = URL_SHEET.length > 0

export interface FilaDocente extends DocenteCompleto {}

interface RespuestaSheet {
  ok?: boolean
  error?: string
}

async function llamarSheet<T extends RespuestaSheet>(
  cuerpo: Record<string, unknown>,
): Promise<T> {
  if (!sheetConfigurado) {
    throw new Error('El Sheet no está configurado (falta VITE_SHEET_DOCENTES_URL).')
  }
  const control = new AbortController()
  const temporizador = setTimeout(() => control.abort(), 25000)
  try {
    const respuesta = await fetch(URL_SHEET, {
      method: 'POST',
      body: JSON.stringify(cuerpo),
      signal: control.signal,
    })
    if (!respuesta.ok) {
      throw new Error(`el Sheet respondió con error HTTP ${respuesta.status}`)
    }
    /* Apps Script debe devolver JSON; si devuelve HTML es porque el despliegue
       no es una Web App pública o la URL no es la que termina en /exec. */
    const texto = await respuesta.text()
    let datos: T
    try {
      datos = JSON.parse(texto) as T
    } catch {
      throw new Error(
        'la URL del Sheet no responde como Web App. Revisa el despliegue: "Ejecutar como: Yo" y "Quién tiene acceso: Cualquiera", y usa la URL que termina en /exec.',
      )
    }
    if (!datos.ok) throw new Error(datos.error || 'el Sheet devolvió un error.')
    return datos
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') {
      throw new Error('el Sheet tardó demasiado en responder.')
    }
    if (e instanceof TypeError) {
      /* "Failed to fetch": Google redirigió a su página de inicio de sesión
         porque el despliegue NO tiene acceso "Cualquiera". */
      throw new Error(
        'no se pudo conectar con el Sheet. En el despliegue de la Web App, "Quién tiene acceso" debe ser "Cualquiera" (no "Cualquier cuenta de Google") y la URL debe terminar en /exec.',
      )
    }
    throw e
  } finally {
    clearTimeout(temporizador)
  }
}

export async function listarHoja(): Promise<FilaDocente[]> {
  const r = await llamarSheet<{ ok: true; filas: FilaDocente[] }>({ accion: 'listar' })
  return (r.filas ?? []).map((f) => ({
    nombre: String(f.nombre ?? ''),
    dui: String(f.dui ?? ''),
    nip: String(f.nip ?? ''),
    telefono: String(f.telefono ?? ''),
    correo: String(f.correo ?? ''),
    fechaNacimiento: String(f.fechaNacimiento ?? ''),
    anioServicio: String(f.anioServicio ?? ''),
    especialidad: String(f.especialidad ?? ''),
    rol: String(f.rol ?? ''),
    estado: String(f.estado ?? '').trim() || 'activo',
  }))
}

export async function crearEnHoja(docente: DocenteCompleto): Promise<void> {
  await llamarSheet({ accion: 'crear', docente })
}

export async function actualizarEnHoja(
  correoBuscada: string,
  docente: DocenteCompleto,
): Promise<void> {
  await llamarSheet({ accion: 'actualizar', correoBuscada, docente })
}

export async function archivarEnHoja(correoBuscada: string): Promise<void> {
  await llamarSheet({ accion: 'archivar', correoBuscada })
}

export async function restaurarEnHoja(correoBuscada: string): Promise<void> {
  await llamarSheet({ accion: 'restaurar', correoBuscada })
}

export async function borrarEnHoja(correoBuscada: string): Promise<void> {
  await llamarSheet({ accion: 'borrar', correoBuscada })
}

/* Copia a la hoja SOLO los docentes de Firebase que aún no están en ella */
export async function sincronizarHoja(
  faltantes: DocenteCompleto[],
): Promise<{ agregados: number }> {
  const r = await llamarSheet<{ ok: true; agregados: number }>({
    accion: 'sincronizar',
    docentes: faltantes,
  })
  return { agregados: Number(r.agregados ?? 0) }
}
