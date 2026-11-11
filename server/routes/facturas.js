import express from 'express'
import multer from 'multer'
import { getSupabaseClient } from '../lib/supabase.js'
import { extractTextFromPdf } from '../lib/pdf.js'
import { extractTextFromScannedPdf } from '../lib/pdfOcr.js'
import { extractTextFromImage, validarImagen } from '../lib/ocr.js'
import { hybridExtract } from '../lib/llm.js'
import { extractWithOpenRouter, evaluarExtraccionIA } from '../lib/openrouter.js'
import { config } from '../config.js'
import { createHistorial } from '../lib/supabase.js'
import { getClienteById } from '../lib/supabase.js'
import {
  subirArchivo,
  moverArchivo,
  borrarArchivo,
  existeArchivo,
  urlFirmada,
  esRutaDeBucket,
  extensionDe,
  nombreArchivo,
  CARPETA_PENDIENTES
} from '../lib/storage.js'

const router = express.Router()

// Formatos aceptados: PDF y las imágenes que Tesseract sabe leer.
const MIMETYPES_PERMITIDOS = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/tiff',
  'image/bmp'
]

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.pdf.maxSize },
  fileFilter: (req, file, cb) => {
    if (MIMETYPES_PERMITIDOS.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Formato no admitido. Sube un PDF o una imagen (JPG, PNG, WEBP, TIFF o BMP)'), false)
    }
  }
})

function generateId() {
  return crypto.randomUUID().replace(/-/g, '')
}

// Columnas reales de la tabla 'facturas'. Todo lo que no esté aquí se descarta
// antes de escribir: la IA y el extractor por reglas devuelven campos que no
// existen (p. ej. 'potencia_contratada') y PostgREST rechaza la fila ENTERA
// con PGRST204.
const CAMPOS_FACTURA = [
  'num_factura', 'fecha_emision', 'periodo_inicio', 'periodo_fin',
  'titular', 'nif', 'cups', 'direccion_suministro', 'comercializadora',
  'tipo_contrato', 'peaje_acceso', 'consumo_total_kwh', 'importe_total_eur',
  'estado_extraccion', 'confianza', 'metodo_extraccion', 'metodos_extraccion', 'lineas'
]

const CAMPOS_NUMERICOS = ['consumo_total_kwh', 'importe_total_eur', 'confianza']

/**
 * Deja solo columnas reales y normaliza tipos.
 * @returns {{limpio: object, descartados: string[]}}
 */
function sanearCampos(datos = {}) {
  const limpio = {}
  const descartados = []

  for (const [clave, valor] of Object.entries(datos)) {
    if (!CAMPOS_FACTURA.includes(clave)) {
      descartados.push(clave)
      continue
    }
    if (valor === undefined || valor === null || valor === '') continue

    if (CAMPOS_NUMERICOS.includes(clave)) {
      const numero = typeof valor === 'number' ? valor : Number(String(valor).replace(',', '.'))
      if (Number.isFinite(numero)) limpio[clave] = numero
      continue
    }

    limpio[clave] = valor
  }

  return { limpio, descartados }
}

/**
 * Inserta la factura. Si la constraint de 'metodo_extraccion' aún no admite
 * 'manual' (falta sql/06_metodo_manual.sql), reintenta como 'regla' para que
 * el guardado no falle.
 */
async function insertarFactura(supabase, facturaData) {
  let { data, error } = await supabase
    .from('facturas')
    .insert(facturaData)
    .select()
    .single()

  const falloConstraint = error &&
    /metodo_extraccion_check/i.test(error.message || '') &&
    facturaData.metodo_extraccion === 'manual'

  if (falloConstraint) {
    console.warn("La constraint no admite 'manual': se guarda como 'regla'. Ejecuta sql/06_metodo_manual.sql")
    const reintento = await supabase
      .from('facturas')
      .insert({ ...facturaData, metodo_extraccion: 'regla' })
      .select()
      .single()
    data = reintento.data
    error = reintento.error
  }

  return { data, error }
}

