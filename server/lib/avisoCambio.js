/**
 * Redacción del correo que se envía al cliente cuando una oferta del catálogo
 * es más barata que su factura.
 *
 * Todo lo que aparece en el mensaje viene de datos que ya existen: la factura,
 * la oferta y el coste calculado con `lib/coste.js`. Aquí no se estima nada
 * nuevo; solo se redacta.
 */

const dinero = (valor) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(valor) || 0)

const numero = (valor, decimales = 0) =>
  new Intl.NumberFormat('es-ES', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
    .format(Number(valor) || 0)

const fecha = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
}

const escapar = (texto) =>
  String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const PERIODOS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']

function filasPrecios({ oferta, factura }) {
  const filas = []
  const preciosOferta = oferta.precio_energia || {}
  const preciosActuales = factura.precios_periodo || {}

  for (const p of PERIODOS) {
    const nuevo = Number(preciosOferta[p]) || 0
    const viejo = Number(preciosActuales[p]) || 0
    if (!nuevo && !viejo) continue
    filas.push({
      periodo: p,
      oferta: nuevo ? `${numero(nuevo, 4)} €/kWh` : '—',
      actual: viejo ? `${numero(viejo, 4)} €/kWh` : '—'
    })
  }

  const potencias = []
  for (const p of PERIODOS) {
    const nueva = Number(oferta.precio_potencia?.[p]) || 0
    const vieja = Number(factura.precio_potencia?.[p]) || 0
    if (!nueva && !vieja) continue
    potencias.push({
      periodo: p,
      oferta: nueva ? `${numero(nueva, 2)} €/kW·año` : '—',
      actual: vieja ? `${numero(vieja, 2)} €/kW·año` : '—'
    })
  }

  return { energia: filas, potencia: potencias }
}

/**
 * @returns {{ asunto: string, html: string, texto: string }}
 */
