import { createClient } from '@supabase/supabase-js'
import { config } from '../config.js'
import bcrypt from 'bcrypt'

let supabase = null

const BCRYPT_ROUNDS = 12

export function getSupabaseClient(useServiceKey = true) {
  if (!supabase) {
    const key = useServiceKey ? config.supabase.serviceKey : config.supabase.anonKey
    if (!config.supabase.url || !key) {
      throw new Error('Supabase credentials not configured')
    }
    supabase = createClient(config.supabase.url, key)
  }
  return supabase
}

export async function initDatabase() {
  const client = getSupabaseClient(true)
  
  const { error } = await client.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS facturas (
        id_factura UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        num_factura TEXT,
        fecha_emision DATE,
        periodo_inicio DATE,
        periodo_fin DATE,
        titular TEXT,
        nif TEXT,
        cups TEXT,
        direccion_suministro TEXT,
        comercializadora TEXT,
        tipo_contrato TEXT,
        peaje_acceso TEXT,
        consumo_total_kwh NUMERIC(12,2),
        importe_total_eur NUMERIC(12,2),
        estado_extraccion TEXT CHECK (estado_extraccion IN ('ok', 'revisión', 'error')) DEFAULT 'revisión',
        confianza NUMERIC(3,2),
        ruta_pdf TEXT,
        metodo_extraccion TEXT CHECK (metodo_extraccion IN ('regla', 'llm', 'mixto')) DEFAULT 'regla',
        metodos_extraccion JSONB DEFAULT '{}',
        lineas JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_facturas_cups ON facturas(cups);
      CREATE INDEX IF NOT EXISTS idx_facturas_comercializadora ON facturas(comercializadora);
      CREATE INDEX IF NOT EXISTS idx_facturas_fecha ON facturas(fecha_emision);
      CREATE INDEX IF NOT EXISTS idx_facturas_estado ON facturas(estado_extraccion);
    `
  })
  
  if (error) {
    console.error('Error initializing database:', error)
  } else {
    console.log('Database initialized')
  }
}

// === USUARIOS ===
export async function createUsuario({ email, password, nombre, rol = 'lector' }) {
  if (!password || password.length < 8) {
    throw new Error('La contraseña debe tener al menos 8 caracteres')
  }
  const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS)
  const client = getSupabaseClient(true)
  const { data, error } = await client
    .from('usuarios')
    .insert({ email, password_hash, nombre, rol })
    .select('id_usuario, email, nombre, rol, activo, created_at, updated_at')
    .single()
  if (error) throw error
  return data
}

export async function verifyPassword(email, password) {
  const usuario = await getUsuarioByEmail(email)
  if (!usuario) return null
  const valid = await bcrypt.compare(password, usuario.password_hash)
  if (!valid) return null
  // Return user without password_hash
  const { password_hash, ...userWithoutPassword } = usuario
  return userWithoutPassword
}

export async function getUsuarioByEmail(email) {
  const client = getSupabaseClient()
  const { data, error } = await client
    .from('usuarios')
    .select('*')
    .eq('email', email)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data
}

export async function getUsuarios({ activo = true } = {}) {
  const client = getSupabaseClient()
  let query = client.from('usuarios').select('id_usuario, email, nombre, rol, activo, created_at, updated_at').order('created_at', { ascending: false })
  if (activo !== undefined) query = query.eq('activo', activo)
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function updateUsuario(id_usuario, updates) {
  const client = getSupabaseClient(true)
  const { data, error } = await client
    .from('usuarios')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id_usuario', id_usuario)
    .select()
    .single()
  if (error) throw error
  return data
}

// === HISTORIAL ===
export async function createHistorial({ id_factura, id_usuario, accion, campo_modificado, valor_anterior, valor_nuevo, descripcion, ip, user_agent }) {
  const client = getSupabaseClient(true)
  const { data, error } = await client
    .from('historial')
    .insert({ id_factura, id_usuario, accion, campo_modificado, valor_anterior, valor_nuevo, descripcion, ip, user_agent })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getHistorialByFactura(id_factura, { limit = 50, offset = 0 } = {}) {
  const client = getSupabaseClient()
  const { data, error, count } = await client
    .from('historial')
    .select('*, usuarios!inner(nombre, email)', { count: 'exact' })
    .eq('id_factura', id_factura)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw error
  return { data, total: count, limit, offset }
}

export async function getHistorial({ id_usuario, accion, fecha_desde, fecha_hasta, limit = 100, offset = 0 } = {}) {
  const client = getSupabaseClient()
  let query = client.from('historial').select('*, usuarios!inner(nombre, email), facturas!inner(num_factura, comercializadora)', { count: 'exact' })
  
  if (id_usuario) query = query.eq('id_usuario', id_usuario)
  if (accion) query = query.eq('accion', accion)
  if (fecha_desde) query = query.gte('created_at', fecha_desde)
  if (fecha_hasta) query = query.lte('created_at', fecha_hasta)
  
  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1)
  
  const { data, error, count } = await query
  if (error) throw error
  return { data, total: count, limit, offset }
}