/**
 * Añade ruta_pdf_url: URL firmada para ver el archivo del bucket privado.
 * Los archivos antiguos guardados como data URL se devuelven tal cual.
 */
async function conUrlArchivo(factura) {
  if (!factura) return factura

  if (!esRutaDeBucket(factura.ruta_pdf)) {
    return { ...factura, ruta_pdf_url: factura.ruta_pdf || null }
  }

  try {
    // Si la ruta apunta a un objeto que ya no está, mejor no devolver una URL
    // rota: la vista mostrará "Documento no disponible".
    if (!(await existeArchivo(factura.ruta_pdf))) {
      console.warn('El archivo no existe en el bucket:', factura.ruta_pdf)
      return { ...factura, ruta_pdf_url: null }
    }
    return { ...factura, ruta_pdf_url: await urlFirmada(factura.ruta_pdf) }
  } catch (error) {
    console.error('No se pudo firmar la URL del archivo:', error.message)
    return { ...factura, ruta_pdf_url: null }
  }
}

router.post('/upload', upload.single('pdf'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se ha subido ningún archivo' })
    }
    
    const archivoBuffer = req.file.buffer
    const mimetype = req.file.mimetype
    const esPdf = mimetype === 'application/pdf'

    // PDF -> capa de texto; si no la tiene (escaneado) -> OCR de la página.
    // Imagen -> OCR directo.
    // Si el archivo no se puede leer, NO se rechaza: se crea la factura vacía
    // y el usuario rellena los datos a mano en el formulario.
    let text = ''
    let motivoManual = null

    if (!esPdf) {
      // Un archivo que no es una imagen de verdad sí es un error del cliente
      try {
        validarImagen(archivoBuffer)
      } catch (errorFormato) {
        return res.status(400).json({ error: errorFormato.message })
      }
    }

    try {
      if (esPdf) {
        const resultado = await extractTextFromPdf(archivoBuffer)
        text = resultado.text

        if (!text || text.trim().length < 50) {
          // PDF escaneado: no hay texto embebido, lo leemos con OCR
          text = await extractTextFromScannedPdf(archivoBuffer)
        }
      } else {
        const resultado = await extractTextFromImage(archivoBuffer)
        text = resultado.text
      }
    } catch (errorLectura) {
      console.error('Lectura de archivo fallida:', errorLectura.message)
      motivoManual = 'No se pudo leer el archivo automáticamente.'
    }

    if (!motivoManual && (!text || text.trim().length < 50)) {
      motivoManual = 'No se ha detectado texto suficiente en el archivo.'
    }

    // La IA gratuita de OpenRouter extrae los campos a partir del texto OCR.
    // Si fallan todos los modelos (429, timeout...), se usa el extractor por reglas.
    let extraction = {
      data: {},
      methods: {},
      // 'revisión' ya existe en la tabla; 'manual' lo distingue en metodo_extraccion
      estado: 'revisión',
      confianza: 0,
      metodo_extraccion: 'manual'
    }

    if (motivoManual) {
      console.warn('[extracción] se pedirá entrada manual:', motivoManual)
    } else {
      try {
        const ia = await extractWithOpenRouter(text)
        extraction = await evaluarExtraccionIA(ia.data, text)
        console.log(`[extracción] modelo: ${ia.modelo} | tokens: ${ia.usage?.total_tokens ?? '?'} | coste: ${ia.usage?.cost ?? 0}`)
      } catch (errorIa) {
        console.warn('[extracción] IA no disponible, se usa el extractor por reglas:', errorIa.message)
        extraction = await hybridExtract(text)
      }
    }
    
    const idFactura = generateId()

    // El archivo se guarda en Supabase Storage. Al no conocerse aún el cliente,
    // se deja en una carpeta de pendientes; al asignarlo se renombra.
    let rutaArchivo = null
    const rutaPendiente = `${CARPETA_PENDIENTES}/${idFactura}.${extensionDe(mimetype)}`
    try {
      await subirArchivo(rutaPendiente, archivoBuffer, mimetype)
      rutaArchivo = rutaPendiente
    } catch (errorAlmacen) {
      // Si Storage falla, la factura sigue funcionando con el data URL embebido
      console.error('No se pudo guardar en Storage, se usa data URL:', errorAlmacen.message)
    }

    // Solo columnas reales: un campo inventado por la IA/reglas rompería el insert
    const { limpio, descartados } = sanearCampos(extraction.data)
    if (descartados.length > 0) {
      console.warn('[extracción] campos descartados (no son columnas):', descartados.join(', '))
    }

    const facturaData = {
      id_factura: idFactura,
      ...limpio,
      estado_extraccion: extraction.estado,
      confianza: extraction.confianza,
      metodo_extraccion: extraction.metodo_extraccion,
      metodos_extraccion: extraction.methods,
      lineas: Array.isArray(limpio.lineas) ? limpio.lineas : [],
      ruta_pdf: rutaArchivo || `data:${mimetype};base64,${archivoBuffer.toString('base64')}`
    }
    
    const supabase = getSupabaseClient(true)
    const { data, error } = await insertarFactura(supabase, facturaData)
    
    if (error) {
      console.error('Supabase insert error:', error)
      // Compensación: si la fila no se guarda, el archivo subido sería un huérfano
      if (rutaArchivo) {
        await borrarArchivo(rutaArchivo).catch(() => {})
      }
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
    
    res.json({ data: await conUrlArchivo(data) })
  } catch (error) {
    next(error)
  }
})

