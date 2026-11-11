import express from 'express'
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

/**
 * Comprueba que quien llama es un administrador activo.
 * El cliente manda "Authorization: Bearer <id_usuario>".
 */
export async function requiereAdmin(req, res, next) {
  try {
    const cabecera = req.headers.authorization || ''
    const idUsuario = cabecera.replace(/^Bearer\s*/i, '').trim()

    // Formato UUID; si no, ni se consulta la base de datos
    const esUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idUsuario)
    if (!esUuid) {
      return res.status(401).json({ error: 'No autenticado' })
    }

    const supabase = getSupabaseClient(true)
    const { data: usuario, error } = await supabase
      .from('usuarios')
      .select('id_usuario, rol, activo')
      .eq('id_usuario', idUsuario)
      .maybeSingle()

    if (error) throw error
    if (!usuario || usuario.activo === false) {
      return res.status(401).json({ error: 'Sesión no válida' })
    }
    if (usuario.rol !== 'admin') {
      return res.status(403).json({ error: 'Solo un administrador puede hacer esto' })
    }

    req.usuario = usuario
    next()
  } catch (error) {
    next(error)
  }
}

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
