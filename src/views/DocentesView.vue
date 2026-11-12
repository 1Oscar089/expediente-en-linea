<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  actualizarDocente,
  cambiarEstadoDocente,
  crearDocente,
  diffDocente,
  eliminarDocente,
  ESTADO_ACTIVO,
  ESTADO_ARCHIVADO,
  guardarDocentesCache,
  leerDocentesCache,
  listarDocentes,
  mensajeError,
  mismosDocentes,
  type Docente,
  type DocenteCompleto,
} from '@/lib/docentes'
import {
  actualizarEnHoja,
  archivarEnHoja,
  borrarEnHoja,
  crearEnHoja,
  listarHoja,
  restaurarEnHoja,
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
/* Datos completos que vienen del Sheet (clave: correo en minúsculas) */
const hoja = ref<Map<string, FilaDocente>>(new Map())

const formulario = ref<null | { modo: 'agregar' } | { modo: 'editar'; original: Docente }>(null)
const docenteVer = ref<DocenteCompleto | null>(null)
type Accion = 'borrar' | 'archivar' | 'restaurar'
const confirmacion = ref<null | { accion: Accion; docente: Docente }>(null)

/* Se marca cuando una acción está escribiendo en Firebase: si el repaso
   silencioso del arranque termina mientras tanto, su resultado puede estar
   viejo y NO debe pisar lo que el usuario acaba de hacer. */
let escribiendoDuranteCarga = false

const normalizar = (correo: string) => correo.trim().toLowerCase()
const ordenar = (lista: Docente[]) =>
  [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

/* Registro completo = datos de pantalla (Firebase) + datos extra (Sheet); lo que falta, blanco.
   El rol se toma PRIMERO de Firebase (es lo que usa el login); si el docente
   viejo aún no lo tiene allí, se usa el del Sheet como respaldo. */
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
    rol: d.rol || extra?.rol || '',
    estado: d.estado || ESTADO_ACTIVO,
  }
}

/* ¿La fila del Sheet difiere del registro nuevo? (solo entonces se escribe) */
function filaDifiere(fila: FilaDocente, datos: DocenteCompleto): boolean {
  return (
    fila.nombre !== datos.nombre ||
    fila.dui !== datos.dui ||
    fila.nip !== datos.nip ||
    fila.telefono !== datos.telefono ||
    fila.fechaNacimiento !== datos.fechaNacimiento ||
    fila.anioServicio !== datos.anioServicio ||
    fila.especialidad !== datos.especialidad ||
    fila.rol !== datos.rol ||
    fila.estado !== datos.estado ||
    normalizar(fila.correo) !== normalizar(datos.correo)
  )
}

/* ── Carga inicial ──
   1. Se pinta de una vez lo que hay en caché (localStorage), sin llamadas.
   2. Después se pregunta al servidor en silencio: SOLO se actualiza si
      realmente cambió algo (si es igual, no se toca nada). */
onMounted(() => {
  const cache = leerDocentesCache()
  if (cache && cache.length) {
    docentes.value = ordenar(cache)
    void cargar(true)
  } else {
    void cargar(false)
  }
})

async function cargar(silenciosa = false) {
  if (!silenciosa) ui.iniciarCarga('Cargando docentes…')
  try {
    try {
      const lista = await listarDocentes()
      if (escribiendoDuranteCarga) {
        /* una acción estaba escribiendo a la vez: el resultado puede estar viejo */
        escribiendoDuranteCarga = false
      } else if (!mismosDocentes(lista, docentes.value)) {
        docentes.value = lista
        guardarDocentesCache(lista)
      }
    } catch (e) {
      ui.notificar('error', `No se pudieron leer los docentes de Firebase: ${mensajeError(e)}`)
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
      return
    }

    try {
      const filas = await listarHoja()
      hoja.value = new Map(filas.map((f) => [normalizar(f.correo), f] as [string, FilaDocente]))
      await copiarCambiosAlSheet()
    } catch (e) {
      ui.notificar('error', `No se pudo conectar con el Sheet: ${mensajeError(e)}`)
    }
  } finally {
    if (!silenciosa) ui.terminarCarga()
  }
}

