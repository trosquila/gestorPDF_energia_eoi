-- Catálogo de ofertas comerciales para el comparador.
-- No existe API pública con las tarifas de las comercializadoras, así que el
-- catálogo es propio y auditable: cada fila es una oferta con su fuente y fecha.

CREATE TABLE IF NOT EXISTS ofertas (
  id_oferta        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercializadora text NOT NULL,
  nombre           text NOT NULL,
  tipo             text NOT NULL DEFAULT 'fijo'
                     CHECK (tipo IN ('fijo', 'indexado', 'pvpc')),
  -- Peajes en los que se puede contratar: 2.0TD, 3.0TD, 6.1TD...
  peajes           text[] NOT NULL DEFAULT '{2.0TD}',

  -- Precios por periodo. Con fijo son €/kWh por P1..P6; en indexado, el margen
  -- que se suma al precio de mercado (también en €/kWh).
  precio_energia   jsonb,
  -- €/kW/año por periodo
  precio_potencia  jsonb,
  -- Compensación de excedentes en €/kWh (0 si no aplica)
  precio_excedentes numeric DEFAULT 0,
  -- €/mes de alquiler de contador incluido (0 si la oferta lo asume)
  alquiler_contador numeric DEFAULT 0,
  servicios_incluidos text,

  -- null = disponible en toda España; si no, solo en esas provincias
  provincias       text[],
  vigencia_desde   date,
  vigencia_hasta   date,
  fuente           text,
  actualizado_en   timestamptz DEFAULT now(),
  activo           boolean DEFAULT true,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ofertas_tipo ON ofertas (tipo);
CREATE INDEX IF NOT EXISTS idx_ofertas_activo ON ofertas (activo);

-- Comprobación
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'ofertas'
ORDER BY ordinal_position;
