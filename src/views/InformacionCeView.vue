<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { useUiStore } from '@/stores/ui'
import {
  INFO_CE_VACIA,
  guardarInfoCE,
  infoCEGuardada,
  leerInfoCE,
  sheetConfigurado,
  type InfoCE,
} from '@/lib/sheetConfiguracion'

/* ── Configuración › Información CE ──
   Los datos del centro viven en el Sheet de configuración (hoja
   "informacion-ce", registro único). Se muestran SIN poder editarlos;
   el lápiz (esquina superior derecha) activa la edición y se cambia por
   GUARDAR, que envía los valores al Sheet. Si el Sheet aún no tiene la
   fila de datos, todo se muestra en blanco. La lectura se hace UNA sola
   vez por recarga (caché en sheetConfiguracion.ts). */

const ui = useUiStore()

const CAMPOS: { clave: keyof InfoCE; etiqueta: string; completo?: boolean }[] = [
  { clave: 'codigoInfraestructura', etiqueta: 'Código de infraestructura' },
  { clave: 'centroEducativo', etiqueta: 'Centro Educativo' },
  { clave: 'departamento', etiqueta: 'Departamento' },
  { clave: 'municipio', etiqueta: 'Municipio' },
  { clave: 'distrito', etiqueta: 'Distrito' },
  { clave: 'canton', etiqueta: 'Cantón' },
  { clave: 'referencia', etiqueta: 'Referencia', completo: true },
]

/* Iconos SVG: SOLO TRAZO, sin relleno; heredan el color del texto */
function svg(trazo: string, clase = 'h-5 w-5'): string {
  return `<svg class="${clase}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${trazo}</svg>`
}

const iconoLapiz = svg('<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>')
const iconoGuardar = svg(
  '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
  'h-4 w-4',
)

const info = ref<InfoCE>({ ...INFO_CE_VACIA })
const borrador = ref<InfoCE>({ ...INFO_CE_VACIA })
const editando = ref(false)

onMounted(async () => {
  /* Sin llamadas de más: si ya se leyó en esta recarga, se usa la caché */
  const guardada = infoCEGuardada()
  if (guardada) {
    info.value = { ...guardada }
    return
  }
  if (!sheetConfigurado) return
  ui.iniciarCarga('Cargando información del centro…')
  try {
    info.value = await leerInfoCE()
  } catch (e) {
    ui.notificar('error', `No se pudo leer la información del centro: ${(e as Error).message}`)
  } finally {
    ui.terminarCarga()
  }
})

function empezarEdicion() {
  borrador.value = { ...info.value }
  editando.value = true
}

/* Cancelar descarta los cambios hechos en la tarjeta */
function cancelarEdicion() {
  editando.value = false
}

async function guardarCambios() {
  const limpio = { ...borrador.value }
  for (const clave of Object.keys(limpio) as (keyof InfoCE)[]) {
    limpio[clave] = limpio[clave].trim()
  }
  if (JSON.stringify(limpio) === JSON.stringify(info.value)) {
    editando.value = false
    ui.notificar('precaucion', 'No hay cambios que guardar.')
    return
  }
  ui.iniciarCarga('Guardando información…')
  try {
    await guardarInfoCE(limpio)
    info.value = limpio
    editando.value = false
    ui.notificar('exito', 'Información del centro guardada.')
  } catch (e) {
    ui.notificar('error', `No se pudo guardar: ${(e as Error).message}`)
  } finally {
    ui.terminarCarga()
  }
}
</script>

<template>
  <!-- Sin URL del Sheet configurada todavía -->
  <div
    v-if="!sheetConfigurado"
    class="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
  >
    Falta configurar la URL del Sheet de configuración
    <span class="font-semibold">VITE_SHEET_CONFIGURACION_URL</span> (en tu .env.local y en los
    Secrets de GitHub) para poder leer o guardar esta información.
  </div>

  <!-- Tarjeta de información -->
  <div v-else class="rounded-xl border border-slate-200 bg-white">
    <!-- Acciones: lápiz en lectura; Cancelar + Guardar en edición -->
    <div class="flex items-center justify-end gap-2 border-b border-slate-100 px-3 py-2">
      <button
        v-if="!editando"
        type="button"
        class="rounded-lg p-2 text-slate-500 transition-colors hover:bg-primario-suave hover:text-primario"
        aria-label="Editar información"
        title="Editar"
        @click="empezarEdicion"
      >
        <span class="block" v-html="iconoLapiz"></span>
      </button>
      <template v-else>
        <button
          type="button"
          class="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-100"
          @click="cancelarEdicion"
        >
          Cancelar
        </button>
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-lg bg-primario px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primario-oscuro"
          @click="guardarCambios"
        >
          <span class="block" v-html="iconoGuardar"></span>
          Guardar
        </button>
      </template>
    </div>

    <!-- Campos: en lectura muestran el valor (o blanco); en edición son inputs -->
    <dl class="grid gap-x-6 gap-y-5 p-4 sm:grid-cols-2 sm:p-5">
      <div v-for="campo in CAMPOS" :key="campo.clave" :class="campo.completo ? 'sm:col-span-2' : ''">
        <dt class="text-xs font-semibold text-slate-600">{{ campo.etiqueta }}</dt>
        <dd class="mt-1">
          <input
            v-if="editando"
            v-model="borrador[campo.clave]"
            type="text"
            autocomplete="off"
            class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-primario focus:ring-2 focus:ring-primario/20"
            :aria-label="campo.etiqueta"
          />
          <p v-else class="min-h-9 whitespace-pre-wrap break-words py-1.5 text-sm text-slate-900">
            {{ info[campo.clave] }}
          </p>
        </dd>
      </div>
    </dl>
  </div>
</template>