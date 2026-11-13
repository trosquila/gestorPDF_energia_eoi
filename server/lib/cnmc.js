/**
 * Catálogo de ofertas desde la API pública del Comparador de la CNMC.
 *
 *   GET https://comparador.cnmc.gob.es/api/APIPublica/ofertas?fecha=dd/MM/yyyy
 *
 * La CNMC publica el uso de estos datos como libre, con una condición:
 * cualquier herramienta que los use debe mencionar que emplea información
 * del Comparador de Ofertas de Energía de la CNMC. Esa mención vive en
 * client/src/views/ComparadorView.vue y en el campo `fuente` de cada oferta.
 *
 * Lo que la API NO trae: `nombreEmpresa` viene vacío en todas las ofertas y
 * `nombreMarca` solo en unas pocas, así que la comercializadora se deduce del
 * dominio de `webOferta` con el mapa DOMINIOS de abajo.
 */

const BASE = 'https://comparador.cnmc.gob.es/api/APIPublica'

export const ATRIBUCION_CNMC =
  'Datos de ofertas: Comparador de Ofertas de Energía de la CNMC (comparador.cnmc.gob.es)'

/** Dominio de la web de la oferta → nombre comercial de la empresa. */
const DOMINIOS = {
  'iberdrola.es': 'Iberdrola',
  'endesa.com': 'Endesa',
  'repsol.es': 'Repsol',
  'naturgy.es': 'Naturgy',
  'octopusenergy.es': 'Octopus Energy',
  'eniplenitude.es': 'Plenitude',
  'edpenergia.es': 'EDP',
  'energiaelcorteingles.es': 'TotalEnergies',
  'catgas.cat': 'Catgas Energía',
  'chcenergia.es': 'CHC Energía',
  'imaginaenergia.com': 'Imagina Energía',
  'visalia.es': 'Visalia',
  'niba.es': 'Niba',
  'papernest.es': 'Papernest Energía',
  'ganaenergia.com': 'Gana Energía',
  'nordy.es': 'Nordy',
  'lumisa.es': 'Lumisa',
  'wekiwi.es': 'Wekiwi',
  'boe.es': 'BOE',
  'contigoenergia.com': 'Contigo Energía',
  'energianufri.com': 'Nufri Energía',
  'energyavm.es': 'AVM Energía',
  'hscomercializadora.com': 'HS Comercializadora',
  'inerenergia.es': 'Iner Energía',
  'elekluz.com': 'Elekluz',
  'logosenergia.es': 'Logos Energía',
  'agrienergia.com': 'Agrienergía',
  'electricaguadassuar.es': 'Eléctrica Guadassuar',
  'xerramcomtu.es': 'Xerra Energia',
  'masnorte.es': 'Más Norte',
  'airelimpioenergia.com': 'Aire Limpio Energía',
  'barcelonaenergia.cat': 'Barcelona Energia',
  'electricadealginet.com': 'Eléctrica Alginet',
  'eleiaenergia.com': 'Eleia Energía',
  'energyasset.es': 'Energy Asset',
  'es.met.com': 'MET Energía',
  'fenieenergia.es': 'Feníe Energía',
  'maisenerxia.com': 'Maisenerxia',
  'contratar.maisenerxia.com': 'Maisenerxia',
  'nexusenergia.com': 'Nexus Energía',
  'nobe.es': 'Nobe Energía',
  'quantiumlux.com': 'Quantium Lux',
  'urusenergy.com': 'Urus Energía',
  'disagrupo.es': 'Disa Grupo'
}

/** Código INE de provincia → nombre, como se guarda en facturas.provincia. */
const PROVINCIAS = {
  1: 'Álava', 2: 'Albacete', 3: 'Alicante', 4: 'Almería', 5: 'Ávila',
  6: 'Badajoz', 7: 'Baleares', 8: 'Barcelona', 9: 'Burgos', 10: 'Cáceres',
  11: 'Cádiz', 12: 'Castellón', 13: 'Ciudad Real', 14: 'Córdoba', 15: 'A Coruña',
  16: 'Cuenca', 17: 'Girona', 18: 'Granada', 19: 'Guadalajara', 20: 'Gipuzkoa',
  21: 'Huelva', 22: 'Huesca', 23: 'Jaén', 24: 'León', 25: 'Lleida',
  26: 'La Rioja', 27: 'Lugo', 28: 'Madrid', 29: 'Málaga', 30: 'Murcia',
  31: 'Navarra', 32: 'Ourense', 33: 'Asturias', 34: 'Palencia', 35: 'Las Palmas',
  36: 'Pontevedra', 37: 'Salamanca', 38: 'Santa Cruz de Tenerife', 39: 'Cantabria',
  40: 'Segovia', 41: 'Sevilla', 42: 'Soria', 43: 'Tarragona', 44: 'Teruel',
  45: 'Toledo', 46: 'Valencia', 47: 'Valladolid', 48: 'Bizkaia', 49: 'Zamora',
  50: 'Zaragoza', 51: 'Ceuta', 52: 'Melilla'
}

