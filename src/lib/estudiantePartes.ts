/* ── Partes EDITABLES de un estudiante ya matriculado ──
   Estudiantes › Actualizar deja editar UNA PARTE de un estudiante que ya
   existe en el Sheet "estudiantes" (y en Firebase). Este módulo describe
   esas partes como DATOS (no como plantillas): cada parte es una lista de
   campos, y cada campo sabe:
     - en qué COLUMNA del libro vive (título exacto de ENCABEZADOS_*),
     - cómo SE CARGA desde la fila del Sheet (cargarValores),
     - cómo SE GUARDA hacia la fila (columnasCampos), con las MISMAS reglas
       que usa la matrícula (N/A en blanco, "Otro (especifique)" en su
       columna propia, listas unidas con ", ", fechas dd/mm/yyyy,
       códigos telefónicos, Grado (id) recalculado),
     - cómo se VALIDA (validarValores), con los mismos requeridos.
   Propiedad clave (prueba de ida y vuelta): si se carga una fila y se
   guarda SIN editar nada, columnasCampos reproduce EXACTAMENTE las
   columnas de la parte → los cambios vacíos no se envían al Sheet.
   Los catálogos de opciones están copiados de MatricularView: si se
   cambia una lista allá, se cambia aquí (mismos textos EXACTOS). */

import { aIsoFecha, fechaCorta } from '@/lib/fechas'
import { idDeGrado } from '@/lib/estudiantes'
import type { DatosFirebaseEstudiante } from '@/lib/estudiantes'
import {
  DEPARTAMENTOS_SV,
  SIN_CANTON,
  cantonesDe,
  distritosDe,
} from '@/lib/geoSV'
import { PAISES, NOMBRES_PAISES, formatarTelefono } from '@/lib/paises'
import {
  HOJA_BASICA,
  HOJA_PRIMERA_INFANCIA,
  type HojaEstudiante,
} from '@/lib/sheetEstudiantes'

export type NivelEstudiante = 'primera-infancia' | 'educacion-basica'

/* Estado de un campo: texto (o código 'X') o lista de marcas */
export type ValorCampo = string | string[]

export type TipoValores = Record<string, ValorCampo>

interface ReglaVisible {
  clave: string
  valor: string
  /* con incluir, la regla se cumple si la clave es una LISTA que CONTIENE
     el valor (en vez de ser igual al valor) */
  incluir?: boolean
}

export interface Campo {
  clave: string
  /* Título EXACTO de la columna del libro */
  columna: string
  etiqueta: string
  tipo:
    | 'texto' /* input de texto con filtro */
    | 'area' /* textarea (observaciones) */
    | 'fecha' /* input de fecha (ISO en el estado, dd/mm/yyyy en el Sheet) */
    | 'eleccion' /* select o radios de UNA opción */
    | 'marcadores' /* casillas múltiples (la columna une con ", ") */
    | 'casilla' /* UNA casilla: marcada escribe campo.marcar, si no '' */
    | 'codigo-tel' /* select del CÓDIGO telefónico (la columna guarda el código) */
    | 'telefono' /* número formateado según el código elegido */
    | 'prefijado' /* número que se guarda con el código delante (WhatsApp) */
    | 'canton' /* select dentro de Chalatenango, texto libre fuera (persona) */
    | 'caserio' /* select N/A/Otro en Los Prados, texto + N/A fuera (persona) */
    | 'derivado-grado' /* "Grado (id)": se recalcula al guardar */
    | 'fijo' /* desactivado: se guarda siempre en blanco (Etnia en Básica) */
  opciones?: string[]
  /* catálogos que dependen de otra respuesta */
  dinamicas?: 'distritos-departamento' | 'distritos-nacimiento' | 'cantones-distrito'
  /* opciones que dependen de la FILA (responsable: solo personas con Sí) */
  opcionesSegunTiene?: { etiqueta: string; columna: string }[]
  requerido?: boolean
  mensaje?: string
  /* requerido SOLO cuando otra clave cumple la regla */
  requeridoSi?: ReglaVisible
  /* NO requerido cuando otra clave cumple la regla (NIE si es nuevo ingreso) */
  opcionalSi?: ReglaVisible
  /* se muestra (y se guarda) solo cuando otra clave cumple la regla */
  visibleSi?: ReglaVisible
  filtro?: 'digitos' | 'nombre' | 'texto' | 'documento' | 'identificacion' | 'libre' | 'max2'
  minDigitos?: number
  minCaracteres?: number
  noFutura?: boolean
  /* en el Sheet el N/A quedó en blanco: al cargar se muestra N/A */
  naEnBlanco?: boolean
  /* la opción "valor" se guarda en blanco y su texto va en otra columna */
  otro?: { valor: string; clave: string; columna: string; etiqueta: string }
  /* clave del campo 'codigo-tel' del que depende un teléfono */
  codigoDe?: string
  /* valor que escribe la casilla marcada ('X', modalidad…) */
  marcar?: string
  /* campo fijo: texto que se MUESTRA (la columna se deja en blanco) */
  fijoValor?: string
  /* clave del campo de grado del que se deriva el id */
  derivadoDe?: string
  /* texto de regla para el docente */
  nota?: string
  /* ocupar las dos columnas de la grilla */
  ancho?: 'completo'
  /* regla de guardado especial (cascadas de persona) */
  guardar?: (valores: TipoValores) => string
  /* solo acompaña a su campo padre: la columna la escribe el padre
     (evita escribir DOS veces la misma columna al guardar) */
  soloCompanero?: boolean
  /* mensaje cuando el mínimo de dígitos/caracteres no se cumple */
  mensajeMinimo?: string
}

export interface Parte {
  id: string
  etiqueta: string
  titulo: string
  nivel: NivelEstudiante
  campos: Campo[]
  /* al guardar con esta clave = 'No', TODOS los demás campos van en blanco */
  apagarConNo?: string
  /* validaciones cruzadas que no se expresan campo por campo */
  validarExtra?: (valores: TipoValores) => Record<string, string>
}

/* ── Textos especiales (los mismos de la matrícula) ── */
export const NA = 'N/A'
export const OTRO_CASERIO = 'Otro (especifique)'
export const OTRO_OCUPACION = 'Otro (especifique)'
export const CANTON_LOS_PRADOS = 'Los Prados'
const MODALIDAD_ATENCION = 'Institucional Primer Grado'
const SI_NO = ['Sí', 'No']
const ANIO_ACTUAL = new Date().getFullYear()
const HOY_ISO = aIsoFecha(new Date())

/* ── Catálogos (copiados de MatricularView, MISMO orden y textos) ── */
const DISTRITOS_CENTRO = ['Comalapa', 'Dulce Nombre de María', 'La Laguna'].sort((a, b) =>
  a.localeCompare(b, 'es'),
)
const CANTONES_CENTRO = ['Cuevitas', 'Guachipilín', 'Los Prados', 'Plan Verde', 'San José'].sort(
  (a, b) => a.localeCompare(b, 'es'),
)
const CASERIOS_CENTRO = [
  'El Ocotalito',
  'La Joya',
  'El Portillo',
  'Los Alvarados',
  'Los Mejías',
  OTRO_CASERIO,
]
const ETNIAS = ['Nahua-Pipil', 'Lenca', 'Kakawira', 'Otro']
const SEXO = ['M', 'F']
const OPCIONES_CASERIO_CENTRO = opcionesConReglas(CASERIOS_CENTRO)
const OPCIONES_ETNIA = opcionesConReglas(ETNIAS)
const OPCIONES_GRADO = [
  'Parvularia 4',
  'Parvularia 5',
  'Parvularia 6',
  'Primero',
  'Segundo',
  'Tercero',
  'Cuarto',
  'Quinto',
  'Sexto',
  'Séptimo',
  'Octavo',
  'Noveno',
]
const GRADOS_BASICA = OPCIONES_GRADO.filter((_, i) => i >= 4) /* Segundo a Noveno */

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
const OPCIONES_OCUPACION_ESTUDIANTE: string[] = [
  NA,
  ...[...OCUPACIONES].sort((a, b) => a.localeCompare(b, 'es')),
  OTRO_OCUPACION,
]
export const OPCIONES_CASERIO_PERSONA: string[] = [NA, OTRO_CASERIO]

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
const OTROS_DISC = '12. Otros'
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
const OTRO_SERV = 'Otro'
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
const PARTICIPACION_OPCIONES = [
  'Educativas',
  'Recreativas',
  'Salud',
  'Voluntariado de cocina',
  'Culturales',
  'Deportivas',
  'Higiene y Ornato',
]
const SEXO_BASICA = ['Masculino', 'Femenino']
const ESTADOS_FAMILIARES = [
  'Soltero(a)',
  'Casado(a)',
  'Unión libre (acompañado(a))',
  'Divorciado(a)',
  'Viudo(a)',
]
const OPCIONES_ESTADO_FAMILIAR = opcionesConReglas(ESTADOS_FAMILIARES)
const TIPOS_CALLE = ['Pavimentada', 'Adoquinada', 'Empedrada', 'Tierra balastre', 'Mixta']
const OPCIONES_TIPO_CALLE = opcionesConReglas(TIPOS_CALLE)
const MEDIOS_TRANSPORTE = [
  'A pie',
  'Automóvil',
  'Bicicleta',
  'Bus',
  'Moto taxi (tuktuk)',
  'Motocicleta',
  'Pick-up',
  'Taxi',
]
const OTRO_TRANSPORTE = OTRO_OCUPACION
const OPCIONES_TRANSPORTE = opcionesConReglas(MEDIOS_TRANSPORTE)
const SERVICIOS_BASICOS_LISTA = [
  'Agua',
  'Luz eléctrica',
  'Internet',
  'Drenaje de aguas negras',
  'Alcantarillado sanitario',
  'Recolección de basura',
  'Energía solar',
  'Televisión por cable',
  'Teléfono fijo',
]
const TIPOS_SANGRE = ['A+', 'A-', 'AB+', 'AB-', 'B+', 'B-', 'O+', 'O-']
const OPCIONES_SANGRE = opcionesConReglas(TIPOS_SANGRE)
const PROPIEDADES_VIVIENDA = ['Propia', 'Alquilada', 'Prestada', 'Otra (especifique)']
const OTRA_PROPIEDAD = 'Otra (especifique)'
const OPCIONES_PROPIEDAD = opcionesConReglas(PROPIEDADES_VIVIENDA)
const DEPENDENCIAS_ECONOMICAS = ['Padre', 'Madre', 'Padre y Madre', 'Otros (especifique)']
const OTROS_DEPENDENCIA = 'Otros (especifique)'
const OPCIONES_DEPENDENCIA = opcionesConReglas(DEPENDENCIAS_ECONOMICAS)
const PROFESIONES = [
  'Abogado(a)',
  'Arquitecto(a)',
  'Contador(a)',
  'Doctor(a)',
  'Enfermero(a)',
  'Ingeniero(a)',
  'Maestro(a)',
  'Mecánico(a)',
  'Piloto(a)',
  'Técnico(a)',
]
const OPCIONES_PROFESION: string[] = [
  ...[...PROFESIONES].sort((a, b) => a.localeCompare(b, 'es')),
  OTRO_OCUPACION,
]
const ESCOLARIDADES = ['Parvularia', 'Básica', 'Media', 'Universitaria']
const NACIONALIDADES_CA = [
  'Beliceña',
  'Costarricense',
  'Guatemalteca',
  'Hondureña',
  'Nicaragüense',
  'Panameña',
  'Salvadoreña',
].sort((a, b) => a.localeCompare(b, 'es'))

