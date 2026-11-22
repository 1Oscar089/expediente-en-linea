<script setup lang="ts">
// ─────────────────────────────────────────────────────────────
// ESTUDIANTES › ACTUALIZAR — flujo NUEVO (regla del usuario):
//   1. PRIMERO la búsqueda: buscador en tiempo real desde 3 letras sobre
//      LAS DOS hojas del libro (primera infancia y basica) a la vez.
//   2. El estudiante elegido se GUARDA EN LOCAL (localStorage por usuario)
//      y se ANALIZA SU GRADO: de Primero hacia abajo es Primera Infancia y
//      de Segundo en adelante es Educación Básica (el MISMO corte que usa
//      Matricular al repartir hojas). Con la etapa detectada se muestran
//      LAS PARTES a modificar. Si el grado y la hoja donde vive la fila
//      contaran historias distintas, manda la hoja (con aviso), porque las
//      columnas a escribir son las de DONDE vive la fila.
//   3. Al GUARDAR una parte se vuelve a la lista de partes con el MISMO
//      estudiante seleccionado (la fila actualizada queda en el local).
//      Para usar otro estudiante está el botón CAMBIAR ESTUDIANTE.
//   4. Al elegir OTRA SECCIÓN o SUBSECCIÓN del menú la vista se desmonta
//      (App.vue la pinta con v-if) y la copia local del estudiante SE
//      BORRA: la próxima vez toca hacer la búsqueda de nuevo.
// Guardado: el Sheet recibe SOLO las columnas que cambiaron y Firebase
// recalcula sus 8 datos desde la fila completa; el id del documento sigue a
// la regla de la matrícula (grado + nombre): si cambia el nombre o el
// grado, el documento se recrea con el id nuevo y se borra el viejo — el id
// no importa, los datos sí.
// El borrador local (regla del proyecto) sigue protegiendo lo escrito
// mientras se edita una parte: recarga, cancelación y caché por usuario.
// Reglas de acceso: el GRADO ("Grado que cursa") solo lo pueden cambiar
// admin y director — para un docente llega bloqueado y el guardado ignora
// cualquier cambio suyo.
// ─────────────────────────────────────────────────────────────
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'

import ModalConfirmacion from '@/components/ui/ModalConfirmacion.vue'
import { usarBorrador } from '@/lib/borrador'
import {
  borrarEstudianteLocal,
  guardarEstudianteLocal,
  leerEstudianteLocal,
  nivelDeGrado,
  nivelDeHoja,
  nombreNivel,
} from '@/lib/estudianteActualizar'
import { aIsoFecha, fechaCorta } from '@/lib/fechas'
import { cantonesDe, SIN_CANTON } from '@/lib/geoSV'
import {
  CANTON_LOS_PRADOS,
  CODIGOS_TEL,
  NA,
  OPCIONES_CASERIO_PERSONA,
  OTRO_CASERIO,
  PARTES,
  aplicarFiltro,
  cargarValores,
  cambiosDesde,
  datosFirebaseDeFila,
  esVisible,
  formatoTelefono,
  opcionesDeCampo,
  parteDe,
  textoDe,
  validarValores,
  type Campo,
  type NivelEstudiante,
  type Parte,
  type TipoValores,
} from '@/lib/estudiantePartes'
import {
  actualizarEstudiante as actualizarEnFirebase,
  idDeGrado,
  mensajeError,
  nombreCompleto,
} from '@/lib/estudiantes'
import {
  actualizarEstudiante as actualizarEnSheet,
  buscarEstudiantes,
  HOJA_BASICA,
  HOJA_PRIMERA_INFANCIA,
  leerEstudiante,
  sheetEstudiantesConfigurado,
  type CoincidenciaFila,
} from '@/lib/sheetEstudiantes'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
const auth = useAuthStore()

/* El GRADO solo lo cambian admin y director (regla del usuario). El docente
   lo ve bloqueado; al guardar se le descarta cualquier cambio de grado. */
const puedeCambiarGrado = computed(() => auth.rolEfectivo === 'admin' || auth.rolEfectivo === 'director')

/* Correo de la sesión: la copia local del estudiante vive POR USUARIO */
const correoSesion = computed(() => auth.perfil?.correo ?? '')

/* ── El estudiante buscado y GUARDADO EN LOCAL ── */
const elegido = ref<CoincidenciaFila | null>(null)
const fila = ref<Record<string, string>>({})
const nivel = ref<NivelEstudiante | null>(null)
const parte = ref<Parte | null>(null)
const valores = reactive<TipoValores>({})
const errores = reactive<Record<string, string>>({})
const hoyISO = aIsoFecha(new Date())

/* ── El análisis del GRADO (regla del usuario) ──
   El análisis muestra la etapa que el GRADO indica; el nivel que MANDA
   para las partes es el de la hoja donde vive la fila (no puede ser otro:
   las columnas a leer y escribir son las de su hoja). Si el grado y la
   hoja contaran historias distintas, la pantalla lo advierte. */
const nivelSegunGrado = computed(() => (elegido.value ? nivelDeGrado(elegido.value.grado) : null))
const nivelIncoherente = computed(
  () =>
    elegido.value !== null &&
    nivelSegunGrado.value !== null &&
    nivelSegunGrado.value !== nivel.value,
)
const gradoIdElegido = computed(() => (elegido.value ? idDeGrado(elegido.value.grado) : null))

const nivelNombre = computed(() => (nivel.value ? nombreNivel(nivel.value) : ''))
const partesNivel = computed<Parte[]>(() => (nivel.value ? [...PARTES[nivel.value]] : []))
const camposVisibles = computed(() =>
  (parte.value?.campos ?? []).filter(
    (campo) => campo.tipo !== 'derivado-grado' && esVisible(campo, valores),
  ),
)

