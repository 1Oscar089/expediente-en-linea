/* ── El estudiante elegido en Estudiantes › Actualizar, guardado EN LOCAL ──
   REGLA DEL USUARIO para Actualizar:
     1. PRIMERO se hace la búsqueda y el estudiante elegido se GUARDA EN
        LOCAL (localStorage por usuario, igual que el borrador).
     2. Se ANALIZA SU GRADO (el id de clase del catálogo): de Primero hacia
        abajo (id < 2) es Primera Infancia y de Segundo en adelante (id ≥ 2)
        es Educación Básica — el MISMO corte con el que Matricular reparte
        las hojas. Con la etapa detectada se muestran las PARTES a modificar.
     3. Al GUARDAR una parte se vuelve a la lista de partes con el MISMO
        estudiante seleccionado (la fila actualizada sigue en el local).
        Para usar otro estudiante está el botón CAMBIAR ESTUDIANTE.
     4. Si se elige OTRA SECCIÓN o SUBSECCIÓN del menú, la vista se desmonta
        y la copia local SE BORRA: la próxima vez toca hacer la búsqueda de
        nuevo. */

import { borrarCache, guardarCache, leerCache } from '@/lib/cache'
import { idDeGrado } from '@/lib/estudiantes'
import { HOJA_BASICA, type CoincidenciaFila, type HojaEstudiante } from '@/lib/sheetEstudiantes'
import type { NivelEstudiante } from '@/lib/estudiantePartes'

/* Lo que queda guardado EN LOCAL tras la búsqueda */
export interface EstudianteActualizar {
  /* La coincidencia de la búsqueda (hoja + fila + nombre + NIE + grado) */
  elegido: CoincidenciaFila
  /* La fila completa leída del Sheet ({título de columna: valor}) */
  fila: Record<string, string>
  /* El nivel que manda: decide las PARTES que se muestran */
  nivel: NivelEstudiante
}

/* ── El análisis del GRADO (regla del usuario) ──
   El id de clase del grado decide la etapa:
     - id < 2 (Parvularia 4/5/6 y Primero)  → Primera Infancia
     - id ≥ 2 (Segundo a Noveno)            → Educación Básica
   Es el MISMO corte que usa Matricular al repartir las hojas del libro,
   así que el análisis coincide con la hoja donde vive la fila.
   Devuelve null si el grado no se reconoce (o viene vacío). */
export function nivelDeGrado(grado: string): NivelEstudiante | null {
  const id = idDeGrado(grado)
  if (id === null) return null
  return id < 2 ? 'primera-infancia' : 'educacion-basica'
}

/* El nivel de la hoja donde VIVE la fila. La hoja nunca miente: es donde se
   lee y se escribe. Si el grado y la hoja contaran historias distintas
   (p. ej. un grado cambiado a mano), manda la hoja — con aviso en pantalla —
   para no escribir columnas en la hoja equivocada. */
export function nivelDeHoja(hoja: HojaEstudiante): NivelEstudiante {
  return hoja === HOJA_BASICA ? 'educacion-basica' : 'primera-infancia'
}

/* Etiqueta legible del nivel (tarjetas, barra y avisos) */
export function nombreNivel(nivel: NivelEstudiante): string {
  return nivel === 'educacion-basica' ? 'Educación Básica' : 'Primera Infancia'
}

/* ── La copia local POR USUARIO (mismo esquema que el borrador) ── */
function clave(correo: string): string {
  return `actualizar.estudiante:${correo}`
}

/* Devuelve la copia local o null si no hay nada, está corrupta o le faltan
   piezas (la vista entonces pide la búsqueda de nuevo). */
export function leerEstudianteLocal(correo: string): EstudianteActualizar | null {
  const datos = leerCache<EstudianteActualizar>(clave(correo))
  if (!datos) return null
  if (datos.nivel !== 'primera-infancia' && datos.nivel !== 'educacion-basica') return null
  const elegido = datos.elegido as CoincidenciaFila | undefined
  if (
    !elegido ||
    typeof elegido.fila !== 'number' ||
    (elegido.hoja !== 'primera infancia' && elegido.hoja !== 'basica') ||
    !datos.fila ||
    typeof datos.fila !== 'object'
  ) {
    return null
  }
  return datos
}

export function guardarEstudianteLocal(correo: string, datos: EstudianteActualizar): void {
  guardarCache(clave(correo), datos)
}

/* Se borra al CAMBIAR ESTUDIANTE y al elegir OTRA SECCIÓN o SUBSECCIÓN del
   menú (la vista se desmonta: lo llama el onUnmounted de la vista). */
export function borrarEstudianteLocal(correo: string): void {
  borrarCache(clave(correo))
}
