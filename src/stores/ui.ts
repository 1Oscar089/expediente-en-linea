import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

/* ── Notificaciones push (esquina superior derecha, 5 segundos) ──
   verde = éxito, amarillo = precaución, rojo = error */
export type TipoNota = 'exito' | 'precaucion' | 'error'

export interface Notificacion {
  id: number
  tipo: TipoNota
  texto: string
}

const DURACION_NOTA = 5000

export const useUiStore = defineStore('ui', () => {
  /* ── Notificaciones ── */
  const notificaciones = ref<Notificacion[]>([])
  let siguienteId = 1

  function descartar(id: number) {
    notificaciones.value = notificaciones.value.filter((n) => n.id !== id)
  }

  function notificar(tipo: TipoNota, texto: string) {
    const id = siguienteId++
    notificaciones.value.push({ id, tipo, texto })
    setTimeout(() => descartar(id), DURACION_NOTA)
  }

  /* ── Carga global: mientras está activa, la capa cubre TODO y no se puede clickear nada ──
     Contador: si dos acciones corren a la vez, la capa sigue hasta que ambas terminen. */
  const pendientes = ref(0)
  const mensajeCarga = ref('Cargando…')
  const cargando = computed(() => pendientes.value > 0)

  function iniciarCarga(mensaje = 'Cargando…') {
    pendientes.value += 1
    mensajeCarga.value = mensaje
  }

  function terminarCarga() {
    pendientes.value = Math.max(0, pendientes.value - 1)
  }

  return {
    notificaciones,
    notificar,
    descartar,
    cargando,
    mensajeCarga,
    iniciarCarga,
    terminarCarga,
  }
})