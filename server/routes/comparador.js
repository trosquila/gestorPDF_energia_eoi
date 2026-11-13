import express from 'express'
import { getSupabaseClient, getClienteById } from '../lib/supabase.js'
import { preciosDelDia, mediaPorPeriodo2_0TD } from '../lib/precios.js'
import { consultarAsistente } from '../lib/asistente.js'
import { descargarOfertas, mapearCatalogo, ATRIBUCION_CNMC } from '../lib/cnmc.js'
import {
  costeDeOferta,
  mapaPeriodos,
  aNumero as numero,
  redondear,
  IMPUESTO_ELECTRICO,
  IVA
} from '../lib/coste.js'

const router = express.Router()

/** ¿La tabla del catálogo existe ya? (falta ejecutar sql/12_ofertas.sql) */
function faltaTablaOfertas(error) {
  const mensaje = String(error?.message || '')
  return error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    /relation .*ofertas.* does not exist/i.test(mensaje) ||
    /Could not find the table .*ofertas/i.test(mensaje)
}

/** Estimación del PVPC: solo energía, a precio medio de los últimos 30 días. */
async function estimarPVPC(perfil) {
  const medias = await mediaPorPeriodo2_0TD()
  let energia = 0
  const detalle = {}

  for (const [periodo, kwh] of Object.entries(perfil.consumos)) {
    const precio = medias[periodo] ?? medias.P3
    if (!Number.isFinite(precio)) continue
    detalle[periodo] = { kwh, precio, importe: redondear(kwh * precio) }
    energia += kwh * precio
  }

  const impuesto = energia * IMPUESTO_ELECTRICO
  const iva = (energia + impuesto) * IVA

  return {
    etiqueta: 'PVPC estimado (energía + impuestos)',
    precios_por_periodo: medias,
    detalle,
    energia: redondear(energia),
    total: redondear(energia + impuesto + iva),
    nota: 'El PVPC lleva los peajes y cargos dentro del precio de la energía. ' +
      'Esta estimación usa la media de los últimos 30 días por periodo e incluye ' +
      'impuesto eléctrico e IVA, pero no el término de potencia.'
  }
}

// === Precios del mercado ===
router.get('/precios', async (req, res, next) => {
  try {
    const { desde, hasta } = req.query
    const datos = await preciosDelDia({ desde, hasta })
    res.json({ data: datos })
  } catch (error) {
    next(error)
  }
})

// === Fuentes disponibles ===
router.get('/fuentes', async (req, res, next) => {
  try {
    const supabase = getSupabaseClient(true)
    const { error } = await supabase.from('ofertas').select('id_oferta').limit(1)

    res.json({
      data: [
        {
          id: 'ree',
          nombre: 'Precios de mercado (PVPC y spot)',
          proveedor: 'Red Eléctrica · apidatos.ree.es',
          disponible: true,
          coste: 'gratis',
          nota: 'Sin token. Se actualiza cada 30 minutos como máximo.'
        },
        {
          id: 'catalogo',
          nombre: 'Catálogo de ofertas de comercializadoras',
          proveedor: 'Base de datos propia',
          disponible: !error,
          coste: 'gratis',
          nota: error
            ? 'Falta ejecutar server/sql/12_ofertas.sql'
            : 'Ofertas mantenidas por la empresa (alta manual o CSV).'
        },
        {
          id: 'cnmc',
          nombre: 'Comparador de la CNMC (API pública)',
          proveedor: 'comparador.cnmc.gob.es · /api/APIPublica/ofertas',
          disponible: !error,
          coste: 'gratis',
          nota: 'Ofertas oficiales de todas las comercializadoras, actualizables por fecha. ' +
            'Uso libre con mención obligatoria a la CNMC.'
        }
      ]
    })
  } catch (error) {
    next(error)
  }
})

// === Catálogo de ofertas ===
router.get('/ofertas', async (req, res, next) => {
  try {
    const supabase = getSupabaseClient(true)
    const { data, error } = await supabase
      .from('ofertas')
      .select('*')
      .eq('activo', true)
      .order('comercializadora', { ascending: true })

    if (error) {
      if (faltaTablaOfertas(error)) {
        return res.status(503).json({
          error: 'El catálogo de ofertas aún no existe. Ejecuta server/sql/12_ofertas.sql.',
          falta_migracion: '12_ofertas.sql'
        })
      }
      throw error
    }

    res.json({ data })
  } catch (error) {
    next(error)
  }
})

