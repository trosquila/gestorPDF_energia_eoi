import express from 'express'
import { getClientes, getClienteById, createCliente, updateCliente } from '../lib/supabase.js'

const router = express.Router()

// GET /api/clientes?activo=true&busqueda=texto
router.get('/', async (req, res, next) => {
  try {
    const { activo, busqueda } = req.query
    const clientes = await getClientes({
      activo: activo === undefined ? undefined : activo === 'true',
      busqueda
    })
    res.json({ data: clientes })
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

    if (nombre !== undefined) updates.nombre = nombre
    if (empresa !== undefined) updates.empresa = empresa
    if (email !== undefined) updates.email = email || null
    if (telefono !== undefined) updates.telefono = telefono || null
    if (direccion_empresa !== undefined) updates.direccion_empresa = direccion_empresa || null
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

export { router as clientesRouter }
