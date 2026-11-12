-- Cambiar de rol / desactivar cuentas con contraseña débil.
-- Ejecutar en Supabase → SQL Editor.
-- IMPORTANTE: tiene que quedar SIEMPRE al menos un usuario con rol 'admin',
-- o el panel de solicitudes desaparece para todos.

-- ============================================================
-- 1) Ascender tu cuenta real (CAMBIA el correo antes de ejecutar)
-- ============================================================
UPDATE usuarios
SET rol = 'admin', updated_at = NOW()
WHERE lower(email) = lower('tu-correo@gmail.com');

-- ============================================================
-- 2) Bajar admin@gmail.com a lector
-- ============================================================
UPDATE usuarios
SET rol = 'lector', updated_at = NOW()
WHERE lower(email) = lower('admin@gmail.com');

-- ============================================================
-- 3) Extra: desactivar esa cuenta si no se va a usar
--    (el login responderá "Usuario inactivo")
-- ============================================================
-- UPDATE usuarios
-- SET activo = false, updated_at = NOW()
-- WHERE lower(email) = lower('admin@gmail.com');

-- ============================================================
-- 4) Comprobación: al menos una fila con rol 'admin'
-- ============================================================
SELECT email, rol, activo
FROM usuarios
ORDER BY rol, email;
