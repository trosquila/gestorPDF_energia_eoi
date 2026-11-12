import express from 'express'
import { getSupabaseClient } from '../lib/supabase.js'
import { costeDeOferta } from '../lib/coste.js'

const router = express.Router()

/**
 * Filtros comunes a todas las consultas de analítica.
 * Se aceptan desde la URL: fecha_desde, fecha_hasta, comercializadora,
 * provincia, id_cliente y estado.
 */
function filtrosDe(req) {
  const { fecha_desde, fecha_hasta, comercializadora, provincia, id_cliente, estado } = req.query
  return {
    fecha_desde: fecha_desde || null,
    fecha_hasta: fecha_hasta || null,
    comercializadora: comercializadora || null,
    provincia: provincia || null,
    id_cliente: id_cliente || null,
    estado: estado || null
  }
}

function aplicarFiltros(query, filtros) {
  if (filtros.fecha_desde) query = query.gte('fecha_emision', filtros.fecha_desde)
  if (filtros.fecha_hasta) query = query.lte('fecha_emision', filtros.fecha_hasta)
  // ilike: "Endesa" y "endesa" son la misma comercializadora
  if (filtros.comercializadora) query = query.ilike('comercializadora', filtros.comercializadora)
  if (filtros.provincia) query = query.eq('provincia', filtros.provincia)
  if (filtros.id_cliente) query = query.eq('id_cliente', filtros.id_cliente)
  if (filtros.estado) query = query.eq('estado_extraccion', filtros.estado)
  return query
}

async function facturasFiltradas(filtros) {
  const supabase = getSupabaseClient(true)
  let query = supabase.from('facturas').select('*')
  query = aplicarFiltros(query, filtros)
  const { data, error } = await query.order('fecha_emision', { ascending: true })
  if (error) throw error
  return (data || []).filter((f) => f.activo !== false)
}

function mesDe(fecha) {
  if (!fecha) return null
  return String(fecha).slice(0, 7)
}

function redondear(valor, decimales = 2) {
  return Number(Number(valor).toFixed(decimales))
}

/** Opciones disponibles para los selectores de filtro (sin filtrar). */
async function opcionesDeFiltro() {
  const supabase = getSupabaseClient(true)
  const [{ data: facturas }, { data: clientes }] = await Promise.all([
    supabase.from('facturas').select('comercializadora, provincia, activo'),
    supabase.from('clientes').select('id_cliente, empresa, nombre').eq('activo', true)
  ])

  const activas = (facturas || []).filter((f) => f.activo !== false)
  const vistasCom = new Map()
  for (const f of activas) {
    const nombre = (f.comercializadora || '').trim()
    if (!nombre) continue
    if (!vistasCom.has(nombre.toLowerCase())) vistasCom.set(nombre.toLowerCase(), nombre)
  }
  const comercializadoras = [...vistasCom.values()].sort((a, b) => a.localeCompare(b, 'es'))
  const provincias = [...new Set(activas.map((f) => f.provincia).filter(Boolean))].sort()

  return {
    comercializadoras,
    provincias,
    clientes: (clientes || [])
      .map((c) => ({ id_cliente: c.id_cliente, nombre: c.empresa || c.nombre }))
      .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'))
  }
}

/**
 * Avisos accionables: cosas que el usuario puede corregir hoy.
 * (La antigua "alerta de €/kWh atípico" exigía varias facturas del mismo CUPS
 * y con estos datos no se disparaba nunca.)
 */