/* Si Firebase tiene docentes que faltan o difieren en el Sheet, se envían SOLOS esos */
async function copiarCambiosAlSheet() {
  const filasSync: DocenteCompleto[] = []
  const renombres: { correoVieja: string; fila: DocenteCompleto }[] = []
  const usadas = new Set<string>()

  for (const d of docentes.value) {
    const clave = normalizar(d.correo)
    const fila = hoja.value.get(clave)
    if (!fila) {
      /* ¿es un cambio de correo de alguien que ya estaba en el Sheet?
         se busca la fila vieja por nombre + DUI para actualizarla en su sitio */
      const vieja = [...hoja.value.entries()].find(
        ([correo, f]) =>
          !usadas.has(correo) && correo !== clave && f.nombre === d.nombre && f.dui === d.dui,
      )
      if (vieja) {
        usadas.add(vieja[0])
        renombres.push({
          correoVieja: vieja[0],
          fila: {
            ...vieja[1],
            nombre: d.nombre,
            dui: d.dui,
            nip: d.nip,
            telefono: d.telefono,
            correo: d.correo,
            estado: d.estado,
          },
        })
        continue
      }
      filasSync.push(completo(d))
      continue
    }
    const difiere =
      fila.nombre !== d.nombre ||
      fila.dui !== d.dui ||
      fila.nip !== d.nip ||
      fila.telefono !== d.telefono ||
      fila.estado !== d.estado
    if (difiere) {
      /* se conservan los datos extra del Sheet (fecha, especialidad…) y se
         actualizan solo los campos que Firebase manda */
      filasSync.push({
        ...fila,
        nombre: d.nombre,
        dui: d.dui,
        nip: d.nip,
        telefono: d.telefono,
        correo: d.correo,
        estado: d.estado,
      })
    }
  }

  if (!filasSync.length && !renombres.length) return

  if (filasSync.length) await sincronizarHoja(filasSync)
  for (const r of renombres) await actualizarEnHoja(r.correoVieja, r.fila)

  for (const f of filasSync) hoja.value.set(normalizar(f.correo), f)
  for (const r of renombres) {
    hoja.value.delete(r.correoVieja)
    hoja.value.set(normalizar(r.fila.correo), r.fila)
  }

  const total = filasSync.length + renombres.length
  ui.notificar(
    'exito',
    `Se ${total === 1 ? 'sincronizó 1 docente' : `sincronizaron ${total} docentes`} con el Sheet automáticamente.`,
  )
}

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

/* Archivar cambia SOLO el estado (no borra de Firebase); si ya está archivado, se ofrece restaurar */
function pedirArchivar(d: Docente) {
  confirmacion.value = {
    accion: d.estado === ESTADO_ARCHIVADO ? 'restaurar' : 'archivar',
    docente: d,
  }
}

/* Textos del modal de confirmación según la acción */
const textosConfirmacion = computed(() => {
  if (!confirmacion.value) {
    return { titulo: '', texto: '', boton: '', tono: 'amarillo' as 'amarillo' | 'rojo' }
  }
  const nombre = confirmacion.value.docente.nombre || 'este docente'
  if (confirmacion.value.accion === 'borrar') {
    return {
      titulo: 'Borrar docente',
      texto: `¿Seguro que quieres borrar a ${nombre}? Se eliminará de Firebase y del Sheet y no se puede deshacer.`,
      boton: 'Borrar',
      tono: 'rojo' as const,
    }
  }
  if (confirmacion.value.accion === 'archivar') {
    return {
      titulo: 'Archivar docente',
      texto: `¿Archivar a ${nombre}? No se borra de Firebase: solo cambia su estado a “archivado” (también en el Sheet).`,
      boton: 'Archivar',
      tono: 'amarillo' as const,
    }
  }
  return {
    titulo: 'Restaurar docente',
    texto: `¿Restaurar a ${nombre}? Volverá a estado “activo” en Firebase y en el Sheet.`,
    boton: 'Restaurar',
    tono: 'amarillo' as const,
  }
})

