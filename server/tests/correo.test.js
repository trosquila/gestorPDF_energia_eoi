import { describe, it, expect, afterEach } from 'vitest'
import { esEmailValido, estadoCorreo } from '../lib/correo.js'
import { construirAviso } from '../lib/avisoCambio.js'

const VARIABLES = ['CORREO_TRANSPORTE', 'RESEND_API_KEY', 'CORREO_REMITENTE', 'CORREO_CONTACTO', 'SMTP_HOST', 'SMTP_USER']

afterEach(() => {
  for (const clave of VARIABLES) delete process.env[clave]
})

describe('validación de correo', () => {
  it('acepta correos normales', () => {
    for (const bueno of ['ana@empresa.es', 'a.b+c@sub.dominio.com', 'x@y.io']) {
      expect(esEmailValido(bueno), bueno).toBe(true)
    }
  })

  it('rechaza lo que no es un correo', () => {
    for (const malo of ['', null, undefined, 'sin-arroba', 'a@b', 'dos@@dominio.com', 'a b@c.com', 'a@b..com']) {
      expect(esEmailValido(malo), String(malo)).toBe(false)
    }
  })
})

describe('estado del transporte', () => {
  it('sin credenciales queda en modo registro y no finge que envía', () => {
    delete process.env.CORREO_TRANSPORTE
    const estado = estadoCorreo()
    expect(estado.transporte).toBe('registro')
    expect(estado.disponible).toBe(false)
    expect(estado.motivo).toMatch(/RESEND_API_KEY|SMTP/)
  })

  it('con RESEND_API_KEY usa resend', () => {
    process.env.RESEND_API_KEY = 're_prueba'
    process.env.CORREO_REMITENTE = 'Control Energía <avisos@dominio.es>'
    const estado = estadoCorreo()
    expect(estado.transporte).toBe('resend')
    expect(estado.disponible).toBe(true)
    expect(estado.remitente).toContain('avisos@dominio.es')
  })

  it('con SMTP_HOST y SMTP_USER usa smtp', () => {
    process.env.SMTP_HOST = 'smtp.dominio.es'
    process.env.SMTP_USER = 'avisos@dominio.es'
    const estado = estadoCorreo()
    expect(estado.transporte).toBe('smtp')
    expect(estado.disponible).toBe(true)
  })
})

describe('redacción del aviso', () => {
  const factura = {
    num_factura: 'F-2026-03',
    comercializadora: 'Lumisa',
    periodo_inicio: '2026-03-01',
    periodo_fin: '2026-03-31',
    importe_total_eur: 134.25,
    dias_facturados: 31,
    precios_periodo: { P1: 0.1984, P2: 0.1452, P3: 0.0987 },
    precio_potencia: { P1: 33.64, P2: 16.22 }
  }
  const oferta = {
    comercializadora: 'Comercializadora <b>Prueba</b>',
    nombre: 'Tarifa Plana',
    tipo: 'fijo',
    origen: 'cnmc',
    precio_energia: { P1: 0.0995, P2: 0.0995, P3: 0.0995 },
    precio_potencia: { P1: 34, P2: 34 }
  }
  const coste = { potencia: 12.5, energia: 44.2, impuesto: 2.9, iva: 11.2, alquiler: 0.81, total: 96.37 }

  const aviso = construirAviso({
    factura,
    oferta,
    cliente: { nombre: 'Ana Ferrer', empresa: 'Panadería <Demo>' },
    coste,
    ahorro: 37.88,
    dias: 31,
    contacto: 'equipo@control-energia.es'
  })

  it('el asunto lleva el ahorro anualizado, no el del periodo', () => {
    // 37,88 € en 31 días ≈ 446 € al año
    expect(aviso.asunto).toContain('446,01')
    expect(aviso.asunto).not.toContain('37,88')
  })

  it('texto y HTML dicen lo mismo', () => {
    for (const clave of ['134,25', '96,37', '37,88', '446,01']) {
      expect(aviso.texto, `texto ${clave}`).toContain(clave)
      expect(aviso.html, `html ${clave}`).toContain(clave)
    }
  })

  it('incluye el contacto del equipo y la atribución de la CNMC', () => {
    expect(aviso.texto).toContain('equipo@control-energia.es')
    expect(aviso.html).toContain('equipo@control-energia.es')
    expect(aviso.texto).toMatch(/CNMC/)
    expect(aviso.html).toMatch(/CNMC/)
  })

  it('escapa el HTML que venga de la base de datos', () => {
    expect(aviso.html).not.toContain('<b>Prueba</b>')
    expect(aviso.html).toContain('&lt;b&gt;Prueba&lt;/b&gt;')
    expect(aviso.html).not.toContain('Panadería <Demo>')
  })

  it('las cifras del correo son las del cálculo, sin recalcular', () => {
    expect(aviso.cifras).toEqual({
      importeActual: 134.25,
      costeOferta: 96.37,
      ahorroPeriodo: 37.88,
      ahorroAnual: 446.0064516129032,
      dias: 31
    })
  })
})