function limpiarOferta(cuerpo = {}) {
  const limpio = {}
  const texto = (v) => (v === undefined ? undefined : String(v).trim())

  if (texto(cuerpo.comercializadora)) limpio.comercializadora = texto(cuerpo.comercializadora)
  if (texto(cuerpo.nombre)) limpio.nombre = texto(cuerpo.nombre)
  if (texto(cuerpo.tipo)) limpio.tipo = texto(cuerpo.tipo)
  if (cuerpo.peajes !== undefined) {
    limpio.peajes = Array.isArray(cuerpo.peajes) ? cuerpo.peajes : [String(cuerpo.peajes)]
  }
  if (cuerpo.precio_energia !== undefined) limpio.precio_energia = mapaPeriodos(cuerpo.precio_energia)
  if (cuerpo.precio_potencia !== undefined) limpio.precio_potencia = mapaPeriodos(cuerpo.precio_potencia)
  if (cuerpo.precio_excedentes !== undefined) limpio.precio_excedentes = numero(cuerpo.precio_excedentes)
  if (cuerpo.alquiler_contador !== undefined) limpio.alquiler_contador = numero(cuerpo.alquiler_contador)
  if (texto(cuerpo.servicios_incluidos)) limpio.servicios_incluidos = texto(cuerpo.servicios_incluidos)
  if (cuerpo.provincias !== undefined) {
    limpio.provincias = Array.isArray(cuerpo.provincias)
      ? cuerpo.provincias.filter(Boolean)
      : String(cuerpo.provincias || '').split(',').map((p) => p.trim()).filter(Boolean)
  }
  if (texto(cuerpo.vigencia_desde)) limpio.vigencia_desde = texto(cuerpo.vigencia_desde)
  if (texto(cuerpo.vigencia_hasta)) limpio.vigencia_hasta = texto(cuerpo.vigencia_hasta)
  if (texto(cuerpo.fuente)) limpio.fuente = texto(cuerpo.fuente)
  if (cuerpo.activo !== undefined) limpio.activo = Boolean(cuerpo.activo)

  return limpio
}

router.post('/ofertas', async (req, res, next) => {
  try {
    const oferta = limpiarOferta(req.body)
    if (!oferta.comercializadora || !oferta.nombre) {
      return res.status(400).json({ error: 'comercializadora y nombre son obligatorios' })
    }
    if (!['fijo', 'indexado', 'pvpc'].includes(oferta.tipo || 'fijo')) {
      return res.status(400).json({ error: 'tipo debe ser fijo, indexado o pvpc' })
    }

    const supabase = getSupabaseClient(true)
    const { data, error } = await supabase.from('ofertas').insert(oferta).select().single()
    if (error) {
      if (faltaTablaOfertas(error)) {
        return res.status(503).json({ error: 'Falta ejecutar server/sql/12_ofertas.sql' })
      }
      throw error
    }
    res.status(201).json({ data })
  } catch (error) {
    next(error)
  }
})

router.patch('/ofertas/:id', async (req, res, next) => {
  try {
    const oferta = limpiarOferta(req.body)
    if (Object.keys(oferta).length === 0) {
      return res.status(400).json({ error: 'No hay campos que actualizar' })
    }
    const supabase = getSupabaseClient(true)
    const { data, error } = await supabase
      .from('ofertas')
      .update({ ...oferta, actualizado_en: new Date().toISOString() })
      .eq('id_oferta', req.params.id)
      .select()
      .single()
    if (error) throw error
    res.json({ data })
  } catch (error) {
    next(error)
  }
})

router.delete('/ofertas/:id', async (req, res, next) => {
  try {
    const supabase = getSupabaseClient(true)
    const { error } = await supabase
      .from('ofertas')
      .update({ activo: false, actualizado_en: new Date().toISOString() })
      .eq('id_oferta', req.params.id)
    if (error) throw error
    res.json({ ok: true, mensaje: 'Oferta desactivada del catálogo' })
  } catch (error) {
    next(error)
  }
})

// === Catálogo oficial: sincronización con la API de la CNMC ===
// Columnas que solo existen si se ha ejecutado sql/13_ofertas_cnmc.sql
const CAMPOS_OPCIONALES = ['id_externo', 'origen', 'web_oferta', 'tipo_plan', 'descuento_energia', 'descuento_potencia']

