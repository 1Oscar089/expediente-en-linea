// ─────────────────────────────────────────────────────────────
// ROUTER. Cada ruta con restricción lleva meta.roles con los
// NOMBRES de rol — los mismos que usa config/menu.ts:
//   'admin' | 'director' | 'docente' | 'estudiante' | 'responsable'
// El guard bloquea y manda a /inicio si el rol no está permitido
// — aunque escriban la URL a mano.
// ─────────────────────────────────────────────────────────────
import { createRouter, createWebHistory } from 'vue-router'

import { useAuthStore } from '@/stores/auth'
import type { Rol } from '@/lib/usuarios'

/* Grupos de permisos (misma fuente de verdad que config/menu.ts) */
const DIRECCION: Rol[] = ['admin', 'director']
const ACADEMICO: Rol[] = ['admin', 'director', 'docente']

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/inicio' },

    { path: '/inicio', name: 'inicio', component: () => import('@/views/InicioView.vue') },

    // Configuración: la sección sola redirige a su primera subsección.
    // Cada subsección vive en SU hoja del libro "configuracion"; las que aún
    // no tienen vista propia muestran el placeholder SeccionView.
    { path: '/configuracion', redirect: '/configuracion/informacion-ce' },
    {
      path: '/configuracion/asignaturas',
      component: () => import('@/views/SeccionView.vue'),
      meta: { titulo: 'Asignaturas', roles: DIRECCION },
    },
    {
      path: '/configuracion/avisos',
      component: () => import('@/views/SeccionView.vue'),
      meta: { titulo: 'Avisos', roles: DIRECCION },
    },
    {
      path: '/configuracion/backup',
      component: () => import('@/views/SeccionView.vue'),
      meta: { titulo: 'Backup y respaldo', roles: DIRECCION },
    },
    {
      path: '/configuracion/cde',
      component: () => import('@/views/SeccionView.vue'),
      meta: { titulo: 'CDE', roles: DIRECCION },
    },
    {
      path: '/configuracion/ciclo-escolar',
      component: () => import('@/views/SeccionView.vue'),
      meta: { titulo: 'Ciclo Escolar', roles: DIRECCION },
    },
    {
      path: '/configuracion/consola',
      component: () => import('@/views/SeccionView.vue'),
      meta: { titulo: 'Consola', roles: DIRECCION },
    },
    {
      path: '/configuracion/fondos',
      component: () => import('@/views/SeccionView.vue'),
      meta: { titulo: 'Fondos', roles: DIRECCION },
    },
    {
      path: '/configuracion/informacion-ce',
      component: () => import('@/views/InformacionCeView.vue'),
      meta: { titulo: 'Informacion CE', roles: DIRECCION },
    },
    {
      path: '/configuracion/inventarios',
      component: () => import('@/views/SeccionView.vue'),
      meta: { titulo: 'Inventarios', roles: DIRECCION },
    },
    {
      path: '/configuracion/programaciones',
      component: () => import('@/views/SeccionView.vue'),
      meta: { titulo: 'Programaciones', roles: DIRECCION },
    },
    {
      path: '/configuracion/recursos',
      component: () => import('@/views/SeccionView.vue'),
      meta: { titulo: 'Recursos', roles: DIRECCION },
    },
    {
      path: '/configuracion/secciones',
      component: () => import('@/views/SeccionView.vue'),
      meta: { titulo: 'Secciones', roles: DIRECCION },
    },

    {
      path: '/docentes',
      name: 'docentes',
      component: () => import('@/views/DocentesView.vue'),
      meta: { roles: DIRECCION }, // la sección Docentes es de dirección
    },

    // Estudiantes: la sección sola redirige a su primera acción
    { path: '/estudiantes', redirect: '/estudiantes/matricular' },
    {
      path: '/estudiantes/actualizar',
      component: () => import('@/views/SeccionView.vue'),
      meta: { titulo: 'Actualizar', roles: ACADEMICO },
    },
    {
      path: '/estudiantes/archivar',
      component: () => import('@/views/SeccionView.vue'),
      meta: { titulo: 'Archivar', roles: DIRECCION },
    },
    {
      path: '/estudiantes/descargables',
      component: () => import('@/views/SeccionView.vue'),
      meta: { titulo: 'Descargables', roles: DIRECCION },
    },
    {
      path: '/estudiantes/matricular',
      component: () => import('@/views/SeccionView.vue'),
      meta: { titulo: 'Matricular', roles: ACADEMICO },
    },
    {
      path: '/estudiantes/nomina',
      component: () => import('@/views/SeccionView.vue'),
      meta: { titulo: 'Nómina', roles: ACADEMICO },
    },
    {
      path: '/estudiantes/promocion',
      component: () => import('@/views/SeccionView.vue'),
      meta: { titulo: 'Promoción', roles: DIRECCION },
    },
    {
      path: '/estudiantes/retirar',
      component: () => import('@/views/SeccionView.vue'),
      meta: { titulo: 'Retirar', roles: DIRECCION },
    },

    // Cualquier URL desconocida → Inicio
    { path: '/:pathMatch(.*)*', redirect: '/inicio' },
  ],
})

// GUARDIA: si la ruta declara meta.roles y el rol efectivo no está en la
// lista, no pasa (protege también escribir la URL a mano). Usa el MISMO rol
// que pinta el menú (rolEfectivo), así respeta la vista provisional del admin.
router.beforeEach((destino) => {
  const auth = useAuthStore()
  const roles = destino.meta.roles as Rol[] | undefined
  const rol = auth.rolEfectivo
  if (roles && rol && !roles.includes(rol)) {
    return { path: '/inicio' }
  }
})

export default router