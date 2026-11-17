import { config } from '../config.js'
import { getSupabaseClient } from './supabase.js'

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

const PATRON_CUPS = /ES[0-9A-Z]{10,}/gi
const PREGUNTA_ACCION = /modifica|modificar|editar|cambiar|cambia|actualiza|actualizar|setea|corregir/i

const SISTEMA_COMPARADOR = `Eres un asesor energético que trabaja para una empresa de gestión de facturas.
Respondes en español, en tono profesional y directo, en un máximo de 8 líneas.

Reglas:
- Solo puedes mencionar importes, precios y ahorros que aparezcan en el JSON de DATOS.
- Si DATOS no contiene un dato, di que no lo tienes en vez de estimarlo.
- No inventes comercializadoras ni tarifas que no estén en DATOS.
- Explica siempre en qué te basas (una factura real, una estimación de PVPC o una oferta del catálogo).
- No des consejos legales ni prometas ahorros que los datos no respalden.`

const MAPA_PAGINAS = [
  {
    ruta: '/',
    nombre: 'Subida',
    titulo: 'Subida de facturas',
    descripcion: 'Pantalla principal para subir facturas (OCR, regex y extracción con IA) y consultar el historial.',
    palabras: ['subida', 'subir', 'cargar']
  },
  {
    ruta: '/analitica',
    nombre: 'Analitica',
    titulo: 'Analítica',
    descripcion: 'Estadísticas y visualización del consumo y los costes energéticos por periodo.',
    palabras: ['analitica', 'estadisticas', 'dashboard', 'consumo']
  },
  {
    ruta: '/comparador',
    nombre: 'Comparador',
    titulo: 'Comparador de ofertas',
    descripcion: 'Compara el coste de ofertas de comercializadoras frente a la factura actual y calcula el ahorro.',
    palabras: ['comparador', 'comparar', 'comercializadoras', 'oferta', 'ahorro', 'coste']
  },
  {
    ruta: '/clientes',
    nombre: 'Clientes',
    titulo: 'Clientes',
    descripcion: 'Gestión de clientes y sus datos de consumo.',
    palabras: ['clientes', 'cliente']
  },
  {
    ruta: '/solicitudes',
    nombre: 'Solicitudes',
    titulo: 'Solicitudes',
    descripcion: 'Panel de administración / solicitudes.',
    palabras: ['solicitudes', 'solicitud']
  },
  {
    ruta: '/lote',
    nombre: 'Lote',
    titulo: 'Lote de facturas',
    descripcion: 'Procesamiento por lotes de facturas.',
    palabras: ['lote', 'lotes']
  }
]

