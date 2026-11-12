import { config } from '../config.js'

// Cascada de modelos gratuitos de OpenRouter. Se prueban en orden hasta que uno
// devuelva JSON válido: los modelos :free tienen límites compartidos y son
// rate-limited de forma intermitente (429 upstream), así que nunca se usa uno solo.
// Verificados contra el catálogo (GET /api/v1/models, filtro ':free' +
// supported_parameters contiene 'response_format').
const MODELOS_POR_DEFECTO = [
  'dots-studio/dots-3-note-preview:free',
  'recursive/flint-v1.0:free',
  'liquid/lfm-3-1.7b:free',
  'google/gemma-4-31b-it:free'
]

const TIMEOUT_MS = 25000

// Esquema estricto: los mismos campos que la tabla facturas.
const ESQUEMA_FACTURA = {
  type: 'object',
  properties: {
    num_factura: { type: ['string', 'null'] },
    fecha_emision: { type: ['string', 'null'] },
    periodo_inicio: { type: ['string', 'null'] },
    periodo_fin: { type: ['string', 'null'] },
    titular: { type: ['string', 'null'] },
    nif: { type: ['string', 'null'] },
    cups: { type: ['string', 'null'] },
    direccion_suministro: { type: ['string', 'null'] },
    comercializadora: { type: ['string', 'null'] },
    tipo_contrato: { type: ['string', 'null'] },
    peaje_acceso: { type: ['string', 'null'] },
    consumo_total_kwh: { type: ['number', 'null'] },
    importe_total_eur: { type: ['number', 'null'] },
    id_contrato: { type: ['string', 'null'] },
    fecha_fin_contrato: { type: ['string', 'null'] },
    codigo_postal: { type: ['string', 'null'] },
    provincia: { type: ['string', 'null'] },
    tipo_suministro: { type: ['string', 'null'] },
    // Mapas por período: {"P1":4.6,"P2":3.45} · potencias en kW, consumos en kWh,
    // precios en €/kWh y precio_potencia en €/kW/año.
    potencias_contratadas: { type: ['object', 'null'], additionalProperties: { type: 'number' } },
    potencias_maximas: { type: ['object', 'null'], additionalProperties: { type: 'number' } },
    precio_potencia: { type: ['object', 'null'], additionalProperties: { type: 'number' } },
    consumos_periodo: { type: ['object', 'null'], additionalProperties: { type: 'number' } },
    precios_periodo: { type: ['object', 'null'], additionalProperties: { type: 'number' } },
    autoconsumo: { type: ['string', 'null'] },
    excedentes_kwh: { type: ['number', 'null'] },
    excedentes_eur: { type: ['number', 'null'] },
    peajes_cargos_eur: { type: ['number', 'null'] },
    alquiler_contador_eur: { type: ['number', 'null'] },
    impuesto_electrico_eur: { type: ['number', 'null'] },
    iva_eur: { type: ['number', 'null'] },
    otros_servicios_eur: { type: ['number', 'null'] },
    bono_social: { type: ['boolean', 'null'] },
    dias_facturados: { type: ['number', 'null'] },
    tipo_lectura: { type: ['string', 'null'] },
    lineas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          concepto: { type: ['string', 'null'] },
          periodo_tarifario: { type: ['string', 'null'] },
          cantidad: { type: ['number', 'null'] },
          precio_unitario: { type: ['number', 'null'] },
          importe: { type: ['number', 'null'] }
        }
      }
    }
  },
  required: ['num_factura', 'fecha_emision', 'titular', 'cups', 'consumo_total_kwh', 'importe_total_eur']
}

const PROMPT_SISTEMA = `Eres un extractor de datos de facturas de energía españolas.
Recibes el texto de una factura obtenido por OCR, que puede contener errores tipográficos típicos
(l en vez de 1, O en vez de 0, S en vez de 5, B en vez de 8, letras perdidas al final del NIF).
Corrige esos errores usando el contexto antes de rellenar los campos.
Devuelve SOLO el JSON del esquema, sin explicaciones. Si un dato no aparece, usa null: nunca lo inventes.`

