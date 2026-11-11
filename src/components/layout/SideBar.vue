<script setup lang="ts">
// ─────────────────────────────────────────────────────────────
// SIDEBAR IZQUIERDO.
//  - Menú filtrado por el rol del perfil; Inicio SIEMPRE primero,
//    el resto alfabético (lo calcula menuParaRol).
//  - MARCA la opción seleccionada según la URL. Si la sección tiene
//    subsecciones, también queda marcada cuando una subsección está
//    activa (la ruta empieza con la ruta de la sección).
//  - Secciones con subsecciones abren el SubSideBar a la par; las
//    que no tienen navegan directo.
// ─────────────────────────────────────────────────────────────
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { menuParaRol, type Seccion } from '@/config/menu'
import SubSideBar from './SubSideBar.vue'

defineProps<{ abierta: boolean }>()
defineEmits<{ cerrar: [] }>()

const route = useRoute()
const auth = useAuthStore()

// Menú del rol actual (sin perfil → el más limitado: 5)
const menu = computed(() => menuParaRol(auth.perfil?.rolNumero ?? 5))

const seccionActiva = ref<Seccion | null>(null)

// ¿Está seleccionada la sección? (su ruta exacta o una subsección suya)
function seleccionada(seccion: Seccion) {
  return route.path === seccion.ruta || route.path.startsWith(seccion.ruta + '/')
}

function alternarSeccion(seccion: Seccion) {
  if (seccionActiva.value?.id === seccion.id) {
    seccionActiva.value = null // segundo clic: cierra el sub-panel
    return
  }
  if (seccion.subsecciones?.length) {
    seccionActiva.value = seccion
  }
}

// Si navegas hacia otra sección, cierra el sub-panel que quedó abierto
watch(
  () => route.path,
  (nueva) => {
    if (seccionActiva.value && !nueva.startsWith(seccionActiva.value.ruta)) {
      seccionActiva.value = null
    }
  },
)
</script>

<template>
  <!-- Fondo oscuro detrás del cajón (solo teléfono) -->
  <div
    v-if="abierta"
    class="fixed inset-0 z-30 bg-slate-900/50 lg:hidden"
    @click="$emit('cerrar')"
  />

  <aside
    class="fixed inset-y-16 left-0 z-40 flex w-64 -translate-x-full border-r border-slate-200 bg-white transition-all duration-200 lg:relative lg:inset-auto lg:z-auto lg:translate-x-0"
    :class="abierta ? 'translate-x-0' : 'lg:w-20'"
  >
    <nav class="w-full flex-col overflow-y-auto" :class="seccionActiva ? 'hidden lg:flex' : 'flex'">
      <ul class="flex-1 space-y-1 p-2 lg:p-3">
        <li v-for="seccion in menu" :key="seccion.id">
          <!-- Con subsecciones: botón que abre/cierra el sub-panel -->
          <button
            v-if="seccion.subsecciones?.length"
            type="button"
            class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            :class="[
              seleccionada(seccion) ? 'bg-primario/10 text-primario' : '',
              abierta ? '' : 'lg:justify-center lg:px-0',
            ]"
            @click="alternarSeccion(seccion)"
          >
            <!-- eslint-disable-next-line vue/no-v-html -- SVG estático propio, nunca datos del usuario -->
            <svg
              class="h-5 w-5 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              v-html="seccion.icono"
            />
            <span class="truncate" :class="abierta ? '' : 'lg:hidden'">{{ seccion.nombre }}</span>
            <svg
              class="ml-auto h-4 w-4 shrink-0 transition-transform"
              :class="[
                seccionActiva?.id === seccion.id ? 'rotate-90' : '',
                abierta ? '' : 'lg:hidden',
              ]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>

          <!-- Sin subsecciones: navega directo -->
          <RouterLink
            v-else
            :to="seccion.ruta"
            class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            :class="[
              seleccionada(seccion) ? 'bg-primario/10 text-primario' : '',
              abierta ? '' : 'lg:justify-center lg:px-0',
            ]"
          >
            <!-- eslint-disable-next-line vue/no-v-html -- SVG estático propio, nunca datos del usuario -->
            <svg
              class="h-5 w-5 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              v-html="seccion.icono"
            />
            <span class="truncate" :class="abierta ? '' : 'lg:hidden'">{{ seccion.nombre }}</span>
          </RouterLink>
        </li>
      </ul>
      <p class="px-4 pb-4 text-[10px] text-slate-400" :class="abierta ? '' : 'lg:hidden'">
        Expediente en Línea
      </p>
    </nav>

    <!-- Sub-panel: a la par en escritorio, cubre el cajón en móvil -->
    <SubSideBar v-if="seccionActiva" :seccion="seccionActiva" @cerrar="seccionActiva = null" />
  </aside>
</template>
