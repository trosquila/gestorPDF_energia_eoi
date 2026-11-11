-- Tabla clientes + enlace con facturas
-- Ejecutar en Supabase → SQL Editor (igual que 02 y 03)

-- ============================================================
-- CLIENTES
-- ============================================================
CREATE TABLE IF NOT EXISTS clientes (
  id_cliente UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  empresa TEXT NOT NULL,
  email TEXT,
  telefono TEXT,
  direccion_empresa TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clientes_activo ON clientes(activo);
CREATE INDEX IF NOT EXISTS idx_clientes_empresa ON clientes(empresa);
CREATE INDEX IF NOT EXISTS idx_clientes_email ON clientes(email);

-- ============================================================
-- ENLACE FACTURA -> CLIENTE
-- Cada factura pertenece a un cliente; el nombre del archivo en Storage
-- incluye este id.
-- ============================================================
ALTER TABLE facturas
  ADD COLUMN IF NOT EXISTS id_cliente UUID REFERENCES clientes(id_cliente) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_facturas_cliente ON facturas(id_cliente);

-- ============================================================
-- RLS (el backend entra con la clave de servicio, que lo salta)
-- ============================================================
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all for service role" ON clientes;
CREATE POLICY "Enable all for service role" ON clientes FOR ALL USING (true);

-- ============================================================
-- Comprobación
-- ============================================================
-- SELECT count(*) FROM clientes;
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'facturas' AND column_name = 'id_cliente';
