/**
 * Datos de desarrollo para Control Energía.
 *
 * Genera tres suministros completos (doméstica 2.0TD, pyme 3.0TD, industria
 * 6.1TD) con 34 meses de facturas coherentes: reparto por periodo que suma el
 * total, desglose económico que cuadra con el motor de coste, estacionalidad
 * real, dos anomalías inyectadas, una lectura estimada, una factura dada de
 * baja y un hueco de un mes.
 *
 * Uso:
 *   node scripts/seed-dev.js               # simulación (no escribe nada)
 *   node scripts/seed-dev.js --aplicar     # borra y reinserta las filas SEED
 *   node scripts/seed-dev.js --limpiar     # borra las filas SEED
 *
 * Todo lo generado se identifica por CUPS "ESSEED..." y por clientes con
 * empresa "DEMO ...", de modo que se puede borrar sin tocar datos reales.
 * El generador es determinista: dos ejecuciones dan exactamente las mismas
 * cifras, para poder comparar y testear.
 */

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(AQUI, '..')

const PREFIJO_CUPS = 'ESSEED'
const MARCA_CLIENTE = 'DEMO '

// ---------------------------------------------------------------- entorno ---
function cargarEnv() {
  const env = {}
  for (const nombre of ['.env', '.env.local']) {
    const ruta = join(RAIZ, nombre)
    if (!existsSync(ruta)) continue
    for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/)) {
      if (!linea.includes('=') || linea.trim().startsWith('#')) continue
      const i = linea.indexOf('=')
      env[linea.slice(0, i).trim()] = linea.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    }
  }
  const url = env.SUPABASE_URL?.replace(/\/$/, '')
  const key = env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Faltan SUPABASE_URL / SUPABASE_SERVICE_KEY en server/.env(.local)')
  return { url, key }
}

async function postgrest(metodo, ruta, cuerpo, prefer) {
  const { url, key } = cargarEnv()
  const res = await fetch(`${url}/rest/v1/${ruta}`, {
    method: metodo,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {})
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined
  })
  const texto = await res.text()
  if (!res.ok) throw new Error(`${metodo} ${ruta} → ${res.status}: ${texto.slice(0, 400)}`)
  return texto ? JSON.parse(texto) : null
}

