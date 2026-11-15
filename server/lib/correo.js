/**
 * Envío de correo transaccional.
 *
 * Tres transportes, elegidos por variables de entorno (el primero que exista):
 *
 *   1. RESEND_API_KEY            → API HTTP de Resend (recomendado en Vercel)
 *   2. SMTP_HOST + SMTP_USER ... → SMTP con nodemailer (Gmail, Brevo, Mailtrap…)
 *   3. nada                      → modo "registro": el aviso se guarda en la
 *                                  base de datos y NO se entrega
 *
 * El modo registro existe para que la aplicación no finja que ha enviado un
 * correo: si no hay proveedor, el endpoint lo dice y la fila queda con
 * estado 'registrado', no 'enviado'.
 */

const TIMEOUT_MS = 15000

export function esEmailValido(valor) {
  const email = String(valor || '').trim()
  if (!email || email.length > 254) return false
  // Suficiente para descartar lo que no es un correo; no pretende ser el RFC.
  return /^[^\s@,;<>()[\]\\]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)
}

function transporteElegido() {
  const forzado = String(process.env.CORREO_TRANSPORTE || '').trim().toLowerCase()
  if (forzado) return forzado
  if (process.env.RESEND_API_KEY) return 'resend'
  if (process.env.SMTP_HOST && process.env.SMTP_USER) return 'smtp'
  return 'registro'
}

/**
 * Estado del envío, para que la interfaz pueda avisar antes de que el usuario
 * pulse el botón.
 */
export function estadoCorreo() {
  const transporte = transporteElegido()
  const contacto = (process.env.CORREO_CONTACTO || '').trim()

  if (transporte === 'resend') {
    const remitente = (process.env.CORREO_REMITENTE || 'Control Energía <onboarding@resend.dev>').trim()
    return {
      disponible: true,
      transporte,
      remitente,
      contacto: contacto || remitente,
      motivo: 'Envío por la API de Resend.'
    }
  }

  if (transporte === 'smtp') {
    const remitente = (process.env.CORREO_REMITENTE || `Control Energía <${process.env.SMTP_USER}>`).trim()
    return {
      disponible: true,
      transporte,
      remitente,
      contacto: contacto || process.env.SMTP_USER,
      motivo: `Envío por SMTP (${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587}).`
    }
  }

  return {
    disponible: false,
    transporte: 'registro',
    remitente: null,
    contacto: contacto || null,
    motivo:
      'No hay proveedor de correo configurado: el aviso se guarda en la base de datos ' +
      'pero no se entrega. Define RESEND_API_KEY o SMTP_HOST/SMTP_USER/SMTP_PASS.'
  }
}

function fallo(codigo, mensaje, causa) {
  const error = new Error(mensaje)
  error.codigo = codigo
  if (causa) error.cause = causa
  return error
}

async function enviarPorResend({ para, asunto, html, texto }, cfg) {
  const base = String(process.env.RESEND_BASE_URL || 'https://api.resend.com').replace(/\/$/, '')

  let respuesta
  try {
    respuesta = await fetch(`${base}/emails`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: cfg.remitente,
        to: [para],
        subject: asunto,
        html,
        text: texto
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
  } catch (error) {
    throw fallo('PROVEEDOR', `No se pudo contactar con Resend: ${error.message}`, error)
  }

  const cuerpo = await respuesta.text()
  let datos = null
  try { datos = JSON.parse(cuerpo) } catch { /* respuesta no JSON */ }

  if (!respuesta.ok) {
    const detalle = datos?.message || datos?.error || cuerpo.slice(0, 200)
    throw fallo('PROVEEDOR', `Resend respondió ${respuesta.status}: ${detalle}`)
  }

  return { estado: 'enviado', proveedor: 'resend', id_externo: datos?.id || null }
}

async function enviarPorSmtp({ para, asunto, html, texto }, cfg) {
  let nodemailer
  try {
    nodemailer = (await import('nodemailer')).default
  } catch {
    throw fallo('SIN_DEPENDENCIA', 'Falta la dependencia nodemailer: ejecuta `npm install` en server/')
  }

  const puerto = Number(process.env.SMTP_PORT || 587)
  const transporte = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: puerto,
    secure: puerto === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  })

  try {
    const info = await transporte.sendMail({
      from: cfg.remitente,
      to: para,
      subject: asunto,
      text: texto,
      html
    })
    return { estado: 'enviado', proveedor: 'smtp', id_externo: info.messageId || null }
  } catch (error) {
    throw fallo('PROVEEDOR', `El servidor SMTP rechazó el envío: ${error.message}`, error)
  } finally {
    transporte.close?.()
  }
}

/**
 * Envía un correo y devuelve { estado, proveedor, id_externo }.
 * Lanza error con `.codigo` = DESTINO_INVALIDO | PROVEEDOR | SIN_DEPENDENCIA.
 */
export async function enviarCorreo({ para, asunto, html, texto }) {
  const destino = String(para || '').trim()
  if (!esEmailValido(destino)) {
    throw fallo('DESTINO_INVALIDO', `El correo «${destino || '(vacío)'}» no es válido`)
  }

  const cfg = estadoCorreo()
  const mensaje = { para: destino, asunto, html, texto }

  if (cfg.transporte === 'resend') return enviarPorResend(mensaje, cfg)
  if (cfg.transporte === 'smtp') return enviarPorSmtp(mensaje, cfg)

  // Sin proveedor: se guarda el aviso, no se entrega.
  return { estado: 'registrado', proveedor: 'registro', id_externo: null }
}
