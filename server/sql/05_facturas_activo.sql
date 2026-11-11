-- Borrado lógico de facturas: "eliminar" marca inactivo y deja de listarse.
-- Ejecutar en Supabase → SQL Editor (después de 04_clientes.sql)

ALTER TABLE facturas
  ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_facturas_activo ON facturas(activo);

-- Las facturas existentes quedan activas
UPDATE facturas SET activo = true WHERE activo IS NULL;

-- Comprobación:
-- SELECT count(*) FILTER (WHERE activo) AS activas, count(*) FILTER (WHERE NOT activo) AS inactivas FROM facturas;
