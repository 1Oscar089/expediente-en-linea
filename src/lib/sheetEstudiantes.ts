/* ── Cliente del Sheet de ESTUDIANTES (Apps Script) ──
   Libro "estudiantes" con UNA hoja llamada "estudiantes": una FILA por
   cada matrícula guardada, con TODOS los datos del formulario.
   La URL se configura en VITE_SHEET_ESTUDIANTES_URL y el despliegue es
   igual que los otros módulos (Apps Script → Aplicación web → Yo +
   Cualquiera → URL /exec). El POST se envía como text/plain (sin header
   Content-Type) para evitar el preflight de CORS.
   La primera vez que se guarda, el Apps Script crea la hoja y escribe los
   ENCABEZADOS que este módulo declara: la fuente de verdad de las columnas
   vive SOLO aquí. */

const URL_SHEET = (import.meta.env.VITE_SHEET_ESTUDIANTES_URL ?? '').trim()

export const sheetEstudiantesConfigurado = URL_SHEET.length > 0

interface RespuestaSheet {
  ok?: boolean
  error?: string
}

async function llamarSheet(cuerpo: Record<string, unknown>): Promise<void> {
  if (!sheetEstudiantesConfigurado) {
    throw new Error('el Sheet de estudiantes no está configurado (falta VITE_SHEET_ESTUDIANTES_URL).')
  }
  const control = new AbortController()
  const temporizador = setTimeout(() => control.abort(), 25000)
  try {
    const respuesta = await fetch(URL_SHEET, {
      method: 'POST',
      body: JSON.stringify(cuerpo),
      signal: control.signal,
    })
    if (!respuesta.ok) {
      throw new Error(`el Sheet respondió con error HTTP ${respuesta.status}`)
    }
    const texto = await respuesta.text()
    let datos: RespuestaSheet
    try {
      datos = JSON.parse(texto) as RespuestaSheet
    } catch {
      throw new Error(
        'la URL del Sheet no responde como Web App. Revisa el despliegue: "Ejecutar como: Yo" y "Quién tiene acceso: Cualquiera", y usa la URL que termina en /exec.',
      )
    }
    if (!datos.ok) throw new Error(datos.error || 'el Sheet devolvió un error.')
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') {
      throw new Error('el Sheet tardó demasiado en responder.')
    }
    if (e instanceof TypeError) {
      throw new Error(
        'no se pudo conectar con el Sheet. En el despliegue de la Web App, "Quién tiene acceso" debe ser "Cualquiera" y la URL debe terminar en /exec.',
      )
    }
    throw e
  } finally {
    clearTimeout(temporizador)
  }
}

