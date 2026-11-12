<script setup lang="ts">
import { computed, ref } from 'vue'

import ModalBase from '@/components/ui/ModalBase.vue'

/* ── Matricular: elección de modalidad ──
   Al entrar a la sección se abre un modal para elegir si la matrícula es de
   PRIMERA INFANCIA o de EDUCACIÓN BÁSICA; con la modalidad elegida, la
   sección muestra el panel que le corresponde (por ahora el panel es un
   adelanto; cada flujo real se construye en la siguiente etapa).

   REGLA DE GRADOS (definida por el usuario):
   - Primera infancia: DESDE inicial HASTA primer grado.
   - Educación básica: de SEGUNDO a NOVENO grado.

   TODO vive en ESTE archivo (vista + modal), sin archivos extra. */

type Modalidad = 'primera-infancia' | 'educacion-basica'

/* Iconos SVG: SOLO TRAZO, sin relleno; heredan el color del texto (igual que menu.ts) */
function svg(trazo: string): string {
  return `<svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${trazo}</svg>`
}

const OPCIONES: { id: Modalidad; nombre: string; descripcion: string; icono: string }[] = [
  {
    id: 'primera-infancia',
    nombre: 'Primera Infancia',
    descripcion: 'Desde inicial y parvularia hasta primer grado.',
    icono: svg(
      '<circle cx="12" cy="12" r="9"/><path d="M9 10h.01"/><path d="M15 10h.01"/><path d="M9 15c.8.9 1.9 1.4 3 1.4s2.2-.5 3-1.4"/>',
    ),
  },
  {
    id: 'educacion-basica',
    nombre: 'Educación Básica',
    descripcion: 'De segundo a noveno grado.',
    icono: svg(
      '<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
    ),
  },
]

const modalidad = ref<Modalidad | null>(null)
/* Al entrar a la sección, el modal se abre de una vez */
const modalAbierto = ref(true)

const opcionElegida = computed(() => OPCIONES.find((o) => o.id === modalidad.value) ?? null)

function elegir(id: Modalidad) {
  modalidad.value = id
  modalAbierto.value = false
}

/* Cerrar sin elegir (X o clic en el fondo) vuelve al estado inicial */
function cerrarModal() {
  modalAbierto.value = false
}
</script>

<template>
  <section class="space-y-4">
    <!-- Sin modalidad elegida todavía -->
    <div
      v-if="!opcionElegida"
      class="grid place-items-center gap-4 rounded-xl border border-dashed border-slate-300 p-10 text-center"
    >
      <p class="max-w-sm text-sm text-slate-500">
        Antes de matricular, elige la modalidad: cada una tiene su propio proceso.
      </p>
      <button
        type="button"
        class="rounded-lg bg-primario px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primario-oscuro"
        @click="modalAbierto = true"
      >
        Seleccionar modalidad
      </button>
    </div>

    <!-- Con modalidad elegida -->
    <template v-else>
      <div
        class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-primario-suave/60 px-4 py-3"
      >
        <div class="flex items-center gap-3">
          <span
            class="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-white text-primario"
            v-html="opcionElegida.icono"
          ></span>
          <div>
            <p class="text-sm font-bold text-slate-900">{{ opcionElegida.nombre }}</p>
            <p class="text-xs text-slate-500">{{ opcionElegida.descripcion }}</p>
          </div>
        </div>
        <button
          type="button"
          class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
          @click="modalAbierto = true"
        >
          Cambiar
        </button>
      </div>

      <div class="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
        Aquí se pintará el módulo de matrícula de
        <strong class="text-slate-700">{{ opcionElegida.nombre }}</strong
        >. Cuando el flujo exista, este panel se reemplazará por el formulario real.
      </div>
    </template>
  </section>

  <!-- Modal de selección de modalidad -->
  <ModalBase
    v-if="modalAbierto"
    titulo="Matricular — elige la modalidad"
    ancho="max-w-xl"
    @cerrar="cerrarModal"
  >
    <p class="mb-3 text-sm text-slate-500">
      ¿De qué modalidad será la matrícula?
    </p>
    <div class="grid gap-3 sm:grid-cols-2">
      <button
        v-for="opcion in OPCIONES"
        :key="opcion.id"
        type="button"
        class="rounded-xl border p-4 text-left transition-colors"
        :class="
          modalidad === opcion.id
            ? 'border-primario bg-primario-suave'
            : 'border-slate-300 hover:border-primario hover:bg-primario-suave/50'
        "
        @click="elegir(opcion.id)"
      >
        <span
          class="mb-3 grid h-11 w-11 place-items-center rounded-lg bg-white text-primario"
          v-html="opcion.icono"
        ></span>
        <span class="block text-sm font-bold text-slate-900">{{ opcion.nombre }}</span>
        <span class="mt-0.5 block text-xs text-slate-500">{{ opcion.descripcion }}</span>
        <span v-if="modalidad === opcion.id" class="mt-2 block text-xs font-semibold text-primario">
          Modalidad en uso — pulsa para continuar con ella
        </span>
      </button>
    </div>
  </ModalBase>
</template>