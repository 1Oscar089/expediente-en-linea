/* ── Países del mundo (regla del proyecto: select en orden ALFABÉTICO) ──
   Cada país lleva su CÓDIGO TELEFÓNICO (+503, +502, …) y, para los más
   comunes, el FORMATO en que se escribe el número: el usuario elige el
   país en el select del teléfono y el número se formatea solo mientras
   escribe, según el patrón de ese país ("#" = un dígito).
   Para los países sin formato definido el número queda como dígitos
   libres (máximo 15, el máximo internacional E.164). */

export interface Pais {
  nombre: string
  codigo: string /* código telefónico, con + */
  digitos?: number /* cuántos dígitos se escriben DESPUÉS del código */
  formato?: string /* patrón con # ; si falta, dígitos libres */
}

const LISTA: Pais[] = [
  { nombre: 'Afganistán', codigo: '+93' },
  { nombre: 'Albania', codigo: '+355' },
  { nombre: 'Alemania', codigo: '+49' },
  { nombre: 'Andorra', codigo: '+376' },
  { nombre: 'Angola', codigo: '+244' },
  { nombre: 'Antigua y Barbuda', codigo: '+1-268', digitos: 7, formato: '###-####' },
  { nombre: 'Arabia Saudita', codigo: '+966' },
  { nombre: 'Argelia', codigo: '+213' },
  { nombre: 'Argentina', codigo: '+54', digitos: 10, formato: '## ####-####' },
  { nombre: 'Armenia', codigo: '+374' },
  { nombre: 'Australia', codigo: '+61' },
  { nombre: 'Austria', codigo: '+43' },
  { nombre: 'Azerbaiyán', codigo: '+994' },
  { nombre: 'Bahamas', codigo: '+1-242', digitos: 7, formato: '###-####' },
  { nombre: 'Bangladés', codigo: '+880' },
  { nombre: 'Barbados', codigo: '+1-246', digitos: 7, formato: '###-####' },
  { nombre: 'Baréin', codigo: '+973' },
  { nombre: 'Bélgica', codigo: '+32' },
  { nombre: 'Belice', codigo: '+501', digitos: 7, formato: '###-####' },
  { nombre: 'Benín', codigo: '+229' },
  { nombre: 'Bielorrusia', codigo: '+375' },
  { nombre: 'Bolivia', codigo: '+591', digitos: 8, formato: '####-####' },
  { nombre: 'Bosnia y Herzegovina', codigo: '+387' },
  { nombre: 'Botsuana', codigo: '+267' },
  { nombre: 'Brasil', codigo: '+55', digitos: 11, formato: '## #####-####' },
  { nombre: 'Brunéi', codigo: '+673' },
  { nombre: 'Bulgaria', codigo: '+359' },
  { nombre: 'Burkina Faso', codigo: '+226' },
  { nombre: 'Burundi', codigo: '+257' },
  { nombre: 'Bután', codigo: '+975' },
  { nombre: 'Cabo Verde', codigo: '+238' },
  { nombre: 'Camboya', codigo: '+855' },
  { nombre: 'Camerún', codigo: '+237' },
  { nombre: 'Canadá', codigo: '+1', digitos: 10, formato: '###-###-####' },
  { nombre: 'Catar', codigo: '+974' },
  { nombre: 'Chad', codigo: '+235' },
  { nombre: 'Chile', codigo: '+56', digitos: 9, formato: '#### ####' },
  { nombre: 'China', codigo: '+86' },
  { nombre: 'Chipre', codigo: '+357' },
  { nombre: 'Colombia', codigo: '+57', digitos: 10, formato: '### ### ####' },
  { nombre: 'Comoras', codigo: '+269' },
  { nombre: 'Corea del Norte', codigo: '+850' },
  { nombre: 'Corea del Sur', codigo: '+82' },
  { nombre: 'Costa de Marfil', codigo: '+225' },
  { nombre: 'Costa Rica', codigo: '+506', digitos: 8, formato: '####-####' },
  { nombre: 'Croacia', codigo: '+385' },
  { nombre: 'Cuba', codigo: '+53', digitos: 8, formato: '#### ####' },
  { nombre: 'Dinamarca', codigo: '+45' },
  { nombre: 'Dominica', codigo: '+1-767', digitos: 7, formato: '###-####' },
  { nombre: 'Ecuador', codigo: '+593', digitos: 9, formato: '## ### ####' },
  { nombre: 'Egipto', codigo: '+20' },
  { nombre: 'El Salvador', codigo: '+503', digitos: 8, formato: '####-####' },
  { nombre: 'Emiratos Árabes Unidos', codigo: '+971' },
  { nombre: 'Eritrea', codigo: '+291' },
  { nombre: 'Eslovaquia', codigo: '+421' },
  { nombre: 'Eslovenia', codigo: '+386' },
  { nombre: 'España', codigo: '+34', digitos: 9, formato: '### ### ###' },
  { nombre: 'Estados Unidos', codigo: '+1', digitos: 10, formato: '###-###-####' },
  { nombre: 'Estonia', codigo: '+372' },
  { nombre: 'Eswatini', codigo: '+268' },
  { nombre: 'Etiopía', codigo: '+251' },
  { nombre: 'Filipinas', codigo: '+63' },
  { nombre: 'Finlandia', codigo: '+358' },
  { nombre: 'Fiyi', codigo: '+679' },
  { nombre: 'Francia', codigo: '+33', digitos: 9, formato: '## ## ## ## ##' },
  { nombre: 'Gabón', codigo: '+241' },
  { nombre: 'Gambia', codigo: '+220' },
  { nombre: 'Georgia', codigo: '+995' },
  { nombre: 'Ghana', codigo: '+233' },
  { nombre: 'Granada', codigo: '+1-473', digitos: 7, formato: '###-####' },
  { nombre: 'Grecia', codigo: '+30' },
  { nombre: 'Guatemala', codigo: '+502', digitos: 8, formato: '####-####' },
  { nombre: 'Guyana', codigo: '+592' },
  { nombre: 'Guinea', codigo: '+224' },
  { nombre: 'Guinea-Bisáu', codigo: '+245' },
  { nombre: 'Guinea Ecuatorial', codigo: '+240' },
  { nombre: 'Haití', codigo: '+509', digitos: 8, formato: '#### ####' },
  { nombre: 'Honduras', codigo: '+504', digitos: 8, formato: '####-####' },
  { nombre: 'Hungría', codigo: '+36' },
  { nombre: 'India', codigo: '+91' },
  { nombre: 'Indonesia', codigo: '+62' },
  { nombre: 'Irak', codigo: '+964' },
  { nombre: 'Irán', codigo: '+98' },
  { nombre: 'Irlanda', codigo: '+353' },
  { nombre: 'Islandia', codigo: '+354' },
  { nombre: 'Islas Marshall', codigo: '+692' },
  { nombre: 'Islas Salomón', codigo: '+677' },
  { nombre: 'Israel', codigo: '+972' },
  { nombre: 'Italia', codigo: '+39' },
  { nombre: 'Jamaica', codigo: '+1-876', digitos: 7, formato: '###-####' },
  { nombre: 'Japón', codigo: '+81' },
  { nombre: 'Jordania', codigo: '+962' },
  { nombre: 'Kazajistán', codigo: '+7' },
  { nombre: 'Kenia', codigo: '+254' },
  { nombre: 'Kirguistán', codigo: '+996' },
  { nombre: 'Kiribati', codigo: '+686' },
  { nombre: 'Kuwait', codigo: '+965' },
  { nombre: 'Laos', codigo: '+856' },
  { nombre: 'Lesoto', codigo: '+266' },
  { nombre: 'Letonia', codigo: '+371' },
  { nombre: 'Líbano', codigo: '+961' },
  { nombre: 'Liberia', codigo: '+231' },
  { nombre: 'Libia', codigo: '+218' },
  { nombre: 'Liechtenstein', codigo: '+423' },
  { nombre: 'Lituania', codigo: '+370' },
  { nombre: 'Luxemburgo', codigo: '+352' },
  { nombre: 'Macedonia del Norte', codigo: '+389' },
  { nombre: 'Madagascar', codigo: '+261' },
  { nombre: 'Malasia', codigo: '+60' },
  { nombre: 'Malaui', codigo: '+265' },
  { nombre: 'Maldivas', codigo: '+960' },
  { nombre: 'Malí', codigo: '+223' },
  { nombre: 'Malta', codigo: '+356' },
  { nombre: 'Marruecos', codigo: '+212' },
  { nombre: 'Mauricio', codigo: '+230' },
  { nombre: 'Mauritania', codigo: '+222' },
  { nombre: 'México', codigo: '+52', digitos: 10, formato: '### ### ####' },
  { nombre: 'Micronesia', codigo: '+691' },
  { nombre: 'Moldavia', codigo: '+373' },
  { nombre: 'Mónaco', codigo: '+377' },
  { nombre: 'Mongolia', codigo: '+976' },
  { nombre: 'Montenegro', codigo: '+382' },
  { nombre: 'Mozambique', codigo: '+258' },
  { nombre: 'Namibia', codigo: '+264' },
  { nombre: 'Nauru', codigo: '+674' },
  { nombre: 'Nepal', codigo: '+977' },
  { nombre: 'Nicaragua', codigo: '+505', digitos: 8, formato: '####-####' },
  { nombre: 'Níger', codigo: '+227' },
  { nombre: 'Nigeria', codigo: '+234' },
  { nombre: 'Noruega', codigo: '+47' },
  { nombre: 'Nueva Zelanda', codigo: '+64' },
  { nombre: 'Omán', codigo: '+968' },
  { nombre: 'Países Bajos', codigo: '+31' },
  { nombre: 'Pakistán', codigo: '+92' },
  { nombre: 'Palaos', codigo: '+680' },
  { nombre: 'Panamá', codigo: '+507', digitos: 8, formato: '####-####' },
  { nombre: 'Papúa Nueva Guinea', codigo: '+675' },
  { nombre: 'Paraguay', codigo: '+595', digitos: 9, formato: '### ### ###' },
  { nombre: 'Perú', codigo: '+51', digitos: 9, formato: '### ### ###' },
  { nombre: 'Polonia', codigo: '+48' },
  { nombre: 'Portugal', codigo: '+351' },
  { nombre: 'Reino Unido', codigo: '+44' },
  { nombre: 'República Centroafricana', codigo: '+236' },
  { nombre: 'República Checa', codigo: '+420' },
  { nombre: 'República del Congo', codigo: '+242' },
  { nombre: 'República Democrática del Congo', codigo: '+243' },
  { nombre: 'República Dominicana', codigo: '+1-809', digitos: 7, formato: '###-####' },
  { nombre: 'Ruanda', codigo: '+250' },
  { nombre: 'Rumanía', codigo: '+40' },
  { nombre: 'Rusia', codigo: '+7' },
  { nombre: 'Samoa', codigo: '+685' },
  { nombre: 'San Cristóbal y Nieves', codigo: '+1-869', digitos: 7, formato: '###-####' },
  { nombre: 'San Marino', codigo: '+378' },
  { nombre: 'Santa Lucía', codigo: '+1-758', digitos: 7, formato: '###-####' },
  { nombre: 'Santo Tomé y Príncipe', codigo: '+239' },
  { nombre: 'San Vicente y las Granadinas', codigo: '+1-784', digitos: 7, formato: '###-####' },
  { nombre: 'Senegal', codigo: '+221' },
  { nombre: 'Serbia', codigo: '+381' },
  { nombre: 'Seychelles', codigo: '+248' },
  { nombre: 'Sierra Leona', codigo: '+232' },
  { nombre: 'Singapur', codigo: '+65' },
  { nombre: 'Siria', codigo: '+963' },
  { nombre: 'Somalia', codigo: '+252' },
  { nombre: 'Sri Lanka', codigo: '+94' },
  { nombre: 'Sudáfrica', codigo: '+27' },
  { nombre: 'Sudán', codigo: '+249' },
  { nombre: 'Sudán del Sur', codigo: '+211' },
  { nombre: 'Suecia', codigo: '+46' },
  { nombre: 'Suiza', codigo: '+41' },
  { nombre: 'Surinam', codigo: '+597' },
  { nombre: 'Tailandia', codigo: '+66' },
  { nombre: 'Tanzania', codigo: '+255' },
  { nombre: 'Tayikistán', codigo: '+992' },
  { nombre: 'Timor Oriental', codigo: '+670' },
  { nombre: 'Togo', codigo: '+228' },
  { nombre: 'Tonga', codigo: '+676' },
  { nombre: 'Trinidad y Tobago', codigo: '+1-868', digitos: 7, formato: '###-####' },
  { nombre: 'Túnez', codigo: '+216' },
  { nombre: 'Turkmenistán', codigo: '+993' },
  { nombre: 'Turquía', codigo: '+90' },
  { nombre: 'Tuvalu', codigo: '+688' },
  { nombre: 'Ucrania', codigo: '+380' },
  { nombre: 'Uganda', codigo: '+256' },
  { nombre: 'Uruguay', codigo: '+598', digitos: 8, formato: '#### ####' },
  { nombre: 'Uzbekistán', codigo: '+998' },
  { nombre: 'Vanuatu', codigo: '+678' },
  { nombre: 'Vaticano', codigo: '+379' },
  { nombre: 'Venezuela', codigo: '+58', digitos: 10, formato: '### ### ####' },
  { nombre: 'Vietnam', codigo: '+84' },
  { nombre: 'Yibuti', codigo: '+253' },
  { nombre: 'Yemen', codigo: '+967' },
  { nombre: 'Zambia', codigo: '+260' },
  { nombre: 'Zimbabue', codigo: '+263' },
]

