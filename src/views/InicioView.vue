<script setup lang="ts">
// VISTA "INICIO" — visible para los 5 roles.
// Las tarjetas siguen siendo datos de muestra; más adelante reflejarán
// información real de los Sheets según el rol.
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const saludo = computed(() => {
  const nombre = auth.perfil?.nombre ?? ''
  return nombre ? `Bienvenido, ${nombre}` : 'Bienvenido'
})

// Números de mentira, solo para dibujar
const tarjetas = [
  { titulo: 'Docentes', valor: '32' },
  { titulo: 'Alumnos', valor: '450' },
  { titulo: 'Grados', valor: '12' },
]
</script>

<template>
  <section class="space-y-6">
    <header>
      <h2 class="text-2xl font-bold">Inicio</h2>
      <p class="text-slate-500">{{ saludo }} — rol: {{ auth.perfil?.rol }}</p>
    </header>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="tarjeta in tarjetas"
        :key="tarjeta.titulo"
        class="rounded-xl border border-slate-200 bg-white p-5"
      >
        <p class="text-sm text-slate-500">{{ tarjeta.titulo }}</p>
        <p class="mt-1 text-3xl font-bold">{{ tarjeta.valor }}</p>
        <p class="mt-2 text-xs text-slate-400">Dato de muestra — sin funcionalidad</p>
      </div>
    </div>

    <div
      class="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500"
    >
      Área de contenido — el menú de la izquierda cambia lo que se pinta aquí.
    </div>
  </section>
</template>
