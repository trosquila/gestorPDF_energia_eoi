# Control Energía — Documentación técnica

Cómo está construida la aplicación, por dónde pasa cada dato y de dónde sale cada
número. Está escrito para que alguien pueda mantenerla sin leer todo el código.

---

## 1. Arquitectura

Tres piezas y un servicio externo de almacenamiento:

```
┌──────────────────────┐        HTTPS/JSON        ┌───────────────────────┐
│  SPA (Vue 3 + Vite)  │ ───────────────────────► │  API Express (Node)   │
│  client/             │ ◄─────────────────────── │  server/api/index.js  │
└──────────────────────┘                          └───────────┬───────────┘
                                                              │
                        ┌─────────────────────────────────────┼──────────────────────┐
                        ▼                                     ▼                      ▼
              ┌──────────────────┐                  ┌──────────────────┐   ┌──────────────────┐
              │ Supabase (Postgres│                 │ Supabase Storage │   │ APIs externas    │
              │ + PostgREST)      │                 │ bucket privado   │   │ REE / CNMC / IA  │
              └──────────────────┘                  └──────────────────┘   └──────────────────┘
```

No hay ORM: la API habla con Postgres a través de **PostgREST** (el cliente
`@supabase/supabase-js`), salvo el almacenamiento, que usa la **Storage API REST**
de Supabase a pelo con `fetch`.

La API es **stateless**: no hay sesiones en servidor ni caché en memoria salvo la
de precios de REE (30 min) y el worker de Tesseract.

## 2. Stack y dependencias

**Backend** (`server/package.json`, ESM — `"type": "module"`):

| Paquete | Para qué |
|---|---|
| `express@4` | Servidor HTTP y routers |
| `cors` | Permite llamar a la API desde el front en otro dominio |
| `multer@1.4` | Subida multipart, en memoria (`memoryStorage`), 10 MB |
| `dotenv` | Carga `server/.env` |
| `@supabase/supabase-js` | Cliente PostgREST/Storage con clave de servicio |
| `bcrypt@6` | Hash de contraseñas (10 rondas) |
| `pdf-parse@2` | Capa de texto de los PDF (`PDFParse.getText()`) |
| `@napi-rs/canvas` | **Obligatorio** para que `pdf-parse@2` arranque en Node |
| `tesseract.js@5` | OCR (`spa+eng`), worker reutilizado |
| `openai` | Cliente OpenAI-compatible; se usa contra OpenRouter y, opcionalmente, contra OpenAI |

**Frontend** (`client/package.json`): `vue@3`, `vue-router@4`, `pinia@2`,
`axios`, `chart.js@4` + `vue-chartjs`, `date-fns`.

## 3. Estructura de carpetas

```
control-energia/
├── server/
│   ├── api/index.js          # app Express, montaje de routers, manejador de errores
│   ├── config.js             # lectura de variables de entorno y constantes
│   ├── lib/
│   │   ├── supabase.js       # clientes + helpers de usuarios/clientes/solicitudes/historial
│   │   ├── storage.js        # bucket: subir, mover, borrar, URLs firmadas, nombreArchivo()
│   │   ├── pdf.js            # PDF → texto (pdf-parse v2)
│   │   ├── ocr.js            # Tesseract: worker único, idiomas, caché de tessdata
│   │   ├── pdfOcr.js         # PDF escaneado → imágenes → OCR (máx. 2 páginas)
│   │   ├── extraction.js     # extractor por reglas (regex) + normalización
│   │   ├── openrouter.js     # extracción con modelos :free + fusión con reglas
│   │   ├── llm.js            # hybridExtract(): reglas + huecos a OpenAI
│   │   ├── asistente.js      # asistente del comparador + validación de cifras
│   │   ├── precios.js        # precios horarios de REE con caché
│   │   ├── coste.js          # fórmula única de coste de una oferta
│   │   └── cnmc.js           # catálogo de ofertas de la CNMC
│   ├── routes/
│   │   ├── facturas.js       # subida, listado, ficha, edición, baja, asignar cliente
│   │   ├── usuarios_historial.js  # registro, login, contraseña, usuarios, historial
│   │   ├── clientes.js       # CRUD de clientes
│   │   ├── solicitudes.js    # altas pendientes + middleware requiereAdmin
│   │   ├── analitica.js      # resumen y analítica de energía
│   │   ├── comparador.js     # precios, ofertas, simulación, asistente
│   │   └── ejemplos.js       # datos de ejemplo (desarrollo)
│   ├── sql/                  # migraciones 02..13 (se ejecutan a mano en Supabase)
│   └── vercel.json
├── client/
│   ├── src/
│   │   ├── main.js, App.vue, router/index.js
│   │   ├── services/api.js   # axios + todos los endpoints
│   │   ├── stores/           # auth, facturas, clientes, comparador, solicitudes, historial
│   │   ├── views/            # una página por ruta
│   │   ├── components/       # factura/ y analitica/
│   │   └── utils/factura.js  # esImagenDe(), urlDelArchivo()
│   └── vercel.json
├── docs/                     # guía de estilos, informe del comparador
├── README.md                 # resumen del proyecto
├── README-usuario.md         # manual de uso
└── README-tecnico.md         # este documento
```

