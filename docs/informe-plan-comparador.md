# Informe de plan — formulario nuevo, comparador de precios, CRUD de clientes y vistas separadas

Fecha: 12/11/2026 · Repo: `trosquila/gestorPDF_energia_eoi` · Rama `master`
Estado de partida: commit `1889546`, árbol limpio, desplegado en Vercel (web + API).

---

## 0. Comprobación previa (hecha)

| Comprobación | Resultado |
|---|---|
| `git status` | limpio (los dos SQL pendientes ya commiteados: `1889546`) |
| Local = remoto | sí, `master` |
| Build de cliente | limpio |
| API en producción | `/api/health` 200 |
| Usuarios | 7, **todos desactivados** (hay que reactivar uno como admin antes de probar) |

Nada de lo que propongo a continuación es destructivo: todas las migraciones son **aditivas** (columnas y tablas nuevas). Las facturas actuales (4) se conservan.

---

## 1. TXT de estilos y estética

**Entrega:** `docs/estilos-y-estetica.txt`

Contenido, extraído del código real (no inventado):

1. **Tokens** de `client/src/style.css`: primario `#1e40af`, primario claro `#3b82f6`, fondo `#f8fafc`, superficie `#ffffff`, borde `#e2e8f0`, texto `#1e293b`, texto apagado `#64748b`, éxito `#059669`, aviso `#d97706`, error `#dc2626`.
2. **Tipografía:** `Inter` con fallback a sistema; escalas de tamaño usadas (títulos, cuerpo, tablas, etiquetas).
3. **Geometría:** radios 3/4/6/8/12 px y 999 px (píldoras); sombras; espaciados.
4. **Inventario de componentes por vista**: tarjetas, tablas, badges de estado, botones (primario/secundario/peligro), inputs y selects, drop-zone, modales, skeletons, avisos.
5. **Patrones de interacción**: confirmaciones, mensajes de error, estados de carga, bloqueo de navegación con cambios pendientes.
6. **Sección "cómo cambiarlo"**: qué token tocar para cambiar color/tipografía/espaciado sin romper nada, y qué está hardcodeado en componentes (lista de deuda técnica, para limpiarla después).
7. **Accesibilidad actual**: contrastes que cumplen y los que no; tamaños de toque; foco.

Utilidad: se puede editar a mano y usarse como guía para rediseñar sin releer 2.700 líneas de componentes.

---

## 2. Separar la vista de detalle (mejorar carga al entrar desde Lote)

### Diagnóstico (tu sospecha es correcta)

`client/src/views/DetalleView.vue` son **1.162 líneas** y sirve a la vez:
- `/` → pantalla de subida (drop-zone, OCR, asignación de cliente)
- `/detalle/:id` → edición de una factura

LoteView no pide la factura al backend: la deja en el store y navega. Si el store está vacío (recarga, enlace directo, o vuelta desde otra pantalla) la vista monta sin datos y espera. Ahí está la lentitud y el parpadeo que notas, no en Vue.

### Propuesta

Tres pantallas con responsabilidad única + componentes compartidos:

| Ruta | Vista | Función |
|---|---|---|
| `/` | `SubidaView.vue` | captura, OCR, previsualización, cliente, guardar |
| `/factura/:id` | `FacturaView.vue` | consulta/edición cargando **por id desde la API** (skeleton mientras llega) |
| `/lote/:id` | `FacturaLoteView.vue` | misma ficha pero en el flujo del lote, con **anterior/siguiente** dentro del listado |
| `/clientes` | `ClientesView.vue` | CRUD de clientes (punto 5) |

Componentes compartidos en `client/src/components/factura/`: `CabeceraFactura`, `FormDatosFactura`, `TablaLineas`, `VisorArchivo`, `SelectorCliente`, `AvisosFactura`.

**Matiz importante:** literalmente "duplicar la página" (copiar y pegar 1.162 líneas tres veces) te deja 3.500 líneas con el mismo bug en tres sitios. Lo que propongo es lo que buscas —**cada flujo con su propia página y su propia carga de datos**— pero compartiendo los bloques de presentación. Es la diferencia entre 3 páginas y 3 copias.

### Mejoras de rendimiento concretas

- `GET /api/facturas/:id` desde la vista (sin depender del store ni del listado completo).
- Rutas con `() => import(...)` → Vite parte el bundle; la pantalla de subida no carga el código del comparador.
- Skeleton en lugar de pantalla vacía; el visor del archivo se pide después de pintar los datos.
- Evitar el `deep watcher` sobre la factura completa (hoy recalcula en cada tecla).

---

## 3. Formulario nuevo: qué datos se usan de verdad

