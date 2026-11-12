import { config } from '../config.js'

const PATTERNS = {
  // CUPS real: ES + 16-20 caracteres alfanuméricos (suele acabar en 2 letras)
  cups: /(ES[0-9A-Z]{16,22})/gi,
  
  nif: /([A-Z]\d{7,8}[A-Z0-9]|\d{8}[A-Z])/g,
  
  // Acepta DD/MM/YYYY, D/M/YY y también el formato ISO YYYY-MM-DD
  fecha: /(\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}|\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/g,

  importe: /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))\s*(?:€|EUR|euros?)/gi,
  
  numeroFactura: /(?:Factura|Fact\.|N[º°]|Núm(?:ero)?|Num).{0,25}?((?=[A-Z0-9\-\/]*\d)[A-Z0-9][A-Z0-9\-\/]{3,})/i,
  
  consumo: /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?)\s*kWh/gi,
  
  potencia: /(\d+(?:[.,]\d+)?)\s*kW/gi,
  
  comercializadora: new RegExp(config.comercializadoras.join('|'), 'gi'),
  
  periodo: /(?:Periodo|Período|Facturación)\s*(?:de|del)?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\s*(?:a|al|-)\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/gi,
  
  direccion: /(?:Dirección|Domicilio|Suministro)\b[\s:]*([^\n]{10,100})/i,
  
  titular: /(?:Titular|Cliente|Nombre)\b[\s:]+([^\n]{3,80})/i,
  
  peaje: /(?:Peaje|Acceso)\s*(?:de\s*)?[:.]?\s*(\d\.\d[Tt][Dd])/i,
  
  tipoContrato: /(?:Tarifa|Contrato)\s*(?:de\s*)?[:.]?\s*(\d\.\d[Tt][Dd])/i
}

