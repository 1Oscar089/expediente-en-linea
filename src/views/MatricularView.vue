<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import ModalBase from '@/components/ui/ModalBase.vue'
import ModalConfirmacion from '@/components/ui/ModalConfirmacion.vue'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import { usarBorrador } from '@/lib/borrador'
import { aIsoFecha, fechaCorta, fechaHora } from '@/lib/fechas'
import {
  codigoTelefono,
  digitosDeTelefono,
  formatarTelefono,
  NOMBRES_PAISES,
  paisPorNombre,
} from '@/lib/paises'
import {
  DEPARTAMENTO_CHALATENANGO,
  DEPARTAMENTOS_SV,
  SIN_CANTON,
  cantonesDe,
  distritosDe,
} from '@/lib/geoSV'
import { guardarEstudiante } from '@/lib/sheetEstudiantes'
import { GRADOS, crearEstudiante, idDeGrado, mensajeError } from '@/lib/estudiantes'
import {
  INFO_CE_VACIA,
  infoCEGuardada,
  leerInfoCE,
  sheetConfigurado,
  type InfoCE,
} from '@/lib/sheetConfiguracion'

/* ── Matricular: elección de modalidad + flujo de PRIMERA INFANCIA ──
   Al entrar a la sección se abre un modal para elegir si la matrícula es de
   PRIMERA INFANCIA o de EDUCACIÓN BÁSICA; con la modalidad elegida, la
   sección muestra el panel que le corresponde.

   REGLA DE GRADOS (definida por el usuario):
   - Primera infancia: DESDE inicial HASTA primer grado.
   - Educación básica: de SEGUNDO a NOVENO grado.

   PRIMERA INFANCIA se muestra POR PARTES (el content es reducido): se ve
   una parte a la vez, con botones ANTERIOR y SIGUIENTE (y GUARDAR en la
   última). Las partes con campos requeridos (r) no dejan avanzar sin
   completarlos; los opcionales (o) no bloquean. Partes:
   - Parte 1  · Datos generales del centro educativo (NO editables: se leen
                del Sheet de configuración, hoja "informacion-ce").
   - Parte 2.1· Datos del estudiante (incluye el GRADO que cursará).
   - Parte 2.2· Datos de la madre (pregunta inicial Sí/No; si es No, todos
                los campos quedan desactivados y en blanco).
   - Parte 2.3· Datos del padre (igual que la madre).
   - Parte 2.4· Otra persona que acompañará al niño o niña (igual que el
                padre). Al darle SIGUIENTE se abre un MODAL para elegir al
                RESPONSABLE entre las personas que sí se llenaron.
   - Parte 3  · Condición de discapacidad de la niña o niño.
   - Parte 4  · Convivencia familiar.
   - Parte 5  · Ingreso familiar.
   - Parte 6  · Vivienda (zona, tenencia y materiales/servicios).
   - Parte 7  · Hábitos del estudiante (sueño y alimentación).
   - Parte 8  · Participación y compromisos.
   - Parte 9  · Modalidad de atención; aquí el botón final es GUARDAR:
                todos los datos van al Sheet "estudiantes" (una fila por
                estudiante) y a Firebase van SOLO los datos importantes
                (nombre, NIE, correo, nacimiento, responsable, documento,
                teléfono y grado).

   El botón CANCELAR vive en la barra de nivel (junto a "Cambiar").

   REGLA DE LOS SELECT (para todo el proyecto): las opciones van en orden
   alfabético; "N/A" siempre PRIMERO y "Otro"/"Otro (especifique)" siempre
   AL FINAL. "N/A" no se guardará: quedará en blanco (al leer un input en
   blanco se sabe que es N/A). En el formulario se marca como "N/A" y esa
   conversión se hará al momento de guardar.

   Los CATÁLOGOS grandes (países del mundo, geografía de El Salvador) viven
   en src/lib/paises.ts y src/lib/geoSV.ts; el resto de las listas vive aquí. */

type Modalidad = 'primera-infancia' | 'educacion-basica'

/* Iconos SVG: SOLO TRAZO, sin relleno; heredan el color del texto (igual que menu.ts) */
function svg(trazo: string, clase = 'h-6 w-6'): string {
  return `<svg class="${clase}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${trazo}</svg>`
}

const OPCIONES: { id: Modalidad; nombre: string; descripcion: string; icono: string }[] = [
  {
    id: 'primera-infancia',
    nombre: 'Primera Infancia',
    descripcion: 'Desde inicial y parvularia hasta primer grado.',
    icono: svg(
      '<circle cx="12" cy="12" r="9"/><path d="M9 10h.01"/><path d="M15 10h.01"/><path d="M9 15c.8.9 1.9 1.4 3 1.4s2.2-.5 3-1.4"/>',
    ),
  },
  {
    id: 'educacion-basica',
    nombre: 'Educación Básica',
    descripcion: 'De segundo a noveno grado.',
    icono: svg(
      '<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
    ),
  },
]

const modalidad = ref<Modalidad | null>(null)
/* Al entrar a la sección, el modal se abre de una vez */
const modalAbierto = ref(true)

const opcionElegida = computed(() => OPCIONES.find((o) => o.id === modalidad.value) ?? null)

function elegir(id: Modalidad) {
  modalidad.value = id
  modalAbierto.value = false
}

/* Cerrar sin elegir (X o clic en el fondo) vuelve al estado inicial */
function cerrarModal() {
  modalAbierto.value = false
}

/* ═════════════════ Asistente por partes (Primera Infancia) ═════════════════ */

const ui = useUiStore()
const auth = useAuthStore()

/* ── Parte 1: datos del centro, leídos del Sheet de configuración ──
   Misma fuente que Configuración › Informacion CE (mismo módulo de lectura,
   con caché por recarga). Aquí se muestran SIN poder editarlos. */
const centro = ref<InfoCE>({ ...INFO_CE_VACIA })
const centroError = ref('')

const CAMPOS_CENTRO: { clave: keyof InfoCE; etiqueta: string }[] = [
  { clave: 'codigoInfraestructura', etiqueta: 'Código de infraestructura' },
  { clave: 'centroEducativo', etiqueta: 'Centro Educativo' },
  { clave: 'departamento', etiqueta: 'Departamento' },
  { clave: 'municipio', etiqueta: 'Municipio' },
  { clave: 'distrito', etiqueta: 'Distrito' },
]

const centroFaltante = computed(() =>
  CAMPOS_CENTRO.filter((c) => !(centro.value[c.clave] ?? '').trim()).map((c) => c.etiqueta),
)

async function cargarCentro(): Promise<void> {
  centroError.value = ''
  ui.iniciarCarga('Cargando información del centro…')
  try {
    centro.value = await leerInfoCE()
  } catch (e) {
    centroError.value = (e as Error).message
    ui.notificar('error', `No se pudo leer la información del centro: ${centroError.value}`)
  } finally {
    ui.terminarCarga()
  }
}

/* La lectura se hace UNA sola vez por recarga (caché en sheetConfiguracion.ts) */
onMounted(() => {
  const guardada = infoCEGuardada()
  if (guardada) {
    centro.value = { ...guardada }
  } else if (sheetConfigurado) {
    void cargarCentro()
  }
  /* Sugerencia del docente responsable (parte 9): el usuario en sesión */
  if (!modalidadAtencion.docente) modalidadAtencion.docente = auth.perfil?.nombre ?? ''
})

/* ── Partes del asistente: se muestran de a una, con Anterior/Siguiente ── */
const PASOS = [
  { id: 'centro', etiqueta: 'Parte 1', titulo: 'Datos generales del centro educativo' },
  { id: 'estudiante', etiqueta: 'Parte 2.1', titulo: 'Datos del estudiante' },
  { id: 'madre', etiqueta: 'Parte 2.2', titulo: 'Datos de la madre' },
  { id: 'padre', etiqueta: 'Parte 2.3', titulo: 'Datos del padre' },
  { id: 'otra', etiqueta: 'Parte 2.4', titulo: 'Otra persona que acompañará al niño o niña' },
  { id: 'discapacidad', etiqueta: 'Parte 3', titulo: 'Condición de discapacidad de la niña o niño' },
  { id: 'convivencia', etiqueta: 'Parte 4', titulo: 'Convivencia familiar' },
  { id: 'ingresos', etiqueta: 'Parte 5', titulo: 'Ingreso familiar' },
  { id: 'vivienda', etiqueta: 'Parte 6', titulo: 'Vivienda' },
  { id: 'habitos', etiqueta: 'Parte 7', titulo: 'Hábitos del estudiante' },
  { id: 'participacion', etiqueta: 'Parte 8', titulo: 'Participación y compromisos' },
  { id: 'modalidad', etiqueta: 'Parte 9', titulo: 'Modalidad de atención' },
] as const

const paso = ref(0)
const pasoActual = computed(() => PASOS[paso.value] ?? PASOS[0])
const esUltimoPaso = computed(() => paso.value === PASOS.length - 1)

/* ── Parte 2.1: datos del estudiante ── */
const DEPARTAMENTO_FIJO = 'Chalatenango'
const NA = 'N/A' /* en el formulario se marca "N/A"; al guardar quedará en blanco */
const OTRO_CASERIO = 'Otro (especifique)'
const CANTON_LOS_PRADOS = 'Los Prados'
const OTRO_OCUPACION = 'Otro (especifique)'
const ANIO_ACTUAL = new Date().getFullYear()
/* Para validar que la fecha de nacimiento no sea futura (yyyy-mm-dd del input) */
const hoyISO = aIsoFecha(new Date())

interface DatosEstudiante {
  nie: string
  nombres: string
  apellidos: string
  fechaNacimiento: string /* yyyy-mm-dd (input de fecha) */
  edad: string
  sexo: string /* 'M' | 'F' | '' */
  nacionalidad: string
  departamento: string /* fijo: Chalatenango */
  distrito: string
  canton: string
  caserio: string /* 'N/A' se guardará en blanco */
  caserioOtro: string
  grado: string /* GRADO QUE CURSARÁ (Parvularia 4-6, Primero a Noveno) */
  gradoInicial: string
  gradoParvularia: string
  anioGrado: string
  partidaPosee: string /* 'Sí' | 'No' | '' */
  partidaPresenta: string
  etnia: string /* 'N/A' se guardará en blanco */
}

/* Estado limpio de la parte 2.1: se usa para el borrador, para cancelar
   y para saber si el usuario ya escribió algo. */
const FORM_VACIO: DatosEstudiante = {
  nie: '',
  nombres: '',
  apellidos: '',
  fechaNacimiento: '',
  edad: '',
  sexo: '',
  nacionalidad: '',
  departamento: DEPARTAMENTO_FIJO,
  distrito: '',
  canton: '',
  caserio: NA,
  caserioOtro: '',
  grado: '',
  gradoInicial: '',
  gradoParvularia: '',
  anioGrado: '',
  partidaPosee: '',
  partidaPresenta: '',
  etnia: '',
}

const form = reactive<DatosEstudiante>({ ...FORM_VACIO })

/* ── Catálogos de la dirección (parte 2.1) ──
   Regla: TODO select va en orden alfabético; "N/A" primero y "Otro…" al final. */
const DISTRITOS = ['Comalapa', 'Dulce Nombre de María', 'La Laguna'].sort((a, b) =>
  a.localeCompare(b, 'es'),
)
const CANTONES = ['Cuevitas', 'Guachipilín', 'Los Prados', 'Plan Verde', 'San José'].sort((a, b) =>
  a.localeCompare(b, 'es'),
)
const CASERIOS = ['El Ocotalito', 'La Joya', 'El Portillo', 'Los Alvarados', 'Los Mejías', OTRO_CASERIO]
const ETNIAS = ['Nahua-Pipil', 'Lenca', 'Kakawira', 'Otro']
const SEXO = ['M', 'F']
const SI_NO = ['Sí', 'No']

/* Ordena alfabético, "N/A" primero y "Otro…" al final */
function opcionesConReglas(lista: string[]): string[] {
  const orden = [...lista].sort((a, b) => a.localeCompare(b, 'es'))
  const otros = orden.filter((o) => /^otro/i.test(o))
  return [NA, ...orden.filter((o) => !/^otro/i.test(o)), ...otros]
}

const OPCIONES_CASERIO = opcionesConReglas(CASERIOS)
const OPCIONES_ETNIA = opcionesConReglas(ETNIAS)

/* Grados que el estudiante cursará (orden natural de niveles, NO alfabético) */
const OPCIONES_GRADO = GRADOS

/* ── Partes 2.2, 2.3 y 2.4: datos de la madre, del padre y de otra persona ──
   Las tres usan EXACTAMENTE los mismos campos; la única diferencia es la
   pregunta inicial. Un solo bloque de template (con v-for) pinta las tres. */
const CLAVES_PERSONA = ['madre', 'padre', 'otra'] as const
type ClavePersona = (typeof CLAVES_PERSONA)[number]

interface DatosPersona {
  tiene: string /* 'Sí' | 'No' | '' */
  nombre: string
  fechaNacimiento: string
  edad: string
  documento: string /* DUI, pasaporte u otro documento */
  pais: string
  departamento: string /* solo si el país es El Salvador */
  distrito: string
  canton: string /* select en Chalatenango; texto en los demás */
  caserio: string /* select N/A + Otro en Los Prados; texto + N/A en otros */
  caserioOtro: string
  paisTelefono: string /* país del CÓDIGO telefónico */
  telefono: string /* formateado según el país */
  whatsapp: string /* 'Sí' | 'No' | '' */
  whatsappCelular: string /* si el teléfono no tiene WhatsApp */
  correo: string /* si queda en blanco se usa el del estudiante */
  estudia: string /* 'Sí' | 'No' | '' */
  centroEducativo: string
  gradoParvularia: string
  gradoBasica: string
  gradoMedia: string
  gradoSuperior: string
  gradoNinguno: boolean
  ocupacion: string
  ocupacionOtro: string
  lugarTrabajo: string
}

const PERSONA_VACIA: DatosPersona = {
  tiene: '',
  nombre: '',
  fechaNacimiento: '',
  edad: '',
  documento: '',
  pais: '',
  departamento: '',
  distrito: '',
  canton: '',
  caserio: '',
  caserioOtro: '',
  paisTelefono: '',
  telefono: '',
  whatsapp: '',
  whatsappCelular: '',
  correo: '',
  estudia: '',
  centroEducativo: '',
  gradoParvularia: '',
  gradoBasica: '',
  gradoMedia: '',
  gradoSuperior: '',
  gradoNinguno: false,
  ocupacion: '',
  ocupacionOtro: '',
  lugarTrabajo: '',
}

const personas = reactive<Record<ClavePersona, DatosPersona>>({
  madre: { ...PERSONA_VACIA },
  padre: { ...PERSONA_VACIA },
  otra: { ...PERSONA_VACIA },
})

const CONFIG_PERSONAS: { id: ClavePersona; pregunta: string; etiqueta: string }[] = [
  { id: 'madre', pregunta: '¿Tiene madre?', etiqueta: 'Madre' },
  { id: 'padre', pregunta: '¿Tiene padre?', etiqueta: 'Padre' },
  { id: 'otra', pregunta: '¿Otra persona acompañará al niño o niña?', etiqueta: 'Otra persona' },
]

const esPasoPersona = computed(() => (CLAVES_PERSONA as readonly string[]).includes(pasoActual.value.id))
const configP = computed(() => CONFIG_PERSONAS.find((c) => c.id === pasoActual.value.id) ?? null)
/* La persona de la parte en pantalla (null si el paso no es de persona) */
const p = computed<DatosPersona | null>(() =>
  esPasoPersona.value ? personas[pasoActual.value.id as ClavePersona] : null,
)

/* Catálogos del paso de persona activo */
const distritosPersona = computed(() => (p.value ? distritosDe(p.value.departamento) : []))
const cantonesPersona = computed(() => (p.value ? cantonesDe(p.value.distrito) : null))

/* Ocupaciones (orden alfabético; "Otro (especifique)" al final) */
const OCUPACIONES = [
  'Abogado(a)',
  'Agricultor(a)',
  'Albañil',
  'Ama de casa',
  'Barbero(a)',
  'Cocinero(a)',
  'Comerciante',
  'Contador(a)',
  'Costurero(a)',
  'Dentista',
  'Doctor(a)',
  'Enfermero(a)',
  'Ingeniero(a)',
  'Jornalero(a)',
  'Maestro(a)',
  'Mecánico(a)',
  'Motorista',
  'Panadero(a)',
  'Peluquero(a)',
  'Pescador(a)',
  'Policía',
  'Secretario(a)',
  'Soldador(a)',
  'Vendedor(a)',
  'Vigilante',
]
const OPCIONES_OCUPACION: string[] = [
  ...[...OCUPACIONES].sort((a, b) => a.localeCompare(b, 'es')),
  OTRO_OCUPACION,
]

/* Caserío de Los Prados (select): N/A primero, Otro al final */
const OPCIONES_CASERIO_PERSONA: string[] = [NA, OTRO_CASERIO]

/* ── Parte 3: condición de discapacidad ── */
const DISCAPACIDAD_OPCIONES = [
  '0. Ninguno',
  '1. Ceguera',
  '2. Baja visión',
  '3. Sordera',
  '4. Hipoacusia',
  '5. Sordo-ceguera',
  '6. Discapacidad intelectual',
  '7. Discapacidad motora',
  '8. Síndrome de Down',
  '9. Ausencia de miembros',
  '10. Trastorno del espectro autista',
  '11. Multidiscapacidad',
  '12. Otros',
]
const NINGUNO_DISC = '0. Ninguno'
const OTROS_DISC = '12. Otros'
const NOTA_DISCAPACIDAD =
  'Hipoacusia: baja audición. Discapacidad intelectual: limitaciones significativas en el funcionamiento intelectual. ' +
  'Trastorno del espectro autista: grupo de trastornos del desarrollo que afectan la comunicación y el comportamiento. ' +
  'Multidiscapacidad y retos múltiples: presenta más de un tipo de discapacidad.'
const DIAGNOSTICO_OPCIONES = ['No Aplica', 'Sí', 'No']
const REFERIDO_OPCIONES = ['No Aplica', 'Docente de apoyo a la inclusión', 'Centro de Orientación y Recursos']
const SERVICIOS_OPCIONES = [
  'No Aplica',
  'Terapia de Lenguaje',
  'Terapia de audición y lenguaje',
  'Terapia de rehabilitación',
  'Fisioterapia',
  'Atención psicológica',
  'Atención neurológica',
  'Otro',
]
const NO_APLICA_SERV = 'No Aplica'
const OTRO_SERV = 'Otro'

const discapacidad = reactive({
  marcas: [] as string[],
  otrosTexto: '',
  diagnostico: '', /* No Aplica / Sí / No */
  referido: '',
  servicios: [] as string[],
  serviciosOtro: '',
})

/* ── Parte 4: convivencia familiar (una sola respuesta) ── */
const CONVIVENCIA_OPCIONES = [
  '1. Vive con madre y padre',
  '2. Vive solo con madre',
  '3. Vive solo con el padre',
  '4. Vive con madre y otro(s) familiar(es)',
  '5. Vive con padre y otro(s) familiar(es)',
  '6. Vive con madre y padrastro',
  '7. Vive con padre y madrastra',
  '8. Vive con familiar(es) distinto de padres',
  '9. No vive con familiares',
]
const convivencia = ref('')

/* ── Parte 5: ingreso familiar (puede marcar varias) ── */
const INGRESOS_OPCIONES = [
  '1. Trabajo remunerado formal',
  '2. Trabajo remunerado informal',
  '3. Remesa',
  '4. Negocio propio',
  '5. Apoyo del Gobierno',
  '6. Pensión',
  '7. Otro',
]
const OTRO_INGRESO = '7. Otro'
const ingresos = reactive({ marcas: [] as string[], otroTexto: '' })

/* ── Parte 6: vivienda (todas las listas permiten más de una marca) ── */
const ZONA_OPCIONES = ['Rural', 'Urbana']
const TENENCIA_OPCIONES = ['1. Propia', '2. Alquilada', '3. Prestada', '4. Otra']
const OTRO_TENENCIA = '4. Otra'
const PAREDES_OPCIONES = [
  '1. Concreto o mixto',
  '2. Madera',
  '3. Paja o palma',
  '4. No tiene paredes',
  '5. Bahareque',
  '6. Lámina metálica en buen estado',
  '7. Materiales de desecho',
  '8. Adobe',
  '9. Lámina metálica en mal estado',
  '10. Otros',
]
const OTROS_PAREDES = '10. Otros'
const PISO_OPCIONES = [
  '1. Ladrillo cerámico',
  '2. Cemento',
  '3. Ladrillo de cemento',
  '4. Tierra',
  '5. Ladrillo de barro',
  '6. Otros Materiales',
]
const OTROS_PISO = '6. Otros Materiales'
const TECHO_OPCIONES = [
  '1. Losa de concreto',
  '2. Lámina metálica en buen estado',
  '3. Materiales de desecho',
  '4. Teja de barro o cemento',
  '5. Lámina metálica en mal estado',
  '6. Paja o palma',
  '7. Lámina de asbesto o fibra cemento (durallita)',
  '8. No tiene techo',
  '9. Otra materia',
]
const OTRO_TECHO = '9. Otra materia'
const LUZ_OPCIONES = [
  '1. Electricidad',
  '2. Candela',
  '3. Conexión eléctrica del vecino',
  '4. Panel solar',
  '5. Lámpara Coleman',
  '6. Generador eléctrico',
  '7. Otra clase',
]
const OTRO_LUZ = '7. Otra clase'
const AGUA_OPCIONES = [
  '1. Cañería dentro de la vivienda (ANDA) privado',
  '2. Cañería dentro de la vivienda (pública)',
  '3. Pozo dentro de la propiedad',
  '4. Pozo fuera de la propiedad (uso comunitario)',
  '5. Pipa',
  '6. Río',
  '7. Quebrada',
  '8. Lago',
  '9. Ojo de agua',
  '10. Manantial',
  '11. Agua lluvia',
  '12. Otro',
]
const OTRO_AGUA = '12. Otro'
const SANITARIO_OPCIONES = [
  '1. Inodoro conectado a alcantarillado',
  '2. Letrina abonera',
  '3. Letrina solar',
  '4. Inodoro de fosa séptica',
  '5. Letrina de hoyo seco',
  '6. No aplica: N/A',
  '7. Otro',
]
const NO_APLICA_SANITARIO = '6. No aplica: N/A'
const OTRO_SANITARIO = '7. Otro'
const COMUNICACION_OPCIONES = [
  '1. Teléfono fijo',
  '2. Teléfono celular',
  '3. Internet',
  '4. Televisión',
  '5. Radio',
  '6. Correo electrónico',
  '7. Otros',
]
const OTROS_COMUNICACION = '7. Otros'

