/* ── Fechas y horas: formato de El Salvador (regla de TODO el proyecto) ──
   - Fechas: dd/mm/yyyy        → 03/04/1968
   - Horas:  12 horas AM/PM    → 08:30 AM · la medianoche se muestra 00:00 AM
                                 y el mediodía 12:00 PM.
   TODA fecha u hora que se muestre en pantalla sale de estas funciones.
   Aceptan lo que pueda llegar de cualquier parte:
   - Date de JavaScript
   - "yyyy-mm-dd" (lo que produce el input de fecha y lo que se guarda)
   - ISO con hora ("1968-04-03T06:00:00.000Z", lo que devuelve Firebase)
   - el texto largo de Google Sheets:
     "Wed Apr 03 1968 00:00:00 GMT-0600 (hora estándar central)"
   - dd/mm/yyyy (el formato que se ve en pantalla)
   Si el valor no se puede interpretar, devuelven '' (blanco, nunca
   "Invalid Date" ni "undefined").

   Para GUARDAR se usa aIsoFecha: devuelve "yyyy-mm-dd", el formato neutro
   que el input de fecha y el Sheet entienden sin ambigüedad de zona horaria. */

interface FechaPartes {
  anio: number
  mes: number /* 1-12 */
  dia: number
}

/* Abreviaturas de mes en inglés: Date.toString() las usa SIEMPRE en inglés,
   aunque la cuenta de Google esté en español ("Wed Apr 03 1968…"). */
const MESES_EN: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
}

const dos = (n: number): string => String(n).padStart(2, '0')

/* Interpreta cualquier valor de fecha y devuelve sus partes.
   En los TEXTOS las partes se sacan con expresiones regulares, SIN pasar
   por new Date: así la fecha no se corre un día por la zona horaria.
   Devuelve null si no se entiende el valor. */
export function aFecha(valor: unknown): FechaPartes | null {
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null
    return { anio: valor.getFullYear(), mes: valor.getMonth() + 1, dia: valor.getDate() }
  }
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    /* Número serial de Sheets (días desde el 30/12/1899) */
    const f = new Date(Math.round((valor - 25569) * 86400000))
    return Number.isNaN(f.getTime())
      ? null
      : { anio: f.getUTCFullYear(), mes: f.getUTCMonth() + 1, dia: f.getUTCDate() }
  }
  if (typeof valor !== 'string') return null
  const texto = valor.trim()
  if (!texto) return null

  /* yyyy-mm-dd o ISO con hora (1968-04-03, 1968-04-03T06:00:00.000Z) */
  let m = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return { anio: Number(m[1]), mes: Number(m[2]), dia: Number(m[3]) }

  /* Texto largo de Sheets/JS: "Wed Apr 03 1968 00:00:00 GMT-0600 (…)".
     Los nombres de mes van en inglés sin importar el idioma de la cuenta. */
  m = texto.match(/^[A-Za-z]{3},?\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})/)
  if (m) {
    const mes = MESES_EN[(m[1] ?? '').toLowerCase()]
    if (mes) return { anio: Number(m[3]), mes, dia: Number(m[2]) }
  }

  /* dd/mm/yyyy o dd-mm-yyyy (el formato que ya se ve en pantalla) */
  m = texto.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/)
  if (m) return { anio: Number(m[3]), mes: Number(m[2]), dia: Number(m[1]) }
  m = texto.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (m) return { anio: Number(m[3]), mes: Number(m[2]), dia: Number(m[1]) }

  /* Último intento: que el navegador lo interprete */
  const f = new Date(texto)
  return Number.isNaN(f.getTime())
    ? null
    : { anio: f.getFullYear(), mes: f.getMonth() + 1, dia: f.getDate() }
}

/* Interpreta cualquier valor de hora: Date, "HH:mm[:ss]" con o sin AM/PM,
   ISO con hora y número serial de Sheets (0.354166 = 08:30 AM).
   Devuelve { h: 0-23, min: 0-59 } o null si no se entiende. */
export function aMomento(valor: unknown): { h: number; min: number } | null {
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null
    return { h: valor.getHours(), min: valor.getMinutes() }
  }
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    const total = Math.round((valor % 1) * 24 * 60) % (24 * 60)
    return { h: Math.floor(total / 60), min: total % 60 }
  }
  if (typeof valor !== 'string') return null
  const texto = valor.trim()
  if (!texto) return null

  /* "08:30", "8:30:15", "08:30 AM", "1:05 p.m." */
  const m = texto.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?$/i)
  if (m) {
    let h = Number(m[1])
    const min = Number(m[2])
    const sufijo = (m[3] ?? '').toLowerCase().replace(/[.\s]/g, '')
    if (sufijo === 'pm' && h < 12) h += 12
    if (sufijo === 'am' && h === 12) h = 0
    if (h > 23 || min > 59) return null
    return { h, min }
  }

  /* ISO con hora o texto largo: se convierte y se lee en hora local */
  const f = new Date(texto)
  return Number.isNaN(f.getTime()) ? null : { h: f.getHours(), min: f.getMinutes() }
}

/* Fecha en formato de El Salvador: dd/mm/yyyy */
export function fechaCorta(valor: unknown): string {
  const f = aFecha(valor)
  return f ? `${dos(f.dia)}/${dos(f.mes)}/${f.anio}` : ''
}

/* Fecha para guardar: yyyy-mm-dd (formato neutro del input y del Sheet) */
export function aIsoFecha(valor: unknown): string {
  const f = aFecha(valor)
  return f ? `${f.anio}-${dos(f.mes)}-${dos(f.dia)}` : ''
}

/* Hora en 12 horas con AM/PM: 08:30 AM · 00:00 AM (medianoche) · 12:00 PM (mediodía) */
export function horaCorta(valor: unknown): string {
  const m = aMomento(valor)
  if (!m) return ''
  const h12 = m.h === 12 ? 12 : m.h % 12
  return `${dos(h12)}:${dos(m.min)} ${m.h < 12 ? 'AM' : 'PM'}`
}

/* Fecha y hora juntas: dd/mm/yyyy hh:mm AM/PM. Si el valor no trae hora,
   devuelve solo la fecha. El texto largo de Sheets es SIEMPRE una celda de
   solo fecha (su 00:00 pertenece a la zona de Google, no a la del que ve):
   se muestra sin hora para no inventar datos. */
export function fechaHora(valor: unknown): string {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return `${fechaCorta(valor)} ${horaCorta(valor)}`
  }
  if (typeof valor === 'string') {
    if (/^[A-Za-z]{3},?\s+[A-Za-z]{3}\s+\d{1,2}\s+\d{4}/.test(valor.trim())) {
      return fechaCorta(valor)
    }
    if (/\d{1,2}:\d{2}/.test(valor)) {
      const f = new Date(valor.trim())
      if (!Number.isNaN(f.getTime())) return `${fechaCorta(f)} ${horaCorta(f)}`
    }
  }
  return fechaCorta(valor)
}