// POST /api/facturas/manual - Alta manual con el archivo original.
// Sirve de rescate cuando la subida automática falla (OCR, IA, base de datos):
// el usuario rellena los datos y la factura se guarda igualmente.
router.post('/manual', upload.single('pdf'), async (req, res, next) => {
  try {
    const cuerpo = req.body || {}

    if (!cuerpo.id_cliente) {
      return res.status(400).json({ error: 'Selecciona un cliente antes de guardar la factura.' })
    }

    const cliente = await getClienteById(cuerpo.id_cliente)
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' })

    const idFactura = generateId()
    const mimetype = req.file?.mimetype || null
    let rutaArchivo = null
    let aviso = null

    if (req.file) {
      let archivoValido = true

      if (mimetype !== 'application/pdf') {
        try {
          validarImagen(req.file.buffer)
        } catch (errorFormato) {
          // El archivo no vale, pero los datos del formulario sí: se guardan
          archivoValido = false
          aviso = 'El archivo no es válido y no se ha almacenado. Los datos de la factura sí se han guardado.'
        }
      }

      if (archivoValido) {
        // Con cliente ya conocido: el archivo se guarda directamente con su nombre final
        const destino = nombreArchivo({
          fecha: new Date(),
          idCliente: cliente.id_cliente,
          idFactura,
          numFactura: cuerpo.num_factura,
          mimetype
        })

        try {
          rutaArchivo = await subirArchivo(destino, req.file.buffer, mimetype)
        } catch (errorAlmacen) {
          console.error('No se pudo guardar el archivo del alta manual:', errorAlmacen.message)
          aviso = 'Los datos se han guardado, pero el archivo no se pudo almacenar: ' + errorAlmacen.message
        }
      }
    }

    const { limpio, descartados } = sanearCampos(cuerpo)
    if (descartados.length > 0) {
      console.warn('[alta manual] campos descartados:', descartados.join(', '))
    }

    const facturaData = {
      id_factura: idFactura,
      id_cliente: cliente.id_cliente,
      ...limpio,
      estado_extraccion: 'revisión',
      confianza: 0,
      metodo_extraccion: 'manual',
      metodos_extraccion: Object.fromEntries(Object.keys(limpio).map((k) => [k, 'manual'])),
      lineas: [],
      ruta_pdf: rutaArchivo
    }

    const supabase = getSupabaseClient(true)
    const { data, error } = await insertarFactura(supabase, facturaData)

    if (error) {
      console.error('Supabase insert error (manual):', error)
      return res.status(500).json({ error: 'No se pudo guardar la factura en la base de datos' })
    }

    await createHistorial({
      id_factura: data.id_factura,
      id_usuario: req.headers['x-user-id'] || null,
      accion: 'crear',
      descripcion: `Factura introducida a mano para ${cliente.empresa}`,
      ip: req.ip,
      user_agent: req.headers['user-agent']
    })

    res.status(201).json({ data: await conUrlArchivo(data), aviso })
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

    // Las facturas "eliminadas" (activo = false) no salen en la tabla.
    // Se filtra aquí para que funcione también si aún no existe la columna.
    const incluirInactivas = req.query.incluir_inactivas === 'true'
    const visibles = incluirInactivas ? data : data.filter((f) => f.activo !== false)

    res.json({ data: visibles, total: visibles.length, limit: parseInt(limit), offset: parseInt(offset) })
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
    
    res.json({ data: await conUrlArchivo(data) })
  } catch (error) {
    next(error)
  }
})