const vivienda = reactive({
  zona: '', /* Rural / Urbana */
  tenencia: '',
  tenenciaOtro: '',
  paredes: [] as string[],
  paredesOtro: '',
  piso: [] as string[],
  pisoOtro: '',
  techo: [] as string[],
  techoOtro: '',
  luz: [] as string[],
  luzOtro: '',
  agua: [] as string[],
  aguaOtro: '',
  sanitario: [] as string[],
  sanitarioOtro: '',
  comunicacion: [] as string[],
  comunicacionOtro: '',
})

/* ── Parte 7: hábitos del estudiante ── */
const CON_QUIEN_OPCIONES = ['Solo', 'Mamá y Papá', 'Mamá', 'Papá', 'Hermanos/as', 'Otros']
const OTROS_CON_QUIEN = 'Otros'
const ALIMENTOS_OPCIONES = [
  'Leche',
  'Verduras',
  'Frutas',
  'Res',
  'Pollo',
  'Arroz',
  'Jugos',
  'Frijoles',
  'Huevos',
  'Cerdo',
  'Pescado',
  'Otros',
]
const OTROS_ALIMENTOS = 'Otros'
const TIEMPOS_OPCIONES = ['Desayuno', 'Almuerzo', 'Cena']
const REFRIGERIOS_OPCIONES = ['1', '2', '3', 'Ninguno']

const habitos = reactive({
  suenoNoche: '',
  suenoDia: '',
  dificultadDormir: '', /* Sí / No */
  dificultadExplica: '',
  conQuienDuerme: [] as string[],
  conQuienOtro: '',
  lactancia: '', /* Sí / No */
  lactanciaMeses: '',
  cambiosAlimentacion: '', /* Sí / No */
  cambiosCual: '',
  alimentos: [] as string[],
  alimentosOtros: '',
  comidas: [] as string[], /* Desayuno / Almuerzo / Cena */
  refrigerios: '', /* 1 / 2 / 3 / Ninguno */
  alergia: '', /* Sí / No */
  alergicoCuales: '',
  preferidos: '',
})

/* ── Parte 8: participación y compromisos ── */
const PARTICIPACION_OPCIONES = [
  'Educativas',
  'Recreativas',
  'Salud',
  'Voluntariado de cocina',
  'Culturales',
  'Deportivas',
  'Higiene y Ornato',
]
const participacion = reactive({ actividades: [] as string[], observaciones: '' })

/* ── Parte 9: modalidad de atención ── */
const MODALIDAD_ATENCION = 'Institucional Primer Grado'
const docenteSugerido = auth.perfil?.nombre ?? ''
const modalidadAtencion = reactive({
  institucional: true,
  fechaInscripcion: hoyISO,
  docente: docenteSugerido,
})

/* ── Responsable (elegido en el modal al salir de la parte 2.4) ── */
const responsableElegido = ref<ClavePersona | ''>('')
const modalResponsable = ref(false)
const opcionesResponsable = ref<{ clave: ClavePersona; etiqueta: string; nombre: string }[]>([])
const responsableSeleccion = ref<ClavePersona | ''>('')
const errorResponsable = ref('')

/* ── Transformación de lo que se escribe (en vivo) ── */
function soloDigitos(valor: string): string {
  return valor.replace(/\D/g, '')
}

/* Nombres y apellidos: MAYÚSCULAS, sin números ni tildes; la ñ SÍ se acepta.
   La Ñ (N + tilde combinante) se preserva: se quitan los demás diacríticos. */
function soloNombre(valor: string): string {
  return valor
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, (c) => (c === '\u0303' ? c : ''))
    .normalize('NFC')
    .replace(/[^A-ZÑ ]/g, '')
    .replace(/ {2,}/g, ' ')
}

/* Textos libres en mayúsculas (nacionalidad, caserío "otro", lugar de trabajo):
   admite tildes y ñ, pero no números ni símbolos. */
function soloTexto(valor: string): string {
  return valor
    .toUpperCase()
    .replace(/[^A-ZÁÉÍÓÚÜÑ ]/g, '')
    .replace(/ {2,}/g, ' ')
}

/* Documento (madre/padre/otra): DUI, pasaporte u otro documento de otro
   país → mayúsculas con letras, números y guion (el formato del DUI). */
function soloDocumento(valor: string): string {
  return valor
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 20)
}

/* Horarios y textos que necesitan números y símbolos simples
   (p. ej. "9:00 PM - 6:00 AM") */
function soloLibre(valor: string): string {
  return valor
    .toUpperCase()
    .replace(/[^A-ZÁÉÍÓÚÜÑ0-9 :.\-,()/]/g, '')
    .replace(/ {2,}/g, ' ')
}

/* ── Errores de validación por campo (rojo) ── */
const errores = reactive<Record<string, string>>({})

function limpiarError(clave: string) {
  delete errores[clave]
}

/* Atajos para la parte de persona en pantalla: el prefijo del error es el
   id del paso (madre./padre./otra.) */
function eCampo(campo: string): string {
  return claseCampo(`${pasoActual.value.id}.${campo}`)
}

function eError(campo: string): string {
  return errores[`${pasoActual.value.id}.${campo}`] ?? ''
}

function eRadio(valor: string, opcion: string, campo: string): string {
  return claseRadio(valor, opcion, `${pasoActual.value.id}.${campo}`)
}

/* Handlers de la parte 2.1 (estudiante) */
function alNIE(evento: Event) {
  const campo = evento.target as HTMLInputElement
  form.nie = soloDigitos(campo.value)
  campo.value = form.nie
  limpiarError('nie')
}

function alNombres(evento: Event) {
  const campo = evento.target as HTMLInputElement
  form.nombres = soloNombre(campo.value)
  campo.value = form.nombres
  limpiarError('nombres')
}

function alApellidos(evento: Event) {
  const campo = evento.target as HTMLInputElement
  form.apellidos = soloNombre(campo.value)
  campo.value = form.apellidos
  limpiarError('apellidos')
}

function alNacionalidad(evento: Event) {
  const campo = evento.target as HTMLInputElement
  form.nacionalidad = soloTexto(campo.value)
  campo.value = form.nacionalidad
  limpiarError('nacionalidad')
}

function alCaserioOtro(evento: Event) {
  const campo = evento.target as HTMLInputElement
  form.caserioOtro = soloTexto(campo.value)
  campo.value = form.caserioOtro
  limpiarError('caserioOtro')
}

function alEdad(evento: Event) {
  const campo = evento.target as HTMLInputElement
  form.edad = soloDigitos(campo.value).slice(0, 2)
  campo.value = form.edad
  limpiarError('edad')
}

function alAnioGrado(evento: Event) {
  const campo = evento.target as HTMLInputElement
  form.anioGrado = soloDigitos(campo.value).slice(0, 4)
  campo.value = form.anioGrado
  limpiarError('anioGrado')
}

/* Último grado cursado: Inicial y Parvularia se excluyen entre sí —
   si se escribe en uno, el otro se limpia y se bloquea. Solo números. */
function alGradoInicial(evento: Event) {
  const campo = evento.target as HTMLInputElement
  form.gradoInicial = soloDigitos(campo.value).slice(0, 2)
  campo.value = form.gradoInicial
  if (form.gradoInicial) form.gradoParvularia = ''
  limpiarError('gradoCursado')
}

function alGradoParvularia(evento: Event) {
  const campo = evento.target as HTMLInputElement
  form.gradoParvularia = soloDigitos(campo.value).slice(0, 2)
  campo.value = form.gradoParvularia
  if (form.gradoParvularia) form.gradoInicial = ''
  limpiarError('gradoCursado')
}

function alCaserio() {
  if (form.caserio !== OTRO_CASERIO) {
    form.caserioOtro = ''
    limpiarError('caserioOtro')
  }
}

/* Handlers de las partes de persona (2.2, 2.3 y 2.4): todos trabajan sobre
   la persona del paso en pantalla (p) y usan el prefijo del paso en errores */

function alTienePersona(): void {
  if (!p.value) return
  const pref = pasoActual.value.id
  limpiarError(`${pref}.tiene`)
  if (p.value.tiene !== 'Sí') {
    /* "No": todo queda desactivado y en blanco */
    Object.assign(p.value, { ...PERSONA_VACIA, tiene: p.value.tiene })
    if (responsableElegido.value === pasoActual.value.id) responsableElegido.value = ''
  }
}

function alPersonaNombre(evento: Event): void {
  if (!p.value) return
  const campo = evento.target as HTMLInputElement
  p.value.nombre = soloNombre(campo.value)
  campo.value = p.value.nombre
  limpiarError(`${pasoActual.value.id}.nombre`)
}

function alPersonaEdad(evento: Event): void {
  if (!p.value) return
  const campo = evento.target as HTMLInputElement
  p.value.edad = soloDigitos(campo.value).slice(0, 2)
  campo.value = p.value.edad
  limpiarError(`${pasoActual.value.id}.edad`)
}

function alPersonaDocumento(evento: Event): void {
  if (!p.value) return
  const campo = evento.target as HTMLInputElement
  p.value.documento = soloDocumento(campo.value)
  campo.value = p.value.documento
  limpiarError(`${pasoActual.value.id}.documento`)
}

function alPersonaPais(): void {
  if (!p.value) return
  const pref = pasoActual.value.id
  limpiarError(`${pref}.pais`)
  if (p.value.pais !== 'El Salvador') {
    /* Si no es El Salvador: sin Departamento, Distrito, Cantón ni Caserío */
    p.value.departamento = ''
    p.value.distrito = ''
    p.value.canton = ''
    p.value.caserio = ''
    p.value.caserioOtro = ''
    for (const campo of ['departamento', 'distrito', 'canton', 'caserio', 'caserioOtro']) {
      limpiarError(`${pref}.${campo}`)
    }
  }
  /* El código telefónico se sincroniza con el país elegido (se puede cambiar) */
  if (p.value.pais) p.value.paisTelefono = p.value.pais
  alPersonaPaisTelefono()
}

function alPersonaDepartamento(): void {
  if (!p.value) return
  p.value.distrito = ''
  p.value.canton = ''
  p.value.caserio = ''
  p.value.caserioOtro = ''
  limpiarError(`${pasoActual.value.id}.departamento`)
}

function alPersonaDistrito(): void {
  if (!p.value) return
  const pref = pasoActual.value.id
  limpiarError(`${pref}.distrito`)
  p.value.caserioOtro = ''
  const cantones = cantonesDe(p.value.distrito)
  p.value.canton = cantones && cantones.length === 0 ? SIN_CANTON : ''
  p.value.caserio = p.value.canton === CANTON_LOS_PRADOS ? NA : ''
}

function alPersonaCantonTexto(evento: Event): void {
  if (!p.value) return
  const campo = evento.target as HTMLInputElement
  p.value.canton = soloTexto(campo.value)
  campo.value = p.value.canton
  limpiarError(`${pasoActual.value.id}.canton`)
}

function alPersonaCanton(): void {
  if (!p.value) return
  const pref = pasoActual.value.id
  limpiarError(`${pref}.canton`)
  p.value.caserio = p.value.canton === CANTON_LOS_PRADOS ? NA : ''
  p.value.caserioOtro = ''
}

function alPersonaCaserio(): void {
  if (!p.value) return
  if (p.value.caserio !== OTRO_CASERIO) p.value.caserioOtro = ''
  limpiarError(`${pasoActual.value.id}.caserio`)
  limpiarError(`${pasoActual.value.id}.caserioOtro`)
}

/* Texto libre del caserío cuando el cantón NO es Los Prados */
function alPersonaCaserioTexto(evento: Event): void {
  if (!p.value) return
  const campo = evento.target as HTMLInputElement
  p.value.caserio = soloTexto(campo.value)
  campo.value = p.value.caserio
  limpiarError(`${pasoActual.value.id}.caserio`)
}

/* Marca/quita N/A en el caserío de texto libre */
function alPersonaCaserioNA(): void {
  if (!p.value) return
  p.value.caserio = p.value.caserio === NA ? '' : NA
  if (p.value.caserio !== OTRO_CASERIO) p.value.caserioOtro = ''
  limpiarError(`${pasoActual.value.id}.caserio`)
  limpiarError(`${pasoActual.value.id}.caserioOtro`)
}

function alPersonaCaserioOtro(evento: Event): void {
  if (!p.value) return
  const campo = evento.target as HTMLInputElement
  p.value.caserioOtro = soloTexto(campo.value)
  campo.value = p.value.caserioOtro
  limpiarError(`${pasoActual.value.id}.caserioOtro`)
}

function alPersonaPaisTelefono(): void {
  if (!p.value) return
  const pref = pasoActual.value.id
  /* Al cambiar el código, los números ya escritos se reformatean */
  p.value.telefono = formatarTelefono(p.value.paisTelefono, p.value.telefono)
  p.value.whatsappCelular = formatarTelefono(p.value.paisTelefono, p.value.whatsappCelular)
  limpiarError(`${pref}.paisTelefono`)
  limpiarError(`${pref}.telefono`)
  limpiarError(`${pref}.whatsappCelular`)
}

function alPersonaTelefono(evento: Event): void {
  if (!p.value) return
  const campo = evento.target as HTMLInputElement
  p.value.telefono = formatarTelefono(p.value.paisTelefono, campo.value)
  campo.value = p.value.telefono
  limpiarError(`${pasoActual.value.id}.telefono`)
}

function alPersonaWhatsapp(): void {
  if (!p.value) return
  if (p.value.whatsapp === 'Sí') p.value.whatsappCelular = ''
  limpiarError(`${pasoActual.value.id}.whatsapp`)
  limpiarError(`${pasoActual.value.id}.whatsappCelular`)
}

function alPersonaWhatsappCelular(evento: Event): void {
  if (!p.value) return
  const campo = evento.target as HTMLInputElement
  p.value.whatsappCelular = formatarTelefono(p.value.paisTelefono, campo.value)
  campo.value = p.value.whatsappCelular
  limpiarError(`${pasoActual.value.id}.whatsappCelular`)
}

function alPersonaCorreo(evento: Event): void {
  if (!p.value) return
  const campo = evento.target as HTMLInputElement
  p.value.correo = campo.value.replace(/\s/g, '')
  campo.value = p.value.correo
}

function alPersonaEstudia(): void {
  if (!p.value) return
  if (p.value.estudia !== 'Sí') p.value.centroEducativo = ''
  limpiarError(`${pasoActual.value.id}.estudia`)
  limpiarError(`${pasoActual.value.id}.centroEducativo`)
}

function alPersonaCentro(evento: Event): void {
  if (!p.value) return
  const campo = evento.target as HTMLInputElement
  p.value.centroEducativo = soloTexto(campo.value)
  campo.value = p.value.centroEducativo
  limpiarError(`${pasoActual.value.id}.centroEducativo`)
}

/* Último grado cursado o que cursa: Parvularia, Básica, Media y Superior
   se excluyen entre sí (escribir en uno desactiva los demás);
   "Ninguno" es un check que los desactiva a todos. */
const CAMPOS_GRADO_PERSONA = ['gradoParvularia', 'gradoBasica', 'gradoMedia', 'gradoSuperior'] as const
type CampoGradoPersona = (typeof CAMPOS_GRADO_PERSONA)[number]

function alPersonaGrado(campo: CampoGradoPersona, evento: Event): void {
  if (!p.value) return
  const entrada = evento.target as HTMLInputElement
  p.value[campo] = soloDigitos(entrada.value).slice(0, 2)
  entrada.value = p.value[campo]
  if (p.value[campo]) {
    for (const otro of CAMPOS_GRADO_PERSONA) if (otro !== campo) p.value[otro] = ''
  }
  p.value.gradoNinguno = false
  limpiarError(`${pasoActual.value.id}.gradoCursado`)
}

function alPersonaGradoNinguno(): void {
  if (!p.value) return
  if (p.value.gradoNinguno) {
    for (const otro of CAMPOS_GRADO_PERSONA) p.value[otro] = ''
  }
  limpiarError(`${pasoActual.value.id}.gradoCursado`)
}

function alPersonaOcupacion(): void {
  if (!p.value) return
  if (p.value.ocupacion !== OTRO_OCUPACION) p.value.ocupacionOtro = ''
  limpiarError(`${pasoActual.value.id}.ocupacion`)
  limpiarError(`${pasoActual.value.id}.ocupacionOtro`)
}

function alPersonaOcupacionOtro(evento: Event): void {
  if (!p.value) return
  const campo = evento.target as HTMLInputElement
  p.value.ocupacionOtro = soloTexto(campo.value)
  campo.value = p.value.ocupacionOtro
  limpiarError(`${pasoActual.value.id}.ocupacionOtro`)
}

function alPersonaLugar(evento: Event): void {
  if (!p.value) return
  const campo = evento.target as HTMLInputElement
  p.value.lugarTrabajo = soloTexto(campo.value)
  campo.value = p.value.lugarTrabajo
  limpiarError(`${pasoActual.value.id}.lugarTrabajo`)
}

/* ── Casillas de verificación de las partes 3 a 9 ──
   v-model ya agregó/quió la opción; aquí se aplica la exclusividad
   (p. ej. "0. Ninguno" queda solo, "No Aplica" apaga las demás). */
function alCuadro(lista: string[], opcion: string, clave: string, exclusivo: string | null = null): void {
  if (exclusivo) {
    if (opcion === exclusivo) {
      const nueva = lista.includes(opcion) ? [opcion] : []
      lista.splice(0, lista.length, ...nueva)
    } else if (lista.includes(opcion)) {
      const i = lista.indexOf(exclusivo)
      if (i >= 0) lista.splice(i, 1)
    }
  }
  limpiarError(clave)
}

/* Handlers de las partes con campos de texto libres */
function alDiscapacidadOtros(evento: Event): void {
  const campo = evento.target as HTMLInputElement
  discapacidad.otrosTexto = soloTexto(campo.value)
  campo.value = discapacidad.otrosTexto
  limpiarError('discapacidad.otrosTexto')
}

function alServiciosOtro(evento: Event): void {
  const campo = evento.target as HTMLInputElement
  discapacidad.serviciosOtro = soloTexto(campo.value)
  campo.value = discapacidad.serviciosOtro
  limpiarError('discapacidad.serviciosOtro')
}

function alIngresoOtro(evento: Event): void {
  const campo = evento.target as HTMLInputElement
  ingresos.otroTexto = soloTexto(campo.value)
  campo.value = ingresos.otroTexto
  limpiarError('ingresos.otroTexto')
}

function alViviendaOtro(campoVivienda: 'tenenciaOtro' | 'paredesOtro' | 'pisoOtro' | 'techoOtro' | 'luzOtro' | 'aguaOtro' | 'sanitarioOtro' | 'comunicacionOtro', evento: Event, clave: string): void {
  const campo = evento.target as HTMLInputElement
  vivienda[campoVivienda] = soloTexto(campo.value)
  campo.value = vivienda[campoVivienda]
  limpiarError(clave)
}

function alHabitoTexto(campo: 'suenoNoche' | 'suenoDia' | 'dificultadExplica' | 'lactanciaMeses' | 'cambiosCual' | 'conQuienOtro' | 'alimentosOtros' | 'alergicoCuales' | 'preferidos', evento: Event, clave: string, conDigitos = false): void {
  const entrada = evento.target as HTMLInputElement
  habitos[campo] = conDigitos ? soloDigitos(entrada.value).slice(0, 2) : soloLibre(entrada.value)
  entrada.value = habitos[campo]
  limpiarError(clave)
}

function alObservaciones(evento: Event): void {
  const campo = evento.target as HTMLInputElement
  participacion.observaciones = soloLibre(campo.value)
  campo.value = participacion.observaciones
}

function alDocenteResponsable(evento: Event): void {
  const campo = evento.target as HTMLInputElement
  modalidadAtencion.docente = soloNombre(campo.value)
  campo.value = modalidadAtencion.docente
  limpiarError('modalidad.docente')
}

/* ── Borrador local (caché por si se apaga la computadora o hay un fallo) ──
   Mientras se escribe, TODO lo de esta matrícula queda guardado en el
   navegador. Al volver a entrar y encontrar borrador se abre la
   reconfirmación de recarga: ACEPTAR borra lo editado y deja limpio;
   CANCELAR recupera los datos y sigue donde quedó. El botón CANCELAR (en
   la barra de nivel) hace lo mismo. La clave es POR USUARIO. */