## 4. Configuración

### `server/.env` (nunca se sube al repo)

| Variable | Uso |
|---|---|
| `SUPABASE_URL` | `https://<proyecto>.supabase.co` |
| `SUPABASE_ANON_KEY` | Clave pública (solo lectura si hubiera RLS) |
| `SUPABASE_SERVICE_KEY` | Clave de servicio: **bypassa RLS**, la usa todo el backend |
| `SUPABASE_BUCKET` | Bucket privado, por defecto `lectorFacturasAlmacen` |
| `OPENROUTER_API_KEY` | Extracción con IA y asistente |
| `OPENROUTER_MODELS` | Opcional: lista separada por comas; si no, usa la de por defecto |
| `OPENAI_API_KEY` | Opcional: `hybridExtract()` rellena con OpenAI los campos que las reglas no encuentran. Sin clave, se queda con las reglas |
| `PORT` | Por defecto 3000 |
| `NODE_ENV` | `production` desactiva el `stack` en las respuestas de error |

Valores reales: `[REDACTED]`.

### Frontend

| Variable | Uso |
|---|---|
| `VITE_API_URL` | URL de la API. En local vacío (usa el proxy de Vite); en Vercel, `https://gestorpdf-energia-api.vercel.app` |

`client/src/services/api.js` crea un axios con `baseURL: VITE_API_URL || '/api'` y un
interceptor que añade `Authorization: <token de localStorage>` a cada petición.

## 5. Base de datos

Postgres gestionado por Supabase. **No hay migraciones automáticas**: los ficheros
de `server/sql/` se ejecutan a mano en el editor SQL de Supabase, en orden.

| Fichero | Qué hace |
|---|---|
| `02_usuarios_historial.sql` | Crea `usuarios` e `historial` |
| `03_add_password_hash.sql` | Añade `password_hash` |
| `04_clientes.sql` | Crea `clientes` y `facturas.id_cliente` |
| `05_facturas_activo.sql` | Añade `facturas.activo` (baja lógica) |
| `06_metodo_manual.sql` | Amplía el CHECK de `metodo_extraccion` |
| `07_solicitudes.sql` | Crea `solicitudes_registro` |
| `08_promote_admin.sql` | Ascender una cuenta a admin |
| `09_roles_y_bajas.sql` | Cambiar roles / desactivar la cuenta débil |
| `10_desactivar_cuentas.sql` | Desactivar / reactivar cuentas |
| `11_facturas_campos_energia.sql` | Potencias, consumos y desglose por periodo |
| `12_ofertas.sql` | Crea `ofertas` (catálogo) |
| `13_ofertas_cnmc.sql` | `id_externo`, `origen`, `web_oferta`, descuentos, índice único |

### Tablas