const REINTENTOS = 2

function fechaCNMC(fecha = new Date()) {
  const d = fecha instanceof Date ? fecha : new Date(fecha)
  const dia = String(d.getUTCDate()).padStart(2, '0')
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${dia}/${mes}/${d.getUTCFullYear()}`
}

function dominioDe(url) {
  try {
    return new URL(url).host.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
}

/** Expande el patrón de territorio de la CNMC ('37***', '0****', '*****') a provincias. */
export function provinciasDe(territorio) {
  if (!territorio || !String(territorio).trim()) return null
  const texto = String(territorio).trim()
  if (texto === '*****') return null // toda España

  const codigos = new Set()
  for (const trozo of texto.split(',')) {
    const patron = trozo.trim()
    if (!patron) continue
    const dos = patron.slice(0, 2)
    if (!dos) continue

    if (/^\d\d$/.test(dos)) {
      codigos.add(Number(dos))
      continue
    }
    if (/^\d\*$/.test(dos)) {
      for (let i = 0; i <= 9; i++) codigos.add(Number(dos[0] + i))
      continue
    }
    if (/^\d$/.test(dos)) {
      for (let i = 1; i <= 9; i++) codigos.add(Number(dos + i))
    }
  }

  const nombres = [...codigos]
    .map((c) => PROVINCIAS[c])
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'es'))

  return nombres.length > 0 ? nombres : null
}

/** Descarga el listado de ofertas activas a una fecha (por defecto, hoy). */
export async function descargarOfertas(fecha = new Date()) {
  const url = `${BASE}/ofertas?fecha=${encodeURIComponent(fechaCNMC(fecha))}`
  let ultimoError = null

  for (let intento = 0; intento <= REINTENTOS; intento++) {
    const control = new AbortController()
    const temporizador = setTimeout(() => control.abort(), 60000)
    try {
      const respuesta = await fetch(url, {
        signal: control.signal,
        headers: { Accept: 'application/json', 'User-Agent': 'control-energia/1.0' }
      })
      if (!respuesta.ok) {
        throw new Error(`La CNMC respondió ${respuesta.status}`)
      }
      const datos = await respuesta.json()
      return { url, fecha: fechaCNMC(fecha), ofertas: Array.isArray(datos) ? datos : [] }
    } catch (error) {
      ultimoError = error
    } finally {
      clearTimeout(temporizador)
    }
  }
  throw new Error(`No se pudo descargar el catálogo de la CNMC: ${ultimoError?.message}`)
}

function numero(valor) {
  const n = Number(valor)
  return Number.isFinite(n) ? n : null
}

function fechaISO(valor) {
  if (!valor) return null
  const d = new Date(valor)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

/**
 * Franjas de la oferta → { precios: {P1..}, potencias: {P1..}, peajes: [] }.
 * En 2.0TD: 1HORAPUNTA/2HORAVALLE son potencia, 3/4/5 son punta, llano y valle.
 * En 3.0TD: HORAP1..HORAP6 traen ambas cosas por periodo.
 */
export function mapearFranjas(periodos = []) {
  const energia = {}
  const potencia = {}
  const descuentoEnergia = []
  const descuentoPotencia = []

  // `preciofijo` de la CNMC es el alquiler del contador (0,75 €/mes es la tarifa
  // regulada), no una cuota comercial: se guarda en alquiler_contador.
  let alquilerContador = 0
  for (const periodo of periodos || []) {
    const valor = numero(periodo.preciofijo)
    if (valor && valor > alquilerContador) alquilerContador = valor
  }

  for (const periodo of periodos || []) {
    for (const franja of periodo.franjasElectricidad || []) {
      const ref = String(franja.refParams || '').toUpperCase()
      const precio = franja.precio || {}

      let clave = null
      const conNumero = ref.match(/HORAP([1-6])$/)
      if (conNumero) {
        clave = `P${conNumero[1]}`
      } else if (ref.startsWith('1HORAPUNTA') || ref.startsWith('2HORAVALLE')) {
        // Franjas de potencia del 2.0TD
        const esPunta = ref.startsWith('1HORAPUNTA')
        const valor = numero(precio.potencia)
        if (valor !== null) {
          potencia[esPunta ? 'P1' : 'P2'] = valor
          const d = numero(precio.descuentoPotenciaElecPorcentaje)
          if (d) descuentoPotencia.push(d)
        }
        continue
      } else if (ref.startsWith('3HORAPUNTA')) {
        clave = 'P1'
      } else if (ref.startsWith('4HORALLANO')) {
        clave = 'P2'
      } else if (ref.startsWith('5HORAVALLE')) {
        clave = 'P3'
      }

      if (!clave) continue

      const energiaBruta = numero(precio.energia)
      const descuento = numero(precio.descuentoEnergiaElecPorcentaje)
      // Un 0 en la CNMC significa "esta franja no lleva ese concepto", no que sea gratis
      if (energiaBruta !== null && energiaBruta > 0) {
        // El descuento publicado se aplica para poder comparar precios reales
        const efectivo = descuento ? energiaBruta * (1 - descuento / 100) : energiaBruta
        energia[clave] = Number(efectivo.toFixed(6))
        if (descuento) descuentoEnergia.push(descuento)
      }

      const potenciaBruta = numero(precio.potencia)
      if (potenciaBruta !== null && potenciaBruta > 0 && potencia[clave] === undefined) {
        potencia[clave] = Number(potenciaBruta.toFixed(4))
      }
    }
  }

  // Si la oferta publica precios de P4 a P6 es una 3.0TD; si no, una 2.0TD
  const tieneSeis = ['P4', 'P5', 'P6'].some((p) => energia[p] !== undefined)

  return {
    energia,
    potencia,
    peajes: [tieneSeis ? '3.0TD' : '2.0TD'],
    alquiler_contador: Number(alquilerContador.toFixed(4)),
    descuento_energia: descuentoEnergia.length ? Math.max(...descuentoEnergia) : 0,
    descuento_potencia: descuentoPotencia.length ? Math.max(...descuentoPotencia) : 0
  }
}

function tipoDe(oferta) {
  const plan = oferta.electricidad?.tipoPlanElectricidad || ''
  if (/flexible|indexad/i.test(plan)) return 'indexado'
  if (/^COR$/i.test(plan)) return 'indexado'
  return 'fijo'
}

/**
 * Oferta de la CNMC → fila de la tabla `ofertas`.
 * Devuelve null si no hay precios aprovechables.
 */
export function mapearOferta(oferta) {
  if (!oferta || oferta.estado !== 'Activa') return null
  if (![ 'Electricidad', 'Combinada' ].includes(oferta.tipoOferta)) return null
  if (!oferta.electricidad) return null

  const franjas = mapearFranjas(oferta.periodos)
  if (Object.keys(franjas.energia).length === 0) return null

  const dominio = dominioDe(oferta.webOferta)
  const comercializadora =
    (oferta.nombreMarca || '').trim() ||
    DOMINIOS[dominio] ||
    (dominio ? dominio.replace(/\.(es|com|cat)$/, '') : 'Sin identificar')

  const provincias = provinciasDe(oferta.territorio)
  const desde = fechaISO(oferta.fechaDesde)

  return {
    id_externo: `${dominio || 'sin-dominio'}|${oferta.nombreOferta}|${desde || 'sin-fecha'}`,
    comercializadora,
    nombre: oferta.nombreOferta,
    tipo: tipoDe(oferta),
    peajes: franjas.peajes,
    precio_energia: franjas.energia,
    precio_potencia: franjas.potencia,
    precio_excedentes: 0,
    alquiler_contador: franjas.alquiler_contador,
    servicios_incluidos: oferta.serviciosObligatorios ? 'Servicios obligatorios' : null,
    provincias,
    vigencia_desde: desde,
    vigencia_hasta: fechaISO(oferta.fechaHasta),
    fuente: 'CNMC · Comparador de Ofertas de Energía',
    origen: 'cnmc',
    web_oferta: oferta.webOferta || null,
    tipo_plan: oferta.electricidad?.tipoPlanElectricidad || null,
    descuento_energia: franjas.descuento_energia,
    descuento_potencia: franjas.descuento_potencia,
    activo: true
  }
}

/** Mapea el volcado completo y descarta lo que no se puede usar. */
export function mapearCatalogo(ofertas = []) {
  const filas = []
  const descartadas = { sin_precios: 0, no_activa: 0, solo_gas: 0, fuera_de_alcance: 0 }

  for (const oferta of ofertas) {
    if (!oferta || oferta.estado !== 'Activa') {
      descartadas.no_activa++
      continue
    }
    if (!['Electricidad', 'Combinada'].includes(oferta.tipoOferta)) {
      descartadas.solo_gas++
      continue
    }
    const fila = mapearOferta(oferta)
    if (!fila) {
      if (oferta.electricidad) descartadas.sin_precios++
      else descartadas.fuera_de_alcance++
      continue
    }
    if (!['2.0TD', '3.0TD'].includes(fila.peajes[0])) {
      descartadas.fuera_de_alcance++
      continue
    }
    filas.push(fila)
  }

  // Una oferta puede venir repetida por periodo de facturación: se queda la última
  const porClave = new Map()
  for (const fila of filas) porClave.set(fila.id_externo, fila)

  return { filas: [...porClave.values()], descartadas }
}

export { fechaCNMC, PROVINCIAS, DOMINIOS }
