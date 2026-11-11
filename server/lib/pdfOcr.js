import { PDFParse } from 'pdf-parse'
import { extractTextFromImage } from './ocr.js'

// Límite de páginas a rasterizar: en un PDF escaneado la factura suele ser la
// primera hoja, y el OCR es lento (Vercel corta a los 30s).
const MAX_PAGINAS = 2

/**
 * Extrae texto de un PDF escaneado (sin capa de texto) rasterizando sus
 * primeras páginas y pasándolas por OCR.
 *
 * @param {Buffer} buffer contenido del PDF
 * @returns {Promise<string>} texto reconocido
 */
export async function extractTextFromScannedPdf(buffer) {
  let parser = null
  try {
    parser = new PDFParse({ data: buffer })
    const captura = await parser.getScreenshot()
    const paginas = (captura.pages || []).slice(0, MAX_PAGINAS)

    const textos = []
    for (const pagina of paginas) {
      // dataUrl viene como "data:image/png;base64,...."
      const base64 = String(pagina.dataUrl || '').split(',')[1]
      if (!base64) continue
      const imagen = Buffer.from(base64, 'base64')
      const { text } = await extractTextFromImage(imagen)
      textos.push(text)
    }

    return textos.join('\n')
  } catch (error) {
    console.error('Error en OCR de PDF escaneado:', error.message)
    throw new Error('No se pudo leer el PDF escaneado')
  } finally {
    if (parser) {
      try {
        await parser.destroy()
      } catch {
        // Recursos ya liberados
      }
    }
  }
}