**`usuarios`** — `id_usuario` uuid PK, `email` único, `password_hash` (bcrypt),
`nombre`, `rol` ∈ {admin, operador, lector}, `activo`, timestamps.

**`historial`** — `id_historial` PK, `id_factura` FK (ON DELETE CASCADE),
`id_usuario` FK, `accion` (crear/actualizar/eliminar/procesar/corregir),
`campo_modificado`, `valor_anterior` y `valor_nuevo` (jsonb), `descripcion`, `ip`,
`user_agent`, `created_at`.

**`clientes`** — `id_cliente` PK, `nombre`, `empresa` (obligatorios), `email`,
`telefono`, `direccion_empresa`, `activo`, timestamps. Índices por `activo`,
`empresa` y `email`.

**`solicitudes_registro`** — `id_solicitud` PK, `nombre`, `email`, `password_hash`,
`rol`, `estado` ∈ {pendiente, aprobada, rechazada}, `motivo_rechazo`,
`revisado_por`, `revisado_at`, `created_at`.

**`facturas`** — la tabla central. Columnas:

```
identificación   id_factura uuid PK, num_factura, id_contrato, cups,
                 fecha_emision, periodo_inicio, periodo_fin,
                 fecha_fin_contrato, created_at, updated_at
titular          titular, nif, direccion_suministro, codigo_postal, provincia
comercial         comercializadora, peaje_acceso, tipo_contrato,
                 tipo_suministro (hogar|pyme|industria)
medidas          consumo_total_kwh, dias_facturados, tipo_lectura (real|estimada),
                 potencias_contratadas jsonb, potencias_maximas jsonb,
                 consumos_periodo jsonb, precio_potencia jsonb, precios_periodo jsonb
economía         importe_total_eur, peajes_cargos_eur, alquiler_contador_eur,
                 impuesto_electrico_eur, iva_eur, otros_servicios_eur, bono_social
autoconsumo      autoconsumo, excedentes_kwh, excedentes_eur
extracción       estado_extraccion (ok|revisión|error), confianza,
                 metodo_extraccion (regla|llm|mixto), metodos_extraccion jsonb,
                 lineas jsonb
archivo          ruta_pdf, id_cliente FK, activo
```

Los mapas por periodo son objetos `{"P1": 4.6, "P2": 3.45}`; los precios de
potencia van en **€/kW/año** y los de energía en **€/kWh**.

**`ofertas`** — catálogo del comparador: `id_oferta` PK, `comercializadora`,
`nombre`, `tipo` ∈ {fijo, indexado, pvpc}, `peajes` text[], `precio_energia` y
`precio_potencia` jsonb, `precio_excedentes`, `alquiler_contador`,
`servicios_incluidos`, `provincias` text[] (null = toda España), `vigencia_desde`,
`vigencia_hasta`, `fuente`, `activo`, y tras la 13: `id_externo` (único),
`origen` (manual|cnmc), `web_oferta`, `tipo_plan`, `descuento_energia`,
`descuento_potencia`.

## 6. Flujo de subida de una factura

`POST /api/facturas/upload` (`routes/facturas.js`). Todo ocurre **en memoria**; el
archivo solo se escribe al final.

1. **Multer** (`memoryStorage`, 10 MB, `fileFilter` con lista de MIME) deja el
   archivo en `req.file.buffer`. Formato no admitido → 400 con mensaje.
2. Si **no** es PDF, se valida que sea una imagen real (`validarImagen`, firma de
   bytes, no solo la extensión). Si no, 400.
3. **Obtención de texto**:
   - PDF → `extractTextFromPdf()` → `lib/pdf.js` (`PDFParse.getText()`).
   - Si el texto resultante tiene menos de 50 caracteres (PDF escaneado) →
     `extractTextFromScannedPdf()` → `lib/pdfOcr.js`.
   - Imagen → `extractTextFromImage()` → `lib/ocr.js`.
   - Si la lectura lanza error, **no se rechaza la factura**: se marca
     `motivoManual` y se crea igualmente vacía.
