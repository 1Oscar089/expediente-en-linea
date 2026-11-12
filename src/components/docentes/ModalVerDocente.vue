<script setup lang="ts">
import { computed } from 'vue'

import type { DocenteCompleto } from '@/lib/docentes'
import { fechaCorta } from '@/lib/fechas'
import { NOMBRES_ROL, type Rol } from '@/lib/usuarios'

import ModalBase from '@/components/ui/ModalBase.vue'

/* Vista de lectura: muestra TODOS los datos (los del Sheet).
   Si un dato no existe, se coloca blanco. */
const props = defineProps<{
  docente: DocenteCompleto
}>()

const emit = defineEmits<{
  (e: 'cerrar'): void
}>()

const filas = computed(() => {
  const d = props.docente
  const rolValido = Object.keys(NOMBRES_ROL).includes(d.rol)
  return [
    { etiqueta: 'Nombre', valor: d.nombre },
    { etiqueta: 'DUI', valor: d.dui },
    { etiqueta: 'NIP', valor: d.nip },
    { etiqueta: 'Telefono', valor: d.telefono },
    { etiqueta: 'Correo', valor: d.correo },
    { etiqueta: 'Fecha de nacimiento', valor: fechaCorta(d.fechaNacimiento) },
    { etiqueta: 'Año de servicio', valor: d.anioServicio },
    { etiqueta: 'Especialidad', valor: d.especialidad },
    { etiqueta: 'Rol', valor: rolValido ? NOMBRES_ROL[d.rol as Rol] : d.rol },
    { etiqueta: 'Estado', valor: d.estado },
  ]
})
</script>

<template>
  <ModalBase titulo="Datos del docente" ancho="max-w-lg" @cerrar="emit('cerrar')">
    <dl class="grid gap-x-4 gap-y-2.5 sm:grid-cols-2">
      <div
        v-for="f in filas"
        :key="f.etiqueta"
        class="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2"
      >
        <dt class="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
          {{ f.etiqueta }}
        </dt>
        <dd class="mt-0.5 text-sm break-words text-slate-800">{{ f.valor }}</dd>
      </div>
    </dl>

    <div class="mt-5 flex justify-end">
      <button
        type="button"
        class="rounded-lg bg-primario px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primario-oscuro"
        @click="emit('cerrar')"
      >
        Cerrar
      </button>
    </div>
  </ModalBase>
</template>