/* Códigos telefónicos ÚNICOS (los países que comparten código, p. ej.
   "+1", aportan UNA sola opción; la etiqueta muestra el primer país). */
export const CODIGOS_TEL: { codigo: string; etiqueta: string }[] = (() => {
  const vistos = new Map<string, string>()
  for (const pais of PAISES) {
    if (!vistos.has(pais.codigo)) vistos.set(pais.codigo, pais.nombre)
  }
  return [...vistos].map(([codigo, nombre]) => ({ codigo, etiqueta: `${codigo} — ${nombre}` }))
})()

/* País representativo de un código (para el formato y los dígitos) */
function paisDeCodigo(codigo: string) {
  return PAISES.find((p) => p.codigo === codigo) ?? null
}

/* Ordena alfabético, "N/A" primero y "Otro…" al final (regla del proyecto) */
function opcionesConReglas(lista: string[]): string[] {
  const orden = [...lista].sort((a, b) => a.localeCompare(b, 'es'))
  const otros = orden.filter((o) => /^otro/i.test(o))
  return [NA, ...orden.filter((o) => !/^otro/i.test(o)), ...otros]
}

/* ── Filtros de teclado (los mismos de la matrícula) ── */
export function aplicarFiltro(filtro: Campo['filtro'], valor: string): string {
  const crudo = valor
  switch (filtro) {
    case 'digitos':
      return crudo.replace(/\D/g, '')
    case 'max2':
      return crudo.replace(/\D/g, '').slice(0, 2)
    case 'nombre':
      return crudo
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, (c) => (c === '\u0303' ? c : ''))
        .normalize('NFC')
        .replace(/[^A-ZÑ ]/g, '')
        .replace(/ {2,}/g, ' ')
    case 'texto':
      return crudo
        .toUpperCase()
        .replace(/[^A-ZÁÉÍÓÚÜÑ ]/g, '')
        .replace(/ {2,}/g, ' ')
    case 'documento':
      return crudo
        .toUpperCase()
        .replace(/[^A-Z0-9-]/g, '')
        .slice(0, 20)
    case 'identificacion':
      return crudo.replace(/[^0-9-]/g, '').slice(0, 20)
    case 'libre':
      return crudo
        .toUpperCase()
        .replace(/[^A-ZÁÉÍÓÚÜÑ0-9 :.\-,()/]/g, '')
        .replace(/ {2,}/g, ' ')
    default:
      return crudo
  }
}

/* El cantón "sin cantones" y los caseríos N/A se guardan en blanco */
function valorCanton(canton: string): string {
  return canton === SIN_CANTON ? '' : canton
}

function valorCaserio(caserio: string, otro: string): string {
  if (caserio === NA) return ''
  if (caserio === OTRO_CASERIO) return otro
  return caserio
}

/* Quita el prefijo "+503 " de un número prefijado (WhatsApp) */
function sinPrefijo(valor: string, codigo: string): string {
  if (!valor) return ''
  if (codigo && valor.startsWith(`${codigo} `)) return valor.slice(codigo.length + 1).trim()
  const m = valor.match(/^\+[\d-]+\s+(.*)$/)
  return m && m[1] ? m[1] : valor
}

function textoDe(valores: TipoValores, clave: string): string {
  const valor = valores[clave]
  return Array.isArray(valor) ? valor.join(', ') : String(valor ?? '')
}
export { textoDe }

function listaDe(valores: TipoValores, clave: string): string[] {
  const valor = valores[clave]
  return Array.isArray(valor) ? valor : []
}

function cumple(regla: ReglaVisible | undefined, valores: TipoValores): boolean {
  if (!regla) return true
  const valor = valores[regla.clave]
  if (regla.incluir) return Array.isArray(valor) && valor.includes(regla.valor)
  return String(valor ?? '') === regla.valor
}

/* ¿El campo se muestra (y se guarda) con los valores actuales? */
export function esVisible(campo: Campo, valores: TipoValores): boolean {
  return cumple(campo.visibleSi, valores)
}

/* Hoja del libro que corresponde al nivel */
export function hojaDeNivel(nivel: NivelEstudiante): HojaEstudiante {
  return nivel === 'educacion-basica' ? HOJA_BASICA : HOJA_PRIMERA_INFANCIA
}

/* ═════════════════ Cargar: fila del Sheet → estado del formulario ═════════════════
   fila es {título de columna: valor} (lo que devuelve leerEstudiante). Las
   reglas inversas de cada tipo reproducen lo que la matrícula guardó. */
export function cargarValores(parte: Parte, fila: Record<string, string>): TipoValores {
  const valores: TipoValores = {}
  const crudo = (columna: string): string => fila[columna] ?? ''
  for (const campo of parte.campos) {
    switch (campo.tipo) {
      case 'marcadores': {
        const marcas = crudo(campo.columna)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        valores[campo.clave] = marcas
        if (campo.otro) valores[campo.otro.clave] = crudo(campo.otro.columna)
        break
      }
      case 'fecha': {
        valores[campo.clave] = aIsoFecha(crudo(campo.columna))
        break
      }
      case 'derivado-grado':
      case 'fijo':
        /* nada que cargar: se recalcula al guardar (o se muestra fijo) */
        break
      case 'eleccion': {
        let valor = crudo(campo.columna)
        const companero = campo.otro ? crudo(campo.otro.columna) : ''
        if (campo.otro && !valor && companero) valor = campo.otro.valor
        if (campo.naEnBlanco && !valor) valor = NA
        valores[campo.clave] = valor
        if (campo.otro) valores[campo.otro.clave] = companero
        break
      }
      case 'casilla': {
        const marcado = campo.marcar ?? 'X'
        valores[campo.clave] = crudo(campo.columna) === marcado ? marcado : ''
        break
      }
      case 'canton': {
        /* Persona: distrito sin cantones → "sin cantones"; fuera de
           Chalatenango el cantón es texto (se carga tal cual). El distrito
           se procesó ANTES (orden de los campos de la parte). */
        const cantones = cantonesDe(textoDe(valores, 'distrito'))
        if (cantones !== null && cantones.length === 0) valores[campo.clave] = SIN_CANTON
        else valores[campo.clave] = crudo(campo.columna)
        break
      }
      case 'caserio': {
        /* Persona: el texto de "Otro" vive TAMBIÉN en la columna del
           caserío; si la columna especifique trae texto, era "Otro".
           En Los Prados el caserío vacío era "N/A". */
        const otro = campo.otro ? crudo(campo.otro.columna) : ''
        if (campo.otro && otro) valores[campo.clave] = campo.otro.valor
        else if (!crudo(campo.columna) && textoDe(valores, 'canton') === CANTON_LOS_PRADOS)
          valores[campo.clave] = NA
        else valores[campo.clave] = crudo(campo.columna)
        if (campo.otro) valores[campo.otro.clave] = otro
        break
      }
      case 'prefijado': {
        const codigo = campo.codigoDe ? textoDe(valores, campo.codigoDe) : ''
        valores[campo.clave] = sinPrefijo(crudo(campo.columna), codigo)
        break
      }
      default:
        /* texto, area, telefono, codigo-tel: el valor se usa tal cual */
        valores[campo.clave] = crudo(campo.columna)
        break
    }
  }
  return valores
}

/* ═════════════════ Guardar: estado del formulario → columnas ═════════════════
   Produce SOLO las columnas de la parte, con las reglas de la matrícula:
   N/A y "Otro" en blanco (el texto en su columna especifique), listas
   unidas con ", ", fechas dd/mm/yyyy, invisible → blanco. */
export function columnasCampos(parte: Parte, valores: TipoValores): Record<string, string> {
  const salida: Record<string, string> = {}
  const apagar = parte.apagarConNo ? textoDe(valores, parte.apagarConNo) === 'No' : false
  for (const campo of parte.campos) {
    if (campo.tipo === 'derivado-grado') {
      salida[campo.columna] = String(idDeGrado(textoDe(valores, campo.derivadoDe ?? '')) ?? '')
      continue
    }
    if (campo.tipo === 'fijo') {
      salida[campo.columna] = ''
      continue
    }
    /* El campo acompañante NO escribe su columna: la escribe su padre */
    if (campo.soloCompanero) continue
    const visible = esVisible(campo, valores)
    if (apagar && campo.clave !== parte.apagarConNo) {
      salida[campo.columna] = ''
      if (campo.otro) salida[campo.otro.columna] = ''
      continue
    }
    if (!visible) {
      salida[campo.columna] = ''
      if (campo.otro) salida[campo.otro.columna] = ''
      continue
    }
    if (campo.guardar) {
      salida[campo.columna] = campo.guardar(valores)
      continue
    }
    switch (campo.tipo) {
      case 'texto':
      case 'area':
      case 'telefono':
      case 'codigo-tel':
        salida[campo.columna] = textoDe(valores, campo.clave).trim()
        break
      case 'fecha':
        salida[campo.columna] = fechaCorta(textoDe(valores, campo.clave))
        break
      case 'eleccion': {
        const valor = textoDe(valores, campo.clave)
        let guardado = valor
        if (campo.naEnBlanco && valor === NA) guardado = ''
        if (campo.otro && valor === campo.otro.valor) guardado = ''
        salida[campo.columna] = guardado
        if (campo.otro) {
          salida[campo.otro.columna] =
            valor === campo.otro.valor ? textoDe(valores, campo.otro.clave).trim() : ''
        }
        break
      }
      case 'marcadores': {
        const marcas = listaDe(valores, campo.clave)
        salida[campo.columna] = marcas.join(', ')
        if (campo.otro) {
          salida[campo.otro.columna] = marcas.includes(campo.otro.valor)
            ? textoDe(valores, campo.otro.clave).trim()
            : ''
        }
        break
      }
      case 'casilla':
        salida[campo.columna] = textoDe(valores, campo.clave) === campo.marcar ? (campo.marcar ?? '') : ''
        break
      case 'prefijado': {
        const codigo = campo.codigoDe ? textoDe(valores, campo.codigoDe) : ''
        salida[campo.columna] = `${codigo} ${textoDe(valores, campo.clave).trim()}`.trim()
        break
      }
      case 'canton':
      case 'caserio':
        /* los cantones y caseríos de persona SIEMPRE llevan guardar() */
        salida[campo.columna] = textoDe(valores, campo.clave)
        break
    }
  }
  return salida
}

