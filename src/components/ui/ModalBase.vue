<script setup lang="ts">
defineProps<{
  titulo: string
  ancho?: string
}>()

const emit = defineEmits<{
  (e: 'cerrar'): void
}>()
</script>

<template>
  <!-- Modal base: fondo oscuro + tarjeta. Clic en el fondo o en la X cierra. -->
  <div class="fixed inset-0 z-[90] flex items-center justify-center p-3 md:p-6">
    <div class="absolute inset-0 bg-slate-900/50" @click="emit('cerrar')"></div>

    <div
      class="relative w-full overflow-hidden rounded-xl bg-white shadow-2xl"
      :class="ancho ?? 'max-w-lg'"
      role="dialog"
      aria-modal="true"
    >
      <header class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 class="text-base font-bold text-slate-900">{{ titulo }}</h2>
        <button
          type="button"
          class="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
          aria-label="Cerrar"
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
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </header>

      <div class="max-h-[70vh] overflow-y-auto p-4"><slot /></div>
    </div>
  </div>
</template>