const CAMPOS_DRAFT: (keyof DatosEstudiante)[] = [
  'nie',
  'nombres',
  'apellidos',
  'fechaNacimiento',
  'edad',
  'sexo',
  'nacionalidad',
  'distrito',
  'canton',
  'caserioOtro',
  'grado',
  'gradoInicial',
  'gradoParvularia',
  'anioGrado',
  'partidaPosee',
  'partidaPresenta',
  'etnia',
]

interface BorradorMatricula {
  modalidad: Modalidad | null
  paso: number
  form: DatosEstudiante
  personas: Record<ClavePersona, DatosPersona>
  discapacidad: typeof discapacidad
  convivencia: string
  ingresos: typeof ingresos
  vivienda: typeof vivienda
  habitos: typeof habitos
  participacion: typeof participacion
  atencion: typeof modalidadAtencion
  responsable: ClavePersona | ''
}

function personaEscrita(persona: DatosPersona): boolean {
  return (
    persona.tiene !== '' ||
    persona.nombre !== '' ||
    persona.fechaNacimiento !== '' ||
    persona.edad !== '' ||
    persona.documento !== '' ||
    persona.pais !== '' ||
    persona.departamento !== '' ||
    persona.distrito !== '' ||
    persona.canton !== '' ||
    persona.caserio !== '' ||
    persona.caserioOtro !== '' ||
    persona.paisTelefono !== '' ||
    persona.telefono !== '' ||
    persona.whatsapp !== '' ||
    persona.whatsappCelular !== '' ||
    persona.correo !== '' ||
    persona.estudia !== '' ||
    persona.centroEducativo !== '' ||
    persona.gradoParvularia !== '' ||
    persona.gradoBasica !== '' ||
    persona.gradoMedia !== '' ||
    persona.gradoSuperior !== '' ||
    persona.gradoNinguno ||
    persona.ocupacion !== '' ||
    persona.ocupacionOtro !== '' ||
    persona.lugarTrabajo !== ''
  )
}

function seccionesEscritas(): boolean {
  return (
    discapacidad.marcas.length > 0 ||
    discapacidad.otrosTexto !== '' ||
    discapacidad.diagnostico !== '' ||
    discapacidad.referido !== '' ||
    discapacidad.servicios.length > 0 ||
    discapacidad.serviciosOtro !== '' ||
    convivencia.value !== '' ||
    ingresos.marcas.length > 0 ||
    ingresos.otroTexto !== '' ||
    vivienda.zona !== '' ||
    vivienda.tenencia !== '' ||
    vivienda.tenenciaOtro !== '' ||
    vivienda.paredes.length > 0 ||
    vivienda.paredesOtro !== '' ||
    vivienda.piso.length > 0 ||
    vivienda.pisoOtro !== '' ||
    vivienda.techo.length > 0 ||
    vivienda.techoOtro !== '' ||
    vivienda.luz.length > 0 ||
    vivienda.luzOtro !== '' ||
    vivienda.agua.length > 0 ||
    vivienda.aguaOtro !== '' ||
    vivienda.sanitario.length > 0 ||
    vivienda.sanitarioOtro !== '' ||
    vivienda.comunicacion.length > 0 ||
    vivienda.comunicacionOtro !== '' ||
    habitos.suenoNoche !== '' ||
    habitos.suenoDia !== '' ||
    habitos.dificultadDormir !== '' ||
    habitos.dificultadExplica !== '' ||
    habitos.conQuienDuerme.length > 0 ||
    habitos.conQuienOtro !== '' ||
    habitos.lactancia !== '' ||
    habitos.lactanciaMeses !== '' ||
    habitos.cambiosAlimentacion !== '' ||
    habitos.cambiosCual !== '' ||
    habitos.alimentos.length > 0 ||
    habitos.alimentosOtros !== '' ||
    habitos.comidas.length > 0 ||
    habitos.refrigerios !== '' ||
    habitos.alergia !== '' ||
    habitos.alergicoCuales !== '' ||
    habitos.preferidos !== '' ||
    participacion.actividades.length > 0 ||
    participacion.observaciones !== ''
  )
}

/* ¿El usuario ya escribió algo? Los campos fijos y los valores iniciales
   (departamento, caserío N/A, fecha/docente sugeridos) NO cuentan. */
function hayDatosEscritos(): boolean {
  const estudiante = CAMPOS_DRAFT.some((clave) => form[clave].trim() !== '')
  const gente = CLAVES_PERSONA.some((clave) => personaEscrita(personas[clave]))
  const atencionTocada =
    !modalidadAtencion.institucional ||
    modalidadAtencion.fechaInscripcion !== hoyISO ||
    modalidadAtencion.docente !== docenteSugerido
  return estudiante || gente || seccionesEscritas() || atencionTocada
}

function limpiarWizard(): void {
  modalidad.value = null
  paso.value = 0
  Object.assign(form, { ...FORM_VACIO })
  for (const clave of CLAVES_PERSONA) Object.assign(personas[clave], { ...PERSONA_VACIA })
  discapacidad.marcas = []
  discapacidad.otrosTexto = ''
  discapacidad.diagnostico = ''
  discapacidad.referido = ''
  discapacidad.servicios = []
  discapacidad.serviciosOtro = ''
  convivencia.value = ''
  ingresos.marcas = []
  ingresos.otroTexto = ''
  vivienda.zona = ''
  vivienda.tenencia = ''
  vivienda.tenenciaOtro = ''
  vivienda.paredes = []
  vivienda.paredesOtro = ''
  vivienda.piso = []
  vivienda.pisoOtro = ''
  vivienda.techo = []
  vivienda.techoOtro = ''
  vivienda.luz = []
  vivienda.luzOtro = ''
  vivienda.agua = []
  vivienda.aguaOtro = ''
  vivienda.sanitario = []
  vivienda.sanitarioOtro = ''
  vivienda.comunicacion = []
  vivienda.comunicacionOtro = ''
  habitos.suenoNoche = ''
  habitos.suenoDia = ''
  habitos.dificultadDormir = ''
  habitos.dificultadExplica = ''
  habitos.conQuienDuerme = []
  habitos.conQuienOtro = ''
  habitos.lactancia = ''
  habitos.lactanciaMeses = ''
  habitos.cambiosAlimentacion = ''
  habitos.cambiosCual = ''
  habitos.alimentos = []
  habitos.alimentosOtros = ''
  habitos.comidas = []
  habitos.refrigerios = ''
  habitos.alergia = ''
  habitos.alergicoCuales = ''
  habitos.preferidos = ''
  participacion.actividades = []
  participacion.observaciones = ''
  modalidadAtencion.institucional = true
  modalidadAtencion.fechaInscripcion = hoyISO
  modalidadAtencion.docente = auth.perfil?.nombre ?? docenteSugerido
  responsableElegido.value = ''
  for (const clave of Object.keys(errores)) delete errores[clave]
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
} = usarBorrador('matricular-primera-infancia', {
  capturar: (): BorradorMatricula | null => {
    if (!hayDatosEscritos()) return null
    return {
      modalidad: modalidad.value,
      paso: paso.value,
      form: { ...form },
      personas: {
        madre: { ...personas.madre },
        padre: { ...personas.padre },
        otra: { ...personas.otra },
      },
      discapacidad: { ...discapacidad },
      convivencia: convivencia.value,
      ingresos: { ...ingresos },
      vivienda: { ...vivienda },
      habitos: { ...habitos },
      participacion: { ...participacion },
      atencion: { ...modalidadAtencion },
      responsable: responsableElegido.value,
    }
  },
  restaurar: (datos: BorradorMatricula) => {
    modalidad.value = datos.modalidad ?? null
    paso.value = Math.min(Math.max(datos.paso ?? 0, 0), PASOS.length - 1)
    Object.assign(form, { ...FORM_VACIO, ...datos.form })
    for (const clave of CLAVES_PERSONA) {
      Object.assign(personas[clave], { ...PERSONA_VACIA, ...datos.personas?.[clave] })
    }
    Object.assign(discapacidad, datos.discapacidad ?? {})
    convivencia.value = datos.convivencia ?? ''
    Object.assign(ingresos, datos.ingresos ?? {})
    Object.assign(vivienda, datos.vivienda ?? {})
    Object.assign(habitos, datos.habitos ?? {})
    Object.assign(participacion, datos.participacion ?? {})
    Object.assign(modalidadAtencion, datos.atencion ?? {})
    responsableElegido.value = datos.responsable ?? ''
    /* Con la modalidad recuperada, el modal de elección ya no hace falta */
    if (modalidad.value) modalAbierto.value = false
  },
  limpiar: (motivo: 'recarga' | 'cancelar') => {
    void motivo
    limpiarWizard()
  },
})

/* Cada cambio (modalidad, paso o cualquier campo) queda en el local al instante */
vigilar(() => [
  modalidad.value,
  paso.value,
  form,
  personas,
  discapacidad,
  convivencia.value,
  ingresos,
  vivienda,
  habitos,
  participacion,
  modalidadAtencion,
  responsableElegido.value,
])

/* Al entrar a la vista: si quedó borrador, se pide la reconfirmación */
onMounted(revisarAlEntrar)

/* Botón CANCELAR (en la barra de nivel): mismo comportamiento que la
   reconfirmación de recarga. Si no se ha escrito nada, no se pregunta nada. */
function cancelarWizard(): void {
  if (hayDatosEscritos()) {
    pedirCancelarBorrador()
    return
  }
  limpiarWizard()
}

/* ── Validación: los requeridos (r) no dejan pasar a la siguiente parte ── */
function validarEstudiante(): Record<string, string> {
  const fallos: Record<string, string> = {}

  if (form.nie.length < 6) {
    fallos.nie = form.nie ? 'El NIE necesita al menos 6 dígitos.' : 'Ingresa el NIE del estudiante.'
  }
  if (!form.nombres.trim()) fallos.nombres = 'Ingresa los nombres.'
  if (!form.apellidos.trim()) fallos.apellidos = 'Ingresa los apellidos.'
  if (!form.fechaNacimiento) {
    fallos.fechaNacimiento = 'Selecciona la fecha de nacimiento.'
  } else if (form.fechaNacimiento > hoyISO) {
    fallos.fechaNacimiento = 'La fecha de nacimiento no puede ser futura.'
  }
  if (!form.edad) fallos.edad = 'Ingresa la edad.'
  if (!form.sexo) fallos.sexo = 'Selecciona el sexo (M o F).'
  if (!form.nacionalidad.trim()) fallos.nacionalidad = 'Ingresa la nacionalidad.'
  if (!form.distrito) fallos.distrito = 'Selecciona el distrito.'
  if (!form.canton) fallos.canton = 'Selecciona el cantón.'
  if (form.caserio === OTRO_CASERIO && !form.caserioOtro.trim()) {
    fallos.caserioOtro = 'Especifica el caserío.'
  }
  if (!form.grado) fallos.grado = 'Selecciona el grado que cursará.'
  if (!form.gradoInicial && !form.gradoParvularia) {
    fallos.gradoCursado = 'Escribe el último grado cursado en Inicial o en Parvularia.'
  }
  if (!/^\d{4}$/.test(form.anioGrado)) {
    fallos.anioGrado = form.anioGrado
      ? 'El año debe tener 4 dígitos.'
      : 'Ingresa el año en que lo cursó (4 dígitos).'
  } else if (Number(form.anioGrado) > ANIO_ACTUAL) {
    fallos.anioGrado = 'El año no puede ser posterior al actual.'
  }
  if (!form.partidaPosee) fallos.partidaPosee = 'Indica si posee partida de nacimiento.'
  if (!form.partidaPresenta) fallos.partidaPresenta = 'Indica si presenta partida de nacimiento.'
  if (!form.etnia) fallos.etnia = 'Selecciona la etnia.'

  return fallos
}

function validarPersona(clave: ClavePersona): Record<string, string> {
  const fallos: Record<string, string> = {}
  const persona = personas[clave]
  const pref = `${clave}.`

  if (!persona.tiene) {
    fallos[`${pref}tiene`] = 'Marca Sí o No.'
    return fallos
  }
  if (persona.tiene !== 'Sí') return fallos

  if (!persona.nombre.trim()) fallos[`${pref}nombre`] = 'Ingresa el nombre.'
  if (!persona.fechaNacimiento) {
    fallos[`${pref}fechaNacimiento`] = 'Selecciona la fecha de nacimiento.'
  } else if (persona.fechaNacimiento > hoyISO) {
    fallos[`${pref}fechaNacimiento`] = 'La fecha de nacimiento no puede ser futura.'
  }
  if (!persona.edad) fallos[`${pref}edad`] = 'Ingresa la edad.'
  if (persona.documento.length < 6) {
    fallos[`${pref}documento`] = persona.documento
      ? 'El documento necesita al menos 6 caracteres.'
      : 'Ingresa el documento (DUI, pasaporte u otro).'
  }
  if (!persona.pais) fallos[`${pref}pais`] = 'Selecciona el país.'

  if (persona.pais === 'El Salvador') {
    if (!persona.departamento) fallos[`${pref}departamento`] = 'Selecciona el departamento.'
    if (!persona.distrito) fallos[`${pref}distrito`] = 'Selecciona el distrito.'
    if (!persona.canton) {
      fallos[`${pref}canton`] =
        persona.departamento === DEPARTAMENTO_CHALATENANGO
          ? 'Selecciona el cantón.'
          : 'Escribe el cantón.'
    }
    if (!persona.caserio) fallos[`${pref}caserio`] = 'Escribe el caserío o marca N/A.'
    if (persona.caserio === OTRO_CASERIO && !persona.caserioOtro.trim()) {
      fallos[`${pref}caserioOtro`] = 'Especifica el caserío.'
    }
  }

  if (!persona.paisTelefono) fallos[`${pref}paisTelefono`] = 'Selecciona el código del país.'
  const definidos = paisPorNombre(persona.paisTelefono)?.digitos ?? 0
  if (!persona.telefono) {
    fallos[`${pref}telefono`] = 'Ingresa el número de teléfono.'
  } else if (definidos && soloDigitos(persona.telefono).length !== definidos) {
    fallos[`${pref}telefono`] = `El número necesita ${definidos} dígitos para ese país.`
  } else if (!definidos && soloDigitos(persona.telefono).length < 6) {
    fallos[`${pref}telefono`] = 'El número necesita al menos 6 dígitos.'
  }
  if (!persona.whatsapp) {
    fallos[`${pref}whatsapp`] = 'Indica si el teléfono tiene WhatsApp.'
  } else if (persona.whatsapp === 'No') {
    if (!persona.whatsappCelular) {
      fallos[`${pref}whatsappCelular`] = 'Ingresa el celular de WhatsApp.'
    } else if (definidos && soloDigitos(persona.whatsappCelular).length !== definidos) {
      fallos[`${pref}whatsappCelular`] = `El número necesita ${definidos} dígitos para ese país.`
    } else if (!definidos && soloDigitos(persona.whatsappCelular).length < 6) {
      fallos[`${pref}whatsappCelular`] = 'El número necesita al menos 6 dígitos.'
    }
  }

  if (!persona.estudia) {
    fallos[`${pref}estudia`] = 'Indica si actualmente estudia.'
  } else if (persona.estudia === 'Sí' && !persona.centroEducativo.trim()) {
    fallos[`${pref}centroEducativo`] = 'Ingresa el centro educativo.'
  }

  if (
    !persona.gradoNinguno &&
    !persona.gradoParvularia &&
    !persona.gradoBasica &&
    !persona.gradoMedia &&
    !persona.gradoSuperior
  ) {
    fallos[`${pref}gradoCursado`] = 'Marca Ninguno o escribe el número de un grado.'
  }

  if (!persona.ocupacion) fallos[`${pref}ocupacion`] = 'Selecciona la ocupación.'
  if (persona.ocupacion === OTRO_OCUPACION && !persona.ocupacionOtro.trim()) {
    fallos[`${pref}ocupacionOtro`] = 'Especifica la ocupación.'
  }
  if (!persona.lugarTrabajo.trim()) fallos[`${pref}lugarTrabajo`] = 'Ingresa el lugar de trabajo.'

  return fallos
}

function validarDiscapacidad(): Record<string, string> {
  const fallos: Record<string, string> = {}
  if (discapacidad.marcas.length === 0) fallos['discapacidad.marcas'] = 'Marca al menos una opción.'
  if (discapacidad.marcas.includes(OTROS_DISC) && !discapacidad.otrosTexto.trim()) {
    fallos['discapacidad.otrosTexto'] = 'Especifica la discapacidad.'
  }
  if (!discapacidad.diagnostico) fallos['discapacidad.diagnostico'] = 'Selecciona una opción.'
  if (!discapacidad.referido) fallos['discapacidad.referido'] = 'Selecciona una opción.'
  if (discapacidad.servicios.length === 0) fallos['discapacidad.servicios'] = 'Marca al menos una opción.'
  if (discapacidad.servicios.includes(OTRO_SERV) && !discapacidad.serviciosOtro.trim()) {
    fallos['discapacidad.serviciosOtro'] = 'Especifica el servicio.'
  }
  return fallos
}

function validarConvivencia(): Record<string, string> {
  const fallos: Record<string, string> = {}
  if (!convivencia.value) fallos['convivencia.marcas'] = 'Marca con una X la situación del estudiante.'
  return fallos
}

function validarIngresos(): Record<string, string> {
  const fallos: Record<string, string> = {}
  if (ingresos.marcas.length === 0) fallos['ingresos.marcas'] = 'Marca al menos una fuente de ingreso.'
  if (ingresos.marcas.includes(OTRO_INGRESO) && !ingresos.otroTexto.trim()) {
    fallos['ingresos.otroTexto'] = 'Especifica el ingreso.'
  }
  return fallos
}

function validarVivienda(): Record<string, string> {
  const fallos: Record<string, string> = {}
  if (!vivienda.zona) fallos['vivienda.zona'] = 'Selecciona la zona.'
  if (!vivienda.tenencia) fallos['vivienda.tenencia'] = 'Selecciona la condición de posesión.'
  if (vivienda.tenencia === OTRO_TENENCIA && !vivienda.tenenciaOtro.trim()) {
    fallos['vivienda.tenenciaOtro'] = 'Especifica la condición.'
  }
  if (vivienda.paredes.length === 0) fallos['vivienda.paredes'] = 'Marca al menos una opción.'
  if (vivienda.paredes.includes(OTROS_PAREDES) && !vivienda.paredesOtro.trim()) {
    fallos['vivienda.paredesOtro'] = 'Especifica el material.'
  }
  if (vivienda.piso.length === 0) fallos['vivienda.piso'] = 'Marca al menos una opción.'
  if (vivienda.piso.includes(OTROS_PISO) && !vivienda.pisoOtro.trim()) {
    fallos['vivienda.pisoOtro'] = 'Especifica el material.'
  }
  if (vivienda.techo.length === 0) fallos['vivienda.techo'] = 'Marca al menos una opción.'
  if (vivienda.techo.includes(OTRO_TECHO) && !vivienda.techoOtro.trim()) {
    fallos['vivienda.techoOtro'] = 'Especifica el material.'
  }
  if (vivienda.luz.length === 0) fallos['vivienda.luz'] = 'Marca al menos una opción.'
  if (vivienda.luz.includes(OTRO_LUZ) && !vivienda.luzOtro.trim()) {
    fallos['vivienda.luzOtro'] = 'Especifica el servicio.'
  }
  if (vivienda.agua.length === 0) fallos['vivienda.agua'] = 'Marca al menos una opción.'
  if (vivienda.agua.includes(OTRO_AGUA) && !vivienda.aguaOtro.trim()) {
    fallos['vivienda.aguaOtro'] = 'Especifica el servicio.'
  }
  if (vivienda.sanitario.length === 0) fallos['vivienda.sanitario'] = 'Marca al menos una opción.'
  if (vivienda.sanitario.includes(OTRO_SANITARIO) && !vivienda.sanitarioOtro.trim()) {
    fallos['vivienda.sanitarioOtro'] = 'Especifica el tipo.'
  }
  if (vivienda.comunicacion.length === 0) fallos['vivienda.comunicacion'] = 'Marca al menos una opción.'
  if (vivienda.comunicacion.includes(OTROS_COMUNICACION) && !vivienda.comunicacionOtro.trim()) {
    fallos['vivienda.comunicacionOtro'] = 'Especifica el medio.'
  }
  return fallos
}

function validarHabitos(): Record<string, string> {
  const fallos: Record<string, string> = {}
  if (!habitos.suenoNoche.trim()) fallos['habitos.suenoNoche'] = 'Escribe el horario de sueño por la noche.'
  if (!habitos.dificultadDormir) fallos['habitos.dificultadDormir'] = 'Selecciona Sí o No.'
  if (habitos.dificultadDormir === 'Sí' && !habitos.dificultadExplica.trim()) {
    fallos['habitos.dificultadExplica'] = 'Explica la dificultad.'
  }
  if (habitos.conQuienDuerme.length === 0) fallos['habitos.conQuienDuerme'] = 'Marca al menos una opción.'
  if (habitos.conQuienDuerme.includes(OTROS_CON_QUIEN) && !habitos.conQuienOtro.trim()) {
    fallos['habitos.conQuienOtro'] = 'Especifica con quién duerme.'
  }
  if (!habitos.lactancia) fallos['habitos.lactancia'] = 'Selecciona Sí o No.'
  if (habitos.lactancia === 'Sí' && !habitos.lactanciaMeses) {
    fallos['habitos.lactanciaMeses'] = 'Ingresa cuántos meses.'
  }
  if (!habitos.cambiosAlimentacion) fallos['habitos.cambiosAlimentacion'] = 'Selecciona Sí o No.'
  if (habitos.cambiosAlimentacion === 'Sí' && !habitos.cambiosCual.trim()) {
    fallos['habitos.cambiosCual'] = 'Explica qué cambió.'
  }
  if (habitos.alimentos.length === 0) fallos['habitos.alimentos'] = 'Marca al menos un alimento.'
  if (habitos.alimentos.includes(OTROS_ALIMENTOS) && !habitos.alimentosOtros.trim()) {
    fallos['habitos.alimentosOtros'] = 'Especifica el alimento.'
  }
  if (habitos.comidas.length === 0) fallos['habitos.comidas'] = 'Marca al menos un tiempo de comida.'
  if (!habitos.refrigerios) fallos['habitos.refrigerios'] = 'Selecciona cuántos refrigerios realiza.'
  if (!habitos.alergia) fallos['habitos.alergia'] = 'Selecciona Sí o No.'
  if (habitos.alergia === 'Sí' && !habitos.alergicoCuales.trim()) {
    fallos['habitos.alergicoCuales'] = 'Escribe a cuál(es) alimento(s) es alérgico.'
  }
  return fallos
}