4. **OCR** (`lib/ocr.js`): `tesseract.js` con `spa+eng`, un único worker
   reutilizado entre peticiones, `cachePath` en `os.tmpdir()/tessdata-cache`.
   `lib/pdfOcr.js` renderiza las **2 primeras páginas** con `@napi-rs/canvas` y las
   pasa por OCR.
5. **Extracción con IA**: `extractWithOpenRouter(text)` (`lib/openrouter.js`) pide
   JSON estricto con un esquema (`response_format`) a una **cascada de modelos
   `:free`**: `dots-studio/dots-3-note-preview:free` → `recursive/flint-v1.0:free` →
   `liquid/lfm-3-1.7b:free` → `google/gemma-4-31b-it:free`. Si todos fallan
   (429, timeout), se sigue con reglas.
   Si la IA falla, `hybridExtract()` (`lib/llm.js`) aplica el extractor por
   reglas y, solo si quedan campos obligatorios vacíos **y** hay
   `OPENAI_API_KEY`, se los pide a OpenAI campos sueltos.
6. **Fusión**: `evaluarExtraccionIA(ia.data, text)` parte **siempre de lo que
   encontraron las reglas** y sobrescribe solo con valores reales de la IA; los
   mapas por periodo se combinan clave a clave. Cada campo se anota en
   `metodos_extraccion` como `llm` o `regla`, y el estado global queda `mixto`.
   (El orden importa: al revés, los `null` del esquema borraban potencias y precios
   que el OCR sí había leído.)
7. **Archivo**: se genera `idFactura` (uuid sin guiones) y se sube a
   `_pendientes/<idFactura>.<ext>` con `subirArchivo()`.
8. **Insert** en `facturas` con los campos saneados (`sanearCampos`: lista blanca
   de columnas, números y booleanos normalizados). Cualquier campo que no sea
   columna real se descarta antes de escribir, para no provocar `PGRST204`.
9. Se registra en `historial` (`accion: 'crear'`).
10. Respuesta con la factura completa; el front navega a `/factura/:id`.

### Nombrado y ubicación de los archivos

- Recién subida: `_pendientes/<idFactura>.<ext>`.
- Al asignarle cliente (`PATCH /api/facturas/:id/cliente`): `nombreArchivo()`
  construye **`dd-mm-aaaa-idCliente-referencia.ext`** (referencia = nº de factura
  saneado o el id), se **mueve** con `moverArchivo()` y se actualiza `ruta_pdf`.
  Es idempotente: si el destino ya existe, lo asume; si el original no está,
  avisa pero guarda el cliente igualmente.
- Bucket **privado**: el visor usa `urlDelArchivo()` → URL firmada temporal.

## 7. Motor de extracción por reglas

`lib/extraction.js` normaliza el texto del OCR y busca, con regex, campos
concretos. Trabaja en dos capas:

- **Datos generales**: número de factura, fechas (emisión y periodo), titular,
  NIF, CUPS (admite letras), dirección, comercializadora (cruzada contra
  `config.comercializadoras`), peaje (2.0TD, 3.0TD…), importes, consumo total,
  días facturados, tipo de lectura.
- **Datos de energía**: potencias contratadas y máximas por periodo, consumos y
  precios por periodo, autoconsumo/excedentes y desglose económico (peajes,
  impuesto eléctrico, IVA, alquiler, otros servicios).

Detalles que costaron sangre y están resueltos:

| Caso | Solución |
|---|---|
| Decimales con coma (`245,30`) | Normalización a punto antes de parsear |
| Fechas desplazadas un día | Fechas interpretadas en UTC, sin conversión de zona |
| `impuesto eléctrico 5,11 %` capturado como 5,11 € | El desglose **exige moneda**; segundo patrón «porcentaje … importe» |
| `EUR/kWh` no detectado | Patrón ampliado a `€|EUR|euros` |
| NIF dentro del CUPS | El CUPS se corta donde empieza el patrón de NIF |

