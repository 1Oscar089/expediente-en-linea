<script setup lang="ts">
import type { Seccion } from '@/config/menu'

defineProps<{
  seccion: Seccion
  subseccionActiva: string | null
  sidebarAbierta: boolean
}>()

const emit = defineEmits<{
  (e: 'seleccionar', id: string): void
  (e: 'cerrar'): void
}>()
</script>

<template>
  <!-- FIXED a todo alto: en teléfono (left-0) queda SOBRE el cajón;
       en escritorio queda A LA PAR de la sidebar, pegada a su borde derecho
       (lg:left-64 si está extendida, lg:left-20 si está colapsada en mini). -->
  <aside
    class="fixed top-16 bottom-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white shadow-xl lg:w-56 lg:shadow-none"
    :class="sidebarAbierta ? 'lg:left-64' : 'lg:left-20'"
  >
    <div class="flex items-center gap-2 border-b border-slate-200 px-3 py-3">
      <button
        type="button"
        class="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-primario-suave hover:text-primario lg:hidden"
        aria-label="Volver"
        @click="emit('cerrar')"
      >
        <svg
          class="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>
      <p class="text-sm font-bold text-slate-800">{{ seccion.nombre }}</p>
    </div>

    <nav class="flex-1 overflow-y-auto p-2">
      <button
        v-for="sub in seccion.subsecciones"
        :key="sub.id"
        type="button"
        class="flex w-full items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
        :class="
          subseccionActiva === sub.id
            ? 'bg-primario-suave font-semibold text-primario'
            : 'text-slate-600 hover:bg-slate-100 hover:text-primario'
        "
        @click="emit('seleccionar', sub.id)"
      >
        {{ sub.nombre }}
      </button>
    </nav>
  </aside>
</template>