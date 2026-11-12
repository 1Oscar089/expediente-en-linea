/* ── Caché local del proyecto (localStorage) ──
   Sirve para no pedirle al servidor lo mismo en cada visita:
   - leerCache devuelve lo guardado (o null si no hay nada o está corrupto).
   - guardarCache SOLO escribe si el contenido cambió
     (devuelve true si escribió, false si era idéntico).
   Todo el proyecto comparte el mismo prefijo de llaves. */

const PREFIJO = 'expediente-en-linea:'

export function leerCache<T>(clave: string): T | null {
  try {
    const crudo = localStorage.getItem(PREFIJO + clave)
    if (!crudo) return null
    return JSON.parse(crudo) as T
  } catch {
    return null
  }
}

export function guardarCache<T>(clave: string, valor: T): boolean {
  try {
    const crudo = JSON.stringify(valor)
    if (localStorage.getItem(PREFIJO + clave) === crudo) return false /* sin cambios: no escribe */
    localStorage.setItem(PREFIJO + clave, crudo)
    return true
  } catch {
    return false
  }
}

export function borrarCache(clave: string): void {
  try {
    localStorage.removeItem(PREFIJO + clave)
  } catch {
    /* sin localStorage no hay nada que borrar */
  }
}