## 8. API REST

Todos los routers se montan en `api/index.js` bajo `/api`. **Solo
`/api/solicitudes` valida identidad**; el resto responde sin token.

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/health` | Estado + timestamp |
| POST | `/api/facturas/upload` | Sube y procesa un archivo (multipart `pdf`) |
| POST | `/api/facturas/manual` | Crea factura sin extracción (con archivo opcional) |
| GET | `/api/facturas` | Listado; filtros `comercializadora`, `estado`, `fecha_desde`, `fecha_hasta`, `limit`, `offset`, `incluir_inactivas` |
| GET | `/api/facturas/metricas` | Contadores para el panel |
| GET | `/api/facturas/:id` | Ficha completa |
| PATCH | `/api/facturas/:id/cliente` | Asigna cliente, renombra y mueve el archivo |
| PATCH | `/api/facturas/:id` | Edita campos (lista blanca `CAMPOS_EDITABLES`), deja historial |
| DELETE | `/api/facturas/:id` | **Baja lógica** (`activo=false`); si la columna no existe, borrado físico avisando |
| GET/POST | `/api/ejemplos`, `/api/ejemplos/seed` | Datos de ejemplo (desarrollo) |
| GET | `/api/analitica` | Resumen con filtros (ver §10) |
| GET | `/api/analitica/energia` | Periodos, sobrecontratación, ahorro potencial |
| POST | `/api/usuarios` | Registro → crea **solicitud pendiente** (202) |
| POST | `/api/usuarios/login` | Devuelve el usuario; distingue pendiente/rechazada/inactiva |
| POST | `/api/usuarios/change-password` | Cambia contraseña (mín. 8) |
| GET | `/api/usuarios` | Lista de usuarios activos |
| PATCH | `/api/usuarios/:id` | Actualiza rol / activo |
| POST | `/api/historial` | Crea entrada de historial |
| GET | `/api/historial/factura/:id_factura` | Historial de una factura |
| GET | `/api/historial` | Historial con filtros |
| GET | `/api/clientes` | Lista + `total_facturas`; `activo`, `busqueda` |
| GET | `/api/clientes/:id` | Ficha |
| POST | `/api/clientes` | Alta (valida obligatorios y correo) |
| PATCH | `/api/clientes/:id` | Edición |
| DELETE | `/api/clientes/:id` | Baja lógica; **409** si tiene facturas activas (devuelve el nº) |
| GET | `/api/solicitudes` | 🔒 admin: altas pendientes |
| POST | `/api/solicitudes/:id/aprobar` | 🔒 admin: crea el usuario |
| POST | `/api/solicitudes/:id/rechazar` | 🔒 admin: marca rechazada con motivo opcional |
| GET | `/api/comparador/precios` | Precios horarios de REE |
| GET | `/api/comparador/fuentes` | Fuentes disponibles y su estado |
| GET/POST/PATCH/DELETE | `/api/comparador/ofertas[/:id]` | CRUD del catálogo |
| POST | `/api/comparador/catalogo/sincronizar` | Importa el catálogo de la CNMC |
| GET | `/api/comparador/catalogo/estado` | Nº de ofertas, comercializadoras y fecha |
| POST | `/api/comparador/simular` | Compara un perfil contra el catálogo |
| POST | `/api/comparador/asistente` | Pregunta a la IA con los datos de la simulación |
| GET | `/api/comparador/facturas/:id/perfil` | Perfil de consumo derivado de una factura |

Errores: manejador único en `api/index.js`. Los de subida (multer, formato)
devuelven **400**; el resto 500 salvo que la ruta fije otro código. En
`production` no se envía el `stack`.

## 9. Autenticación y roles

- El login valida con `bcrypt.compare` y devuelve el objeto usuario.
- El **token que guarda el front es literalmente `Bearer <id_usuario>`**
  (`stores/auth.js`). No hay JWT firmado ni caducidad: es un identificador.
- `requiereAdmin` (`routes/solicitudes.js`) lee la cabecera, comprueba que el id
  sea UUID, busca el usuario y exige `activo = true` y `rol = 'admin'`.
- El router de Vue bloquea rutas con `meta.requiresAuth` y `meta.requiresAdmin`.
- **Limitación conocida**: el resto de endpoints no valida el token. Quien conozca
  el id de un usuario puede llamarlos. Es una decisión de alcance del proyecto,
  no un descuido: cerrarlo exige un middleware de sesión real en todas las rutas.

## 10. Analítica

`GET /api/analitica` acepta `fecha_desde`, `fecha_hasta`, `comercializadora`
(`ilike`, para que `endesa` y `Endesa` sean lo mismo), `provincia`, `id_cliente` y
`estado`. Filtra en servidor sobre las facturas con `activo !== false` y devuelve:

- `kpis`: nº de facturas, kWh, importe y **precio medio** =
  `Σ importe / Σ consumo` **solo con facturas que tienen consumo e importe**
  (antes sumaba el importe de todas y dividía por el consumo de unas pocas: daba
  0,95 €/kWh en lugar de 0,39).
- `serie_mensual`: agrupado por `YYYY-MM` con kWh, importe, nº de facturas y
  €/kWh del mes.
- `reparto_medio`: media por factura de energía (calculada por diferencia:
  total − peajes − impuestos − alquiler − otros), peajes y cargos, impuestos,
  alquiler y otros; solo cuenta facturas **con desglose**.
- `por_comercializadora` y `por_provincia`: kWh, importe, €/kWh y nº de facturas.
- `avisos`: reglas accionables (sin cliente, sin periodos, sin potencias, sin
  desglose, sin archivo, sin comercializadora) con las facturas afectadas.
- `opciones`: valores distintos para los selectores de filtro.

`GET /api/analitica/energia` (mismos filtros): reparto por periodo con
porcentajes, **sobrecontratación** cuando `contratada > máxima × 1,35` con ahorro
anual = `exceso_kW × €/kW/año × 1,0511 × 1,21`, **ahorro potencial** contra la
mejor oferta del catálogo (`lib/coste.js`) y un bloque de **cobertura**.

## 11. Comparador

### Precios de mercado — `lib/precios.js`

`GET https://apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real`
(sin token), `time_trunc=hour`, `AbortController` de 20 s, caché `Map` con TTL de
**30 minutos**. REE devuelve **€/MWh**: todo se divide entre 1000 al entrar.
`mediaPorPeriodo2_0TD()` calcula la media de los últimos 30 días por periodo, con
la que se estima el PVPC.