function validarParticipacion(): Record<string, string> {
  const fallos: Record<string, string> = {}
  if (participacion.actividades.length === 0) {
    fallos['participacion.actividades'] = 'Marca al menos una actividad.'
  }
  return fallos
}

function validarAtencion(): Record<string, string> {
  const fallos: Record<string, string> = {}
  if (!modalidadAtencion.institucional) {
    fallos['modalidad.institucional'] = 'Marca la modalidad de atención.'
  }
  if (!modalidadAtencion.fechaInscripcion) {
    fallos['modalidad.fechaInscripcion'] = 'Selecciona la fecha de inscripción.'
  } else if (modalidadAtencion.fechaInscripcion > hoyISO) {
    fallos['modalidad.fechaInscripcion'] = 'La fecha de inscripción no puede ser futura.'
  }
  if (!modalidadAtencion.docente.trim()) {
    fallos['modalidad.docente'] = 'Ingresa el nombre del o la docente responsable.'
  }
  return fallos
}

function validarParteActual(): boolean {
  if (paso.value === 0) {
    if (centroFaltante.value.length > 0) {
      ui.notificar(
        'error',
        'La información del centro está incompleta: complétala en Configuración › Informacion CE.',
      )
      return false
    }
    return true
  }

  let fallos: Record<string, string> = {}
  switch (pasoActual.value.id) {
    case 'estudiante':
      fallos = validarEstudiante()
      break
    case 'madre':
      fallos = validarPersona('madre')
      break
    case 'padre':
      fallos = validarPersona('padre')
      break
    case 'otra':
      fallos = validarPersona('otra')
      break
    case 'discapacidad':
      fallos = validarDiscapacidad()
      break
    case 'convivencia':
      fallos = validarConvivencia()
      break
    case 'ingresos':
      fallos = validarIngresos()
      break
    case 'vivienda':
      fallos = validarVivienda()
      break
    case 'habitos':
      fallos = validarHabitos()
      break
    case 'participacion':
      fallos = validarParticipacion()
      break
    case 'modalidad':
      fallos = validarAtencion()
      break
  }

  for (const clave of Object.keys(errores)) delete errores[clave]
  Object.assign(errores, fallos)
  if (Object.keys(fallos).length > 0) {
    ui.notificar('error', 'Faltan campos requeridos: revisa lo marcado en rojo.')
    return false
  }
  return true
}

/* ── Modal del RESPONSABLE (al darle Siguiente en la parte 2.4) ──
   Según las personas que se llenaron, se ofrece elegir quién será el
   responsable del estudiante. */
function abrirModalResponsable(): void {
  const opciones = CONFIG_PERSONAS.filter(
    (config) => personas[config.id].tiene === 'Sí' && personas[config.id].nombre.trim() !== '',
  ).map((config) => ({
    clave: config.id,
    etiqueta: config.etiqueta,
    nombre: personas[config.id].nombre,
  }))
  if (opciones.length === 0) {
    ui.notificar(
      'precaucion',
      'Debes llenar los datos de al menos una persona (madre, padre u otra) para elegir al responsable.',
    )
    return
  }
  opcionesResponsable.value = opciones
  responsableSeleccion.value = opciones.some((o) => o.clave === responsableElegido.value)
    ? responsableElegido.value
    : ''
  errorResponsable.value = ''
  modalResponsable.value = true
}

function confirmarResponsable(): void {
  if (!responsableSeleccion.value) {
    errorResponsable.value = 'Elige quién será el responsable del estudiante.'
    return
  }
  responsableElegido.value = responsableSeleccion.value
  modalResponsable.value = false
  paso.value = Math.min(paso.value + 1, PASOS.length - 1)
}

function cerrarModalResponsable(): void {
  modalResponsable.value = false
}

function siguiente() {
  if (!validarParteActual()) return
  /* Al salir de la parte 2.4 se elige al responsable en un modal */
  if (pasoActual.value.id === 'otra') {
    abrirModalResponsable()
    return
  }
  if (paso.value < PASOS.length - 1) paso.value += 1
}

function anterior() {
  paso.value = Math.max(0, paso.value - 1)
}

/* ── Guardar (parte 9): Sheet "estudiantes" + Firebase ── */

/* Correo que se usará como respaldo para los correos en blanco:
   el del estudiante (NIE@clases.edu.sv) */
const correoEstudiante = computed(() =>
  form.nie ? `${form.nie}@clases.edu.sv`.toLowerCase() : '',
)

/* El cantón "sin cantones" y los caseríos N/A se guardan en blanco */
function valorCanton(canton: string): string {
  return canton === SIN_CANTON ? '' : canton
}

function valorCaserio(caserio: string, otro: string): string {
  if (caserio === NA) return ''
  if (caserio === OTRO_CASERIO) return otro
  return caserio
}

function columnasPersona(
  persona: DatosPersona,
  sufijo: string,
  pregunta: string,
): Record<string, string> {
  const esSV = persona.pais === 'El Salvador'
  return {
    [pregunta]: persona.tiene,
    [`Nombre (${sufijo})`]: persona.nombre,
    [`Fecha de nacimiento (${sufijo})`]: fechaCorta(persona.fechaNacimiento),
    [`Edad (${sufijo})`]: persona.edad,
    [`Documento (${sufijo})`]: persona.documento,
    [`País (${sufijo})`]: persona.pais,
    [`Departamento (${sufijo})`]: esSV ? persona.departamento : '',
    [`Distrito (${sufijo})`]: esSV ? persona.distrito : '',
    [`Cantón (${sufijo})`]: esSV ? valorCanton(persona.canton) : '',
    [`Caserío (${sufijo})`]: esSV ? valorCaserio(persona.caserio, persona.caserioOtro) : '',
    [`Caserío especifique (${sufijo})`]:
      esSV && persona.caserio === OTRO_CASERIO ? persona.caserioOtro : '',
    [`Código de teléfono (${sufijo})`]: codigoTelefono(persona.paisTelefono),
    [`Teléfono (${sufijo})`]: persona.telefono,
    [`¿Tiene WhatsApp? (${sufijo})`]: persona.whatsapp,
    [`Celular de WhatsApp (${sufijo})`]:
      persona.whatsapp === 'No'
        ? `${codigoTelefono(persona.paisTelefono)} ${persona.whatsappCelular}`.trim()
        : '',
    [`Correo electrónico (${sufijo})`]: persona.correo.trim() || correoEstudiante.value,
    [`¿Actualmente estudia? (${sufijo})`]: persona.estudia,
    [`Centro educativo (${sufijo})`]: persona.estudia === 'Sí' ? persona.centroEducativo : '',
    [`Último grado cursado Parvularia (${sufijo})`]: persona.gradoParvularia,
    [`Último grado cursado Básica (${sufijo})`]: persona.gradoBasica,
    [`Último grado cursado Media (${sufijo})`]: persona.gradoMedia,
    [`Último grado cursado Superior (${sufijo})`]: persona.gradoSuperior,
    [`Último grado Ninguno (${sufijo})`]: persona.gradoNinguno ? 'X' : '',
    [`Ocupación (${sufijo})`]: persona.ocupacion === OTRO_OCUPACION ? '' : persona.ocupacion,
    [`Ocupación especifique (${sufijo})`]:
      persona.ocupacion === OTRO_OCUPACION ? persona.ocupacionOtro : '',
    [`Lugar de trabajo (${sufijo})`]: persona.lugarTrabajo,
  }
}

/* Todas las columnas de la fila del libro (el orden lo dan los ENCABEZADOS) */
function columnasMatricula(): Record<string, string> {
  const etiquetaResponsable =
    CONFIG_PERSONAS.find((c) => c.id === responsableElegido.value)?.etiqueta ?? ''
  return {
    'Fecha de registro': fechaHora(new Date()),
    NIE: form.nie,
    Nombres: form.nombres,
    Apellidos: form.apellidos,
    'Fecha de nacimiento (estudiante)': fechaCorta(form.fechaNacimiento),
    'Edad (estudiante)': form.edad,
    Sexo: form.sexo,
    Nacionalidad: form.nacionalidad,
    'Departamento (estudiante)': form.departamento,
    'Distrito (estudiante)': form.distrito,
    'Cantón (estudiante)': form.canton,
    'Caserío (estudiante)': valorCaserio(form.caserio, form.caserioOtro),
    'Caserío especifique (estudiante)': form.caserio === OTRO_CASERIO ? form.caserioOtro : '',
    'Grado que cursa': form.grado,
    'Grado (id)': String(idDeGrado(form.grado) ?? ''),
    'Último grado cursado (Inicial)': form.gradoInicial,
    'Último grado cursado (Parvularia)': form.gradoParvularia,
    'Año que lo cursó': form.anioGrado,
    'Posee partida de nacimiento': form.partidaPosee,
    'Presenta partida de nacimiento': form.partidaPresenta,
    Etnia: form.etnia === NA ? '' : form.etnia,
    ...columnasPersona(personas.madre, 'madre', '¿Tiene madre?'),
    ...columnasPersona(personas.padre, 'padre', '¿Tiene padre?'),
    ...columnasPersona(personas.otra, 'otra persona', '¿Otra persona acompañará al niño o niña?'),
    'Responsable elegido': etiquetaResponsable,
    'Condición de discapacidad': discapacidad.marcas.join(', '),
    'Otros discapacidad (especifique)': discapacidad.marcas.includes(OTROS_DISC)
      ? discapacidad.otrosTexto
      : '',
    '3.1 ¿Posee diagnóstico clínico?': discapacidad.diagnostico,
    '3.2 Ha sido referido a': discapacidad.referido,
    '3.3 Servicios que recibe': discapacidad.servicios.join(', '),
    '3.3 Otro (especifique)': discapacidad.servicios.includes(OTRO_SERV)
      ? discapacidad.serviciosOtro
      : '',
    '4. Convivencia familiar': convivencia.value,
    '5. Ingreso familiar': ingresos.marcas.join(', '),
    '5. Otro (especifique)': ingresos.marcas.includes(OTRO_INGRESO) ? ingresos.otroTexto : '',
    '6.1 Zona': vivienda.zona,
    '6.1 Condición de posesión': vivienda.tenencia,
    '6.1 Otra (especifique)': vivienda.tenencia === OTRO_TENENCIA ? vivienda.tenenciaOtro : '',
    '6.2 Material de las paredes': vivienda.paredes.join(', '),
    '6.2 Otros (especifique)': vivienda.paredes.includes(OTROS_PAREDES) ? vivienda.paredesOtro : '',
    '6.3 Material del piso': vivienda.piso.join(', '),
    '6.3 Otros materiales (especifique)': vivienda.piso.includes(OTROS_PISO) ? vivienda.pisoOtro : '',
    '6.4 Material del techo': vivienda.techo.join(', '),
    '6.4 Otra materia (especifique)': vivienda.techo.includes(OTRO_TECHO) ? vivienda.techoOtro : '',
    '6.5 Servicios de luz y otros': vivienda.luz.join(', '),
    '6.5 Otra clase (especifique)': vivienda.luz.includes(OTRO_LUZ) ? vivienda.luzOtro : '',
    '6.6 Servicio básico de agua': vivienda.agua.join(', '),
    '6.6 Otro (especifique)': vivienda.agua.includes(OTRO_AGUA) ? vivienda.aguaOtro : '',
    '6.7 Servicio sanitario': vivienda.sanitario.join(', '),
    '6.7 Otro (especifique)': vivienda.sanitario.includes(OTRO_SANITARIO)
      ? vivienda.sanitarioOtro
      : '',
    '6.8 Medios de comunicación del hogar': vivienda.comunicacion.join(', '),
    '6.8 Otros (especifique)': vivienda.comunicacion.includes(OTROS_COMUNICACION)
      ? vivienda.comunicacionOtro
      : '',
    '7.1 Horario de sueño por la noche': habitos.suenoNoche,
    '7.1 Horario de sueño durante el día': habitos.suenoDia,
    '7.1 Dificultad para dormir': habitos.dificultadDormir,
    '7.1 Explique': habitos.dificultadDormir === 'Sí' ? habitos.dificultadExplica : '',
    '7.1 Con quién duerme': habitos.conQuienDuerme.join(', '),
    '7.1 Otros (especifique)': habitos.conQuienDuerme.includes(OTROS_CON_QUIEN)
      ? habitos.conQuienOtro
      : '',
    '7.2 Lactancia materna exclusiva': habitos.lactancia,
    '7.2 ¿Cuánto tiempo (meses)?': habitos.lactancia === 'Sí' ? habitos.lactanciaMeses : '',
    '7.2 Cambios que afectan su alimentación': habitos.cambiosAlimentacion,
    '7.2 ¿Cuál?': habitos.cambiosAlimentacion === 'Sí' ? habitos.cambiosCual : '',
    '7.3 Alimentos que consume': habitos.alimentos.join(', '),
    '7.3 Otros (especifique)': habitos.alimentos.includes(OTROS_ALIMENTOS)
      ? habitos.alimentosOtros
      : '',
    '7.4 Tiempos de comida': habitos.comidas.join(', '),
    '7.5 Refrigerios': habitos.refrigerios,
    '7.6 ¿Es alérgico a algún alimento?': habitos.alergia,
    '7.6.1 ¿A cuál(es)?': habitos.alergia === 'Sí' ? habitos.alergicoCuales : '',
    '7.8 Alimentos que prefiere': habitos.preferidos,
    '8. Actividades donde apoyará': participacion.actividades.join(', '),
    '8. Observaciones': participacion.observaciones,
    '9. Modalidad de atención': modalidadAtencion.institucional ? MODALIDAD_ATENCION : '',
    '9. Fecha de inscripción (dd/mm/aaaa)': fechaCorta(modalidadAtencion.fechaInscripcion),
    '9. Nombre del o la docente responsable': modalidadAtencion.docente,
  }
}

async function guardarTodo(): Promise<void> {
  const fallos = validarAtencion()
  for (const clave of Object.keys(errores)) delete errores[clave]
  Object.assign(errores, fallos)
  if (Object.keys(fallos).length > 0) {
    ui.notificar('error', 'Faltan campos requeridos: revisa lo marcado en rojo.')
    return
  }
  const responsable = responsableElegido.value
  if (!responsable || personas[responsable].tiene !== 'Sí') {
    ui.notificar(
      'error',
      'Falta elegir a la persona responsable: vuelve a la parte 2.4 y presiona Siguiente.',
    )
    return
  }

  ui.iniciarCarga('Guardando la matrícula…')
  try {
    /* 1) Sheet "estudiantes": TODOS los datos (una fila por estudiante) */
    await guardarEstudiante(columnasMatricula())

    /* 2) Firebase: SOLO los datos importantes */
    const datosResponsable = personas[responsable]
    await crearEstudiante({
      nombres: form.nombres,
      apellidos: form.apellidos,
      nie: form.nie,
      fechaNacimiento: form.fechaNacimiento,
      grado: form.grado,
      gradoId: idDeGrado(form.grado) ?? 0,
      responsable: datosResponsable.nombre,
      documento: datosResponsable.documento,
      telefono: `${codigoTelefono(datosResponsable.paisTelefono)} ${datosResponsable.telefono}`.trim(),
    })

    ui.notificar('exito', 'Matrícula guardada en el Sheet "estudiantes" y en Firebase.')
    olvidarBorrador()
    limpiarWizard()
  } catch (e) {
    ui.notificar('error', `No se pudo guardar la matrícula: ${mensajeError(e)}`)
  } finally {
    ui.terminarCarga()
  }
}

/* ── Clases visuales compartidas ── */
const CLASE_CAMPO =
  'w-full rounded-lg border px-3 py-2 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-primario focus:ring-2 focus:ring-primario/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400'

function claseCampo(clave: string): string {
  return errores[clave]
    ? `${CLASE_CAMPO} border-red-400 ring-2 ring-red-100`
    : `${CLASE_CAMPO} border-slate-300`
}

function claseRadio(valor: string, opcion: string, clave: string): string {
  const base =
    'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors'
  const estado =
    valor === opcion
      ? 'border-primario bg-primario-suave font-semibold text-primario'
      : 'border-slate-300 text-slate-600 hover:border-primario hover:bg-primario-suave/50'
  const fallo = errores[clave] && !valor ? ' border-red-300' : ''
  return `${base} ${estado}${fallo}`
}

function claseCuadro(marcada: boolean, clave: string): string {
  const base =
    'flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm transition-colors'
  const estado = marcada
    ? 'border-primario bg-primario-suave font-semibold text-primario'
    : 'border-slate-300 text-slate-600 hover:border-primario hover:bg-primario-suave/50'
  const fallo = errores[clave] ? ' border-red-300' : ''
  return `${base} ${estado}${fallo}`
}

const iconoIzquierda = svg('<path d="m15 18-6-6 6-6"/>', 'h-4 w-4')
const iconoDerecha = svg('<path d="m9 18 6-6-6-6"/>', 'h-4 w-4')
const iconoGuardar = svg(
  '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
  'h-4 w-4',
)
</script>