function sinCamposOpcionales(fila) {
  const copia = { ...fila }
  for (const campo of CAMPOS_OPCIONALES) delete copia[campo]
  return copia
}

function faltaColumna(error) {
  const mensaje = String(error?.message || '')
  return error?.code === 'PGRST204' || /column .* does not exist|Could not find the .* column/i.test(mensaje)
}

/** Clave lógica de una oferta: la misma comercializadora+nombre+fecha es la misma oferta. */
function claveOferta(oferta) {
  return [
    String(oferta.comercializadora || '').trim().toLowerCase(),
    String(oferta.nombre || '').trim().toLowerCase(),
    oferta.vigencia_desde || ''
  ].join('|')
}

async function desactivarObsoletas(supabase, vigentes) {
  const { data, error } = await supabase
    .from('ofertas')
    .select('id_oferta,comercializadora,nombre,vigencia_desde,fuente')
    .eq('activo', true)
  if (error) throw error

  const sobrantes = (data || [])
    .filter((fila) => String(fila.fuente || '').startsWith('CNMC'))
    .filter((fila) => !vigentes.has(claveOferta(fila)))
    .map((fila) => fila.id_oferta)

  if (sobrantes.length === 0) return 0
  const { error: errorBaja } = await supabase
    .from('ofertas')
    .update({ activo: false, actualizado_en: new Date().toISOString() })
    .in('id_oferta', sobrantes)
  if (errorBaja) throw errorBaja
  return sobrantes.length
}

router.post('/catalogo/sincronizar', async (req, res, next) => {
  try {
    const { fecha } = req.body || {}
    let fechaConsulta = new Date()
    if (fecha) {
      const texto = String(fecha).trim()
      const española = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
      fechaConsulta = española
        ? new Date(Date.UTC(Number(española[3]), Number(española[2]) - 1, Number(española[1])))
        : new Date(texto)
      if (Number.isNaN(fechaConsulta.getTime())) {
        return res.status(400).json({ error: 'Fecha no válida. Usa dd/MM/yyyy o yyyy-mm-dd' })
      }
    }

    const descarga = await descargarOfertas(fechaConsulta)
    const { filas, descartadas } = mapearCatalogo(descarga.ofertas)

    if (filas.length === 0) {
      return res.status(502).json({
        error: 'La CNMC no devolvió ofertas utilizables para esa fecha',
        fecha: descarga.fecha
      })
    }

    const supabase = getSupabaseClient(true)
    const ahora = new Date().toISOString()

    // 1) Qué hay ya en el catálogo, para actualizar en vez de duplicar
    const { data: existentes, error: errorExistentes } = await supabase
      .from('ofertas')
      .select('id_oferta,comercializadora,nombre,vigencia_desde,fuente')
    if (errorExistentes) {
      if (faltaTablaOfertas(errorExistentes)) {
        return res.status(503).json({ error: 'Falta ejecutar server/sql/12_ofertas.sql' })
      }
      throw errorExistentes
    }

    const porClave = new Map()
    for (const fila of existentes || []) porClave.set(claveOferta(fila), fila.id_oferta)

    // 2) Actualizar las que ya están, insertar las nuevas
    const nuevas = []
    const actualizadas = []
    for (const fila of filas) {
      const id = porClave.get(claveOferta(fila))
      if (id) actualizadas.push({ id, fila })
      else nuevas.push(fila)
    }

    let usaCamposOpcionales = true
    let avisoMigracion = null

    for (const { id, fila } of actualizadas) {
      let cuerpo = { ...fila, actualizado_en: ahora, activo: true }
      let { error } = await supabase
        .from('ofertas')
        .update(usaCamposOpcionales ? cuerpo : sinCamposOpcionales(cuerpo))
        .eq('id_oferta', id)

      if (error && usaCamposOpcionales && faltaColumna(error)) {
        usaCamposOpcionales = false
        avisoMigracion = 'Ejecuta server/sql/13_ofertas_cnmc.sql para guardar id_externo, origen y descuentos'
        cuerpo = sinCamposOpcionales(cuerpo)
        ;({ error } = await supabase.from('ofertas').update(cuerpo).eq('id_oferta', id))
      }
      if (error) throw error
    }

    let insertadas = 0
    for (let i = 0; i < nuevas.length; i += 100) {
      const lote = nuevas.slice(i, i + 100).map((fila) => ({
        ...fila,
        actualizado_en: ahora
      }))
      let { error } = await supabase
        .from('ofertas')
        .insert(usaCamposOpcionales ? lote : lote.map(sinCamposOpcionales))

      if (error && usaCamposOpcionales && faltaColumna(error)) {
        usaCamposOpcionales = false
        avisoMigracion = 'Ejecuta server/sql/13_ofertas_cnmc.sql para guardar id_externo, origen y descuentos'
        ;({ error } = await supabase.from('ofertas').insert(lote.map(sinCamposOpcionales)))
      }
      if (error) {
        if (faltaTablaOfertas(error)) {
          return res.status(503).json({ error: 'Falta ejecutar server/sql/12_ofertas.sql' })
        }
        throw error
      }
      insertadas += lote.length
    }

    // 3) Las que la CNMC ya no publica dejan de estar activas
    const dadasDeBaja = await desactivarObsoletas(supabase, new Set(filas.map(claveOferta)))

    res.json({
      data: {
        fecha_consulta: descarga.fecha,
        url: descarga.url,
        ofertas_recibidas: descarga.ofertas.length,
        ofertas_guardadas: insertadas + actualizadas.length,
        nuevas: insertadas,
        actualizadas: actualizadas.length,
        desactivadas: dadasDeBaja,
        descartadas,
        comercializadoras: [...new Set(filas.map((f) => f.comercializadora))].length,
        aviso_migracion: avisoMigracion,
        atribucion: ATRIBUCION_CNMC
      }
    })
  } catch (error) {
    if (faltaTablaOfertas(error)) {
      return res.status(503).json({ error: 'Falta ejecutar server/sql/12_ofertas.sql' })
    }
    res.status(502).json({ error: error.message })
  }
})