### Fórmula de coste — `lib/coste.js`

Una sola función para comparador y analítica:

```
potencia  = Σ (kW del periodo × €/kW/año de la oferta) × días/365
energía   = Σ (kWh del periodo × €/kWh de la oferta)
excedentes= precio_excedentes × min(kWh excedentes, consumo total)
alquiler  = alquiler_contador (€/mes) × días/30,44
subtotal  = max(0, potencia + energía − excedentes + alquiler)
impuesto  = subtotal × 5,11 %      IVA = (subtotal + impuesto) × 21 %
total     = subtotal + impuesto + IVA
```

### Catálogo de la CNMC — `lib/cnmc.js`

```
GET https://comparador.cnmc.gob.es/api/APIPublica/ofertas?fecha=dd/MM/yyyy
```

- Documentación oficial: `/api/v3/api-docs` (OpenAPI 3.0.1).
- Licencia: *«El uso de esta información es libre»* con **mención obligatoria** a
  la CNMC. La atribución está en `ATRIBUCION_CNMC`, en la vista del comparador y
  en el README.
- Un volcado real: 317 ofertas (163 electricidad, 154 gas, 21 combinadas) de 44
  dominios. Se descartan las de gas y las que no traen precios.

Mapeo campo a campo:

| CNMC | Nuestro modelo |
|---|---|
| `nombreOferta` | `nombre` |
| `nombreMarca` o dominio de `webOferta` | `comercializadora` (mapa `DOMINIOS` de 44 entradas; `nombreEmpresa` viene **siempre null**) |
| `electricidad.tipoPlanElectricidad` | `tipo` (`Precio fijo` → fijo, `Flexible`/`COR` → indexado) |
| `franjas 1HORAPUNTA/2HORAVALLE` | `precio_potencia` P1/P2 (€/kW/año) |
| `franjas 3HORAPUNTA/4HORALLANO/5HORAVALLE` | `precio_energia` P1/P2/P3 (€/kWh) |
| `franjas HORAP1…HORAP6` | periodos P1…P6 y peaje `3.0TD` |
| `precio.descuentoEnergiaElecPorcentaje` | Se **aplica** al precio y se guarda en `descuento_energia` |
| `periodos[].preciofijo` (0,75 €/mes) | `alquiler_contador` — es el alquiler de contador regulado, no una cuota |
| `territorio` (`37***`, `0****`, `*****`) | `provincias` (nombres); `*****` → `null` = toda España |
| `fechaDesde` / `fechaHasta` | `vigencia_desde` / `vigencia_hasta` |
| — | `id_externo` = `dominio|nombre|fechaDesde` (clave estable) |