/* ── Guardar (agregar o editar): solo se escribe lo que cambió ── */
async function guardar(datos: DocenteCompleto, correoOriginal?: string) {
  const editando = formulario.value?.modo === 'editar'
  const original = formulario.value?.modo === 'editar' ? formulario.value.original : null

  /* Si el correo ya existe, el modal SE QUEDA ABIERTO con lo escrito */
  const objetivo = normalizar(datos.correo)
  const duplicado = docentes.value.some(
    (d) => normalizar(d.correo) === objetivo && d.id !== original?.id,
  )
  if (duplicado) {
    ui.notificar('precaucion', 'Ya existe un docente con ese correo.')
    return
  }

  formulario.value = null

  if (editando && original) {
    const cambios = diffDocente(original, datos)
    const claveAnterior = normalizar(correoOriginal ?? original.correo)
    const filaAnterior = hoja.value.get(claveAnterior)
    const cambiaHoja = !filaAnterior || filaDifiere(filaAnterior, datos)
    if (!Object.keys(cambios).length && !cambiaHoja) {
      ui.notificar('precaucion', 'No hay cambios que guardar.')
      return
    }

    ui.iniciarCarga('Actualizando docente…')
    try {
      let falloSheet = ''
      let agregadoAlSheet = false
      escribiendoDuranteCarga = true
      if (Object.keys(cambios).length) await actualizarDocente(original.id, cambios)
      if (cambiaHoja) {
        try {
          /* Si la fila NO existe en el Sheet se CREA con todos sus datos
             (p. ej. docentes viejos que nunca llegaron al Sheet, o cuando la
             conexión falló al cargar la vista); si existe, se actualiza. */
          if (filaAnterior) {
            await actualizarEnHoja(claveAnterior, datos)
          } else {
            await crearEnHoja(datos)
            agregadoAlSheet = true
          }
        } catch (e) {
          falloSheet = mensajeError(e)
        }
      }
      /* Cambio local mínimo: sin volver a leer Firebase ni el Sheet */
      const actualizado: Docente = {
        id: original.id,
        nombre: datos.nombre,
        dui: datos.dui,
        nip: datos.nip,
        telefono: datos.telefono,
        correo: objetivo,
        rol: datos.rol,
        estado: original.estado,
      }
      docentes.value = ordenar(docentes.value.map((d) => (d.id === original.id ? actualizado : d)))
      hoja.value.delete(claveAnterior)
      hoja.value.set(objetivo, datos)
      guardarDocentesCache(docentes.value)
      ui.notificar(
        falloSheet ? 'precaucion' : 'exito',
        falloSheet
          ? `Docente actualizado en Firebase, pero falló el Sheet: ${falloSheet}`
          : agregadoAlSheet
            ? 'Docente actualizado en Firebase y agregado al Sheet (allí no tenía fila).'
            : 'Docente actualizado.',
      )
    } catch (e) {
      ui.notificar('error', mensajeError(e))
    } finally {
      ui.terminarCarga()
    }
    return
  }

  ui.iniciarCarga('Agregando docente…')
  try {
    let falloSheet = ''
    escribiendoDuranteCarga = true
    const id = await crearDocente(datos)
    const nuevo: Docente = {
      id,
      nombre: datos.nombre,
      dui: datos.dui,
      nip: datos.nip,
      telefono: datos.telefono,
      correo: objetivo,
      rol: datos.rol,
      estado: ESTADO_ACTIVO,
    }
    docentes.value = ordenar([...docentes.value, nuevo])
    hoja.value.set(objetivo, datos)
    guardarDocentesCache(docentes.value)
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
  } catch (e) {
    ui.notificar('error', mensajeError(e))
  } finally {
    ui.terminarCarga()
  }
}