/* Texto de la barra superior según el momento del flujo */
const textoBarra = computed(() => {
  if (!elegido.value) return ''
  return parte.value
    ? `${parte.value.etiqueta} — ${parte.value.titulo} · ${elegido.value.nombre}`
    : `${elegido.value.nombre} — elige la parte a modificar`
})

/* ── Limpiar ── */
function limpiarFormulario(): void {
  for (const clave of Object.keys(valores)) delete valores[clave]
  for (const clave of Object.keys(errores)) delete errores[clave]
  elegido.value = null
  fila.value = {}
}

function limpiarBusqueda(): void {
  letras.value = ''
  coincidencias.value = []
  errorBusqueda.value = ''
  hojaFallada.value = ''
  buscando.value = false
}

/* Volver a la lista de partes SIN perder al estudiante elegido */
function irALasPartes(): void {
  parte.value = null
  for (const clave of Object.keys(valores)) delete valores[clave]
  for (const clave of Object.keys(errores)) delete errores[clave]
}

/* Todo limpio y SIN estudiante: vuelve a la búsqueda y BORRA el local
   (la copia del estudiante Y la del borrador, para que al volver no
   aparezca un "Datos sin guardar" de una edición ya abandonada) */
function limpiarTodo(): void {
  nivel.value = null
  limpiarBusqueda()
  limpiarFormulario()
  irALasPartes()
  borrarEstudianteLocal(correoSesion.value)
  olvidarBorrador()
}

/* ── La copia local del estudiante (regla del usuario: la búsqueda queda
   guardada en local hasta cambiar de sección o de estudiante) ── */
function guardarLocal(): void {
  if (elegido.value && nivel.value) {
    guardarEstudianteLocal(correoSesion.value, {
      elegido: { ...elegido.value },
      fila: { ...fila.value },
      nivel: nivel.value,
    })
  }
}

/* ── Elegir la parte a modificar: se carga desde la fila ya guardada en
   local (sin releer el Sheet: instantáneo) ── */
function elegirParte(elegida: Parte): void {
  if (!elegido.value) return
  parte.value = elegida
  for (const clave of Object.keys(valores)) delete valores[clave]
  Object.assign(valores, cargarValores(elegida, fila.value))
  for (const clave of Object.keys(errores)) delete errores[clave]
}

/* ── CAMBIAR ESTUDIANTE: se borra del local y vuelve a la búsqueda ──
   Con una parte abierta y datos escritos, el borrador pide confirmación
   (aceptar borra lo escrito, incluida la copia local). */
function hayCambiosSinGuardar(): boolean {
  return (
    parte.value !== null &&
    Object.keys(cambiosDesde(parte.value, valores, fila.value)).length > 0
  )
}

function cambiarEstudiante(): void {
  if (hayCambiosSinGuardar()) {
    pedirCancelarBorrador()
    return
  }
  limpiarTodo()
}

/* ── Buscador en tiempo real (debounce, desde 3 letras) ── */
const LETRAS_MINIMAS = 3
const letras = ref('')
const buscando = ref(false)
const coincidencias = ref<CoincidenciaFila[]>([])
const errorBusqueda = ref('')
/* Si una de las DOS hojas no respondió, se avisa (los resultados de la otra
   sí se muestran) */
const hojaFallada = ref('')

let temporizador: ReturnType<typeof setTimeout> | undefined
watch(letras, (valor) => {
  if (temporizador) clearTimeout(temporizador)
  coincidencias.value = []
  errorBusqueda.value = ''
  hojaFallada.value = ''
  const limpio = valor.trim()
  if (limpio.length < LETRAS_MINIMAS) return
  temporizador = setTimeout(() => void buscar(), 350)
})

async function buscar(): Promise<void> {
  const consulta = letras.value.trim()
  if (consulta.length < LETRAS_MINIMAS) return
  buscando.value = true
  errorBusqueda.value = ''
  hojaFallada.value = ''
  try {
    /* LAS DOS hojas a la vez: el nivel se deduce del GRADO del estudiante
       elegido, así que la búsqueda no depende de un nivel elegido antes. */
    const [pi, basica] = await Promise.allSettled([
      buscarEstudiantes(HOJA_PRIMERA_INFANCIA, consulta),
      buscarEstudiantes(HOJA_BASICA, consulta),
    ])
    if (letras.value.trim() !== consulta) return /* tarde: ya se busca otra cosa */
    const encontradas: CoincidenciaFila[] = []
    const hojasFalladas: string[] = []
    let razon: unknown = null
    if (pi.status === 'fulfilled') encontradas.push(...pi.value)
    else {
      hojasFalladas.push(HOJA_PRIMERA_INFANCIA)
      if (razon === null) razon = pi.reason
    }
    if (basica.status === 'fulfilled') encontradas.push(...basica.value)
    else {
      hojasFalladas.push(HOJA_BASICA)
      if (razon === null) razon = basica.reason
    }
    encontradas.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    coincidencias.value = encontradas
    hojaFallada.value = hojasFalladas.join(' y ')
    if (hojasFalladas.length === 2) {
      errorBusqueda.value = `No se pudo buscar en el Sheet: ${
        razon instanceof Error ? razon.message : 'error desconocido'
      }`
    } else if (encontradas.length === 0 && hojasFalladas.length === 1) {
      errorBusqueda.value = `Nadie coincide con esas letras, y la hoja "${hojaFallada.value}" no respondió. Prueba de nuevo.`
    } else if (encontradas.length === 0) {
      errorBusqueda.value = 'Nadie coincide con esas letras. Prueba con otras.'
    }
  } finally {
    buscando.value = false
  }
}

/* ── Click en una coincidencia: leer SU fila, GUARDAR EN LOCAL y mostrar
   las partes de su etapa ── */
