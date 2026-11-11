import { config } from '../config.js'

// Almacenamiento de los archivos de factura en el bucket privado de Supabase.
// Se usa la Storage API (no hay credenciales S3: exigen firma SigV4 con
// Access Key + Secret Key y aquí solo hay una clave de servicio).

const BUCKET = config.storage.bucket
const BASE = `${config.supabase.url}/storage/v1`

// Carpeta donde se deja el archivo recién subido, antes de saber su cliente.
export const CARPETA_PENDIENTES = '_pendientes'

function cabeceras(extra = {}) {
  const clave = config.supabase.serviceKey
  return {
    Authorization: `Bearer ${clave}`,
    apikey: clave,
    ...extra
  }
}

async function comprobar(respuesta, contexto) {
  if (respuesta.ok) return respuesta

  let detalle = `HTTP ${respuesta.status}`
  try {
    const cuerpo = await respuesta.json()
    detalle = cuerpo.message || cuerpo.error || detalle
  } catch {
    // El cuerpo no era JSON; nos quedamos con el código
  }
  throw new Error(`${contexto}: ${detalle}`)
}

/**
 * Sube un archivo al bucket.
 * @param {string} ruta ruta dentro del bucket (sin el nombre del bucket)
 * @param {Buffer} contenido bytes del archivo
 * @param {string} mimetype tipo MIME real
 */
export async function subirArchivo(ruta, contenido, mimetype) {
  const respuesta = await fetch(`${BASE}/object/${BUCKET}/${encodeURI(ruta)}`, {
    method: 'POST',
    headers: cabeceras({
      'Content-Type': mimetype || 'application/octet-stream',
      'x-upsert': 'true'
    }),
    body: contenido
  })

  await comprobar(respuesta, 'No se pudo subir el archivo')
  return ruta
}

/**
 * Comprueba si un objeto existe en el bucket.
 */
export async function existeArchivo(ruta) {
  if (!ruta) return false
  const respuesta = await fetch(`${BASE}/object/${BUCKET}/${encodeURI(ruta)}`, {
    method: 'HEAD',
    headers: cabeceras()
  })
  return respuesta.ok
}

/**
 * Renombra/mueve un archivo dentro del bucket (para ponerle el nombre final
 * cuando ya se conoce el cliente).
 */
export async function moverArchivo(origen, destino) {
  const respuesta = await fetch(`${BASE}/object/move`, {
    method: 'POST',
    headers: cabeceras({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      bucketId: BUCKET,
      sourceKey: origen,
      destinationKey: destino
    })
  })

  await comprobar(respuesta, 'No se pudo mover el archivo')
  return destino
}

export async function borrarArchivo(ruta) {
  if (!ruta) return
  const respuesta = await fetch(`${BASE}/object/${BUCKET}/${encodeURI(ruta)}`, {
    method: 'DELETE',
    headers: cabeceras()
  })
  // Si el archivo ya no está, no es un error para el usuario
  if (!respuesta.ok && respuesta.status !== 404) {
    await comprobar(respuesta, 'No se pudo borrar el archivo')
  }
}

/**
 * URL temporal para ver un archivo de un bucket privado.
 * @param {string} ruta ruta dentro del bucket
 * @param {number} segundos validez
 */
export async function urlFirmada(ruta, segundos = 3600) {
  if (!ruta) return null
  const respuesta = await fetch(`${BASE}/object/sign/${BUCKET}/${encodeURI(ruta)}`, {
    method: 'POST',
    headers: cabeceras({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ expiresIn: segundos })
  })

  await comprobar(respuesta, 'No se pudo firmar la URL')
  const { signedURL } = await respuesta.json()
  return `${config.supabase.url}/storage/v1${signedURL}`
}

export function esRutaDeBucket(valor) {
  if (!valor) return false
  // Los archivos antiguos se guardaban como data URL dentro de la propia fila
  return !valor.startsWith('data:') && !valor.startsWith('http')
}

// Extensión a partir del MIME real del archivo
export function extensionDe(mimetype) {
  const mapa = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/tiff': 'tiff',
    'image/bmp': 'bmp'
  }
  return mapa[mimetype] || 'bin'
}

/**
 * Nombre final del archivo: dia-mes-año-idEmpresa-idFactura.extension
 * (idEmpresa = id_cliente). Si no hay número de factura se usa el id.
 */
export function nombreArchivo({ fecha, idCliente, idFactura, numFactura, mimetype, extension }) {
  const d = fecha instanceof Date && !Number.isNaN(fecha.getTime()) ? fecha : new Date()
  const dia = String(d.getUTCDate()).padStart(2, '0')
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0')
  const anio = d.getUTCFullYear()

  const referencia = (numFactura || idFactura || 'sin-factura')
    .toString()
    .trim()
    .replace(/[^\w.-]+/g, '_')

  const ext = extension || extensionDe(mimetype)
  return `${dia}-${mes}-${anio}-${idCliente}-${referencia}.${ext}`
}
