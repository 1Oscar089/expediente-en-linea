<script setup lang="ts">
// ─────────────────────────────────────────────────────────────
// USERBAR. A la derecha SOLO: nombre[0] (primer nombre) + icono
// de usuario. Al hacer clic se abre el panel:
//   rol 1/2/3/5 → nombre completo, rol, cerrar sesión
//   rol 4 (estudiante) → además, grado
// ─────────────────────────────────────────────────────────────
import { computed, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const menuAbierto = ref(false)

// nombre[0]: primer nombre (Juan Perez Hernandez → Juan)
const primerNombre = computed(() => (auth.perfil?.nombre ?? '').trim().split(' ')[0])

const rolBonito = computed(() => {
  const rol = auth.perfil?.rol ?? ''
  return rol.charAt(0).toUpperCase() + rol.slice(1)
})
</script>

<template>
  <header
    class="relative z-50 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-3 md:px-4"
  >
    <!-- Izquierda: hamburguesa + título -->
    <div class="flex items-center gap-2">
      <button
        type="button"
        aria-label="Abrir o cerrar el menú lateral"
        class="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
        @click="$emit('alternarSidebar')"
      >
        <svg
          class="h-6 w-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M4 6h16" />
          <path d="M4 12h16" />
          <path d="M4 18h16" />
        </svg>
      </button>

      <h1 class="text-lg font-bold tracking-tight">
        <span class="hidden sm:inline">Expediente en Línea</span>
        <span class="sm:hidden">EEL</span>
      </h1>
    </div>

    <!-- Derecha: SOLO nombre[0] + icono de usuario -->
    <div class="relative">
      <button
        type="button"
        class="flex items-center gap-2 rounded-full p-1 pr-2 hover:bg-slate-100 md:pr-3"
        @click="menuAbierto = !menuAbierto"
      >
        <span class="hidden text-sm font-medium md:block">{{ primerNombre }}</span>
        <!-- Icono de usuario (SVG sin relleno); cuando haya foto irá aquí -->
        <span
          class="flex h-9 w-9 items-center justify-center rounded-full bg-primario/10 text-primario"
        >
          <svg
            class="h-6 w-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </span>
      </button>

      <!-- Panel desplegable -->
      <div
        v-if="menuAbierto"
        class="absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
      >
        <div class="border-b border-slate-100 px-4 py-3">
          <p class="font-semibold">{{ auth.perfil?.nombre }}</p>
          <p class="text-sm text-slate-500">{{ rolBonito }}</p>
          <!-- Grado SOLO para el rol 4 (estudiante) -->
          <p v-if="auth.perfil?.rolNumero === 4" class="text-sm text-slate-500">
            Grado: {{ auth.perfil.grado }}
          </p>
        </div>
        <button
          type="button"
          class="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-eliminar hover:bg-red-50"
          @click=" menuAbierto = false; auth.salir()
          "
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
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <path d="m16 17 5-5-5-5" />
            <path d="M21 12H9" />
          </svg>
          Cerrar sesión
        </button>
      </div>
    </div>

    <!-- Clic fuera cierra el panel -->
    <div v-if="menuAbierto" class="fixed inset-0 z-40" @click="menuAbierto = false" />
  </header>
</template>

<script lang="ts">
export default { emits: ['alternarSidebar'] }
</script>
