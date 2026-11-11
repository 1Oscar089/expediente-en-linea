<script setup lang="ts">
// VISTA GENÉRICA para las acciones de Estudiantes (Matricular, Retirar,
// Actualizar, Nómina, Archivar, Promoción). El título viene en el
// meta de la ruta; cuando cada módulo exista, tendrá su propia vista.
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const titulo = computed(() => (route.meta.titulo as string) ?? 'Sección')
</script>

<template>
  <section class="space-y-6">
    <header>
      <h2 class="text-2xl font-bold">{{ titulo }}</h2>
      <p class="text-slate-500">Estudiantes — vista preliminar.</p>
    </header>

    <div
      class="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500"
    >
      Aquí se pintará <strong>{{ titulo }}</strong
      >. Cuando exista el router-guard y los Sheets, esta vista se reemplazará por el módulo real.
    </div>
  </section>
</template>
