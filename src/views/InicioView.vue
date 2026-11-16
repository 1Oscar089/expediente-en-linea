<script setup lang="ts">
// ─────────────────────────────────────────────────────────────
// INICIO. Saludo + tarjetas con cifras REALES leídas de Firebase al
// entrar: la matrícula vigente (total, por nivel y grados con
// estudiantes) y los docentes en estado activo.
// Mientras cargan, la tarjeta muestra "…" (pulso); si la lectura falla
// (p. ej. las reglas de Firestore del rol), muestra "—" y abajo aparece
// el motivo. Nunca se muestra una cifra inventada.
// ─────────────────────────────────────────────────────────────
import { computed, onMounted, ref } from 'vue'

import { useAuthStore } from '@/stores/auth'
import { contarEstudiantes, type CifrasEstudiantes } from '@/lib/estudiantes'
import { ESTADO_ACTIVO, listarDocentes } from '@/lib/docentes'

const auth = useAuthStore()

const primerNombre = computed(() => (auth.perfil?.nombre ?? '').trim().split(/\s+/)[0] ?? '')

const nombreRol = computed(() => {
  switch (auth.perfil?.rol) {
    case 'admin':
      return 'Administrador'
    case 'director':
      return 'Director'
    case 'docente':
      return 'Docente'
    case 'estudiante':
      return 'Estudiante'
    case 'responsable':
      return 'Responsable'
    default:
      return ''
  }
})

/* Cifras reales: null = todavía cargando (o falló la lectura) */
const cifras = ref<CifrasEstudiantes | null>(null)
const errorEstudiantes = ref('')
const docentesActivos = ref<number | null>(null)
const errorDocentes = ref('')

onMounted(() => {
  void cargarEstudiantes()
  void cargarDocentes()
})

async function cargarEstudiantes(): Promise<void> {
  try {
    cifras.value = await contarEstudiantes()
  } catch (e) {
    cifras.value = null
    errorEstudiantes.value = (e as Error).message
  }
}

async function cargarDocentes(): Promise<void> {
  try {
    const lista = await listarDocentes()
    docentesActivos.value = lista.filter((d) => d.estado === ESTADO_ACTIVO).length
  } catch (e) {
    docentesActivos.value = null
    errorDocentes.value = (e as Error).message
  }
}

interface TarjetaInicio {
  etiqueta: string
  valor: number | null
  error: string
}

/* Las 5 tarjetas: cada una sabe de dónde sale su número y qué error
   mostrar si su fuente falló. */
const tarjetas = computed<TarjetaInicio[]>(() => [
  { etiqueta: 'Estudiantes matriculados', valor: cifras.value?.total ?? null, error: errorEstudiantes.value },
  { etiqueta: 'Primera Infancia', valor: cifras.value?.primeraInfancia ?? null, error: errorEstudiantes.value },
  { etiqueta: 'Educación Básica', valor: cifras.value?.basica ?? null, error: errorEstudiantes.value },
  { etiqueta: 'Docentes activos', valor: docentesActivos.value, error: errorDocentes.value },
  { etiqueta: 'Grados con matrícula', valor: cifras.value?.gradosConMatricula ?? null, error: errorEstudiantes.value },
])
</script>

<template>
  <div class="flex h-full flex-col gap-4">
    <header class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-lg font-semibold text-slate-800">Hola, {{ primerNombre }}</p>
      <span
        v-if="nombreRol"
        class="rounded-full border border-primario bg-primario-suave px-3 py-1 text-xs font-semibold text-primario"
      >
        {{ nombreRol }}
      </span>
    </header>

    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="tarjeta in tarjetas"
        :key="tarjeta.etiqueta"
        class="rounded-xl border border-slate-200 bg-primario-suave p-4"
      >
        <p
          class="text-3xl font-bold text-primario"
          :class="tarjeta.valor === null && !tarjeta.error ? 'animate-pulse' : ''"
        >
          {{ tarjeta.valor === null ? (tarjeta.error ? '—' : '…') : tarjeta.valor }}
        </p>
        <p class="mt-1 text-sm font-medium text-slate-600">{{ tarjeta.etiqueta }}</p>
      </div>
    </div>

    <p v-if="errorEstudiantes" class="text-xs text-amber-700">
      No se pudieron leer las cifras de estudiantes: {{ errorEstudiantes }}
    </p>
    <p v-if="errorDocentes" class="text-xs text-amber-700">
      No se pudo leer la lista de docentes: {{ errorDocentes }}
    </p>
  </div>
</template>
