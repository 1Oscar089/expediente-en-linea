<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'

import { sugerirCorreoLocal, type DocenteCompleto } from '@/lib/docentes'
import { NOMBRES_ROL, type Rol } from '@/lib/usuarios'

import ModalBase from '@/components/ui/ModalBase.vue'

/* Formulario de docente: sirve para AGREGAR y para EDITAR.
   El correo se sugiere solo mientras se escribe el nombre
   (nombre[0].nombre[1].nombre[2], todo en minúsculas);
   la parte fija @clases.edu.sv NO es modificable, lo demás sí. */
const props = defineProps<{
  modo: 'agregar' | 'editar'
  inicial?: DocenteCompleto
}>()

const emit = defineEmits<{
  (e: 'guardar', datos: DocenteCompleto, correoOriginal?: string): void
  (e: 'cerrar'): void
}>()

const ROLES_DOCENTE: Rol[] = ['docente', 'director', 'admin']

function parteLocal(correo: string): string {
  return correo.trim().toLowerCase().split('@')[0] ?? ''
}

const form = reactive({
  nombre: props.inicial?.nombre ?? '',
  dui: props.inicial?.dui ?? '',
  nip: props.inicial?.nip ?? '',
  telefono: props.inicial?.telefono ?? '',
  fechaNacimiento: props.inicial?.fechaNacimiento ?? '',
  anioServicio: props.inicial?.anioServicio ?? '',
  especialidad: props.inicial?.especialidad ?? '',
  rol: props.inicial?.rol || 'docente',
  correoLocal: parteLocal(props.inicial?.correo ?? ''),
})

/* En editar se respeta el correo existente hasta que el usuario lo toque */
const correoTocado = ref(props.modo === 'editar')

watch(
  () => form.nombre,
  (nombre) => {
    if (!correoTocado.value) form.correoLocal = sugerirCorreoLocal(nombre)
  },
)

const intentado = ref(false)

const errores = computed(() => {
  const e: Partial<Record<keyof typeof form, string>> = {}
  if (!form.nombre.trim()) e.nombre = 'El nombre es obligatorio.'
  if (!form.dui.trim()) e.dui = 'El DUI es obligatorio.'
  if (!form.nip.trim()) e.nip = 'El NIP es obligatorio.'
  if (!form.telefono.trim()) e.telefono = 'El telefono es obligatorio.'
  const local = form.correoLocal.trim().toLowerCase().replace(/^\.+|\.+$/g, '')
  if (!local) e.correoLocal = 'El correo es obligatorio.'
  else if (!/^[a-z0-9._-]+$/.test(local)) {
    e.correoLocal = 'Solo letras, números, punto y guiones.'
  }
  return e
})

const claseCampo = (campo: keyof typeof form) =>
  errores.value[campo] && intentado.value
    ? 'border-eliminar focus:border-eliminar focus:ring-eliminar/20'
    : 'border-slate-300 focus:border-primario'

function enviar() {
  intentado.value = true
  if (Object.keys(errores.value).length) return

  const local = form.correoLocal.trim().toLowerCase().replace(/^\.+|\.+$/g, '')
  const datos: DocenteCompleto = {
    nombre: form.nombre.trim(),
    dui: form.dui.trim(),
    nip: form.nip.trim(),
    telefono: form.telefono.trim(),
    correo: `${local}@clases.edu.sv`,
    fechaNacimiento: form.fechaNacimiento.trim(),
    anioServicio: String(form.anioServicio).trim(),
    especialidad: form.especialidad.trim(),
    rol: form.rol,
    estado: props.inicial?.estado || 'activo',
  }
  emit('guardar', datos, props.modo === 'editar' ? props.inicial?.correo : undefined)
}
</script>