const PROMPT_USUARIO = (texto) => `Extrae los datos de esta factura.

Reglas:
- Fechas en formato YYYY-MM-DD (interpreta DD/MM/AAAA como día/mes/año).
- consumo_total_kwh e importe_total_eur como números, con punto decimal (63.45, no "63,45").
- cups: cadena completa que empieza por ES, incluidas las letras finales.
- nif: 8 dígitos y la letra final. No confundas el CUPS con el NIF.
- comercializadora: el nombre comercial (Endesa, Iberdrola, Naturgy, Repsol, EDP...).
- tipo_contrato y peaje_acceso: normalmente el mismo código (2.0TD, 3.0TD...).
- lineas: solo si el texto detalla conceptos facturados; si no, array vacío.
- potencias_contratadas / potencias_maximas: mapas {"P1": kW, "P2": kW}. Las máximas
  son las "potencias máximas demandadas" del periodo, no las contratadas.
- consumos_periodo: {"P1": kWh, ...} con el consumo de cada periodo.
- precios_periodo: {"P1": €/kWh, ...} con el precio de la energía de cada periodo.
- autoconsumo: "sin", "excedentes" o "compensacion_simplificada".
- impuesto_electrico_eur: importe del impuesto eléctrico (5,11 %), no el porcentaje.
- iva_eur: importe del IVA, no el porcentaje.
- codigo_postal: 5 dígitos del suministro. provincia: nombre de la provincia.

TEXTO OCR:
"""
${texto}
"""`

/**
 * Convierte el resultado de la IA en el formato que espera la ruta de subida
 * (mismo contrato que hybridExtract: data, methods, estado, confianza...).
 *
 * La IA manda, pero sus resultados varían entre llamadas: los campos que deja
 * a null se rellenan con el extractor por reglas, que es determinista para
 * fechas, periodos y números.
 */
export async function evaluarExtraccionIA(dataIa, texto) {
  const { extractWithRegex } = await import('./extraction.js')

  const reglas = texto ? extractWithRegex(texto) : { data: {}, methods: {} }

  // Se parte de las reglas y solo se sobrescribe con valores REALES de la IA.
  // Antes era { ...reglas.data, ...dataIa } y los null de la IA (el esquema los
  // exige) borraban lo que las reglas sí habían encontrado: potencias y precios
  // por periodo se perdían aunque el OCR los tuviera claros.
  const data = { ...reglas.data }
  const methods = {}
  for (const clave of Object.keys(reglas.data)) methods[clave] = 'regla'

  for (const [clave, valor] of Object.entries(dataIa || {})) {
    if (valor === null || valor === undefined || valor === '') continue

    // Los mapas por periodo se combinan: lo que la IA no ve, lo aporta la regla
    if (typeof valor === 'object' && !Array.isArray(valor)) {
      if (Object.keys(valor).length === 0) continue
      data[clave] = { ...(reglas.data[clave] || {}), ...valor }
      methods[clave] = 'llm'
      continue
    }

    data[clave] = valor
    methods[clave] = 'llm'
  }

  const hayReglas = Object.values(methods).includes('regla')
  const obligatorios = ['cups', 'periodo_inicio', 'periodo_fin', 'consumo_total_kwh', 'importe_total_eur']
  const encontrados = obligatorios.filter((campo) => data[campo] !== undefined && data[campo] !== null).length
  const completo = encontrados === obligatorios.length

  return {
    data,
    methods,
    estado: completo ? 'ok' : 'revisión',
    confianza: completo ? 0.95 : 0.75,
    metodo_extraccion: hayReglas ? 'mixto' : 'llm',
    campos_encontrados: encontrados,
    campos_totales: obligatorios.length
  }
}

function getModelos() {
  const desdeEnv = (process.env.OPENROUTER_MODELS || '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)
  return desdeEnv.length > 0 ? desdeEnv : MODELOS_POR_DEFECTO
}

/**
 * Extrae los campos de una factura a partir del texto OCR usando un modelo
 * gratuito de OpenRouter (con cascada de fallback).
 *
 * @param {string} texto texto obtenido del PDF o del OCR
 * @returns {Promise<{data: object, modelo: string, usage: object|null}>}
 */
export async function extractWithOpenRouter(texto) {
  const apiKey = config.openrouter.apiKey
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY no configurada')
  }
  if (!texto || texto.trim().length < 20) {
    throw new Error('Texto insuficiente para extraer datos')
  }

  const errores = []

  for (const modelo of getModelos()) {
    try {
      const resultado = await llamarModelo(modelo, texto, apiKey)
      return resultado
    } catch (error) {
      errores.push(`${modelo}: ${error.message}`)
      console.warn(`[openrouter] ${modelo} falló: ${error.message}`)
    }
  }

  throw new Error('Ningún modelo gratuito pudo extraer los datos. ' + errores.join(' | '))
}

