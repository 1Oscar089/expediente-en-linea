<script setup lang="ts">
import { computed } from 'vue'

import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const primerNombre = computed(() => (auth.perfil?.nombre ?? '').trim().split(/\s+/)[0] ?? '')

/* Cifras de muestra (tentativas) */
const tarjetas = [
  { etiqueta: 'Docentes', valor: 32 },
  { etiqueta: 'Estudiantes', valor: 450 },
  { etiqueta: 'Grados', valor: 12 },
]
</script>

<template>
  <div class="flex h-full flex-col gap-4">
    <p class="text-lg font-semibold text-slate-800">Hola, {{ primerNombre }}</p>

    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="tarjeta in tarjetas"
        :key="tarjeta.etiqueta"
        class="rounded-xl border border-slate-200 bg-primario-suave p-4"
      >
        <p class="text-3xl font-bold text-primario">{{ tarjeta.valor }}</p>
        <p class="mt-1 text-sm font-medium text-slate-600">{{ tarjeta.etiqueta }}</p>
      </div>
    </div>
  </div>
</template>