/* Orden alfabético en español, una sola vez (se reutiliza en todos los selects) */
export const PAISES: Pais[] = [...LISTA].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

export const NOMBRES_PAISES: string[] = PAISES.map((p) => p.nombre)

/* País por nombre (null si no existe) */
export function paisPorNombre(nombre: string): Pais | null {
  return PAISES.find((p) => p.nombre === nombre) ?? null
}

/* Código telefónico de un país ('' si no existe) */
export function codigoTelefono(nombre: string): string {
  return paisPorNombre(nombre)?.codigo ?? ''
}

/* Da formato al número MIENTRAS se escribe: aplica el patrón del país
   ("#" = dígito); los países sin patrón quedan como dígitos libres (15).
   "digitos" es lo que se escribió (ya filtrado a solo números). */
export function formatarTelefono(nombrePais: string, digitos: string): string {
  const pais = paisPorNombre(nombrePais)
  const limpios = digitos.replace(/\D/g, '')
  if (!pais?.formato) return limpios.slice(0, 15)
  let salida = ''
  let i = 0
  for (const c of pais.formato) {
    if (c === '#') {
      if (i >= limpios.length) break
      salida += limpios[i]
      i += 1
    } else {
      /* separadores que ya casaron con dígitos suficientes */
      if (i >= limpios.length) break
      salida += c
    }
  }
  return salida
}

/* Cuántos dígitos se esperan para el número de un país (15 si es libre) */
export function digitosDeTelefono(nombrePais: string): number {
  return paisPorNombre(nombrePais)?.digitos ?? 15
}

/* Texto para el select del teléfono: "+503 — El Salvador" */
export function etiquetaTelefono(nombrePais: string): string {
  const pais = paisPorNombre(nombrePais)
  return pais ? `${pais.codigo} — ${pais.nombre}` : nombrePais
}
