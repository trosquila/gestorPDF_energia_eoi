import { PDFParse } from 'pdf-parse'

/**
 * Extrae la capa de texto de un PDF.
 * Usa pdf-parse v2 (pdf.js moderno), que sí lee PDFs actuales con xref
 * comprimido; la v1 fallaba con ellos ("Illegal character: 41").
 *
 * @param {Buffer} buffer contenido del PDF
 * @returns {Promise<{text: string, pages: number, info: object|null}>}
 */
export async function extractTextFromPdf(buffer) {
  let parser = null
  try {
    parser = new PDFParse({ data: buffer })
    const result = await parser.getText()

    return {
      text: result.text || '',
      pages: result.total ?? (Array.isArray(result.pages) ? result.pages.length : 0),
      info: result.info ?? null
    }
  } catch (error) {
    console.error('Error extracting PDF text:', error.message)

    if (error.name === 'PasswordException' || /password/i.test(error.message || '')) {
      throw new Error('El PDF está protegido con contraseña')
    }
    throw new Error('No se pudo extraer texto del PDF')
  } finally {
    // Libera los recursos de pdf.js aunque la extracción falle.
    if (parser) {
      try {
        await parser.destroy()
      } catch {
        // Si ya estaba liberado, no hay nada que hacer.
      }
    }
  }
}

export function normalizeText(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\s+/g, ' ')
    .trim()
}

export function extractLines(text) {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
}