/* Solo las columnas cuyo valor cambió respecto a la fila original */
export function cambiosDesde(
  parte: Parte,
  valores: TipoValores,
  filaOriginal: Record<string, string>,
): Record<string, string> {
  const nuevas = columnasCampos(parte, valores)
  const cambios: Record<string, string> = {}
  for (const [columna, valor] of Object.entries(nuevas)) {
    if ((filaOriginal[columna] ?? '') !== valor) cambios[columna] = valor
  }
  return cambios
}

/* ═════════════════ Validar: los mismos requeridos de la matrícula ═════════════════
   Devuelve {clave del campo: mensaje}. Las claves van SIN prefijo: la vista
   agrega el de la parte. */
export function validarValores(parte: Parte, valores: TipoValores): Record<string, string> {
  const fallos: Record<string, string> = {}
  for (const campo of parte.campos) {
    if (campo.tipo === 'derivado-grado' || campo.tipo === 'fijo') continue
    const visible = esVisible(campo, valores)
    const requeridoCondicional = campo.requeridoSi ? cumple(campo.requeridoSi, valores) : false
    const opcional = campo.opcionalSi ? cumple(campo.opcionalSi, valores) : false
    const valor = textoDe(valores, campo.clave)
    const vacio = Array.isArray(valores[campo.clave])
      ? listaDe(valores, campo.clave).length === 0
      : valor.trim() === ''
    if (!visible) continue
    if ((campo.requerido || requeridoCondicional) && vacio && !opcional) {
      fallos[campo.clave] = campo.mensaje ?? `Falta completar: ${campo.etiqueta}.`
      continue
    }
    if (vacio) continue
    if (campo.minDigitos && valor.replace(/\D/g, '').length < campo.minDigitos) {
      fallos[campo.clave] = campo.mensajeMinimo ?? `El campo necesita al menos ${campo.minDigitos} dígitos: ${campo.etiqueta}.`
      continue
    }
    if (campo.minCaracteres && valor.length < campo.minCaracteres) {
      fallos[campo.clave] = campo.mensajeMinimo ?? `El campo necesita al menos ${campo.minCaracteres} caracteres: ${campo.etiqueta}.`
      continue
    }
    if (campo.noFutura && valor > HOY_ISO) {
      fallos[campo.clave] = 'La fecha no puede ser futura.'
      continue
    }
    if (campo.tipo === 'telefono' && campo.codigoDe) {
      const pais = paisDeCodigo(textoDe(valores, campo.codigoDe))
      const definidos = pais?.digitos ?? 0
      const digitos = valor.replace(/\D/g, '')
      if (definidos && digitos.length !== definidos) {
        fallos[campo.clave] = `El número necesita ${definidos} dígitos para ese país.`
      } else if (!definidos && digitos.length < 6) {
        fallos[campo.clave] = 'El número necesita al menos 6 dígitos.'
      }
    }
  }
  return { ...fallos, ...parte.validarExtra?.(valores) }
}

/* ═════════════════ Opciones dinámicas de un campo ═════════════════
   Devuelve la lista de opciones para pintar el campo; cuando el valor
   actual no está en la lista (p. ej. la hoja se editó a mano), se agrega
   al final para que el select lo muestre. */
export function opcionesDeCampo(
  campo: Campo,
  valores: TipoValores,
  fila: Record<string, string>,
): string[] {
  let lista: string[] = campo.opciones ?? []
  if (campo.tipo === 'canton') {
    const cantones = cantonesDe(textoDe(valores, 'distrito'))
    if (cantones === null) return []
    lista = cantones.length === 0 ? [SIN_CANTON] : [...cantones]
  } else if (campo.dinamicas === 'distritos-departamento') {
    lista = distritosDe(textoDe(valores, 'departamento'))
  } else if (campo.dinamicas === 'distritos-nacimiento') {
    lista = distritosDe(textoDe(valores, 'departamentoNacimiento'))
  } else if (campo.dinamicas === 'cantones-distrito') {
    const cantones = cantonesDe(textoDe(valores, 'distrito'))
    if (cantones === null) return []
    lista = cantones.length === 0 ? [SIN_CANTON] : [...cantones]
  } else if (campo.opcionesSegunTiene) {
    lista = campo.opcionesSegunTiene
      .filter((opcion) => (fila[opcion.columna] ?? '') === 'Sí')
      .map((opcion) => opcion.etiqueta)
  }
  /* Si el valor guardado no está en la lista (hoja editada a mano), se
     agrega al final para que el select lo muestre. Los marcadores guardan
     LISTAS (no tienen valor suelto que agregar). */
  const valor = textoDe(valores, campo.clave)
  if (campo.tipo !== 'marcadores' && !Array.isArray(valores[campo.clave]) && valor && !lista.includes(valor)) {
    lista = [...lista, valor]
  }
  return lista
}

/* ═════════════════ Firebase: los datos importantes desde la fila ═════════════════
   Reconstruye los 8 datos que Firebase guarda, MEZCLANDO la fila completa
   (los campos de partes no editadas quedan como estaban). */
export function datosFirebaseDeFila(
  nivel: NivelEstudiante,
  fila: Record<string, string>,
): DatosFirebaseEstudiante {
  const grado = fila['Grado que cursa'] ?? ''
  const base = {
    nombres: fila['Nombres'] ?? '',
    apellidos: fila['Apellidos'] ?? '',
    nie: (fila['NIE'] ?? '').trim(),
    nuevoIngreso: (fila['¿Es nuevo ingreso al sistema de El Salvador?'] ?? '') === 'Sí',
    fechaNacimiento: aIsoFecha(fila['Fecha de nacimiento (estudiante)'] ?? ''),
    grado,
    gradoId: idDeGrado(grado) ?? 0,
  }
  if (nivel === 'educacion-basica') {
    return {
      ...base,
      responsable: (fila['Nombre completo (responsable)'] ?? '').trim(),
      documento: (fila['Identificación (responsable)'] ?? '').trim(),
      telefono: `${fila['Código de teléfono (responsable)'] ?? ''} ${fila['Teléfono (responsable)'] ?? ''}`.trim(),
    }
  }
  /* Primera infancia: el responsable es la persona elegida (Madre, Padre u
     Otra persona); sus datos viven en las columnas de esa persona. */
  const etiqueta = fila['Responsable elegido'] ?? ''
  const sufijo =
    etiqueta === 'Madre' ? 'madre' : etiqueta === 'Padre' ? 'padre' : etiqueta === 'Otra persona' ? 'otra persona' : ''
  return {
    ...base,
    responsable: sufijo ? (fila[`Nombre (${sufijo})`] ?? '').trim() : '',
    documento: sufijo ? (fila[`Documento (${sufijo})`] ?? '').trim() : '',
    telefono: sufijo
      ? `${fila[`Código de teléfono (${sufijo})`] ?? ''} ${fila[`Teléfono (${sufijo})`] ?? ''}`.trim()
      : '',
  }
}

/* Formatea un número de teléfono mientras se escribe, según el código */
export function formatoTelefono(codigo: string, valor: string): string {
  const pais = paisDeCodigo(codigo)
  const nombre = pais?.nombre ?? ''
  if (!nombre) return valor.replace(/\D/g, '').slice(0, 15)
  return formatarTelefono(nombre, valor)
}

/* ═════════════════ Definición de las PARTES ═════════════════
   Los títulos de columna son EXACTOS a los ENCABEZADOS_* del Sheet y las
   reglas de guardar son las mismas funciones que usa la matrícula. */

