<script setup lang="ts">
import ModalBase from '@/components/ui/ModalBase.vue'

/* Confirmación en modal (NUNCA window.confirm):
   tono rojo = acción destructiva (borrar), amarillo = precaución (archivar). */
defineProps<{
  titulo: string
  texto: string
  confirmarTexto: string
  tono: 'rojo' | 'amarillo'
}>()

const emit = defineEmits<{
  (e: 'confirmar'): void
  (e: 'cerrar'): void
}>()
</script>

<template>
  <ModalBase :titulo="titulo" ancho="max-w-md" @cerrar="emit('cerrar')">
    <div class="flex items-start gap-3">
      <svg
        class="mt-0.5 h-6 w-6 shrink-0"
        :class="tono === 'rojo' ? 'text-eliminar' : 'text-archivar'"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path
          d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"
        />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </svg>
      <p class="text-sm text-slate-600">{{ texto }}</p>
    </div>

    <div class="mt-5 flex justify-end gap-2">
      <button
        type="button"
        class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
        @click="emit('cerrar')"
      >
        Cancelar
      </button>
      <button
        type="button"
        class="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors"
        :class="
          tono === 'rojo'
            ? 'bg-eliminar hover:bg-red-700'
            : 'bg-archivar text-slate-900 hover:bg-amber-500'
        "
        @click="emit('confirmar')"
      >
        {{ confirmarTexto }}
      </button>
    </div>
  </ModalBase>
</template>