async function elegirEstudiante(coincidencia: CoincidenciaFila): Promise<void> {
  ui.iniciarCarga('Leyendo la matrícula…')
  try {
    const filaLeida = await leerEstudiante(coincidencia.hoja, coincidencia.fila)
    elegido.value = coincidencia
    fila.value = filaLeida
    /* El nivel que manda es el de la hoja donde VIVE la fila (si el grado
       dijera otra cosa, la pantalla lo advierte). */
    nivel.value = nivelDeHoja(coincidencia.hoja)
    parte.value = null
    letras.value = ''
    coincidencias.value = []
    errorBusqueda.value = ''
    hojaFallada.value = ''
    guardarLocal() /* la búsqueda queda GUARDADA EN LOCAL */
  } catch (e) {
    ui.notificar('error', `No se pudo leer la matrícula: ${(e as Error).message}`)
  } finally {
    ui.terminarCarga()
  }
}

/* ── Guardar: Sheet (solo columnas cambiadas) + Firebase (8 datos) ── */
async function guardar(): Promise<void> {
  if (!parte.value || !elegido.value || !nivel.value) return
  const fallos = validarValores(parte.value, valores)
  for (const clave of Object.keys(errores)) delete errores[clave]
  for (const [clave, mensaje] of Object.entries(fallos)) {
    errores[`${parte.value.id}.${clave}`] = mensaje
  }
  if (Object.keys(fallos).length > 0) {
    ui.notificar('error', 'Faltan campos requeridos: revisa lo marcado en rojo.')
    return
  }
  const cambios = cambiosDesde(parte.value, valores, fila.value)
  /* Defensa extra: aunque el campo llegara cambiado (p. ej. por un borrador
     viejo), un docente NO puede mover el grado. */
  if (!puedeCambiarGrado.value) delete cambios['Grado que cursa']
  if (Object.keys(cambios).length === 0) {
    ui.notificar('precaucion', 'No hay cambios por guardar: todo está igual que en el Sheet.')
    return
  }

  ui.iniciarCarga('Guardando los cambios…')
  try {
    /* 1) Sheet: solo las columnas que cambiaron de la fila existente. El
       Apps Script vuelve a revisar duplicados (excluye la propia fila). */
    await actualizarEnSheet(elegido.value.hoja, elegido.value.fila, cambios)

    /* 2) Firebase: los 8 datos se recalculan desde la fila FUSIONADA
       (cambios + lo que no se tocó), para que quede parejo al Sheet. */
    const filaFusionada = { ...fila.value }
    for (const [columna, valor] of Object.entries(cambios)) {
      filaFusionada[columna] = valor
    }
    const nombreAnterior = elegido.value.nombre
    await actualizarEnFirebase(nombreAnterior, datosFirebaseDeFila(nivel.value, filaFusionada))

    /* 3) La fila de referencia queda fusionada: si se vuelve a guardar esta
       parte, solo viajan los cambios NUEVOS. */
    fila.value = filaFusionada
    const nombreNuevo = nombreCompleto(filaFusionada['Nombres'] ?? '', filaFusionada['Apellidos'] ?? '')
    elegido.value = {
      ...elegido.value,
      nombre: nombreNuevo || elegido.value.nombre,
      grado: filaFusionada['Grado que cursa'] ?? elegido.value.grado,
      nie: (filaFusionada['NIE'] ?? '').trim() || elegido.value.nie,
    }
    /* El estudiante (con la fila ya actualizada) SIGUE en el local: al
       guardar se vuelve a la lista de partes con el mismo estudiante. */
    guardarLocal()
    ui.notificar(
      'exito',
      `Cambios guardados en el Sheet (fila ${elegido.value.fila} de "${elegido.value.hoja}") y en Firebase.`,
    )
    /* Guardado OK: la copia del borrador ya no hace falta (todo quedó en el
       Sheet y en Firebase) y el flujo vuelve a LAS PARTES con el mismo
       estudiante seleccionado. Así el borrador nunca anuncia "Datos sin
       guardar" por algo que ya está guardado. */
    olvidarBorrador()
    irALasPartes()
  } catch (e) {
    ui.notificar('error', `No se pudo guardar: ${mensajeError(e)}`)
  } finally {
    ui.terminarCarga()
  }
}

/* ── Borrador local (regla del proyecto: toda vista que edita) ──
   Protege lo ESCRITO de una parte abierta; el estudiante elegido vive
   aparte en su propia copia local (estudianteActualizar). */
interface BorradorActualizar {
  parteId: string
  elegido: CoincidenciaFila
  fila: Record<string, string>
  valores: TipoValores
}

const {
  modalAbierto: modalBorrador,
  textos: textosBorrador,
  vigilar,
  revisarAlEntrar,
  aceptar: aceptarBorrador,
  seguir: seguirBorrador,
  pedirCancelar: pedirCancelarBorrador,
  olvidar: olvidarBorrador,
} = usarBorrador('actualizar', {
  capturar: (): BorradorActualizar | null => {
    if (!parte.value || !elegido.value) return null
    return {
      parteId: parte.value.id,
      elegido: { ...elegido.value },
      fila: { ...fila.value },
      valores: JSON.parse(JSON.stringify(valores)) as TipoValores,
    }
  },
  restaurar: (datos: BorradorActualizar) => {
    elegido.value = datos.elegido
    fila.value = datos.fila
    nivel.value = nivelDeHoja(datos.elegido.hoja)
    parte.value = parteDe(nivel.value, datos.parteId)
    for (const clave of Object.keys(valores)) delete valores[clave]
    Object.assign(valores, datos.valores)
    guardarLocal()
  },
  limpiar: () => limpiarTodo(),
})

vigilar(() => [parte.value?.id ?? '', elegido.value, fila.value, valores])

onMounted(() => {
  revisarAlEntrar()
  /* Si la búsqueda quedó guardada EN LOCAL (p. ej. tras una recarga), se
     retoma directo: estudiante elegido y sus partes, sin buscar de nuevo.
     El borrador (si hay) decide por encima con su modal de reconfirmación. */
  const local = leerEstudianteLocal(correoSesion.value)
  if (local) {
    elegido.value = local.elegido
    fila.value = local.fila
    nivel.value = local.nivel
  }
})

