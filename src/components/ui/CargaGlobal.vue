<script setup lang="ts">
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
</script>

<template>
  <!-- Capa de carga: cubre TODO (userbar, sidebar, modales). Nada se puede clickear. -->
  <div
    v-if="ui.cargando"
    data-prueba="carga"
    class="fixed inset-0 z-[100] flex cursor-wait items-center justify-center bg-slate-900/40"
  >
    <div class="flex items-center gap-3 rounded-xl bg-white px-5 py-4 shadow-2xl">
      <svg
        class="h-6 w-6 animate-spin text-primario"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M21 12a9 9 0 1 1-9-9" />
      </svg>
      <p class="text-sm font-semibold text-slate-700">{{ ui.mensajeCarga }}</p>
    </div>
  </div>
</template>