-- Agregar columna password_hash a usuarios (ejecutar en Supabase SQL Editor)
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Actualizar usuarios existentes con un hash por defecto (cambiar en primer login)
-- Nota: esto es temporal, los usuarios deberán usar "olvidé contraseña" o se les asigna una temporal
UPDATE usuarios SET password_hash = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RK.PZvO.S' WHERE password_hash IS NULL;
-- Hash por defecto para "password123" - OBLIGATORIO cambiar en primer login

-- Hacer la columna NOT NULL después de poblar
ALTER TABLE usuarios ALTER COLUMN password_hash SET NOT NULL;