/* Regla del usuario: al elegir OTRA SECCIÓN o SUBSECCIÓN del menú la vista
   se desmonta y el estudiante del local SE BORRA: la próxima vez toca hacer
   la búsqueda de nuevo. */
onUnmounted(() => {
  borrarEstudianteLocal(correoSesion.value)
})

/* ── Helpers de pantalla para los campos genéricos ── */
function eClave(clave: string): string {
  return `${parte.value?.id ?? ''}.${clave}`
}

function eError(clave: string): string {
  return errores[eClave(clave)] ?? ''
}

function limpiarError(clave: string): void {
  delete errores[eClave(clave)]
}

const CLASE_CAMPO =
  'w-full rounded-lg border px-3 py-2 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-primario focus:ring-2 focus:ring-primario/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400'

function claseCampo(clave: string): string {
  return errores[eClave(clave)]
    ? `${CLASE_CAMPO} border-red-400 ring-2 ring-red-100`
    : `${CLASE_CAMPO} border-slate-300`
}

function claseRadio(valor: string, opcion: string, clave: string): string {
  const base = 'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors'
  const estado =
    valor === opcion
      ? 'border-primario bg-primario-suave font-semibold text-primario'
      : 'border-slate-300 text-slate-600 hover:border-primario hover:bg-primario-suave/50'
  const fallo = errores[eClave(clave)] && !valor ? ' border-red-300' : ''
  return `${base} ${estado}${fallo}`
}

function claseCuadro(marcada: boolean, clave: string): string {
  const base = 'flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm transition-colors'
  const estado = marcada
    ? 'border-primario bg-primario-suave font-semibold text-primario'
    : 'border-slate-300 text-slate-600 hover:border-primario hover:bg-primario-suave/50'
  const fallo = errores[eClave(clave)] ? ' border-red-300' : ''
  return `${base} ${estado}${fallo}`
}

/* Las partes de persona (apagarConNo) desactivan TODO cuando la respuesta
   inicial es "No" — igual que la matrícula. Además el GRADO llega bloqueado
   para quien no es admin ni director. */
function apagado(campo: Campo): boolean {
  const regla = parte.value?.apagarConNo
  if (!regla || campo.clave === regla) return false
  return textoDe(valores, regla) !== 'Sí'
}

function bloqueado(campo: Campo): boolean {
  return apagado(campo) || (campo.clave === 'grado' && !puedeCambiarGrado.value)
}

function opciones(campo: Campo): string[] {
  return opcionesDeCampo(campo, valores, fila.value)
}

function valorTexto(clave: string): string {
  return textoDe(valores, clave)
}

function alTexto(campo: Campo, evento: Event): void {
  const destino = evento.target as HTMLInputElement
  const filtrado = aplicarFiltro(campo.filtro, destino.value)
  valores[campo.clave] = filtrado
  destino.value = filtrado
  limpiarError(campo.clave)
}

function alFecha(campo: Campo, evento: Event): void {
  valores[campo.clave] = (evento.target as HTMLInputElement).value
  limpiarError(campo.clave)
}

function alEleccion(campo: Campo, opcion: string): void {
  valores[campo.clave] = opcion
  limpiarError(campo.clave)
  /* Al salir de "Otro (especifique)" el texto del compañero se limpia */
  if (campo.otro && opcion !== campo.otro.valor) {
    valores[campo.otro.clave] = ''
    limpiarError(campo.otro.clave)
  }
}

function alSelect(campo: Campo, evento: Event): void {
  alEleccion(campo, (evento.target as HTMLSelectElement).value)
  /* En las partes de persona, cambiar el DISTRITO re-infiere el cantón y
     reinicia el caserío (igual que la matrícula: un distrito sin cantones
     deja el "sin cantones" elegido; Los Prados todavía no, hasta elegirlo). */
  const campoCanton = parte.value?.campos.find((c) => c.tipo === 'canton')
  if (!campoCanton || campo.clave !== 'distrito') return
  const cantones = cantonesDe(textoDe(valores, campo.clave))
  const nuevoCanton = cantones !== null && cantones.length === 0 ? SIN_CANTON : ''
  valores[campoCanton.clave] = nuevoCanton
  limpiarError(campoCanton.clave)
  const campoCaserio = parte.value?.campos.find((c) => c.tipo === 'caserio')
  if (campoCaserio) {
    valores[campoCaserio.clave] = ''
    if (campoCaserio.otro) valores[campoCaserio.otro.clave] = ''
    limpiarError(campoCaserio.clave)
    if (campoCaserio.otro) limpiarError(campoCaserio.otro.clave)
  }
}

function alCasilla(campo: Campo): void {
  const marcado = campo.marcar ?? 'X'
  valores[campo.clave] = textoDe(valores, campo.clave) === marcado ? '' : marcado
  limpiarError(campo.clave)
}

function marcada(clave: string, opcion: string): boolean {
  const valor = valores[clave]
  return Array.isArray(valor) && valor.includes(opcion)
}

function alMarca(campo: Campo, opcion: string): void {
  const lista = Array.isArray(valores[campo.clave]) ? [...(valores[campo.clave] as string[])] : []
  const posicion = lista.indexOf(opcion)
  if (posicion === -1) lista.push(opcion)
  else lista.splice(posicion, 1)
  valores[campo.clave] = lista
  limpiarError(campo.clave)
  if (campo.otro && opcion === campo.otro.valor && !lista.includes(opcion)) {
    valores[campo.otro.clave] = ''
    limpiarError(campo.otro.clave)
  }
}

function alTelefono(campo: Campo, evento: Event): void {
  const destino = evento.target as HTMLInputElement
  const codigo = campo.codigoDe ? textoDe(valores, campo.codigoDe) : ''
  const formateado = formatoTelefono(codigo, destino.value)
  valores[campo.clave] = formateado
  destino.value = formateado
  limpiarError(campo.clave)
}