Un 0 en un precio significa «esta franja no lleva ese concepto», no «gratis»: se
ignora para no sobrescribir el valor bueno de otra franja (era el fallo que dejaba
la potencia a 0 en Iberdrola).

**Sincronización** (`POST /comparador/catalogo/sincronizar`):

1. Descarga (60 s de timeout, 2 reintentos) y mapea.
2. Lee las ofertas existentes y compara por **clave lógica**
   (`comercializadora|nombre|vigencia_desde`).
3. Las que ya existen se actualizan con **`upsert` por lotes de 100 por clave
   primaria** (`onConflict: 'id_oferta'`); las nuevas se insertan.
4. Las que ya no vienen de la CNMC se **desactivan** (nunca se borran).
5. Si faltan las columnas de la migración 13, reintenta sin ellas y avisa.

Rendimiento medido: 151 ofertas en **3 s** (2 peticiones) frente a 15 s del primer
enfoque (151 updates sueltos). Un `upsert` por `id_externo` **no funciona** porque
PostgREST solo acepta como `ON CONFLICT` índices únicos **completos**, y el de la
migración era parcial.

### Simulación y asistente

`POST /comparador/simular` recibe `provincia`, `peaje`, `potencias`, `consumos`,
`excedentes_kwh`, `dias` y opcionalmente `factura_id`. Filtra ofertas por provincia
(las de `provincias = null` aplican a toda España) y por peaje, calcula coste con
`costeDeOferta`, añade el ahorro frente a la factura y ordena de más barata a más
cara. En paralelo devuelve el PVPC estimado.

`POST /comparador/asistente` manda a la IA únicamente el JSON de la comparación y
**valida la respuesta**: `validarCifras()` extrae todos los números del texto y
descarta la respuesta si aparece alguna cifra que no esté en los datos. Es la
defensa contra tarifas inventadas.

## 12. Frontend

- **Router** (`src/router/index.js`): rutas con `import()` perezoso (code
  splitting). `/` subida, `/factura/:id`, `/lote`, `/lote/:id`, `/analitica`,
  `/comparador`, `/clientes` y `/solicitudes` (admin), `/login` y `/register`
  (solo invitados). `/detalle/:id` redirige a `/factura/:id`.
- **Guards**: `beforeEach` comprueba `meta.requiresAuth` (si no hay token →
  `/login?redirect=…`), `meta.requiresAdmin` (si no es admin → `/`) y
  `meta.guestOnly`.
- **Stores (Pinia)**: `auth` (token y usuario en `localStorage`, `isAdmin`,
  `isOperador`), `facturas`, `clientes`, `comparador`, `solicitudes`,
  `historial_usuarios`.
- **`services/api.js`**: un objeto por dominio (`facturasApi`, `comparadorApi`…)
  con todos los endpoints; interceptor de request (token) y de response (401 → se
  limpia la sesión).
