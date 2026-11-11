<script setup lang="ts">
import { computed, ref } from 'vue'

import { useAuthStore } from '@/stores/auth'
import { NOMBRES_ROL, type Rol } from '@/lib/usuarios'

const emit = defineEmits<{ (e: 'alternarSidebar'): void }>()

const auth = useAuthStore()

const primerNombre = computed(() => (auth.perfil?.nombre ?? '').trim().split(/\s+/)[0] ?? '')
const rolEtiqueta = computed(() => (auth.perfil ? NOMBRES_ROL[auth.perfil.rol] : ''))
const esEstudiante = computed(() => auth.perfil?.rol === 'estudiante')
const grado = computed(() => auth.perfil?.grado ?? '')
const vistaEtiqueta = computed(() => (auth.vistaRol ? NOMBRES_ROL[auth.vistaRol] : ''))

const menuAbierto = ref(false)

/* Vista provisional (solo admin 1): sus otras 4 vistas + volver a la propia */
const VISTAS: { rol: Rol; nombre: string }[] = [
  { rol: 'admin', nombre: 'Administrador (propia)' },
  { rol: 'director', nombre: 'Director' },
  { rol: 'docente', nombre: 'Docente' },
  { rol: 'estudiante', nombre: 'Estudiante' },
  { rol: 'responsable', nombre: 'Responsable' },
]

function elegir() {
  emit('alternarSidebar')
  menuAbierto.value = false
}
</script>

<template>
  <!-- UserBar: azul institucional, texto blanco -->
  <header
    class="relative z-50 flex h-16 shrink-0 items-center justify-between bg-primario px-3 text-white md:px-4"
  >
    <!-- Izquierda: hamburguesa + título -->
    <div class="flex items-center gap-2">
      <button
        type="button"
        class="rounded-lg p-2 transition-colors hover:bg-white/10"
        aria-label="Alternar menú"
        @click="elegir"
      >
        <svg
          class="h-6 w-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <span class="text-base font-bold tracking-wide max-sm:hidden">Expediente en Línea</span>
      <span class="text-base font-bold tracking-wide sm:hidden">EEL</span>
    </div>

    <!-- Derecha: SOLO primer nombre + icono de usuario -->
    <div class="relative">
      <button
        type="button"
        class="flex items-center gap-2 rounded-lg p-1.5 transition-colors hover:bg-white/10"
        aria-label="Abrir menú de usuario"
        @click="menuAbierto = !menuAbierto"
      >
        <span class="text-sm font-semibold max-sm:hidden">{{ primerNombre }}</span>
        <svg
          class="h-7 w-7"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </button>

      <!-- Clic fuera: cerrar -->
      <div v-if="menuAbierto" class="fixed inset-0 z-40" @click="menuAbierto = false"></div>

      <!-- Desplegable -->
      <div
        v-if="menuAbierto"
        class="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-3 text-slate-800 shadow-xl"
      >
        <p class="truncate text-sm font-bold">{{ auth.perfil?.nombre }}</p>
        <p class="mt-0.5 text-xs text-slate-500">
          {{ rolEtiqueta }}<template v-if="esEstudiante && grado"> · {{ grado }}</template>
        </p>
        <p v-if="vistaEtiqueta" class="mt-0.5 text-[11px] font-medium text-primario">
          Probando vista: {{ vistaEtiqueta }}
        </p>

        <!-- Vista provisional del admin (1 → 2, 3, 4, 5) -->
        <template v-if="auth.esAdmin">
          <p class="mt-3 text-[10px] font-bold tracking-wider text-slate-400 uppercase">Vista</p>
          <div class="mt-1 flex flex-col gap-1">
            <button
              v-for="vista in VISTAS"
              :key="vista.rol"
              type="button"
              class="rounded-md px-2 py-1.5 text-left text-xs font-medium transition-colors"
              :class="
                auth.rolEfectivo === vista.rol
                  ? 'bg-primario-suave font-semibold text-primario'
                  : 'text-slate-500 hover:bg-slate-100'
              "
              @click="auth.cambiarVista(vista.rol); menuAbierto = false"
            >
              {{ vista.nombre }}
            </button>
          </div>
        </template>

        <button
          type="button"
          class="mt-3 w-full rounded-lg bg-eliminar px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-700"
          @click="auth.salir(); menuAbierto = false"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  </header>
</template>