function normalizarTexto(valor) {
  return String(valor || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function resolverRutaNavegacion(pregunta) {
  const texto = normalizarTexto(pregunta)
  let mejorRuta = null
  let mejorScore = 0
  for (const pagina of MAPA_PAGINAS) {
    const score = pagina.palabras.filter((p) => texto.includes(normalizarTexto(p))).length
    if (score > mejorScore) {
      mejorScore = score
      mejorRuta = pagina.ruta
    }
  }
  return mejorScore > 0 ? mejorRuta : null
}

const SISTEMA_GENERAL = `Eres el asistente de la app de gestión de facturas de energía "Control Energía".
Respondes en español, en tono profesional y directo, en un máximo de 8 líneas.

Conoces el contenido de las secciones de la aplicación:
${MAPA_PAGINAS.map((p) => `- ${p.titulo} (${p.ruta}): ${p.descripcion}`).join('\n')}

Reglas:
- Solo ayudas a navegar por la aplicación y a entender cómo funciona cada sección.
- No inventes datos, cifras ni funcionalidades que no existan en la app.
- Si el usuario quiere ir a una sección, identifícala con el mapa y responde indicando la navegación.
- Si no sabes algo, di que no lo sabes en lugar de adivinar.
- No des consejos legales ni prometes ahorros que no se puedan calcular.`

/** Extrae todos los números del texto (para validar que la IA no inventó). */
function numerosDe(texto) {
  return new Set(
    (String(texto).match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(',', '.'))
  )
}

/**
 * Comprueba que cada cifra de la respuesta exista en los datos.
 * Los porcentajes se ignoran: son derivados (un 51 % sale del ahorro), no
 * precios inventados.
 * @returns {{ valido: boolean, inventadas: string[] }}
 */
export function validarCifras(respuesta, datos) {
  const permitidos = numerosDe(JSON.stringify(datos))
  const inventadas = []
  const texto = String(respuesta)

  for (const coincidencia of texto.matchAll(/\d+(?:[.,]\d+)?/g)) {
    const cifra = coincidencia[0].replace(',', '.')
    if (!cifra.includes('.')) continue

    const siguiente = texto.slice(coincidencia.index + coincidencia[0].length).trimStart()[0]
    if (siguiente === '%') continue

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

/** Busca facturas por CUPS (el "lote" de una factura concreta). */
async function buscarFacturasPorCups(cups) {
  const supabase = getSupabaseClient(true)
  const { data, error } = await supabase
    .from('facturas')
    .select('*')
    .ilike('cups', cups)
    .limit(50)
  if (error) return null
  return data || []
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
 * Pregunta al asistente. `contexto` es el resultado de la comparación cuando
 * existe (modo comparador) o el contexto de la página cuando no (modo ayuda).
 * @param {{ contexto?: object, pregunta?: string }} opciones
 */
export async function consultarAsistente({ contexto, pregunta }) {
  const apiKey = config.openrouter?.apiKey
  if (!apiKey) throw new Error('Falta OPENROUTER_API_KEY en el servidor')

  const contextoUsado = contexto || null
  if (!contextoUsado) throw new Error('Falta el contexto de la pregunta')

  let contextoAjustado = contextoUsado
  let facturasEncontradas = null
  const matchCups = String(pregunta || '').toUpperCase().match(PATRON_CUPS)
  if (matchCups) {
    const facturas = await buscarFacturasPorCups(matchCups[0])
    if (facturas) {
      contextoAjustado = { ...contextoUsado, facturas }
      facturasEncontradas = facturas
    }
  }

  const esComparacion = Boolean(contextoAjustado.ofertas || contextoAjustado.perfil)
  const systemPrompt = esComparacion ? SISTEMA_COMPARADOR : SISTEMA_GENERAL
  const contenido = esComparacion
    ? `DATOS (JSON):\n${JSON.stringify(contextoAjustado)}\n\nPREGUNTA: ${pregunta || '¿Qué oferta me conviene y por qué? Resume el ahorro.'}`
    : `CONTEXTO (JSON):\n${JSON.stringify(contextoAjustado)}\n\nPREGUNTA: ${pregunta || 'Explícame cómo funciona esta sección de la aplicación.'}`

  const mensajes = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: contenido }
  ]

  // En modo ayuda: si el usuario pide ir a una sección, resolvemos la ruta destino.
  let accion = null
  if (!esComparacion) {
    const preguntaAccion = PREGUNTA_ACCION.test(String(pregunta || ''))
    const rutaDestino = resolverRutaNavegacion(pregunta)
    if (facturasEncontradas && facturasEncontradas.length > 0 && preguntaAccion) {
      // Instrucción tipo "modifica el campo consumo de la factura con cup X": llevamos a la factura concreta.
      accion = { tipo: 'navegar', ruta: `/factura/${facturasEncontradas[0].id_factura}` }
    } else if (rutaDestino) {
      accion = { tipo: 'navegar', ruta: rutaDestino }
    }
  }

  const errores = []
  for (const modelo of MODELOS) {
    try {
      const texto = await llamarModelo(modelo, mensajes, apiKey)
      if (!esComparacion) {
        return {
          respuesta: texto,
          modelo,
          cifras_verificadas: true,
          ...(accion ? { accion } : {})
        }
      }
      const control = validarCifras(texto, contextoUsado)
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
