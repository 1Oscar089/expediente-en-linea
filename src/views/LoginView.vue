<script setup lang="ts">
// ─────────────────────────────────────────────────────────────
// LOGIN — dos modos:
//  1. Institucional (docentes/estudiantes): Google obligatorio,
//     solo @clases.edu.sv, y debe existir en Firestore.
//  2. Responsable: correo nie@prados.com + contraseña (DUI sin guion).
// La lógica vive en el store; esta vista solo recolecta y muestra.
// ─────────────────────────────────────────────────────────────
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const modo = ref<'institucional' | 'responsable'>('institucional')
const correo = ref('')
const password = ref('')
</script>

<template>
  <section class="flex min-h-screen items-center justify-center bg-slate-100 p-6">
    <div class="w-full max-w-sm space-y-6 rounded-2xl border border-slate-200 bg-white p-8 shadow">
      <header class="text-center">
        <h1 class="text-2xl font-bold">Expediente en Línea</h1>
        <p class="mt-1 text-sm text-slate-500">Ingresa con tu cuenta</p>
      </header>

      <!-- Pestañas de modo -->
      <div class="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 text-sm font-medium">
        <button
          type="button"
          class="rounded-lg px-3 py-2"
          :class="modo === 'institucional' ? 'bg-white text-primario shadow' : 'text-slate-500'"
          @click="modo = 'institucional'"
        >
          Institucional
        </button>
        <button
          type="button"
          class="rounded-lg px-3 py-2"
          :class="modo === 'responsable' ? 'bg-white text-primario shadow' : 'text-slate-500'"
          @click="modo = 'responsable'"
        >
          Responsable
        </button>
      </div>

      <!-- Errores: dominio, "aún no está registrado", contraseña… -->
      <p v-if="auth.error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
        {{ auth.error }}
      </p>

      <!-- MODO 1: Google obligatorio -->
      <div v-if="modo === 'institucional'" class="space-y-3">
        <button
          type="button"
          :disabled="auth.cargando"
          class="flex w-full items-center justify-center gap-3 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
          @click="auth.entrarConGoogle()"
        >
          <svg class="h-5 w-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          {{ auth.cargando ? 'Verificando…' : 'Continuar con Google' }}
        </button>
        <p class="text-center text-xs text-slate-400">
          Docentes y estudiantes: solo cuentas <strong>@clases.edu.sv</strong>
        </p>
      </div>

      <!-- MODO 2: responsable con correo y contraseña -->
      <form v-else class="space-y-3" @submit.prevent="auth.entrarComoResponsable(correo, password)">
        <input
          v-model="correo"
          type="email"
          required
          autocomplete="username"
          placeholder="nie12345678@prados.com"
          class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-primario focus:outline-none"
        />
        <input
          v-model="password"
          type="password"
          required
          autocomplete="current-password"
          placeholder="Contraseña (su DUI sin guiones)"
          class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-primario focus:outline-none"
        />
        <button
          type="submit"
          :disabled="auth.cargando"
          class="w-full rounded-lg bg-primario px-4 py-2.5 text-sm font-semibold text-white hover:bg-primario-oscuro disabled:opacity-50"
        >
          {{ auth.cargando ? 'Verificando…' : 'Entrar' }}
        </button>
        <p class="text-center text-xs text-slate-400">
          Solo responsables de familia: el correo es el NIE del estudiante + @prados.com
        </p>
      </form>
    </div>
  </section>
</template>
