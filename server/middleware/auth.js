/**
 * Autenticación por cabecera: el cliente manda `Authorization: Bearer <uuid>`.
 *
 * El token es el `id_usuario` (así está montado el login actual). Cada middleware
 * comprueba que el uuid existe y que la cuenta está activa antes de mirar el rol.
 */

import { getSupabaseClient } from '../lib/supabase.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function usuarioDeLaPeticion(req) {
  const cabecera = req.headers.authorization || ''
  const idUsuario = cabecera.replace(/^Bearer\s*/i, '').trim()
  if (!UUID.test(idUsuario)) return { error: 401, mensaje: 'No autenticado' }

  const supabase = getSupabaseClient(true)
  const { data: usuario, error } = await supabase
    .from('usuarios')
    .select('id_usuario, rol, activo, email, nombre')
    .eq('id_usuario', idUsuario)
    .maybeSingle()

  if (error) throw error
  if (!usuario || usuario.activo === false) return { error: 401, mensaje: 'Sesión no válida' }
  return { usuario }
}

/** Cualquier usuario activo. */
export async function requiereUsuario(req, res, next) {
  try {
    const { usuario, error, mensaje } = await usuarioDeLaPeticion(req)
    if (error) return res.status(error).json({ error: mensaje })
    req.usuario = usuario
    next()
  } catch (e) {
    next(e)
  }
}

/** Usuario activo con rol admin. */
export async function requiereAdmin(req, res, next) {
  try {
    const { usuario, error, mensaje } = await usuarioDeLaPeticion(req)
    if (error) return res.status(error).json({ error: mensaje })
    if (usuario.rol !== 'admin') {
      return res.status(403).json({ error: 'Solo un administrador puede hacer esto' })
    }
    req.usuario = usuario
    next()
  } catch (e) {
    next(e)
  }
}