/* ── Columnas del libro (UNA fila por estudiante, en orden) ── */
export const ENCABEZADOS_ESTUDIANTES: string[] = [
  /* Registro */
  'Fecha de registro',
  /* Parte 2.1 · estudiante */
  'NIE',
  'Nombres',
  'Apellidos',
  'Fecha de nacimiento (estudiante)',
  'Edad (estudiante)',
  'Sexo',
  'Nacionalidad',
  'Departamento (estudiante)',
  'Distrito (estudiante)',
  'Cantón (estudiante)',
  'Caserío (estudiante)',
  'Caserío especifique (estudiante)',
  'Grado que cursa',
  'Grado (id)',
  'Último grado cursado (Inicial)',
  'Último grado cursado (Parvularia)',
  'Año que lo cursó',
  'Posee partida de nacimiento',
  'Presenta partida de nacimiento',
  'Etnia',
  /* Parte 2.2 · madre (igual para padre y otra persona) */
  '¿Tiene madre?',
  'Nombre (madre)',
  'Fecha de nacimiento (madre)',
  'Edad (madre)',
  'Documento (madre)',
  'País (madre)',
  'Departamento (madre)',
  'Distrito (madre)',
  'Cantón (madre)',
  'Caserío (madre)',
  'Caserío especifique (madre)',
  'Código de teléfono (madre)',
  'Teléfono (madre)',
  '¿Tiene WhatsApp? (madre)',
  'Celular de WhatsApp (madre)',
  'Correo electrónico (madre)',
  '¿Actualmente estudia? (madre)',
  'Centro educativo (madre)',
  'Último grado cursado Parvularia (madre)',
  'Último grado cursado Básica (madre)',
  'Último grado cursado Media (madre)',
  'Último grado cursado Superior (madre)',
  'Último grado Ninguno (madre)',
  'Ocupación (madre)',
  'Ocupación especifique (madre)',
  'Lugar de trabajo (madre)',
  /* Parte 2.3 · padre */
  '¿Tiene padre?',
  'Nombre (padre)',
  'Fecha de nacimiento (padre)',
  'Edad (padre)',
  'Documento (padre)',
  'País (padre)',
  'Departamento (padre)',
  'Distrito (padre)',
  'Cantón (padre)',
  'Caserío (padre)',
  'Caserío especifique (padre)',
  'Código de teléfono (padre)',
  'Teléfono (padre)',
  '¿Tiene WhatsApp? (padre)',
  'Celular de WhatsApp (padre)',
  'Correo electrónico (padre)',
  '¿Actualmente estudia? (padre)',
  'Centro educativo (padre)',
  'Último grado cursado Parvularia (padre)',
  'Último grado cursado Básica (padre)',
  'Último grado cursado Media (padre)',
  'Último grado cursado Superior (padre)',
  'Último grado Ninguno (padre)',
  'Ocupación (padre)',
  'Ocupación especifique (padre)',
  'Lugar de trabajo (padre)',
  /* Parte 2.4 · otra persona */
  '¿Otra persona acompañará al niño o niña?',
  'Nombre (otra persona)',
  'Fecha de nacimiento (otra persona)',
  'Edad (otra persona)',
  'Documento (otra persona)',
  'País (otra persona)',
  'Departamento (otra persona)',
  'Distrito (otra persona)',
  'Cantón (otra persona)',
  'Caserío (otra persona)',
  'Caserío especifique (otra persona)',
  'Código de teléfono (otra persona)',
  'Teléfono (otra persona)',
  '¿Tiene WhatsApp? (otra persona)',
  'Celular de WhatsApp (otra persona)',
  'Correo electrónico (otra persona)',
  '¿Actualmente estudia? (otra persona)',
  'Centro educativo (otra persona)',
  'Último grado cursado Parvularia (otra persona)',
  'Último grado cursado Básica (otra persona)',
  'Último grado cursado Media (otra persona)',
  'Último grado cursado Superior (otra persona)',
  'Último grado Ninguno (otra persona)',
  'Ocupación (otra persona)',
  'Ocupación especifique (otra persona)',
  'Lugar de trabajo (otra persona)',
  /* Responsable */
  'Responsable elegido',
  /* Parte 3 · discapacidad */
  'Condición de discapacidad',
  'Otros discapacidad (especifique)',
  '3.1 ¿Posee diagnóstico clínico?',
  '3.2 Ha sido referido a',
  '3.3 Servicios que recibe',
  '3.3 Otro (especifique)',
  /* Parte 4 · convivencia */
  '4. Convivencia familiar',
  /* Parte 5 · ingreso */
  '5. Ingreso familiar',
  '5. Otro (especifique)',
  /* Parte 6 · vivienda */
  '6.1 Zona',
  '6.1 Condición de posesión',
  '6.1 Otra (especifique)',
  '6.2 Material de las paredes',
  '6.2 Otros (especifique)',
  '6.3 Material del piso',
  '6.3 Otros materiales (especifique)',
  '6.4 Material del techo',
  '6.4 Otra materia (especifique)',
  '6.5 Servicios de luz y otros',
  '6.5 Otra clase (especifique)',
  '6.6 Servicio básico de agua',
  '6.6 Otro (especifique)',
  '6.7 Servicio sanitario',
  '6.7 Otro (especifique)',
  '6.8 Medios de comunicación del hogar',
  '6.8 Otros (especifique)',
  /* Parte 7 · hábitos */
  '7.1 Horario de sueño por la noche',
  '7.1 Horario de sueño durante el día',
  '7.1 Dificultad para dormir',
  '7.1 Explique',
  '7.1 Con quién duerme',
  '7.1 Otros (especifique)',
  '7.2 Lactancia materna exclusiva',
  '7.2 ¿Cuánto tiempo (meses)?',
  '7.2 Cambios que afectan su alimentación',
  '7.2 ¿Cuál?',
  '7.3 Alimentos que consume',
  '7.3 Otros (especifique)',
  '7.4 Tiempos de comida',
  '7.5 Refrigerios',
  '7.6 ¿Es alérgico a algún alimento?',
  '7.6.1 ¿A cuál(es)?',
  '7.8 Alimentos que prefiere',
  /* Parte 8 · participación */
  '8. Actividades donde apoyará',
  '8. Observaciones',
  /* Parte 9 · modalidad */
  '9. Modalidad de atención',
  '9. Fecha de inscripción (dd/mm/aaaa)',
  '9. Nombre del o la docente responsable',
]

/* Convierte un registro {columna: valor} a la fila del libro, EN EL ORDEN
   de los encabezados (las columnas sin valor quedan en blanco). */
export function aFila(datos: Record<string, string>): string[] {
  return ENCABEZADOS_ESTUDIANTES.map((columna) => datos[columna] ?? '')
}

/* Guarda UNA matrícula: el Apps Script crea la hoja "estudiantes" (con los
   encabezados) la primera vez y agrega la fila al final. */
export async function guardarEstudiante(datos: Record<string, string>): Promise<void> {
  await llamarSheet({
    accion: 'guardar',
    hoja: 'estudiantes',
    encabezados: ENCABEZADOS_ESTUDIANTES,
    fila: aFila(datos),
  })
}
