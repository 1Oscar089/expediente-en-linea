<script setup lang="ts">
import { onMounted, ref } from 'vue'

import {
  actualizarDocente,
  crearDocente,
  eliminarDocente,
  listarDocentes,
  mensajeError,
  type Docente,
  type DocenteCompleto,
} from '@/lib/docentes'
import {
  actualizarEnHoja,
  archivarEnHoja,
  borrarEnHoja,
  crearEnHoja,
  listarHoja,
  sheetConfigurado,
  sincronizarHoja,
  type FilaDocente,
} from '@/lib/sheetDocentes'
import { useUiStore } from '@/stores/ui'

import ModalFormularioDocente from '@/components/docentes/ModalFormularioDocente.vue'
import ModalVerDocente from '@/components/docentes/ModalVerDocente.vue'
import ModalConfirmacion from '@/components/ui/ModalConfirmacion.vue'

const ui = useUiStore()

/* ── Estado ── */
const docentes = ref<Docente[]>([])
const hoja = ref<Map<string, FilaDocente>>(new Map()) /* clave: correo en minúsculas */

const formulario = ref<null | { modo: 'agregar' } | { modo: 'editar'; original: Docente }>(null)
const docenteVer = ref<DocenteCompleto | null>(null)
const confirmacion = ref<null | {
  accion: 'borrar' | 'archivar'
  docente: Docente
}>(null)

const normalizar = (correo: string) => correo.trim().toLowerCase()

/* Registro completo = datos de pantalla (Firebase) + datos extra (Sheet); lo que falta, blanco */
function completo(d: Docente): DocenteCompleto {
  const extra = hoja.value.get(normalizar(d.correo))
  return {
    nombre: d.nombre,
    dui: d.dui,
    nip: d.nip,
    telefono: d.telefono,
    correo: d.correo,
    fechaNacimiento: extra?.fechaNacimiento ?? '',
    anioServicio: extra?.anioServicio ?? '',
    especialidad: extra?.especialidad ?? '',
    rol: extra?.rol ?? '',
    estado: extra?.estado ?? 'activo',
  }
}

/* ── Carga inicial + copia automática de Firebase al Sheet ── */
async function cargar(silenciosa = false) {
  ui.iniciarCarga('Cargando docentes…')
  try {
    docentes.value = await listarDocentes()
  } catch (e) {
    ui.notificar('error', `No se pudieron leer los docentes de Firebase: ${mensajeError(e)}`)
    ui.terminarCarga()
    return
  }

  if (!sheetConfigurado) {
    hoja.value = new Map()
    if (!silenciosa) {
      ui.notificar(
        'precaucion',
        'El Sheet de docentes no está configurado (VITE_SHEET_DOCENTES_URL): los cambios solo se guardarán en Firebase.',
      )
    }
    ui.terminarCarga()
    return
  }

  try {
    const filas = await listarHoja()
    hoja.value = new Map(
      filas.map((f) => [normalizar(f.correo), f] as [string, FilaDocente]),
    )
    await copiarFaltantesAlSheet()
  } catch (e) {
    ui.notificar('error', `No se pudo conectar con el Sheet: ${mensajeError(e)}`)
  }
  ui.terminarCarga()
}

/* Si hay docentes en Firebase que no están en el Sheet, se copian solos */
async function copiarFaltantesAlSheet() {
  const faltantes = docentes.value
    .filter((d) => !hoja.value.has(normalizar(d.correo)))
    .map(completo)
  if (!faltantes.length) return

  await sincronizarHoja(faltantes)
  for (const f of faltantes) hoja.value.set(normalizar(f.correo), f)
  ui.notificar(
    'exito',
    `Se ${faltantes.length === 1 ? 'copió 1 docente' : `copiaron ${faltantes.length} docentes`} de Firebase al Sheet automáticamente.`,
  )
}

onMounted(() => {
  void cargar()
})

