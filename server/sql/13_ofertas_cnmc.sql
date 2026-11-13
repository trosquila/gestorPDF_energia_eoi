-- Catálogo automático desde la API pública de la CNMC.
-- Fuente: https://comparador.cnmc.gob.es/api/APIPublica/ofertas?fecha=dd/MM/yyyy
-- Licencia de la CNMC: "El uso de esta información es libre", con mención
-- obligatoria al Comparador de Ofertas de Energía de la CNMC.

ALTER TABLE ofertas
  ADD COLUMN IF NOT EXISTS id_externo         text,
  ADD COLUMN IF NOT EXISTS origen             text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS web_oferta         text,
  ADD COLUMN IF NOT EXISTS tipo_plan          text,
  ADD COLUMN IF NOT EXISTS descuento_energia  numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS descuento_potencia numeric DEFAULT 0;

-- Clave natural: dominio|nombre de la oferta|fecha de inicio.
-- Índice único NO parcial: Postgres ya admite varios NULL, y PostgREST solo
-- reconoce como ON CONFLICT los índices únicos completos.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ofertas_id_externo
  ON ofertas (id_externo);

CREATE INDEX IF NOT EXISTS idx_ofertas_origen ON ofertas (origen);

COMMENT ON COLUMN ofertas.origen IS 'manual | cnmc';
COMMENT ON COLUMN ofertas.id_externo IS 'Clave estable de la oferta en la fuente (dominio|nombre|fechaDesde)';
COMMENT ON COLUMN ofertas.descuento_energia IS 'Porcentaje de descuento sobre energía publicado por la CNMC (ya aplicado en precio_energia)';

-- Comprobación
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'ofertas'
ORDER BY ordinal_position;