function calcularAvisos(facturas) {
  const avisos = []

  const agrupar = (predicado, tipo, titulo, detalle) => {
    const afectadas = facturas.filter(predicado)
    if (afectadas.length === 0) return
    avisos.push({
      tipo,
      titulo,
      detalle,
      total: afectadas.length,
      facturas: afectadas.slice(0, 20).map((f) => ({
        id_factura: f.id_factura,
        num_factura: f.num_factura,
        importe: f.importe_total_eur,
        fecha: f.fecha_emision
      }))
    })
  }

  agrupar(
    (f) => !f.id_cliente,
    'sin_cliente',
    'Facturas sin cliente asignado',
    'Sin cliente no se pueden agrupar por empresa ni entrar en el comparador.'
  )
  agrupar(
    (f) => !f.consumos_periodo || Object.keys(f.consumos_periodo).length === 0,
    'sin_periodos',
    'Facturas sin consumo por periodo',
    'Sin el desglose P1/P2/P3 no se puede comparar ofertas ni repartir punta-valle.'
  )
  agrupar(
    (f) => !f.potencias_contratadas || Object.keys(f.potencias_contratadas).length === 0,
    'sin_potencias',
    'Facturas sin potencia contratada',
    'Hace falta para estimar el término de potencia y detectar sobrecontratación.'
  )
  agrupar(
    (f) => f.importe_total_eur && !f.impuesto_electrico_eur && !f.iva_eur,
    'sin_desglose',
    'Facturas sin desglose de impuestos',
    'Con el desglose se audita el total y se separa lo regulado de lo comercial.'
  )
  agrupar(
    (f) => !f.ruta_pdf,
    'sin_archivo',
    'Facturas sin documento guardado',
    'No se puede revisar el original para comprobar un dato dudoso.'
  )
  agrupar(
    (f) => !f.comercializadora,
    'sin_comercializadora',
    'Facturas sin comercializadora',
    'Imprescindible para agrupar el gasto y comparar ofertas.'
  )

  return avisos.sort((a, b) => b.total - a.total)
}

// === Resumen analítico con filtros ===
router.get('/', async (req, res, next) => {
  try {
    const filtros = filtrosDe(req)
    const [facturas, opciones] = await Promise.all([
      facturasFiltradas(filtros),
      opcionesDeFiltro()
    ])

    let kwh = 0
    let importe = 0
    let kwhConImporte = 0
    let importeConKwh = 0

    const meses = new Map()
    const reparto = { potencia: 0, energia: 0, impuestos: 0, alquiler: 0, otros: 0, facturas_con_desglose: 0 }
    const porComercializadora = new Map()
    const porProvincia = new Map()
    const porEstado = new Map()

    for (const f of facturas) {
      const consumo = Number(f.consumo_total_kwh) || 0
      const total = Number(f.importe_total_eur) || 0

      kwh += consumo
      importe += total
      if (consumo > 0 && total > 0) {
        kwhConImporte += consumo
        importeConKwh += total
      }

      const mes = mesDe(f.fecha_emision)
      if (mes) {
        if (!meses.has(mes)) meses.set(mes, { mes, kwh: 0, importe: 0, facturas: 0 })
        const entrada = meses.get(mes)
        entrada.kwh += consumo
        entrada.importe += total
        entrada.facturas++
      }

      const tieneDesglose = Boolean(f.peajes_cargos_eur || f.impuesto_electrico_eur || f.iva_eur || f.alquiler_contador_eur)
      if (tieneDesglose) {
        reparto.facturas_con_desglose++
        reparto.potencia += Number(f.peajes_cargos_eur) || 0
        reparto.impuestos += (Number(f.impuesto_electrico_eur) || 0) + (Number(f.iva_eur) || 0)
        reparto.alquiler += Number(f.alquiler_contador_eur) || 0
        reparto.otros += Number(f.otros_servicios_eur) || 0
        reparto.energia += Math.max(0, total
          - (Number(f.peajes_cargos_eur) || 0)
          - (Number(f.impuesto_electrico_eur) || 0)
          - (Number(f.iva_eur) || 0)
          - (Number(f.alquiler_contador_eur) || 0)
          - (Number(f.otros_servicios_eur) || 0))
      }

      const com = (f.comercializadora || 'Sin comercializadora').trim()
      const claveCom = com.toLowerCase()
      if (!porComercializadora.has(claveCom)) {
        porComercializadora.set(claveCom, { nombre: com, kwh: 0, importe: 0, facturas: 0 })
      }
      const c = porComercializadora.get(claveCom)
      c.kwh += consumo
      c.importe += total
      c.facturas++

      const provincia = f.provincia || 'Sin provincia'
      if (!porProvincia.has(provincia)) porProvincia.set(provincia, { nombre: provincia, kwh: 0, importe: 0, facturas: 0 })
      const p = porProvincia.get(provincia)
      p.kwh += consumo
      p.importe += total
      p.facturas++

      const estado = f.estado_extraccion || 'sin estado'
      porEstado.set(estado, (porEstado.get(estado) || 0) + 1)
    }

    const serieMensual = [...meses.values()]
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .map((m) => ({
        mes: m.mes,
        kwh: redondear(m.kwh),
        importe: redondear(m.importe),
        facturas: m.facturas,
        precio_kwh: m.kwh > 0 ? redondear(m.importe / m.kwh, 4) : null
      }))

    const aLista = (mapa) => [...mapa.values()]
      .map((x) => ({
        ...x,
        kwh: redondear(x.kwh),
        importe: redondear(x.importe),
        precio_kwh: x.kwh > 0 ? redondear(x.importe / x.kwh, 4) : null
      }))
      .sort((a, b) => b.importe - a.importe)

    const conDesglose = reparto.facturas_con_desglose || 0
    const repartoMedio = conDesglose > 0
      ? {
          facturas_con_desglose: conDesglose,
          potencia: redondear(reparto.potencia / conDesglose),
          energia: redondear(reparto.energia / conDesglose),
          impuestos: redondear(reparto.impuestos / conDesglose),
          alquiler: redondear(reparto.alquiler / conDesglose),
          otros: redondear(reparto.otros / conDesglose),
          total_medio: redondear((reparto.potencia + reparto.energia + reparto.impuestos + reparto.alquiler + reparto.otros) / conDesglose)
        }
      : null

    res.json({
      data: {
        filtros,
        opciones,
        kpis: {
          facturas: facturas.length,
          kwh: redondear(kwh),
          importe: redondear(importe),
          precio_medio_eur_kwh: kwhConImporte > 0 ? redondear(importeConKwh / kwhConImporte, 4) : null,
          meses: serieMensual.length,
          por_estado: Object.fromEntries(porEstado)
        },
        serie_mensual: serieMensual,
        reparto_medio: repartoMedio,
        por_comercializadora: aLista(porComercializadora),
        por_provincia: aLista(porProvincia),
        avisos: calcularAvisos(facturas)
      }
    })
  } catch (error) {
    next(error)
  }
})