function parteEstudiantePI(): Parte {
  return {
    id: 'estudiante',
    etiqueta: 'Parte 2.1',
    titulo: 'Datos del estudiante',
    nivel: 'primera-infancia',
    campos: [
      {
        clave: 'nuevoIngreso',
        columna: '¿Es nuevo ingreso al sistema de El Salvador?',
        etiqueta: '¿Es nuevo ingreso al sistema de El Salvador?',
        tipo: 'eleccion',
        opciones: SI_NO,
        requerido: true,
        mensaje: 'Indica si es nuevo ingreso al sistema de El Salvador.',
        ancho: 'completo',
        nota: 'Si es nuevo ingreso, el NIE no es obligatorio y el correo de Firebase queda en blanco.',
      },
      {
        clave: 'nie',
        columna: 'NIE',
        etiqueta: 'NIE',
        tipo: 'texto',
        filtro: 'digitos',
        requerido: true,
        opcionalSi: { clave: 'nuevoIngreso', valor: 'Sí' },
        mensaje: 'Ingresa el NIE del estudiante.',
        mensajeMinimo: 'El NIE necesita al menos 6 dígitos.',
        minDigitos: 6,
      },
      {
        clave: 'nombres',
        columna: 'Nombres',
        etiqueta: 'Nombres',
        tipo: 'texto',
        filtro: 'nombre',
        requerido: true,
        mensaje: 'Ingresa los nombres.',
      },
      {
        clave: 'apellidos',
        columna: 'Apellidos',
        etiqueta: 'Apellidos',
        tipo: 'texto',
        filtro: 'nombre',
        requerido: true,
        mensaje: 'Ingresa los apellidos.',
      },
      {
        clave: 'fechaNacimiento',
        columna: 'Fecha de nacimiento (estudiante)',
        etiqueta: 'Fecha de nacimiento',
        tipo: 'fecha',
        requerido: true,
        mensaje: 'Selecciona la fecha de nacimiento.',
        noFutura: true,
      },
      {
        clave: 'edad',
        columna: 'Edad (estudiante)',
        etiqueta: 'Edad',
        tipo: 'texto',
        filtro: 'max2',
        requerido: true,
        mensaje: 'Ingresa la edad.',
      },
      {
        clave: 'sexo',
        columna: 'Sexo',
        etiqueta: 'Sexo',
        tipo: 'eleccion',
        opciones: SEXO,
        requerido: true,
        mensaje: 'Selecciona el sexo (M o F).',
      },
      {
        clave: 'nacionalidad',
        columna: 'Nacionalidad',
        etiqueta: 'Nacionalidad',
        tipo: 'texto',
        filtro: 'texto',
        requerido: true,
        mensaje: 'Ingresa la nacionalidad.',
      },
      {
        clave: 'distrito',
        columna: 'Distrito (estudiante)',
        etiqueta: 'Distrito',
        tipo: 'eleccion',
        opciones: DISTRITOS_CENTRO,
        requerido: true,
        mensaje: 'Selecciona el distrito.',
      },
      {
        clave: 'canton',
        columna: 'Cantón (estudiante)',
        etiqueta: 'Cantón',
        tipo: 'eleccion',
        opciones: CANTONES_CENTRO,
        requerido: true,
        mensaje: 'Selecciona el cantón.',
      },
      {
        clave: 'caserio',
        columna: 'Caserío (estudiante)',
        etiqueta: 'Caserío',
        tipo: 'eleccion',
        opciones: OPCIONES_CASERIO_CENTRO,
        naEnBlanco: true,
        otro: {
          valor: OTRO_CASERIO,
          clave: 'caserioOtro',
          columna: 'Caserío especifique (estudiante)',
          etiqueta: 'Especifique el caserío',
        },
      },
      {
        clave: 'caserioOtro',
        columna: 'Caserío especifique (estudiante)',
        etiqueta: 'Especifique el caserío',
        tipo: 'texto',
        filtro: 'texto',
        soloCompanero: true,
        visibleSi: { clave: 'caserio', valor: OTRO_CASERIO },
        requeridoSi: { clave: 'caserio', valor: OTRO_CASERIO },
        mensaje: 'Especifica el caserío.',
      },
      {
        clave: 'grado',
        columna: 'Grado que cursa',
        etiqueta: 'Grado que cursará',
        tipo: 'eleccion',
        opciones: OPCIONES_GRADO,
        requerido: true,
        mensaje: 'Selecciona el grado que cursará.',
      },
      {
        clave: 'gradoId',
        columna: 'Grado (id)',
        etiqueta: '',
        tipo: 'derivado-grado',
        derivadoDe: 'grado',
      },
      {
        clave: 'gradoInicial',
        columna: 'Último grado cursado (Inicial)',
        etiqueta: 'Último grado cursado (Inicial)',
        tipo: 'texto',
        filtro: 'max2',
        nota: 'Escríbelo SOLO en Inicial o en Parvularia: son excluyentes.',
      },
      {
        clave: 'gradoParvularia',
        columna: 'Último grado cursado (Parvularia)',
        etiqueta: 'Último grado cursado (Parvularia)',
        tipo: 'texto',
        filtro: 'max2',
      },
      {
        clave: 'anioGrado',
        columna: 'Año que lo cursó',
        etiqueta: 'Año que lo cursó',
        tipo: 'texto',
        filtro: 'digitos',
        requerido: true,
        mensaje: 'Ingresa el año en que lo cursó (4 dígitos).',
        mensajeMinimo: 'El año debe tener 4 dígitos.',
        minDigitos: 4,
      },
      {
        clave: 'partidaPosee',
        columna: 'Posee partida de nacimiento',
        etiqueta: 'Posee partida de nacimiento',
        tipo: 'eleccion',
        opciones: SI_NO,
        requerido: true,
        mensaje: 'Indica si posee partida de nacimiento.',
      },
      {
        clave: 'partidaPresenta',
        columna: 'Presenta partida de nacimiento',
        etiqueta: 'Presenta partida de nacimiento',
        tipo: 'eleccion',
        opciones: SI_NO,
        requerido: true,
        mensaje: 'Indica si presenta partida de nacimiento.',
      },
      {
        clave: 'etnia',
        columna: 'Etnia',
        etiqueta: 'Etnia',
        tipo: 'eleccion',
        opciones: OPCIONES_ETNIA,
        naEnBlanco: true,
        requerido: true,
        mensaje: 'Selecciona la etnia.',
      },
    ],
    validarExtra: (valores) => {
      const fallos: Record<string, string> = {}
      if (!textoDe(valores, 'gradoInicial') && !textoDe(valores, 'gradoParvularia')) {
        fallos['gradoInicial'] = 'Escribe el último grado cursado en Inicial o en Parvularia.'
      }
      const anio = textoDe(valores, 'anioGrado')
      if (!/^\d{4}$/.test(anio)) {
        fallos['anioGrado'] = anio
          ? 'El año debe tener 4 dígitos.'
          : 'Ingresa el año en que lo cursó (4 dígitos).'
      } else if (Number(anio) > ANIO_ACTUAL) {
        fallos['anioGrado'] = 'El año no puede ser posterior al actual.'
      }
      return fallos
    },
  }
}

/* Partes 2.2, 2.3 y 2.4: los tres usan EXACTAMENTE los mismos campos
   (con distinto sufijo de columna) y la misma pregunta inicial. */
function partePersona(
  id: 'madre' | 'padre' | 'otra',
  etiqueta: string,
  titulo: string,
  pregunta: string,
  sufijo: string,
  extra: Campo[],
): Parte {
  const esSV = (valores: TipoValores) => textoDe(valores, 'pais') === 'El Salvador'
  const s = sufijo
  const enSV = { clave: 'pais', valor: 'El Salvador' } as const
  return {
    id,
    etiqueta,
    titulo,
    nivel: 'primera-infancia',
    apagarConNo: 'tiene',
    campos: [
      {
        clave: 'tiene',
        columna: pregunta,
        etiqueta: pregunta,
        tipo: 'eleccion',
        opciones: SI_NO,
        requerido: true,
        mensaje: 'Marca Sí o No.',
        ancho: 'completo',
        nota: 'Si la respuesta es No, los demás campos se desactivan y se guardan en blanco.',
      },
      {
        clave: 'nombre',
        columna: `Nombre (${s})`,
        etiqueta: 'Nombre',
        tipo: 'texto',
        filtro: 'nombre',
        requerido: true,
        mensaje: 'Ingresa el nombre.',
      },
      {
        clave: 'fechaNacimiento',
        columna: `Fecha de nacimiento (${s})`,
        etiqueta: 'Fecha de nacimiento',
        tipo: 'fecha',
        requerido: true,
        mensaje: 'Selecciona la fecha de nacimiento.',
        noFutura: true,
      },
      {
        clave: 'edad',
        columna: `Edad (${s})`,
        etiqueta: 'Edad',
        tipo: 'texto',
        filtro: 'max2',
        requerido: true,
        mensaje: 'Ingresa la edad.',
      },
      {
        clave: 'documento',
        columna: `Documento (${s})`,
        etiqueta: 'Documento',
        tipo: 'texto',
        filtro: 'documento',
        requerido: true,
        mensaje: 'Ingresa el documento (DUI, pasaporte u otro).',
        mensajeMinimo: 'El documento necesita al menos 6 caracteres.',
        minCaracteres: 6,
      },
      {
        clave: 'pais',
        columna: `País (${s})`,
        etiqueta: 'País',
        tipo: 'eleccion',
        opciones: NOMBRES_PAISES,
        requerido: true,
        mensaje: 'Selecciona el país.',
      },
      {
        clave: 'departamento',
        columna: `Departamento (${s})`,
        etiqueta: 'Departamento',
        tipo: 'eleccion',
        opciones: DEPARTAMENTOS_SV,
        requerido: true,
        mensaje: 'Selecciona el departamento.',
        visibleSi: enSV,
        guardar: (v) => (esSV(v) ? textoDe(v, 'departamento') : ''),
      },
      {
        clave: 'distrito',
        columna: `Distrito (${s})`,
        etiqueta: 'Distrito',
        tipo: 'eleccion',
        dinamicas: 'distritos-departamento',
        requerido: true,
        mensaje: 'Selecciona el distrito.',
        visibleSi: enSV,
        guardar: (v) => (esSV(v) ? textoDe(v, 'distrito') : ''),
      },
      {
        clave: 'canton',
        columna: `Cantón (${s})`,
        etiqueta: 'Cantón',
        tipo: 'canton',
        requerido: true,
        mensaje: 'Selecciona el cantón.',
        visibleSi: enSV,
        guardar: (v) => (esSV(v) ? valorCanton(textoDe(v, 'canton')) : ''),
      },
      {
        clave: 'caserio',
        columna: `Caserío (${s})`,
        etiqueta: 'Caserío',
        tipo: 'caserio',
        requerido: true,
        mensaje: 'Escribe el caserío o marca N/A.',
        visibleSi: enSV,
        otro: {
          valor: OTRO_CASERIO,
          clave: 'caserioOtro',
          columna: `Caserío especifique (${s})`,
          etiqueta: 'Especifique el caserío',
        },
        guardar: (v) => (esSV(v) ? valorCaserio(textoDe(v, 'caserio'), textoDe(v, 'caserioOtro')) : ''),
      },
      {
        clave: 'caserioOtro',
        columna: `Caserío especifique (${s})`,
        etiqueta: 'Especifique el caserío',
        tipo: 'texto',
        filtro: 'texto',
        visibleSi: { clave: 'caserio', valor: OTRO_CASERIO },
        requeridoSi: { clave: 'caserio', valor: OTRO_CASERIO },
        mensaje: 'Especifica el caserío.',
        guardar: (v) =>
          esSV(v) && textoDe(v, 'caserio') === OTRO_CASERIO ? textoDe(v, 'caserioOtro').trim() : '',
      },
      {
        clave: 'paisTelefono',
        columna: `Código de teléfono (${s})`,
        etiqueta: 'Código del país',
        tipo: 'codigo-tel',
        requerido: true,
        mensaje: 'Selecciona el código del país.',
      },
      {
        clave: 'telefono',
        columna: `Teléfono (${s})`,
        etiqueta: 'Teléfono',
        tipo: 'telefono',
        codigoDe: 'paisTelefono',
        requerido: true,
        mensaje: 'Ingresa el número de teléfono.',
      },
      {
        clave: 'whatsapp',
        columna: `¿Tiene WhatsApp? (${s})`,
        etiqueta: '¿Tiene WhatsApp?',
        tipo: 'eleccion',
        opciones: SI_NO,
        requerido: true,
        mensaje: 'Indica si el teléfono tiene WhatsApp.',
      },
      {
        clave: 'whatsappCelular',
        columna: `Celular de WhatsApp (${s})`,
        etiqueta: 'Celular de WhatsApp',
        tipo: 'prefijado',
        codigoDe: 'paisTelefono',
        visibleSi: { clave: 'whatsapp', valor: 'No' },
        requeridoSi: { clave: 'whatsapp', valor: 'No' },
        mensaje: 'Ingresa el celular de WhatsApp.',
      },
      {
        clave: 'correo',
        columna: `Correo electrónico (${s})`,
        etiqueta: 'Correo electrónico',
        tipo: 'texto',
        nota: 'Si queda en blanco, en la matrícula se usó el correo del estudiante.',
      },
      {
        clave: 'estudia',
        columna: `¿Actualmente estudia? (${s})`,
        etiqueta: '¿Actualmente estudia?',
        tipo: 'eleccion',
        opciones: SI_NO,
        requerido: true,
        mensaje: 'Indica si actualmente estudia.',
      },
      {
        clave: 'centroEducativo',
        columna: `Centro educativo (${s})`,
        etiqueta: 'Centro educativo',
        tipo: 'texto',
        filtro: 'texto',
        visibleSi: { clave: 'estudia', valor: 'Sí' },
        requeridoSi: { clave: 'estudia', valor: 'Sí' },
        mensaje: 'Ingresa el centro educativo.',
      },
      {
        clave: 'gradoParvularia',
        columna: `Último grado cursado Parvularia (${s})`,
        etiqueta: 'Último grado cursado Parvularia',
        tipo: 'texto',
        filtro: 'max2',
      },
      {
        clave: 'gradoBasica',
        columna: `Último grado cursado Básica (${s})`,
        etiqueta: 'Último grado cursado Básica',
        tipo: 'texto',
        filtro: 'max2',
      },
      {
        clave: 'gradoMedia',
        columna: `Último grado cursado Media (${s})`,
        etiqueta: 'Último grado cursado Media',
        tipo: 'texto',
        filtro: 'max2',
      },
      {
        clave: 'gradoSuperior',
        columna: `Último grado cursado Superior (${s})`,
        etiqueta: 'Último grado cursado Superior',
        tipo: 'texto',
        filtro: 'max2',
      },
      {
        clave: 'gradoNinguno',
        columna: `Último grado Ninguno (${s})`,
        etiqueta: 'Ninguno',
        tipo: 'casilla',
        marcar: 'X',
      },
      {
        clave: 'ocupacion',
        columna: `Ocupación (${s})`,
        etiqueta: 'Ocupación',
        tipo: 'eleccion',
        opciones: OPCIONES_OCUPACION,
        requerido: true,
        mensaje: 'Selecciona la ocupación.',
        otro: {
          valor: OTRO_OCUPACION,
          clave: 'ocupacionOtro',
          columna: `Ocupación especifique (${s})`,
          etiqueta: 'Especifique la ocupación',
        },
      },
      {
        clave: 'ocupacionOtro',
        columna: `Ocupación especifique (${s})`,
        etiqueta: 'Especifique la ocupación',
        tipo: 'texto',
        filtro: 'texto',
        soloCompanero: true,
        visibleSi: { clave: 'ocupacion', valor: OTRO_OCUPACION },
        requeridoSi: { clave: 'ocupacion', valor: OTRO_OCUPACION },
        mensaje: 'Especifica la ocupación.',
      },
      {
        clave: 'lugarTrabajo',
        columna: `Lugar de trabajo (${s})`,
        etiqueta: 'Lugar de trabajo',
        tipo: 'texto',
        filtro: 'texto',
        requerido: true,
        mensaje: 'Ingresa el lugar de trabajo.',
      },
      ...extra,
    ],
    validarExtra: (valores) => {
      const fallos: Record<string, string> = {}
      const ninguno = textoDe(valores, 'gradoNinguno') === 'X'
      const algunGrado = ['gradoParvularia', 'gradoBasica', 'gradoMedia', 'gradoSuperior'].some(
        (clave) => textoDe(valores, clave).trim() !== '',
      )
      if (!ninguno && !algunGrado) {
        fallos['gradoParvularia'] = 'Marca Ninguno o escribe el número de un grado.'
      }
      return fallos
    },
  }
}

