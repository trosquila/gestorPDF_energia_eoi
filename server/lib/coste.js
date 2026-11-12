/**
 * Cálculo del coste de una oferta con un perfil de consumo.
 * Compartido por el comparador y la analítica para que ambos den la misma cifra.
 */

export const IMPUESTO_ELECTRICO = 0.0511 // 5,11 % sobre potencia + energía
export const IVA = 0.21                 // 21 % sobre el subtotal con impuesto

export const PERIODOS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']

export function aNumero(valor, defecto = 0) {
  const n = typeof valor === 'number' ? valor : Number(String(valor ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : defecto
}

export function redondear(valor) {
  return Number(Number(valor).toFixed(2))
}

/** Normaliza los mapas por periodo que llegan del cliente. */
export function mapaPeriodos(valor) {
  const salida = {}
  if (!valor || typeof valor !== 'object') return salida
  for (const [periodo, cantidad] of Object.entries(valor)) {
    const clave = String(periodo).toUpperCase()
    if (!PERIODOS.includes(clave)) continue
    const n = aNumero(cantidad, null)
    if (n === null || n < 0) continue
    salida[clave] = n
  }
  return salida
}

/**
 * Coste anual (o del periodo indicado) de una oferta.
 * @param {object} oferta fila de la tabla ofertas
 * @param {{ potencias: object, consumos: object, excedentes_kwh?: number, dias?: number }} perfil
 */
export function costeDeOferta(oferta, perfil) {
  const dias = perfil.dias || 365
  const fraccion = dias / 365

  let potencia = 0
  for (const [periodo, kw] of Object.entries(perfil.potencias || {})) {
    potencia += kw * aNumero(oferta.precio_potencia?.[periodo])
  }
  potencia *= fraccion

  let energia = 0
  for (const [periodo, kwh] of Object.entries(perfil.consumos || {})) {
    energia += kwh * aNumero(oferta.precio_energia?.[periodo])
  }

  const consumoTotal = Object.values(perfil.consumos || {}).reduce((t, v) => t + aNumero(v), 0)
  const excedentes = aNumero(oferta.precio_excedentes) * Math.min(aNumero(perfil.excedentes_kwh), consumoTotal)
  const alquiler = aNumero(oferta.alquiler_contador) * (dias / 30.44)

  const subtotal = Math.max(0, potencia + energia - excedentes + alquiler)
  const impuesto = subtotal * IMPUESTO_ELECTRICO
  const iva = (subtotal + impuesto) * IVA
  const total = subtotal + impuesto + iva

  return {
    potencia: redondear(potencia),
    energia: redondear(energia),
    excedentes: redondear(excedentes),
    alquiler: redondear(alquiler),
    impuesto: redondear(impuesto),
    iva: redondear(iva),
    total: redondear(total)
  }
}
