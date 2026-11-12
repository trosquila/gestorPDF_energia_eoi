import express from 'express'
import { getSupabaseClient } from '../lib/supabase.js'
import { costeDeOferta } from '../lib/coste.js'

const router = express.Router()

router.get('/', async (req, res, next) => {
  try {
    const supabase = getSupabaseClient()
    const { cups, comercializadora, fecha_desde, fecha_hasta } = req.query
    
    let query = supabase.from('facturas').select('*')
    
    if (cups) query = query.eq('cups', cups)
    if (comercializadora) query = query.eq('comercializadora', comercializadora)
    if (fecha_desde) query = query.gte('fecha_emision', fecha_desde)
    if (fecha_hasta) query = query.lte('fecha_emision', fecha_hasta)
    
    query = query.order('fecha_emision', { ascending: true })
    
    const { data: facturas, error } = await query
    
    if (error) throw error
    
    const consumoPorCups = {}
    const rankingSuministros = {}
    const alertas = []
    
    facturas.forEach(f => {
      if (f.cups && f.consumo_total_kwh && f.fecha_emision) {
        if (!consumoPorCups[f.cups]) consumoPorCups[f.cups] = []
        consumoPorCups[f.cups].push({
          fecha: f.fecha_emision,
          consumo: f.consumo_total_kwh,
          importe: f.importe_total_eur,
          comercializadora: f.comercializadora
        })
      }
      
      if (f.cups && f.importe_total_eur) {
        if (!rankingSuministros[f.cups]) {
          rankingSuministros[f.cups] = {
            cups: f.cups,
            comercializadora: f.comercializadora,
            total_importe: 0,
            facturas_count: 0
          }
        }
        rankingSuministros[f.cups].total_importe += f.importe_total_eur
        rankingSuministros[f.cups].facturas_count++
      }
    })
    
    Object.entries(consumoPorCups).forEach(([cups, items]) => {
      if (items.length < 2) return
      
      const importesKwh = items
        .filter(i => i.consumo > 0 && i.importe)
        .map(i => i.importe / i.consumo)
      
      if (importesKwh.length < 2) return
      
      const media = importesKwh.reduce((a, b) => a + b, 0) / importesKwh.length
      const std = Math.sqrt(
        importesKwh.reduce((sum, v) => sum + Math.pow(v - media, 2), 0) / importesKwh.length
      )
      
      items.forEach(item => {
        if (item.consumo > 0 && item.importe) {
          const importeKwh = item.importe / item.consumo
          const desviacion = ((importeKwh - media) / media) * 100
          
          if (Math.abs(desviacion) > 30) {
            alertas.push({
              id_factura: item.fecha + '-' + cups,
              cups,
              comercializadora: item.comercializadora,
              fecha_emision: item.fecha,
              importe_kwh_factura: importeKwh,
              media_cups: media,
              desviacion,
              severidad: Math.abs(desviacion) > 50 ? 'alta' : 'media'
            })
          }
        }
      })
    })
    
    const rankingTop10 = Object.values(rankingSuministros)
      .sort((a, b) => b.total_importe - a.total_importe)
      .slice(0, 10)
    
    res.json({
      data: {
        consumo_por_cups: consumoPorCups,
        ranking_suministros: rankingTop10,
        alertas: alertas.sort((a, b) => Math.abs(b.desviacion) - Math.abs(a.desviacion)),
        total_facturas: facturas.length
      }
    })
  } catch (error) {
    next(error)
  }
})

