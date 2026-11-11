-- Permite el método de extracción 'manual' (formulario rellenado a mano).
-- Ejecutar en Supabase → SQL Editor. Sin esto el backend guarda esas facturas
-- como 'regla' (funciona igual, pero pierde el matiz).

ALTER TABLE facturas DROP CONSTRAINT IF EXISTS facturas_metodo_extraccion_check;

ALTER TABLE facturas
  ADD CONSTRAINT facturas_metodo_extraccion_check
  CHECK (metodo_extraccion IN ('regla', 'llm', 'mixto', 'manual'));

-- Comprobación:
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'facturas_metodo_extraccion_check';