router.get('/catalogo/estado', async (req, res, next) => {
  try {
    const supabase = getSupabaseClient(true)
    const { data, error } = await supabase
      .from('ofertas')
      .select('activo,actualizado_en,comercializadora,fuente')
      .order('actualizado_en', { ascending: false })
    if (error) {
      if (faltaTablaOfertas(error)) {
        return res.status(503).json({ error: 'Falta ejecutar server/sql/12_ofertas.sql' })
      }
      throw error
    }

    const filas = data || []
    const activas = filas.filter((f) => f.activo !== false)
    res.json({
      data: {
        total: filas.length,
        activas: activas.length,
        por_origen: activas.reduce((acc, f) => {
          const clave = String(f.fuente || '').startsWith('CNMC') ? 'cnmc' : 'manual'
          acc[clave] = (acc[clave] || 0) + 1
          return acc
        }, {}),
        comercializadoras: [...new Set(activas.map((f) => f.comercializadora))].sort((a, b) =>
          String(a).localeCompare(String(b), 'es')
        ).length,
        actualizado_en: filas[0]?.actualizado_en || null,
        atribucion: ATRIBUCION_CNMC
      }
    })
  } catch (error) {
    next(error)
  }
})

// === Simulación
router.post('/simular', async (req, res, next) => {
  try {
    const {
      provincia = null,
      peaje = '2.0TD',
      potencias = {},
      consumos = {},
      excedentes_kwh = 0,
      dias = 365,
      factura_id = null
    } = req.body || {}

    const perfil = {
      provincia,
      peaje: String(peaje).toUpperCase(),
      potencias: mapaPeriodos(potencias),
      consumos: mapaPeriodos(consumos),
      excedentes_kwh: numero(excedentes_kwh),
      dias: numero(dias, 365)
    }
    perfil.consumo_total = Object.values(perfil.consumos).reduce((t, v) => t + v, 0)

    if (Object.keys(perfil.consumos).length === 0) {
      return res.status(400).json({ error: 'Faltan los consumos por periodo para poder comparar' })
    }

    // Factura actual (si se parte de una factura real)
    let actual = null
    if (factura_id) {
      const supabase = getSupabaseClient(true)
      const { data: factura } = await supabase
        .from('facturas')
        .select('id_factura,num_factura,importe_total_eur,consumo_total_kwh,dias_facturados,comercializadora,periodo_inicio,periodo_fin')
        .eq('id_factura', factura_id)
        .maybeSingle()

      if (factura?.importe_total_eur) {
        const diasFactura = numero(factura.dias_facturados, 30) || 30
        perfil.dias = diasFactura
        perfil.consumo_total = numero(factura.consumo_total_kwh, perfil.consumo_total)
        actual = {
          id_factura: factura.id_factura,
          num_factura: factura.num_factura,
          comercializadora: factura.comercializadora,
          periodo_inicio: factura.periodo_inicio,
          periodo_fin: factura.periodo_fin,
          dias: diasFactura,
          importe: numero(factura.importe_total_eur),
          anualizado: redondear(numero(factura.importe_total_eur) * (365 / diasFactura))
        }
      }
    }

    // Catálogo
    const supabase = getSupabaseClient(true)
    const { data: ofertas, error } = await supabase
      .from('ofertas')
      .select('*')
      .eq('activo', true)

    let avisoCatalogo = null
    let resultados = []

    if (error) {
      if (faltaTablaOfertas(error)) {
        avisoCatalogo = 'El catálogo de ofertas aún no existe: ejecuta server/sql/12_ofertas.sql'
      } else {
        throw error
      }
    } else {
      resultados = (ofertas || [])
        .filter((oferta) => {
          if (perfil.provincia && Array.isArray(oferta.provincias) && oferta.provincias.length > 0) {
            return oferta.provincias.some((p) => p.toLowerCase() === String(perfil.provincia).toLowerCase())
          }
          return true
        })
        .filter((oferta) => {
          if (!Array.isArray(oferta.peajes) || oferta.peajes.length === 0) return true
          return oferta.peajes.some((p) => String(p).toUpperCase() === perfil.peaje)
        })
        .map((oferta) => {
          const coste = costeDeOferta(oferta, perfil)
          const referencia = actual?.importe ?? null
          return {
            id_oferta: oferta.id_oferta,
            comercializadora: oferta.comercializadora,
            nombre: oferta.nombre,
            tipo: oferta.tipo,
            servicios_incluidos: oferta.servicios_incluidos,
            fuente: oferta.fuente,
            actualizado_en: oferta.actualizado_en,
            coste,
            ahorro: referencia !== null ? redondear(referencia - coste.total) : null
          }
        })
        .sort((a, b) => a.coste.total - b.coste.total)
    }

    const pvpc = await estimarPVPC(perfil).catch((e) => ({ error: e.message }))

    res.json({
      data: {
        perfil,
        actual,
        pvpc,
        ofertas: resultados,
        aviso_catalogo: avisoCatalogo,
        notas: [
          'El coste de cada oferta se calcula con los consumos y potencias indicados.',
          'Impuesto eléctrico 5,11 % e IVA 21 % aplicados sobre el subtotal.',
          'El PVPC se estima solo con energía: sus peajes van incluidos en el precio.'
        ]
      }
    })
  } catch (error) {
    next(error)
  }
})

