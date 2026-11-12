import { config } from '../config.js'

/**
 * Asistente del comparador.
 *
 * Regla dura: la IA solo puede hablar de los números que le llegan en el
 * contexto. Si un importe no está en los datos, el backend lo descarta antes
 * de devolver la respuesta, para que no invente tarifas.
 */

const MODELOS = [
  'dots-studio/dots-3-note-preview:free',
  'recursive/flint-v1.0:free',
  'liquid/lfm-3-1.7b:free'
]

const TIMEOUT_MS = 30000

const SISTEMA = `Eres un asesor energético que trabaja para una empresa de gestión de facturas.
Respondes en español, en tono profesional y directo, en un máximo de 8 líneas.

Reglas:
- Solo puedes mencionar importes, precios y ahorros que aparezcan en el JSON de DATOS.
- Si DATOS no contiene un dato, di que no lo tienes en vez de estimarlo.
- No inventes comercializadoras ni tarifas que no estén en DATOS.
- Explica siempre en qué te basas (una factura real, una estimación de PVPC o una oferta del catálogo).
- No des consejos legales ni prometas ahorros que los datos no respalden.`

/** Extrae todos los números del texto (para validar que la IA no inventó). */
function numerosDe(texto) {
  return new Set(
    (String(texto).match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(',', '.'))
  )
}

/**
 * Comprueba que cada cifra de la respuesta exista en los datos.
 * @returns {{ valido: boolean, inventadas: string[] }}
 */
export function validarCifras(respuesta, datos) {
  const permitidos = numerosDe(JSON.stringify(datos))
  const inventadas = []

  // Se revisan solo importes con decimales: años, periodos y kWh enteros se
  // citan sin problema y no aportan riesgo.
  for (const cifra of numerosDe(respuesta)) {
    if (!cifra.includes('.')) continue
    if (permitidos.has(cifra)) continue
    // Tolerancia de redondeo: 12.3 y 12.34 son la misma cifra
    const cercana = [...permitidos].some((p) => {
      const a = Number(p)
      const b = Number(cifra)
      return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 0.02
    })
    if (!cercana) inventadas.push(cifra)
  }

  return { valido: inventadas.length === 0, inventadas: inventadas.slice(0, 5) }
}

async function llamarModelo(modelo, mensajes, apiKey) {
  const controlador = new AbortController()
  const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_MS)

  try {
    const respuesta = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: controlador.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://gestorpdf-energia-web.vercel.app',
        'X-Title': 'Control Energia - Comparador'
      },
      body: JSON.stringify({
        model: modelo,
        messages: mensajes,
        temperature: 0.2,
        max_tokens: 700,
        reasoning: { enabled: false }
      })
    })

    if (!respuesta.ok) {
      const detalle = await respuesta.text()
      throw new Error(`${respuesta.status} ${detalle.slice(0, 120)}`)
    }

    const datos = await respuesta.json()
    const texto = datos.choices?.[0]?.message?.content
    if (!texto || !texto.trim()) throw new Error('respuesta vacía')
    return texto.trim()
  } finally {
    clearTimeout(temporizador)
  }
}

/**
 * Pregunta al asistente con el resultado del comparador como contexto.
 * @param {{ datos: object, pregunta?: string }} opciones
 */
export async function consultarAsistente({ datos, pregunta }) {
  const apiKey = config.openrouter?.apiKey
  if (!apiKey) throw new Error('Falta OPENROUTER_API_KEY en el servidor')

  const mensajes = [
    { role: 'system', content: SISTEMA },
    {
      role: 'user',
      content: `DATOS (JSON):\n${JSON.stringify(datos)}\n\nPREGUNTA: ${pregunta || '¿Qué oferta me conviene y por qué? Resume el ahorro.'}`
    }
  ]

  const errores = []
  for (const modelo of MODELOS) {
    try {
      const texto = await llamarModelo(modelo, mensajes, apiKey)
      const control = validarCifras(texto, datos)
      return {
        respuesta: texto,
        modelo,
        cifras_verificadas: control.valido,
        cifras_inventadas: control.inventadas
      }
    } catch (error) {
      errores.push(`${modelo}: ${error.message}`)
    }
  }

  throw new Error('Ningún modelo gratuito respondió. ' + errores.join(' | '))
}
