<script setup lang="ts">
defineProps<{
  titulo: string
  subtitulo?: string | null
}>()
</script>

<template>
  <!-- Content: título + espacio de contenido. Margen mínimo, casi llena su espacio. -->
  <main class="flex min-w-0 flex-1 flex-col gap-2 overflow-hidden p-2 md:p-3">
    <header class="flex items-baseline gap-2 px-1">
      <h1 class="text-lg font-bold text-slate-900">{{ titulo }}</h1>
      <span v-if="subtitulo" class="text-sm font-semibold text-primario">{{ subtitulo }}</span>
    </header>

    <section
      class="min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 md:p-4"
    >
      <slot />
    </section>
  </main>
</template>