export function construirAviso({ factura, oferta, cliente, coste, ahorro, dias, contacto }) {
  const diasPeriodo = Number(dias) || 30
  const ahorroPeriodo = Number(ahorro) || 0
  const ahorroAnual = ahorroPeriodo * (365 / diasPeriodo)
  const importeActual = Number(factura.importe_total_eur) || 0

  const nombre = (cliente?.nombre || '').split(' ')[0] || cliente?.empresa || 'cliente'
  const empresa = cliente?.empresa || ''
  const comercializadoraActual = factura.comercializadora || 'tu comercializadora actual'
  const ofertaNombre = `${oferta.comercializadora} · ${oferta.nombre}`
  const periodoFactura = factura.periodo_inicio
    ? `${fecha(factura.periodo_inicio)} – ${fecha(factura.periodo_fin)}`
    : `${diasPeriodo} días`

  const precios = filasPrecios({ oferta, factura })

  const asunto = `Puedes ahorrar ${dinero(ahorroAnual)} al año cambiando de tarifa eléctrica`

  // --- Texto plano (clientes de correo sin HTML) ---
  const lineasTexto = [
    `Hola ${nombre}:`,
    '',
    `Hemos revisado tu factura de ${comercializadoraActual}${factura.num_factura ? ` (${factura.num_factura})` : ''} del periodo ${periodoFactura} y hay una oferta más barata en el mercado.`,
    '',
    `Lo que pagas ahora: ${dinero(importeActual)} (${diasPeriodo} días)`,
    `Con ${ofertaNombre}: ${dinero(coste.total)} (${diasPeriodo} días)`,
    `Ahorro en ese periodo: ${dinero(ahorroPeriodo)}`,
    `Ahorro estimado al año: ${dinero(ahorroAnual)}`,
    '',
    'Precios de la energía (€/kWh):',
    ...precios.energia.map((f) => `  ${f.periodo}: ahora ${f.actual} · oferta ${f.oferta}`),
    '',
    'Potencia (€/kW·año):',
    ...precios.potencia.map((f) => `  ${f.periodo}: ahora ${f.actual} · oferta ${f.oferta}`),
    '',
    'Para contratarla o resolver cualquier duda, responde a este correo' +
      (contacto ? ` (${contacto})` : '') +
      ' y te atendemos desde el equipo de Control Energía.',
    '',
    'Es una estimación hecha con los datos de tu última factura. El importe final depende de tu consumo real, de los precios vigentes y de los impuestos aplicables.',
    oferta.origen === 'cnmc'
      ? 'Precios de las ofertas: Comparador de Ofertas de Energía de la CNMC (uso libre con atribución).'
      : `Fuente de la oferta: ${oferta.fuente || 'catálogo propio'}.`,
    '',
    'Recibes este correo porque eres cliente de Control Energía. Si no quieres recibir avisos, responde a este mensaje indicándolo.'
  ]

  // --- HTML (tablas y estilos en línea: los clientes de correo no cargan CSS) ---
  const fila = (etiqueta, actual, nuevo) => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#475569">${escapar(etiqueta)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#334155;text-align:right">${escapar(actual)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#1e293b;text-align:right;font-weight:600">${escapar(nuevo)}</td>
    </tr>`

  const tablaPrecios = (titulo, filas, columnaNueva) => filas.length === 0 ? '' : `
    <h3 style="margin:24px 0 8px;font-size:14px;color:#1e293b">${escapar(titulo)}</h3>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
      <thead>
        <tr style="background:#f8fafc">
          <th style="padding:8px 10px;text-align:left;font-size:11px;letter-spacing:.04em;color:#64748b;text-transform:uppercase">Periodo</th>
          <th style="padding:8px 10px;text-align:right;font-size:11px;letter-spacing:.04em;color:#64748b;text-transform:uppercase">Ahora</th>
          <th style="padding:8px 10px;text-align:right;font-size:11px;letter-spacing:.04em;color:#64748b;text-transform:uppercase">${escapar(columnaNueva)}</th>
        </tr>
      </thead>
      <tbody>
        ${filas.map((f) => fila(f.periodo, f.actual, f.oferta)).join('')}
      </tbody>
    </table>`

  const html = `<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">

          <tr>
            <td style="background:#1e40af;padding:20px 24px">
              <span style="color:#ffffff;font-size:18px;font-weight:700">Control Energía</span>
              <div style="color:#c7d2fe;font-size:12px;margin-top:2px">Gestión y ahorro en tu factura de la luz</div>
            </td>
          </tr>

          <tr>
            <td style="padding:24px">
              <p style="margin:0 0 12px;font-size:15px;color:#1e293b">Hola ${escapar(nombre)}:</p>
              <p style="margin:0 0 16px;font-size:14px;color:#475569;line-height:1.6">
                Hemos revisado tu factura de <strong>${escapar(comercializadoraActual)}</strong>${factura.num_factura ? ` (${escapar(factura.num_factura)})` : ''}
                del periodo ${escapar(periodoFactura)} y hay una oferta del mercado más barata que la que tienes contratada.
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;margin:0 0 20px">
                <tr>
                  <td style="padding:16px 20px">
                    <div style="font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#1e40af">Ahorro estimado al año</div>
                    <div style="font-size:30px;font-weight:700;color:#1e40af;line-height:1.2">${dinero(ahorroAnual)}</div>
                    <div style="font-size:13px;color:#475569;margin-top:4px">
                      ${dinero(ahorroPeriodo)} en el periodo facturado (${diasPeriodo} días)
                    </div>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
                <thead>
                  <tr style="background:#f8fafc">
                    <th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.04em">Concepto</th>
                    <th style="padding:8px 10px;text-align:right;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.04em">Ahora</th>
                    <th style="padding:8px 10px;text-align:right;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.04em">Con la oferta</th>
                  </tr>
                </thead>
                <tbody>
                  ${fila(`Total del periodo (${diasPeriodo} días)`, dinero(importeActual), dinero(coste.total))}
                  ${fila('Término de potencia', '—', dinero(coste.potencia))}
                  ${fila('Energía consumida', '—', dinero(coste.energia))}
                  ${fila('Impuesto eléctrico + IVA', '—', dinero(coste.impuesto + coste.iva))}
                  ${fila('Alquiler de contador', '—', dinero(coste.alquiler))}
                </tbody>
              </table>

              <p style="margin:12px 0 0;font-size:12px;color:#64748b">
                Oferta: <strong>${escapar(ofertaNombre)}</strong>${oferta.tipo ? ` · tarifa ${escapar(oferta.tipo)}` : ''}.
              </p>

              ${tablaPrecios('Precio de la energía', precios.energia, 'Oferta')}
              ${tablaPrecios('Término de potencia', precios.potencia, 'Oferta')}

              <p style="margin:24px 0 8px;font-size:14px;color:#1e293b;font-weight:600">¿Quieres cambiar?</p>
              <p style="margin:0 0 8px;font-size:14px;color:#475569;line-height:1.6">
                Responde a este correo (o escríbenos a ${escapar(contacto || 'nuestro equipo')}) y nos encargamos del cambio:
                comprobamos la oferta, preparamos la documentación y coordinamos la alta con la comercializadora.
                El cambio no tiene coste y no deja sin suministro en ningún momento.
              </p>
              <p style="margin:0;font-size:14px;color:#475569;line-height:1.6">
                Equipo de <strong>Control Energía</strong>
              </p>

              <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0 12px">
              <p style="margin:0 0 6px;font-size:11px;color:#94a3b8;line-height:1.5">
                Es una estimación calculada con las potencias y el consumo de tu última factura${empresa ? ` (${escapar(empresa)})` : ''}.
                El importe final depende de tu consumo real, de los precios vigentes en el momento del alta y de los impuestos aplicables.
                No se han considerado promociones que la comercializadora no publique.
              </p>
              <p style="margin:0 0 6px;font-size:11px;color:#94a3b8;line-height:1.5">
                ${oferta.origen === 'cnmc'
                  ? 'Precios de las ofertas: Comparador de Ofertas de Energía de la CNMC. El uso de esta información es libre con mención de su procedencia.'
                  : `Fuente de la oferta: ${escapar(oferta.fuente || 'catálogo propio de Control Energía')}.`}
              </p>
              <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.5">
                Recibes este correo porque eres cliente de Control Energía. Si no quieres recibir avisos de ahorro, responde a este mensaje y te damos de baja.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  return {
    asunto,
    html,
    texto: lineasTexto.join('\n'),
    cifras: { importeActual, costeOferta: coste.total, ahorroPeriodo, ahorroAnual, dias: diasPeriodo }
  }
}
