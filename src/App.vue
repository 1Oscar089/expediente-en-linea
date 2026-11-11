<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { useAuthStore } from '@/stores/auth'
import { MENU } from '@/config/menu'

import UserBar from '@/components/layout/UserBar.vue'
import SideBar from '@/components/layout/SideBar.vue'
import ContentArea from '@/components/layout/ContentArea.vue'
import LoginView from '@/views/LoginView.vue'
import InicioView from '@/views/InicioView.vue'
import DocentesView from '@/views/DocentesView.vue'

/* Nivel proyecto: notificaciones push y capa de carga global */
import Notificaciones from '@/components/ui/Notificaciones.vue'
import CargaGlobal from '@/components/ui/CargaGlobal.vue'

const auth = useAuthStore()

/* Punto de ruptura: 1024px (lg). Escritorio arranca con la sidebar EXTENDIDA;
   teléfono arranca con el cajón cerrado. */
const pantallaGrande = window.matchMedia('(min-width: 1024px)')
const sidebarAbierta = ref(pantallaGrande.matches)

/* Si la ventana cruza el punto de ruptura, se re-sincroniza sola */
pantallaGrande.addEventListener('change', (evento) => {
  sidebarAbierta.value = evento.matches
})

/* Estado de navegación que pertenece a App */
const seccionActiva = ref('inicio')
const subseccionActiva = ref<string | null>(null)

/* Al cambiar la vista provisional del admin, se vuelve a Inicio */
watch(
  () => auth.rolEfectivo,
  () => {
    seccionActiva.value = 'inicio'
    subseccionActiva.value = null
  },
)

const seccionMenu = computed(() => MENU.find((s) => s.id === seccionActiva.value) ?? null)
const tituloActivo = computed(() => seccionMenu.value?.nombre ?? 'Inicio')
const subtituloActivo = computed(() => {
  const id = subseccionActiva.value
  if (!id) return null
  return seccionMenu.value?.subsecciones?.find((x) => x.id === id)?.nombre ?? null
})

function alSeleccionarSeccion(id: string) {
  seccionActiva.value = id
  const seccion = MENU.find((s) => s.id === id)
  if (!seccion?.subsecciones?.length) subseccionActiva.value = null
}

function alSeleccionarSubseccion(seccionId: string, subseccionId: string) {
  seccionActiva.value = seccionId
  subseccionActiva.value = subseccionId
}

/* La orden "cerrar" solo aplica en teléfono (el cajón).
   En escritorio la sidebar queda como esté: extendida o en mini, sin cerrarse al navegar. */
function cerrarSiMovil() {
  if (!pantallaGrande.matches) sidebarAbierta.value = false
}
</script>

<template>
  <!-- Estado 1: verificando la sesión -->
  <p v-if="!auth.listo" class="grid min-h-dvh place-items-center text-sm text-slate-500">
    Cargando…
  </p>

  <!-- Estado 2: sin sesión -->
  <LoginView v-else-if="!auth.estaLogueado" />

  <!-- Estado 3: layout -->
  <div v-else class="flex min-h-dvh flex-col bg-white">
    <UserBar @alternar-sidebar="sidebarAbierta = !sidebarAbierta" />

    <!-- La sidebar es FIXED, así que el contenido se corre según su ancho real:
         extendida = lg:ml-64 (256px), mini = lg:ml-20 (80px). En teléfono no se corre. -->
    <div
      class="flex min-h-0 flex-1 overflow-hidden transition-[margin] duration-200"
      :class="sidebarAbierta ? 'lg:ml-64' : 'lg:ml-20'"
    >
      <SideBar
        :abierta="sidebarAbierta"
        :seccion-activa="seccionActiva"
        :subseccion-activa="subseccionActiva"
        @cerrar="cerrarSiMovil"
        @seleccionar="alSeleccionarSeccion"
        @seleccionar-subseccion="alSeleccionarSubseccion"
      />

      <ContentArea :titulo="tituloActivo" :subtitulo="subtituloActivo">
        <InicioView v-if="seccionActiva === 'inicio'" />
        <DocentesView v-else-if="seccionActiva === 'docentes'" />
      </ContentArea>
    </div>
  </div>

  <!-- Nivel proyecto: notificaciones (5 s, esquina superior derecha) y carga que bloquea todo -->
  <Notificaciones />
  <CargaGlobal />
</template>