function parteDiscapacidadPI(): Parte {
  return {
    id: 'discapacidad',
    etiqueta: 'Parte 3',
    titulo: 'Condición de discapacidad de la niña o niño',
    nivel: 'primera-infancia',
    campos: [
      {
        clave: 'marcas',
        columna: 'Condición de discapacidad',
        etiqueta: 'Condición de discapacidad',
        tipo: 'marcadores',
        opciones: DISCAPACIDAD_OPCIONES,
        requerido: true,
        mensaje: 'Marca al menos una opción.',
        ancho: 'completo',
        otro: {
          valor: OTROS_DISC,
          clave: 'otrosTexto',
          columna: 'Otros discapacidad (especifique)',
          etiqueta: 'Otros (especifique)',
        },
      },
      {
        clave: 'otrosTexto',
        columna: 'Otros discapacidad (especifique)',
        etiqueta: 'Otros (especifique)',
        tipo: 'texto',
        filtro: 'texto',
        soloCompanero: true,
        visibleSi: { clave: 'marcas', valor: OTROS_DISC, incluir: true },
        requeridoSi: { clave: 'marcas', valor: OTROS_DISC, incluir: true },
        mensaje: 'Especifica la discapacidad.',
      },
      {
        clave: 'diagnostico',
        columna: '3.1 ¿Posee diagnóstico clínico?',
        etiqueta: '3.1 ¿Posee diagnóstico clínico?',
        tipo: 'eleccion',
        opciones: DIAGNOSTICO_OPCIONES,
        requerido: true,
        mensaje: 'Selecciona una opción.',
      },
      {
        clave: 'referido',
        columna: '3.2 Ha sido referido a',
        etiqueta: '3.2 Ha sido referido a',
        tipo: 'eleccion',
        opciones: REFERIDO_OPCIONES,
        requerido: true,
        mensaje: 'Selecciona una opción.',
      },
      {
        clave: 'servicios',
        columna: '3.3 Servicios que recibe',
        etiqueta: '3.3 Servicios que recibe',
        tipo: 'marcadores',
        opciones: SERVICIOS_OPCIONES,
        requerido: true,
        mensaje: 'Marca al menos una opción.',
        ancho: 'completo',
        otro: {
          valor: OTRO_SERV,
          clave: 'serviciosOtro',
          columna: '3.3 Otro (especifique)',
          etiqueta: 'Otro (especifique)',
        },
      },
      {
        clave: 'serviciosOtro',
        columna: '3.3 Otro (especifique)',
        etiqueta: 'Otro (especifique)',
        tipo: 'texto',
        filtro: 'texto',
        soloCompanero: true,
        visibleSi: { clave: 'servicios', valor: OTRO_SERV, incluir: true },
        requeridoSi: { clave: 'servicios', valor: OTRO_SERV, incluir: true },
        mensaje: 'Especifica el servicio.',
      },
    ],
  }
}

function parteConvivencia(): Parte {
  return {
    id: 'convivencia',
    etiqueta: 'Parte 4',
    titulo: 'Convivencia familiar',
    nivel: 'primera-infancia',
    campos: [
      {
        clave: 'convivencia',
        columna: '4. Convivencia familiar',
        etiqueta: 'Convivencia familiar',
        tipo: 'eleccion',
        opciones: CONVIVENCIA_OPCIONES,
        requerido: true,
        mensaje: 'Marca con una X la situación del estudiante.',
        ancho: 'completo',
      },
    ],
  }
}

function parteIngresos(): Parte {
  return {
    id: 'ingresos',
    etiqueta: 'Parte 5',
    titulo: 'Ingreso familiar',
    nivel: 'primera-infancia',
    campos: [
      {
        clave: 'marcas',
        columna: '5. Ingreso familiar',
        etiqueta: 'Ingreso familiar (puede marcar varios)',
        tipo: 'marcadores',
        opciones: INGRESOS_OPCIONES,
        requerido: true,
        mensaje: 'Marca al menos una fuente de ingreso.',
        ancho: 'completo',
        otro: {
          valor: OTRO_INGRESO,
          clave: 'otroTexto',
          columna: '5. Otro (especifique)',
          etiqueta: 'Otro (especifique)',
        },
      },
      {
        clave: 'otroTexto',
        columna: '5. Otro (especifique)',
        etiqueta: 'Otro (especifique)',
        tipo: 'texto',
        filtro: 'texto',
        soloCompanero: true,
        visibleSi: { clave: 'marcas', valor: OTRO_INGRESO, incluir: true },
        requeridoSi: { clave: 'marcas', valor: OTRO_INGRESO, incluir: true },
        mensaje: 'Especifica el ingreso.',
      },
    ],
  }
}

function parteVivienda(): Parte {
  const par = (
    clave: string,
    columna: string,
    etiqueta: string,
    opciones: string[],
    naEnBlanco: boolean,
    otroValor: string,
    claveOtro: string,
    columnaOtro: string,
    mensaje: string,
  ): Campo[] => [
    {
      clave,
      columna,
      etiqueta,
      tipo: 'eleccion',
      opciones,
      naEnBlanco,
      requerido: true,
      mensaje,
      otro: {
        valor: otroValor,
        clave: claveOtro,
        columna: columnaOtro,
        etiqueta: columnaOtro,
      },
    },
    {
      clave: claveOtro,
      columna: columnaOtro,
      etiqueta: columnaOtro,
      tipo: 'texto',
      filtro: 'texto',
      soloCompanero: true,
      visibleSi: { clave, valor: otroValor },
      requeridoSi: { clave, valor: otroValor },
      mensaje,
    },
  ]
  const marcadores = (
    clave: string,
    columna: string,
    etiqueta: string,
    opciones: string[],
    otroValor: string,
    claveOtro: string,
    columnaOtro: string,
    mensaje: string,
  ): Campo[] => [
    {
      clave,
      columna,
      etiqueta,
      tipo: 'marcadores',
      opciones,
      requerido: true,
      mensaje,
      ancho: 'completo',
      otro: {
        valor: otroValor,
        clave: claveOtro,
        columna: columnaOtro,
        etiqueta: columnaOtro,
      },
    },
    {
      clave: claveOtro,
      columna: columnaOtro,
      etiqueta: columnaOtro,
      tipo: 'texto',
      filtro: 'texto',
      soloCompanero: true,
      visibleSi: { clave, valor: otroValor, incluir: true },
      requeridoSi: { clave, valor: otroValor, incluir: true },
      mensaje,
    },
  ]
  return {
    id: 'vivienda',
    etiqueta: 'Parte 6',
    titulo: 'Vivienda',
    nivel: 'primera-infancia',
    campos: [
      {
        clave: 'zona',
        columna: '6.1 Zona',
        etiqueta: 'Zona',
        tipo: 'eleccion',
        opciones: ZONA_OPCIONES,
        requerido: true,
        mensaje: 'Selecciona la zona.',
      },
      ...par(
        'tenencia',
        '6.1 Condición de posesión',
        'Condición de posesión',
        TENENCIA_OPCIONES,
        false,
        OTRO_TENENCIA,
        'tenenciaOtro',
        '6.1 Otra (especifique)',
        'Especifica la condición.',
      ),
      ...marcadores(
        'paredes',
        '6.2 Material de las paredes',
        'Material de las paredes',
        PAREDES_OPCIONES,
        OTROS_PAREDES,
        'paredesOtro',
        '6.2 Otros (especifique)',
        'Marca al menos una opción.',
      ),
      ...marcadores(
        'piso',
        '6.3 Material del piso',
        'Material del piso',
        PISO_OPCIONES,
        OTROS_PISO,
        'pisoOtro',
        '6.3 Otros materiales (especifique)',
        'Marca al menos una opción.',
      ),
      ...marcadores(
        'techo',
        '6.4 Material del techo',
        'Material del techo',
        TECHO_OPCIONES,
        OTRO_TECHO,
        'techoOtro',
        '6.4 Otra materia (especifique)',
        'Marca al menos una opción.',
      ),
      ...marcadores(
        'luz',
        '6.5 Servicios de luz y otros',
        'Servicios de luz y otros',
        LUZ_OPCIONES,
        OTRO_LUZ,
        'luzOtro',
        '6.5 Otra clase (especifique)',
        'Marca al menos una opción.',
      ),
      ...marcadores(
        'agua',
        '6.6 Servicio básico de agua',
        'Servicio básico de agua',
        AGUA_OPCIONES,
        OTRO_AGUA,
        'aguaOtro',
        '6.6 Otro (especifique)',
        'Marca al menos una opción.',
      ),
      ...marcadores(
        'sanitario',
        '6.7 Servicio sanitario',
        'Servicio sanitario',
        SANITARIO_OPCIONES,
        OTRO_SANITARIO,
        'sanitarioOtro',
        '6.7 Otro (especifique)',
        'Marca al menos una opción.',
      ),
      ...marcadores(
        'comunicacion',
        '6.8 Medios de comunicación del hogar',
        'Medios de comunicación del hogar',
        COMUNICACION_OPCIONES,
        OTROS_COMUNICACION,
        'comunicacionOtro',
        '6.8 Otros (especifique)',
        'Marca al menos una opción.',
      ),
    ],
  }
}

