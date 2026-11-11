<script setup lang="ts">
// ─────────────────────────────────────────────────────────────
// SEGUNDA SIDEBAR con las subsecciones de la sección activa.
// Los enlaces navegan de verdad (RouterLink) y marca la activa
// comparando la ruta actual con la de cada subsección.
// ─────────────────────────────────────────────────────────────
import { useRoute } from 'vue-router'
import type { Seccion } from '@/config/menu'

defineProps<{ seccion: Seccion }>()
defineEmits<{ cerrar: [] }>()

const route = useRoute()
</script>

<template>
  <div
    class="absolute inset-0 flex flex-col bg-white lg:inset-y-0 lg:right-auto lg:left-full lg:w-56 lg:border-l lg:border-slate-200 lg:shadow-xl"
  >
    <!-- Volver (solo móvil) -->
    <button
      type="button"
      class="flex items-center gap-2 border-b border-slate-200 px-3 py-3 text-sm text-slate-600 hover:bg-slate-50 lg:hidden"
      @click="$emit('cerrar')"
    >
      <svg
        class="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="m12 19-7-7 7-7" />
        <path d="M19 12H5" />
      </svg>
      Volver
    </button>

    <p class="px-4 pb-2 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
      {{ seccion.nombre }}
    </p>

    <ul class="flex-1 space-y-1 overflow-y-auto p-2">
      <li v-for="sub in seccion.subsecciones" :key="sub.id">
        <RouterLink
          :to="sub.ruta"
          class="block rounded-lg px-3 py-2 text-sm"
          :class="
            route.path === sub.ruta
              ? 'bg-primario/10 font-medium text-primario'
              : 'text-slate-700 hover:bg-slate-100'
          "
        >
          {{ sub.nombre }}
        </RouterLink>
      </li>
    </ul>
  </div>
</template>