// --------------------------------------------------------------- azar fijo ---
/** mulberry32: PRNG pequeño y determinista (misma semilla, misma serie). */
function prng(semilla) {
  let a = semilla >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const r2 = (n) => Math.round(n * 100) / 100

// ---------------------------------------------------------------- perfiles ---
const CLIENTES = [
  { id_cliente: '11111111-1111-4111-8111-111111111111', nombre: 'Ana Ferrer (demo)', empresa: 'DEMO Hogar Salamanca', email: 'demo.hogar@example.com', telefono: '600000001', direccion_empresa: 'C/ Zamora 12, Salamanca' },
  { id_cliente: '22222222-2222-4222-8222-222222222222', nombre: 'Panadería Rubio (demo)', empresa: 'DEMO Panadería Murcia', email: 'demo.pyme@example.com', telefono: '600000002', direccion_empresa: 'Av. Europa 44, Murcia' },
  { id_cliente: '33333333-3333-4333-8333-333333333333', nombre: 'Talleres Levante (demo)', empresa: 'DEMO Industria Valencia', email: 'demo.industria@example.com', telefono: '600000003', direccion_empresa: 'Pol. Nord 7, Valencia' }
]

const SUMINISTROS = [
  {
    id_cliente: CLIENTES[0].id_cliente,
    cups: `${PREFIJO_CUPS}0000000001`,
    titular: 'Ana Ferrer (demo)',
    provincia: 'Salamanca',
    codigo_postal: '37002',
    peaje: '2.0TD',
    tipo_suministro: 'hogar',
    comercializadora: 'Lumisa',
    potencias: { P1: 5.75, P2: 4.6 },
    precio_potencia: { P1: 33.64, P2: 16.22 },
    precios: { P1: 0.1984, P2: 0.1452, P3: 0.0987 },
    reparto: { P1: 0.45, P2: 0.33, P3: 0.22 },
    base_kwh: 315,
    crecimiento: 0.03,
    autoconsumo: 'compensacion_simplificada',
    excedentes_pct: 0.12
  },
  {
    id_cliente: CLIENTES[1].id_cliente,
    cups: `${PREFIJO_CUPS}0000000002`,
    titular: 'Panadería Rubio (demo)',
    provincia: 'Murcia',
    codigo_postal: '30007',
    peaje: '3.0TD',
    tipo_suministro: 'pyme',
    comercializadora: 'Iberdrola',
    potencias: { P1: 12, P2: 12, P3: 12, P4: 9, P5: 9, P6: 9 },
    precio_potencia: { P1: 26.51, P2: 14.83, P3: 7.94, P4: 6.21, P5: 3.41, P6: 2.13 },
    precios: { P1: 0.1852, P2: 0.1501, P3: 0.1174, P4: 0.1042, P5: 0.0961, P6: 0.0903 },
    reparto: { P1: 0.30, P2: 0.22, P3: 0.16, P4: 0.14, P5: 0.10, P6: 0.08 },
    base_kwh: 1420,
    crecimiento: 0.02,
    autoconsumo: 'sin',
    excedentes_pct: 0
  },
  {
    id_cliente: CLIENTES[2].id_cliente,
    cups: `${PREFIJO_CUPS}0000000003`,
    titular: 'Talleres Levante (demo)',
    provincia: 'Valencia',
    codigo_postal: '46010',
    peaje: '6.1TD',
    tipo_suministro: 'industria',
    comercializadora: 'Naturgy',
    potencias: { P1: 75, P2: 75, P3: 75, P4: 60, P5: 60, P6: 60 },
    precio_potencia: { P1: 21.4, P2: 11.2, P3: 6.1, P4: 4.8, P5: 2.6, P6: 1.7 },
    precios: { P1: 0.1683, P2: 0.1422, P3: 0.1121, P4: 0.1011, P5: 0.0932, P6: 0.0878 },
    reparto: { P1: 0.24, P2: 0.20, P3: 0.16, P4: 0.14, P5: 0.14, P6: 0.12 },
    base_kwh: 9600,
    crecimiento: 0.04,
    autoconsumo: 'sin',
    excedentes_pct: 0
  }
]

// Consumo estacional: dos picos (enero y julio), mínimos en mayo y octubre.
const ESTACIONAL = [1.18, 1.10, 0.98, 0.88, 0.82, 0.86, 0.96, 0.94, 0.84, 0.92, 1.08, 1.20]

// Anomalías inyectadas y meses especiales.
const ANOMALIAS = [
  { cups: SUMINISTROS[0].cups, mes: '2026-03', factor: 1.45, nota: 'salto de consumo en marzo 2026' },
  { cups: SUMINISTROS[1].cups, mes: '2025-08', factor: 1.38, nota: 'avería de frío en agosto 2025' }
]
const ESTIMADAS = [{ cups: SUMINISTROS[1].cups, mes: '2026-02' }]
const HUECOS = [{ cups: SUMINISTROS[2].cups, mes: '2026-01' }]

const DESDE = '2024-01'
const HASTA = '2026-10'

// ------------------------------------------------------------------ fechas ---
function meses(desde, hasta) {
  const [a, m] = desde.split('-').map(Number)
  const [b, n] = hasta.split('-').map(Number)
  const lista = []
  let año = a
  let mes = m
  while (año < b || (año === b && mes <= n)) {
    lista.push(`${año}-${String(mes).padStart(2, '0')}`)
    mes += 1
    if (mes > 12) { mes = 1; año += 1 }
  }
  return lista
}

const finDeMes = (clave) => {
  const [a, m] = clave.split('-').map(Number)
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10)
}

