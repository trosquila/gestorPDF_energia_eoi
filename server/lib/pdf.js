import pdfParse from 'pdf-parse'

export async function extractTextFromPdf(buffer) {
  try {
    const data = await pdfParse(buffer)
    return {
      text: data.text,
      pages: data.numpages,
      info: data.info
    }
  } catch (error) {
    console.error('Error extracting PDF text:', error)
    throw new Error('No se pudo extraer texto del PDF')
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