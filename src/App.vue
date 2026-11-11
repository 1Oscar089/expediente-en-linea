<script setup lang="ts">
// ─────────────────────────────────────────────────────────────
// MARCO DE LA APP: userbar + sidebar + <RouterView/>.
// Todo lo que va DESPUÉS del userbar y el sidebar es contenido,
// y lo pinta el router según la URL. El estado del sidebar sigue
// siendo de App (props ↓, eventos ↑).
// ─────────────────────────────────────────────────────────────
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import UserBar from '@/components/layout/UserBar.vue'
import SideBar from '@/components/layout/SideBar.vue'
import LoginView from '@/views/LoginView.vue'

const auth = useAuthStore()

// En escritorio arranca expandida; en teléfono, guardada
const sidebarAbierta = ref(window.innerWidth >= 1024)
</script>

<template>
  <!-- 1) Firebase está verificando si hay sesión guardada -->
  <div v-if="!auth.listo" class="flex h-screen items-center justify-center bg-white">
    <p class="text-sm text-slate-500">Cargando…</p>
  </div>

  <!-- 2) Sin sesión: login -->
  <LoginView v-else-if="!auth.estaLogueado" />

  <!-- 3) Con sesión: layout -->
  <div v-else class="h-screen overflow-hidden bg-white">
    <UserBar @alternar-sidebar="sidebarAbierta = !sidebarAbierta" />

    <div class="flex h-[calc(100vh-4rem)]">
      <SideBar :abierta="sidebarAbierta" @cerrar="sidebarAbierta = false" />

      <!-- ÁREA DE CONTENIDO: la pinta el router según la URL -->
      <main class="flex-1 overflow-y-auto bg-white p-4 md:p-6">
        <RouterView />
      </main>
    </div>
  </div>
</template>