// PATCH /api/facturas/:id/cliente - Asignar cliente y renombrar el archivo
// con el formato dia-mes-año-idEmpresa-idFactura.extension
router.patch('/:id/cliente', async (req, res, next) => {
  try {
    const { id_cliente } = req.body
    if (!id_cliente) {
      return res.status(400).json({ error: 'id_cliente es requerido' })
    }

    const cliente = await getClienteById(id_cliente)
    if (!cliente) {
      return res.status(404).json({ error: 'Cliente no encontrado' })
    }

    const supabase = getSupabaseClient(true)
    const { data: factura, error } = await supabase
      .from('facturas')
      .select('*')
      .eq('id_factura', req.params.id)
      .maybeSingle()

    if (error) throw error
    if (!factura) return res.status(404).json({ error: 'Factura no encontrada' })

    let ruta = factura.ruta_pdf
    let aviso = null

    if (esRutaDeBucket(ruta)) {
      const extension = String(ruta).split('.').pop()
      const fecha = factura.fecha_emision ? new Date(`${factura.fecha_emision}T00:00:00Z`) : new Date()
      const destino = nombreArchivo({
        fecha,
        idCliente: cliente.id_cliente,
        idFactura: factura.id_factura,
        numFactura: factura.num_factura,
        extension
      })

      if (destino !== ruta) {
        // Un reintento (doble clic, dos peticiones a la vez) puede llegar cuando
        // el archivo ya está renombrado: en ese caso se usa el destino.
        const origenExiste = await existeArchivo(ruta)

        if (!origenExiste && await existeArchivo(destino)) {
          ruta = destino
        } else if (!origenExiste) {
          aviso = 'El cliente se asignó, pero el archivo original no está en el bucket'
        } else {
          try {
            ruta = await moverArchivo(ruta, destino)
          } catch (errorMovimiento) {
            // El cliente sí se guarda: solo falla el renombrado
            aviso = 'El cliente se asignó, pero no se pudo renombrar el archivo: ' + errorMovimiento.message
            console.error(errorMovimiento)
          }
        }
      }
    } else {
      aviso = 'Esta factura no tiene archivo en Storage (se subió antes de activarlo)'
    }

    const { data, error: errorUpdate } = await supabase
      .from('facturas')
      .update({ id_cliente: cliente.id_cliente, ruta_pdf: ruta, updated_at: new Date().toISOString() })
      .eq('id_factura', factura.id_factura)
      .select()
      .single()

    if (errorUpdate) throw errorUpdate

    await createHistorial({
      id_factura: data.id_factura,
      id_usuario: req.headers['x-user-id'] || null,
      accion: 'asignar_cliente',
      campo_modificado: 'id_cliente',
      valor_nuevo: { id_cliente: cliente.id_cliente, empresa: cliente.empresa, ruta_pdf: ruta },
      descripcion: `Factura asignada a ${cliente.empresa}`,
      ip: req.ip,
      user_agent: req.headers['user-agent']
    })

    res.json({ data: await conUrlArchivo(data), aviso })
  } catch (error) {
    next(error)
  }
})

