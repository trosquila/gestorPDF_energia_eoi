import OpenAI from 'openai'
import { config } from '../config.js'

let openai = null

function getOpenAIClient() {
  if (!openai) {
    if (!config.openai.apiKey) {
      throw new Error('OpenAI API key not configured')
    }
    openai = new OpenAI({
      apiKey: config.openai.apiKey
    })
  }
  return openai
}

const EXTRACTION_PROMPT = `
Eres un experto en extracción de datos de facturas de energía españolas.
Extrae la siguiente información del texto de la factura y devuélvela SOLO como JSON válido.

CAMPOS A EXTRAER:
- num_factura: string (número de factura)
- fecha_emision: string (YYYY-MM-DD)
- periodo_inicio: string (YYYY-MM-DD)
- periodo_fin: string (YYYY-MM-DD)
- titular: string (nombre del titular)
- nif: string (NIF/CIF)
- cups: string (CUPS - 20-22 caracteres empezando por ES)
- direccion_suministro: string
- comercializadora: string (Endesa, Iberdrola, Naturgy, Repsol, EDP, etc.)
- tipo_contrato: string (ej: 2.0TD, 3.0TD)
- peaje_acceso: string (ej: 2.0TD)
- consumo_total_kwh: number
- importe_total_eur: number
- lineas: array de objetos con: concepto, periodo_tarifario, cantidad, precio_unitario, importe

CONCEPTOS VÁLIDOS: potencia, energía, peajes, cargos, impuesto electricidad, IVA, alquiler contador
PERIODOS VÁLIDOS: P1, P2, P3, P4, P5, P6

REGLAS:
- Si un campo no se encuentra, omítelo (no pongas null)
- Los importes en euros con 2 decimales
- El consumo en kWh con 2 decimales
- Fechas en formato YYYY-MM-DD
- El CUPS debe empezar por ES y tener 20-22 caracteres

TEXTO DE LA FACTURA:
{{TEXT}}
`

export async function extractWithLLM(text) {
  if (!config.openai.apiKey) {
    throw new Error('OpenAI API key not configured')
  }
  
  const prompt = EXTRACTION_PROMPT.replace('{{TEXT}}', text.substring(0, 15000))
  
  try {
    const client = getOpenAIClient()
    const response = await client.chat.completions.create({
      model: config.openai.model,
      messages: [
        { role: 'system', content: 'Eres un extractor de datos de facturas de energía. Responde SOLO con JSON válido.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
      max_tokens: 2000,
      response_format: { type: 'json_object' }
    })
    
    const content = response.choices[0].message.content
    const parsed = JSON.parse(content)
    
    return {
      data: parsed,
      methods: Object.keys(parsed).reduce((acc, key) => {
        acc[key] = 'llm'
        return acc
      }, {}),
      estado: 'ok',
      confianza: 0.85,
      metodo_extraccion: 'llm'
    }
  } catch (error) {
    console.error('LLM extraction error:', error)
    throw new Error('Error en extracción con LLM: ' + error.message)
  }
}

export async function hybridExtract(text) {
  const { extractWithRegex, getCamposFaltantes } = await import('./extraction.js')
  
  const regexResult = extractWithRegex(text)
  const faltantes = getCamposFaltantes(regexResult.data)
  
  if (faltantes.length === 0) {
    return regexResult
  }
  
  if (!config.openai.apiKey) {
    return {
      ...regexResult,
      estado: 'revisión',
      confianza: Math.min(regexResult.confianza, 0.6)
    }
  }
  
  try {
    const llmResult = await extractWithLLM(text)
    
    const mergedData = { ...regexResult.data }
    const mergedMethods = { ...regexResult.methods }
    
    for (const key of faltantes) {
      if (llmResult.data[key] !== undefined) {
        mergedData[key] = llmResult.data[key]
        mergedMethods[key] = 'llm'
      }
    }
    
    if (llmResult.data.lineas && llmResult.data.lineas.length > 0) {
      mergedData.lineas = llmResult.data.lineas
      mergedMethods.lineas = 'llm'
    }
    
    const obligatorios = ['cups', 'periodo_inicio', 'periodo_fin', 'consumo_total_kwh', 'importe_total_eur']
    const obligatoriosEncontrados = obligatorios.filter(c => mergedData[c]).length
    
    return {
      data: mergedData,
      methods: mergedMethods,
      estado: obligatoriosEncontrados === obligatorios.length ? 'ok' : 'revisión',
      confianza: Math.max(regexResult.confianza, 0.75),
      metodo_extraccion: 'mixto',
      campos_encontrados: obligatoriosEncontrados,
      campos_totales: obligatorios.length
    }
  } catch (error) {
    console.error('Hybrid extraction failed, returning regex result:', error)
    return {
      ...regexResult,
      estado: 'revisión',
      confianza: Math.min(regexResult.confianza, 0.6)
    }
  }
}