import express from 'express'
import { requiereAdmin } from '../middleware/auth.js'
import {
  getSupabaseClient,
  getSolicitudes,
  getSolicitudById,
  updateSolicitud,
  getUsuarioByEmail,
  createUsuarioConHash,
  createHistorial
} from '../lib/supabase.js'

const router = express.Router()

// requiereAdmin vive en middleware/auth.js, compartido con las rutas nuevas
export { requiereAdmin }

// GET /api/solicitudes?estado=pendiente
router.get('/', requiereAdmin, async (req, res, next) => {
  try {
    const { estado } = req.query
    const solicitudes = await getSolicitudes({ estado })
    res.json({ data: solicitudes })
  } catch (error) {
    next(error)
  }
})

// POST /api/solicitudes/:id/aprobar - Crea el usuario y marca la solicitud
router.post('/:id/aprobar', requiereAdmin, async (req, res, next) => {
  try {
    const solicitud = await getSolicitudById(req.params.id)
    if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' })
    if (solicitud.estado !== 'pendiente') {
      return res.status(409).json({ error: `La solicitud ya está ${solicitud.estado}` })
    }

    const existente = await getUsuarioByEmail(solicitud.email)
    if (existente) {
      return res.status(409).json({ error: 'Ya existe un usuario con ese correo' })
    }

    // rol: el que pidió, pero sin permitir autoascenderse a admin desde el registro
    const rol = solicitud.rol === 'admin' ? 'lector' : solicitud.rol

    const usuario = await createUsuarioConHash({
      email: solicitud.email,
      password_hash: solicitud.password_hash,
      nombre: solicitud.nombre,
      rol
    })

    await updateSolicitud(solicitud.id_solicitud, {
      estado: 'aprobada',
      revisado_por: req.usuario.id_usuario,
      revisado_at: new Date().toISOString()
    })

    try {
      await createHistorial({
        id_usuario: req.usuario.id_usuario,
        accion: 'aprobar_usuario',
        descripcion: `Solicitud aprobada: ${solicitud.email}`,
        valor_nuevo: { email: solicitud.email, rol },
        ip: req.ip,
        user_agent: req.headers['user-agent']
      })
    } catch (errorHistorial) {
      console.warn('No se pudo registrar en historial:', errorHistorial.message)
    }

    res.json({ data: { usuario, solicitud_id: solicitud.id_solicitud } })
  } catch (error) {
    next(error)
  }
})

// POST /api/solicitudes/:id/rechazar - Marca la solicitud como rechazada
router.post('/:id/rechazar', requiereAdmin, async (req, res, next) => {
  try {
    const solicitud = await getSolicitudById(req.params.id)
    if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' })
    if (solicitud.estado !== 'pendiente') {
      return res.status(409).json({ error: `La solicitud ya está ${solicitud.estado}` })
    }

    const actualizada = await updateSolicitud(solicitud.id_solicitud, {
      estado: 'rechazada',
      motivo_rechazo: req.body?.motivo || null,
      revisado_por: req.usuario.id_usuario,
      revisado_at: new Date().toISOString()
    })

    try {
      await createHistorial({
        id_usuario: req.usuario.id_usuario,
        accion: 'rechazar_usuario',
        descripcion: `Solicitud rechazada: ${solicitud.email}`,
        valor_nuevo: { email: solicitud.email, motivo: req.body?.motivo || null },
        ip: req.ip,
        user_agent: req.headers['user-agent']
      })
    } catch (errorHistorial) {
      console.warn('No se pudo registrar en historial:', errorHistorial.message)
    }

    res.json({ data: actualizada })
  } catch (error) {
    next(error)
  }
})

export { router as solicitudesRouter }