// === Analítica de energía: periodos, sobrecontratación y ahorro potencial ===
router.get('/energia', async (req, res, next) => {
  try {
    const supabase = getSupabaseClient(true)
    const { data: facturas, error } = await supabase.from('facturas').select('*')
    if (error) throw error

    const activas = (facturas || []).filter((f) => f.activo !== false)

    const consumoPorPeriodo = {}
    const porComercializadora = {}
    const porProvincia = {}
    const sobrecontratacion = []

    let importeTotal = 0
    let consumoTotal = 0
    // Para el precio medio solo cuentan las facturas con AMBOS datos:
    // dividir el importe de todas entre el consumo de unas pocas daba 0,95 €/kWh
    let importeConConsumo = 0
    let consumoConImporte = 0
    let conPeriodos = 0
    let conPotencias = 0
    let conMaximas = 0
    let conExcedentes = 0
    let conProvincia = 0
    let sumaPotencia = 0
    let sumaEnergia = 0
    let sumaImpuestos = 0
    let sumaAlquiler = 0
    let facturasConDesglose = 0

    // Precio medio de potencia de las propias facturas (€/kW/año), si lo traen
    const preciosPotencia = []

    for (const f of activas) {
      const consumos = f.consumos_periodo || {}
      const claves = Object.keys(consumos)
      if (claves.length > 0) {
        conPeriodos++
        for (const [periodo, kwh] of Object.entries(consumos)) {
          const valor = Number(kwh)
          if (!Number.isFinite(valor)) continue
          if (!consumoPorPeriodo[periodo]) consumoPorPeriodo[periodo] = { kwh: 0, facturas: 0 }
          consumoPorPeriodo[periodo].kwh += valor
          consumoPorPeriodo[periodo].facturas++
        }
      }

      if (f.consumo_total_kwh) consumoTotal += Number(f.consumo_total_kwh)
      if (f.importe_total_eur) importeTotal += Number(f.importe_total_eur)
      if (Number(f.consumo_total_kwh) > 0 && f.importe_total_eur) {
        consumoConImporte += Number(f.consumo_total_kwh)
        importeConConsumo += Number(f.importe_total_eur)
      }

      if (f.potencias_contratadas && Object.keys(f.potencias_contratadas).length > 0) conPotencias++
      if (f.potencias_maximas && Object.keys(f.potencias_maximas).length > 0) conMaximas++
      if (f.excedentes_kwh) conExcedentes++
      if (f.provincia) conProvincia++

      if (f.peajes_cargos_eur || f.impuesto_electrico_eur || f.iva_eur || f.alquiler_contador_eur) {
        facturasConDesglose++
        sumaPotencia += Number(f.peajes_cargos_eur || 0)
        sumaEnergia += Number(f.importe_total_eur || 0) - Number(f.peajes_cargos_eur || 0)
          - Number(f.impuesto_electrico_eur || 0) - Number(f.iva_eur || 0) - Number(f.alquiler_contador_eur || 0)
        sumaImpuestos += Number(f.impuesto_electrico_eur || 0) + Number(f.iva_eur || 0)
        sumaAlquiler += Number(f.alquiler_contador_eur || 0)
      }

      for (const [periodo, valor] of Object.entries(f.precio_potencia || {})) {
        const n = Number(valor)
        if (Number.isFinite(n) && n > 0) preciosPotencia.push({ periodo, valor: n })
      }

      // Sobrecontratación: máxima demandada muy por debajo de la contratada
      const contratadas = f.potencias_contratadas || {}
      const maximas = f.potencias_maximas || {}
      for (const periodo of Object.keys(contratadas)) {
        const contratada = Number(contratadas[periodo])
        const maxima = Number(maximas[periodo])
        if (!Number.isFinite(contratada) || !Number.isFinite(maxima) || maxima <= 0) continue
        if (contratada <= maxima * 1.35) continue

        const exceso = Number((contratada - maxima).toFixed(2))
        // Solo se estima el ahorro si hay un precio de potencia real
        const precioKw =
          Number(f.precio_potencia?.[periodo]) ||
          mediaPrecioPotencia(preciosPotencia, periodo)

        sobrecontratacion.push({
          id_factura: f.id_factura,
          num_factura: f.num_factura,
          comercializadora: f.comercializadora,
          peaje_acceso: f.peaje_acceso,
          periodo,
          contratada,
          maxima,
          exceso_kw: exceso,
          precio_kw_anio: precioKw ? Number(precioKw.toFixed(2)) : null,
          ahorro_anual: precioKw
            ? Number((exceso * precioKw * 1.0511 * 1.21).toFixed(2))
            : null
        })
      }

      // "Endesa" y "endesa" son la misma comercializadora
      const nombreCom = (f.comercializadora || 'Sin comercializadora').trim()
      const claveCom = nombreCom.toLowerCase()
      if (!porComercializadora[claveCom]) {
        porComercializadora[claveCom] = { nombre: nombreCom, kwh: 0, importe: 0, facturas: 0 }
      }
      porComercializadora[claveCom].kwh += Number(f.consumo_total_kwh || 0)
      porComercializadora[claveCom].importe += Number(f.importe_total_eur || 0)
      porComercializadora[claveCom].facturas++

      const provincia = f.provincia || 'Sin provincia'
      if (!porProvincia[provincia]) porProvincia[provincia] = { kwh: 0, importe: 0, facturas: 0 }
      porProvincia[provincia].kwh += Number(f.consumo_total_kwh || 0)
      porProvincia[provincia].importe += Number(f.importe_total_eur || 0)
      porProvincia[provincia].facturas++
    }

    const totalPeriodos = Object.values(consumoPorPeriodo).reduce((t, p) => t + p.kwh, 0)
    const consumoPeriodos = Object.entries(consumoPorPeriodo)
      .map(([periodo, datos]) => ({
        periodo,
        kwh: Number(datos.kwh.toFixed(2)),
        facturas: datos.facturas,
        porcentaje: totalPeriodos > 0 ? Number(((datos.kwh / totalPeriodos) * 100).toFixed(1)) : 0
      }))
      .sort((a, b) => a.periodo.localeCompare(b.periodo))

    // Ahorro potencial con la mejor oferta del catálogo
    let potencial = null
    try {
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
            ahorro: Number((Number(f.importe_total_eur) - mejor.coste.total).toFixed(2))
          })
        }

        if (comparaciones.length > 0) {
          const ahorroTotal = comparaciones.reduce((t, c) => t + Math.max(0, c.ahorro), 0)
          potencial = {
            facturas_comparadas: comparaciones.length,
            ahorro_total: Number(ahorroTotal.toFixed(2)),
            detalle: comparaciones.sort((a, b) => b.ahorro - a.ahorro).slice(0, 10)
          }
        }
      }
    } catch (e) {
      // sin catálogo no hay potencial: no es un error del endpoint
      potencial = null
    }

    res.json({
      data: {
        facturas_analizadas: activas.length,
        consumo_total_kwh: Number(consumoTotal.toFixed(2)),
        importe_total_eur: Number(importeTotal.toFixed(2)),
        precio_medio_eur_kwh: consumoConImporte > 0
          ? Number((importeConConsumo / consumoConImporte).toFixed(4))
          : null,
        consumo_por_periodo: consumoPeriodos,
        sobrecontratacion: sobrecontratacion.sort((a, b) => (b.ahorro_anual || 0) - (a.ahorro_anual || 0)),
        ahorro_potencial: potencial,
        desglose_medio: facturasConDesglose > 0 ? {
          facturas_con_desglose: facturasConDesglose,
          media_potencia_peajes: Number((sumaPotencia / facturasConDesglose).toFixed(2)),
          media_energia: Number((sumaEnergia / facturasConDesglose).toFixed(2)),
          media_impuestos: Number((sumaImpuestos / facturasConDesglose).toFixed(2)),
          media_alquiler: Number((sumaAlquiler / facturasConDesglose).toFixed(2))
        } : null,
        cobertura: {
          con_periodos: conPeriodos,
          con_potencias: conPotencias,
          con_maximas: conMaximas,
          con_excedentes: conExcedentes,
          con_provincia: conProvincia,
          porcentaje_periodos: activas.length
            ? Number(((conPeriodos / activas.length) * 100).toFixed(0))
            : 0
        },
        por_comercializadora: Object.values(porComercializadora)
          .map((d) => ({ ...d, kwh: Number(d.kwh.toFixed(2)), importe: Number(d.importe.toFixed(2)) }))
          .sort((a, b) => b.importe - a.importe),
        por_provincia: Object.entries(porProvincia)
          .map(([nombre, d]) => ({ nombre, ...d, kwh: Number(d.kwh.toFixed(2)), importe: Number(d.importe.toFixed(2)) }))
          .sort((a, b) => b.importe - a.importe)
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