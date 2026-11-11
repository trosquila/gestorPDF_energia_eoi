-- Convertir un usuario existente en administrador.
-- CAMBIA el correo por el tuyo antes de ejecutar.
-- Ejecutar en Supabase → SQL Editor (después de 07_solicitudes.sql)

UPDATE usuarios
SET rol = 'admin', updated_at = NOW()
WHERE lower(email) = lower('admin@gmail.com');

-- Comprobación: debe devolver al menos una fila
SELECT id_usuario, email, nombre, rol, activo
FROM usuarios
WHERE rol = 'admin';

-- Nota: el panel de solicitudes solo aparece en el menú si el usuario
-- logueado tiene rol 'admin'. Hay que volver a iniciar sesión después.