// === Asistente IA ===
router.post('/asistente', async (req, res, next) => {
  try {
    const { datos, pregunta } = req.body || {}
    if (!datos) return res.status(400).json({ error: 'Faltan los datos de la comparación' })

    const resultado = await consultarAsistente({ datos, pregunta })
    res.json({ data: resultado })
  } catch (error) {
    res.status(502).json({ error: `El asistente no pudo responder: ${error.message}` })
  }
})

// === Contexto para el asistente desde una factura ===
router.get('/facturas/:id/perfil', async (req, res, next) => {
  try {
    const supabase = getSupabaseClient(true)
    const { data, error } = await supabase
      .from('facturas')
      .select('*')
      .eq('id_factura', req.params.id)
      .maybeSingle()
    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Factura no encontrada' })

    const cliente = data.id_cliente ? await getClienteById(data.id_cliente).catch(() => null) : null

    res.json({
      data: {
        factura: {
          id_factura: data.id_factura,
          num_factura: data.num_factura,
          comercializadora: data.comercializadora,
          importe_total_eur: data.importe_total_eur,
          dias_facturados: data.dias_facturados,
          provincia: data.provincia,
          peaje_acceso: data.peaje_acceso
        },
        cliente: cliente ? { empresa: cliente.empresa, nombre: cliente.nombre } : null,
        perfil: {
          provincia: data.provincia,
          peaje: data.peaje_acceso || '2.0TD',
          potencias: data.potencias_contratadas || {},
          consumos: data.consumos_periodo || {},
          excedentes_kwh: data.excedentes_kwh || 0
        }
      }
    })
  } catch (error) {
    next(error)
  }
})

export { router as comparadorRouter }