router.patch('/:id', async (req, res, next) => {
  try {
    const supabase = getSupabaseClient(true)

    // Solo columnas reales de la tabla: un campo de más (ruta_pdf_url, id_cliente,
    // etc.) hace que PostgREST rechace la actualización entera con PGRST204.
    const CAMPOS_EDITABLES = [
      'num_factura', 'fecha_emision', 'periodo_inicio', 'periodo_fin',
      'titular', 'nif', 'cups', 'direccion_suministro', 'comercializadora',
      'tipo_contrato', 'peaje_acceso', 'consumo_total_kwh', 'importe_total_eur',
      'lineas', 'estado_extraccion', 'confianza', 'metodo_extraccion', 'metodos_extraccion'
    ]

    const updates = { updated_at: new Date().toISOString() }
    for (const campo of CAMPOS_EDITABLES) {
      if (req.body[campo] !== undefined) updates[campo] = req.body[campo]
    }

    const camposModificados = Object.keys(updates).filter((k) => k !== 'updated_at')
    if (camposModificados.length === 0) {
      return res.status(400).json({ error: 'No hay campos que actualizar' })
    }

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
    await createHistorial({
      id_factura: data.id_factura,
      id_usuario: req.headers['x-user-id'] || null,
      accion: 'corregir',
      campo_modificado: camposModificados.join(', '),
      valor_nuevo: updates,
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

    const { data: facturaAntigua, error: errorLectura } = await supabase
      .from('facturas')
      .select('*')
      .eq('id_factura', id_factura)
      .maybeSingle()

    if (errorLectura) throw errorLectura
    if (!facturaAntigua) {
      return res.status(404).json({ error: 'Factura no encontrada' })
    }

    // === Borrado lógico: la factura se marca inactiva y deja de listarse ===
    const { data: actualizada, error: errorUpdate } = await supabase
      .from('facturas')
      .update({ activo: false, updated_at: new Date().toISOString() })
      .eq('id_factura', id_factura)
      .select()
      .single()

    if (!errorUpdate) {
      await createHistorial({
        id_factura,
        id_usuario: req.headers['x-user-id'] || null,
        accion: 'eliminar',
        descripcion: `Factura marcada como inactiva: ${facturaAntigua.num_factura || 'sin número'}`,
        ip: req.ip,
        user_agent: req.headers['user-agent']
      })

      return res.json({ success: true, data: actualizada, borrado: 'logico' })
    }

    // Si la columna 'activo' todavía no existe (falta la migración 05),
    // se mantiene el borrado real anterior para no romper la aplicación.
    if (!/activo/i.test(errorUpdate.message || '')) throw errorUpdate

    console.warn('La columna facturas.activo no existe: borrado físico. Ejecuta sql/05_facturas_activo.sql')

    // 'historial' tiene FK a 'facturas', así que hay que vaciar sus filas
    // antes de borrar la factura o el DELETE falla con violación de clave.
    const { error: errorHistorial } = await supabase
      .from('historial')
      .delete()
      .eq('id_factura', id_factura)

    if (errorHistorial) throw errorHistorial

    const { error } = await supabase
      .from('facturas')
      .delete()
      .eq('id_factura', id_factura)

    if (error) throw error

    // Borrar también el archivo original del bucket (si lo había)
    if (esRutaDeBucket(facturaAntigua?.ruta_pdf)) {
      try {
        await borrarArchivo(facturaAntigua.ruta_pdf)
      } catch (errorArchivo) {
        console.error('No se pudo borrar el archivo del bucket:', errorArchivo.message)
      }
    }

    res.json({ success: true })
  } catch (error) {
    next(error)
  }
})

export { router as facturasRouter }