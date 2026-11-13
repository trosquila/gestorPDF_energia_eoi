# Control Energía — Manual de usuario

Aplicación para digitalizar facturas de la luz: subes el PDF o la foto, el sistema
lee los datos, los revisas, los archivas por cliente y después los usas para
analizar el gasto y comparar ofertas de comercializadoras.

---

## 1. Cómo entrar

### Registro

1. Abre la aplicación y pulsa **Registrarse**.
2. Rellena nombre, correo y contraseña (mínimo 8 caracteres).
3. **Todavía no puedes entrar.** Tu alta queda como **solicitud pendiente**:
   un administrador tiene que aprobarla.
4. Cuando te aprueben, entra con tu correo y contraseña en la pantalla de acceso.

Si intentas entrar con una solicitud pendiente, el sistema te lo dice con el
mensaje «Tu solicitud de alta está pendiente de aprobación». Si te la han
rechazado, verás el motivo que escribió el administrador.

### Roles

| Rol | Qué puede hacer |
|---|---|
| **lector** | Subir facturas, revisarlas, ver el lote, la analítica y el comparador |
| **operador** | Lo mismo que lector |
| **admin** | Todo lo anterior **más** gestionar clientes, aprobar o rechazar registros y ver el panel de solicitudes |

Las secciones **Clientes** y **Solicitudes** solo aparecen en el menú si eres
administrador.

### Cambiar la contraseña

Menú de usuario (arriba a la derecha) → **Cambiar contraseña**. Te pedirá la
actual y la nueva (mínimo 8 caracteres).

---

## 2. Subir una factura

Menú **Subir factura**.

1. Arrastra el archivo a la zona de subida o pulsa para elegirlo.
2. Formatos admitidos: **PDF, JPG, JPEG, PNG, WEBP, TIFF, BMP**. Máximo **10 MB**.
3. Eliges el **cliente** al que pertenece la factura en el desplegable. Si el
   cliente no existe, pulsa **+ Añadir cliente** y se crea sin salir de la pantalla.
4. Pulsa **Subir**. Mientras procesa verás la vista previa del documento y el
   aviso de que se están extrayendo los datos (tarda entre 5 y 15 segundos).
5. Al terminar te lleva directamente a la **ficha de la factura** ya rellenada.

### Qué ocurre por dentro (en una frase)

Si es un PDF con texto, se lee directamente. Si es un PDF escaneado o una foto,
se pasa OCR. Con ese texto, un modelo de IA saca los campos y un extractor por
reglas comprueba y completa los huecos. El archivo original se guarda en un
almacenamiento privado y en la base de datos queda la ruta.

### Estados de una factura

| Estado | Significado |
|---|---|
| `ok` | Se han leído todos los datos importantes |
| `revisión` | Falta algo o hay dudas: revísala a mano |
| `error` | No se pudo leer; hay que rellenarla manualmente |

Puedes subir el documento aunque no se lea: la factura se crea vacía y la
completas tú. Nunca se pierde el archivo.

---

## 3. Revisar y corregir una factura

Desde la ficha de la factura puedes editar todos los campos. El formulario está
dividido en bloques:

**Suministro y contrato** — número de factura, contrato, fechas, titular, NIF,
CUPS (solo lectura, es el identificador del punto de suministro), dirección,
código postal, provincia, comercializadora, peaje de acceso, tipo de contrato y
tipo de suministro.

**Potencia por periodo** — dos columnas por periodo:

- **Contratada**: lo que tienes contratado (kW).
- **Máxima demandada**: el pico real que registró el contador.

Si la contratada es mucho mayor que la máxima, estás pagando potencia que no
usas: la pestaña de analítica lo detecta y calcula el ahorro anual.

**Energía por periodo** — kWh consumidos y €/kWh en cada periodo (P1, P2, P3; en
tarifas 3.0TD hasta P6). Verás un aviso con la suma de periodos: si no cuadra con
el consumo total, te dice cuántos kWh sobran o faltan.

**Económicos** — importe total, peajes y cargos, impuesto eléctrico, IVA,
alquiler de contador, otros servicios, excedentes.

**Autoconsumo** — sin autoconsumo, con excedentes o compensación simplificada,
más kWh y euros compensados.

Al guardar, cada cambio queda registrado en el **historial** de la factura (quién,
qué campo, valor anterior y nuevo).

Si intentas salir con cambios sin guardar, la aplicación te avisa y te deja
**Descartar y salir** o quedarte.

---

## 4. Lote y exploración

Menú **Lote**. Es el listado completo de facturas con filtros por
comercializadora, estado y rango de fechas, más un buscador.

- Pulsa **Ver** en una fila para abrir su ficha.
- Dentro de la ficha abierta desde el lote tienes **← Anterior** y **Siguiente →**
  para recorrer las facturas del filtro sin volver al listado, con un contador
  «3 de 27».
- **Volver al lote** te devuelve al listado con los mismos filtros.

Las facturas dadas de baja no aparecen en el listado.

---

## 5. Analítica

Menú **Analítica**. Arriba hay una fila de filtros que afecta a **todas** las
pestañas:

**Desde · Hasta · Comercializadora · Provincia · Cliente · Estado**

El botón **Limpiar filtros** los vacía. Los cuatro indicadores de arriba
(facturas, kWh, importe y €/kWh de media) se recalculan con el filtro.

### Pestaña «Evolución»

