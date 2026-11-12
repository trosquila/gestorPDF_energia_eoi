import { config } from '../config.js'

/**
 * Precios de electricidad desde `apidatos.ree.es` (Red Eléctrica).
 * No requiere token y devuelve PVPC y precio de mercado por horas en €/MWh.
 *
 * Ojo con las unidades: la API trabaja en €/MWh. Todo lo que sale de aquí
 * hacia el comparador se convierte a €/kWh (÷1000) para no multiplicar
 * facturas por mil.
 */

const BASE = 'https://apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real'
const TTL_MS = 30 * 60 * 1000 // 30 minutos
const cache = new Map()

function clave(desde, hasta) {
  return `${desde}|${hasta}`
}

function formatearFecha(fecha) {
  const d = fecha instanceof Date ? fecha : new Date(fecha)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

async function pedir(desde, hasta) {
  const url = `${BASE}?start_date=${desde}T00:00&end_date=${hasta}T23:00&time_trunc=hour`
  const controlador = new AbortController()
  const temporizador = setTimeout(() => controlador.abort(), 20000)

  try {
    const respuesta = await fetch(url, {
      signal: controlador.signal,
      headers: { 'User-Agent': 'control-energia/1.0 (comparador)' }
    })
    if (!respuesta.ok) throw new Error(`REE respondió ${respuesta.status}`)
    return await respuesta.json()
  } finally {
    clearTimeout(temporizador)
  }
}

/** Convierte una serie de REE en [{ datetime, pvpc, spot }] en €/kWh, por hora. */
function normalizar(datos) {
  const series = {}
  for (const incluido of datos.included || []) {
    const nombre = incluido.type
    const valores = incluido.attributes?.values || []
    series[nombre] = valores.map((v) => ({
      datetime: v.datetime,
      valor: Number(v.value) / 1000
    }))
  }

  const pvpc = series.PVPC || []
  const spot = series['Precio mercado spot'] || []
  const mapa = new Map()

  for (const punto of pvpc) {
    const hora = `${punto.datetime.slice(0, 13)}:00`
    mapa.set(hora, { datetime: hora, pvpc: punto.valor, spot: null })
  }

  // El precio de mercado llega cada 15 minutos: se agrupa por hora para que
  // las dos series se puedan comparar y dibujar juntas.
  const acumulado = new Map()
  for (const punto of spot) {
    const hora = `${punto.datetime.slice(0, 13)}:00`
    const entrada = acumulado.get(hora) || { suma: 0, cuenta: 0 }
    entrada.suma += punto.valor
    entrada.cuenta += 1
    acumulado.set(hora, entrada)
  }

  for (const [hora, { suma, cuenta }] of acumulado) {
    const media = Number((suma / cuenta).toFixed(5))
    const existente = mapa.get(hora)
    if (existente) existente.spot = media
    else mapa.set(hora, { datetime: hora, pvpc: null, spot: media })
  }

  return [...mapa.values()].sort((a, b) => a.datetime.localeCompare(b.datetime))
}

function estadisticas(horas) {
  const valores = horas.map((h) => h.pvpc).filter((v) => Number.isFinite(v))
  if (valores.length === 0) return null
  const suma = valores.reduce((t, v) => t + v, 0)
  return {
    media: Number((suma / valores.length).toFixed(5)),
    minima: Number(Math.min(...valores).toFixed(5)),
    maxima: Number(Math.max(...valores).toFixed(5)),
    horas: valores.length
  }
}

/**
 * Precios de un rango (por defecto hoy).
 * @param {{ desde?: string, hasta?: string }} opciones fechas YYYY-MM-DD
 */
export async function preciosDelDia({ desde, hasta } = {}) {
  const hoy = formatearFecha(new Date())
  const inicio = desde || hoy
  const fin = hasta || inicio

  const k = clave(inicio, fin)
  const enCache = cache.get(k)
  if (enCache && Date.now() - enCache.guardado < TTL_MS) {
    return { ...enCache.datos, cache: true }
  }

  const datos = await pedir(inicio, fin)
  const horas = normalizar(datos)
  const resumen = estadisticas(horas)

  const salida = {
    desde: inicio,
    hasta: fin,
    fuente: 'apidatos.ree.es (Red Eléctrica)',
    unidad: '€/kWh',
    horario: horas,
    resumen,
    guardado: new Date().toISOString()
  }

  cache.set(k, { guardado: Date.now(), datos: salida })
  return { ...salida, cache: false }
}

/**
 * Precio medio de los últimos 30 días, por periodo 2.0TD
 * (P1 punta laborables 10-14 y 18-22; P2 llano; P3 valle).
 * Se usa para estimar el PVPC cuando no hay histórico del cliente.
 */
export async function mediaPorPeriodo2_0TD() {
  const hasta = new Date()
  const desde = new Date()
  desde.setDate(desde.getDate() - 29)

  const { horario } = await preciosDelDia({
    desde: formatearFecha(desde),
    hasta: formatearFecha(hasta)
  })

  const acumulado = { P1: [], P2: [], P3: [] }

  for (const punto of horario) {
    if (!Number.isFinite(punto.pvpc)) continue
    const fecha = new Date(punto.datetime)
    const dia = fecha.getDay()
    const hora = fecha.getHours()

    let periodo = 'P3'
    if (dia >= 1 && dia <= 5) {
      if ((hora >= 10 && hora < 14) || (hora >= 18 && hora < 22)) periodo = 'P1'
      else if (hora >= 8 && hora < 10) periodo = 'P2'
      else if (hora >= 14 && hora < 18) periodo = 'P2'
      else if (hora >= 22 || hora < 8) periodo = 'P2'
    } else {
      periodo = 'P3'
    }
    acumulado[periodo].push(punto.pvpc)
  }

  const media = (lista) => (lista.length
    ? Number((lista.reduce((t, v) => t + v, 0) / lista.length).toFixed(5))
    : null)

  return { P1: media(acumulado.P1), P2: media(acumulado.P2), P3: media(acumulado.P3) }
}

export function limpiarCachePrecios() {
  cache.clear()
}