/* ── Acciones de la tabla ── */
function abrirAgregar() {
  formulario.value = { modo: 'agregar' }
}

function abrirEditar(d: Docente) {
  formulario.value = { modo: 'editar', original: d }
}

function abrirVer(d: Docente) {
  docenteVer.value = completo(d)
}

function pedirBorrar(d: Docente) {
  confirmacion.value = { accion: 'borrar', docente: d }
}

function pedirArchivar(d: Docente) {
  confirmacion.value = { accion: 'archivar', docente: d }
}

/* ── Guardar (agregar o editar) ── */
async function guardar(datos: DocenteCompleto, correoOriginal?: string) {
  const editando = formulario.value?.modo === 'editar'
  const original = formulario.value?.modo === 'editar' ? formulario.value.original : null

  /* Si el correo ya existe, el modal SE QUEDA ABIERTO con lo escrito */
  const objetivo = normalizar(datos.correo)
  const duplicado = docentes.value.some(
    (d) => normalizar(d.correo) === objetivo && d.correo !== correoOriginal,
  )
  if (duplicado) {
    ui.notificar('precaucion', 'Ya existe un docente con ese correo.')
    return
  }

  formulario.value = null

  ui.iniciarCarga(editando ? 'Actualizando docente…' : 'Agregando docente…')
  try {
    let falloSheet = ''
    if (editando && original) {
      await actualizarDocente(original.id, datos)
      try {
        await actualizarEnHoja(correoOriginal ?? original.correo, datos)
      } catch (e) {
        falloSheet = mensajeError(e)
      }
      ui.notificar(
        falloSheet ? 'precaucion' : 'exito',
        falloSheet
          ? `Docente actualizado en Firebase, pero falló el Sheet: ${falloSheet}`
          : 'Docente actualizado.',
      )
    } else {
      await crearDocente(datos)
      try {
        await crearEnHoja(datos)
      } catch (e) {
        falloSheet = mensajeError(e)
      }
      ui.notificar(
        falloSheet ? 'precaucion' : 'exito',
        falloSheet
          ? `Docente agregado a Firebase, pero falló el Sheet: ${falloSheet}`
          : 'Docente agregado.',
      )
    }
    await cargar(true)
  } catch (e) {
    ui.notificar('error', mensajeError(e))
  } finally {
    ui.terminarCarga()
  }
}

