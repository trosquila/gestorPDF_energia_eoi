import express from 'express'
import bcrypt from 'bcrypt'
import { 
  createUsuario, 
  getUsuarioByEmail, 
  getUsuarios, 
  updateUsuario,
  verifyPassword,
  createHistorial,
  getHistorialByFactura,
  getHistorial,
  createSolicitud,
  getSolicitudPorEmail
} from '../lib/supabase.js'

const BCRYPT_ROUNDS = 12

const router = express.Router()

// === USUARIOS ===

// POST /api/usuarios - Solicitar alta (queda pendiente de aprobación)
router.post('/', async (req, res, next) => {
  try {
    const { email, password, nombre, rol } = req.body
    if (!email) return res.status(400).json({ error: 'email es requerido' })
    if (!password) return res.status(400).json({ error: 'password es requerido' })
    if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'nombre es requerido' })
    if (password.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' })

    const existing = await getUsuarioByEmail(email)
    if (existing) return res.status(409).json({ error: 'El email ya existe' })

    // El alta NO crea usuario: se guarda como solicitud para que la apruebe un admin
    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS)
    const solicitud = await createSolicitud({
      nombre: nombre.trim(),
      email: email.trim().toLowerCase(),
      password_hash,
      rol: rol || 'lector'
    })

    res.status(202).json({
      data: solicitud,
      mensaje: 'Solicitud enviada. Un administrador debe aprobarla antes de que puedas entrar.'
    })
  } catch (error) {
    // Solicitud pendiente duplicada (índice único por email)
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Ya tienes una solicitud pendiente con ese correo' })
    }
    // Tabla de solicitudes sin crear todavía
    if (error.code === 'PGRST205' || /solicitudes_registro/.test(error.message || '')) {
      return res.status(503).json({
        error: 'El registro aún no está disponible: falta ejecutar server/sql/07_solicitudes.sql'
      })
    }
    next(error)
  }
})

// POST /api/usuarios/login - Login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: 'email y password son requeridos' })
    }
    
    const usuario = await verifyPassword(email, password)
    if (!usuario) {
      // Puede tener una solicitud pendiente o rechazada: se le explica
      try {
        const solicitud = await getSolicitudPorEmail(email)
        if (solicitud?.estado === 'pendiente') {
          return res.status(403).json({
            error: 'Tu solicitud de alta está pendiente de aprobación. Te avisaremos cuando un administrador la revise.'
          })
        }
        if (solicitud?.estado === 'rechazada') {
          return res.status(403).json({
            error: solicitud.motivo_rechazo
              ? `Tu solicitud fue rechazada: ${solicitud.motivo_rechazo}`
              : 'Tu solicitud de alta fue rechazada.'
          })
        }
      } catch {
        // Si la tabla no existe todavía, se responde con el mensaje genérico
      }
      return res.status(401).json({ error: 'Credenciales inválidas' })
    }
    
    if (!usuario.activo) {
      return res.status(403).json({ error: 'Usuario inactivo' })
    }
    
    res.json({ data: usuario })
  } catch (error) {
    next(error)
  }
})

// POST /api/usuarios/change-password - Cambiar contraseña
router.post('/change-password', async (req, res, next) => {
  try {
    const { email, current_password, new_password } = req.body
    if (!email || !current_password || !new_password) {
      return res.status(400).json({ error: 'email, current_password y new_password son requeridos' })
    }
    if (new_password.length < 8) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' })
    }
    
    const usuario = await verifyPassword(email, current_password)
    if (!usuario) {
      return res.status(401).json({ error: 'Contraseña actual incorrecta' })
    }
    
    const password_hash = await bcrypt.hash(new_password, BCRYPT_ROUNDS)
    await updateUsuario(usuario.id_usuario, { password_hash })
    
    res.json({ success: true, message: 'Contraseña actualizada correctamente' })
  } catch (error) {
    next(error)
  }
})

// GET /api/usuarios - Listar usuarios
router.get('/', async (req, res, next) => {
  try {
    const { activo } = req.query
    const usuarios = await getUsuarios({ activo: activo === 'true' ? true : activo === 'false' ? false : undefined })
    res.json({ data: usuarios })
  } catch (error) {
    next(error)
  }
})

// PATCH /api/usuarios/:id - Actualizar usuario
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    const { nombre, rol, activo } = req.body
    const updates = {}
    if (nombre !== undefined) updates.nombre = nombre
    if (rol !== undefined) updates.rol = rol
    if (activo !== undefined) updates.activo = activo
    
    const usuario = await updateUsuario(id, updates)
    res.json({ data: usuario })
  } catch (error) {
    next(error)
  }
})

// === HISTORIAL ===

// POST /api/historial - Registrar acción (interno, usado por otros endpoints)
router.post('/', async (req, res, next) => {
  try {
    const { id_factura, id_usuario, accion, campo_modificado, valor_anterior, valor_nuevo, descripcion, ip, user_agent } = req.body
    
    if (!id_factura || !accion) {
      return res.status(400).json({ error: 'id_factura y accion son requeridos' })
    }
    
    const validAcciones = ['crear', 'actualizar', 'eliminar', 'procesar', 'corregir']
    if (!validAcciones.includes(accion)) {
      return res.status(400).json({ error: 'Acción inválida' })
    }
    
    const historial = await createHistorial({ id_factura, id_usuario, accion, campo_modificado, valor_anterior, valor_nuevo, descripcion, ip, user_agent })
    res.status(201).json({ data: historial })
  } catch (error) {
    next(error)
  }
})

// GET /api/historial/factura/:id_factura - Historial de una factura
router.get('/factura/:id_factura', async (req, res, next) => {
  try {
    const { id_factura } = req.params
    const { limit, offset } = req.query
    const result = await getHistorialByFactura(id_factura, { 
      limit: limit ? parseInt(limit) : 50, 
      offset: offset ? parseInt(offset) : 0 
    })
    res.json(result)
  } catch (error) {
    next(error)
  }
})

// GET /api/historial - Historial global con filtros
router.get('/', async (req, res, next) => {
  try {
    const { id_usuario, accion, fecha_desde, fecha_hasta, limit, offset } = req.query
    const result = await getHistorial({ 
      id_usuario, 
      accion, 
      fecha_desde, 
      fecha_hasta,
      limit: limit ? parseInt(limit) : 100,
      offset: offset ? parseInt(offset) : 0
    })
    res.json(result)
  } catch (error) {
    next(error)
  }
})

export { router as usuariosRouter }
export { router as historialRouter }