// Convierte importes/consumos a número respetando el formato español (1.234,56)
// y el anglosajón (1234.56). Antes se eliminaban todos los puntos, de modo que
// "245.30" acababa siendo 24530.
function cleanNumber(str) {
  let s = String(str).trim().replace(/\s/g, '')
  if (!s) return null

  const tieneComa = s.includes(',')
  const tienePunto = s.includes('.')

  if (tieneComa && tienePunto) {
    // 1.234,56 -> el punto son miles, la coma decimales
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (tieneComa) {
    // 245,30 -> coma decimal
    s = s.replace(',', '.')
  }
  // Solo punto (245.30) se interpreta como decimal: no se toca.

  const n = parseFloat(s)
  return Number.isNaN(n) ? null : n
}

function parseDate(str) {
  const parts = str.split(/[\/\-.]/).map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null

  let year, month, day
  if (String(parts[0]).length === 4) {
    // ISO: YYYY-MM-DD
    ;[year, month, day] = parts
  } else {
    // Español: DD/MM/YYYY o DD/MM/YY
    day = parts[0]
    month = parts[1]
    year = parts[2] < 100 ? 2000 + parts[2] : parts[2]
  }

  const date = new Date(year, month - 1, day)
  // Validación real (evita 31/02 y similares)
  if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
    // Se formatea en local: toISOString() convertía a UTC y en España
    // restaba un día (01/03/2024 -> 2024-02-29).
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  return null
}

// Provincias de España: sirven para deducir la zona desde la dirección del
// suministro (la provincia afecta a peajes y a qué ofertas se contratan).
const PROVINCIAS = [
  'Álava', 'Albacete', 'Alicante', 'Almería', 'Asturias', 'Ávila', 'Badajoz', 'Baleares',
  'Barcelona', 'Burgos', 'Cáceres', 'Cádiz', 'Cantabria', 'Castellón', 'Ceuta',
  'Ciudad Real', 'Córdoba', 'Cuenca', 'Girona', 'Granada', 'Guadalajara', 'Guipúzcoa',
  'Huelva', 'Huesca', 'Jaén', 'La Coruña', 'La Rioja', 'Las Palmas', 'León', 'Lleida',
  'Lugo', 'Madrid', 'Málaga', 'Melilla', 'Murcia', 'Navarra', 'Ourense', 'Palencia',
  'Pontevedra', 'Salamanca', 'Santa Cruz de Tenerife', 'Segovia', 'Sevilla', 'Soria',
  'Tarragona', 'Teruel', 'Toledo', 'Valencia', 'Valladolid', 'Vizcaya', 'Zamora', 'Zaragoza'
]

/** Extrae pares "P1: 4,60" de un texto. Se queda con el primer valor por periodo. */
function extraerPorPeriodo(texto, patron) {
  const mapa = {}
  for (const coincidencia of texto.matchAll(patron)) {
    const periodo = coincidencia[1].toUpperCase()
    const valor = cleanNumber(coincidencia[2])
    if (valor === null) continue
    if (mapa[periodo] === undefined) mapa[periodo] = valor
  }
  return mapa
}

/** Primer número capturado por el patrón, o null. */
function primerNumero(texto, patron) {
  const coincidencia = texto.match(patron)
  return coincidencia ? cleanNumber(coincidencia[1]) : null
}

/**
 * Potencias por periodo separando contratada de máxima demandada.
 * La distribuidora está obligada a incluir las máximas: son el dato que
 * detecta sobrecontratación (≈70 % de los hogares, según la CNMC).
 */
function extraerPotenciasPorLinea(lines) {
  const contratadas = {}
  const maximas = {}

  for (const linea of lines) {
    const esMaxima = /m[aá]xima|demandada|demanda/i.test(linea)
    const esContratada = /contratad/i.test(linea)

    for (const coincidencia of linea.matchAll(/(P[1-6])\s*[:.\-]?\s*(\d{1,2}(?:[.,]\d+)?)\s*kW\b/gi)) {
      const periodo = coincidencia[1].toUpperCase()
      const valor = cleanNumber(coincidencia[2])
      if (valor === null || valor <= 0 || valor > 100) continue

      if (esMaxima && !esContratada) {
        if (maximas[periodo] === undefined) maximas[periodo] = valor
      } else if (contratadas[periodo] === undefined) {
        contratadas[periodo] = valor
      }
    }
  }

  return { contratadas, maximas }
}

export function extractWithRegex(text) {
  const normalized = text.replace(/\s+/g, ' ')
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  const results = {}
  const methods = {}
  let camposEncontrados = 0
  const camposObligatorios = ['cups', 'periodo_inicio', 'periodo_fin', 'consumo_total_kwh', 'importe_total_eur']
  
  // CUPS
  const cupsMatch = normalized.match(PATTERNS.cups)
  if (cupsMatch) {
    results.cups = cupsMatch[0].toUpperCase()
    methods.cups = 'regla'
    camposEncontrados++
  }
  
  // NIF (se excluye el CUPS del texto: sus dígitos encajaban como NIF)
  const textoParaNif = results.cups
    ? normalized.replace(new RegExp(results.cups, 'gi'), ' ')
    : normalized
  const nifMatches = textoParaNif.match(PATTERNS.nif)
  if (nifMatches) {
    results.nif = nifMatches[0].toUpperCase()
    methods.nif = 'regla'
  }
  
  // Comercializadora
  const comMatches = normalized.match(PATTERNS.comercializadora)
  if (comMatches) {
    results.comercializadora = comMatches[0]
    methods.comercializadora = 'regla'
  }
  
  // Número de factura (se exige al menos un dígito y se descartan fechas)
  const numMatches = normalized.match(PATTERNS.numeroFactura)
  const candidatoNum = numMatches && numMatches[1]
  const esFechaSuelta = candidatoNum && /^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}$/.test(candidatoNum)
  if (candidatoNum && /\d/.test(candidatoNum) && !esFechaSuelta) {
    results.num_factura = candidatoNum
    methods.num_factura = 'regla'
  }
  
  // Fechas
  const fechaMatches = [...normalized.matchAll(PATTERNS.fecha)]
  if (fechaMatches.length >= 2) {
    const fechas = fechaMatches.map(m => parseDate(m[1])).filter(Boolean)
    if (fechas.length >= 2) {
      results.fecha_emision = fechas[0]
      results.periodo_inicio = fechas[1]
      results.periodo_fin = fechas[2] || fechas[1]
      methods.fecha_emision = 'regla'
      methods.periodo_inicio = 'regla'
      methods.periodo_fin = 'regla'
      camposEncontrados += 2
    }
  }
  
  // Periodo específico
  const periodoMatch = normalized.match(PATTERNS.periodo)
  if (periodoMatch) {
    const inicio = parseDate(periodoMatch[1])
    const fin = parseDate(periodoMatch[2])
    if (inicio) {
      results.periodo_inicio = inicio
      methods.periodo_inicio = 'regla'
      camposEncontrados++
    }
    if (fin) {
      results.periodo_fin = fin
      methods.periodo_fin = 'regla'
      camposEncontrados++
    }
  }
  
  // Consumo total
  const consumoMatches = [...normalized.matchAll(PATTERNS.consumo)]
  if (consumoMatches.length > 0) {
    const consumos = consumoMatches.map(m => cleanNumber(m[1])).filter(v => v > 0 && v < 100000)
    if (consumos.length > 0) {
      results.consumo_total_kwh = Math.max(...consumos)
      methods.consumo_total_kwh = 'regla'
      camposEncontrados++
    }
  }
  
  // Importe total
  const importeMatches = [...normalized.matchAll(PATTERNS.importe)]
  if (importeMatches.length > 0) {
    const importes = importeMatches.map(m => cleanNumber(m[1])).filter(v => v > 0 && v < 100000)
    if (importes.length > 0) {
      results.importe_total_eur = Math.max(...importes)
      methods.importe_total_eur = 'regla'
      camposEncontrados++
    }
  }
  
  // Potencia genérica: solo como último recurso si no hay desglose por periodos,
  // y se guarda en P1 (antes se escribía 'potencia_contratada', que no es columna).
  if (!results.potencias_contratadas) {
    const potenciaMatches = [...normalized.matchAll(PATTERNS.potencia)]
    const potencias = potenciaMatches.map(m => cleanNumber(m[1])).filter(v => v > 0 && v < 100)
    if (potencias.length > 0) {
      results.potencias_contratadas = { P1: potencias[0] }
      methods.potencias_contratadas = 'regla'
    }
  }
  
  // Peaje
  const peajeMatch = normalized.match(PATTERNS.peaje)
  if (peajeMatch) {
    results.peaje_acceso = peajeMatch[1].toUpperCase()
    methods.peaje_acceso = 'regla'
  }
  
  // Tipo contrato
  const tipoMatch = normalized.match(PATTERNS.tipoContrato)
  if (tipoMatch) {
    results.tipo_contrato = tipoMatch[1].toUpperCase()
    methods.tipo_contrato = 'regla'
  }

  // === Campos de energía por periodo (P1..P6) ===
  // "P1: 4,60 kW" / "Potencia contratada P1 4,60 kW" / "Consumo P2: 98,20 kWh"
  const { contratadas, maximas } = extraerPotenciasPorLinea(lines)
  if (Object.keys(contratadas).length > 0) {
    results.potencias_contratadas = contratadas
    methods.potencias_contratadas = 'regla'
  }
  if (Object.keys(maximas).length > 0) {
    results.potencias_maximas = maximas
    methods.potencias_maximas = 'regla'
  }

  const consumos = extraerPorPeriodo(normalized, /(P[1-6])\s*[:.\-]?\s*(\d{1,4}(?:[.,]\d+)?)\s*kWh/gi)
  if (Object.keys(consumos).length > 0) {
    results.consumos_periodo = consumos
    methods.consumos_periodo = 'regla'
  }

  const precios = extraerPorPeriodo(
    normalized,
    /(P[1-6])\s*[:.\-]?\s*(\d{1,2}[.,]\d{1,4})\s*(?:€|EUR|euros)\s*\/?\s*kWh/gi
  )
  if (Object.keys(precios).length > 0) {
    results.precios_periodo = precios
    methods.precios_periodo = 'regla'
  }

  // === Identificación del suministro ===
  const contrato = normalized.match(/(?:N[º°]\s*(?:de\s*)?contrato|Contrato)\s*[:.]?\s*([A-Z0-9][A-Z0-9\-\/]{5,})/i)
  if (contrato) {
    results.id_contrato = contrato[1]
    methods.id_contrato = 'regla'
  }

  const cp = normalized.match(/(?:C\.?P\.?|C[oó]digo\s+Postal)\s*[:.]?\s*(\d{5})\b/i)
    || normalized.match(/\b(0[1-9]\d{3}|[1-4]\d{4}|5[0-2]\d{3})\b(?=[^\n]{0,40}(?:Salamanca|Madrid|Murcia|Barcelona|Valencia|Sevilla|Bilbao|M[aá]laga))/)
  if (cp) {
    results.codigo_postal = cp[1]
    methods.codigo_postal = 'regla'
  }

  const provincia = PROVINCIAS.find((p) => new RegExp(`\\b${p}\\b`, 'i').test(normalized))
  if (provincia) {
    results.provincia = provincia
    methods.provincia = 'regla'
  }

  // === Autoconsumo ===
  if (/compensaci[oó]n\s+simplificada/i.test(normalized)) {
    results.autoconsumo = 'compensacion_simplificada'
  } else if (/autoconsumo|excedentes/i.test(normalized)) {
    results.autoconsumo = 'excedentes'
  }
  if (results.autoconsumo) methods.autoconsumo = 'regla'

  const excedentesKwh = primerNumero(normalized, /(?:excedentes?|vertidos?)[^\d\n]{0,30}(\d{1,5}(?:[.,]\d+)?)\s*kWh/i)
  if (excedentesKwh !== null) {
    results.excedentes_kwh = excedentesKwh
    methods.excedentes_kwh = 'regla'
  }

  const excedentesEur = primerNumero(normalized, /compensaci[oó]n[^\d€\n]{0,40}(\d{1,4}[.,]\d{2})\s*€?/i)
  if (excedentesEur !== null) {
    results.excedentes_eur = excedentesEur
    methods.excedentes_eur = 'regla'
  }

  // === Desglose económico ===
  // El importe siempre lleva moneda: si no, se capturaba el porcentaje
  // ("impuesto eléctrico 5,11 %" daba 5,11 € en vez del importe real).
  const desglose = [
    ['impuesto_electrico_eur', [
      /impuesto\s+(?:sobre\s+la\s+)?el[eé]ctric[oa][^\n]{0,60}?(\d{1,3}[.,]\d{2})\s*(?:€|EUR|euros)/i,
      /impuesto\s+(?:sobre\s+la\s+)?el[eé]ctric[oa][^\n]{0,40}?\d{1,2}[.,]\d{1,2}\s*%[^\n]{0,20}?(\d{1,3}[.,]\d{2})/i
    ]],
    ['iva_eur', [
      /\bIVA\b[^\n]{0,60}?(\d{1,4}[.,]\d{2})\s*(?:€|EUR|euros)/i,
      /\bIVA\b[^\n]{0,40}?\d{1,2}[.,]?\d{0,2}\s*%[^\n]{0,20}?(\d{1,4}[.,]\d{2})/i
    ]],
    ['alquiler_contador_eur', [
      /alquiler[^\n]{0,40}?(\d{1,3}[.,]\d{2})\s*(?:€|EUR|euros)/i,
      /alquiler[^\d€\n]{0,30}(\d{1,3}[.,]\d{2})/i
    ]],
    ['peajes_cargos_eur', [
      /(?:peajes?\s*(?:y\s*)?cargos?|cargos?\s*regulados)[^\n]{0,50}?(\d{1,4}[.,]\d{2})\s*(?:€|EUR|euros)/i,
      /(?:peajes?\s*(?:y\s*)?cargos?|cargos?\s*regulados)[^\d€\n]{0,30}(\d{1,4}[.,]\d{2})/i
    ]]
  ]
  for (const [campo, patrones] of desglose) {
    for (const patron of patrones) {
      const valor = primerNumero(normalized, patron)
      if (valor !== null) {
        results[campo] = valor
        methods[campo] = 'regla'
        break
      }
    }
  }

  // === Facturación ===
  const dias = primerNumero(normalized, /(\d{1,3})\s*d[ií]as\s*(?:de\s*)?(?:facturaci[oó]n|facturados)?/i)
  if (dias !== null && dias > 0 && dias <= 400) {
    results.dias_facturados = dias
    methods.dias_facturados = 'regla'
  }
  const lectura = normalized.match(/lectura\s+(real|estimada)/i)
  if (lectura) {
    results.tipo_lectura = lectura[1].toLowerCase()
    methods.tipo_lectura = 'regla'
  }
  
  // Titular (buscar en primeras líneas)
  for (const line of lines.slice(0, 20)) {
    const titularMatch = line.match(PATTERNS.titular)
    if (titularMatch && titularMatch[1] && titularMatch[1].length > 3) {
      results.titular = titularMatch[1].trim()
      methods.titular = 'regla'
      break
    }
  }
  
  // Dirección
  for (const line of lines) {
    const dirMatch = line.match(PATTERNS.direccion)
    if (dirMatch && dirMatch[1] && dirMatch[1].length > 10) {
      results.direccion_suministro = dirMatch[1].trim()
      methods.direccion_suministro = 'regla'
      break
    }
  }
  
  // Extraer líneas de factura (conceptos)
  const lineas = extractLineasFactura(lines)
  if (lineas.length > 0) {
    results.lineas = lineas
    methods.lineas = 'regla'
  }
  
  const obligatoriosEncontrados = camposObligatorios.filter(c => results[c]).length
  const completa = obligatoriosEncontrados === camposObligatorios.length
  const estado = completa ? 'ok' : (obligatoriosEncontrados >= 3 ? 'revisión' : 'error')
  const confianza = Math.min(0.95, 0.5 + (obligatoriosEncontrados / camposObligatorios.length) * 0.45)
  const metodo = Object.values(methods).includes('llm') ? 'mixto' : 'regla'
  
  return {
    data: results,
    methods,
    estado,
    confianza: parseFloat(confianza.toFixed(2)),
    metodo_extraccion: metodo,
    campos_encontrados: obligatoriosEncontrados,
    campos_totales: camposObligatorios.length
  }
}