function alCodigoTel(campo: Campo, evento: Event): void {
  valores[campo.clave] = (evento.target as HTMLSelectElement).value
  limpiarError(campo.clave)
  /* Al cambiar el código, los números ya escritos se reformatean */
  if (!parte.value) return
  for (const otro of parte.value.campos) {
    if (otro.codigoDe === campo.clave && (otro.tipo === 'telefono' || otro.tipo === 'prefijado')) {
      valores[otro.clave] = formatoTelefono(textoDe(valores, campo.clave), textoDe(valores, otro.clave))
    }
  }
}

/* Cantón de persona: cambiarlo reinicia el caserío (Los Prados → N/A) */
function alCanton(campo: Campo, evento: Event): void {
  valores[campo.clave] = (evento.target as HTMLSelectElement).value
  limpiarError(campo.clave)
  const campoCaserio = parte.value?.campos.find((c) => c.tipo === 'caserio')
  if (campoCaserio) {
    valores[campoCaserio.clave] = textoDe(valores, campo.clave) === CANTON_LOS_PRADOS ? NA : ''
    if (campoCaserio.otro) valores[campoCaserio.otro.clave] = ''
    limpiarError(campoCaserio.clave)
    if (campoCaserio.otro) limpiarError(campoCaserio.otro.clave)
  }
}

function alCantonTexto(campo: Campo, evento: Event): void {
  alTexto(campo, evento)
}

function alCaserioSelect(campo: Campo, evento: Event): void {
  alEleccion(campo, (evento.target as HTMLSelectElement).value)
}

function alCaserioTexto(campo: Campo, evento: Event): void {
  alTexto(campo, evento)
}

/* Marca / quita el N/A del caserío de texto libre (personas) */
function alCaserioNA(campo: Campo): void {
  valores[campo.clave] = textoDe(valores, campo.clave) === NA ? '' : NA
  if (textoDe(valores, campo.clave) !== OTRO_CASERIO && campo.otro) {
    valores[campo.otro.clave] = ''
  }
  limpiarError(campo.clave)
  if (campo.otro) limpiarError(campo.otro.clave)
}

/* ¿El cantón de persona va en MODO SELECT (Chalatenango con catálogo)? */
function cantonEnModoSelect(campo: Campo): boolean {
  return opciones(campo).length > 0
}

/* ¿El caserío de persona va en MODO SELECT (cantón Los Prados)? */
function caserioEnModoSelect(): boolean {
  return textoDe(valores, 'canton') === CANTON_LOS_PRADOS
}
</script>