function parteHabitos(): Parte {
  return {
    id: 'habitos',
    etiqueta: 'Parte 7',
    titulo: 'Hábitos del estudiante',
    nivel: 'primera-infancia',
    campos: [
      {
        clave: 'suenoNoche',
        columna: '7.1 Horario de sueño por la noche',
        etiqueta: 'Horario de sueño por la noche',
        tipo: 'texto',
        filtro: 'libre',
        requerido: true,
        mensaje: 'Escribe el horario de sueño por la noche.',
      },
      {
        clave: 'suenoDia',
        columna: '7.1 Horario de sueño durante el día',
        etiqueta: 'Horario de sueño durante el día',
        tipo: 'texto',
        filtro: 'libre',
      },
      {
        clave: 'dificultadDormir',
        columna: '7.1 Dificultad para dormir',
        etiqueta: 'Dificultad para dormir',
        tipo: 'eleccion',
        opciones: SI_NO,
        requerido: true,
        mensaje: 'Selecciona Sí o No.',
      },
      {
        clave: 'dificultadExplica',
        columna: '7.1 Explique',
        etiqueta: 'Explique',
        tipo: 'texto',
        filtro: 'libre',
        visibleSi: { clave: 'dificultadDormir', valor: 'Sí' },
        requeridoSi: { clave: 'dificultadDormir', valor: 'Sí' },
        mensaje: 'Explica la dificultad.',
      },
      {
        clave: 'conQuienDuerme',
        columna: '7.1 Con quién duerme',
        etiqueta: 'Con quién duerme',
        tipo: 'marcadores',
        opciones: CON_QUIEN_OPCIONES,
        requerido: true,
        mensaje: 'Marca al menos una opción.',
        ancho: 'completo',
        otro: {
          valor: OTROS_CON_QUIEN,
          clave: 'conQuienOtro',
          columna: '7.1 Otros (especifique)',
          etiqueta: 'Otros (especifique)',
        },
      },
      {
        clave: 'conQuienOtro',
        columna: '7.1 Otros (especifique)',
        etiqueta: 'Otros (especifique)',
        tipo: 'texto',
        filtro: 'texto',
        soloCompanero: true,
        visibleSi: { clave: 'conQuienDuerme', valor: OTROS_CON_QUIEN, incluir: true },
        requeridoSi: { clave: 'conQuienDuerme', valor: OTROS_CON_QUIEN, incluir: true },
        mensaje: 'Especifica con quién duerme.',
      },
      {
        clave: 'lactancia',
        columna: '7.2 Lactancia materna exclusiva',
        etiqueta: 'Lactancia materna exclusiva',
        tipo: 'eleccion',
        opciones: SI_NO,
        requerido: true,
        mensaje: 'Selecciona Sí o No.',
      },
      {
        clave: 'lactanciaMeses',
        columna: '7.2 ¿Cuánto tiempo (meses)?',
        etiqueta: '¿Cuánto tiempo (meses)?',
        tipo: 'texto',
        filtro: 'digitos',
        visibleSi: { clave: 'lactancia', valor: 'Sí' },
        requeridoSi: { clave: 'lactancia', valor: 'Sí' },
        mensaje: 'Ingresa cuántos meses.',
      },
      {
        clave: 'cambiosAlimentacion',
        columna: '7.2 Cambios que afectan su alimentación',
        etiqueta: 'Cambios que afectan su alimentación',
        tipo: 'eleccion',
        opciones: SI_NO,
        requerido: true,
        mensaje: 'Selecciona Sí o No.',
      },
      {
        clave: 'cambiosCual',
        columna: '7.2 ¿Cuál?',
        etiqueta: '¿Cuál?',
        tipo: 'texto',
        filtro: 'libre',
        visibleSi: { clave: 'cambiosAlimentacion', valor: 'Sí' },
        requeridoSi: { clave: 'cambiosAlimentacion', valor: 'Sí' },
        mensaje: 'Explica qué cambió.',
      },
      {
        clave: 'alimentos',
        columna: '7.3 Alimentos que consume',
        etiqueta: 'Alimentos que consume',
        tipo: 'marcadores',
        opciones: ALIMENTOS_OPCIONES,
        requerido: true,
        mensaje: 'Marca al menos un alimento.',
        ancho: 'completo',
        otro: {
          valor: OTROS_ALIMENTOS,
          clave: 'alimentosOtros',
          columna: '7.3 Otros (especifique)',
          etiqueta: 'Otros (especifique)',
        },
      },
      {
        clave: 'alimentosOtros',
        columna: '7.3 Otros (especifique)',
        etiqueta: 'Otros (especifique)',
        tipo: 'texto',
        filtro: 'texto',
        soloCompanero: true,
        visibleSi: { clave: 'alimentos', valor: OTROS_ALIMENTOS, incluir: true },
        requeridoSi: { clave: 'alimentos', valor: OTROS_ALIMENTOS, incluir: true },
        mensaje: 'Especifica el alimento.',
      },
      {
        clave: 'comidas',
        columna: '7.4 Tiempos de comida',
        etiqueta: 'Tiempos de comida',
        tipo: 'marcadores',
        opciones: TIEMPOS_OPCIONES,
        requerido: true,
        mensaje: 'Marca al menos un tiempo de comida.',
        ancho: 'completo',
      },
      {
        clave: 'refrigerios',
        columna: '7.5 Refrigerios',
        etiqueta: 'Refrigerios',
        tipo: 'eleccion',
        opciones: REFRIGERIOS_OPCIONES,
        requerido: true,
        mensaje: 'Selecciona cuántos refrigerios realiza.',
      },
      {
        clave: 'alergia',
        columna: '7.6 ¿Es alérgico a algún alimento?',
        etiqueta: '¿Es alérgico a algún alimento?',
        tipo: 'eleccion',
        opciones: SI_NO,
        requerido: true,
        mensaje: 'Selecciona Sí o No.',
      },
      {
        clave: 'alergicoCuales',
        columna: '7.6.1 ¿A cuál(es)?',
        etiqueta: '¿A cuál(es)?',
        tipo: 'texto',
        filtro: 'libre',
        visibleSi: { clave: 'alergia', valor: 'Sí' },
        requeridoSi: { clave: 'alergia', valor: 'Sí' },
        mensaje: 'Escribe a cuál(es) alimento(s) es alérgico.',
      },
      {
        clave: 'preferidos',
        columna: '7.8 Alimentos que prefiere',
        etiqueta: 'Alimentos que prefiere',
        tipo: 'texto',
        filtro: 'libre',
      },
    ],
  }
}

function parteParticipacion(): Parte {
  return {
    id: 'participacion',
    etiqueta: 'Parte 8',
    titulo: 'Participación y compromisos',
    nivel: 'primera-infancia',
    campos: [
      {
        clave: 'actividades',
        columna: '8. Actividades donde apoyará',
        etiqueta: 'Actividades donde apoyará',
        tipo: 'marcadores',
        opciones: PARTICIPACION_OPCIONES,
        requerido: true,
        mensaje: 'Marca al menos una actividad.',
        ancho: 'completo',
      },
      {
        clave: 'observaciones',
        columna: '8. Observaciones',
        etiqueta: 'Observaciones',
        tipo: 'area',
        filtro: 'libre',
        ancho: 'completo',
      },
    ],
  }
}

function parteModalidad(): Parte {
  return {
    id: 'modalidad',
    etiqueta: 'Parte 9',
    titulo: 'Modalidad de atención',
    nivel: 'primera-infancia',
    campos: [
      {
        clave: 'institucional',
        columna: '9. Modalidad de atención',
        etiqueta: 'Institucional Primer Grado',
        tipo: 'casilla',
        marcar: MODALIDAD_ATENCION,
        ancho: 'completo',
        nota: 'Si se desmarca, la columna se guarda en blanco.',
      },
      {
        clave: 'fechaInscripcion',
        columna: '9. Fecha de inscripción (dd/mm/aaaa)',
        etiqueta: 'Fecha de inscripción',
        tipo: 'fecha',
        requerido: true,
        mensaje: 'Selecciona la fecha de inscripción.',
        noFutura: true,
      },
      {
        clave: 'docente',
        columna: '9. Nombre del o la docente responsable',
        etiqueta: 'Nombre del o la docente responsable',
        tipo: 'texto',
        filtro: 'libre',
        requerido: true,
        mensaje: 'Ingresa el nombre del o la docente responsable.',
      },
    ],
  }
}

