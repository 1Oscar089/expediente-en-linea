<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { useAuthStore } from '@/stores/auth'
import { menuParaRol, type Seccion } from '@/config/menu'

import SubSideBar from '@/components/layout/SubSideBar.vue'

const props = defineProps<{
  abierta: boolean
  seccionActiva: string
  subseccionActiva: string | null
}>()

const emit = defineEmits<{
  (e: 'cerrar'): void
  (e: 'seleccionar', id: string): void
  (e: 'seleccionarSubseccion', seccionId: string, subseccionId: string): void
}>()

const auth = useAuthStore()

/* Menú filtrado por el rol efectivo (vista provisional incluida) */
const menu = computed(() => menuParaRol(auth.rolEfectivo))

/* Sección cuyo subpanel está abierto (solo una a la vez) */
const panelId = ref<string | null>(null)
const seccionPanel = computed<Seccion | null>(
  () => menu.value.find((seccion) => seccion.id === panelId.value) ?? null,
)

/* Si cambia la vista provisional, cierra el subpanel */
watch(
  () => auth.rolEfectivo,
  () => {
    panelId.value = null
  },
)

/* Punto de ruptura (mismo criterio que App): escritorio = 1024px */
const mqEscritorio = window.matchMedia('(min-width: 1024px)')

/* Si la ventana cruza a teléfono, cierra el subpanel (evita que quede flotando) */
mqEscritorio.addEventListener('change', (evento) => {
  if (!evento.matches) panelId.value = null
})

/* Si el cajón se cierra en teléfono (hamburguesa), cierra también el subpanel.
   En escritorio la sidebar puede colapsar a mini sin cerrar el subpanel. */
watch(
  () => props.abierta,
  (nueva, anterior) => {
    if (nueva === false && anterior === true && !mqEscritorio.matches) {
      panelId.value = null
    }
  },
)

function clicSeccion(seccion: Seccion) {
  if (seccion.subsecciones?.length) {
    /* Solo abre/cierra su subpanel: el content NO cambia hasta elegir una subsección */
    panelId.value = panelId.value === seccion.id ? null : seccion.id
  } else {
    panelId.value = null
    emit('seleccionar', seccion.id)
    emit('cerrar')
  }
}

function clicSubseccion(subseccionId: string) {
  if (!panelId.value) return
  emit('seleccionarSubseccion', panelId.value, subseccionId)
  panelId.value = null /* clic en la subsección: cerrar y dejar la sección marcada */
  emit('cerrar')
}
</script>

<template>
  <!-- Fondo del cajón (solo teléfono) -->
  <div
    v-if="abierta"
    class="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
    @click="emit('cerrar')"
  ></div>

  <!-- Cajón en teléfono / sidebar en escritorio.
       FIXED de arriba (bajo la userbar) hasta abajo: cubre TODO el alto de la pantalla.
       Extendida = w-64 (con nombres); colapsada = lg:w-20 (solo iconos).
       La hamburguesa alterna entre ambos estados con `abierta`. -->
  <aside
    class="fixed top-16 bottom-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-all duration-200 lg:translate-x-0 lg:shadow-none"
    :class="abierta ? 'translate-x-0 shadow-xl' : '-translate-x-full lg:w-20'"
  >
    <nav class="flex-1 overflow-y-auto p-2">
      <button
        v-for="seccion in menu"
        :key="seccion.id"
        type="button"
        :title="seccion.nombre"
        class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
        :class="[
          seccionActiva === seccion.id
            ? 'bg-primario-suave font-semibold text-primario'
            : 'text-slate-600 hover:bg-slate-100 hover:text-primario',
          abierta ? '' : 'lg:justify-center lg:gap-0 lg:px-2',
        ]"
        @click="clicSeccion(seccion)"
      >
        <!-- eslint-disable-next-line vue/no-v-html — el icono es SVG propio del config -->
        <span class="shrink-0" v-html="seccion.icono"></span>
        <span class="truncate" :class="abierta ? '' : 'lg:hidden'">{{ seccion.nombre }}</span>
        <svg
          v-if="seccion.subsecciones?.length"
          class="ml-auto h-4 w-4 shrink-0 transition-transform"
          :class="[panelId === seccion.id ? 'rotate-90' : '', abierta ? '' : 'lg:hidden']"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>
    </nav>

    <p
      class="border-t border-slate-200 px-3 py-2 text-center text-[10px] text-slate-400"
      :class="abierta ? '' : 'lg:hidden'"
    >
      v0.1 — tentativo
    </p>
  </aside>

  <!-- Clic fuera del subpanel: cierra (deja la sección marcada) -->
  <div v-if="seccionPanel" class="fixed inset-0 z-40 bg-slate-900/20" @click="panelId = null"></div>

  <!-- SubSideBar: a la par de la sidebar en escritorio; en teléfono, sobre el cajón -->
  <SubSideBar
    v-if="seccionPanel"
    :seccion="seccionPanel"
    :subseccion-activa="props.subseccionActiva"
    :sidebar-abierta="props.abierta"
    @seleccionar="clicSubseccion"
    @cerrar="panelId = null"
  />
</template>