/* ── Borrar / archivar / restaurar (desde el modal de confirmación) ── */
async function confirmarAccion() {
  if (!confirmacion.value) return
  const { accion, docente } = confirmacion.value
  confirmacion.value = null

  const textoCarga: Record<Accion, string> = {
    borrar: 'Eliminando docente…',
    archivar: 'Archivando docente…',
    restaurar: 'Restaurando docente…',
  }
  ui.iniciarCarga(textoCarga[accion])
  try {
    if (accion === 'borrar') {
      let falloSheet = ''
      escribiendoDuranteCarga = true
      await eliminarDocente(docente.id)
      try {
        await borrarEnHoja(docente.correo)
      } catch (e) {
        falloSheet = mensajeError(e)
      }
      /* Cambio local mínimo */
      docentes.value = docentes.value.filter((d) => d.id !== docente.id)
      hoja.value.delete(normalizar(docente.correo))
      guardarDocentesCache(docentes.value)
      ui.notificar(
        falloSheet ? 'precaucion' : 'exito',
        falloSheet
          ? `Docente eliminado de Firebase, pero falló el Sheet: ${falloSheet}`
          : 'Docente eliminado.',
      )
      return
    }

    /* Archivar / restaurar: el documento NO se borra de Firebase, solo cambia su estado */
    const nuevoEstado = accion === 'archivar' ? ESTADO_ARCHIVADO : ESTADO_ACTIVO
    const clave = normalizar(docente.correo)
    const fila = hoja.value.get(clave)
    let falloSheet = ''

    escribiendoDuranteCarga = true
    /* Firebase: solo si su estado actual es distinto */
    if (docente.estado !== nuevoEstado) {
      await cambiarEstadoDocente(docente.id, nuevoEstado)
    }
    /* Sheet: si su fila NO existe, se CREA con el estado nuevo; si existe y
       difiere, se archiva/restaura SOLO la fila tocada */
    if (!fila) {
      try {
        await crearEnHoja(completo({ ...docente, estado: nuevoEstado }))
      } catch (e) {
        falloSheet = mensajeError(e)
      }
    } else if (fila.estado !== nuevoEstado) {
      try {
        await (nuevoEstado === ESTADO_ARCHIVADO ? archivarEnHoja(clave) : restaurarEnHoja(clave))
      } catch (e) {
        falloSheet = mensajeError(e)
      }
    }

    /* Cambio local mínimo */
    docentes.value = docentes.value.map((d) =>
      d.id === docente.id ? { ...d, estado: nuevoEstado } : d,
    )
    hoja.value.set(
      clave,
      fila ? { ...fila, estado: nuevoEstado } : completo({ ...docente, estado: nuevoEstado }),
    )
    guardarDocentesCache(docentes.value)
    ui.notificar(
      falloSheet ? 'precaucion' : 'exito',
      falloSheet
        ? `Estado cambiado en Firebase, pero falló el Sheet: ${falloSheet}`
        : accion === 'archivar'
          ? 'Docente archivado: sigue en Firebase, solo cambió su estado.'
          : 'Docente restaurado.',
    )
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

    <!-- Tabla: Nombre, DUI, NIP, Telefono, Acciones -->
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
            <td class="px-3 py-2.5">
              <span class="flex flex-wrap items-center gap-2">
                <span :class="d.estado === ESTADO_ARCHIVADO ? 'font-medium text-slate-400' : 'font-medium text-slate-800'">
                  {{ d.nombre }}
                </span>
                <span
                  v-if="d.estado === ESTADO_ARCHIVADO"
                  class="inline-flex items-center rounded-full bg-archivar/15 px-2 py-0.5 text-xs font-semibold text-archivar"
                >
                  Archivado
                </span>
              </span>
            </td>
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
                  :title="d.estado === ESTADO_ARCHIVADO ? 'Restaurar' : 'Archivar'"
                  :aria-label="d.estado === ESTADO_ARCHIVADO ? 'Restaurar docente' : 'Archivar docente'"
                  class="rounded-lg p-2 text-archivar transition-colors hover:bg-amber-50"
                  @click="pedirArchivar(d)"
                >
                  <!-- Archivar: caja con bandeja / Restaurar: caja con flecha hacia arriba -->
                  <svg
                    v-if="d.estado !== ESTADO_ARCHIVADO"
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
      :titulo="textosConfirmacion.titulo"
      :texto="textosConfirmacion.texto"
      :confirmar-texto="textosConfirmacion.boton"
      :tono="textosConfirmacion.tono"
      @confirmar="confirmarAccion"
      @cerrar="confirmacion = null"
    />
  </div>
</template>