function extractLineasFactura(lines) {
  const lineas = []
  const conceptKeywords = {
    'potencia': ['potencia', 'término potencia', 'termino potencia'],
    'energía': ['energía', 'energia', 'término energía', 'termino energia', 'consumo'],
    'peajes': ['peaje', 'peajes', 'acceso'],
    'cargos': ['cargo', 'cargos'],
    'impuesto electricidad': ['impuesto electricidad', 'impuesto eléctrico', 'iee'],
    'iva': ['iva', 'i.v.a.'],
    'alquiler contador': ['alquiler', 'contador', 'equipo medida', 'equipo de medida']
  }
  
  const periodoPatterns = {
    'P1': ['P1', 'punta', 'periodo 1'],
    'P2': ['P2', 'llano', 'periodo 2'],
    'P3': ['P3', 'valle', 'periodo 3'],
    'P4': ['P4', 'periodo 4'],
    'P5': ['P5', 'periodo 5'],
    'P6': ['P6', 'periodo 6']
  }
  
  for (const line of lines) {
    const lowerLine = line.toLowerCase()
    let concepto = null
    let periodo = null
    
    for (const [key, keywords] of Object.entries(conceptKeywords)) {
      if (keywords.some(k => lowerLine.includes(k))) {
        concepto = key
        break
      }
    }
    
    for (const [key, keywords] of Object.entries(periodoPatterns)) {
      if (keywords.some(k => lowerLine.includes(k))) {
        periodo = key
        break
      }
    }
    
    const importeMatch = line.match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))\s*€/)
    const cantidadMatch = line.match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?)\s*kWh/i)
    const precioMatch = line.match(/(\d+(?:[.,]\d+)?)\s*€\/kWh/i) || line.match(/(\d+(?:[.,]\d+)?)\s*€\/kW/i)
    
    if (concepto && (importeMatch || cantidadMatch)) {
      lineas.push({
        concepto,
        periodo_tarifario: periodo,
        cantidad: cantidadMatch ? cleanNumber(cantidadMatch[1]) : null,
        precio_unitario: precioMatch ? cleanNumber(precioMatch[1]) : null,
        importe: importeMatch ? cleanNumber(importeMatch[1]) : null
      })
    }
  }
  
  return lineas
}

export function getCamposFaltantes(results) {
  const obligatorios = ['cups', 'periodo_inicio', 'periodo_fin', 'consumo_total_kwh', 'importe_total_eur']
  return obligatorios.filter(c => !results[c])
}