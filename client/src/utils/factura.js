// Utilidades compartidas por las vistas de factura.

const EXT_IMAGEN = /\.(jpe?g|png|webp|tiff?|bmp)$/i

/** true si el archivo guardado en la factura es una imagen (data URL o ruta del bucket). */
export function esImagenDe(factura) {
  const ruta = String(factura?.ruta_pdf || '')
  if (ruta.startsWith('data:image/')) return true
  if (ruta.startsWith('data:application/pdf')) return false
  return EXT_IMAGEN.test(ruta)
}

/** true si el nombre local del archivo (File) corresponde a una imagen. */
export function esImagenPorNombre(nombre) {
  return EXT_IMAGEN.test(String(nombre || ''))
}

/** URL para el visor: la firmada si existe, si no la ruta cruda. */
export function urlDelArchivo(factura) {
  return factura?.ruta_pdf_url || factura?.ruta_pdf || null
}
