import { createWorker } from 'tesseract.js'
import os from 'node:os'
import path from 'node:path'

// Idiomas del OCR: español (facturas) con inglés como respaldo.
const IDIOMAS = 'spa+eng'

// Los datos de idioma (~9MB) se cachean fuera del proyecto para no ensuciar
// el repositorio ni el despliegue.
const CACHE_PATH = path.join(os.tmpdir(), 'tessdata-cache')

// El worker de Tesseract es costoso de crear (~1s + descarga de datos de idioma),
// así que se reutiliza entre peticiones en lugar de instanciar uno por archivo.
let workerPromise = null

async function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker(IDIOMAS, 1, { cachePath: CACHE_PATH }).catch((error) => {
      // Si falla la creación, no dejamos la promesa rota en caché.
      workerPromise = null
      throw new Error('No se pudo inicializar el OCR: ' + error.message)
    })
  }
  return workerPromise
}

/**
 * Comprueba la firma binaria del archivo antes de pasarlo al OCR.
 * Tesseract lanza el error desde su worker y, si le llega basura (un HTML,
 * un archivo truncado...), el proceso Node se cae; aquí se corta antes.
 */
export function validarImagen(buffer) {
  if (!buffer || buffer.length < 12) {
    throw new Error('El archivo está vacío o es demasiado pequeño')
  }

  const b = buffer
  const esPng = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
  const esJpeg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
  const esWebp = b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP'
  const esTiff = (b[0] === 0x49 && b[1] === 0x49) || (b[0] === 0x4d && b[1] === 0x4d)
  const esBmp = b[0] === 0x42 && b[1] === 0x4d

  if (!esPng && !esJpeg && !esWebp && !esTiff && !esBmp) {
    throw new Error('El archivo no es una imagen válida (JPG, PNG, WEBP, TIFF o BMP)')
  }
}

/**
 * Extrae texto de una imagen (JPG, PNG, WEBP...) mediante OCR.
 * @param {Buffer} buffer contenido binario de la imagen
 * @returns {Promise<{text: string, confidence: number}>}
 */
export async function extractTextFromImage(buffer) {
  validarImagen(buffer)

  let worker
  try {
    worker = await getWorker()
    const { data } = await worker.recognize(buffer)

    const text = normalizeOcrText(data.text)

    if (!text) {
      throw new Error('No se ha detectado texto en la imagen')
    }

    return { text, confidence: data.confidence }
  } catch (error) {
    console.error('Error en OCR:', error.message)
    throw new Error('No se pudo leer el texto de la imagen: ' + error.message)
  }
}

/**
 * Limpia el texto devuelto por Tesseract: elimina espacios sobrantes,
 * une palabras cortadas por saltos de línea y comprime líneas vacías.
 */
export function normalizeOcrText(text) {
  if (!text) return ''
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim()
}

/**
 * Libera el worker de Tesseract. Útil en tests o al apagar el proceso.
 */
export async function terminateOcr() {
  if (!workerPromise) return
  try {
    const worker = await workerPromise
    await worker.terminate()
  } catch {
    // Ignoramos errores al cerrar: el worker ya podría estar caído.
  } finally {
    workerPromise = null
  }
}
