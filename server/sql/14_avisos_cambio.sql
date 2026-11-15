-- Avisos de cambio de oferta enviados al cliente por correo.
-- Guarda el mensaje exacto que se envió (o se intentó enviar), el ahorro
-- calculado y el resultado del proveedor, para poder auditar y no duplicar.

CREATE TABLE IF NOT EXISTS avisos_cambio (
  id_aviso       uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  id_factura     uuid REFERENCES facturas(id_factura) ON DELETE SET NULL,
  id_oferta      uuid REFERENCES ofertas(id_oferta)  ON DELETE SET NULL,
  id_cliente     uuid REFERENCES clientes(id_cliente) ON DELETE SET NULL,

  email_destino  text NOT NULL,
  asunto         text NOT NULL,
  cuerpo_texto   text,
  cuerpo_html    text,

  -- Cifras en el momento del envío: la factura y la oferta pueden cambiar.
  coste_actual   numeric(12,2),
  coste_oferta   numeric(12,2),
  ahorro_mes     numeric(12,2),
  ahorro_anual   numeric(12,2),
  dias_periodo   integer,

  -- registrado = sin proveedor configurado (queda en la base, no se entrega)
  estado         text NOT NULL DEFAULT 'pendiente'
                   CHECK (estado IN ('pendiente', 'enviado', 'registrado', 'error')),
  proveedor      text,
  id_externo     text,
  error          text,
  enviado_en     timestamptz,

  id_usuario     uuid,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_avisos_factura ON avisos_cambio (id_factura);
CREATE INDEX IF NOT EXISTS idx_avisos_cliente ON avisos_cambio (id_cliente);
CREATE INDEX IF NOT EXISTS idx_avisos_fecha   ON avisos_cambio (created_at DESC);

-- El backend entra con la clave de servicio, que se salta RLS.
ALTER TABLE avisos_cambio ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all for service role" ON avisos_cambio;
CREATE POLICY "Enable all for service role" ON avisos_cambio FOR ALL USING (true);

-- Comprobación
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'avisos_cambio'
ORDER BY ordinal_position;