function parteEstudianteBasica(): Parte {
  return {
    id: 'basica-estudiante',
    etiqueta: 'Parte 2',
    titulo: 'Datos del estudiante',
    nivel: 'educacion-basica',
    campos: [
      {
        clave: 'nuevoIngreso',
        columna: '¿Es nuevo ingreso al sistema de El Salvador?',
        etiqueta: '¿Es nuevo ingreso al sistema de El Salvador?',
        tipo: 'eleccion',
        opciones: SI_NO,
        requerido: true,
        mensaje: 'Indica si es nuevo ingreso al sistema de El Salvador.',
        ancho: 'completo',
        nota: 'Si es nuevo ingreso, el NIE no es obligatorio y el correo de Firebase queda en blanco.',
      },
      {
        clave: 'nie',
        columna: 'NIE',
        etiqueta: 'NIE',
        tipo: 'texto',
        filtro: 'digitos',
        requerido: true,
        opcionalSi: { clave: 'nuevoIngreso', valor: 'Sí' },
        mensaje: 'Ingresa el NIE del estudiante.',
        mensajeMinimo: 'El NIE necesita al menos 6 dígitos.',
        minDigitos: 6,
      },
      {
        clave: 'nombres',
        columna: 'Nombres',
        etiqueta: 'Nombres',
        tipo: 'texto',
        filtro: 'nombre',
        requerido: true,
        mensaje: 'Ingresa los nombres.',
      },
      {
        clave: 'apellidos',
        columna: 'Apellidos',
        etiqueta: 'Apellidos',
        tipo: 'texto',
        filtro: 'nombre',
        requerido: true,
        mensaje: 'Ingresa los apellidos.',
      },
      {
        clave: 'fechaNacimiento',
        columna: 'Fecha de nacimiento (estudiante)',
        etiqueta: 'Fecha de nacimiento',
        tipo: 'fecha',
        requerido: true,
        mensaje: 'Selecciona la fecha de nacimiento.',
        noFutura: true,
      },
      {
        clave: 'sexo',
        columna: 'Sexo',
        etiqueta: 'Sexo',
        tipo: 'eleccion',
        opciones: SEXO_BASICA,
        requerido: true,
        mensaje: 'Selecciona el sexo.',
      },
      {
        clave: 'nacionalidad',
        columna: 'Nacionalidad (estudiante)',
        etiqueta: 'Nacionalidad',
        tipo: 'texto',
        filtro: 'texto',
        requerido: true,
        mensaje: 'Ingresa la nacionalidad.',
      },
      {
        clave: 'naturalizado',
        columna: '¿Es naturalizado? (estudiante)',
        etiqueta: '¿Es naturalizado?',
        tipo: 'eleccion',
        opciones: SI_NO,
        requerido: true,
        mensaje: 'Indica si es naturalizado.',
      },
      {
        clave: 'estadoFamiliar',
        columna: 'Estado familiar (estudiante)',
        etiqueta: 'Estado familiar',
        tipo: 'eleccion',
        opciones: OPCIONES_ESTADO_FAMILIAR,
        naEnBlanco: true,
        requerido: true,
        mensaje: 'Selecciona el estado familiar.',
      },
      {
        clave: 'etnia',
        columna: 'Etnia',
        etiqueta: 'Etnia',
        tipo: 'fijo',
        fijoValor: 'N/A',
        nota: 'En Básica la etnia no aplica: se guarda en blanco.',
      },
      {
        clave: 'discapacidad',
        columna: 'Tiene alguna discapacidad (estudiante)',
        etiqueta: 'Tiene alguna discapacidad',
        tipo: 'eleccion',
        opciones: SI_NO,
        requerido: true,
        mensaje: 'Indica si tiene alguna discapacidad.',
      },
      {
        clave: 'discapacidadCual',
        columna: 'Discapacidad especifique (estudiante)',
        etiqueta: 'Discapacidad especifique',
        tipo: 'texto',
        filtro: 'texto',
        soloCompanero: true,
        visibleSi: { clave: 'discapacidad', valor: 'Sí' },
        requeridoSi: { clave: 'discapacidad', valor: 'Sí' },
        mensaje: 'Especifica la discapacidad.',
      },
      {
        clave: 'embarazo',
        columna: 'Embarazo (estudiante)',
        etiqueta: 'Embarazo',
        tipo: 'eleccion',
        opciones: SI_NO,
        requerido: true,
        mensaje: 'Indica si está embarazada.',
      },
      {
        clave: 'fechaParto',
        columna: 'Fecha de parto (estudiante)',
        etiqueta: 'Fecha de parto',
        tipo: 'fecha',
        visibleSi: { clave: 'embarazo', valor: 'Sí' },
        requeridoSi: { clave: 'embarazo', valor: 'Sí' },
        mensaje: 'Selecciona la fecha de parto.',
        noFutura: true,
      },
      {
        clave: 'distrito',
        columna: 'Distrito (estudiante)',
        etiqueta: 'Distrito',
        tipo: 'eleccion',
        opciones: DISTRITOS_CENTRO,
        requerido: true,
        mensaje: 'Selecciona el distrito.',
      },
      {
        clave: 'canton',
        columna: 'Cantón (estudiante)',
        etiqueta: 'Cantón',
        tipo: 'eleccion',
        opciones: CANTONES_CENTRO,
        requerido: true,
        mensaje: 'Selecciona el cantón.',
      },
      {
        clave: 'caserio',
        columna: 'Caserío (estudiante)',
        etiqueta: 'Caserío',
        tipo: 'eleccion',
        opciones: OPCIONES_CASERIO_CENTRO,
        naEnBlanco: true,
        otro: {
          valor: OTRO_CASERIO,
          clave: 'caserioOtro',
          columna: 'Caserío especifique (estudiante)',
          etiqueta: 'Especifique el caserío',
        },
      },
      {
        clave: 'caserioOtro',
        columna: 'Caserío especifique (estudiante)',
        etiqueta: 'Especifique el caserío',
        tipo: 'texto',
        filtro: 'texto',
        soloCompanero: true,
        visibleSi: { clave: 'caserio', valor: OTRO_CASERIO },
        requeridoSi: { clave: 'caserio', valor: OTRO_CASERIO },
        mensaje: 'Especifica el caserío.',
      },
      {
        clave: 'grado',
        columna: 'Grado que cursa',
        etiqueta: 'Grado que cursará',
        tipo: 'eleccion',
        opciones: GRADOS_BASICA,
        requerido: true,
        mensaje: 'Selecciona el grado que cursará.',
      },
      {
        clave: 'gradoId',
        columna: 'Grado (id)',
        etiqueta: '',
        tipo: 'derivado-grado',
        derivadoDe: 'grado',
      },
      {
        clave: 'tipoCalle',
        columna: 'Tipo de calle',
        etiqueta: 'Tipo de calle',
        tipo: 'eleccion',
        opciones: OPCIONES_TIPO_CALLE,
        naEnBlanco: true,
        requerido: true,
        mensaje: 'Selecciona el tipo de calle.',
      },
      {
        clave: 'medioTransporte',
        columna: 'Medio de transporte',
        etiqueta: 'Medio de transporte',
        tipo: 'eleccion',
        opciones: OPCIONES_TRANSPORTE,
        naEnBlanco: true,
        requerido: true,
        mensaje: 'Selecciona el medio de transporte.',
        otro: {
          valor: OTRO_TRANSPORTE,
          clave: 'transporteOtro',
          columna: 'Transporte especifique',
          etiqueta: 'Transporte especifique',
        },
      },
      {
        clave: 'transporteOtro',
        columna: 'Transporte especifique',
        etiqueta: 'Transporte especifique',
        tipo: 'texto',
        filtro: 'texto',
        soloCompanero: true,
        visibleSi: { clave: 'medioTransporte', valor: OTRO_TRANSPORTE },
        requeridoSi: { clave: 'medioTransporte', valor: OTRO_TRANSPORTE },
        mensaje: 'Especifica el medio de transporte.',
      },
      {
        clave: 'factoresRiesgo',
        columna: 'Factores de riesgo en camino',
        etiqueta: 'Factores de riesgo en camino',
        tipo: 'texto',
        filtro: 'libre',
      },
      {
        clave: 'trabaja',
        columna: 'Trabaja el estudiante',
        etiqueta: 'Trabaja el estudiante',
        tipo: 'eleccion',
        opciones: SI_NO,
      },
      {
        clave: 'dependenciaEconomica',
        columna: 'Dependencia económica del estudiante',
        etiqueta: 'Dependencia económica del estudiante',
        tipo: 'eleccion',
        opciones: OPCIONES_DEPENDENCIA,
        naEnBlanco: true,
        requerido: true,
        mensaje: 'Selecciona la dependencia económica.',
        otro: {
          valor: OTROS_DEPENDENCIA,
          clave: 'dependenciaOtro',
          columna: 'Dependencia especifique',
          etiqueta: 'Dependencia especifique',
        },
      },
      {
        clave: 'dependenciaOtro',
        columna: 'Dependencia especifique',
        etiqueta: 'Dependencia especifique',
        tipo: 'texto',
        filtro: 'texto',
        soloCompanero: true,
        visibleSi: { clave: 'dependenciaEconomica', valor: OTROS_DEPENDENCIA },
        requeridoSi: { clave: 'dependenciaEconomica', valor: OTROS_DEPENDENCIA },
        mensaje: 'Especifica la dependencia.',
      },
      {
        clave: 'ocupacion',
        columna: 'Ocupación del estudiante',
        etiqueta: 'Ocupación del estudiante',
        tipo: 'eleccion',
        opciones: OPCIONES_OCUPACION_ESTUDIANTE,
        naEnBlanco: true,
        otro: {
          valor: OTRO_OCUPACION,
          clave: 'ocupacionOtro',
          columna: 'Ocupación especifique (estudiante)',
          etiqueta: 'Ocupación especifique',
        },
      },
      {
        clave: 'ocupacionOtro',
        columna: 'Ocupación especifique (estudiante)',
        etiqueta: 'Ocupación especifique',
        tipo: 'texto',
        filtro: 'texto',
        soloCompanero: true,
        visibleSi: { clave: 'ocupacion', valor: OTRO_OCUPACION },
        requeridoSi: { clave: 'ocupacion', valor: OTRO_OCUPACION },
        mensaje: 'Especifica la ocupación.',
      },
      {
        clave: 'tipoSangre',
        columna: 'Tipo de sangre',
        etiqueta: 'Tipo de sangre',
        tipo: 'eleccion',
        opciones: OPCIONES_SANGRE,
        naEnBlanco: true,
      },
      {
        clave: 'propiedadVivienda',
        columna: 'Propiedad de la vivienda',
        etiqueta: 'Propiedad de la vivienda',
        tipo: 'eleccion',
        opciones: OPCIONES_PROPIEDAD,
        naEnBlanco: true,
        requerido: true,
        mensaje: 'Selecciona la propiedad de la vivienda.',
        otro: {
          valor: OTRA_PROPIEDAD,
          clave: 'propiedadOtra',
          columna: 'Vivienda especifique',
          etiqueta: 'Vivienda especifique',
        },
      },
      {
        clave: 'propiedadOtra',
        columna: 'Vivienda especifique',
        etiqueta: 'Vivienda especifique',
        tipo: 'texto',
        filtro: 'texto',
        soloCompanero: true,
        visibleSi: { clave: 'propiedadVivienda', valor: OTRA_PROPIEDAD },
        requeridoSi: { clave: 'propiedadVivienda', valor: OTRA_PROPIEDAD },
        mensaje: 'Especifica la propiedad.',
      },
      {
        clave: 'serviciosBasicos',
        columna: 'Servicios básicos',
        etiqueta: 'Servicios básicos',
        tipo: 'marcadores',
        opciones: SERVICIOS_BASICOS_LISTA,
        requerido: true,
        mensaje: 'Marca al menos un servicio básico.',
        ancho: 'completo',
      },
      {
        clave: 'accesoInternet',
        columna: 'Acceso a internet',
        etiqueta: 'Acceso a internet',
        tipo: 'eleccion',
        opciones: SI_NO,
        requerido: true,
        mensaje: 'Indica si tiene acceso a internet.',
      },
      {
        clave: 'remesas',
        columna: 'Recibe remesas',
        etiqueta: 'Recibe remesas',
        tipo: 'eleccion',
        opciones: SI_NO,
      },
      {
        clave: 'hijos',
        columna: 'El estudiante tiene hijos',
        etiqueta: 'El estudiante tiene hijos',
        tipo: 'eleccion',
        opciones: SI_NO,
      },
      {
        clave: 'emigrados',
        columna: 'Personas del grupo familiar que han emigrado',
        etiqueta: 'Personas del grupo familiar que han emigrado',
        tipo: 'texto',
        filtro: 'digitos',
      },
    ],
  }
}

