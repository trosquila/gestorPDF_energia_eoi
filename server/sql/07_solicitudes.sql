-- Solicitudes de registro: el alta no crea usuario directamente.
-- Un administrador aprueba o rechaza; solo al aprobar se crea el usuario.
-- Ejecutar en Supabase → SQL Editor (después de 04, 05 y 06)

CREATE TABLE IF NOT EXISTS solicitudes_registro (
  id_solicitud UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'lector' CHECK (rol IN ('admin', 'operador', 'lector')),
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobada', 'rechazada')),
  motivo_rechazo TEXT,
  revisado_por UUID REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
  revisado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_solicitudes_estado ON solicitudes_registro(estado);
CREATE INDEX IF NOT EXISTS idx_solicitudes_email ON solicitudes_registro(lower(email));
CREATE INDEX IF NOT EXISTS idx_solicitudes_fecha ON solicitudes_registro(created_at);

-- Solo puede haber una solicitud pendiente por correo
CREATE UNIQUE INDEX IF NOT EXISTS ux_solicitudes_pendiente_email
  ON solicitudes_registro (lower(email))
  WHERE estado = 'pendiente';

ALTER TABLE solicitudes_registro ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all for service role" ON solicitudes_registro;
CREATE POLICY "Enable all for service role" ON solicitudes_registro FOR ALL USING (true);

-- Comprobación:
-- SELECT estado, count(*) FROM solicitudes_registro GROUP BY estado;
