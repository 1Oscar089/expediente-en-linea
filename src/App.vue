<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { useAuthStore } from '@/stores/auth'
import { MENU, menuParaRol } from '@/config/menu'

import UserBar from '@/components/layout/UserBar.vue'
import SideBar from '@/components/layout/SideBar.vue'
import ContentArea from '@/components/layout/ContentArea.vue'
import LoginView from '@/views/LoginView.vue'
import InicioView from '@/views/InicioView.vue'
import DocentesView from '@/views/DocentesView.vue'
import MatricularView from '@/views/MatricularView.vue'
import InformacionCeView from '@/views/InformacionCeView.vue'

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

/* ── Recordar la ubicación (sección + subsección) ──
   Al recargar la página (o volver a abrir la app) el usuario regresa
   exactamente donde estaba. Se guarda en localStorage POR USUARIO: en
   equipos compartidos cada quien vuelve a SU último punto. Antes de
   restaurar se valida contra el menú del rol vigente — si la sección ya
   no existe o el rol cambió, se arranca en Inicio sin errores. Al cerrar
   sesión se borra, para que el siguiente usuario empiece de cero. */
const CLAVE_UBICACION = 'expediente.ubicacion'

interface Ubicacion {
  s: string // id de la sección (ej. 'estudiantes')
  sub: string | null // id de la subsección, si aplica (ej. 'matricular')
  u: string // correo del dueño de esta ubicación
}

function guardarUbicacion(): void {
  try {
    const dato: Ubicacion = {
      s: seccionActiva.value,
      sub: subseccionActiva.value,
      u: auth.perfil?.correo ?? '',
    }
    localStorage.setItem(CLAVE_UBICACION, JSON.stringify(dato))
  } catch {
    /* Sin almacenamiento disponible: la app funciona normal, solo no recuerda */
  }
}

function leerUbicacion(): Ubicacion | null {
  try {
    const crudo = localStorage.getItem(CLAVE_UBICACION)
    if (!crudo) return null
    const dato = JSON.parse(crudo) as Partial<Ubicacion>
    if (typeof dato.s !== 'string' || typeof dato.u !== 'string') return null
    return { s: dato.s, sub: typeof dato.sub === 'string' ? dato.sub : null, u: dato.u }
  } catch {
    return null
  }
}

/* La ubicación guardada solo vale si es del usuario en sesión y el menú
   de su rol efectivo todavía la contiene (sección y subsección). */
function ubicacionRecuperable(dato: Ubicacion): boolean {
  if (dato.u !== (auth.perfil?.correo ?? '')) return false
  const seccion = menuParaRol(auth.rolEfectivo).find((s) => s.id === dato.s)
  if (!seccion) return false
  if (dato.sub && !seccion.subsecciones?.some((sub) => sub.id === dato.sub)) return false
  return true
}

/* Recarga o reapertura: apenas la sesión está lista, volver al punto guardado.
   immediate:true cubre también la sesión ya activa (no hay cambio que disparar). */
watch(
  () => auth.listo && auth.estaLogueado,
  (activo) => {
    if (!activo) return
    const guardada = leerUbicacion()
    if (guardada && ubicacionRecuperable(guardada)) {
      seccionActiva.value = guardada.s
      subseccionActiva.value = guardada.sub
    }
  },
  { immediate: true },
)

/* Cada movimiento por el menú deja anotada la ubicación */
watch([seccionActiva, subseccionActiva], guardarUbicacion)

/* Cerrar sesión borra la ubicación: el siguiente usuario empieza en Inicio */
watch(
  () => auth.estaLogueado,
  (logueado) => {
    if (logueado) return
    try {
      localStorage.removeItem(CLAVE_UBICACION)
    } catch {
      /* nada que hacer sin almacenamiento */
    }
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

  <!-- Estado 3: layout.
       REGLA DE SCROLL DEL PROYECTO: la app mide EXACTAMENTE una pantalla
       (h-dvh) y nada se sale de ella. La userbar, el nombre del panel y la
       sidebar SIEMPRE se ven; el ÚNICO scroll es el del rectángulo de
       contenido (ContentArea). Por eso la raíz es h-dvh + overflow-hidden:
       si fuera min-h-dvh, el contenido crecería y la página entera
       (userbar, título, sidebar) se correría hacia arriba al hacer scroll. -->
  <div v-else class="flex h-dvh flex-col overflow-hidden bg-white">
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
        <MatricularView
          v-else-if="seccionActiva === 'estudiantes' && subseccionActiva === 'matricular'"
        />
        <InformacionCeView
          v-else-if="seccionActiva === 'configuracion' && subseccionActiva === 'informacion-ce'"
        />
      </ContentArea>
    </div>
  </div>

  <!-- Nivel proyecto: notificaciones (5 s, esquina superior derecha) y carga que bloquea todo -->
  <Notificaciones />
  <CargaGlobal />
</template>
