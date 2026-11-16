<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  cambiarEstadoEstudiante,
  compararNomina,
  eliminarEstudiante,
  ESTADO_ACTIVO,
  ESTADO_ARCHIVADO,
  GRADOS,
  listarEstudiantes,
  mensajeError as mensajeErrorEstudiantes,
  type FilaEstudiante,
} from '@/lib/estudiantes'
import { gradosDeDocente, mensajeError as mensajeErrorDocentes } from '@/lib/docentes'
import {
  archivarFilaEstudiante,
  borrarFilaEstudiante,
  restaurarFilaEstudiante,
  sheetEstudiantesConfigurado,
} from '@/lib/sheetEstudiantes'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'

import ModalVerEstudiante from '@/components/estudiantes/ModalVerEstudiante.vue'
import ModalConfirmacion from '@/components/ui/ModalConfirmacion.vue'

const ui = useUiStore()
const auth = useAuthStore()

/* ── Estado ── */
const estudiantes = ref<FilaEstudiante[]>([])
/* Grados a cargo del docente en sesión (campo 'gradosACargo' de su
   documento). Sin grados asignados ([]): se muestran TODOS los grados. */
const gradosDocente = ref<string[]>([])
const filtraDocente = ref(false)

const estudianteVer = ref<FilaEstudiante | null>(null)
const verArchivados = ref(false)
type Accion = 'borrar' | 'archivar' | 'restaurar'
const confirmacion = ref<null | { accion: Accion; estudiante: FilaEstudiante }>(null)

/* El docente SOLO ve la nómina; admin y director además archivan y eliminan */
const esDireccion = computed(() => {
  const rol = auth.rolEfectivo
  return rol === 'admin' || rol === 'director'
})

const archivados = computed(() => estudiantes.value.filter((e) => e.estado === ESTADO_ARCHIVADO))

/* Nombre de la bolsa de la tabla: el nombre EXACTO del catálogo si el grado
   se reconoce (el TEXTO del grado manda, sin importar mayúsculas ni tildes,
   igual que las cifras de Inicio); si no, el texto tal cual llegó; y
   'Sin grado' si viene vacío. */
function nombreDeBolsa(e: FilaEstudiante): string {
  if (e.gradoId !== null) {
    const canonico = GRADOS.find((g) => g.id === e.gradoId)?.nombre
    if (canonico) return canonico
  }
  return e.grado.trim() || 'Sin grado'
}

/* Posición del grupo en el catálogo; los grados no reconocidos van al final */
function ordenDeBolsa(nombre: string): number {
  const i = GRADOS.findIndex((g) => g.nombre === nombre)
  return i === -1 ? GRADOS.length : i
}

/* ── Una tabla POR GRADO ──
   docente: SOLO sus grados a cargo (si no tiene ninguno asignado, todos).
   dirección: todos; los archivados solo si se pide verlos. */
const grupos = computed(() => {
  let fuente = estudiantes.value
  if (!esDireccion.value || !verArchivados.value) {
    fuente = fuente.filter((e) => e.estado === ESTADO_ACTIVO)
  }
  if (filtraDocente.value) {
    fuente = fuente.filter(
      (e) => e.gradoId !== null && gradosDocente.value.includes(nombreDeBolsa(e)),
    )
  }
  const bolsas = new Map<string, FilaEstudiante[]>()
  for (const e of fuente) {
    const clave = nombreDeBolsa(e)
    const bolsa = bolsas.get(clave)
    if (bolsa) bolsa.push(e)
    else bolsas.set(clave, [e])
  }
  return [...bolsas.entries()]
    .map(([nombre, filas]) => ({ nombre, filas: [...filas].sort(compararNomina) }))
    .sort(
      (a, b) =>
        ordenDeBolsa(a.nombre) - ordenDeBolsa(b.nombre) || a.nombre.localeCompare(b.nombre, 'es'),
    )
})

const total = computed(() => grupos.value.reduce((n, g) => n + g.filas.length, 0))

const mensajeVacio = computed(() => {
  if (filtraDocente.value) {
    return 'No hay estudiantes matriculados en tus grados a cargo.'
  }
  return verArchivados.value
    ? 'No hay estudiantes matriculados.'
    : 'No hay estudiantes matriculados todavía.'
})

/* ── Carga ── */
onMounted(() => {
  void cargar()
})

async function cargar() {
  ui.iniciarCarga('Cargando nómina…')
  try {
    estudiantes.value = await listarEstudiantes()
  } catch (e) {
    ui.notificar('error', `No se pudo leer la nómina de Firebase: ${mensajeErrorEstudiantes(e)}`)
    return
  } finally {
    ui.terminarCarga()
  }

  /* Grados a cargo del docente (leídos SIEMPRE de Firebase, no del caché) */
  if (auth.rolEfectivo === 'docente') {
    ui.iniciarCarga('Buscando tus grados a cargo…')
    try {
      const grados = await gradosDeDocente(auth.perfil?.correo ?? '')
      if (grados.length) {
        gradosDocente.value = grados
        filtraDocente.value = true
      }
    } catch (e) {
      ui.notificar('error', `No se pudieron leer tus grados a cargo: ${mensajeErrorDocentes(e)}`)
    } finally {
      ui.terminarCarga()
    }
  }

  if (esDireccion.value && !sheetEstudiantesConfigurado) {
    ui.notificar(
      'precaucion',
      'El Sheet de estudiantes no está configurado (VITE_SHEET_ESTUDIANTES_URL): archivar y eliminar solo se aplicarán en Firebase.',
    )
  }
}