Gráfico mensual: barras con el importe de cada mes y una línea con el €/kWh
pagado. Sirve para ver si el precio sube aunque el consumo no cambie.

### Pestaña «Reparto de cargos»

Dona con el reparto medio de una factura: energía, peajes y cargos, impuestos e
IVA, alquiler del contador y otros servicios. Al lado, tabla de gasto por
comercializadora y, si hay varias provincias, por provincia.

Necesita que las facturas tengan relleno el desglose económico; si no, te lo dice.

### Pestaña «Energía y potencia»

- Reparto del consumo por periodo (P1, P2, P3) con porcentajes.
- **Tabla de sobrecontratación**: contratada frente a máxima demandada, exceso en
  kW y ahorro anual estimado.
- **Ahorro potencial**: compara tus facturas con la mejor oferta del catálogo.
- **Cobertura**: cuántas facturas tienen periodos, potencias y excedentes.

### Pestaña «Avisos»

Lista de cosas concretas que puedes corregir, cada una con las facturas
afectadas. Pulsar una factura te lleva a su ficha:

- Sin cliente asignado
- Sin consumo por periodo
- Sin potencia contratada
- Sin desglose de impuestos
- Sin documento guardado
- Sin comercializadora

El número rojo junto a «Avisos» es cuántos tipos de aviso hay activos.

---

## 6. Comparador de precios

Menú **Comparador**.

### Comparar una factura

1. **Perfil de consumo**: provincia, peaje, días y potencias/consumos por periodo.
2. Si ya tienes facturas con periodos leídos, puedes **cargar el perfil de una
   factura** en lugar de escribir los números a mano.
3. Pulsa **Comparar ofertas**.

Verás:

- **PVPC estimado** con el precio medio de los últimos 30 días.
- **Ranking de ofertas** ordenado de más barata a más cara, con el desglose de
  potencia, energía, impuestos y total, y el ahorro frente a la factura actual.

### Catálogo de ofertas

El catálogo se llena con las **ofertas oficiales del Comparador de la CNMC**.

- **↻ Sincronizar CNMC**: descarga el catálogo del día (unas 150 ofertas de unas
  40 comercializadoras), da de alta las nuevas, actualiza precios y retira las
  que ya no se publican. Tarda unos segundos.
- **+ Añadir oferta**: alta manual de una tarifa concreta.
- **Importar CSV**: carga varias ofertas de golpe.
- **Quitar**: desactiva una oferta del catálogo (no se borra).

Debajo del catálogo aparece la nota de atribución: es **obligatoria** porque los
datos son de la CNMC.

### Asistente

Escribe una pregunta («¿qué oferta me conviene?», «¿cuánto ahorraría?») y el
asistente responde basándose **solo** en los números de la comparación. Si un
dato no está, dice que no lo tiene en vez de inventarlo, y el sistema descarta
cualquier cifra que no aparezca en los datos.

---

## 7. Clientes (solo administradores)

Menú **Clientes**.

- Métricas arriba: total, activos e inactivos.
- **Buscador** por nombre, empresa, correo o teléfono, y filtro
  activos / inactivos / todos.
- **Nuevo cliente**: nombre, empresa (obligatorios), correo, teléfono y
  dirección.
- **Editar** cualquier campo.
- **Exportar CSV** de lo que estés viendo (se abre bien en Excel).
- **Dar de baja**: si el cliente tiene facturas activas, la aplicación **no deja**
  y te dice cuántas son. Primero reasigna o da de baja esas facturas.
- **Reactivar** un cliente dado de baja.

La baja es lógica: el cliente deja de listarse pero sus datos se conservan.

---

## 8. Solicitudes (solo administradores)

Menú **Solicitudes**.

- Lista de altas pendientes con nombre, correo y rol solicitado.
- **Aprobar**: crea el usuario y ya puede entrar con la contraseña que eligió.
- **Rechazar**: puedes añadir un motivo; si lo escribes, la persona lo verá al intentar entrar.

El número rojo en el menú indica cuántas hay pendientes.

---

## 9. Problemas frecuentes

| Qué ves | Qué hacer |
|---|---|
| «Tu solicitud de alta está pendiente» | Un administrador tiene que aprobarla |
| «Usuario inactivo» | Tu cuenta está desactivada; pide que la reactiven |
| «El archivo supera el tamaño máximo (10 MB)» | Reduce el PDF o divide el escaneo |
| «Formato no admitido» | Usa PDF, JPG, PNG, WEBP, TIFF o BMP |
| La extracción sale vacía o rara | Abre la ficha y corrige a mano; el archivo está a salvo |
| «No hay ofertas en el catálogo que se puedan comparar» | Pulsa **↻ Sincronizar CNMC** |
| El gráfico de evolución sale vacío | Las facturas no tienen fecha; revisa el rango de filtros |
| La sobrecontratación no aparece | Faltan potencias contratada y máxima en las facturas |

---

## 10. Sobre los datos

Las ofertas de comercializadoras provienen del **Comparador de Ofertas de Energía
de la CNMC** (comparador.cnmc.gob.es). La CNMC publica estos datos como de uso
libre con una condición: mencionar su procedencia. Esa mención aparece en el
comparador y en la documentación del proyecto.

Los precios de mercado y el PVPC provienen de **Red Eléctrica de España**
(apidatos.ree.es).

Tus facturas y los archivos originales se guardan en un almacenamiento privado:
no hay URL pública de los documentos.
