import express from 'express'
import { getSupabaseClient } from '../lib/supabase.js'

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

export { router as analiticaRouter }