/* ── Acciones de la tabla ── */
function abrirVer(e: FilaEstudiante) {
  estudianteVer.value = e
}

/* Archivar cambia SOLO el estado (no borra de Firebase); si ya está
   archivado, se ofrece restaurar (igual que docentes) */
function pedirArchivar(e: FilaEstudiante) {
  confirmacion.value = {
    accion: e.estado === ESTADO_ARCHIVADO ? 'restaurar' : 'archivar',
    estudiante: e,
  }
}

function pedirBorrar(e: FilaEstudiante) {
  confirmacion.value = { accion: 'borrar', estudiante: e }
}

/* Textos del modal de confirmación según la acción */
const textosConfirmacion = computed(() => {
  if (!confirmacion.value) {
    return { titulo: '', texto: '', boton: '', tono: 'amarillo' as 'amarillo' | 'rojo' }
  }
  const nombre = confirmacion.value.estudiante.nombre || 'este estudiante'
  if (confirmacion.value.accion === 'borrar') {
    return {
      titulo: 'Eliminar estudiante',
      texto: `¿Seguro que quieres eliminar a ${nombre}? Se eliminará de Firebase y del Sheet y no se puede deshacer.`,
      boton: 'Eliminar',
      tono: 'rojo' as const,
    }
  }
  if (confirmacion.value.accion === 'archivar') {
    return {
      titulo: 'Archivar estudiante',
      texto: `¿Archivar a ${nombre}? No se borra de Firebase: solo cambia su estado a “archivado” (también en el Sheet) y deja de aparecer en la nómina.`,
      boton: 'Archivar',
      tono: 'amarillo' as const,
    }
  }
  return {
    titulo: 'Restaurar estudiante',
    texto: `¿Restaurar a ${nombre}? Volverá a estado “activo” en Firebase y en el Sheet.`,
    boton: 'Restaurar',
    tono: 'amarillo' as const,
  }
})

