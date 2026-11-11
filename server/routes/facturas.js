import express from 'express'
import multer from 'multer'
import { getSupabaseClient } from '../lib/supabase.js'
import { extractTextFromPdf } from '../lib/pdf.js'
import { hybridExtract } from '../lib/llm.js'
import { config } from '../config.js'
import { createHistorial } from '../lib/supabase.js'

const router = express.Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.pdf.maxSize },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true)
    } else {
      cb(new Error('Solo se permiten archivos PDF'), false)
    }
  }
})

function generateId() {
  return crypto.randomUUID().replace(/-/g, '')
}

router.post('/upload', upload.single('pdf'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se ha subido ningún archivo' })
    }
    
    const pdfBuffer = req.file.buffer
    const { text } = await extractTextFromPdf(pdfBuffer)
    
    if (!text || text.trim().length < 50) {
      return res.status(400).json({ error: 'No se pudo extraer texto suficiente del PDF' })
    }
    
    const extraction = await hybridExtract(text)
    
    const facturaData = {
      id_factura: generateId(),
      ...extraction.data,
      estado_extraccion: extraction.estado,
      confianza: extraction.confianza,
      metodo_extraccion: extraction.metodo_extraccion,
      metodos_extraccion: extraction.methods,
      lineas: extraction.data.lineas || [],
      ruta_pdf: `data:application/pdf;base64,${pdfBuffer.toString('base64')}`
    }
    
    const supabase = getSupabaseClient(true)
    const { data, error } = await supabase
      .from('facturas')
      .insert(facturaData)
      .select()
      .single()
    
    if (error) {
      console.error('Supabase insert error:', error)
      return res.status(500).json({ error: 'Error guardando en base de datos' })
    }
    
    // Registrar en historial
    await createHistorial({
      id_factura: data.id_factura,
      id_usuario: req.headers['x-user-id'] || null,
      accion: 'procesar',
      descripcion: `Factura procesada automáticamente (método: ${extraction.metodo_extraccion})`,
      ip: req.ip,
      user_agent: req.headers['user-agent']
    })
    
    res.json({ data })
  } catch (error) {
    next(error)
  }
})

router.get('/', async (req, res, next) => {
  try {
    const supabase = getSupabaseClient()
    const { comercializadora, estado, fecha_desde, fecha_hasta, limit = 100, offset = 0 } = req.query
    
    let query = supabase
      .from('facturas')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
    
    if (comercializadora) query = query.eq('comercializadora', comercializadora)
    if (estado) query = query.eq('estado_extraccion', estado)
    if (fecha_desde) query = query.gte('fecha_emision', fecha_desde)
    if (fecha_hasta) query = query.lte('fecha_emision', fecha_hasta)
    
    const { data, error, count } = await query
    
    if (error) throw error
    
    res.json({ data, total: count, limit: parseInt(limit), offset: parseInt(offset) })
  } catch (error) {
    next(error)
  }
})

router.get('/metricas', async (req, res, next) => {
  try {
    const supabase = getSupabaseClient()
    
    const { data: facturas, error } = await supabase
      .from('facturas')
      .select('estado_extraccion, metodo_extraccion, importe_total_eur')
    
    if (error) throw error
    
    const total = facturas.length
    const ok = facturas.filter(f => f.estado_extraccion === 'ok').length
    const regla = facturas.filter(f => f.metodo_extraccion === 'regla').length
    const importeTotal = facturas.reduce((sum, f) => sum + (f.importe_total_eur || 0), 0)
    
    res.json({
      data: {
        total_facturas: total,
        extraccion_ok: ok,
        porcentaje_ok: total > 0 ? Math.round((ok / total) * 100) : 0,
        solo_reglas: regla,
        porcentaje_reglas: total > 0 ? Math.round((regla / total) * 100) : 0,
        importe_total_eur: importeTotal
      }
    })
  } catch (error) {
    next(error)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('facturas')
      .select('*')
      .eq('id_factura', req.params.id)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Factura no encontrada' })
      }
      throw error
    }
    
    res.json({ data })
  } catch (error) {
    next(error)
  }
})

router.patch('/:id', async (req, res, next) => {
  try {
    const supabase = getSupabaseClient(true)
    const updates = { ...req.body, updated_at: new Date().toISOString() }
    
    delete updates.id_factura
    delete updates.created_at
    
    const { data, error } = await supabase
      .from('facturas')
      .update(updates)
      .eq('id_factura', req.params.id)
      .select()
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Factura no encontrada' })
      }
      throw error
    }
    
    // Registrar en historial
    const camposModificados = Object.keys(req.body).filter(k => !['id_factura', 'created_at', 'updated_at'].includes(k))
    await createHistorial({
      id_factura: data.id_factura,
      id_usuario: req.headers['x-user-id'] || null,
      accion: 'corregir',
      campo_modificado: camposModificados.join(', '),
      valor_nuevo: req.body,
      descripcion: `Corrección manual de campos: ${camposModificados.join(', ')}`,
      ip: req.ip,
      user_agent: req.headers['user-agent']
    })
    
    res.json({ data })
  } catch (error) {
    next(error)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const supabase = getSupabaseClient(true)
    const id_factura = req.params.id
    
    // Obtener datos antes de borrar para el historial
    const { data: facturaAntigua } = await supabase
      .from('facturas')
      .select('*')
      .eq('id_factura', id_factura)
      .single()
    
    const { error } = await supabase
      .from('facturas')
      .delete()
      .eq('id_factura', id_factura)
    
    if (error) throw error
    
    // Registrar en historial
    if (facturaAntigua) {
      await createHistorial({
        id_factura,
        id_usuario: req.headers['x-user-id'] || null,
        accion: 'eliminar',
        valor_anterior: facturaAntigua,
        descripcion: `Factura eliminada: ${facturaAntigua.num_factura || 'sin número'} - ${facturaAntigua.comercializadora || 'sin comercializadora'}`,
        ip: req.ip,
        user_agent: req.headers['user-agent']
      })
    }
    
    res.json({ success: true })
  } catch (error) {
    next(error)
  }
})

export { router as facturasRouter }