<template>
  <section class="space-y-4">
    <!-- ══ PASO 1 · BUSCAR al estudiante (queda guardado en local) ══ -->
    <div v-if="!elegido" class="space-y-4">
      <header>
        <h2 class="text-2xl font-bold">Actualizar datos de un estudiante</h2>
        <p class="text-slate-500">
          Busca al estudiante a modificar. Al elegirlo se guarda en este equipo y se analiza su
          grado (Primera Infancia o Educación Básica) para mostrar solo las partes que
          corresponden.
        </p>
      </header>
      <div
        v-if="!sheetEstudiantesConfigurado"
        class="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
      >
        Falta configurar la URL del Sheet de estudiantes
        <span class="font-semibold">VITE_SHEET_ESTUDIANTES_URL</span> para poder buscar y leer
        matrículas.
      </div>
      <template v-else>
        <div class="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <label for="a-buscar" class="text-xs font-semibold text-slate-600">
            Estudiante a modificar <span class="text-red-500">*</span>
          </label>
          <input
            id="a-buscar"
            v-model="letras"
            type="text"
            autocomplete="off"
            placeholder="Escribe 3 o más letras del nombre o apellido…"
            :class="claseCampo('')"
          />
          <p class="mt-1 text-xs text-slate-400">
            La búsqueda recorre LAS DOS hojas del libro (primera infancia y básica) y arranca a
            partir de {{ LETRAS_MINIMAS }} letras.
          </p>
        </div>

        <div v-if="buscando" class="text-sm text-slate-500">Buscando…</div>
        <p v-else-if="errorBusqueda" class="text-sm text-amber-700">{{ errorBusqueda }}</p>
        <p v-else-if="hojaFallada" class="text-sm text-amber-700">
          La hoja "{{ hojaFallada }}" no respondió: los resultados pueden estar incompletos.
        </p>
        <p
          v-else-if="letras.length > 0 && letras.trim().length < LETRAS_MINIMAS"
          class="text-xs text-slate-400"
        >
          Escribe al menos {{ LETRAS_MINIMAS }} letras para que empiece la búsqueda.
        </p>

        <div v-if="coincidencias.length > 0" class="space-y-2">
          <p class="text-xs font-semibold text-slate-500">
            {{ coincidencias.length }} coincidencia{{ coincidencias.length === 1 ? '' : 's' }} —
            haz click para leer su matrícula y guardarla en este equipo:
          </p>
          <button
            v-for="coincidencia in coincidencias"
            :key="`${coincidencia.hoja}-${coincidencia.fila}`"
            type="button"
            class="flex w-full items-start justify-between gap-3 rounded-lg border border-slate-300 bg-white px-4 py-3 text-left transition-colors hover:border-primario hover:bg-primario-suave/40"
            @click="elegirEstudiante(coincidencia)"
          >
            <span>
              <p class="text-sm font-bold text-slate-900">{{ coincidencia.nombre }}</p>
              <p class="mt-0.5 text-xs text-slate-500">
                NIE {{ coincidencia.nie || '—' }} · Grado {{ coincidencia.grado || '—' }} · fila
                {{ coincidencia.fila }} de "{{ coincidencia.hoja }}"
              </p>
            </span>
            <span
              class="shrink-0 rounded-full bg-primario-suave px-2 py-0.5 text-xs font-semibold text-primario"
            >
              {{ nombreNivel(nivelDeHoja(coincidencia.hoja)) }}
            </span>
          </button>
        </div>
      </template>
    </div>

    <template v-else>
      <!-- ══ Barra del estudiante/parte (fija al hacer scroll) ══ -->
      <div class="sticky top-0 z-10 -mx-3 bg-white px-3 pt-3 pb-2 md:-mx-4 md:px-4 md:pt-4">
        <div
          class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-primario-suave/60 px-4 py-3"
        >
          <div>
            <p class="text-sm font-bold text-slate-900">Actualizar · {{ nivelNombre }}</p>
            <p class="text-xs text-slate-500">{{ textoBarra }}</p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <button
              v-if="parte"
              type="button"
              class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              @click="irALasPartes"
            >
              Cambiar parte
            </button>
            <button
              type="button"
              class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              @click="cambiarEstudiante"
            >
              Cambiar estudiante
            </button>
          </div>
        </div>
      </div>

      <!-- ══ PASO 2 · Las partes a modificar (según el GRADO analizado) ══ -->
      <div v-if="!parte" class="space-y-4">
        <!-- Tarjeta del estudiante guardado en local -->
        <div class="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-primario">
              Estudiante guardado en este equipo
            </p>
            <h3 class="text-sm font-bold text-slate-900">{{ elegido!.nombre }}</h3>
            <p class="mt-1 text-xs text-slate-500">
              NIE {{ elegido!.nie || '—' }} · Grado "{{ elegido!.grado || '—' }}"
              <template v-if="gradoIdElegido !== null">(id {{ gradoIdElegido }})</template>
              · fila {{ elegido!.fila }} de "{{ elegido!.hoja }}"
            </p>
          </div>
          <div class="mt-3 rounded-lg bg-primario-suave/60 px-3 py-2 text-xs text-slate-600">
            <p>
              <span class="font-semibold">Análisis del grado:</span>
              {{ elegido!.grado || 'sin grado' }}
              <template v-if="gradoIdElegido !== null">(id {{ gradoIdElegido }})</template>
              → <span class="font-semibold text-primario">{{ nivelNombre }}</span
              >. De Primero hacia abajo es Primera Infancia; de Segundo en adelante, Educación
              Básica.
            </p>
            <p v-if="nivelIncoherente" class="mt-1 font-medium text-amber-700">
              Ojo: el grado apunta a {{ nombreNivel(nivelSegunGrado!) }}, pero la fila vive en la
              hoja "{{ elegido!.hoja }}". Se muestran las partes de la hoja para no escribir en la
              hoja equivocada.
            </p>
          </div>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <button
            v-for="opcion in partesNivel"
            :key="opcion.id"
            type="button"
            class="rounded-xl border border-slate-300 bg-white p-4 text-left transition-colors hover:border-primario hover:bg-primario-suave/40"
            @click="elegirParte(opcion)"
          >
            <span class="text-xs font-semibold uppercase tracking-wide text-primario">
              {{ opcion.etiqueta }}
            </span>
            <p class="text-sm font-bold text-slate-900">{{ opcion.titulo }}</p>
          </button>
        </div>
      </div>

      <!-- ══ PASO 3 · Formulario de la parte, TODO editable ══ -->
      <div v-else class="rounded-xl border border-slate-200 bg-white">
        <div class="border-b border-slate-100 px-4 py-3">
          <p class="text-xs font-semibold uppercase tracking-wide text-primario">
            {{ parte.etiqueta }}
          </p>
          <h3 class="text-sm font-bold text-slate-900">{{ parte.titulo }}</h3>
          <p class="mt-1 text-xs text-slate-500">
            Editando a <span class="font-semibold">{{ elegido!.nombre }}</span> — NIE
            {{ elegido!.nie || '—' }} · Grado {{ elegido!.grado || '—' }} · fila
            {{ elegido!.fila }} de "{{ elegido!.hoja }}". Al guardar, los cambios van al Sheet y a
            Firebase.
          </p>
        </div>

        <div class="p-4 sm:p-5">
          <p class="text-xs text-slate-500">
            Los campos marcados con <span class="font-bold text-red-500">*</span> son requeridos.
          </p>

          <div class="mt-4 grid gap-x-6 gap-y-5 sm:grid-cols-2">
            <template v-for="campo in camposVisibles" :key="campo.clave">
              <div :class="campo.ancho === 'completo' ? 'sm:col-span-2' : ''">
                <!-- Campo fijo (desactivado, se guarda en blanco) -->
                <div v-if="campo.tipo === 'fijo'">
                  <label :for="`a-${campo.clave}`" class="text-xs font-semibold text-slate-600">
                    {{ campo.etiqueta }}
                  </label>
                  <input
                    :id="`a-${campo.clave}`"
                    type="text"
                    :value="campo.fijoValor ?? ''"
                    disabled
                    :class="claseCampo(campo.clave)"
                  />
                  <p v-if="campo.nota" class="mt-1 text-xs text-slate-400">{{ campo.nota }}</p>
                </div>

                <!-- Elección: radios (2-3 opciones) o select -->
                <div v-else-if="campo.tipo === 'eleccion'">
                  <span class="text-xs font-semibold text-slate-600">
                    {{ campo.etiqueta }}
                    <span v-if="campo.requerido" class="text-red-500">*</span>
                  </span>
                  <div
                    v-if="opciones(campo).length > 0 && opciones(campo).length <= 3"
                    class="mt-1 flex flex-wrap gap-2"
                  >
                    <label
                      v-for="opcion in opciones(campo)"
                      :key="opcion"
                      :class="claseRadio(valorTexto(campo.clave), opcion, campo.clave)"
                    >
                      <input
                        type="radio"
                        :name="`a-${campo.clave}`"
                        :value="opcion"
                        :checked="valorTexto(campo.clave) === opcion"
                        :disabled="bloqueado(campo)"
                        class="h-4 w-4 accent-primario"
                        @change="alEleccion(campo, opcion)"
                      />
                      {{ opcion }}
                    </label>
                  </div>
                  <select
                    v-else
                    :id="`a-${campo.clave}`"
                    :value="valorTexto(campo.clave)"
                    :disabled="bloqueado(campo)"
                    :class="claseCampo(campo.clave)"
                    @change="alSelect(campo, $event)"
                  >
                    <option v-if="!campo.requerido && !campo.naEnBlanco" value="">—</option>
                    <option
                      v-if="!campo.requerido && campo.naEnBlanco && valorTexto(campo.clave) === ''"
                      value=""
                    >
                      —
                    </option>
                    <option v-for="opcion in opciones(campo)" :key="opcion" :value="opcion">
                      {{ opcion }}
                    </option>
                  </select>
                  <p
                    v-if="campo.clave === 'grado' && !puedeCambiarGrado"
                    class="mt-1 text-xs text-amber-600"
                  >
                    Solo admin o director pueden cambiar el grado.
                  </p>
                  <p v-if="campo.nota" class="mt-1 text-xs text-slate-400">{{ campo.nota }}</p>
                  <p v-if="eError(campo.clave)" class="mt-1 text-xs text-red-600">
                    {{ eError(campo.clave) }}
                  </p>
                </div>

                <!-- Marcadores (lista unida con ", " en el Sheet) -->
                <div v-else-if="campo.tipo === 'marcadores'">
                  <span class="text-xs font-semibold text-slate-600">
                    {{ campo.etiqueta }}
                    <span v-if="campo.requerido" class="text-red-500">*</span>
                  </span>
                  <div class="mt-1 grid gap-2 sm:grid-cols-2">
                    <label
                      v-for="opcion in opciones(campo)"
                      :key="opcion"
                      :class="claseCuadro(marcada(campo.clave, opcion), campo.clave)"
                    >
                      <input
                        type="checkbox"
                        :checked="marcada(campo.clave, opcion)"
                        :disabled="bloqueado(campo)"
                        class="mt-0.5 h-4 w-4 accent-primario"
                        @change="alMarca(campo, opcion)"
                      />
                      {{ opcion }}
                    </label>
                  </div>
                  <p v-if="eError(campo.clave)" class="mt-1 text-xs text-red-600">
                    {{ eError(campo.clave) }}
                  </p>
                </div>

                <!-- Una casilla con valor fijo ('X', modalidad) -->
                <div v-else-if="campo.tipo === 'casilla'" class="flex items-start">
                  <label :class="claseCuadro(valorTexto(campo.clave) === campo.marcar, campo.clave)">
                    <input
                      type="checkbox"
                      :checked="valorTexto(campo.clave) === campo.marcar"
                      :disabled="bloqueado(campo)"
                      class="mt-0.5 h-4 w-4 accent-primario"
                      @change="alCasilla(campo)"
                    />
                    {{ campo.etiqueta }}
                  </label>
                  <p v-if="campo.nota" class="mt-1 text-xs text-slate-400">{{ campo.nota }}</p>
                  <p v-if="eError(campo.clave)" class="mt-1 text-xs text-red-600">
                    {{ eError(campo.clave) }}
                  </p>
                </div>

                <!-- Fecha (ISO en el estado, dd/mm/yyyy en el Sheet) -->
                <div v-else-if="campo.tipo === 'fecha'">
                  <label :for="`a-${campo.clave}`" class="text-xs font-semibold text-slate-600">
                    {{ campo.etiqueta }}
                    <span v-if="campo.requerido" class="text-red-500">*</span>
                  </label>
                  <input
                    :id="`a-${campo.clave}`"
                    type="date"
                    :max="hoyISO"
                    :value="valorTexto(campo.clave)"
                    :disabled="bloqueado(campo)"
                    :class="claseCampo(campo.clave)"
                    @change="alFecha(campo, $event)"
                  />
                  <p v-if="valorTexto(campo.clave)" class="mt-1 text-xs text-slate-400">
                    Fecha elegida: {{ fechaCorta(valorTexto(campo.clave)) }} (dd/mm/yyyy)
                  </p>
                  <p v-if="eError(campo.clave)" class="mt-1 text-xs text-red-600">
                    {{ eError(campo.clave) }}
                  </p>
                </div>

                <!-- Código telefónico (la columna guarda el código) -->
                <div v-else-if="campo.tipo === 'codigo-tel'">
                  <label :for="`a-${campo.clave}`" class="text-xs font-semibold text-slate-600">
                    {{ campo.etiqueta }}
                    <span v-if="campo.requerido" class="text-red-500">*</span>
                  </label>
                  <select
                    :id="`a-${campo.clave}`"
                    :value="valorTexto(campo.clave)"
                    :disabled="bloqueado(campo)"
                    :class="claseCampo(campo.clave)"
                    @change="alCodigoTel(campo, $event)"
                  >
                    <option value="">—</option>
                    <option v-for="codigo in CODIGOS_TEL" :key="codigo.codigo" :value="codigo.codigo">
                      {{ codigo.etiqueta }}
                    </option>
                  </select>
                  <p v-if="eError(campo.clave)" class="mt-1 text-xs text-red-600">
                    {{ eError(campo.clave) }}
                  </p>
                </div>

                <!-- Cantón de persona: select en Chalatenango, texto fuera -->
                <div v-else-if="campo.tipo === 'canton'">
                  <label :for="`a-${campo.clave}`" class="text-xs font-semibold text-slate-600">
                    {{ campo.etiqueta }}
                    <span v-if="campo.requerido" class="text-red-500">*</span>
                  </label>
                  <select
                    v-if="cantonEnModoSelect(campo)"
                    :id="`a-${campo.clave}`"
                    :value="valorTexto(campo.clave)"
                    :disabled="bloqueado(campo)"
                    :class="claseCampo(campo.clave)"
                    @change="alCanton(campo, $event)"
                  >
                    <option value="" disabled>Seleccione…</option>
                    <option v-for="opcion in opciones(campo)" :key="opcion" :value="opcion">
                      {{ opcion }}
                    </option>
                  </select>
                  <input
                    v-else
                    :id="`a-${campo.clave}`"
                    :value="valorTexto(campo.clave)"
                    type="text"
                    autocomplete="off"
                    placeholder="Escribe el cantón"
                    :disabled="bloqueado(campo)"
                    :class="claseCampo(campo.clave)"
                    @input="alCantonTexto(campo, $event)"
                  />
                  <p v-if="eError(campo.clave)" class="mt-1 text-xs text-red-600">
                    {{ eError(campo.clave) }}
                  </p>
                </div>

                <!-- Caserío de persona: select en Los Prados, texto + N/A fuera -->
                <div v-else-if="campo.tipo === 'caserio'">
                  <label :for="`a-${campo.clave}`" class="text-xs font-semibold text-slate-600">
                    {{ campo.etiqueta }}
                    <span v-if="campo.requerido" class="text-red-500">*</span>
                  </label>
                  <select
                    v-if="caserioEnModoSelect()"
                    :id="`a-${campo.clave}`"
                    :value="valorTexto(campo.clave)"
                    :disabled="bloqueado(campo)"
                    :class="claseCampo(campo.clave)"
                    @change="alCaserioSelect(campo, $event)"
                  >
                    <option v-for="opcion in OPCIONES_CASERIO_PERSONA" :key="opcion" :value="opcion">
                      {{ opcion }}
                    </option>
                  </select>
                  <div v-else class="flex gap-2">
                    <input
                      :id="`a-${campo.clave}`"
                      :value="valorTexto(campo.clave) === NA ? 'N/A' : valorTexto(campo.clave)"
                      type="text"
                      autocomplete="off"
                      placeholder="Escribe el caserío (o marca N/A)"
                      :disabled="bloqueado(campo) || valorTexto(campo.clave) === NA"
                      :class="claseCampo(campo.clave)"
                      @input="alCaserioTexto(campo, $event)"
                    />
                    <button
                      type="button"
                      class="shrink-0 rounded-lg border px-3 text-xs font-semibold transition-colors"
                      :class="
                        valorTexto(campo.clave) === NA
                          ? 'border-primario bg-primario-suave text-primario'
                          : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                      "
                      :disabled="bloqueado(campo)"
                      @click="alCaserioNA(campo)"
                    >
                      {{ valorTexto(campo.clave) === NA ? 'Quitar N/A' : 'N/A' }}
                    </button>
                  </div>
                  <p v-if="eError(campo.clave)" class="mt-1 text-xs text-red-600">
                    {{ eError(campo.clave) }}
                  </p>
                </div>

                <!-- Área de texto (observaciones) -->
                <div v-else-if="campo.tipo === 'area'">
                  <label :for="`a-${campo.clave}`" class="text-xs font-semibold text-slate-600">
                    {{ campo.etiqueta }}
                    <span v-if="campo.requerido" class="text-red-500">*</span>
                  </label>
                  <textarea
                    :id="`a-${campo.clave}`"
                    rows="3"
                    :value="valorTexto(campo.clave)"
                    :disabled="bloqueado(campo)"
                    :class="claseCampo(campo.clave)"
                    @input="alTexto(campo, $event)"
                  ></textarea>
                  <p v-if="eError(campo.clave)" class="mt-1 text-xs text-red-600">
                    {{ eError(campo.clave) }}
                  </p>
                </div>

                <!-- Texto (con filtro) y teléfono -->
                <div v-else>
                  <label :for="`a-${campo.clave}`" class="text-xs font-semibold text-slate-600">
                    {{ campo.etiqueta }}
                    <span v-if="campo.requerido" class="text-red-500">*</span>
                  </label>
                  <input
                    :id="`a-${campo.clave}`"
                    :value="valorTexto(campo.clave)"
                    type="text"
                    :inputmode="campo.tipo === 'telefono' || campo.tipo === 'prefijado' ? 'tel' : 'text'"
                    autocomplete="off"
                    :placeholder="
                      campo.tipo === 'telefono' || campo.tipo === 'prefijado'
                        ? 'Número según el código del país'
                        : ''
                    "
                    :disabled="bloqueado(campo)"
                    :class="claseCampo(campo.clave)"
                    @input="campo.tipo === 'telefono' || campo.tipo === 'prefijado' ? alTelefono(campo, $event) : alTexto(campo, $event)"
                  />
                  <p v-if="campo.nota" class="mt-1 text-xs text-slate-400">{{ campo.nota }}</p>
                  <p v-if="eError(campo.clave)" class="mt-1 text-xs text-red-600">
                    {{ eError(campo.clave) }}
                  </p>
                </div>
              </div>
            </template>
          </div>

          <div class="mt-6 flex flex-wrap items-center gap-2">
            <button
              type="button"
              class="flex items-center gap-2 rounded-lg bg-primario px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primario-oscuro"
              @click="guardar"
            >
              Guardar cambios
            </button>
            <button
              type="button"
              class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              @click="irALasPartes"
            >
              Cambiar parte
            </button>
            <button
              type="button"
              class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              @click="cambiarEstudiante"
            >
              Cambiar estudiante
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- Borrador local: reconfirmación de recarga y cancelación -->
    <ModalConfirmacion
      v-if="modalBorrador"
      :titulo="textosBorrador.titulo"
      :texto="textosBorrador.texto"
      :confirmar-texto="textosBorrador.boton"
      :tono="textosBorrador.tono"
      @confirmar="aceptarBorrador"
      @cerrar="seguirBorrador"
    />
  </section>
</template>
