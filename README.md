# Control Energía - Procesamiento Automático de Facturas de Energía

Sistema para automatizar la extracción de datos de facturas de energía españolas usando un enfoque híbrido: **regex primero, LLM (GPT-4o-mini) como respaldo**.

## 🏗️ Arquitectura

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Vue 3     │────▶│  Express    │────▶│  Supabase   │
│  (Client)   │     │  (Server)   │     │  (Postgres) │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  pdf-parse  │
                    │  + regex    │
                    │  + GPT-4o   │
                    └─────────────┘
```

- **Frontend**: Vue 3 + Vite + Pinia + Chart.js → Vercel (projecto `client`)
- **Backend**: Express + pdf-parse + OpenAI → Vercel Serverless Functions (projecto `server`)
- **Database**: Supabase (PostgreSQL)
- **Despliegue**: Dos proyectos Vercel separados con variables de entorno independientes

## 📋 Características

### Flujo de Procesamiento
1. **Subida PDF** → Extracción texto con `pdf-parse`
2. **Capa de Reglas** → Regex para CUPS, fechas, importes, NIF, comercializadora
3. **Decisión Híbrida**:
   - ✅ Campos obligatorios cubiertos → Guardar (estado `ok`, método `regla`)
   - ⚠️ Faltan campos → LLM GPT-4o-mini completa → Guardar (estado `revisión`, método `mixto`)
4. **Supabase** → Persistencia con trazabilidad por campo
5. **UI** → Visualización, corrección humana, analítica

### Vistas
1. **Detalle** - Subida PDF, vista lado a lado, campos editables con indicador método (regla/LLM), semáforo confianza
2. **Lote** - Tabla filtrable, métricas clave (% solo reglas), acciones
3. **Analítica** - Consumo por CUPS (línea), desglose cargos (barras apiladas), ranking suministros, alertas precio/kWh atípico

### Métricas de Éxito (MVP)
- ✅ 20+ facturas de 2-3 comercializadoras
- ✅ >60% resueltas solo con reglas
- ✅ Tiempo procesamiento: segundos
- ✅ Ciclo completo: PDF → reglas → (LLM) → Supabase → UI → corrección

## 🚀 Instalación Local

### Prerrequisitos
- Node.js 20+
- Cuenta Supabase (proyecto nuevo)
- Cuenta OpenAI (opcional, para LLM fallback)
- Vercel CLI (`npm i -g vercel`)

### 1. Clonar y configurar

```bash
cd control-energia

# Server
cd server
cp .env.example .env
# Editar .env con tus credenciales Supabase y OpenAI
npm install

# Client
cd ../client
cp .env.example .env
# Editar .env con VITE_API_URL (ej: http://localhost:3000/api para dev local)
npm install
```

### 2. Inicializar Base de Datos

En Supabase SQL Editor, ejecutar:

```sql
-- Tabla facturas
CREATE TABLE facturas (
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

CREATE INDEX idx_facturas_cups ON facturas(cups);
CREATE INDEX idx_facturas_comercializadora ON facturas(comercializadora);
CREATE INDEX idx_facturas_fecha ON facturas(fecha_emision);
CREATE INDEX idx_facturas_estado ON facturas(estado_extraccion);

-- Habilitar RLS (opcional, para producción)
ALTER TABLE facturas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for service role" ON facturas FOR ALL USING (true);
```

### 3. Desarrollo Local

```bash
# Terminal 1 - Server
cd server
npm run dev  # Puerto 3000

# Terminal 2 - Client
cd client
npm run dev  # Puerto 5173 (proxy a /api → localhost:3000)
```

Abrir http://localhost:5173

### 4. Cargar Datos de Prueba (IDSEM)

En la vista **Detalle**, botón "Probar con facturas de ejemplo" o vía API:

```bash
curl -X POST http://localhost:3000/api/ejemplos/seed
```

## 🌐 Despliegue en Vercel

### Opción A: Vercel CLI (recomendado)

```bash
# Login
vercel login

# Desplegar Server (API)
cd server
vercel --prod
# → Copia la URL (ej: https://control-energia-api.vercel.app)

# Desplegar Client
cd ../client
# Actualizar .env con VITE_API_URL=https://control-energia-api.vercel.app/api
vercel --prod
```

### Opción B: GitHub + Vercel Dashboard

1. Push a GitHub (repositorio `control-energia` con carpetas `client/` y `server/`)
2. En Vercel Dashboard → **Add New Project** → Importar repo
3. **Project 1 (Server)**:
   - Root Directory: `server`
   - Framework: Other
   - Build Command: `npm install`
   - Output Directory: (vacío)
   - Variables de entorno: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `OPENAI_API_KEY`
4. **Project 2 (Client)**:
   - Root Directory: `client`
   - Framework: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Variables de entorno: `VITE_API_URL` = URL del Project 1 + `/api`

## 📁 Estructura del Proyecto

```
control-energia/
├── client/                 # Vue 3 + Vite
│   ├── src/
│   │   ├── components/     # FieldInput.vue
│   │   ├── views/          # DetalleView, LoteView, AnaliticaView
│   │   ├── stores/         # facturas.js (Pinia)
│   │   ├── services/       # api.js (axios)
│   │   ├── router/         # index.js
│   │   ├── App.vue
│   │   ├── main.js
│   │   └── style.css
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   └── vercel.json
├── server/                 # Express + Vercel Functions
│   ├── api/
│   │   └── index.js        # Entry point
│   ├── lib/
│   │   ├── supabase.js     # Cliente Supabase
│   │   ├── pdf.js          # pdf-parse wrapper
│   │   ├── extraction.js   # Regex rules
│   │   └── llm.js          # OpenAI GPT-4o-mini
│   ├── routes/
│   │   ├── facturas.js     # CRUD + upload + metricas
│   │   ├── ejemplos.js     # Dataset IDSEM mock
│   │   └── analitica.js    # Agregaciones
│   ├── config.js
│   ├── package.json
│   └── vercel.json
└── README.md
```

## 🔧 Configuración Avanzada

### Añadir Comercializadoras
Editar `server/config.js`:
```js
comercializadoras: [
  'Endesa', 'Iberdrola', 'Naturgy', 'Repsol', 'EDP',
  'TuNuevaComercializadora'  // Añadir aquí
]
```

### Ajustar Patrones Regex
Editar `server/lib/extraction.js` → `PATTERNS` object

### Cambiar Modelo LLM
Editar `server/config.js`:
```js
openai: {
  model: 'gpt-4o-mini'  // o 'gpt-4o', 'gpt-3.5-turbo'
}
```

### Tarifa 3.0TD (6 periodos, 6 potencias)
- Añadir P4-P6 a `periodosTarifarios` en `config.js`
- Actualizar `conceptoKeywords` y `periodoPatterns` en `extraction.js`
- Ampliar schema `lineas` si se necesita granularidad completa

## 🧪 Testing

```bash
# Server tests
cd server
npm test

# Client tests (cuando se añadan)
cd client
npm test
```

## 📊 Métricas Clave del Enfoque Híbrido

| Métrica | Objetivo MVP |
|---------|--------------|
| % facturas solo reglas | >60% |
| Precisión campos obligatorios | >90% |
| Tiempo procesamiento/factura | <5s |
| Coste LLM/factura (fallback) | ~$0.001 |

## 🤝 Contribuir

1. Fork → Feature branch → PR
2. Commits: Conventional Commits en español (`feat:`, `fix:`, `refactor:`, `chore:`)
3. Etiquetas opcionales: `[BACKEND]`, `[FRONTEND]`

## 📄 Licencia

MIT - Uso libre para proyectos personales y comerciales.