Investigado con fuentes oficiales: **CNMC** (contenido mínimo de la factura, guía de la nueva factura, comparador de ofertas y el QR obligatorio de la factura) y el **comparador CNMC** (que define exactamente qué datos hacen falta para valorar una oferta).

### Campos que faltan hoy (la tabla tiene 24 columnas y ninguno de estos)

**Identificación**
- CUPS (ya existe, se mantiene) y **nº de contrato** (nuevo)
- **Fecha fin de contrato** (nuevo) → permite avisar de renovaciones
- **Código postal y provincia** (nuevos) → imprescindibles para el comparador (zonas, peajes de distribución, ofertas)
- Tipo de suministro (hogar / pyme / industria)

**Potencia** (hoy no se guarda nada)
- Potencia contratada **por periodo**: P1…P6 (2.0TD usa P1-P2; 3.0TD usa P1-P6)
- **Potencia máxima demandada por periodo** — la distribuidora está obligada a incluirla. Es el dato que permite decir "contratas 5,75 kW y nunca pasas de 3,2" (la CNMC estima que ~70 % de los hogares está sobrecontratado).

**Energía**
- Consumo (kWh) **por periodo**: P1, P2, P3 (2.0TD) / P1…P6 (3.0TD)
- Precio de la energía **por periodo** (€/kWh)
- Precio del término de potencia (€/kW y año)

**Autoconsumo** (cada vez más común y hoy invisible)
- Modalidad: sin autoconsumo / con excedentes / con excedentes acogido a compensación simplificada
- kWh excedentes y **importe de la compensación**

**Económico** (para poder auditar la factura)
- Peajes y cargos, alquiler de contador, **impuesto eléctrico (5,11 %)**, **IVA (21 %)**, otros servicios, total
- Bono social (sí/no)

**Facturación**
- Periodo de lectura, días facturados, tipo de lectura (real/estimada)

### Modelo de datos propuesto

Columnas nuevas en `facturas` (todas opcionales, no rompen lo existente):

```sql
id_contrato text, fecha_fin_contrato date, codigo_postal text, provincia text,
tipo_suministro text,                   -- hogar | pyme | industria
potencias_contratadas jsonb,            -- {"P1":5.75,"P2":5.75}
potencias_maximas   jsonb,              -- {"P1":4.10,"P2":3.85}
consumos_periodo    jsonb,              -- {"P1":120.5,"P2":98.2,"P3":145.0}
precios_periodo     jsonb,              -- {"P1":0.142,"P2":0.098,"P3":0.061}
precio_potencia     jsonb,              -- {"P1":38.5,"P2":19.2}  €/kW/año
autoconsumo         text,               -- sin | excedentes | compensacion_simplificada
excedentes_kwh      numeric, excedentes_eur numeric,
peajes_cargos_eur   numeric, alquiler_contador_eur numeric,
impuesto_electrico_eur numeric, iva_eur numeric,
bono_social         boolean,
```

`jsonb` por periodo en vez de 18 columnas sueltas: el formulario se genera desde una lista de periodos por peaje, y añadir 6.1TD no obliga a migrar.

**Extracción:** se amplía `lib/extraction.js` (regex de "Potencia contratada P1/P2", "Energía P1/P2/P3", "Excedentes") y el esquema JSON de `lib/openrouter.js` con los mismos campos. Las facturas ya guardadas quedan con `null` y se pueden completar a mano: nada se pierde.

---

## 4. Comparador de precios

### Lo que he probado hoy contra las APIs reales

| Fuente | Prueba | Resultado | Uso previsto |
|---|---|---|---|
| `apidatos.ree.es` (REE) | PVPC + precio spot | **200 OK, datos reales** (10/11/2026 00:00 → PVPC 181,88 €/MWh; spot 184 €/MWh) | **base del comparador** |
| `api.esios.ree.es` | indicador 1001 | **403 sin token** | opcional: más indicadores con token gratuito |
| OMIE (ficheros diarios) | `marginalpdbc_20261110.1` | 200 pero **0 bytes** con ese nombre | fase 2, parseo frágil |
| Comparador CNMC | API de ofertas | **301**, sin API pública documentada | referencia legal; catálogo espejo, no scraping |

Conclusión honesta: **no existe una API pública abierta con las tarifas comerciales de las comercializadoras**. Lo que sí hay, gratis y fiable, es el precio de mercado (PVPC y spot). Por eso el comparador se construye así:

```
[factura del cliente]  →  perfil de consumo (kWh por periodo, potencias, provincia)
        +                        +
[caché de precios REE]   [catálogo de ofertas]  →  motor de cálculo  →  ranking + ahorro €/año
                                                          ↓
                                                  asistente IA (explica y recomienda)
```

