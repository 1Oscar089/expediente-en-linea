/* ── Cliente del Sheet de CONFIGURACIÓN (Apps Script) ──
   El libro "configuracion" tiene UNA HOJA POR SUBSECCIÓN (informacion-ce,
   cde, ciclo-escolar…). La URL se configura en VITE_SHEET_CONFIGURACION_URL.
   El POST se envía como text/plain (sin header Content-Type) para evitar
   el preflight de CORS, que Apps Script no atiende. */

const URL_SHEET = (import.meta.env.VITE_SHEET_CONFIGURACION_URL ?? '').trim()

export const sheetConfigurado = URL_SHEET.length > 0

interface RespuestaSheet {
  ok?: boolean
  error?: string
}

async function llamarSheet<T extends RespuestaSheet>(cuerpo: Record<string, unknown>): Promise<T> {
  if (!sheetConfigurado) {
    throw new Error('el Sheet de configuración no está configurado (falta VITE_SHEET_CONFIGURACION_URL).')
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

/* ── Información CE (registro único: fila 2 de su hoja) ── */
export interface InfoCE {
  codigoInfraestructura: string
  centroEducativo: string
  departamento: string
  municipio: string
  distrito: string
  canton: string
  referencia: string
}

export const INFO_CE_VACIA: InfoCE = {
  codigoInfraestructura: '',
  centroEducativo: '',
  departamento: '',
  municipio: '',
  distrito: '',
  canton: '',
  referencia: '',
}

/* Caché en memoria: la información se pide al Sheet UNA sola vez por recarga
   de la página; volver a entrar a la subsección NO hace ninguna llamada, y
   al guardar se actualiza la caché con lo que ya quedó en el Sheet. */
let cacheInfoCE: InfoCE | null = null

export function infoCEGuardada(): InfoCE | null {
  return cacheInfoCE
}

function aInfoCE(bruto: Record<string, unknown> | null | undefined): InfoCE {
  const base = bruto ?? {}
  return {
    codigoInfraestructura: String(base.codigoInfraestructura ?? ''),
    centroEducativo: String(base.centroEducativo ?? ''),
    departamento: String(base.departamento ?? ''),
    municipio: String(base.municipio ?? ''),
    distrito: String(base.distrito ?? ''),
    canton: String(base.canton ?? ''),
    referencia: String(base.referencia ?? ''),
  }
}

export async function leerInfoCE(): Promise<InfoCE> {
  if (cacheInfoCE) return cacheInfoCE
  const r = await llamarSheet<{ ok: true; datos?: Record<string, unknown> }>({
    accion: 'leer',
    seccion: 'informacion-ce',
  })
  cacheInfoCE = aInfoCE(r.datos)
  return cacheInfoCE
}

export async function guardarInfoCE(info: InfoCE): Promise<void> {
  await llamarSheet({
    accion: 'guardar',
    seccion: 'informacion-ce',
    datos: info,
  })
  cacheInfoCE = { ...info }
}