/* ── Borrar / archivar (desde el modal de confirmación) ── */
async function confirmarAccion() {
  if (!confirmacion.value) return
  const { accion, docente } = confirmacion.value
  confirmacion.value = null

  ui.iniciarCarga(accion === 'borrar' ? 'Eliminando docente…' : 'Archivando docente…')
  try {
    await eliminarDocente(docente.id)
    let falloSheet = ''
    try {
      if (accion === 'borrar') await borrarEnHoja(docente.correo)
      else await archivarEnHoja(docente.correo)
    } catch (e) {
      falloSheet = mensajeError(e)
    }
    ui.notificar(
      falloSheet ? 'precaucion' : 'exito',
      falloSheet
        ? `${accion === 'borrar' ? 'Eliminado' : 'Archivado'} en Firebase, pero falló el Sheet: ${falloSheet}`
        : accion === 'borrar'
          ? 'Docente eliminado.'
          : 'Docente archivado.',
    )
    await cargar(true)
  } catch (e) {
    ui.notificar('error', mensajeError(e))
  } finally {
    ui.terminarCarga()
  }
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- Botón Agregar (esquina superior derecha, como el boceto) -->
    <div class="flex justify-end">
      <button
        type="button"
        class="flex items-center gap-2 rounded-lg bg-primario px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primario-oscuro"
        @click="abrirAgregar"
      >
        <svg
          class="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        Agregar
      </button>
    </div>

    <!-- Tabla: Nombre, DUI, NIP, Telefono, Acciones (el boceto, con Telefono) -->
    <div class="overflow-x-auto rounded-lg border border-slate-200">
      <table class="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead>
          <tr class="bg-slate-50 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <th class="px-3 py-2.5">Nombre</th>
            <th class="px-3 py-2.5">DUI</th>
            <th class="px-3 py-2.5">NIP</th>
            <th class="px-3 py-2.5">Telefono</th>
            <th class="px-3 py-2.5 text-center">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!docentes.length">
            <td colspan="5" class="px-3 py-10 text-center text-sm text-slate-400">
              No hay docentes registrados. Usa “Agregar” para crear el primero.
            </td>
          </tr>
          <tr
            v-for="d in docentes"
            :key="d.id"
            class="border-t border-slate-100 transition-colors hover:bg-slate-50/70"
          >
            <td class="px-3 py-2.5 font-medium text-slate-800">{{ d.nombre }}</td>
            <td class="px-3 py-2.5 text-slate-600">{{ d.dui }}</td>
            <td class="px-3 py-2.5 text-slate-600">{{ d.nip }}</td>
            <td class="px-3 py-2.5 text-slate-600">{{ d.telefono }}</td>
            <td class="px-3 py-2.5">
              <!-- Acciones como iconos SVG de solo trazo -->
              <div class="flex items-center justify-center gap-1">
                <button
                  type="button"
                  title="Ver"
                  aria-label="Ver docente"
                  class="rounded-lg p-2 text-slate-500 transition-colors hover:bg-primario-suave hover:text-primario"
                  @click="abrirVer(d)"
                >
                  <svg
                    class="h-4.5 w-4.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </button>
                <button
                  type="button"
                  title="Editar"
                  aria-label="Editar docente"
                  class="rounded-lg p-2 text-editar transition-colors hover:bg-emerald-50"
                  @click="abrirEditar(d)"
                >
                  <svg
                    class="h-4.5 w-4.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
                <button
                  type="button"
                  title="Archivar"
                  aria-label="Archivar docente"
                  class="rounded-lg p-2 text-archivar transition-colors hover:bg-amber-50"
                  @click="pedirArchivar(d)"
                >
                  <svg
                    class="h-4.5 w-4.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="2" y="3" width="20" height="5" rx="1" />
                    <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
                    <path d="M10 12h4" />
                  </svg>
                </button>
                <button
                  type="button"
                  title="Borrar"
                  aria-label="Borrar docente"
                  class="rounded-lg p-2 text-eliminar transition-colors hover:bg-red-50"
                  @click="pedirBorrar(d)"
                >
                  <svg
                    class="h-4.5 w-4.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M3 6h18" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <path d="M10 11v6" />
                    <path d="M14 11v6" />
                  </svg>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modales (nunca alerts) -->
    <ModalFormularioDocente
      v-if="formulario"
      :modo="formulario.modo"
      :inicial="formulario.modo === 'editar' ? completo(formulario.original) : undefined"
      @guardar="guardar"
      @cerrar="formulario = null"
    />
    <ModalVerDocente v-if="docenteVer" :docente="docenteVer" @cerrar="docenteVer = null" />
    <ModalConfirmacion
      v-if="confirmacion"
      :titulo="confirmacion.accion === 'borrar' ? 'Borrar docente' : 'Archivar docente'"
      :texto="
        confirmacion.accion === 'borrar'
          ? `¿Seguro que quieres borrar a ${confirmacion.docente.nombre || 'este docente'}? Se eliminará de Firebase y del Sheet y no se puede deshacer.`
          : `¿Archivar a ${confirmacion.docente.nombre || 'este docente'}? Será retirado de Firebase y quedará como “archivado” en el Sheet.`
      "
      :confirmar-texto="confirmacion.accion === 'borrar' ? 'Borrar' : 'Archivar'"
      :tono="confirmacion.accion === 'borrar' ? 'rojo' : 'amarillo'"
      @confirmar="confirmarAccion"
      @cerrar="confirmacion = null"
    />
  </div>
</template>