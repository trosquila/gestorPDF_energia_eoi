import { config } from '../config.js'

const PATTERNS = {
  cups: /(ES\d{20,22})/gi,
  
  nif: /([A-Z]\d{7,8}[A-Z0-9]|\d{8}[A-Z])/g,
  
  fecha: /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/g,
  
  importe: /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))\s*€/g,
  
  numeroFactura: /(?:Factura\s+(?:N[º°\.\s:]*)?|N[º°\.\s:]*|Num\.?\s*)([A-Z0-9\-\/]{5,})/i,
  
  consumo: /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?)\s*kWh/gi,
  
  potencia: /(\d+(?:[.,]\d+)?)\s*kW/gi,
  
  comercializadora: new RegExp(config.comercializadoras.join('|'), 'gi'),
  
  periodo: /(?:Periodo|Período|Facturación)\s*(?:de|del)?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\s*(?:a|al|-)\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/gi,
  
  direccion: /(?:Dirección|Domicilio|Suministro)[\s:]*([^\n]{10,100})/gi,
  
  titular: /(?:Titular|Cliente|Nombre)[\s:]*([^\n]{3,80})/gi,
  
  peaje: /(?:Peaje|Acceso)\s*(?:de\s*)?(\d\.\d[Tt][Dd])/gi,
  
  tipoContrato: /(?:Tarifa|Contrato)\s*(?:de\s*)?(\d\.\d[Tt][Dd])/gi
}

function cleanNumber(str) {
  return parseFloat(str.replace(/\./g, '').replace(',', '.'))
}

function parseDate(str) {
  const parts = str.split(/[\/\-\.]/)
  if (parts.length === 3) {
    const day = parseInt(parts[0])
    const month = parseInt(parts[1]) - 1
    const year = parseInt(parts[2])
    const fullYear = year < 100 ? 2000 + year : year
    const date = new Date(fullYear, month, day)
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0]
    }
  }
  return null
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
  
  // NIF
  const nifMatches = normalized.match(PATTERNS.nif)
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
  
  // Número de factura
  const numMatches = normalized.match(PATTERNS.numeroFactura)
  if (numMatches) {
    results.num_factura = numMatches[1] || numMatches[0]
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
  
  // Potencia
  const potenciaMatches = [...normalized.matchAll(PATTERNS.potencia)]
  if (potenciaMatches.length > 0) {
    const potencias = potenciaMatches.map(m => cleanNumber(m[1])).filter(v => v > 0 && v < 100)
    if (potencias.length > 0) {
      results.potencia_contratada = potencias[0]
      methods.potencia_contratada = 'regla'
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