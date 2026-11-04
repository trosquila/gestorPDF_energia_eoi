import { createClient } from '@supabase/supabase-js'
import { config } from '../config.js'

let supabase = null

export function getSupabaseClient(useServiceKey = false) {
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