- **Vistas y componentes**: `FacturaView` y `FacturaLoteView` son **dos vistas
  distintas** para el mismo contenido (ficha suelta y ficha dentro de un lote con
  navegación anterior/siguiente). `EditorFactura` es el formulario por bloques con
  guard de salida (`onBeforeRouteUpdate` incluido, porque cambiar de `/lote/:id` a
  `/lote/:otro` reutiliza el componente y no dispara `leave`).
  `EnergiaPanel` recibe los filtros como prop y recarga al cambiarlos.

## 13. Despliegue (Vercel)

Dos proyectos del mismo repositorio, con **Root Directory** distinto:

| Proyecto | Root | Config |
|---|---|---|
| `gestorpdf-energia-api` | `server/` | `server/vercel.json` |
| `gestorpdf-energia-web` | `client/` | `client/vercel.json` |

- `server/vercel.json`: `framework: node`, función `api/index.js` con
  `maxDuration: 60` y `memory: 1024`, y **`includeFiles`** con
  `**/node_modules/{@napi-rs,tesseract.js-core,pdfjs-dist}/**`. Ese `**/` es
  imprescindible: con Root Directory, el bundle acaba en `/var/task/server`, así
  que un patrón relativo a la raíz no encuentra los binarios y la función muere con
  `FUNCTION_INVOCATION_FAILED`.
- `client/vercel.json`: `framework: vite`, `outputDirectory: dist` y rewrite SPA.
- Variables de entorno cargadas en el proyecto de la API (`SUPABASE_*`,
  `OPENROUTER_API_KEY`, `SUPABASE_BUCKET`, `NODE_ENV=production`) y `VITE_API_URL`
  en el del front.
- **Integración Git activa**: cada push a `master` despliega los dos proyectos.

Producción:
`https://gestorpdf-energia-api.vercel.app` · `https://gestorpdf-energia-web.vercel.app`

## 14. Pruebas rápidas

```bash
# salud
curl -s $API/api/health

# subir una factura
curl -s -X POST -F "pdf=@factura.pdf;type=application/pdf" $API/api/facturas/upload

# catálogo oficial
curl -s $API/api/comparador/catalogo/estado
curl -s -X POST $API/api/comparador/catalogo/sincronizar -H 'Content-Type: application/json' -d '{}'

# comparar un perfil
curl -s -X POST $API/api/comparador/simular -H 'Content-Type: application/json' \
  -d '{"provincia":"Salamanca","peaje":"2.0TD","potencias":{"P1":4.6,"P2":3.45},
       "consumos":{"P1":132.4,"P2":87.6,"P3":61.2},"dias":30}'

# analítica con filtros
curl -s "$API/api/analitica?comercializadora=endesa&fecha_desde=2019-01-01"
```

Local: `node api/index.js` en `server/` (puerto 3000) y
`node node_modules/vite/bin/vite.js` en `client/` (5173).

## 15. Límites y decisiones tomadas

| Tema | Estado |
|---|---|
| Autenticación | Token = uuid del usuario; solo `/api/solicitudes` lo valida |
| OCR | Solo **2 páginas** por PDF; ~1 s/página |
| Tiempo de función | `maxDuration: 60` en Vercel; una subida real tarda 7-15 s |
| IA de extracción | Modelos `:free` con límites compartidos; cascada de 4 y caída a reglas |
| Catálogo | 151 ofertas de electricidad; las de gas se descartan a propósito |
| Precios CNMC | `precio.potencia` es €/kW/**año**; `preciofijo` es alquiler de contador |
| Sincronización | Manual desde la UI; un cron necesitaría un `GET` con token porque los crons de Vercel no hacen POST |
| Bajas | Facturas y clientes se dan de baja **lógicamente**; un cliente con facturas activas no se puede borrar (409) |
| Migraciones | Manuales en el editor SQL de Supabase; la API avisa si falta alguna (`falta_migracion`) |
