-- Tabla usuarios
CREATE TABLE IF NOT EXISTS usuarios (
  id_usuario UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nombre TEXT,
  rol TEXT CHECK (rol IN ('admin', 'operador', 'lector')) DEFAULT 'lector',
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_activo ON usuarios(activo);

-- Tabla historial (auditoría de cambios en facturas)
CREATE TABLE IF NOT EXISTS historial (
  id_historial UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_factura UUID REFERENCES facturas(id_factura) ON DELETE CASCADE,
  id_usuario UUID REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
  accion TEXT NOT NULL, -- 'crear', 'actualizar', 'eliminar', 'procesar', 'corregir'
  campo_modificado TEXT, -- nombre del campo que cambió
  valor_anterior JSONB,
  valor_nuevo JSONB,
  descripcion TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_historial_factura ON historial(id_factura);
CREATE INDEX IF NOT EXISTS idx_historial_usuario ON historial(id_usuario);
CREATE INDEX IF NOT EXISTS idx_historial_fecha ON historial(created_at);
CREATE INDEX IF NOT EXISTS idx_historial_accion ON historial(accion);

-- Habilitar RLS
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE historial ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all for service role" ON usuarios FOR ALL USING (true);
CREATE POLICY "Enable all for service role" ON historial FOR ALL USING (true);