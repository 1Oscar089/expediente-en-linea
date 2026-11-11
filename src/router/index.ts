// ─────────────────────────────────────────────────────────────
// ROUTER. Cada ruta con restricción lleva meta.roles (indicadores
// internos 1-5). El guard bloquea y manda a /inicio si el rol no
// está permitido — aunque escriban la URL a mano.
// ─────────────────────────────────────────────────────────────
import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import type { RolNumero } from '@/lib/usuarios'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/inicio' },

    { path: '/inicio', name: 'inicio', component: () => import('@/views/InicioView.vue') },

    {
      path: '/docentes',
      name: 'docentes',
      component: () => import('@/views/DocentesView.vue'),
      meta: { roles: [1, 2] }, // admin y director
    },

    // Estudiantes: la sección sola redirige a su primera acción
    { path: '/estudiantes', redirect: '/estudiantes/matricular' },
    {
      path: '/estudiantes/matricular',
      component: () => import('@/views/SeccionView.vue'),
      meta: { titulo: 'Matricular', roles: [1, 2, 3] },
    },
    {
      path: '/estudiantes/retirar',
      component: () => import('@/views/SeccionView.vue'),
      meta: { titulo: 'Retirar', roles: [1, 2] },
    },
    {
      path: '/estudiantes/actualizar',
      component: () => import('@/views/SeccionView.vue'),
      meta: { titulo: 'Actualizar', roles: [1, 2, 3] },
    },
    {
      path: '/estudiantes/nomina',
      component: () => import('@/views/SeccionView.vue'),
      meta: { titulo: 'Nómina', roles: [1, 2, 3] },
    },
    {
      path: '/estudiantes/archivar',
      component: () => import('@/views/SeccionView.vue'),
      meta: { titulo: 'Archivar', roles: [1, 2] },
    },
    {
      path: '/estudiantes/promocion',
      component: () => import('@/views/SeccionView.vue'),
      meta: { titulo: 'Promoción', roles: [1, 2] },
    },

    // Cualquier URL desconocida → Inicio
    { path: '/:pathMatch(.*)*', redirect: '/inicio' },
  ],
})

// GUARDIA: si la ruta declara meta.roles y el rol del perfil no está
// en la lista, no pasa (protege también escribiendo la URL a mano)
router.beforeEach((destino) => {
  const auth = useAuthStore()
  const roles = destino.meta.roles as RolNumero[] | undefined
  if (roles && auth.perfil && !roles.includes(auth.perfil.rolNumero)) {
    return { path: '/inicio' }
  }
})

export default router
