import express from 'express'
import { getSupabaseClient } from '../lib/supabase.js'

const router = express.Router()

const EJEMPLOS_IDSEM = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    comercializadora: 'Endesa',
    periodo: 'Ene 2024',
    descripcion: 'Factura Endesa 2.0TD - Vivienda'
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    comercializadora: 'Iberdrola',
    periodo: 'Feb 2024',
    descripcion: 'Factura Iberdrola 2.0TD - Pequeña empresa'
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    comercializadora: 'Naturgy',
    periodo: 'Mar 2024',
    descripcion: 'Factura Naturgy 2.0TD - Comunidad'
  },
  {
    id: '44444444-4444-4444-4444-444444444444',
    comercializadora: 'Repsol',
    periodo: 'Abr 2024',
    descripcion: 'Factura Repsol 2.0TD - Autónomo'
  },
  {
    id: '55555555-5555-5555-5555-555555555555',
    comercializadora: 'EDP',
    periodo: 'May 2024',
    descripcion: 'Factura EDP 2.0TD - Vivienda'
  }
]

router.get('/', async (req, res) => {
  try {
    const supabase = getSupabaseClient()
    const { data: existentes } = await supabase
      .from('facturas')
      .select('id_factura, comercializadora, fecha_emision, num_factura')
      .in('id_factura', EJEMPLOS_IDSEM.map(e => e.id))
    
    const ejemplosConEstado = EJEMPLOS_IDSEM.map(ej => {
      const existe = existentes?.find(f => f.id_factura === ej.id)
      return {
        ...ej,
        disponible: !!existe,
        factura_id: existe?.id_factura
      }
    })
    
    res.json({ data: ejemplosConEstado })
  } catch (error) {
    console.error('Error fetching ejemplos:', error)
    res.json({ data: EJEMPLOS_IDSEM })
  }
})

router.post('/seed', async (req, res, next) => {
  try {
    const supabase = getSupabaseClient(true)
    const resultados = []
    
    for (const ej of EJEMPLOS_IDSEM) {
      const facturaMock = {
        id_factura: ej.id,
        num_factura: `FAC-${ej.comercializadora.substring(0, 3).toUpperCase()}-2024-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
        fecha_emision: '2024-01-15',
        periodo_inicio: '2024-01-01',
        periodo_fin: '2024-01-31',
        titular: 'Juan Pérez García',
        nif: '12345678Z',
        cups: `ES0021${Math.floor(Math.random() * 100000000000000).toString().padStart(14, '0')}`,
        direccion_suministro: 'Calle Mayor 123, 28001 Madrid',
        comercializadora: ej.comercializadora,
        tipo_contrato: '2.0TD',
        peaje_acceso: '2.0TD',
        consumo_total_kwh: 245.50 + Math.random() * 100,
        importe_total_eur: 58.30 + Math.random() * 30,
        estado_extraccion: 'ok',
        confianza: 0.92,
        metodo_extraccion: 'regla',
        metodos_extraccion: { cups: 'regla', consumo_total_kwh: 'regla', importe_total_eur: 'regla' },
        lineas: [
          { concepto: 'potencia', periodo_tarifario: 'P1', cantidad: 4.6, precio_unitario: 0.108, importe: 14.90 },
          { concepto: 'energía', periodo_tarifario: 'P1', cantidad: 85, precio_unitario: 0.185, importe: 15.73 },
          { concepto: 'energía', periodo_tarifario: 'P2', cantidad: 95, precio_unitario: 0.142, importe: 13.49 },
          { concepto: 'energía', periodo_tarifario: 'P3', cantidad: 65, precio_unitario: 0.118, importe: 7.67 },
          { concepto: 'peajes', periodo_tarifario: null, cantidad: 245, precio_unitario: 0.012, importe: 2.94 },
          { concepto: 'cargos', periodo_tarifario: null, cantidad: 245, precio_unitario: 0.008, importe: 1.96 },
          { concepto: 'impuesto electricidad', periodo_tarifario: null, cantidad: null, precio_unitario: null, importe: 2.15 },
          { concepto: 'iva', periodo_tarifario: null, cantidad: null, precio_unitario: null, importe: 12.21 }
        ]
      }
      
      const { error } = await supabase
        .from('facturas')
        .upsert(facturaMock, { onConflict: 'id_factura' })
      
      resultados.push({ id: ej.id, comercializadora: ej.comercializadora, success: !error })
    }
    
    res.json({ data: resultados })
  } catch (error) {
    next(error)
  }
})

export { router as ejemplosRouter }