function parteResponsableBasica(): Parte {
  return {
    id: 'basica-responsable',
    etiqueta: 'Parte 3',
    titulo: 'Datos del responsable',
    nivel: 'educacion-basica',
    campos: [
      {
        clave: 'identificacion',
        columna: 'Identificación (responsable)',
        etiqueta: 'Identificación',
        tipo: 'texto',
        filtro: 'identificacion',
        requerido: true,
        mensaje: 'Ingresa la identificación (solo números, con guiones si hace falta).',
      },
      {
        clave: 'esFamiliar',
        columna: '¿Es familiar? (responsable)',
        etiqueta: '¿Es familiar?',
        tipo: 'eleccion',
        opciones: SI_NO,
        requerido: true,
        mensaje: 'Indica si es familiar.',
      },
      {
        clave: 'nombre',
        columna: 'Nombre completo (responsable)',
        etiqueta: 'Nombre completo',
        tipo: 'texto',
        filtro: 'nombre',
        requerido: true,
        mensaje: 'Ingresa el nombre completo.',
      },
      {
        clave: 'fechaNacimiento',
        columna: 'Fecha de nacimiento (responsable)',
        etiqueta: 'Fecha de nacimiento',
        tipo: 'fecha',
        requerido: true,
        mensaje: 'Selecciona la fecha de nacimiento.',
        noFutura: true,
      },
      {
        clave: 'nacionalidad',
        columna: 'Nacionalidad (responsable)',
        etiqueta: 'Nacionalidad',
        tipo: 'eleccion',
        opciones: NACIONALIDADES_CA,
        requerido: true,
        mensaje: 'Selecciona la nacionalidad.',
      },
      {
        clave: 'naturalizado',
        columna: '¿Es naturalizado? (responsable)',
        etiqueta: '¿Es naturalizado?',
        tipo: 'eleccion',
        opciones: SI_NO,
        requerido: true,
        mensaje: 'Indica si es naturalizado.',
      },
      {
        clave: 'departamentoNacimiento',
        columna: 'Departamento de nacimiento (responsable)',
        etiqueta: 'Departamento de nacimiento',
        tipo: 'eleccion',
        opciones: DEPARTAMENTOS_SV,
        requerido: true,
        mensaje: 'Selecciona el departamento de nacimiento.',
      },
      {
        clave: 'distritoNacimiento',
        columna: 'Distrito de nacimiento (responsable)',
        etiqueta: 'Distrito de nacimiento',
        tipo: 'eleccion',
        dinamicas: 'distritos-nacimiento',
        requerido: true,
        mensaje: 'Selecciona el distrito de nacimiento.',
      },
      {
        clave: 'sexo',
        columna: 'Sexo (responsable)',
        etiqueta: 'Sexo',
        tipo: 'eleccion',
        opciones: SEXO_BASICA,
        requerido: true,
        mensaje: 'Selecciona el sexo.',
      },
      {
        clave: 'estadoFamiliar',
        columna: 'Estado familiar (responsable)',
        etiqueta: 'Estado familiar',
        tipo: 'eleccion',
        opciones: OPCIONES_ESTADO_FAMILIAR,
        naEnBlanco: true,
        requerido: true,
        mensaje: 'Selecciona el estado familiar.',
      },
            {
        clave: 'discapacidad',
        columna: 'Tiene alguna discapacidad (responsable)',
        etiqueta: 'Tiene alguna discapacidad',
        tipo: 'eleccion',
        opciones: SI_NO,
        requerido: true,
        mensaje: 'Indica si tiene alguna discapacidad.',
      },
      {
        clave: 'embarazo',
        columna: 'Embarazo (responsable)',
        etiqueta: 'Embarazo',
        tipo: 'eleccion',
        opciones: SI_NO,
        requerido: true,
        mensaje: 'Indica si está embarazada.',
      },
      {
        clave: 'fechaParto',
        columna: 'Fecha de parto (responsable)',
        etiqueta: 'Fecha de parto',
        tipo: 'fecha',
        visibleSi: { clave: 'embarazo', valor: 'Sí' },
        requeridoSi: { clave: 'embarazo', valor: 'Sí' },
        mensaje: 'Selecciona la fecha de parto.',
        noFutura: true,
      },
      {
        clave: 'paisTelefono',
        columna: 'Código de teléfono (responsable)',
        etiqueta: 'Código del país',
        tipo: 'codigo-tel',
      },
      {
        clave: 'telefono',
        columna: 'Teléfono (responsable)',
        etiqueta: 'Teléfono',
        tipo: 'telefono',
        codigoDe: 'paisTelefono',
      },
      {
        clave: 'profesion',
        columna: 'Profesión (responsable)',
        etiqueta: 'Profesión',
        tipo: 'eleccion',
        opciones: OPCIONES_PROFESION,
        otro: {
          valor: OTRO_OCUPACION,
          clave: 'profesionOtra',
          columna: 'Profesión especifique (responsable)',
          etiqueta: 'Profesión especifique',
        },
      },
      {
        clave: 'profesionOtra',
        columna: 'Profesión especifique (responsable)',
        etiqueta: 'Profesión especifique',
        tipo: 'texto',
        filtro: 'texto',
        soloCompanero: true,
        visibleSi: { clave: 'profesion', valor: OTRO_OCUPACION },
        requeridoSi: { clave: 'profesion', valor: OTRO_OCUPACION },
        mensaje: 'Especifica la profesión.',
      },
      {
        clave: 'escolaridad',
        columna: 'Escolaridad (responsable)',
        etiqueta: 'Escolaridad',
        tipo: 'eleccion',
        opciones: ESCOLARIDADES,
      },
      {
        clave: 'ocupacion',
        columna: 'Ocupación (responsable)',
        etiqueta: 'Ocupación',
        tipo: 'eleccion',
        opciones: OPCIONES_OCUPACION,
        requerido: true,
        mensaje: 'Selecciona la ocupación.',
        otro: {
          valor: OTRO_OCUPACION,
          clave: 'ocupacionOtro',
          columna: 'Ocupación especifique (responsable)',
          etiqueta: 'Ocupación especifique',
        },
      },
      {
        clave: 'ocupacionOtro',
        columna: 'Ocupación especifique (responsable)',
        etiqueta: 'Ocupación especifique',
        tipo: 'texto',
        filtro: 'texto',
        soloCompanero: true,
        visibleSi: { clave: 'ocupacion', valor: OTRO_OCUPACION },
        requeridoSi: { clave: 'ocupacion', valor: OTRO_OCUPACION },
        mensaje: 'Especifica la ocupación.',
      },
    ],
    validarExtra: (valores) => {
      const fallos: Record<string, string> = {}
      const codigo = textoDe(valores, 'paisTelefono')
      const numero = textoDe(valores, 'telefono').trim()
      if (numero && !codigo) {
        fallos['paisTelefono'] = 'Selecciona el código del país.'
      } else if (codigo && !numero) {
        fallos['telefono'] = 'Ingresa el número de teléfono o deja el prefijo en blanco.'
      }
      return fallos
    },
  }
}

/* ── Las partes que ofrece Estudiantes › Actualizar, por nivel ──
   (la Parte 1 de cada nivel son los datos del centro: NO son del
   estudiante y se cambian en Configuración › Informacion CE). */
export const PARTES: Record<NivelEstudiante, Parte[]> = {
  'primera-infancia': [
    parteEstudiantePI(),
    partePersona('madre', 'Parte 2.2', 'Datos de la madre', '¿Tiene madre?', 'madre', []),
    partePersona('padre', 'Parte 2.3', 'Datos del padre', '¿Tiene padre?', 'padre', []),
    partePersona(
      'otra',
      'Parte 2.4',
      'Otra persona que acompañará al niño o niña',
      '¿Otra persona acompañará al niño o niña?',
      'otra persona',
      [
        {
          clave: 'responsableElegido',
          columna: 'Responsable elegido',
          etiqueta: 'Responsable del estudiante',
          tipo: 'eleccion',
          opciones: ['Madre', 'Padre', 'Otra persona'],
          opcionesSegunTiene: [
            { etiqueta: 'Madre', columna: '¿Tiene madre?' },
            { etiqueta: 'Padre', columna: '¿Tiene padre?' },
            { etiqueta: 'Otra persona', columna: '¿Otra persona acompañará al niño o niña?' },
          ],
          requerido: true,
          mensaje: 'Elige quién será el responsable del estudiante.',
          ancho: 'completo',
          nota: 'Firebase guarda los datos de contacto del responsable: la madre, el padre o la otra persona.',
        },
      ],
    ),
    parteDiscapacidadPI(),
    parteConvivencia(),
    parteIngresos(),
    parteVivienda(),
    parteHabitos(),
    parteParticipacion(),
    parteModalidad(),
  ],
  'educacion-basica': [parteEstudianteBasica(), parteResponsableBasica()],
}

/* Parte por id (null si el nivel o el id no existen) */
export function parteDe(nivel: NivelEstudiante, id: string): Parte | null {
  return PARTES[nivel].find((parte) => parte.id === id) ?? null
}