async function confirmarAccion() {
  if (!confirmacion.value) return
  const { accion, estudiante } = confirmacion.value
  confirmacion.value = null

  const nuevoEstado = accion === 'archivar' ? ESTADO_ARCHIVADO : ESTADO_ACTIVO
  ui.iniciarCarga(
    accion === 'borrar'
      ? 'Eliminando estudiante…'
      : accion === 'archivar'
        ? 'Archivando estudiante…'
        : 'Restaurando estudiante…',
  )
  try {
    /* 1) Firebase: la fuente de verdad de la pantalla */
    if (accion === 'borrar') {
      await eliminarEstudiante(estudiante.id)
    } else if (estudiante.estado !== nuevoEstado) {
      await cambiarEstadoEstudiante(estudiante.id, nuevoEstado)
    }

    /* 2) Sheet de respaldo: si falla, el cambio ya quedó en Firebase y se avisa */
    let falloSheet = ''
    if (sheetEstudiantesConfigurado) {
      try {
        if (accion === 'borrar') await borrarFilaEstudiante(estudiante.nombre, estudiante.nie)
        else if (accion === 'archivar') await archivarFilaEstudiante(estudiante.nombre, estudiante.nie)
        else await restaurarFilaEstudiante(estudiante.nombre, estudiante.nie)
      } catch (e) {
        falloSheet = (e as Error)?.message || 'ocurrió un error inesperado.'
      }
    }

    /* Cambio local mínimo, sin volver a leer Firebase */
    if (accion === 'borrar') {
      estudiantes.value = estudiantes.value.filter((x) => x.id !== estudiante.id)
    } else {
      estudiantes.value = estudiantes.value.map((x) =>
        x.id === estudiante.id ? { ...x, estado: nuevoEstado } : x,
      )
    }

    ui.notificar(
      falloSheet ? 'precaucion' : 'exito',
      falloSheet
        ? `El cambio quedó en Firebase, pero falló el Sheet: ${falloSheet}`
        : accion === 'borrar'
          ? 'Estudiante eliminado.'
          : accion === 'archivar'
            ? 'Estudiante archivado: sigue en Firebase, solo cambió su estado.'
            : 'Estudiante restaurado.',
    )
  } catch (e) {
    ui.notificar('error', mensajeErrorEstudiantes(e))
  } finally {
    ui.terminarCarga()
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Resumen + grados a cargo del docente + ver archivados (solo dirección) -->
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-sm text-slate-500">
        {{ total }} {{ total === 1 ? 'estudiante matriculado' : 'estudiantes matriculados' }}
        <template v-if="filtraDocente">
          · tus grados a cargo:
          <span class="font-semibold text-slate-700">{{ gradosDocente.join(', ') }}</span>
        </template>
      </p>
      <button
        v-if="esDireccion && archivados.length"
        type="button"
        class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
        @click="verArchivados = !verArchivados"
      >
        {{ verArchivados ? 'Ocultar archivados' : `Ver archivados (${archivados.length})` }}
      </button>
    </div>

    <!-- Una tabla por grado, en el orden del catálogo -->
    <section v-for="g in grupos" :key="g.nombre" class="flex flex-col gap-2">
      <h3 class="text-sm font-bold text-slate-700">
        {{ g.nombre }}
        <span class="font-medium text-slate-400">({{ g.filas.length }})</span>
      </h3>
      <div class="overflow-x-auto rounded-lg border border-slate-200">
        <!-- table-fixed + LOS MISMOS anchos en TODAS las tablas (colgroup):
             cada grado reparte las columnas exactamente igual, así que NIE,
             teléfono, DUI y acciones quedan alineados en la misma posición
             vertical de un grado a otro (antes cada tabla se acomodaba a su
             propio contenido y los datos quedaban a distintas alturas). -->
        <table class="w-full min-w-[840px] table-fixed border-collapse text-left text-sm">
          <colgroup>
            <col class="w-[270px]" />
            <col class="w-[120px]" />
            <col class="w-[180px]" />
            <col class="w-[130px]" />
            <col class="w-[140px]" />
          </colgroup>
          <thead>
            <tr class="bg-slate-50 text-xs font-semibold tracking-wide text-slate-500 uppercase">
              <th class="px-3 py-2.5">Nombre</th>
              <th class="px-3 py-2.5">NIE</th>
              <th class="px-3 py-2.5">Telefono del responsable</th>
              <th class="px-3 py-2.5">DUI</th>
              <th class="px-3 py-2.5 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="e in g.filas"
              :key="e.id"
              class="border-t border-slate-100 transition-colors hover:bg-slate-50/70"
            >
              <td class="px-3 py-2.5">
                <span class="flex flex-wrap items-center gap-2">
                  <span
                    :class="
                      e.estado === ESTADO_ARCHIVADO
                        ? 'font-medium text-slate-400'
                        : 'font-medium text-slate-800'
                    "
                  >
                    {{ e.nombre }}
                  </span>
                  <span
                    v-if="e.estado === ESTADO_ARCHIVADO"
                    class="inline-flex items-center rounded-full bg-archivar/15 px-2 py-0.5 text-xs font-semibold text-archivar"
                  >
                    Archivado
                  </span>
                </span>
              </td>
              <td class="whitespace-nowrap px-3 py-2.5 text-slate-600">{{ e.nie || '—' }}</td>
              <td class="whitespace-nowrap px-3 py-2.5 text-slate-600">{{ e.telefono || '—' }}</td>
              <td class="whitespace-nowrap px-3 py-2.5 text-slate-600">{{ e.dui || '—' }}</td>
              <td class="px-3 py-2.5">
                <!-- Acciones como iconos SVG de solo trazo -->
                <div class="flex items-center justify-center gap-1">
                  <!-- Ver: TODOS los roles -->
                  <button
                    type="button"
                    title="Ver"
                    aria-label="Ver estudiante"
                    class="rounded-lg p-2 text-slate-500 transition-colors hover:bg-primario-suave hover:text-primario"
                    @click="abrirVer(e)"
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
                  <!-- Archivar/Restaurar y Eliminar: SOLO admin y director -->
                  <template v-if="esDireccion">
                    <button
                      type="button"
                      :title="e.estado === ESTADO_ARCHIVADO ? 'Restaurar' : 'Archivar'"
                      :aria-label="
                        e.estado === ESTADO_ARCHIVADO ? 'Restaurar estudiante' : 'Archivar estudiante'
                      "
                      class="rounded-lg p-2 text-archivar transition-colors hover:bg-amber-50"
                      @click="pedirArchivar(e)"
                    >
                      <!-- Archivar: caja con bandeja / Restaurar: caja con flecha hacia arriba -->
                      <svg
                        v-if="e.estado !== ESTADO_ARCHIVADO"
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
                      <svg
                        v-else
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
                        <path d="M12 17V9" />
                        <path d="m8 12 4-4 4 4" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      title="Eliminar"
                      aria-label="Eliminar estudiante"
                      class="rounded-lg p-2 text-eliminar transition-colors hover:bg-red-50"
                      @click="pedirBorrar(e)"
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
                  </template>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Sin estudiantes -->
    <p
      v-if="!grupos.length"
      class="rounded-lg border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-400"
    >
      {{ mensajeVacio }}
    </p>

    <!-- Modales (nunca alerts) -->
    <ModalVerEstudiante
      v-if="estudianteVer"
      :estudiante="estudianteVer"
      @cerrar="estudianteVer = null"
    />
    <ModalConfirmacion
      v-if="confirmacion"
      :titulo="textosConfirmacion.titulo"
      :texto="textosConfirmacion.texto"
      :confirmar-texto="textosConfirmacion.boton"
      :tono="textosConfirmacion.tono"
      @confirmar="confirmarAccion"
      @cerrar="confirmacion = null"
    />
  </div>
</template>
