/* ── Borrador de edición (caché local por si falla la computadora) ──
   REGLA DEL PROYECTO para TODA vista donde se editen datos:

   1. CACHÉ: mientras el usuario escribe, todo queda guardado en
      localStorage. Si la computadora se apaga o falla algo, al volver a
      entrar a la vista los datos escritos siguen ahí.

   2. RECONFIRMACIÓN DE RECARGA: si al entrar a la vista hay un borrador
      guardado, se abre un modal: ACEPTAR borra todo lo editado del local
      (la vista queda limpia) y CANCELAR recupera los datos para seguir
      donde quedó.

   3. BOTÓN CANCELAR: toda vista de edición lo tiene; abre el mismo tipo
      de confirmación: ACEPTAR borra lo editado (local incluido) y deja
      la vista limpia; CANCELAR no hace nada (sigue editando).

   El borrador vive POR USUARIO (clave con el correo): en computadoras
   compartidas cada quien recupera SOLO lo suyo. Nada de esto toca el
   servidor: es solo una copia local de seguridad mientras se edita. */

import { computed, ref, watch, type WatchSource } from 'vue'

import { useAuthStore } from '@/stores/auth'
import { borrarCache, guardarCache, leerCache } from '@/lib/cache'

export interface OpcionesBorrador<T> {
  /* Estado actual que se quiere proteger. null = "ahora no hay nada
     escrito que valga la pena guardar" (se limpia la copia local). */
  capturar: () => T | null
  /* Vuelve a poner en pantalla un borrador guardado. */
  restaurar: (datos: T) => void
  /* Qué significa "quedar limpio" cuando se acepta borrar lo editado.
     Recibe el motivo para que la vista decida (p. ej. cancelar puede
     cerrar el formulario). */
  limpiar: (motivo: 'recarga' | 'cancelar') => void
}

export function usarBorrador<T>(vista: string, opciones: OpcionesBorrador<T>) {
  const auth = useAuthStore()

  /* Clave por vista y por usuario: borrador.<vista>:<correo> */
  const clave = () => `borrador.${vista}:${auth.perfil?.correo ?? ''}`

  const modalAbierto = ref(false)
  const motivo = ref<'recarga' | 'cancelar'>('recarga')
  const pendiente = ref<T | null>(null)

  const textos = computed(() => {
    if (motivo.value === 'recarga') {
      return {
        titulo: 'Datos sin guardar',
        texto:
          'Quedó información editada guardada en este equipo (por ejemplo, si la computadora se apagó o hubo un fallo). ' +
          'Con Aceptar se borra todo lo editado y se empieza limpio; con Cancelar se recuperan los datos para seguir donde quedó.',
        boton: 'Aceptar',
        tono: 'amarillo' as const,
      }
    }
    return {
      titulo: 'Cancelar edición',
      texto:
        '¿Seguro que quieres cancelar? Se borrarán todos los datos que has escrito, incluida la copia guardada en este equipo.',
      boton: 'Aceptar',
      tono: 'rojo' as const,
    }
  })

  /* Guarda (o limpia) la copia local según lo que diga capturar() */
  function guardar(): void {
    const datos = opciones.capturar()
    if (datos === null) borrarCache(clave())
    else guardarCache(clave(), datos)
  }

  /* Borra la copia local sin tocar la pantalla (p. ej. al guardar bien) */
  function olvidar(): void {
    borrarCache(clave())
  }

  /* Vigila los datos de la vista: cada cambio queda en el local al instante.
     El watch se crea dentro del setup de la vista, así Vue lo limpia solo. */
  function vigilar(fuente: WatchSource): void {
    watch(fuente, guardar, { deep: true })
  }

  /* Al entrar a la vista: si hay borrador, se pide la reconfirmación */
  function revisarAlEntrar(): void {
    const datos = leerCache<T>(clave())
    if (!datos) return
    pendiente.value = datos
    motivo.value = 'recarga'
    modalAbierto.value = true
  }

  /* Botón Aceptar del modal: borra lo editado del local y queda limpio */
  function aceptar(): void {
    const m = motivo.value
    borrarCache(clave())
    pendiente.value = null
    modalAbierto.value = false
    opciones.limpiar(m)
  }

  /* Botón Cancelar del modal: en la recarga recupera el borrador;
     al cancelar la edición no hace nada (solo cierra el modal). */
  function seguir(): void {
    if (motivo.value === 'recarga' && pendiente.value !== null) {
      opciones.restaurar(pendiente.value)
    }
    pendiente.value = null
    modalAbierto.value = false
  }

  /* Botón Cancelar de la vista: abre la confirmación de borrado */
  function pedirCancelar(): void {
    motivo.value = 'cancelar'
    modalAbierto.value = true
  }

  return {
    modalAbierto,
    textos,
    vigilar,
    revisarAlEntrar,
    guardar,
    olvidar,
    aceptar,
    seguir,
    pedirCancelar,
  }
}