// === Analítica de energía: periodos, sobrecontratación y ahorro potencial ===
router.get('/energia', async (req, res, next) => {
  try {
    const filtros = filtrosDe(req)
    const activas = await facturasFiltradas(filtros)

    const consumoPorPeriodo = {}
    const sobrecontratacion = []

    let importeConConsumo = 0
    let consumoConImporte = 0
    let consumoTotalKwh = 0
    let conPeriodos = 0
    let conPotencias = 0
    let conMaximas = 0
    let conExcedentes = 0
    let conProvincia = 0

    const preciosPotencia = []

    for (const f of activas) {
      const consumos = f.consumos_periodo || {}
      if (Object.keys(consumos).length > 0) {
        conPeriodos++
        for (const [periodo, kwh] of Object.entries(consumos)) {
          const valor = Number(kwh)
          if (!Number.isFinite(valor)) continue
          if (!consumoPorPeriodo[periodo]) consumoPorPeriodo[periodo] = { kwh: 0, facturas: 0 }
          consumoPorPeriodo[periodo].kwh += valor
          consumoPorPeriodo[periodo].facturas++
        }
      }

      consumoTotalKwh += Number(f.consumo_total_kwh) || 0

      if (Number(f.consumo_total_kwh) > 0 && f.importe_total_eur) {
        consumoConImporte += Number(f.consumo_total_kwh)
        importeConConsumo += Number(f.importe_total_eur)
      }

      if (Object.keys(f.potencias_contratadas || {}).length > 0) conPotencias++
      if (Object.keys(f.potencias_maximas || {}).length > 0) conMaximas++
      if (f.excedentes_kwh) conExcedentes++
      if (f.provincia) conProvincia++

      for (const [periodo, valor] of Object.entries(f.precio_potencia || {})) {
        const n = Number(valor)
        if (Number.isFinite(n) && n > 0) preciosPotencia.push({ periodo, valor: n })
      }

      const contratadas = f.potencias_contratadas || {}
      const maximas = f.potencias_maximas || {}
      for (const periodo of Object.keys(contratadas)) {
        const contratada = Number(contratadas[periodo])
        const maxima = Number(maximas[periodo])
        if (!Number.isFinite(contratada) || !Number.isFinite(maxima) || maxima <= 0) continue
        if (contratada <= maxima * 1.35) continue

        const exceso = redondear(contratada - maxima)
        const precioKw = Number(f.precio_potencia?.[periodo]) || mediaPrecioPotencia(preciosPotencia, periodo)

        sobrecontratacion.push({
          id_factura: f.id_factura,
          num_factura: f.num_factura,
          comercializadora: f.comercializadora,
          peaje_acceso: f.peaje_acceso,
          periodo,
          contratada,
          maxima,
          exceso_kw: exceso,
          precio_kw_anio: precioKw ? redondear(precioKw) : null,
          ahorro_anual: precioKw ? redondear(exceso * precioKw * 1.0511 * 1.21) : null
        })
      }
    }

    const totalPeriodos = Object.values(consumoPorPeriodo).reduce((t, p) => t + p.kwh, 0)
    const consumoPeriodos = Object.entries(consumoPorPeriodo)
      .map(([periodo, datos]) => ({
        periodo,
        kwh: redondear(datos.kwh),
        facturas: datos.facturas,
        porcentaje: totalPeriodos > 0 ? redondear((datos.kwh / totalPeriodos) * 100, 1) : 0
      }))
      .sort((a, b) => a.periodo.localeCompare(b.periodo))

    let potencial = null
    try {
      const supabase = getSupabaseClient(true)
      const { data: ofertas, error: errorOfertas } = await supabase
        .from('ofertas')
        .select('*')
        .eq('activo', true)

      if (!errorOfertas && ofertas?.length > 0) {
        const comparaciones = []

        for (const f of activas) {
          const consumos = Object.keys(f.consumos_periodo || {}).length > 0 ? f.consumos_periodo : null
          if (!consumos || !f.importe_total_eur) continue
          const dias = Number(f.dias_facturados) || 30

          const perfil = {
            potencias: f.potencias_contratadas || {},
            consumos,
            excedentes_kwh: Number(f.excedentes_kwh) || 0,
            dias
          }

          const costes = ofertas
            .filter((o) => !Array.isArray(o.peajes) || o.peajes.length === 0
              || o.peajes.some((p) => String(p).toUpperCase() === String(f.peaje_acceso || '2.0TD').toUpperCase()))
            .map((o) => ({ oferta: o, coste: costeDeOferta(o, perfil) }))
            .sort((a, b) => a.coste.total - b.coste.total)

          if (costes.length === 0) continue
          const mejor = costes[0]
          comparaciones.push({
            id_factura: f.id_factura,
            num_factura: f.num_factura,
            comercializadora_actual: f.comercializadora,
            importe_actual: Number(f.importe_total_eur),
            dias,
            mejor_oferta: `${mejor.oferta.comercializadora} · ${mejor.oferta.nombre}`,
            coste_mejor_oferta: mejor.coste.total,
            ahorro: redondear(Number(f.importe_total_eur) - mejor.coste.total)
          })
        }

        if (comparaciones.length > 0) {
          const ahorroTotal = comparaciones.reduce((t, c) => t + Math.max(0, c.ahorro), 0)
          potencial = {
            facturas_comparadas: comparaciones.length,
            ahorro_total: redondear(ahorroTotal),
            detalle: comparaciones.sort((a, b) => b.ahorro - a.ahorro).slice(0, 10)
          }
        }
      }
    } catch (e) {
      potencial = null
    }

    res.json({
      data: {
        facturas_analizadas: activas.length,
        consumo_total_kwh: redondear(consumoTotalKwh),
        precio_medio_eur_kwh: consumoConImporte > 0 ? redondear(importeConConsumo / consumoConImporte, 4) : null,
        consumo_por_periodo: consumoPeriodos,
        sobrecontratacion: sobrecontratacion.sort((a, b) => (b.ahorro_anual || 0) - (a.ahorro_anual || 0)),
        ahorro_potencial: potencial,
        cobertura: {
          con_periodos: conPeriodos,
          con_potencias: conPotencias,
          con_maximas: conMaximas,
          con_excedentes: conExcedentes,
          con_provincia: conProvincia,
          porcentaje_periodos: activas.length
            ? Number(((conPeriodos / activas.length) * 100).toFixed(0))
            : 0
        }
      }
    })
  } catch (error) {
    next(error)
  }
})

/** Precio de potencia de referencia: media de las facturas, o null si no hay. */
function mediaPrecioPotencia(lista, periodo) {
  const delPeriodo = lista.filter((p) => p.periodo === periodo).map((p) => p.valor)
  if (delPeriodo.length === 0) return null
  return delPeriodo.reduce((t, v) => t + v, 0) / delPeriodo.length
}

export { router as analiticaRouter }
