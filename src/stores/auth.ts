import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'

import { auth as fbAuth, proveedorGoogle } from '@/lib/firebase'
import {
  buscarEstudiantePorNie,
  buscarPerfilInstitucional,
  DOMINIO_INSTITUCIONAL,
  DOMINIO_RESPONSABLE,
  type Perfil,
  type Rol,
} from '@/lib/usuarios'

function mensajeError(e: unknown): string {
  const codigo = (e as { code?: string })?.code ?? ''
  if (
    codigo === 'auth/invalid-credential' ||
    codigo === 'auth/wrong-password' ||
    codigo === 'auth/user-not-found'
  ) {
    return 'Correo o contraseña incorrectos.'
  }
  if (codigo === 'auth/popup-closed-by-request' || codigo === 'auth/cancelled-popup-request') {
    return 'Ventana de Google cerrada.'
  }
  if (codigo === 'auth/popup-blocked') return 'El navegador bloqueó la ventana de Google.'
  if (codigo === 'auth/too-many-requests') return 'Demasiados intentos, espera un momento.'
  if (codigo === 'auth/network-request-failed') return 'Sin conexión.'
  return 'No se pudo iniciar sesión.'
}

export const useAuthStore = defineStore('auth', () => {
  const perfil = ref<Perfil | null>(null)
  const cargando = ref(false)
  const error = ref('')
  const listo = ref(false)

  /* Vista provisional: el admin (1) puede mirar la app como 2, 3, 4 o 5.
     null = está en su propia vista. Solo vive mientras la sesión está abierta. */
  const vistaRol = ref<Rol | null>(null)

  const estaLogueado = computed(() => perfil.value !== null)
  const esAdmin = computed(() => perfil.value?.rol === 'admin')
  const rolEfectivo = computed<Rol | null>(() => vistaRol.value ?? perfil.value?.rol ?? null)

  /* Reconstruye el perfil al recargar la página */
  onAuthStateChanged(fbAuth, async (usuario) => {
    if (!usuario?.email) {
      perfil.value = null
      listo.value = true
      return
    }
    try {
      if (usuario.email.endsWith(DOMINIO_RESPONSABLE)) {
        const encontrado = await buscarEstudiantePorNie(usuario.email.split('@')[0] ?? '')
        perfil.value = encontrado
          ? { correo: usuario.email, nombre: encontrado.nombre, rol: 'responsable' }
          : null
        if (!encontrado) await signOut(fbAuth)
      } else {
        const encontrado = await buscarPerfilInstitucional(usuario.email)
        perfil.value = encontrado
        if (!encontrado) await signOut(fbAuth)
      }
    } catch {
      perfil.value = null
    } finally {
      listo.value = true
    }
  })

  /* Si el perfil no existe en Firestore, la cuenta creada por Google se elimina */
  async function limpiarCuentaInvalida(usuario: User) {
    try {
      await deleteUser(usuario)
    } catch {
      await signOut(fbAuth)
    }
  }

  async function entrarConGoogle() {
    error.value = ''
    cargando.value = true
    try {
      const resultado = await signInWithPopup(fbAuth, proveedorGoogle)
      const usuario = resultado.user
      const correo = usuario.email ?? ''

      if (!correo.endsWith(DOMINIO_INSTITUCIONAL)) {
        await limpiarCuentaInvalida(usuario)
        error.value = `Solo se permiten correos ${DOMINIO_INSTITUCIONAL}`
        return
      }

      const encontrado = await buscarPerfilInstitucional(correo)
      if (!encontrado) {
        await limpiarCuentaInvalida(usuario)
        error.value = 'Aún no está registrado.'
        return
      }

      perfil.value = encontrado
      error.value = ''
    } catch (e) {
      error.value = mensajeError(e)
    } finally {
      cargando.value = false
    }
  }

  async function entrarComoResponsable(correo: string, contraseña: string) {
    error.value = ''
    cargando.value = true
    try {
      const correoLimpio = correo.trim().toLowerCase()

      if (!correoLimpio.endsWith(DOMINIO_RESPONSABLE)) {
        error.value = `El correo debe terminar en ${DOMINIO_RESPONSABLE}`
        return
      }

      const encontrado = await buscarEstudiantePorNie(correoLimpio.split('@')[0] ?? '')
      if (!encontrado) {
        error.value = 'Aún no está registrado.'
        return
      }

      try {
        await signInWithEmailAndPassword(fbAuth, correoLimpio, contraseña)
      } catch (e) {
        const codigo = (e as { code?: string })?.code ?? ''
        /* Primera vez: la cuenta de Auth no existe; se crea SOLO si la contraseña coincide con el DUI */
        if (codigo === 'auth/invalid-credential' && contraseña === encontrado.dui) {
          await createUserWithEmailAndPassword(fbAuth, correoLimpio, contraseña)
        } else {
          throw e
        }
      }

      perfil.value = { correo: correoLimpio, nombre: encontrado.nombre, rol: 'responsable' }
      error.value = ''
    } catch (e) {
      error.value = mensajeError(e)
    } finally {
      cargando.value = false
    }
  }

  /* Vista provisional del admin: elegir entre las otras 4 */
  function cambiarVista(rol: Rol) {
    if (!esAdmin.value) return
    vistaRol.value = rol === perfil.value?.rol ? null : rol
  }

  async function salir() {
    vistaRol.value = null
    await signOut(fbAuth)
    perfil.value = null
  }

  return {
    perfil,
    cargando,
    error,
    listo,
    vistaRol,
    estaLogueado,
    esAdmin,
    rolEfectivo,
    entrarConGoogle,
    entrarComoResponsable,
    cambiarVista,
    salir,
  }
})
