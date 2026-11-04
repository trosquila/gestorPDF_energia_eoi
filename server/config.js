import 'dotenv/config'

export const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceKey: process.env.SUPABASE_SERVICE_KEY
  },
  
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4o-mini'
  },
  
  pdf: {
    maxSize: 10 * 1024 * 1024 // 10MB
  },
  
  comercializadoras: [
    'Endesa',
    'Iberdrola',
    'Naturgy',
    'Repsol',
    'EDP',
    'TotalEnergies',
    'Factor Energía',
    'Holaluz',
    'Lucera',
    'Podo',
    'Gana Energía',
    'Octopus Energy'
  ],
  
  conceptosValidos: [
    'potencia',
    'energía',
    'peajes',
    'cargos',
    'impuesto electricidad',
    'iva',
    'alquiler contador'
  ],
  
  periodosTarifarios: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']
}