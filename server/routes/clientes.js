import express from 'express'
import {
  getClientes,
  getClienteById,
  createCliente,
  updateCliente,
  getSupabaseClient
} from '../lib/supabase.js'

const router = express.Router()
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Cuenta las facturas activas por cliente (una sola consulta). */
async function contarFacturasActivas() {
  const supabase = getSupabaseClient(true)
  const { data, error } = await supabase.from('facturas').select('id_cliente, activo')
  if (error) throw error

  const conteo = new Map()
  for (const factura of data || []) {
    if (factura.activo === false || !factura.id_cliente) continue
    conteo.set(factura.id_cliente, (conteo.get(factura.id_cliente) || 0) + 1)
  }
  return conteo
}

// GET /api/clientes?activo=true&busqueda=texto
router.get('/', async (req, res, next) => {
  try {
    const { activo, busqueda } = req.query
    const [clientes, conteo] = await Promise.all([
      getClientes({
        activo: activo === undefined ? undefined : activo === 'true',
        busqueda
      }),
      contarFacturasActivas()
    ])
    res.json({
      data: clientes.map((cliente) => ({
        ...cliente,
        total_facturas: conteo.get(cliente.id_cliente) || 0
      }))
    })
  } catch (error) {
    next(error)
  }
})

// GET /api/clientes/:id
router.get('/:id', async (req, res, next) => {
  try {
    const cliente = await getClienteById(req.params.id)
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' })
    res.json({ data: cliente })
  } catch (error) {
    next(error)
  }
})

// POST /api/clientes
router.post('/', async (req, res, next) => {
  try {
    const { nombre, empresa, email, telefono, direccion_empresa, activo } = req.body

    if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'nombre es requerido' })
    if (!empresa || !empresa.trim()) return res.status(400).json({ error: 'empresa es requerida' })

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'El correo electrónico no es válido' })
    }

    const cliente = await createCliente({
      nombre: nombre.trim(),
      empresa: empresa.trim(),
      email: email?.trim() || null,
      telefono: telefono?.trim() || null,
      direccion_empresa: direccion_empresa?.trim() || null,
      activo: activo === undefined ? true : Boolean(activo)
    })

    res.status(201).json({ data: cliente })
  } catch (error) {
    next(error)
  }
})

// PATCH /api/clientes/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const { nombre, empresa, email, telefono, direccion_empresa, activo } = req.body
    const updates = {}

    if (nombre !== undefined) {
      if (!String(nombre).trim()) return res.status(400).json({ error: 'nombre no puede quedar vacío' })
      updates.nombre = String(nombre).trim()
    }
    if (empresa !== undefined) {
      if (!String(empresa).trim()) return res.status(400).json({ error: 'empresa no puede quedar vacía' })
      updates.empresa = String(empresa).trim()
    }
    if (email !== undefined) {
      if (email && !EMAIL.test(email)) {
        return res.status(400).json({ error: 'El correo electrónico no es válido' })
      }
      updates.email = email ? String(email).trim() : null
    }
    if (telefono !== undefined) updates.telefono = telefono ? String(telefono).trim() : null
    if (direccion_empresa !== undefined) {
      updates.direccion_empresa = direccion_empresa ? String(direccion_empresa).trim() : null
    }
    if (activo !== undefined) updates.activo = Boolean(activo)

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No hay campos que actualizar' })
    }

    const cliente = await updateCliente(req.params.id, updates)
    res.json({ data: cliente })
  } catch (error) {
    next(error)
  }
})

// DELETE /api/clientes/:id — baja lógica, solo si no tiene facturas activas
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    const cliente = await getClienteById(id)
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' })

    const supabase = getSupabaseClient(true)
    const { data: facturas, error } = await supabase
      .from('facturas')
      .select('id_factura, activo')
      .eq('id_cliente', id)
    if (error) throw error

    const activas = (facturas || []).filter((f) => f.activo !== false).length
    if (activas > 0) {
      return res.status(409).json({
        error: `Este cliente tiene ${activas} factura${activas === 1 ? '' : 's'} activa${activas === 1 ? '' : 's'}. ` +
          'Reasígnalas a otro cliente o elimínalas antes de darlo de baja.',
        facturas: activas
      })
    }

    // Baja lógica: se conserva el historial y las facturas inactivas
    const actualizado = await updateCliente(id, { activo: false })
    res.json({ data: actualizado, aviso: 'Cliente dado de baja. Sus facturas anteriores se conservan.' })
  } catch (error) {
    next(error)
  }
})

export { router as clientesRouter }