<template>
  <ModalBase
    :titulo="modo === 'agregar' ? 'Agregar docente' : 'Editar docente'"
    ancho="max-w-2xl"
    @cerrar="emit('cerrar')"
  >
    <div class="grid gap-3 sm:grid-cols-2">
      <!-- Nombre -->
      <div class="sm:col-span-2">
        <label class="text-xs font-semibold text-slate-600" for="doc-nombre">
          Nombre <span class="text-eliminar">*</span>
        </label>
        <input
          id="doc-nombre"
          v-model="form.nombre"
          type="text"
          autocomplete="off"
          class="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:ring-2 focus:ring-primario/20"
          :class="claseCampo('nombre')"
        />
        <p v-if="intentado && errores.nombre" class="mt-1 text-xs text-eliminar">
          {{ errores.nombre }}
        </p>
      </div>

      <!-- DUI / NIP -->
      <div>
        <label class="text-xs font-semibold text-slate-600" for="doc-dui">
          DUI <span class="text-eliminar">*</span>
        </label>
        <input
          id="doc-dui"
          v-model="form.dui"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          class="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:ring-2 focus:ring-primario/20"
          :class="claseCampo('dui')"
        />
        <p v-if="intentado && errores.dui" class="mt-1 text-xs text-eliminar">
          {{ errores.dui }}
        </p>
      </div>
      <div>
        <label class="text-xs font-semibold text-slate-600" for="doc-nip">
          NIP <span class="text-eliminar">*</span>
        </label>
        <input
          id="doc-nip"
          v-model="form.nip"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          class="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:ring-2 focus:ring-primario/20"
          :class="claseCampo('nip')"
        />
        <p v-if="intentado && errores.nip" class="mt-1 text-xs text-eliminar">
          {{ errores.nip }}
        </p>
      </div>

      <!-- Telefono / Fecha de nacimiento -->
      <div>
        <label class="text-xs font-semibold text-slate-600" for="doc-telefono">
          Telefono <span class="text-eliminar">*</span>
        </label>
        <input
          id="doc-telefono"
          v-model="form.telefono"
          type="tel"
          autocomplete="off"
          class="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:ring-2 focus:ring-primario/20"
          :class="claseCampo('telefono')"
        />
        <p v-if="intentado && errores.telefono" class="mt-1 text-xs text-eliminar">
          {{ errores.telefono }}
        </p>
      </div>
      <div>
        <label class="text-xs font-semibold text-slate-600" for="doc-fecha">Fecha de nacimiento</label>
        <input
          id="doc-fecha"
          v-model="form.fechaNacimiento"
          type="date"
          class="mt-1 w-full rounded-lg border px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:ring-2 focus:ring-primario/20"
          :class="claseCampo('fechaNacimiento')"
        />
      </div>

      <!-- Año de servicio / Especialidad -->
      <div>
        <label class="text-xs font-semibold text-slate-600" for="doc-anio">Año de servicio</label>
        <input
          id="doc-anio"
          v-model="form.anioServicio"
          type="number"
          min="0"
          step="1"
          class="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:ring-2 focus:ring-primario/20"
          :class="claseCampo('anioServicio')"
        />
      </div>
      <div>
        <label class="text-xs font-semibold text-slate-600" for="doc-especialidad">Especialidad</label>
        <input
          id="doc-especialidad"
          v-model="form.especialidad"
          type="text"
          autocomplete="off"
          class="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:ring-2 focus:ring-primario/20"
          :class="claseCampo('especialidad')"
        />
      </div>

      <!-- Rol -->
      <div class="sm:col-span-2">
        <label class="text-xs font-semibold text-slate-600" for="doc-rol">Rol</label>
        <select
          id="doc-rol"
          v-model="form.rol"
          class="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:ring-2 focus:ring-primario/20"
          :class="claseCampo('rol')"
        >
          <option v-for="r in ROLES_DOCENTE" :key="r" :value="r">{{ NOMBRES_ROL[r] }}</option>
        </select>
      </div>

      <!-- Correo: parte editable + parte fija @clases.edu.sv -->
      <div class="sm:col-span-2">
        <label class="text-xs font-semibold text-slate-600" for="doc-correo">
          Correo <span class="text-eliminar">*</span>
        </label>
        <div class="mt-1 flex">
          <input
            id="doc-correo"
            v-model="form.correoLocal"
            type="text"
            autocomplete="off"
            spellcheck="false"
            class="min-w-0 flex-1 rounded-l-lg border px-3 py-2 text-sm outline-none transition-colors focus:ring-2 focus:ring-primario/20"
            :class="claseCampo('correoLocal')"
            @input="correoTocado = true"
          />
          <span
            class="flex select-none items-center rounded-r-lg border border-l-0 bg-slate-100 px-3 text-sm font-semibold text-slate-500"
            title="Parte fija, no modificable"
          >
            @clases.edu.sv
          </span>
        </div>
        <p v-if="intentado && errores.correoLocal" class="mt-1 text-xs text-eliminar">
          {{ errores.correoLocal }}
        </p>
        <p v-else class="mt-1 text-xs text-slate-400">
          Se escribe solo mientras completas el nombre; lo puedes corregir a mano.
        </p>
      </div>
    </div>

    <div class="mt-5 flex justify-end gap-2">
      <button
        type="button"
        class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
        @click="emit('cerrar')"
      >
        Cancelar
      </button>
      <button
        type="button"
        class="rounded-lg bg-primario px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primario-oscuro"
        @click="enviar"
      >
        {{ modo === 'agregar' ? 'Agregar' : 'Guardar' }}
      </button>
    </div>
  </ModalBase>
</template>