- **`server/lib/precios.js`**: cliente de `apidatos.ree.es` con caché en tabla `cache_precios` (1 h), fallback a última descarga si REE no responde.
- **Tabla `ofertas`**: comercializadora, nombre de tarifa, tipo (fijo / indexado), precio €/kWh por periodo, precio potencia €/kW/año, compensación de excedentes, servicios incluidos, vigencia, ámbitos (nacional o provincias), fuente y fecha de actualización.
  - Se rellena por **CSV importable desde el panel de admin** y editable a mano. Así los precios son datos tuyos, auditables, y no dependemos de un scraping que se rompe cada mes.
- **`server/routes/comparador.js`**:
  - `GET /api/comparador/precios?provincia=&fecha=` → PVPC/spot del día.
  - `POST /api/comparador/simular` → recibe perfil (provincia, peaje, potencias, consumos, excedentes) y devuelve todas las ofertas con coste anual estimado, ordenadas por ahorro frente a la factura actual.
  - `POST /api/comparador/asistente` → IA con el ranking ya calculado en JSON.
- **Filtros de la UI**: provincia (Murcia, Salamanca, …), peaje (2.0TD/3.0TD), potencias contratadas, consumo anual o por periodo, tipo de precio (fijo/indexado), con/sin excedentes, comercializadora, y "solo ofertas con precio actualizado".
- **Cálculo**: factura anual = término de potencia (kW × €/kW/año) + energía por periodo (kWh × €/kWh) + impuesto eléctrico 5,11 % + IVA 21 % − compensación de excedentes. Se compara contra el coste real de la factura del cliente.
- **Asistente IA**: reutiliza la cascada gratuita de OpenRouter ya montada. Regla dura: **solo puede citar precios que vengan en el JSON de ofertas**; si un importe no está en el contexto, el backend lo descarta antes de responder. Devuelve: recomendación, ahorro estimado, riesgos (indexado vs fijo) y qué revisar.
- **Aviso legal en la UI**: no es el comparador oficial de la CNMC; estimación basada en la última factura del cliente.

---

## 5. CRUD de clientes

Hoy: `GET /`, `GET /:id`, `POST /`, `PATCH /:id` y **solo se pueden crear desde un modal** dentro de la factura. No hay listado ni baja.

- **Backend**: `DELETE /api/clientes/:id` con borrado lógico (`activo = false`, la columna ya existe) y **bloqueo si el cliente tiene facturas activas** (responde 409 diciendo cuántas, para que se reasignen). `GET` con búsqueda por nombre/empresa/email y paginación.
- **Frontend `ClientesView`** en `/clientes`: tabla con buscador, alta/edición en modal, baja con confirmación, contador de facturas por cliente, filtro activos/inactivos y exportación CSV.
- Reutiliza el `SelectorCliente` del formulario de factura, con botón "nuevo cliente" que ya existe.

---

## 6. Orden de trabajo (cada fase: commit + despliegue + verificación)

| Fase | Contenido | Riesgo |
|---|---|---|
| **0** | TXT de estilos + commit de lo pendiente | nulo |
| **1** | `SubidaView` / `FacturaView` / `FacturaLoteView` + componentes compartidos + carga por id | medio (toca navegación; se prueba flujo completo) |
| **2** | Migración SQL (columnas nuevas) + formulario nuevo + extracción ampliada | bajo (aditivo, nada se borra) |
| **3** | CRUD de clientes | bajo |
| **4** | Comparador: precios REE, tabla de ofertas, motor de cálculo, filtros y asistente IA | medio (depende de datos de ofertas) |
| **5** | Analítica con los datos nuevos (consumo por periodo, potencias, ahorro potencial) | bajo |

Cada fase se puede parar sin dejar el repo a medias.

---

## 7. Decisiones que necesito de ti (bloqueantes)

1. **Vistas:** ¿aceptas "página propia por flujo + componentes compartidos" (mi propuesta) o quieres literalmente una copia independiente del archivo, aunque el mismo fallo haya que arreglarlo tres veces?
2. **Ofertas comerciales:** ¿de dónde salen?
   - (a) **catálogo propio por CSV** que mantienes tú — recomendado, legal y estable;
   - (b) scraping del comparador de la CNMC — se rompe y tiene riesgo de uso;
   - (c) **solo PVPC y mercado**, sin tarifas comerciales (comparador más limitado).
3. **Token de ESIOS:** es gratuito pero tarda 1-2 días en concederse. ¿Lo pides tú (icono "Solicitud de Token" en esios.ree.es) o avanzamos solo con `apidatos.ree.es`, que ya funciona sin token?
4. **Acceso:** ¿el comparador es público (sin login) o solo para usuarios registrados?

Con esas cuatro respuestas empiezo por la fase 0 y 1 sin tocar nada más.
