-- Desactivar / reactivar cuentas de usuario.
-- Ejecutar en Supabase → SQL Editor.

-- ============================================================
-- DESACTIVAR TODAS (estado actual: 7 cuentas inactivas)
-- El login responde 403 "Usuario inactivo" y nadie puede entrar.
-- ============================================================
UPDATE usuarios
SET activo = false, updated_at = NOW()
WHERE activo = true;

-- ============================================================
-- REACTIVAR UNA CUENTA CONCRETA COMO ADMIN
-- Cambia el correo por el tuyo.
-- ============================================================
-- UPDATE usuarios
-- SET activo = true, rol = 'admin', updated_at = NOW()
-- WHERE lower(email) = lower('sergio@gmail.com');

-- ============================================================
-- REACTIVAR TODAS
-- ============================================================
-- UPDATE usuarios
-- SET activo = true, updated_at = NOW()
-- WHERE activo = false;

-- ============================================================
-- Comprobación
-- ============================================================
SELECT email, rol, activo
FROM usuarios
ORDER BY rol, email;
