# Control Energía

Gestión de facturas de electricidad: se suben en PDF o foto, se leen con OCR + IA,
se archivan por cliente y con esos datos se analiza el gasto y se comparan las
ofertas de todas las comercializadoras españolas.

| Documento | Para quién |
|---|---|
| **[README-usuario.md](README-usuario.md)** | Manual de uso: qué se puede hacer y cómo, paso a paso |
| **[README-tecnico.md](README-tecnico.md)** | Cómo funciona cada parte, de dónde sale cada dato, API, base de datos y despliegue |
| [docs/estilos-y-estetica.txt](docs/estilos-y-estetica.txt) | Guía de estilos de la interfaz |
| [docs/informe-plan-comparador.md](docs/informe-plan-comparador.md) | Informe del comparador de precios |

## Qué hace

- **Subida y lectura**: PDF (capa de texto) o imagen (OCR). Si el PDF está
  escaneado, se renderiza y se pasa OCR. Después un modelo de IA extrae los campos
  y un extractor por reglas los valida y completa.
- **Ficha editable**: suministro y contrato, potencias contratada y máxima
  demandada por periodo, energía por periodo, desglose económico y autoconsumo.
  Todo cambio queda en el historial.
- **Lote**: listado filtrable con navegación anterior/siguiente entre facturas.
- **Analítica**: evolución mensual, reparto de cargos, sobrecontratación,
  ahorro potencial y avisos accionables. Filtros por fecha, comercializadora,
  provincia, cliente y estado.
- **Comparador**: perfil de consumo → ranking de ofertas + PVPC estimado, con
  catálogo oficial de la CNMC, alta manual, importación CSV y asistente de IA.
- **Clientes y solicitudes**: CRUD de clientes (admin) y aprobación de registros.
- **Listados paginados**: todas las tablas largas (facturas, clientes, catálogo,
  ranking, analítica) van por páginas de 10, 15 o 25 filas, sin barras de
  desplazamiento dentro de la página.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | Vue 3 + Vite + Pinia + Vue Router + Chart.js |
| Backend | Node + Express (ESM) sobre funciones de Vercel |
| Datos | Supabase (Postgres vía PostgREST) + Storage privado |
| Documentos | `pdf-parse@2`, `tesseract.js@5` (spa+eng), `@napi-rs/canvas` |
| IA | OpenRouter con modelos `:free` en cascada |
| Precios | `apidatos.ree.es` (sin token) |
| Ofertas | API pública del Comparador de la CNMC |

## Arranque local

```bash
# API
cd server
cp .env.example .env      # SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY, OPENROUTER_API_KEY
npm install
node api/index.js         # http://localhost:3000

# Web
cd ../client
npm install
node node_modules/vite/bin/vite.js   # http://localhost:5173
```

Las migraciones de `server/sql/` se ejecutan **a mano** en el editor SQL de
Supabase, en orden (02 → 13).

### Datos de prueba (opcional)

Para trabajar con datos sin depender de facturas reales:

```bash
cd server
npm run seed            # simula: 101 facturas, no escribe nada
npm run seed:aplicar    # las inserta (borra y reinserta las SEED)
npm run seed:limpiar    # las borra y deja la base como estaba
```

Genera tres suministros completos (2.0TD hogar, 3.0TD pyme, 6.1TD industria) con
34 meses cada uno, anomalías, una lectura estimada, un mes ausente y una baja.
Es determinista y todo queda etiquetado (`CUPS ESSEED…`, clientes `DEMO …`).

## Producción

| Proyecto | Carpeta raíz | URL |
|---|---|---|
| `gestorpdf-energia-api` | `server/` | https://gestorpdf-energia-api.vercel.app |
| `gestorpdf-energia-web` | `client/` | https://gestorpdf-energia-web.vercel.app |

Los dos están conectados al repositorio: **cada push a `master` despliega ambos**.
Las variables de entorno viven solo en Vercel.

Si tras un push el dominio sigue sirviendo el bundle anterior, se fuerza desde la
**raíz del repositorio** (no desde `client/`, porque el proyecto tiene
`Root Directory = client`):

```bash
cp -r client/.vercel .vercel     # el proyecto ya está enlazado
npx vercel deploy --prod --yes
rm -rf .vercel
```

## Fuentes de datos y licencias

| Fuente | Endpoint | Coste | Condiciones |
|---|---|---|---|
| Precios de mercado / PVPC | `apidatos.ree.es`, `api.esios.ree.es/indicators/1001` | gratis | Sin token |
| Ofertas de comercializadoras | `comparador.cnmc.gob.es/api/APIPublica/ofertas?fecha=dd/MM/yyyy` | gratis | Uso libre **con mención obligatoria a la CNMC** |

La mención a la CNMC aparece en la pantalla del comparador y en los datos
devueltos por la API (`atribucion`).

## Contribuir

Commits en Conventional Commits y en español (`feat:`, `fix:`, `refactor:`,
`chore:`), con etiqueta opcional `[BACKEND]` / `[FRONTEND]`.

## Licencia

MIT.