async function llamarModelo(modelo, texto, apiKey) {
  const cuerpo = {
    model: modelo,
    messages: [
      { role: 'system', content: PROMPT_SISTEMA },
      { role: 'user', content: PROMPT_USUARIO(texto.substring(0, 15000)) }
    ],
    temperature: 0,
    max_tokens: 2000,
    // Sin esto los modelos de razonamiento gastan toda la salida "pensando"
    // y devuelven content: null.
    reasoning: { enabled: false },
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'factura', strict: true, schema: ESQUEMA_FACTURA }
    }
  }

  const controlador = new AbortController()
  const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_MS)

  let respuesta
  try {
    respuesta = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // Identifica la app en el panel de OpenRouter (opcional, ayuda a depurar).
        'HTTP-Referer': 'https://gestor-pdf-energia.vercel.app',
        'X-Title': 'Control Energia'
      },
      body: JSON.stringify(cuerpo),
      signal: controlador.signal
    })
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('tiempo de espera agotado')
    throw new Error('error de red: ' + error.message)
  } finally {
    clearTimeout(temporizador)
  }

  const json = await respuesta.json().catch(() => null)

  if (!respuesta.ok) {
    const detalle = json?.error?.message || `HTTP ${respuesta.status}`
    throw new Error(detalle)
  }

  const contenido = json?.choices?.[0]?.message?.content
  if (!contenido) {
    throw new Error('respuesta vacía del modelo')
  }

  const datos = parsearJson(contenido)

  return {
    data: normalizar(datos),
    modelo: json.model || modelo,
    usage: json.usage || null
  }
}

// Algunos modelos envuelven el JSON en ```json ... ``` o añaden texto.
function parsearJson(contenido) {
  const limpio = String(contenido).replace(/```json|```/g, '').trim()
  try {
    return JSON.parse(limpio)
  } catch {
    const inicio = limpio.indexOf('{')
    const fin = limpio.lastIndexOf('}')
    if (inicio !== -1 && fin > inicio) {
      return JSON.parse(limpio.slice(inicio, fin + 1))
    }
    throw new Error('JSON inválido en la respuesta')
  }
}

// Limpia el resultado: sin nulls, fechas y números consistentes.
function normalizar(datos) {
  const salida = {}

  for (const [clave, valor] of Object.entries(datos || {})) {
    if (valor === null || valor === undefined || valor === '') continue
    if (clave === 'lineas') {
      if (Array.isArray(valor) && valor.length > 0) salida.lineas = valor
      continue
    }
    if (clave === 'consumo_total_kwh' || clave === 'importe_total_eur') {
      const numero = typeof valor === 'number' ? valor : Number(String(valor).replace(',', '.'))
      if (Number.isFinite(numero)) salida[clave] = numero
      continue
    }
    if (clave === 'fecha_emision' || clave === 'periodo_inicio' || clave === 'periodo_fin') {
      const fecha = normalizarFecha(valor)
      if (fecha) salida[clave] = fecha
      continue
    }
    if (clave === 'nif') {
      const nif = normalizarNif(valor)
      if (nif) salida.nif = nif
      continue
    }
    if (clave === 'cups') {
      salida.cups = String(valor).replace(/\s/g, '').toUpperCase()
      continue
    }
    salida[clave] = String(valor).trim()
  }

  return salida
}

// Letras del DNI/NIE por módulo 23 (orden oficial).
const LETRAS_NIF = 'TRWAGMYFPDXBNJZSQVHLCKE'

/**
 * Corrige el NIF usando el dígito de control: el OCR confunde la letra final
 * (Z -> 7, S -> 5...). La letra se recalcula del número, así que un NIF con
 * dígito en el lugar de la letra se arregla solo.
 */
function normalizarNif(valor) {
  const limpio = String(valor).replace(/[\s\-.]/g, '').toUpperCase()

  let numero
  const dni = limpio.match(/^(\d{8})[A-Z0-9]?$/)
  const nie = limpio.match(/^([XYZ])(\d{7})[A-Z0-9]?$/)

  if (dni) {
    numero = Number(dni[1])
  } else if (nie) {
    const prefijo = { X: '0', Y: '1', Z: '2' }[nie[1]]
    numero = Number(prefijo + nie[2])
  } else {
    return limpio
  }

  const letra = LETRAS_NIF[numero % 23]
  return dni ? `${dni[1]}${letra}` : `${nie[1]}${nie[2]}${letra}`
}

function normalizarFecha(valor) {
  const texto = String(valor).trim()

  // Ya viene en ISO
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return texto

  // DD/MM/AAAA o DD-MM-AAAA
  const europea = texto.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/)
  if (europea) {
    const [, d, m, a] = europea
    const anio = a.length === 2 ? `20${a}` : a
    return `${anio}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  return null
}
