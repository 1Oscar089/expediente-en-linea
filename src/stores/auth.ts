// ─────────────────────────────────────────────────────────────
// STORE DE AUTENTICACIÓN (Pinia).
// Dirección: lib/firebase + lib/usuarios → stores → vistas.
// Reglas:
//  - Docentes y estudiantes: SOLO Google, SOLO @clases.edu.sv.
//  - Responsables: correo nie@prados.com + contraseña (DUI sin guion).
//  - Quien NO existe en Firestore recibe "Aún no está registrado"
//    y NO queda cuenta en Auth (se elimina la que Google creó).
// El perfil SIEMPRE lo establece onAuthStateChanged: es la única
// fuente de verdad (sirve también al recargar la página).
// ─────────────────────────────────────────────────────────────
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'
import { auth, proveedorGoogle } from '@/lib/firebase'
import { buscarEstudiantePorNie, buscarPerfilInstitucional, type Perfil } from '@/lib/usuarios'

export const DOMINIO_INSTITUCIONAL = '@clases.edu.sv'
export const DOMINIO_RESPONSABLE = '@prados.com'

export const useAuthStore = defineStore('auth', () => {
  const perfil = ref<Perfil | null>(null)
  const cargando = ref(false)
  const error = ref<string | null>(null)
  const listo = ref(false) // Firebase ya respondió si había sesión guardada

  // Al abrir (o recargar) la app: reconstruye el perfil desde Firestore
  onAuthStateChanged(auth, async (user) => {
    if (user?.email) {
      if (user.email.endsWith(DOMINIO_RESPONSABLE)) {
        // Responsable: su "perfil" vive en el documento del estudiante
        const estudiante = await buscarEstudiantePorNie(user.email.split('@')[0])
        perfil.value = estudiante
          ? { correo: user.email, nombre: estudiante.responsable, rol: 'responsable' }
          : null
      } else {
        perfil.value = await buscarPerfilInstitucional(user.email)
      }
      if (!perfil.value) await signOut(auth) // sesión sin perfil: fuera
    } else {
      perfil.value = null
    }
    listo.value = true
  })

  const estaLogueado = computed(() => perfil.value !== null)

  /** Elimina la cuenta recién creada para que no quede en Auth. */
  async function eliminarSesion(user: User) {
    try {
      await deleteUser(user)
    } catch {
      await signOut(auth)
    }
  }

  /** Docentes y estudiantes: Google obligatorio + dominio + Firestore. */
  async function entrarConGoogle() {
    error.value = null
    cargando.value = true
    try {
      const resultado = await signInWithPopup(auth, proveedorGoogle)
      const correo = resultado.user.email ?? ''

      // 1) Dominio institucional obligatorio
      if (!correo.endsWith(DOMINIO_INSTITUCIONAL)) {
        await eliminarSesion(resultado.user)
        error.value = `Usa tu cuenta institucional ${DOMINIO_INSTITUCIONAL}.`
        return
      }

      // 2) Debe existir en Firestore (docentes o estudiantes)
      const encontrado = await buscarPerfilInstitucional(correo)
      if (!encontrado) {
        await eliminarSesion(resultado.user)
        error.value = 'Aún no está registrado. Solicite su acceso a la administración.'
        return
      }
      // Si pasó las dos pruebas, onAuthStateChanged establece el perfil.
    } catch (e) {
      const codigo = (e as { code?: string }).code ?? ''
      error.value =
        codigo.includes('popup-closed') || codigo.includes('cancelled')
          ? 'Inicio de sesión cancelado.'
          : 'No se pudo iniciar sesión con Google.'
    } finally {
      cargando.value = false
    }
  }

  /** Responsables: nie@prados.com + contraseña (DUI sin guion). */
  async function entrarComoResponsable(correo: string, password: string) {
    error.value = null
    cargando.value = true
    try {
      const limpio = correo.trim().toLowerCase()
      if (!limpio.endsWith(DOMINIO_RESPONSABLE)) {
        error.value = `Los responsables ingresan con su correo nie${DOMINIO_RESPONSABLE}.`
        return
      }

      // Debe existir el estudiante en Firestore
      const estudiante = await buscarEstudiantePorNie(limpio.split('@')[0])
      if (!estudiante) {
        error.value = 'Aún no está registrado. Solicite su acceso a la administración.'
        return
      }

      // Intenta entrar; si la cuenta aún no existe en Auth, se crea SOLO
      // si la contraseña coincide con el DUI del estudiante (sin guiones).
      try {
        await signInWithEmailAndPassword(auth, limpio, password)
      } catch {
        const duiSinGuion = estudiante.dui.replace(/-/g, '').trim()
        if (password.trim() !== duiSinGuion) {
          error.value = 'Contraseña incorrecta (es su DUI sin guiones).'
          return
        }
        try {
          await createUserWithEmailAndPassword(auth, limpio, password)
        } catch {
          // La cuenta ya existía con otra contraseña
          error.value = 'Contraseña incorrecta.'
        }
      }
    } finally {
      cargando.value = false
    }
  }

  async function salir() {
    await signOut(auth) // onAuthStateChanged limpia el perfil
  }

  return {
    perfil,
    cargando,
    error,
    listo,
    estaLogueado,
    entrarConGoogle,
    entrarComoResponsable,
    salir,
  }
})