<template>
  <section class="space-y-4">
    <!-- Sin modalidad elegida todavía -->
    <div
      v-if="!opcionElegida"
      class="grid place-items-center gap-4 rounded-xl border border-dashed border-slate-300 p-10 text-center"
    >
      <p class="max-w-sm text-sm text-slate-500">
        Antes de matricular, elige la modalidad: cada una tiene su propio proceso.
      </p>
      <button
        type="button"
        class="rounded-lg bg-primario px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primario-oscuro"
        @click="modalAbierto = true"
      >
        Seleccionar modalidad
      </button>
    </div>

    <!-- Con modalidad elegida -->
    <template v-else>
      <!-- ELECCIÓN DE NIVEL: FIJA, no se corre al hacer scroll (regla del
           proyecto: solo se desplaza el contenido del rectángulo). Aquí viven
           los botones CAMBIAR y CANCELAR. sticky dentro del rectángulo; el
           fondo blanco tapa lo que pasa por debajo. -->
      <div class="sticky top-0 z-10 -mx-3 bg-white px-3 pt-3 pb-2 md:-mx-4 md:px-4 md:pt-4">
        <div
          class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-primario-suave/60 px-4 py-3"
        >
          <div class="flex items-center gap-3">
            <span
              class="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-white text-primario"
              v-html="opcionElegida.icono"
            ></span>
            <div>
              <p class="text-sm font-bold text-slate-900">{{ opcionElegida.nombre }}</p>
              <p class="text-xs text-slate-500">{{ opcionElegida.descripcion }}</p>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <button
              type="button"
              class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              @click="modalAbierto = true"
            >
              Cambiar
            </button>
            <button
              type="button"
              class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              @click="cancelarWizard"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>

      <!-- ═══ PRIMERA INFANCIA: asistente por partes ═══ -->
      <template v-if="modalidad === 'primera-infancia'">
        <div class="rounded-xl border border-slate-200 bg-white">
          <!-- Encabezado del paso -->
          <div class="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wide text-primario">
                {{ pasoActual.etiqueta }}
              </p>
              <h3 class="text-sm font-bold text-slate-900">{{ pasoActual.titulo }}</h3>
            </div>
            <div class="flex shrink-0 items-center gap-1.5">
              <span
                v-for="(pasoItem, i) in PASOS"
                :key="pasoItem.id"
                class="h-2 rounded-full transition-all"
                :class="
                  i === paso
                    ? 'w-6 bg-primario'
                    : i < paso
                      ? 'w-2 bg-primario/40'
                      : 'w-2 bg-slate-200'
                "
              ></span>
              <span class="ml-1 text-xs font-semibold text-slate-400">
                {{ paso + 1 }} de {{ PASOS.length }}
              </span>
            </div>
          </div>

          <!-- Contenido del paso -->
          <div class="p-4 sm:p-5">
            <!-- ══ Parte 1: datos del centro (leídos del Sheet, no editables) ══ -->
            <div v-if="paso === 0" class="space-y-4">
              <div
                v-if="!sheetConfigurado"
                class="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
              >
                Falta configurar la URL del Sheet de configuración
                <span class="font-semibold">VITE_SHEET_CONFIGURACION_URL</span> para poder leer los
                datos del centro.
              </div>
              <div
                v-else-if="centroError"
                class="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
              >
                No se pudo leer la información del centro: {{ centroError }}.
                <button
                  type="button"
                  class="font-semibold text-primario underline"
                  @click="cargarCentro"
                >
                  Reintentar
                </button>
              </div>

              <dl class="grid gap-x-6 gap-y-5 sm:grid-cols-2">
                <div v-for="campo in CAMPOS_CENTRO" :key="campo.clave">
                  <dt class="text-xs font-semibold text-slate-600">{{ campo.etiqueta }}</dt>
                  <dd class="mt-1 min-h-6 whitespace-pre-wrap break-words text-sm text-slate-900">
                    {{ centro[campo.clave] }}
                  </dd>
                </div>
              </dl>

              <p class="text-xs text-slate-500">
                Estos datos vienen del Sheet de configuración y aquí no se pueden editar: se cambian
                en Configuración › Informacion CE.
              </p>

              <div
                v-if="sheetConfigurado && !centroError && centroFaltante.length > 0"
                class="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
              >
                Información incompleta: falta {{ centroFaltante.join(', ') }}. No se puede continuar
                hasta completarla en Configuración › Informacion CE.
              </div>
            </div>

            <!-- ══ Parte 2.1: datos del estudiante ══ -->
            <div v-else-if="pasoActual.id === 'estudiante'" class="space-y-5">
              <p class="text-xs text-slate-500">
                Los campos marcados con <span class="font-bold text-red-500">*</span> son
                requeridos: no se puede continuar sin ellos.
              </p>

              <div class="grid gap-x-6 gap-y-5 sm:grid-cols-2">
                <!-- NIE -->
                <div>
                  <label for="m-nie" class="text-xs font-semibold text-slate-600">
                    NIE <span class="text-red-500">*</span>
                  </label>
                  <input
                    id="m-nie"
                    :value="form.nie"
                    type="text"
                    inputmode="numeric"
                    autocomplete="off"
                    placeholder="Solo números, mínimo 6"
                    :class="claseCampo('nie')"
                    @input="alNIE"
                  />
                  <p v-if="errores.nie" class="mt-1 text-xs text-red-600">{{ errores.nie }}</p>
                </div>

                <!-- Nombres -->
                <div>
                  <label for="m-nombres" class="text-xs font-semibold text-slate-600">
                    Nombres <span class="text-red-500">*</span>
                  </label>
                  <input
                    id="m-nombres"
                    :value="form.nombres"
                    type="text"
                    autocomplete="off"
                    placeholder="MAYÚSCULAS, sin números ni tildes"
                    :class="claseCampo('nombres')"
                    @input="alNombres"
                  />
                  <p v-if="errores.nombres" class="mt-1 text-xs text-red-600">
                    {{ errores.nombres }}
                  </p>
                </div>

                <!-- Apellidos -->
                <div>
                  <label for="m-apellidos" class="text-xs font-semibold text-slate-600">
                    Apellidos <span class="text-red-500">*</span>
                  </label>
                  <input
                    id="m-apellidos"
                    :value="form.apellidos"
                    type="text"
                    autocomplete="off"
                    placeholder="MAYÚSCULAS, sin números ni tildes"
                    :class="claseCampo('apellidos')"
                    @input="alApellidos"
                  />
                  <p v-if="errores.apellidos" class="mt-1 text-xs text-red-600">
                    {{ errores.apellidos }}
                  </p>
                </div>

                <!-- Fecha de nacimiento -->
                <div>
                  <label for="m-fecha" class="text-xs font-semibold text-slate-600">
                    Fecha de nacimiento <span class="text-red-500">*</span>
                  </label>
                  <input
                    id="m-fecha"
                    v-model="form.fechaNacimiento"
                    type="date"
                    :max="hoyISO"
                    :class="claseCampo('fechaNacimiento')"
                    @input="limpiarError('fechaNacimiento')"
                  />
                  <!-- Formato de El Salvador: dd/mm/yyyy -->
                  <p v-if="form.fechaNacimiento" class="mt-1 text-xs text-slate-400">
                    Fecha elegida: {{ fechaCorta(form.fechaNacimiento) }} (dd/mm/yyyy)
                  </p>
                  <p v-if="errores.fechaNacimiento" class="mt-1 text-xs text-red-600">
                    {{ errores.fechaNacimiento }}
                  </p>
                </div>

                <!-- Edad -->
                <div>
                  <label for="m-edad" class="text-xs font-semibold text-slate-600">
                    Edad <span class="text-red-500">*</span>
                  </label>
                  <input
                    id="m-edad"
                    :value="form.edad"
                    type="text"
                    inputmode="numeric"
                    autocomplete="off"
                    placeholder="Solo números"
                    :class="claseCampo('edad')"
                    @input="alEdad"
                  />
                  <p v-if="errores.edad" class="mt-1 text-xs text-red-600">{{ errores.edad }}</p>
                </div>

                <!-- Sexo -->
                <div>
                  <span class="text-xs font-semibold text-slate-600">
                    Sexo <span class="text-red-500">*</span>
                  </span>
                  <div class="mt-1 flex flex-wrap gap-2">
                    <label
                      v-for="opcion in SEXO"
                      :key="opcion"
                      :class="claseRadio(form.sexo, opcion, 'sexo')"
                    >
                      <input
                        v-model="form.sexo"
                        type="radio"
                        name="m-sexo"
                        :value="opcion"
                        class="h-4 w-4 accent-primario"
                        @change="limpiarError('sexo')"
                      />
                      {{ opcion }}
                    </label>
                  </div>
                  <p v-if="errores.sexo" class="mt-1 text-xs text-red-600">{{ errores.sexo }}</p>
                </div>

                <!-- Nacionalidad -->
                <div>
                  <label for="m-nacionalidad" class="text-xs font-semibold text-slate-600">
                    Nacionalidad <span class="text-red-500">*</span>
                  </label>
                  <input
                    id="m-nacionalidad"
                    :value="form.nacionalidad"
                    type="text"
                    autocomplete="off"
                    placeholder="Ej.: SALVADOREÑA"
                    :class="claseCampo('nacionalidad')"
                    @input="alNacionalidad"
                  />
                  <p v-if="errores.nacionalidad" class="mt-1 text-xs text-red-600">
                    {{ errores.nacionalidad }}
                  </p>
                </div>

                <!-- Dirección -->
                <p class="text-xs font-bold uppercase tracking-wide text-slate-400 sm:col-span-2">
                  Dirección
                </p>

                <div>
                  <label for="m-departamento" class="text-xs font-semibold text-slate-600">
                    Departamento
                  </label>
                  <input
                    id="m-departamento"
                    :value="form.departamento"
                    type="text"
                    disabled
                    title="No modificable"
                    :class="claseCampo('departamento')"
                  />
                </div>

                <div>
                  <label for="m-distrito" class="text-xs font-semibold text-slate-600">
                    Distrito <span class="text-red-500">*</span>
                  </label>
                  <select
                    id="m-distrito"
                    v-model="form.distrito"
                    :class="claseCampo('distrito')"
                    @change="limpiarError('distrito')"
                  >
                    <option value="" disabled>Seleccione…</option>
                    <option v-for="opcion in DISTRITOS" :key="opcion" :value="opcion">
                      {{ opcion }}
                    </option>
                  </select>
                  <p v-if="errores.distrito" class="mt-1 text-xs text-red-600">
                    {{ errores.distrito }}
                  </p>
                </div>

                <div>
                  <label for="m-canton" class="text-xs font-semibold text-slate-600">
                    Cantón <span class="text-red-500">*</span>
                  </label>
                  <select
                    id="m-canton"
                    v-model="form.canton"
                    :class="claseCampo('canton')"
                    @change="limpiarError('canton')"
                  >
                    <option value="" disabled>Seleccione…</option>
                    <option v-for="opcion in CANTONES" :key="opcion" :value="opcion">
                      {{ opcion }}
                    </option>
                  </select>
                  <p v-if="errores.canton" class="mt-1 text-xs text-red-600">
                    {{ errores.canton }}
                  </p>
                </div>

                <div>
                  <label for="m-caserio" class="text-xs font-semibold text-slate-600">
                    Caserío <span class="text-red-500">*</span>
                  </label>
                  <select
                    id="m-caserio"
                    v-model="form.caserio"
                    :class="claseCampo('caserio')"
                    @change="alCaserio"
                  >
                    <option v-for="opcion in OPCIONES_CASERIO" :key="opcion" :value="opcion">
                      {{ opcion }}
                    </option>
                  </select>
                </div>

                <!-- Caserío "Otro (especifique)": aparece el campo para escribirlo -->
                <div v-if="form.caserio === OTRO_CASERIO">
                  <label for="m-caserio-otro" class="text-xs font-semibold text-slate-600">
                    Especifique el caserío <span class="text-red-500">*</span>
                  </label>
                  <input
                    id="m-caserio-otro"
                    :value="form.caserioOtro"
                    type="text"
                    autocomplete="off"
                    placeholder="Escribe el nombre del caserío"
                    :class="claseCampo('caserioOtro')"
                    @input="alCaserioOtro"
                  />
                  <p v-if="errores.caserioOtro" class="mt-1 text-xs text-red-600">
                    {{ errores.caserioOtro }}
                  </p>
                </div>

                <!-- Último grado cursado -->
                <fieldset class="rounded-lg border border-slate-200 p-3 sm:col-span-2">
                  <legend class="px-1 text-xs font-semibold text-slate-600">
                    Último grado cursado <span class="text-red-500">*</span>
                    <span class="font-normal text-slate-400">(escribe en uno solo)</span>
                  </legend>
                  <div class="grid gap-x-6 gap-y-4 sm:grid-cols-3">
                    <div>
                      <label for="m-grado-inicial" class="text-xs text-slate-500">Inicial</label>
                      <input
                        id="m-grado-inicial"
                        :value="form.gradoInicial"
                        type="text"
                        inputmode="numeric"
                        autocomplete="off"
                        placeholder="Solo números"
                        :disabled="!!form.gradoParvularia"
                        :class="claseCampo('gradoCursado')"
                        @input="alGradoInicial"
                      />
                    </div>
                    <div>
                      <label for="m-grado-parvularia" class="text-xs text-slate-500">
                        Parvularia
                      </label>
                      <input
                        id="m-grado-parvularia"
                        :value="form.gradoParvularia"
                        type="text"
                        inputmode="numeric"
                        autocomplete="off"
                        placeholder="Solo números"
                        :disabled="!!form.gradoInicial"
                        :class="claseCampo('gradoCursado')"
                        @input="alGradoParvularia"
                      />
                    </div>
                    <div>
                      <label for="m-grado-anio" class="text-xs text-slate-500">
                        Año que lo cursó <span class="text-red-500">*</span>
                      </label>
                      <input
                        id="m-grado-anio"
                        :value="form.anioGrado"
                        type="text"
                        inputmode="numeric"
                        autocomplete="off"
                        placeholder="aaaa"
                        :class="claseCampo('anioGrado')"
                        @input="alAnioGrado"
                      />
                    </div>
                  </div>
                  <p v-if="errores.gradoCursado" class="mt-1 text-xs text-red-600">
                    {{ errores.gradoCursado }}
                  </p>
                  <p v-if="errores.anioGrado" class="mt-1 text-xs text-red-600">
                    {{ errores.anioGrado }}
                  </p>
                </fieldset>

                <!-- Grado que cursará (select con Parvularia 4-6 y Primero a Noveno) -->
                <div>
                  <label for="m-grado" class="text-xs font-semibold text-slate-600">
                    Grado <span class="text-red-500">*</span>
                  </label>
                  <select
                    id="m-grado"
                    v-model="form.grado"
                    :class="claseCampo('grado')"
                    @change="limpiarError('grado')"
                  >
                    <option value="" disabled>Seleccione…</option>
                    <option v-for="g in OPCIONES_GRADO" :key="g.id" :value="g.nombre">
                      {{ g.nombre }}
                    </option>
                  </select>
                  <p v-if="errores.grado" class="mt-1 text-xs text-red-600">{{ errores.grado }}</p>
                </div>

                <!-- Partida de nacimiento: posee -->
                <div>
                  <span class="text-xs font-semibold text-slate-600">
                    Posee partida de nacimiento <span class="text-red-500">*</span>
                  </span>
                  <div class="mt-1 flex flex-wrap gap-2">
                    <label
                      v-for="opcion in SI_NO"
                      :key="opcion"
                      :class="claseRadio(form.partidaPosee, opcion, 'partidaPosee')"
                    >
                      <input
                        v-model="form.partidaPosee"
                        type="radio"
                        name="m-partida-posee"
                        :value="opcion"
                        class="h-4 w-4 accent-primario"
                        @change="limpiarError('partidaPosee')"
                      />
                      {{ opcion }}
                    </label>
                  </div>
                  <p v-if="errores.partidaPosee" class="mt-1 text-xs text-red-600">
                    {{ errores.partidaPosee }}
                  </p>
                </div>

                <!-- Partida de nacimiento: presenta -->
                <div>
                  <span class="text-xs font-semibold text-slate-600">
                    Presenta partida de nacimiento <span class="text-red-500">*</span>
                  </span>
                  <div class="mt-1 flex flex-wrap gap-2">
                    <label
                      v-for="opcion in SI_NO"
                      :key="opcion"
                      :class="claseRadio(form.partidaPresenta, opcion, 'partidaPresenta')"
                    >
                      <input
                        v-model="form.partidaPresenta"
                        type="radio"
                        name="m-partida-presenta"
                        :value="opcion"
                        class="h-4 w-4 accent-primario"
                        @change="limpiarError('partidaPresenta')"
                      />
                      {{ opcion }}
                    </label>
                  </div>
                  <p v-if="errores.partidaPresenta" class="mt-1 text-xs text-red-600">
                    {{ errores.partidaPresenta }}
                  </p>
                </div>

                <!-- Etnia -->
                <div class="sm:col-span-2">
                  <span class="text-xs font-semibold text-slate-600">
                    Etnia <span class="text-red-500">*</span>
                  </span>
                  <div class="mt-1 flex flex-wrap gap-2">
                    <label
                      v-for="opcion in OPCIONES_ETNIA"
                      :key="opcion"
                      :class="claseRadio(form.etnia, opcion, 'etnia')"
                    >
                      <input
                        v-model="form.etnia"
                        type="radio"
                        name="m-etnia"
                        :value="opcion"
                        class="h-4 w-4 accent-primario"
                        @change="limpiarError('etnia')"
                      />
                      {{ opcion }}
                    </label>
                  </div>
                  <p v-if="errores.etnia" class="mt-1 text-xs text-red-600">{{ errores.etnia }}</p>
                </div>
              </div>
            </div>

            <!-- ══ Partes 2.2 / 2.3 / 2.4: madre, padre y otra persona ══
                 Un solo bloque pinta las tres: cambia la pregunta y los ids. -->
            <div v-else-if="p && configP" class="space-y-5" :key="pasoActual.id">
              <p class="text-xs text-slate-500">
                Los campos marcados con <span class="font-bold text-red-500">*</span> son
                requeridos. Si la respuesta inicial es
                <span class="font-semibold">No</span>, todos los campos quedan desactivados y en
                blanco.
              </p>

              <!-- Pregunta inicial (disco requerido) -->
              <div>
                <span class="text-xs font-semibold text-slate-600">
                  {{ configP.pregunta }}
                  <span class="text-red-500">*</span>
                </span>
                <div class="mt-1 flex flex-wrap gap-2">
                  <label v-for="opcion in SI_NO" :key="opcion" :class="eRadio(p.tiene, opcion, 'tiene')">
                    <input
                      v-model="p.tiene"
                      type="radio"
                      :name="`m-${pasoActual.id}-tiene`"
                      :value="opcion"
                      class="h-4 w-4 accent-primario"
                      @change="alTienePersona"
                    />
                    {{ opcion }}
                  </label>
                </div>
                <p v-if="eError('tiene')" class="mt-1 text-xs text-red-600">
                  {{ eError('tiene') }}
                </p>
              </div>

              <div class="grid gap-x-6 gap-y-5 sm:grid-cols-2">
                <!-- Nombre -->
                <div>
                  <label :for="`m-${pasoActual.id}-nombre`" class="text-xs font-semibold text-slate-600">
                    Nombre <span class="text-red-500">*</span>
                  </label>
                  <input
                    :id="`m-${pasoActual.id}-nombre`"
                    :value="p.nombre"
                    type="text"
                    autocomplete="off"
                    placeholder="MAYÚSCULAS, sin números ni tildes"
                    :disabled="p.tiene !== 'Sí'"
                    :class="eCampo('nombre')"
                    @input="alPersonaNombre"
                  />
                  <p v-if="eError('nombre')" class="mt-1 text-xs text-red-600">
                    {{ eError('nombre') }}
                  </p>
                </div>

                <!-- Fecha de nacimiento -->
                <div>
                  <label :for="`m-${pasoActual.id}-fecha`" class="text-xs font-semibold text-slate-600">
                    Fecha de nacimiento <span class="text-red-500">*</span>
                  </label>
                  <input
                    :id="`m-${pasoActual.id}-fecha`"
                    v-model="p.fechaNacimiento"
                    type="date"
                    :max="hoyISO"
                    :disabled="p.tiene !== 'Sí'"
                    :class="eCampo('fechaNacimiento')"
                    @change="limpiarError(`${pasoActual.id}.fechaNacimiento`)"
                  />
                  <p v-if="p.fechaNacimiento" class="mt-1 text-xs text-slate-400">
                    Fecha elegida: {{ fechaCorta(p.fechaNacimiento) }} (dd/mm/yyyy)
                  </p>
                  <p v-if="eError('fechaNacimiento')" class="mt-1 text-xs text-red-600">
                    {{ eError('fechaNacimiento') }}
                  </p>
                </div>

                <!-- Edad -->
                <div>
                  <label :for="`m-${pasoActual.id}-edad`" class="text-xs font-semibold text-slate-600">
                    Edad <span class="text-red-500">*</span>
                  </label>
                  <input
                    :id="`m-${pasoActual.id}-edad`"
                    :value="p.edad"
                    type="text"
                    inputmode="numeric"
                    autocomplete="off"
                    placeholder="Solo números"
                    :disabled="p.tiene !== 'Sí'"
                    :class="eCampo('edad')"
                    @input="alPersonaEdad"
                  />
                  <p v-if="eError('edad')" class="mt-1 text-xs text-red-600">{{ eError('edad') }}</p>
                </div>

                <!-- Documento (DUI, pasaporte u otro) -->
                <div>
                  <label
                    :for="`m-${pasoActual.id}-documento`"
                    class="text-xs font-semibold text-slate-600"
                  >
                    Documento <span class="text-red-500">*</span>
                  </label>
                  <input
                    :id="`m-${pasoActual.id}-documento`"
                    :value="p.documento"
                    type="text"
                    autocomplete="off"
                    placeholder="DUI, pasaporte u otro documento"
                    :disabled="p.tiene !== 'Sí'"
                    :class="eCampo('documento')"
                    @input="alPersonaDocumento"
                  />
                  <p v-if="eError('documento')" class="mt-1 text-xs text-red-600">
                    {{ eError('documento') }}
                  </p>
                </div>

                <!-- País (todos los países, en orden alfabético) -->
                <div>
                  <label :for="`m-${pasoActual.id}-pais`" class="text-xs font-semibold text-slate-600">
                    País <span class="text-red-500">*</span>
                  </label>
                  <select
                    :id="`m-${pasoActual.id}-pais`"
                    v-model="p.pais"
                    :disabled="p.tiene !== 'Sí'"
                    :class="eCampo('pais')"
                    @change="alPersonaPais"
                  >
                    <option value="" disabled>Seleccione…</option>
                    <option v-for="nombrePais in NOMBRES_PAISES" :key="nombrePais" :value="nombrePais">
                      {{ nombrePais }}
                    </option>
                  </select>
                  <p v-if="eError('pais')" class="mt-1 text-xs text-red-600">{{ eError('pais') }}</p>
                </div>

                <!-- Dirección: SOLO si el país es El Salvador -->
                <template v-if="p.pais === 'El Salvador'">
                  <div>
                    <label
                      :for="`m-${pasoActual.id}-departamento`"
                      class="text-xs font-semibold text-slate-600"
                    >
                      Departamento <span class="text-red-500">*</span>
                    </label>
                    <select
                      :id="`m-${pasoActual.id}-departamento`"
                      v-model="p.departamento"
                      :disabled="p.tiene !== 'Sí'"
                      :class="eCampo('departamento')"
                      @change="alPersonaDepartamento"
                    >
                      <option value="" disabled>Seleccione…</option>
                      <option v-for="opcion in DEPARTAMENTOS_SV" :key="opcion" :value="opcion">
                        {{ opcion }}
                      </option>
                    </select>
                    <p v-if="eError('departamento')" class="mt-1 text-xs text-red-600">
                      {{ eError('departamento') }}
                    </p>
                  </div>

                  <div>
                    <label
                      :for="`m-${pasoActual.id}-distrito`"
                      class="text-xs font-semibold text-slate-600"
                    >
                      Distrito <span class="text-red-500">*</span>
                    </label>
                    <select
                      :id="`m-${pasoActual.id}-distrito`"
                      v-model="p.distrito"
                      :disabled="p.tiene !== 'Sí' || !p.departamento"
                      :class="eCampo('distrito')"
                      @change="alPersonaDistrito"
                    >
                      <option value="" disabled>Seleccione…</option>
                      <option v-for="opcion in distritosPersona" :key="opcion" :value="opcion">
                        {{ opcion }}
                      </option>
                    </select>
                    <p v-if="eError('distrito')" class="mt-1 text-xs text-red-600">
                      {{ eError('distrito') }}
                    </p>
                  </div>

                  <div>
                    <label
                      :for="`m-${pasoActual.id}-canton`"
                      class="text-xs font-semibold text-slate-600"
                    >
                      Cantón <span class="text-red-500">*</span>
                    </label>
                    <!-- Chalatenango: select según el distrito; otros: texto libre -->
                    <select
                      v-if="p.departamento === DEPARTAMENTO_CHALATENANGO && cantonesPersona !== null"
                      :id="`m-${pasoActual.id}-canton`"
                      v-model="p.canton"
                      :disabled="p.tiene !== 'Sí'"
                      :class="eCampo('canton')"
                      @change="alPersonaCanton"
                    >
                      <option value="" disabled>Seleccione…</option>
                      <option v-if="cantonesPersona.length === 0" :value="SIN_CANTON">
                        {{ SIN_CANTON }}
                      </option>
                      <option v-for="opcion in cantonesPersona" :key="opcion" :value="opcion">
                        {{ opcion }}
                      </option>
                    </select>
                    <input
                      v-else
                      :id="`m-${pasoActual.id}-canton`"
                      :value="p.canton"
                      type="text"
                      autocomplete="off"
                      placeholder="Escribe el cantón"
                      :disabled="p.tiene !== 'Sí'"
                      :class="eCampo('canton')"
                      @input="alPersonaCantonTexto"
                    />
                    <p v-if="eError('canton')" class="mt-1 text-xs text-red-600">
                      {{ eError('canton') }}
                    </p>
                  </div>

                  <div>
                    <label
                      :for="`m-${pasoActual.id}-caserio`"
                      class="text-xs font-semibold text-slate-600"
                    >
                      Caserío <span class="text-red-500">*</span>
                    </label>
                    <!-- Cantón Los Prados: select con N/A y Otro (especifique) -->
                    <select
                      v-if="p.canton === CANTON_LOS_PRADOS"
                      :id="`m-${pasoActual.id}-caserio`"
                      v-model="p.caserio"
                      :disabled="p.tiene !== 'Sí'"
                      :class="eCampo('caserio')"
                      @change="alPersonaCaserio"
                    >
                      <option v-for="opcion in OPCIONES_CASERIO_PERSONA" :key="opcion" :value="opcion">
                        {{ opcion }}
                      </option>
                    </select>
                    <!-- Otro cantón: texto libre, pudiendo marcar N/A -->
                    <div v-else class="flex gap-2">
                      <input
                        :id="`m-${pasoActual.id}-caserio`"
                        :value="p.caserio === NA ? 'N/A' : p.caserio"
                        type="text"
                        autocomplete="off"
                        placeholder="Escribe el caserío (o marca N/A)"
                        :disabled="p.tiene !== 'Sí' || p.caserio === NA"
                        :class="eCampo('caserio')"
                        @input="alPersonaCaserioTexto"
                      />
                      <button
                        type="button"
                        class="shrink-0 rounded-lg border px-3 text-xs font-semibold transition-colors"
                        :class="
                          p.caserio === NA
                            ? 'border-primario bg-primario-suave text-primario'
                            : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                        "
                        :disabled="p.tiene !== 'Sí'"
                        @click="alPersonaCaserioNA"
                      >
                        {{ p.caserio === NA ? 'Quitar N/A' : 'N/A' }}
                      </button>
                    </div>
                    <p v-if="eError('caserio')" class="mt-1 text-xs text-red-600">
                      {{ eError('caserio') }}
                    </p>
                  </div>

                  <div v-if="p.caserio === OTRO_CASERIO">
                    <label
                      :for="`m-${pasoActual.id}-caserio-otro`"
                      class="text-xs font-semibold text-slate-600"
                    >
                      Especifique el caserío <span class="text-red-500">*</span>
                    </label>
                    <input
                      :id="`m-${pasoActual.id}-caserio-otro`"
                      :value="p.caserioOtro"
                      type="text"
                      autocomplete="off"
                      placeholder="Escribe el nombre del caserío"
                      :disabled="p.tiene !== 'Sí'"
                      :class="eCampo('caserioOtro')"
                      @input="alPersonaCaserioOtro"
                    />
                    <p v-if="eError('caserioOtro')" class="mt-1 text-xs text-red-600">
                      {{ eError('caserioOtro') }}
                    </p>
                  </div>
                </template>

                <!-- Teléfono: código de país + número formateado -->
                <p class="text-xs font-bold uppercase tracking-wide text-slate-400 sm:col-span-2">
                  Teléfono
                </p>

                <div>
                  <label
                    :for="`m-${pasoActual.id}-pais-tel`"
                    class="text-xs font-semibold text-slate-600"
                  >
                    Código del país <span class="text-red-500">*</span>
                  </label>
                  <select
                    :id="`m-${pasoActual.id}-pais-tel`"
                    v-model="p.paisTelefono"
                    :disabled="p.tiene !== 'Sí'"
                    :class="eCampo('paisTelefono')"
                    @change="alPersonaPaisTelefono"
                  >
                    <option value="" disabled>Seleccione…</option>
                    <option v-for="nombrePais in NOMBRES_PAISES" :key="nombrePais" :value="nombrePais">
                      {{ codigoTelefono(nombrePais) }} — {{ nombrePais }}
                    </option>
                  </select>
                  <p v-if="eError('paisTelefono')" class="mt-1 text-xs text-red-600">
                    {{ eError('paisTelefono') }}
                  </p>
                </div>

                <div>
                  <label
                    :for="`m-${pasoActual.id}-telefono`"
                    class="text-xs font-semibold text-slate-600"
                  >
                    Teléfono <span class="text-red-500">*</span>
                  </label>
                  <input
                    :id="`m-${pasoActual.id}-telefono`"
                    :value="p.telefono"
                    type="text"
                    inputmode="tel"
                    autocomplete="off"
                    :placeholder="`Solo números (${digitosDeTelefono(p.paisTelefono)} dígitos)`"
                    :disabled="p.tiene !== 'Sí'"
                    :class="eCampo('telefono')"
                    @input="alPersonaTelefono"
                  />
                  <p v-if="eError('telefono')" class="mt-1 text-xs text-red-600">
                    {{ eError('telefono') }}
                  </p>
                </div>

                <!-- WhatsApp -->
                <div class="sm:col-span-2">
                  <span class="text-xs font-semibold text-slate-600">
                    ¿Tiene WhatsApp en este número? <span class="text-red-500">*</span>
                  </span>
                  <div class="mt-1 flex flex-wrap gap-2">
                    <label
                      v-for="opcion in SI_NO"
                      :key="opcion"
                      :class="eRadio(p.whatsapp, opcion, 'whatsapp')"
                    >
                      <input
                        v-model="p.whatsapp"
                        type="radio"
                        :name="`m-${pasoActual.id}-whatsapp`"
                        :value="opcion"
                        class="h-4 w-4 accent-primario"
                        :disabled="p.tiene !== 'Sí'"
                        @change="alPersonaWhatsapp"
                      />
                      {{ opcion }}
                    </label>
                  </div>
                  <p v-if="eError('whatsapp')" class="mt-1 text-xs text-red-600">
                    {{ eError('whatsapp') }}
                  </p>
                </div>

                <!-- Si NO tiene WhatsApp: celular donde sí lo tiene -->
                <div v-if="p.whatsapp === 'No'">
                  <label
                    :for="`m-${pasoActual.id}-whatsapp-celular`"
                    class="text-xs font-semibold text-slate-600"
                  >
                    Celular de WhatsApp <span class="text-red-500">*</span>
                  </label>
                  <input
                    :id="`m-${pasoActual.id}-whatsapp-celular`"
                    :value="p.whatsappCelular"
                    type="text"
                    inputmode="tel"
                    autocomplete="off"
                    placeholder="Número donde sí tiene WhatsApp"
                    :disabled="p.tiene !== 'Sí'"
                    :class="eCampo('whatsappCelular')"
                    @input="alPersonaWhatsappCelular"
                  />
                  <p v-if="eError('whatsappCelular')" class="mt-1 text-xs text-red-600">
                    {{ eError('whatsappCelular') }}
                  </p>
                </div>

                <!-- Correo electrónico (opcional) -->
                <div>
                  <label
                    :for="`m-${pasoActual.id}-correo`"
                    class="text-xs font-semibold text-slate-600"
                  >
                    Correo electrónico <span class="font-normal text-slate-400">(o)</span>
                  </label>
                  <input
                    :id="`m-${pasoActual.id}-correo`"
                    :value="p.correo"
                    type="text"
                    inputmode="email"
                    autocomplete="off"
                    placeholder="Cualquier dominio"
                    :disabled="p.tiene !== 'Sí'"
                    :class="eCampo('correo')"
                    @input="alPersonaCorreo"
                  />
                  <p class="mt-1 text-xs text-slate-400">
                    Si se deja en blanco se usará el correo del estudiante
                    ({{ form.nie ? `${form.nie}@clases.edu.sv` : 'NIE@clases.edu.sv' }}).
                  </p>
                </div>

                <!-- ¿Actualmente estudia? -->
                <div class="sm:col-span-2">
                  <span class="text-xs font-semibold text-slate-600">
                    ¿Actualmente estudia? <span class="text-red-500">*</span>
                  </span>
                  <div class="mt-1 flex flex-wrap gap-2">
                    <label
                      v-for="opcion in SI_NO"
                      :key="opcion"
                      :class="eRadio(p.estudia, opcion, 'estudia')"
                    >
                      <input
                        v-model="p.estudia"
                        type="radio"
                        :name="`m-${pasoActual.id}-estudia`"
                        :value="opcion"
                        class="h-4 w-4 accent-primario"
                        :disabled="p.tiene !== 'Sí'"
                        @change="alPersonaEstudia"
                      />
                      {{ opcion }}
                    </label>
                  </div>
                  <p v-if="eError('estudia')" class="mt-1 text-xs text-red-600">
                    {{ eError('estudia') }}
                  </p>
                </div>

                <!-- Centro educativo (solo si estudia Sí) -->
                <div v-if="p.estudia === 'Sí'">
                  <label
                    :for="`m-${pasoActual.id}-centro`"
                    class="text-xs font-semibold text-slate-600"
                  >
                    Centro educativo <span class="text-red-500">*</span>
                  </label>
                  <input
                    :id="`m-${pasoActual.id}-centro`"
                    :value="p.centroEducativo"
                    type="text"
                    autocomplete="off"
                    placeholder="Nombre del centro"
                    :disabled="p.tiene !== 'Sí'"
                    :class="eCampo('centroEducativo')"
                    @input="alPersonaCentro"
                  />
                  <p v-if="eError('centroEducativo')" class="mt-1 text-xs text-red-600">
                    {{ eError('centroEducativo') }}
                  </p>
                </div>

                <!-- Último grado cursado o que cursa -->
                <fieldset class="rounded-lg border border-slate-200 p-3 sm:col-span-2">
                  <legend class="px-1 text-xs font-semibold text-slate-600">
                    Último grado cursado o que cursa <span class="text-red-500">*</span>
                    <span class="font-normal text-slate-400">
                      (escribe el número en uno solo, o marca Ninguno)
                    </span>
                  </legend>
                  <div class="grid gap-x-6 gap-y-4 sm:grid-cols-5">
                    <div>
                      <label
                        :for="`m-${pasoActual.id}-g-parvularia`"
                        class="text-xs text-slate-500"
                      >
                        Parvularia
                      </label>
                      <input
                        :id="`m-${pasoActual.id}-g-parvularia`"
                        :value="p.gradoParvularia"
                        type="text"
                        inputmode="numeric"
                        autocomplete="off"
                        placeholder="N.º"
                        :disabled="p.tiene !== 'Sí' || p.gradoNinguno || !!p.gradoBasica || !!p.gradoMedia || !!p.gradoSuperior"
                        :class="eCampo('gradoCursado')"
                        @input="alPersonaGrado('gradoParvularia', $event)"
                      />
                    </div>
                    <div>
                      <label :for="`m-${pasoActual.id}-g-basica`" class="text-xs text-slate-500">
                        Básica
                      </label>
                      <input
                        :id="`m-${pasoActual.id}-g-basica`"
                        :value="p.gradoBasica"
                        type="text"
                        inputmode="numeric"
                        autocomplete="off"
                        placeholder="N.º"
                        :disabled="p.tiene !== 'Sí' || p.gradoNinguno || !!p.gradoParvularia || !!p.gradoMedia || !!p.gradoSuperior"
                        :class="eCampo('gradoCursado')"
                        @input="alPersonaGrado('gradoBasica', $event)"
                      />
                    </div>
                    <div>
                      <label :for="`m-${pasoActual.id}-g-media`" class="text-xs text-slate-500">
                        Media
                      </label>
                      <input
                        :id="`m-${pasoActual.id}-g-media`"
                        :value="p.gradoMedia"
                        type="text"
                        inputmode="numeric"
                        autocomplete="off"
                        placeholder="N.º"
                        :disabled="p.tiene !== 'Sí' || p.gradoNinguno || !!p.gradoParvularia || !!p.gradoBasica || !!p.gradoSuperior"
                        :class="eCampo('gradoCursado')"
                        @input="alPersonaGrado('gradoMedia', $event)"
                      />
                    </div>
                    <div>
                      <label :for="`m-${pasoActual.id}-g-superior`" class="text-xs text-slate-500">
                        Superior
                      </label>
                      <input
                        :id="`m-${pasoActual.id}-g-superior`"
                        :value="p.gradoSuperior"
                        type="text"
                        inputmode="numeric"
                        autocomplete="off"
                        placeholder="N.º"
                        :disabled="p.tiene !== 'Sí' || p.gradoNinguno || !!p.gradoParvularia || !!p.gradoBasica || !!p.gradoMedia"
                        :class="eCampo('gradoCursado')"
                        @input="alPersonaGrado('gradoSuperior', $event)"
                      />
                    </div>
                    <div>
                      <label
                        :for="`m-${pasoActual.id}-g-ninguno`"
                        class="flex cursor-pointer items-center gap-2 text-xs text-slate-500"
                      >
                        <input
                          id="m-ninguno-persona"
                          v-model="p.gradoNinguno"
                          type="checkbox"
                          class="h-4 w-4 accent-primario"
                          :disabled="p.tiene !== 'Sí'"
                          @change="alPersonaGradoNinguno"
                        />
                        Ninguno
                      </label>
                    </div>
                  </div>
                  <p v-if="eError('gradoCursado')" class="mt-1 text-xs text-red-600">
                    {{ eError('gradoCursado') }}
                  </p>
                </fieldset>

                <!-- Ocupación -->
                <div>
                  <label
                    :for="`m-${pasoActual.id}-ocupacion`"
                    class="text-xs font-semibold text-slate-600"
                  >
                    Ocupación <span class="text-red-500">*</span>
                  </label>
                  <select
                    :id="`m-${pasoActual.id}-ocupacion`"
                    v-model="p.ocupacion"
                    :disabled="p.tiene !== 'Sí'"
                    :class="eCampo('ocupacion')"
                    @change="alPersonaOcupacion"
                  >
                    <option value="" disabled>Seleccione…</option>
                    <option v-for="opcion in OPCIONES_OCUPACION" :key="opcion" :value="opcion">
                      {{ opcion }}
                    </option>
                  </select>
                  <p v-if="eError('ocupacion')" class="mt-1 text-xs text-red-600">
                    {{ eError('ocupacion') }}
                  </p>
                </div>

                <div v-if="p.ocupacion === OTRO_OCUPACION">
                  <label
                    :for="`m-${pasoActual.id}-ocupacion-otro`"
                    class="text-xs font-semibold text-slate-600"
                  >
                    Especifique la ocupación <span class="text-red-500">*</span>
                  </label>
                  <input
                    :id="`m-${pasoActual.id}-ocupacion-otro`"
                    :value="p.ocupacionOtro"
                    type="text"
                    autocomplete="off"
                    placeholder="Escribe la ocupación"
                    :disabled="p.tiene !== 'Sí'"
                    :class="eCampo('ocupacionOtro')"
                    @input="alPersonaOcupacionOtro"
                  />
                  <p v-if="eError('ocupacionOtro')" class="mt-1 text-xs text-red-600">
                    {{ eError('ocupacionOtro') }}
                  </p>
                </div>

                <!-- Lugar de trabajo -->
                <div>
                  <label
                    :for="`m-${pasoActual.id}-trabajo`"
                    class="text-xs font-semibold text-slate-600"
                  >
                    Lugar de trabajo <span class="text-red-500">*</span>
                  </label>
                  <input
                    :id="`m-${pasoActual.id}-trabajo`"
                    :value="p.lugarTrabajo"
                    type="text"
                    autocomplete="off"
                    placeholder="MAYÚSCULAS, sin números"
                    :disabled="p.tiene !== 'Sí'"
                    :class="eCampo('lugarTrabajo')"
                    @input="alPersonaLugar"
                  />
                  <p v-if="eError('lugarTrabajo')" class="mt-1 text-xs text-red-600">
                    {{ eError('lugarTrabajo') }}
                  </p>
                </div>
              </div>
            </div>

            <!-- ══ Parte 3: condición de discapacidad ══ -->
            <div v-else-if="pasoActual.id === 'discapacidad'" class="space-y-5">
              <p class="text-xs text-slate-500">
                Los campos marcados con <span class="font-bold text-red-500">*</span> son
                requeridos. En la condición de discapacidad puede marcar más de una opción.
              </p>

              <fieldset class="rounded-lg border border-slate-200 p-3">
                <legend class="px-1 text-xs font-semibold text-slate-600">
                  Condición de discapacidad de la niña o niño <span class="text-red-500">*</span>
                </legend>
                <div class="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <label
                    v-for="opcion in DISCAPACIDAD_OPCIONES"
                    :key="opcion"
                    :class="
                      claseCuadro(discapacidad.marcas.includes(opcion), 'discapacidad.marcas')
                    "
                  >
                    <input
                      v-model="discapacidad.marcas"
                      type="checkbox"
                      :value="opcion"
                      class="h-4 w-4 accent-primario"
                      @change="alCuadro(discapacidad.marcas, opcion, 'discapacidad.marcas', NINGUNO_DISC)"
                    />
                    {{ opcion }}
                  </label>
                </div>
                <p v-if="errores['discapacidad.marcas']" class="mt-1 text-xs text-red-600">
                  {{ errores['discapacidad.marcas'] }}
                </p>

                <div v-if="discapacidad.marcas.includes(OTROS_DISC)" class="mt-3">
                  <label for="m-disc-otros" class="text-xs font-semibold text-slate-600">
                    Especifique la discapacidad <span class="text-red-500">*</span>
                  </label>
                  <input
                    id="m-disc-otros"
                    :value="discapacidad.otrosTexto"
                    type="text"
                    autocomplete="off"
                    placeholder="Escribe cuál"
                    :class="claseCampo('discapacidad.otrosTexto')"
                    @input="alDiscapacidadOtros"
                  />
                  <p v-if="errores['discapacidad.otrosTexto']" class="mt-1 text-xs text-red-600">
                    {{ errores['discapacidad.otrosTexto'] }}
                  </p>
                </div>

                <p class="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
                  {{ NOTA_DISCAPACIDAD }}
                </p>
              </fieldset>

              <!-- 3.1 ¿Posee diagnóstico clínico? -->
              <div>
                <span class="text-xs font-semibold text-slate-600">
                  3.1 ¿Posee diagnóstico clínico? <span class="text-red-500">*</span>
                </span>
                <div class="mt-1 flex flex-wrap gap-2">
                  <label
                    v-for="opcion in DIAGNOSTICO_OPCIONES"
                    :key="opcion"
                    :class="claseRadio(discapacidad.diagnostico, opcion, 'discapacidad.diagnostico')"
                  >
                    <input
                      v-model="discapacidad.diagnostico"
                      type="radio"
                      name="m-disc-diagnostico"
                      :value="opcion"
                      class="h-4 w-4 accent-primario"
                      @change="limpiarError('discapacidad.diagnostico')"
                    />
                    {{ opcion }}
                  </label>
                </div>
                <p v-if="errores['discapacidad.diagnostico']" class="mt-1 text-xs text-red-600">
                  {{ errores['discapacidad.diagnostico'] }}
                </p>
              </div>

              <!-- 3.2 Ha sido referido a -->
              <div>
                <span class="text-xs font-semibold text-slate-600">
                  3.2 El niño o la niña ha sido referido a: <span class="text-red-500">*</span>
                </span>
                <div class="mt-1 flex flex-wrap gap-2">
                  <label
                    v-for="opcion in REFERIDO_OPCIONES"
                    :key="opcion"
                    :class="claseRadio(discapacidad.referido, opcion, 'discapacidad.referido')"
                  >
                    <input
                      v-model="discapacidad.referido"
                      type="radio"
                      name="m-disc-referido"
                      :value="opcion"
                      class="h-4 w-4 accent-primario"
                      @change="limpiarError('discapacidad.referido')"
                    />
                    {{ opcion }}
                  </label>
                </div>
                <p v-if="errores['discapacidad.referido']" class="mt-1 text-xs text-red-600">
                  {{ errores['discapacidad.referido'] }}
                </p>
              </div>

              <!-- 3.3 Servicios que recibe (puede marcar varios) -->
              <div>
                <span class="text-xs font-semibold text-slate-600">
                  3.3 El niño o la niña recibe: <span class="text-red-500">*</span>
                </span>
                <div class="mt-1 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <label
                    v-for="opcion in SERVICIOS_OPCIONES"
                    :key="opcion"
                    :class="
                      claseCuadro(discapacidad.servicios.includes(opcion), 'discapacidad.servicios')
                    "
                  >
                    <input
                      v-model="discapacidad.servicios"
                      type="checkbox"
                      :value="opcion"
                      class="h-4 w-4 accent-primario"
                      @change="
                        alCuadro(discapacidad.servicios, opcion, 'discapacidad.servicios', NO_APLICA_SERV)
                      "
                    />
                    {{ opcion }}
                  </label>
                </div>
                <p v-if="errores['discapacidad.servicios']" class="mt-1 text-xs text-red-600">
                  {{ errores['discapacidad.servicios'] }}
                </p>

                <div v-if="discapacidad.servicios.includes(OTRO_SERV)" class="mt-3">
                  <label for="m-disc-serv-otro" class="text-xs font-semibold text-slate-600">
                    Especifique el servicio <span class="text-red-500">*</span>
                  </label>
                  <input
                    id="m-disc-serv-otro"
                    :value="discapacidad.serviciosOtro"
                    type="text"
                    autocomplete="off"
                    placeholder="Escribe cuál servicio"
                    :class="claseCampo('discapacidad.serviciosOtro')"
                    @input="alServiciosOtro"
                  />
                  <p v-if="errores['discapacidad.serviciosOtro']" class="mt-1 text-xs text-red-600">
                    {{ errores['discapacidad.serviciosOtro'] }}
                  </p>
                </div>
              </div>
            </div>

            <!-- ══ Parte 4: convivencia familiar (una marca con X) ══ -->
            <div v-else-if="pasoActual.id === 'convivencia'" class="space-y-5">
              <p class="text-xs text-slate-500">
                Entorno familiar de la niña o el niño: marque con una X según corresponda.
              </p>
              <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <label
                  v-for="opcion in CONVIVENCIA_OPCIONES"
                  :key="opcion"
                  :class="claseRadio(convivencia, opcion, 'convivencia.marcas')"
                >
                  <input
                    v-model="convivencia"
                    type="radio"
                    name="m-convivencia"
                    :value="opcion"
                    class="h-4 w-4 accent-primario"
                    @change="limpiarError('convivencia.marcas')"
                  />
                  {{ opcion }}
                </label>
              </div>
              <p v-if="errores['convivencia.marcas']" class="text-xs text-red-600">
                {{ errores['convivencia.marcas'] }}
              </p>
            </div>

            <!-- ══ Parte 5: ingreso familiar (puede marcar varias) ══ -->
            <div v-else-if="pasoActual.id === 'ingresos'" class="space-y-5">
              <p class="text-xs text-slate-500">
                Fuentes de ingreso del hogar: puede marcar más de una opción.
              </p>
              <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <label
                  v-for="opcion in INGRESOS_OPCIONES"
                  :key="opcion"
                  :class="claseCuadro(ingresos.marcas.includes(opcion), 'ingresos.marcas')"
                >
                  <input
                    v-model="ingresos.marcas"
                    type="checkbox"
                    :value="opcion"
                    class="h-4 w-4 accent-primario"
                    @change="alCuadro(ingresos.marcas, opcion, 'ingresos.marcas')"
                  />
                  {{ opcion }}
                </label>
              </div>
              <p v-if="errores['ingresos.marcas']" class="text-xs text-red-600">
                {{ errores['ingresos.marcas'] }}
              </p>

              <div v-if="ingresos.marcas.includes(OTRO_INGRESO)">
                <label for="m-ingreso-otro" class="text-xs font-semibold text-slate-600">
                  Especifique el ingreso <span class="text-red-500">*</span>
                </label>
                <input
                  id="m-ingreso-otro"
                  :value="ingresos.otroTexto"
                  type="text"
                  autocomplete="off"
                  placeholder="Escribe cuál"
                  :class="claseCampo('ingresos.otroTexto')"
                  @input="alIngresoOtro"
                />
                <p v-if="errores['ingresos.otroTexto']" class="mt-1 text-xs text-red-600">
                  {{ errores['ingresos.otroTexto'] }}
                </p>
              </div>
            </div>

            <!-- ══ Parte 6: vivienda ══ -->
            <div v-else-if="pasoActual.id === 'vivienda'" class="space-y-5">
              <p class="text-xs text-slate-500">
                Puede marcar más de una opción en las listas de la vivienda.
              </p>

              <!-- 6.1 Condición de posesión -->
              <fieldset class="rounded-lg border border-slate-200 p-3">
                <legend class="px-1 text-xs font-semibold text-slate-600">
                  6.1 Condición de posesión de la vivienda <span class="text-red-500">*</span>
                </legend>
                <div class="mt-2">
                  <span class="text-xs font-semibold text-slate-600">
                    Zona: <span class="text-red-500">*</span>
                  </span>
                  <div class="mt-1 flex flex-wrap gap-2">
                    <label
                      v-for="opcion in ZONA_OPCIONES"
                      :key="opcion"
                      :class="claseRadio(vivienda.zona, opcion, 'vivienda.zona')"
                    >
                      <input
                        v-model="vivienda.zona"
                        type="radio"
                        name="m-vivienda-zona"
                        :value="opcion"
                        class="h-4 w-4 accent-primario"
                        @change="limpiarError('vivienda.zona')"
                      />
                      {{ opcion }}
                    </label>
                  </div>
                </div>
                <p v-if="errores['vivienda.zona']" class="mt-1 text-xs text-red-600">
                  {{ errores['vivienda.zona'] }}
                </p>

                <div class="mt-3 flex flex-wrap gap-2">
                  <label
                    v-for="opcion in TENENCIA_OPCIONES"
                    :key="opcion"
                    :class="claseRadio(vivienda.tenencia, opcion, 'vivienda.tenencia')"
                  >
                    <input
                      v-model="vivienda.tenencia"
                      type="radio"
                      name="m-vivienda-tenencia"
                      :value="opcion"
                      class="h-4 w-4 accent-primario"
                      @change="limpiarError('vivienda.tenencia')"
                    />
                    {{ opcion }}
                  </label>
                </div>
                <p v-if="errores['vivienda.tenencia']" class="mt-1 text-xs text-red-600">
                  {{ errores['vivienda.tenencia'] }}
                </p>

                <div v-if="vivienda.tenencia === OTRO_TENENCIA" class="mt-3">
                  <label for="m-vivienda-tenencia-otra" class="text-xs font-semibold text-slate-600">
                    Especifique <span class="text-red-500">*</span>
                  </label>
                  <input
                    id="m-vivienda-tenencia-otra"
                    :value="vivienda.tenenciaOtro"
                    type="text"
                    autocomplete="off"
                    placeholder="Escribe cuál"
                    :class="claseCampo('vivienda.tenenciaOtro')"
                    @input="alViviendaOtro('tenenciaOtro', $event, 'vivienda.tenenciaOtro')"
                  />
                  <p v-if="errores['vivienda.tenenciaOtro']" class="mt-1 text-xs text-red-600">
                    {{ errores['vivienda.tenenciaOtro'] }}
                  </p>
                </div>
              </fieldset>

              <!-- 6.2 Paredes -->
              <fieldset class="rounded-lg border border-slate-200 p-3">
                <legend class="px-1 text-xs font-semibold text-slate-600">
                  6.2 Material predominante de las paredes <span class="text-red-500">*</span>
                </legend>
                <div class="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <label
                    v-for="opcion in PAREDES_OPCIONES"
                    :key="opcion"
                    :class="claseCuadro(vivienda.paredes.includes(opcion), 'vivienda.paredes')"
                  >
                    <input
                      v-model="vivienda.paredes"
                      type="checkbox"
                      :value="opcion"
                      class="h-4 w-4 accent-primario"
                      @change="alCuadro(vivienda.paredes, opcion, 'vivienda.paredes')"
                    />
                    {{ opcion }}
                  </label>
                </div>
                <p v-if="errores['vivienda.paredes']" class="mt-1 text-xs text-red-600">
                  {{ errores['vivienda.paredes'] }}
                </p>
                <div v-if="vivienda.paredes.includes(OTROS_PAREDES)" class="mt-3">
                  <label for="m-vivienda-paredes-otros" class="text-xs font-semibold text-slate-600">
                    Otros (especifique) <span class="text-red-500">*</span>
                  </label>
                  <input
                    id="m-vivienda-paredes-otros"
                    :value="vivienda.paredesOtro"
                    type="text"
                    autocomplete="off"
                    placeholder="Escribe el material"
                    :class="claseCampo('vivienda.paredesOtro')"
                    @input="alViviendaOtro('paredesOtro', $event, 'vivienda.paredesOtro')"
                  />
                  <p v-if="errores['vivienda.paredesOtro']" class="mt-1 text-xs text-red-600">
                    {{ errores['vivienda.paredesOtro'] }}
                  </p>
                </div>
              </fieldset>

              <!-- 6.3 Piso -->
              <fieldset class="rounded-lg border border-slate-200 p-3">
                <legend class="px-1 text-xs font-semibold text-slate-600">
                  6.3 Material predominante del piso <span class="text-red-500">*</span>
                </legend>
                <div class="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <label
                    v-for="opcion in PISO_OPCIONES"
                    :key="opcion"
                    :class="claseCuadro(vivienda.piso.includes(opcion), 'vivienda.piso')"
                  >
                    <input
                      v-model="vivienda.piso"
                      type="checkbox"
                      :value="opcion"
                      class="h-4 w-4 accent-primario"
                      @change="alCuadro(vivienda.piso, opcion, 'vivienda.piso')"
                    />
                    {{ opcion }}
                  </label>
                </div>
                <p v-if="errores['vivienda.piso']" class="mt-1 text-xs text-red-600">
                  {{ errores['vivienda.piso'] }}
                </p>
                <div v-if="vivienda.piso.includes(OTROS_PISO)" class="mt-3">
                  <label for="m-vivienda-piso-otros" class="text-xs font-semibold text-slate-600">
                    Otros materiales (especifique) <span class="text-red-500">*</span>
                  </label>
                  <input
                    id="m-vivienda-piso-otros"
                    :value="vivienda.pisoOtro"
                    type="text"
                    autocomplete="off"
                    placeholder="Escribe el material"
                    :class="claseCampo('vivienda.pisoOtro')"
                    @input="alViviendaOtro('pisoOtro', $event, 'vivienda.pisoOtro')"
                  />
                  <p v-if="errores['vivienda.pisoOtro']" class="mt-1 text-xs text-red-600">
                    {{ errores['vivienda.pisoOtro'] }}
                  </p>
                </div>
              </fieldset>

              <!-- 6.4 Techo -->
              <fieldset class="rounded-lg border border-slate-200 p-3">
                <legend class="px-1 text-xs font-semibold text-slate-600">
                  6.4 Material predominante del techo <span class="text-red-500">*</span>
                </legend>
                <div class="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <label
                    v-for="opcion in TECHO_OPCIONES"
                    :key="opcion"
                    :class="claseCuadro(vivienda.techo.includes(opcion), 'vivienda.techo')"
                  >
                    <input
                      v-model="vivienda.techo"
                      type="checkbox"
                      :value="opcion"
                      class="h-4 w-4 accent-primario"
                      @change="alCuadro(vivienda.techo, opcion, 'vivienda.techo')"
                    />
                    {{ opcion }}
                  </label>
                </div>
                <p v-if="errores['vivienda.techo']" class="mt-1 text-xs text-red-600">
                  {{ errores['vivienda.techo'] }}
                </p>
                <div v-if="vivienda.techo.includes(OTRO_TECHO)" class="mt-3">
                  <label for="m-vivienda-techo-otro" class="text-xs font-semibold text-slate-600">
                    Otra materia (especifique) <span class="text-red-500">*</span>
                  </label>
                  <input
                    id="m-vivienda-techo-otro"
                    :value="vivienda.techoOtro"
                    type="text"
                    autocomplete="off"
                    placeholder="Escribe el material"
                    :class="claseCampo('vivienda.techoOtro')"
                    @input="alViviendaOtro('techoOtro', $event, 'vivienda.techoOtro')"
                  />
                  <p v-if="errores['vivienda.techoOtro']" class="mt-1 text-xs text-red-600">
                    {{ errores['vivienda.techoOtro'] }}
                  </p>
                </div>
              </fieldset>

              <!-- 6.5 Servicios de luz -->
              <fieldset class="rounded-lg border border-slate-200 p-3">
                <legend class="px-1 text-xs font-semibold text-slate-600">
                  6.5 Servicios básicos luz y otros de la vivienda <span class="text-red-500">*</span>
                </legend>
                <div class="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <label
                    v-for="opcion in LUZ_OPCIONES"
                    :key="opcion"
                    :class="claseCuadro(vivienda.luz.includes(opcion), 'vivienda.luz')"
                  >
                    <input
                      v-model="vivienda.luz"
                      type="checkbox"
                      :value="opcion"
                      class="h-4 w-4 accent-primario"
                      @change="alCuadro(vivienda.luz, opcion, 'vivienda.luz')"
                    />
                    {{ opcion }}
                  </label>
                </div>
                <p v-if="errores['vivienda.luz']" class="mt-1 text-xs text-red-600">
                  {{ errores['vivienda.luz'] }}
                </p>
                <div v-if="vivienda.luz.includes(OTRO_LUZ)" class="mt-3">
                  <label for="m-vivienda-luz-otra" class="text-xs font-semibold text-slate-600">
                    Otra clase (especifique) <span class="text-red-500">*</span>
                  </label>
                  <input
                    id="m-vivienda-luz-otra"
                    :value="vivienda.luzOtro"
                    type="text"
                    autocomplete="off"
                    placeholder="Escribe cuál"
                    :class="claseCampo('vivienda.luzOtro')"
                    @input="alViviendaOtro('luzOtro', $event, 'vivienda.luzOtro')"
                  />
                  <p v-if="errores['vivienda.luzOtro']" class="mt-1 text-xs text-red-600">
                    {{ errores['vivienda.luzOtro'] }}
                  </p>
                </div>
              </fieldset>

              <!-- 6.6 Agua -->
              <fieldset class="rounded-lg border border-slate-200 p-3">
                <legend class="px-1 text-xs font-semibold text-slate-600">
                  6.6 Servicio básico de agua <span class="text-red-500">*</span>
                </legend>
                <div class="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <label
                    v-for="opcion in AGUA_OPCIONES"
                    :key="opcion"
                    :class="claseCuadro(vivienda.agua.includes(opcion), 'vivienda.agua')"
                  >
                    <input
                      v-model="vivienda.agua"
                      type="checkbox"
                      :value="opcion"
                      class="h-4 w-4 accent-primario"
                      @change="alCuadro(vivienda.agua, opcion, 'vivienda.agua')"
                    />
                    {{ opcion }}
                  </label>
                </div>
                <p v-if="errores['vivienda.agua']" class="mt-1 text-xs text-red-600">
                  {{ errores['vivienda.agua'] }}
                </p>
                <div v-if="vivienda.agua.includes(OTRO_AGUA)" class="mt-3">
                  <label for="m-vivienda-agua-otro" class="text-xs font-semibold text-slate-600">
                    Otro (especifique) <span class="text-red-500">*</span>
                  </label>
                  <input
                    id="m-vivienda-agua-otro"
                    :value="vivienda.aguaOtro"
                    type="text"
                    autocomplete="off"
                    placeholder="Escribe cuál"
                    :class="claseCampo('vivienda.aguaOtro')"
                    @input="alViviendaOtro('aguaOtro', $event, 'vivienda.aguaOtro')"
                  />
                  <p v-if="errores['vivienda.aguaOtro']" class="mt-1 text-xs text-red-600">
                    {{ errores['vivienda.aguaOtro'] }}
                  </p>
                </div>
              </fieldset>

              <!-- 6.7 Servicio sanitario -->
              <fieldset class="rounded-lg border border-slate-200 p-3">
                <legend class="px-1 text-xs font-semibold text-slate-600">
                  6.7 Tipo de servicio sanitario en la vivienda <span class="text-red-500">*</span>
                </legend>
                <div class="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <label
                    v-for="opcion in SANITARIO_OPCIONES"
                    :key="opcion"
                    :class="claseCuadro(vivienda.sanitario.includes(opcion), 'vivienda.sanitario')"
                  >
                    <input
                      v-model="vivienda.sanitario"
                      type="checkbox"
                      :value="opcion"
                      class="h-4 w-4 accent-primario"
                      @change="
                        alCuadro(
                          vivienda.sanitario,
                          opcion,
                          'vivienda.sanitario',
                          NO_APLICA_SANITARIO,
                        )
                      "
                    />
                    {{ opcion }}
                  </label>
                </div>
                <p v-if="errores['vivienda.sanitario']" class="mt-1 text-xs text-red-600">
                  {{ errores['vivienda.sanitario'] }}
                </p>
                <div v-if="vivienda.sanitario.includes(OTRO_SANITARIO)" class="mt-3">
                  <label for="m-vivienda-sanitario-otro" class="text-xs font-semibold text-slate-600">
                    Otro (especifique) <span class="text-red-500">*</span>
                  </label>
                  <input
                    id="m-vivienda-sanitario-otro"
                    :value="vivienda.sanitarioOtro"
                    type="text"
                    autocomplete="off"
                    placeholder="Escribe cuál"
                    :class="claseCampo('vivienda.sanitarioOtro')"
                    @input="alViviendaOtro('sanitarioOtro', $event, 'vivienda.sanitarioOtro')"
                  />
                  <p v-if="errores['vivienda.sanitarioOtro']" class="mt-1 text-xs text-red-600">
                    {{ errores['vivienda.sanitarioOtro'] }}
                  </p>
                </div>
              </fieldset>

              <!-- 6.8 Medios de comunicación -->
              <fieldset class="rounded-lg border border-slate-200 p-3">
                <legend class="px-1 text-xs font-semibold text-slate-600">
                  6.8 Medios de comunicación que cuenta el hogar <span class="text-red-500">*</span>
                </legend>
                <div class="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <label
                    v-for="opcion in COMUNICACION_OPCIONES"
                    :key="opcion"
                    :class="
                      claseCuadro(vivienda.comunicacion.includes(opcion), 'vivienda.comunicacion')
                    "
                  >
                    <input
                      v-model="vivienda.comunicacion"
                      type="checkbox"
                      :value="opcion"
                      class="h-4 w-4 accent-primario"
                      @change="alCuadro(vivienda.comunicacion, opcion, 'vivienda.comunicacion')"
                    />
                    {{ opcion }}
                  </label>
                </div>
                <p v-if="errores['vivienda.comunicacion']" class="mt-1 text-xs text-red-600">
                  {{ errores['vivienda.comunicacion'] }}
                </p>
                <div v-if="vivienda.comunicacion.includes(OTROS_COMUNICACION)" class="mt-3">
                  <label
                    for="m-vivienda-comunicacion-otros"
                    class="text-xs font-semibold text-slate-600"
                  >
                    Otros (especifique) <span class="text-red-500">*</span>
                  </label>
                  <input
                    id="m-vivienda-comunicacion-otros"
                    :value="vivienda.comunicacionOtro"
                    type="text"
                    autocomplete="off"
                    placeholder="Escribe cuál"
                    :class="claseCampo('vivienda.comunicacionOtro')"
                    @input="alViviendaOtro('comunicacionOtro', $event, 'vivienda.comunicacionOtro')"
                  />
                  <p v-if="errores['vivienda.comunicacionOtro']" class="mt-1 text-xs text-red-600">
                    {{ errores['vivienda.comunicacionOtro'] }}
                  </p>
                </div>
              </fieldset>
            </div>

            <!-- ══ Parte 7: hábitos del estudiante ══ -->
            <div v-else-if="pasoActual.id === 'habitos'" class="space-y-5">
              <p class="text-xs text-slate-500">
                Los campos marcados con <span class="font-bold text-red-500">*</span> son
                requeridos.
              </p>

              <!-- 7.1 Sueño -->
              <fieldset class="rounded-lg border border-slate-200 p-3">
                <legend class="px-1 text-xs font-semibold text-slate-600">7.1 Sueño</legend>
                <div class="mt-2 grid gap-x-6 gap-y-4 sm:grid-cols-2">
                  <div>
                    <label for="m-h-sueno-noche" class="text-xs font-semibold text-slate-600">
                      Horario de sueño por la noche <span class="text-red-500">*</span>
                    </label>
                    <input
                      id="m-h-sueno-noche"
                      :value="habitos.suenoNoche"
                      type="text"
                      autocomplete="off"
                      placeholder="Ej.: 8:00 PM - 6:00 AM"
                      :class="claseCampo('habitos.suenoNoche')"
                      @input="alHabitoTexto('suenoNoche', $event, 'habitos.suenoNoche')"
                    />
                    <p v-if="errores['habitos.suenoNoche']" class="mt-1 text-xs text-red-600">
                      {{ errores['habitos.suenoNoche'] }}
                    </p>
                  </div>
                  <div>
                    <label for="m-h-sueno-dia" class="text-xs font-semibold text-slate-600">
                      Horario de sueño durante el día
                    </label>
                    <input
                      id="m-h-sueno-dia"
                      :value="habitos.suenoDia"
                      type="text"
                      autocomplete="off"
                      placeholder="Ej.: 12:00 PM - 2:00 PM (o déjalo en blanco)"
                      :class="claseCampo('habitos.suenoDia')"
                      @input="alHabitoTexto('suenoDia', $event, 'habitos.suenoDia')"
                    />
                  </div>
                </div>

                <div class="mt-4">
                  <span class="text-xs font-semibold text-slate-600">
                    Tiene alguna dificultad para dormir <span class="text-red-500">*</span>
                  </span>
                  <div class="mt-1 flex flex-wrap items-center gap-2">
                    <label
                      v-for="opcion in SI_NO"
                      :key="opcion"
                      :class="claseRadio(habitos.dificultadDormir, opcion, 'habitos.dificultadDormir')"
                    >
                      <input
                        v-model="habitos.dificultadDormir"
                        type="radio"
                        name="m-h-dificultad"
                        :value="opcion"
                        class="h-4 w-4 accent-primario"
                        @change="limpiarError('habitos.dificultadDormir')"
                      />
                      {{ opcion }}
                    </label>
                  </div>
                  <p v-if="errores['habitos.dificultadDormir']" class="mt-1 text-xs text-red-600">
                    {{ errores['habitos.dificultadDormir'] }}
                  </p>
                  <div v-if="habitos.dificultadDormir === 'Sí'" class="mt-2">
                    <label for="m-h-dificultad-explica" class="text-xs font-semibold text-slate-600">
                      Explique <span class="text-red-500">*</span>
                    </label>
                    <input
                      id="m-h-dificultad-explica"
                      :value="habitos.dificultadExplica"
                      type="text"
                      autocomplete="off"
                      placeholder="Escribe la dificultad"
                      :class="claseCampo('habitos.dificultadExplica')"
                      @input="alHabitoTexto('dificultadExplica', $event, 'habitos.dificultadExplica')"
                    />
                    <p v-if="errores['habitos.dificultadExplica']" class="mt-1 text-xs text-red-600">
                      {{ errores['habitos.dificultadExplica'] }}
                    </p>
                  </div>
                </div>

                <div class="mt-4">
                  <span class="text-xs font-semibold text-slate-600">
                    Con quién duerme <span class="text-red-500">*</span>
                  </span>
                  <div class="mt-1 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                    <label
                      v-for="opcion in CON_QUIEN_OPCIONES"
                      :key="opcion"
                      :class="
                        claseCuadro(habitos.conQuienDuerme.includes(opcion), 'habitos.conQuienDuerme')
                      "
                    >
                      <input
                        v-model="habitos.conQuienDuerme"
                        type="checkbox"
                        :value="opcion"
                        class="h-4 w-4 accent-primario"
                        @change="alCuadro(habitos.conQuienDuerme, opcion, 'habitos.conQuienDuerme')"
                      />
                      {{ opcion }}
                    </label>
                  </div>
                  <p v-if="errores['habitos.conQuienDuerme']" class="mt-1 text-xs text-red-600">
                    {{ errores['habitos.conQuienDuerme'] }}
                  </p>
                  <div v-if="habitos.conQuienDuerme.includes(OTROS_CON_QUIEN)" class="mt-2">
                    <label for="m-h-con-quien-otros" class="text-xs font-semibold text-slate-600">
                      Otros (especifique) <span class="text-red-500">*</span>
                    </label>
                    <input
                      id="m-h-con-quien-otros"
                      :value="habitos.conQuienOtro"
                      type="text"
                      autocomplete="off"
                      placeholder="Escribe con quién"
                      :class="claseCampo('habitos.conQuienOtro')"
                      @input="alHabitoTexto('conQuienOtro', $event, 'habitos.conQuienOtro')"
                    />
                    <p v-if="errores['habitos.conQuienOtro']" class="mt-1 text-xs text-red-600">
                      {{ errores['habitos.conQuienOtro'] }}
                    </p>
                  </div>
                </div>
              </fieldset>

              <!-- 7.2 Alimentación -->
              <fieldset class="rounded-lg border border-slate-200 p-3">
                <legend class="px-1 text-xs font-semibold text-slate-600">7.2 Alimentación</legend>
                <div class="mt-2">
                  <span class="text-xs font-semibold text-slate-600">
                    Fue o es alimentado con lactancia materna exclusivamente
                    <span class="text-red-500">*</span>
                  </span>
                  <div class="mt-1 flex flex-wrap items-center gap-2">
                    <label
                      v-for="opcion in SI_NO"
                      :key="opcion"
                      :class="claseRadio(habitos.lactancia, opcion, 'habitos.lactancia')"
                    >
                      <input
                        v-model="habitos.lactancia"
                        type="radio"
                        name="m-h-lactancia"
                        :value="opcion"
                        class="h-4 w-4 accent-primario"
                        @change="limpiarError('habitos.lactancia')"
                      />
                      {{ opcion }}
                    </label>
                  </div>
                  <p v-if="errores['habitos.lactancia']" class="mt-1 text-xs text-red-600">
                    {{ errores['habitos.lactancia'] }}
                  </p>
                  <div v-if="habitos.lactancia === 'Sí'" class="mt-2 max-w-xs">
                    <label for="m-h-lactancia-meses" class="text-xs font-semibold text-slate-600">
                      ¿Cuánto tiempo (meses)? <span class="text-red-500">*</span>
                    </label>
                    <input
                      id="m-h-lactancia-meses"
                      :value="habitos.lactanciaMeses"
                      type="text"
                      inputmode="numeric"
                      autocomplete="off"
                      placeholder="Solo números"
                      :class="claseCampo('habitos.lactanciaMeses')"
                      @input="alHabitoTexto('lactanciaMeses', $event, 'habitos.lactanciaMeses', true)"
                    />
                    <p v-if="errores['habitos.lactanciaMeses']" class="mt-1 text-xs text-red-600">
                      {{ errores['habitos.lactanciaMeses'] }}
                    </p>
                  </div>
                </div>

                <div class="mt-4">
                  <span class="text-xs font-semibold text-slate-600">
                    Ha presentado cambios que afectan su alimentación
                    <span class="text-red-500">*</span>
                  </span>
                  <div class="mt-1 flex flex-wrap items-center gap-2">
                    <label
                      v-for="opcion in SI_NO"
                      :key="opcion"
                      :class="
                        claseRadio(habitos.cambiosAlimentacion, opcion, 'habitos.cambiosAlimentacion')
                      "
                    >
                      <input
                        v-model="habitos.cambiosAlimentacion"
                        type="radio"
                        name="m-h-cambios"
                        :value="opcion"
                        class="h-4 w-4 accent-primario"
                        @change="limpiarError('habitos.cambiosAlimentacion')"
                      />
                      {{ opcion }}
                    </label>
                  </div>
                  <p
                    v-if="errores['habitos.cambiosAlimentacion']"
                    class="mt-1 text-xs text-red-600"
                  >
                    {{ errores['habitos.cambiosAlimentacion'] }}
                  </p>
                  <div v-if="habitos.cambiosAlimentacion === 'Sí'" class="mt-2">
                    <label for="m-h-cambios-cual" class="text-xs font-semibold text-slate-600">
                      ¿Cuál? <span class="text-red-500">*</span>
                    </label>
                    <input
                      id="m-h-cambios-cual"
                      :value="habitos.cambiosCual"
                      type="text"
                      autocomplete="off"
                      placeholder="Escribe qué cambió"
                      :class="claseCampo('habitos.cambiosCual')"
                      @input="alHabitoTexto('cambiosCual', $event, 'habitos.cambiosCual')"
                    />
                    <p v-if="errores['habitos.cambiosCual']" class="mt-1 text-xs text-red-600">
                      {{ errores['habitos.cambiosCual'] }}
                    </p>
                  </div>
                </div>
              </fieldset>

              <!-- 7.3 Alimentos que consume -->
              <fieldset class="rounded-lg border border-slate-200 p-3">
                <legend class="px-1 text-xs font-semibold text-slate-600">
                  7.3 Alimentos que consume <span class="text-red-500">*</span>
                </legend>
                <div class="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  <label
                    v-for="opcion in ALIMENTOS_OPCIONES"
                    :key="opcion"
                    :class="claseCuadro(habitos.alimentos.includes(opcion), 'habitos.alimentos')"
                  >
                    <input
                      v-model="habitos.alimentos"
                      type="checkbox"
                      :value="opcion"
                      class="h-4 w-4 accent-primario"
                      @change="alCuadro(habitos.alimentos, opcion, 'habitos.alimentos')"
                    />
                    {{ opcion }}
                  </label>
                </div>
                <p v-if="errores['habitos.alimentos']" class="mt-1 text-xs text-red-600">
                  {{ errores['habitos.alimentos'] }}
                </p>
                <div v-if="habitos.alimentos.includes(OTROS_ALIMENTOS)" class="mt-3">
                  <label for="m-h-alimentos-otros" class="text-xs font-semibold text-slate-600">
                    Otros (especifique) <span class="text-red-500">*</span>
                  </label>
                  <input
                    id="m-h-alimentos-otros"
                    :value="habitos.alimentosOtros"
                    type="text"
                    autocomplete="off"
                    placeholder="Escribe cuáles"
                    :class="claseCampo('habitos.alimentosOtros')"
                    @input="alHabitoTexto('alimentosOtros', $event, 'habitos.alimentosOtros')"
                  />
                  <p v-if="errores['habitos.alimentosOtros']" class="mt-1 text-xs text-red-600">
                    {{ errores['habitos.alimentosOtros'] }}
                  </p>
                </div>
              </fieldset>

              <!-- 7.4 y 7.5 -->
              <div class="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <fieldset class="rounded-lg border border-slate-200 p-3">
                  <legend class="px-1 text-xs font-semibold text-slate-600">
                    7.4 ¿Cuántos tiempos de comida realiza? <span class="text-red-500">*</span>
                  </legend>
                  <div class="mt-2 flex flex-wrap gap-2">
                    <label
                      v-for="opcion in TIEMPOS_OPCIONES"
                      :key="opcion"
                      :class="claseCuadro(habitos.comidas.includes(opcion), 'habitos.comidas')"
                    >
                      <input
                        v-model="habitos.comidas"
                        type="checkbox"
                        :value="opcion"
                        class="h-4 w-4 accent-primario"
                        @change="alCuadro(habitos.comidas, opcion, 'habitos.comidas')"
                      />
                      {{ opcion }}
                    </label>
                  </div>
                  <p v-if="errores['habitos.comidas']" class="mt-1 text-xs text-red-600">
                    {{ errores['habitos.comidas'] }}
                  </p>
                </fieldset>

                <fieldset class="rounded-lg border border-slate-200 p-3">
                  <legend class="px-1 text-xs font-semibold text-slate-600">
                    7.5 ¿Cuántos refrigerios realiza? <span class="text-red-500">*</span>
                  </legend>
                  <div class="mt-2 flex flex-wrap gap-2">
                    <label
                      v-for="opcion in REFRIGERIOS_OPCIONES"
                      :key="opcion"
                      :class="claseRadio(habitos.refrigerios, opcion, 'habitos.refrigerios')"
                    >
                      <input
                        v-model="habitos.refrigerios"
                        type="radio"
                        name="m-h-refrigerios"
                        :value="opcion"
                        class="h-4 w-4 accent-primario"
                        @change="limpiarError('habitos.refrigerios')"
                      />
                      {{ opcion }}
                    </label>
                  </div>
                  <p v-if="errores['habitos.refrigerios']" class="mt-1 text-xs text-red-600">
                    {{ errores['habitos.refrigerios'] }}
                  </p>
                </fieldset>
              </div>

              <!-- 7.6, 7.6.1 y 7.8 -->
              <fieldset class="rounded-lg border border-slate-200 p-3">
                <legend class="px-1 text-xs font-semibold text-slate-600">7.6 Alergias</legend>
                <div class="mt-2">
                  <span class="text-xs font-semibold text-slate-600">
                    ¿Es alérgico a algún alimento? <span class="text-red-500">*</span>
                  </span>
                  <div class="mt-1 flex flex-wrap gap-2">
                    <label
                      v-for="opcion in SI_NO"
                      :key="opcion"
                      :class="claseRadio(habitos.alergia, opcion, 'habitos.alergia')"
                    >
                      <input
                        v-model="habitos.alergia"
                        type="radio"
                        name="m-h-alergia"
                        :value="opcion"
                        class="h-4 w-4 accent-primario"
                        @change="limpiarError('habitos.alergia')"
                      />
                      {{ opcion }}
                    </label>
                  </div>
                  <p v-if="errores['habitos.alergia']" class="mt-1 text-xs text-red-600">
                    {{ errores['habitos.alergia'] }}
                  </p>
                  <div v-if="habitos.alergia === 'Sí'" class="mt-2">
                    <label for="m-h-alergico-cuales" class="text-xs font-semibold text-slate-600">
                      7.6.1 Si su respuesta anterior es afirmativa ¿A cuál(es)?
                      <span class="text-red-500">*</span>
                    </label>
                    <input
                      id="m-h-alergico-cuales"
                      :value="habitos.alergicoCuales"
                      type="text"
                      autocomplete="off"
                      placeholder="Escribe a cuál(es)"
                      :class="claseCampo('habitos.alergicoCuales')"
                      @input="alHabitoTexto('alergicoCuales', $event, 'habitos.alergicoCuales')"
                    />
                    <p v-if="errores['habitos.alergicoCuales']" class="mt-1 text-xs text-red-600">
                      {{ errores['habitos.alergicoCuales'] }}
                    </p>
                  </div>
                </div>

                <div class="mt-4">
                  <label for="m-h-preferidos" class="text-xs font-semibold text-slate-600">
                    7.8 Alimentos que prefiere
                  </label>
                  <input
                    id="m-h-preferidos"
                    :value="habitos.preferidos"
                    type="text"
                    autocomplete="off"
                    placeholder="Escribe los alimentos que más le gustan"
                    :class="claseCampo('habitos.preferidos')"
                    @input="alHabitoTexto('preferidos', $event, 'habitos.preferidos')"
                  />
                </div>
              </fieldset>
            </div>

            <!-- ══ Parte 8: participación y compromisos ══ -->
            <div v-else-if="pasoActual.id === 'participacion'" class="space-y-5">
              <p class="text-xs text-slate-500">
                Puede marcar más de una actividad.
              </p>
              <div>
                <span class="text-xs font-semibold text-slate-600">
                  ¿En qué actividad les gustaría apoyar? <span class="text-red-500">*</span>
                </span>
                <div class="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <label
                    v-for="opcion in PARTICIPACION_OPCIONES"
                    :key="opcion"
                    :class="
                      claseCuadro(participacion.actividades.includes(opcion), 'participacion.actividades')
                    "
                  >
                    <input
                      v-model="participacion.actividades"
                      type="checkbox"
                      :value="opcion"
                      class="h-4 w-4 accent-primario"
                      @change="alCuadro(participacion.actividades, opcion, 'participacion.actividades')"
                    />
                    {{ opcion }}
                  </label>
                </div>
                <p v-if="errores['participacion.actividades']" class="mt-1 text-xs text-red-600">
                  {{ errores['participacion.actividades'] }}
                </p>
              </div>
              <div>
                <label for="m-participacion-obs" class="text-xs font-semibold text-slate-600">
                  Observaciones
                </label>
                <textarea
                  id="m-participacion-obs"
                  v-model="participacion.observaciones"
                  rows="3"
                  class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-primario focus:ring-2 focus:ring-primario/20"
                  placeholder="Comentarios adicionales (opcional)"
                ></textarea>
              </div>
            </div>

            <!-- ══ Parte 9: modalidad de atención (última: GUARDAR) ══ -->
            <div v-else class="space-y-5">
              <p class="text-xs text-slate-500">
                Al presionar <span class="font-semibold">Guardar</span>, TODOS los datos se guardan
                en el Sheet "estudiantes" y los datos importantes van a Firebase.
              </p>

              <div>
                <span class="text-xs font-semibold text-slate-600">
                  Modalidad de atención <span class="text-red-500">*</span>
                </span>
                <label
                  :class="
                    claseCuadro(modalidadAtencion.institucional, 'modalidad.institucional')
                  "
                  @click.prevent="modalidadAtencion.institucional = !modalidadAtencion.institucional"
                >
                  <input
                    v-model="modalidadAtencion.institucional"
                    type="checkbox"
                    class="h-4 w-4 accent-primario"
                  />
                  {{ MODALIDAD_ATENCION }}
                </label>
                <p v-if="errores['modalidad.institucional']" class="mt-1 text-xs text-red-600">
                  {{ errores['modalidad.institucional'] }}
                </p>
              </div>

              <div class="grid gap-x-6 gap-y-5 sm:grid-cols-2">
                <div>
                  <label for="m-atencion-fecha" class="text-xs font-semibold text-slate-600">
                    Fecha de inscripción <span class="text-red-500">*</span>
                    <span class="font-normal text-slate-400">(dd/mm/aaaa)</span>
                  </label>
                  <input
                    id="m-atencion-fecha"
                    v-model="modalidadAtencion.fechaInscripcion"
                    type="date"
                    :max="hoyISO"
                    :class="claseCampo('modalidad.fechaInscripcion')"
                    @change="limpiarError('modalidad.fechaInscripcion')"
                  />
                  <p v-if="modalidadAtencion.fechaInscripcion" class="mt-1 text-xs text-slate-400">
                    Fecha elegida: {{ fechaCorta(modalidadAtencion.fechaInscripcion) }} (dd/mm/yyyy)
                  </p>
                  <p v-if="errores['modalidad.fechaInscripcion']" class="mt-1 text-xs text-red-600">
                    {{ errores['modalidad.fechaInscripcion'] }}
                  </p>
                </div>
                <div>
                  <label for="m-atencion-docente" class="text-xs font-semibold text-slate-600">
                    Nombre del o la docente responsable <span class="text-red-500">*</span>
                  </label>
                  <input
                    id="m-atencion-docente"
                    :value="modalidadAtencion.docente"
                    type="text"
                    autocomplete="off"
                    placeholder="Nombre del docente"
                    :class="claseCampo('modalidad.docente')"
                    @input="alDocenteResponsable"
                  />
                  <p v-if="errores['modalidad.docente']" class="mt-1 text-xs text-red-600">
                    {{ errores['modalidad.docente'] }}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- Pie: Anterior / Siguiente (o Guardar en la última parte).
               El botón CANCELAR vive en la barra de nivel, junto a "Cambiar". -->
          <div class="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
            <button
              v-if="paso > 0"
              type="button"
              class="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              @click="anterior"
            >
              <span class="block" v-html="iconoIzquierda"></span>
              Anterior
            </button>
            <span v-else></span>

            <button
              v-if="!esUltimoPaso"
              type="button"
              class="flex items-center gap-1.5 rounded-lg bg-primario px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primario-oscuro"
              @click="siguiente"
            >
              Siguiente
              <span class="block" v-html="iconoDerecha"></span>
            </button>
            <button
              v-else
              type="button"
              class="flex items-center gap-1.5 rounded-lg bg-primario px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primario-oscuro"
              @click="guardarTodo"
            >
              <span class="block" v-html="iconoGuardar"></span>
              Guardar
            </button>
          </div>
        </div>
      </template>

      <!-- ═══ EDUCACIÓN BÁSICA: se construye después ═══ -->
      <div
        v-else
        class="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500"
      >
        Aquí se pintará el módulo de matrícula de
        <strong class="text-slate-700">{{ opcionElegida.nombre }}</strong
        >. Cuando el flujo exista, este panel se reemplazará por el formulario real.
      </div>
    </template>
  </section>

  <!-- Modal de selección de modalidad -->
  <ModalBase
    v-if="modalAbierto"
    titulo="Matricular — elige la modalidad"
    ancho="max-w-xl"
    @cerrar="cerrarModal"
  >
    <p class="mb-3 text-sm text-slate-500">¿De qué modalidad será la matrícula?</p>
    <div class="grid gap-3 sm:grid-cols-2">
      <button
        v-for="opcion in OPCIONES"
        :key="opcion.id"
        type="button"
        class="rounded-xl border p-4 text-left transition-colors"
        :class="
          modalidad === opcion.id
            ? 'border-primario bg-primario-suave'
            : 'border-slate-300 hover:border-primario hover:bg-primario-suave/50'
        "
        @click="elegir(opcion.id)"
      >
        <span
          class="mb-3 grid h-11 w-11 place-items-center rounded-lg bg-white text-primario"
          v-html="opcion.icono"
        ></span>
        <span class="block text-sm font-bold text-slate-900">{{ opcion.nombre }}</span>
        <span class="mt-0.5 block text-xs text-slate-500">{{ opcion.descripcion }}</span>
        <span v-if="modalidad === opcion.id" class="mt-2 block text-xs font-semibold text-primario">
          Modalidad en uso — pulsa para continuar con ella
        </span>
      </button>
    </div>
  </ModalBase>

  <!-- Modal del RESPONSABLE: al darle Siguiente en la parte 2.4, se elige
       entre las personas que sí se llenaron (madre, padre, otra persona) -->
  <ModalBase
    v-if="modalResponsable"
    titulo="Elige a la persona responsable"
    ancho="max-w-lg"
    @cerrar="cerrarModalResponsable"
  >
    <p class="text-sm text-slate-500">
      Según los datos llenados, ¿quién será el responsable del estudiante?
    </p>
    <div class="mt-3 grid gap-2">
      <label
        v-for="opcion in opcionesResponsable"
        :key="opcion.clave"
        :class="claseRadio(responsableSeleccion, opcion.clave, 'responsable')"
      >
        <input
          v-model="responsableSeleccion"
          type="radio"
          name="m-responsable"
          :value="opcion.clave"
          class="h-4 w-4 accent-primario"
          @change="errorResponsable = ''"
        />
        <span>
          <span class="block text-sm font-semibold">{{ opcion.etiqueta }}</span>
          <span class="block text-xs font-normal text-slate-500">{{ opcion.nombre }}</span>
        </span>
      </label>
    </div>
    <p v-if="errorResponsable" class="mt-2 text-xs text-red-600">{{ errorResponsable }}</p>

    <div class="mt-5 flex justify-end gap-2">
      <button
        type="button"
        class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
        @click="cerrarModalResponsable"
      >
        Cancelar
      </button>
      <button
        type="button"
        class="rounded-lg bg-primario px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primario-oscuro"
        @click="confirmarResponsable"
      >
        Continuar
      </button>
    </div>
  </ModalBase>

  <!-- Reconfirmación (recarga con borrador o cancelación de la edición):
       ACEPTAR borra lo editado del local y deja limpio; CANCELAR recupera. -->
  <ModalConfirmacion
    v-if="modalBorrador"
    :titulo="textosBorrador.titulo"
    :texto="textosBorrador.texto"
    :confirmar-texto="textosBorrador.boton"
    :tono="textosBorrador.tono"
    @confirmar="aceptarBorrador"
    @cerrar="seguirBorrador"
  />
</template>
