<script setup lang="ts">
import { computed } from 'vue'

import type { FilaEstudiante } from '@/lib/estudiantes'
import { fechaCorta } from '@/lib/fechas'

import ModalBase from '@/components/ui/ModalBase.vue'

/* Vista de lectura del estudiante (la acción "Ver" de la Nómina, disponible
   para docentes, director y admin). Muestra los datos que guarda Firebase;
   si un dato no existe, se coloca blanco. */
const props = defineProps<{
  estudiante: FilaEstudiante
}>()

const emit = defineEmits<{
  (e: 'cerrar'): void
}>()

const filas = computed(() => {
  const e = props.estudiante
  return [
    { etiqueta: 'Nombre', valor: e.nombre },
    { etiqueta: 'NIE', valor: e.nie },
    { etiqueta: 'Correo', valor: e.correo },
    { etiqueta: 'Fecha de nacimiento', valor: fechaCorta(e.fechaNacimiento) },
    { etiqueta: 'Grado', valor: e.grado },
    { etiqueta: 'Responsable', valor: e.responsable },
    { etiqueta: 'DUI (responsable)', valor: e.dui },
    { etiqueta: 'Telefono (responsable)', valor: e.telefono },
    { etiqueta: 'Estado', valor: e.estado },
  ]
})
</script>

<template>
  <ModalBase titulo="Datos del estudiante" ancho="max-w-lg" @cerrar="emit('cerrar')">
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
