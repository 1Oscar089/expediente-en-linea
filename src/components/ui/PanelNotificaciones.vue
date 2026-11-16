<script setup lang="ts">
import { useUiStore, type TipoNota } from '@/stores/ui'

const ui = useUiStore()

/* Verde = bien, amarillo = precaución, rojo = error */
const CLASES: Record<TipoNota, string> = {
  exito: 'bg-emerald-600 text-white',
  precaucion: 'bg-amber-400 text-slate-900',
  error: 'bg-red-600 text-white',
}

const ICONOS: Record<TipoNota, string> = {
  exito:
    '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
  precaucion:
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  error:
    '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
}
</script>

<template>
  <!-- Esquina superior derecha; clic en la notificación la cierra antes de los 5 s -->
  <div
    class="pointer-events-none fixed right-3 top-3 z-[110] flex w-[calc(100vw-1.5rem)] max-w-80 flex-col gap-2"
    aria-live="polite"
  >
    <TransitionGroup name="nota">
      <div
        v-for="n in ui.notificaciones"
        :key="n.id"
        role="status"
        data-prueba="notificacion"
        :data-tipo="n.tipo"
        class="pointer-events-auto flex cursor-pointer items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm font-medium shadow-lg"
        :class="CLASES[n.tipo]"
        @click="ui.descartar(n.id)"
      >
        <!-- eslint-disable-next-line vue/no-v-html — icono SVG de trazo propio -->
        <svg
          class="mt-0.5 h-5 w-5 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          v-html="ICONOS[n.tipo]"
        ></svg>
        <span class="min-w-0 break-words">{{ n.texto }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.nota-enter-active,
.nota-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.nota-enter-from,
.nota-leave-to {
  opacity: 0;
  transform: translateX(1rem);
}
.nota-move {
  transition: transform 0.25s ease;
}
</style>