// --------------------------------------------------------------- generador ---
function generarFactura(suministro, mesClave, indice, aleatorio) {
  const [año] = mesClave.split('-').map(Number)
  const mesNum = Number(mesClave.split('-')[1])
  const cupos = meses(DESDE, mesClave).length - 1

  // Consumo: base × estacionalidad × crecimiento anual × ruido ±6 %
  let kwh = suministro.base_kwh *
    ESTACIONAL[mesNum - 1] *
    (1 + suministro.crecimiento) ** (año - 2024) *
    (0.94 + aleatorio() * 0.12)

  const anomalia = ANOMALIAS.find((x) => x.cups === suministro.cups && x.mes === mesClave)
  if (anomalia) kwh *= anomalia.factor

  const total = r2(kwh)

  // Reparto por periodo: proporciones fijas + ruido pequeño, y la última
  // columna absorbe el redondeo para que la suma cuadre al céntimo.
  const periodos = Object.keys(suministro.reparto)
  const consumos = {}
  let acumulado = 0
  periodos.forEach((p, i) => {
    if (i === periodos.length - 1) {
      consumos[p] = r2(total - acumulado)
    } else {
      const bruto = r2(total * suministro.reparto[p] * (0.97 + aleatorio() * 0.06))
      consumos[p] = bruto
      acumulado += bruto
    }
  })

  const dias = suministro.peaje === '2.0TD'
    ? new Date(Date.UTC(año, mesNum, 0)).getUTCDate()
    : new Date(Date.UTC(año, mesNum, 0)).getUTCDate()

  // Economía de la factura, con el mismo orden que pinta la analítica.
  let energia = 0
  let potencia = 0
  for (const p of periodos) {
    energia += consumos[p] * suministro.precios[p]
    potencia += (suministro.potencias[p] || 0) * (suministro.precio_potencia[p] || 0) * (dias / 365)
  }
  energia = r2(energia)
  potencia = r2(potencia)

  const peajes = r2(total * 0.028)
  const alquiler = suministro.peaje === '2.0TD' ? 0.81 : 0
  const excedentesKwh = suministro.excedentes_pct > 0
    ? r2(total * suministro.excedentes_pct * (0.8 + aleatorio() * 0.4))
    : 0
  const excedentesEur = r2(excedentesKwh * 0.07)

  const impuesto = r2((potencia + energia) * 0.0511)
  const subtotal = r2(potencia + energia + peajes + alquiler - excedentesEur)
  const iva = r2((subtotal + impuesto) * 0.21)
  const importe = r2(subtotal + impuesto + iva)

  const maximas = {}
  for (const p of periodos) {
    if (!suministro.potencias[p]) continue
    maximas[p] = r2(suministro.potencias[p] * (0.72 + aleatorio() * 0.2))
  }

  const estimada = ESTIMADAS.some((x) => x.cups === suministro.cups && x.mes === mesClave)

  return {
    id_cliente: suministro.id_cliente,
    num_factura: `SEED-${suministro.cups.slice(-3)}-${mesClave.replace('-', '')}`,
    fecha_emision: finDeMes(mesClave),
    periodo_inicio: `${mesClave}-01`,
    periodo_fin: finDeMes(mesClave),
    titular: suministro.titular,
    nif: 'B00000000',
    cups: suministro.cups,
    direccion_suministro: `${suministro.codigo_postal} ${suministro.provincia} (demo)`,
    comercializadora: suministro.comercializadora,
    tipo_contrato: suministro.tipo_suministro,
    peaje_acceso: suministro.peaje,
    consumo_total_kwh: total,
    importe_total_eur: importe,
    estado_extraccion: indice % 17 === 0 ? 'revisión' : 'ok',
    confianza: indice % 17 === 0 ? 0.72 : 1,
    metodo_extraccion: indice % 17 === 0 ? 'mixto' : 'regla',
    metodos_extraccion: { origen: 'seed', campos: 'todos' },
    lineas: [],
    activo: true,
    // Migración 11: campos de energía
    id_contrato: `SEED-${suministro.cups.slice(-3)}`,
    codigo_postal: suministro.codigo_postal,
    provincia: suministro.provincia,
    tipo_suministro: suministro.tipo_suministro,
    potencias_contratadas: suministro.potencias,
    potencias_maximas: maximas,
    precio_potencia: suministro.precio_potencia,
    consumos_periodo: consumos,
    precios_periodo: suministro.precios,
    autoconsumo: suministro.autoconsumo,
    excedentes_kwh: excedentesKwh,
    excedentes_eur: excedentesEur,
    peajes_cargos_eur: peajes,
    alquiler_contador_eur: alquiler,
    impuesto_electrico_eur: impuesto,
    iva_eur: iva,
    otros_servicios_eur: 0,
    bono_social: false,
    dias_facturados: dias,
    tipo_lectura: estimada ? 'estimada' : 'real'
  }
}

function generarTodo() {
  const aleatorio = prng(20261114)
  const facturas = []
  const listaMeses = meses(DESDE, HASTA)
  let indice = 0

  for (const suministro of SUMINISTROS) {
    for (const mesClave of listaMeses) {
      if (HUECOS.some((x) => x.cups === suministro.cups && x.mes === mesClave)) continue
      const factura = generarFactura(suministro, mesClave, indice++, aleatorio)
      // Una baja lógica, para que los filtros de "activo" tengan algo que filtrar.
      if (suministro.cups === SUMINISTROS[2].cups && mesClave === '2025-04') factura.activo = false
      facturas.push(factura)
    }
  }
  return facturas
}

// -------------------------------------------------------------- validación ---
/**
 * Recalcula la factura desde sus propios conceptos, con la misma fórmula del
 * motor de coste (potencia + energía − excedentes + alquiler → 5,11 % → 21 %).
 * Si el desglose no cuadra, la analítica pintaría una dona que miente.
 */
function validar(facturas) {
  const errores = []
  // Un céntimo de deriva entre conceptos es normal en una factura real (cada
  // línea se redondea por su cuenta); lo que no se admite es un descuadre mayor.
  const cerca = (a, b, tolerancia = 0.03) => Math.abs(a - b) <= tolerancia

  for (const f of facturas) {
    const sumaPeriodos = Object.values(f.consumos_periodo).reduce((t, v) => t + v, 0)
    if (!cerca(sumaPeriodos, f.consumo_total_kwh)) {
      errores.push(`${f.num_factura}: periodos ${r2(sumaPeriodos)} ≠ total ${f.consumo_total_kwh}`)
    }

    let energia = 0
    let potencia = 0
    for (const [p, kwh] of Object.entries(f.consumos_periodo)) {
      energia += kwh * (f.precios_periodo[p] || 0)
      potencia += (f.potencias_contratadas[p] || 0) * (f.precio_potencia[p] || 0) * (f.dias_facturados / 365)
    }

    const subtotal = r2(potencia + energia + f.peajes_cargos_eur + f.alquiler_contador_eur - f.excedentes_eur)
    const impuesto = r2((r2(potencia) + r2(energia)) * 0.0511)
    const iva = r2((subtotal + impuesto) * 0.21)
    const importe = r2(subtotal + impuesto + iva)

    if (!cerca(impuesto, f.impuesto_electrico_eur)) errores.push(`${f.num_factura}: impuesto ${impuesto} ≠ ${f.impuesto_electrico_eur}`)
    if (!cerca(iva, f.iva_eur)) errores.push(`${f.num_factura}: IVA ${iva} ≠ ${f.iva_eur}`)
    if (!cerca(importe, f.importe_total_eur)) errores.push(`${f.num_factura}: total ${importe} ≠ ${f.importe_total_eur}`)
    if (!(f.importe_total_eur > 0)) errores.push(`${f.num_factura}: importe no positivo`)
    if (!f.cups || !f.periodo_inicio) errores.push(`${f.num_factura}: faltan claves`)
  }
  return errores
}

function resumen(facturas) {
  const porCups = new Map()
  for (const f of facturas) {
    const clave = f.cups
    if (!porCups.has(clave)) porCups.set(clave, { facturas: 0, kwh: 0, eur: 0, meses: [] })
    const acc = porCups.get(clave)
    acc.facturas += 1
    acc.kwh += f.consumo_total_kwh
    acc.eur += f.importe_total_eur
    acc.meses.push(f.periodo_inicio)
  }
  console.log(`\nFacturas generadas: ${facturas.length}`)
  for (const [cups, acc] of porCups) {
    console.log(`  ${cups}  ${acc.facturas} facturas · ${r2(acc.kwh)} kWh · ${r2(acc.eur)} € · ${acc.meses[0]}…${acc.meses.at(-1)}`)
  }
  console.log('\nCasos especiales incluidos:')
  console.log('  · anomalía +45 % en marzo 2026 (hogar) y +38 % en agosto 2025 (pyme)')
  console.log('  · lectura estimada en febrero 2026 (pyme)')
  console.log('  · hueco de enero 2026 (industria) y una factura dada de baja')
  console.log('  · facturas en estado "revisión" cada 17 filas')
}

// --------------------------------------------------------------------- main ---
async function main() {
  const args = process.argv.slice(2)
  const aplicar = args.includes('--aplicar')
  const limpiar = args.includes('--limpiar')

  if (limpiar || aplicar) {
    const borradas = await postgrest('DELETE', `facturas?cups=like.${PREFIJO_CUPS}*`, null, 'return=representation')
    console.log(`Facturas SEED borradas: ${Array.isArray(borradas) ? borradas.length : 0}`)
    await postgrest('DELETE', `clientes?empresa=like.${encodeURIComponent(MARCA_CLIENTE)}*`, null, 'return=representation')
    console.log('Clientes DEMO borrados')
    if (limpiar) return
  }

  const facturas = generarTodo()
  const errores = validar(facturas)
  resumen(facturas)

  if (errores.length) {
    console.error(`\n${errores.length} incoherencia(s):`)
    errores.slice(0, 10).forEach((e) => console.error('  ·', e))
    process.exitCode = 1
    return
  }
  console.log('\nValidación: reparto por periodo, potencias e importes coherentes.')

  if (!aplicar) {
    console.log('\nSimulación (no se ha escrito nada). Primera factura generada:')
    console.log(JSON.stringify(facturas[0], null, 2).split('\n').slice(0, 40).join('\n'))
    console.log('\nPara escribir en la base de datos: node scripts/seed-dev.js --aplicar')
    return
  }

  await postgrest('POST', 'clientes', CLIENTES, 'resolution=merge-duplicates,return=minimal')
  for (let i = 0; i < facturas.length; i += 50) {
    await postgrest('POST', 'facturas', facturas.slice(i, i + 50), 'return=minimal')
  }
  console.log(`\nInsertadas ${facturas.length} facturas de 3 suministros.`)
}

main().catch((error) => {
  console.error('Error:', error.message)
  process.exitCode = 1
})
