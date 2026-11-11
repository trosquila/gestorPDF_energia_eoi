<template>
  <div class="detalle-view">
    <div class="page-header">
      <button
        v-if="route.params.id"
        class="btn btn-secondary btn-volver"
        @click="volver"
        title="Volver a la pantalla anterior">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="19" y1="12" x2="5" y2="12"/>
          <polyline points="12 19 5 12 12 5"/>
        </svg>
        Volver
      </button>
      <h1>Detalle de Factura</h1>
      <p class="subtitle">Sube una factura de energía para extraer sus datos automáticamente</p>
    </div>

    <div v-if="!facturaActual && !modoBorrador" class="upload-section">
      <div class="card">
        <div class="card-body">
          <div class="drop-zone" 
               :class="{ active: dragActive }"
               @dragover.prevent="dragActive = true"
               @dragleave.prevent="dragActive = false"
               @drop.prevent="handleDrop"
               @click="triggerFileInput">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="drop-icon">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <h3>Arrastra tu factura aquí</h3>
            <p>PDF o imagen (JPG, PNG, WEBP) · máx. 10MB</p>
            <input
              type="file"
              ref="fileInput"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.tif,.tiff,.bmp,application/pdf,image/*"
              @change="onFileSelect"
              class="file-input" />
            <button class="btn btn-primary" @click.stop="triggerFileInput" style="margin-top: 1rem;">
              Seleccionar archivo
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="factura-content">
      <div class="factura-header">
        <div class="factura-meta">
          <h2>{{ facturaActual?.comercializadora || (modoBorrador ? 'Factura nueva (manual)' : 'Factura') }}</h2>
          <div class="meta-tags" v-if="facturaActual">
            <span class="badge" :class="badgeClass(facturaActual.estado_extraccion)">
              {{ estadoLabel(facturaActual.estado_extraccion) }}
            </span>
            <span class="badge badge-info">{{ metodoLabel(facturaActual.metodo_extraccion) }}</span>
            <div class="confidence-indicator" v-if="facturaActual.confianza !== null && facturaActual.confianza !== undefined">
              <div class="confidence-circle" :class="confidenceClass(facturaActual.confianza)">
                {{ Math.round(facturaActual.confianza * 100) }}%
              </div>
              <span class="confidence-text">Confianza</span>
            </div>
          </div>
          <div class="meta-tags" v-else>
            <span class="badge badge-warning">Entrada manual</span>
          </div>
        </div>
        <div class="factura-actions">
          <button class="btn btn-secondary" @click="nuevaFactura">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M12 3v18"/></svg>
            Nueva factura
          </button>
          <button class="btn btn-primary" @click="guardarCambios" :disabled="loading || !hayCambios">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg>
            Guardar cambios
          </button>
        </div>
      </div>

      <div class="grid-2col">
        <div class="pdf-panel card">
          <div class="card-header">
            <h3>{{ esImagen ? 'Vista imagen' : 'Vista PDF' }}</h3>
          </div>
          <div class="card-body pdf-viewer">
            <img
              v-if="pdfUrl && esImagen"
              :src="pdfUrl"
              class="pdf-iframe img-preview"
              alt="Factura escaneada" />
            <iframe 
              v-else-if="pdfUrl" 
              :src="pdfUrl" 
              class="pdf-iframe"
              title="Factura PDF">
            </iframe>
            <div v-else class="pdf-placeholder">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              <p>Documento no disponible</p>
            </div>
          </div>
        </div>

        <div class="fields-panel">
          <div class="card">
            <div class="card-header">
              <h3>Campos Extraídos</h3>
            </div>
            <div class="card-body">
              <form @submit.prevent="guardarCambios">
                <div v-if="entradaManual" class="aviso-manual">
                  <strong>No se ha podido leer la factura automáticamente.</strong>
                  <span>Introduce los datos a mano, elige el cliente y pulsa «Guardar cambios».</span>
                </div>

                <div class="cliente-section">
                  <label class="cliente-label" for="select-cliente">Cliente / Empresa *</label>
                  <div class="cliente-row">
                    <select
                      id="select-cliente"
                      v-model="idClienteSeleccionado"
                      class="form-input"
                      :disabled="guardandoCliente">
                      <option value="">— Selecciona un cliente —</option>
                      <option
                        v-for="cliente in clientes"
                        :key="cliente.id_cliente"
                        :value="cliente.id_cliente">
                        {{ cliente.empresa }}<template v-if="cliente.nombre"> · {{ cliente.nombre }}</template>
                      </option>
                    </select>
                    <button type="button" class="btn btn-secondary" @click="abrirNuevoCliente">
                      + Añadir cliente
                    </button>
                  </div>
                  <p v-if="guardandoCliente" class="cliente-ayuda">Asignando cliente y renombrando el archivo…</p>
                  <template v-else>
                    <p v-if="rutaArchivo" class="ruta-archivo">
                      Archivo guardado: <code>{{ rutaArchivo }}</code>
                    </p>
                    <p v-if="avisoCliente" class="aviso-cliente">{{ avisoCliente }}</p>
                    <p v-if="avisoArchivo" class="aviso-cliente">{{ avisoArchivo }}</p>
                    <p v-if="!rutaArchivo" class="cliente-ayuda">
                      Al elegir cliente, el archivo se guarda como <code>día-mes-año-idEmpresa-nºFactura.ext</code>.
                    </p>
                  </template>
                </div>

                <div class="field-grid">
                  <FieldInput 
                    v-for="campo in camposEditables" 
                    :key="campo.key"
                    v-model="formData[campo.key]"
                    :label="campo.label"
                    :type="campo.type"
                    :method="facturaActual?.metodos_extraccion?.[campo.key] || (modoBorrador ? 'manual' : 'regla')"
                    :readonly="campo.readonly"
                    :placeholder="campo.placeholder" />
                </div>

                <div class="field-grid" v-if="lineasFactura.length > 0">
                  <div class="field-full">
                    <h4>Líneas de Factura</h4>
                    <div class="table-container">
                      <table>
                        <thead>
                          <tr>
                            <th>Concepto</th>
                            <th>Periodo</th>
                            <th>Cantidad</th>
                            <th>Precio Unit.</th>
                            <th>Importe</th>
                            <th>Método</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="(linea, i) in lineasFactura" :key="i">
                            <td><input v-model="linea.concepto" class="form-input form-input-sm" /></td>
                            <td><input v-model="linea.periodo_tarifario" class="form-input form-input-sm" /></td>
                            <td><input v-model="linea.cantidad" type="number" step="0.01" class="form-input form-input-sm" /></td>
                            <td><input v-model="linea.precio_unitario" type="number" step="0.0001" class="form-input form-input-sm" /></td>
                            <td><input v-model="linea.importe" type="number" step="0.01" class="form-input form-input-sm" /></td>
                            <td><span class="field-method rule">Regla</span></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div class="form-actions">
                  <span v-if="guardadoOk" class="guardado-ok">✓ Cambios guardados</span>
                  <span v-else-if="faltaCliente" class="falta-cliente">Selecciona un cliente para poder guardar</span>
                  <button
                    type="submit"
                    class="btn btn-primary"
                    :disabled="!puedeGuardar"
                    :title="faltaCliente ? 'Asigna un cliente antes de guardar' : ''">
                    <svg v-if="loading" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/></svg>
                    <span v-if="loading">Guardando...</span>
                    <span v-else>Guardar cambios</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Pantalla de carga: mientras se procesa el archivo o se asigna cliente -->
    <div v-if="cargando" class="loading-overlay">
      <div class="loading-card">
        <div class="spinner-lg"></div>
        <h3>{{ mensajeCarga }}</h3>
        <p>Leyendo el archivo, extrayendo el texto y los datos…</p>
      </div>
    </div>

    <!-- Alta rápida de cliente desde el formulario -->
    <div v-if="modalCliente" class="modal-fondo" @click.self="cerrarNuevoCliente">
      <div class="modal-card">
        <h3>Nuevo cliente</h3>
        <form @submit.prevent="guardarNuevoCliente">
          <div class="field-grid">
            <div class="field">
              <label class="field-label">Empresa *</label>
              <input v-model="nuevoCliente.empresa" class="form-input" required placeholder="Nombre de la empresa" />
            </div>
            <div class="field">
              <label class="field-label">Nombre de contacto *</label>
              <input v-model="nuevoCliente.nombre" class="form-input" required placeholder="Nombre y apellidos" />
            </div>
            <div class="field">
              <label class="field-label">Correo electrónico</label>
              <input v-model="nuevoCliente.email" type="email" class="form-input" placeholder="cliente@empresa.com" />
            </div>
            <div class="field">
              <label class="field-label">Teléfono</label>
              <input v-model="nuevoCliente.telefono" class="form-input" placeholder="600 000 000" />
            </div>
            <div class="field field-full">
              <label class="field-label">Dirección de la empresa</label>
              <input v-model="nuevoCliente.direccion_empresa" class="form-input" placeholder="Calle, número, ciudad" />
            </div>
            <div class="field field-full">
              <label class="checkbox-label">
                <input type="checkbox" v-model="nuevoCliente.activo" />
                Cliente activo
              </label>
            </div>
          </div>

          <p v-if="errorCliente" class="modal-error">{{ errorCliente }}</p>

          <div class="modal-acciones">
            <button type="button" class="btn btn-secondary" @click="cerrarNuevoCliente">Cancelar</button>
            <button type="submit" class="btn btn-primary" :disabled="guardandoNuevoCliente">
              {{ guardandoNuevoCliente ? 'Guardando…' : 'Crear cliente' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Aviso al intentar salir con trabajo pendiente -->
    <div v-if="modalSalida" class="modal-fondo" @click.self="seguirEditando">
      <div class="modal-card">
        <h3>Antes de salir</h3>
        <p class="modal-texto">{{ mensajeSalida }}</p>
        <div class="modal-acciones">
          <button class="btn btn-secondary" @click="descartarYSalir">Descartar y salir</button>
          <button class="btn btn-primary" @click="seguirEditando">Seguir aquí</button>
        </div>
      </div>
    </div>

    <div v-if="error" class="error-toast">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span>{{ error }}</span>
      <button @click="error = null">×</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute, onBeforeRouteLeave } from 'vue-router'
import { useFacturasStore } from '../stores/facturas'
import { useClientesStore } from '../stores/clientes'
import FieldInput from '../components/FieldInput.vue'

const router = useRouter()
const route = useRoute()
const store = useFacturasStore()
const clientesStore = useClientesStore()

const facturaActual = computed(() => store.facturaActual)
const loading = computed(() => store.loading)
// computed con setter: el store guarda el error y la vista puede limpiarlo
// (un computed de solo lectura hacía que los mensajes nunca se mostraran).
const error = computed({
  get: () => store.error,
  set: (valor) => { store.error = valor }
})
const dragActive = ref(false)
const fileInput = ref(null)
const formData = ref({})
const originalData = ref({})
const lineasFactura = ref([])
const pdfUrl = ref(null)

// Modo borrador: la subida automática falló y el usuario rellena a mano
const modoBorrador = ref(false)
const archivoBorrador = ref(null)

// Pantalla de carga y asignación de cliente
const cargando = ref(false)
const mensajeCarga = ref('Procesando factura…')
const idClienteSeleccionado = ref('')
const guardandoCliente = ref(false)
const modalCliente = ref(false)
const guardandoNuevoCliente = ref(false)
const errorCliente = ref(null)
const avisoCliente = ref(null)
const avisoArchivo = ref(null)
const nuevoClienteVacio = () => ({
  empresa: '',
  nombre: '',
  email: '',
  telefono: '',
  direccion_empresa: '',
  activo: true
})
const nuevoCliente = ref(nuevoClienteVacio())

const clientes = computed(() => clientesStore.clientes)

// El archivo puede venir como data URL antigua o como ruta del bucket
const esImagen = computed(() => {
  const ruta = String(facturaActual.value?.ruta_pdf || '')
  if (ruta.startsWith('data:image/')) return true
  if (ruta.startsWith('data:application/pdf')) return false
  return /\.(jpe?g|png|webp|tiff?|bmp)$/i.test(ruta)
})

const rutaArchivo = computed(() => {
  const ruta = facturaActual.value?.ruta_pdf
  return ruta && !ruta.startsWith('data:') ? ruta : null
})

// === Validaciones de guardado ===
// La extracción automática falló: el usuario debe meter los datos a mano.
// Se considera manual si el motor lo marcó así, si no hay datos útiles
// o si estamos en el borrador de rescate tras un fallo de subida.
const entradaManual = computed(() => {
  if (modoBorrador.value) return true
  const f = facturaActual.value
  if (!f) return false
  if (f.metodo_extraccion === 'manual') return true
  return !f.num_factura && f.importe_total_eur == null && f.consumo_total_kwh == null
})

// Sin cliente no se puede guardar (si o si)
const faltaCliente = computed(() => {
  if (modoBorrador.value) return !idClienteSeleccionado.value
  return !!facturaActual.value && !facturaActual.value.id_cliente
})

// Hay trabajo pendiente mientras falte cliente o haya cambios sin guardar
const pendienteDeGuardar = computed(() => {
  if (modoBorrador.value) return true
  return !!facturaActual.value && (faltaCliente.value || hayCambios.value)
})

const puedeGuardar = computed(() => {
  if (modoBorrador.value) return !!idClienteSeleccionado.value && !loading.value
  return !!facturaActual.value && !faltaCliente.value && hayCambios.value && !loading.value
})

// Formatos admitidos en cliente (el backend valida lo mismo).
const MIMETYPES_PERMITIDOS = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/tiff',
  'image/bmp'
]
const TAMANO_MAXIMO = 10 * 1024 * 1024 // 10MB, igual que config.pdf.maxSize en el backend

function validarArchivo(file) {
  if (!MIMETYPES_PERMITIDOS.includes(file.type)) {
    return 'Formato no admitido. Sube un PDF o una imagen (JPG, PNG, WEBP, TIFF o BMP).'
  }
  if (file.size > TAMANO_MAXIMO) {
    return `El archivo ocupa ${(file.size / 1024 / 1024).toFixed(1)}MB y el máximo son 10MB.`
  }
  return null
}

const camposEditables = [
  { key: 'num_factura', label: 'Número de factura', type: 'text' },
  { key: 'fecha_emision', label: 'Fecha emisión', type: 'date' },
  { key: 'periodo_inicio', label: 'Periodo inicio', type: 'date' },
  { key: 'periodo_fin', label: 'Periodo fin', type: 'date' },
  { key: 'titular', label: 'Titular', type: 'text' },
  { key: 'nif', label: 'NIF/CIF', type: 'text' },
  { key: 'cups', label: 'CUPS', type: 'text', readonly: true },
  { key: 'direccion_suministro', label: 'Dirección suministro', type: 'text' },
  { key: 'comercializadora', label: 'Comercializadora', type: 'text' },
  { key: 'tipo_contrato', label: 'Tipo contrato', type: 'text' },
  { key: 'peaje_acceso', label: 'Peaje acceso', type: 'text' },
  { key: 'consumo_total_kwh', label: 'Consumo total (kWh)', type: 'number', step: '0.01' },
  { key: 'importe_total_eur', label: 'Importe total (€)', type: 'number', step: '0.01' }
]

const hayCambios = computed(() => {
  if (!facturaActual.value) return false
  return JSON.stringify(formData.value) !== JSON.stringify(originalData.value)
})

function badgeClass(estado) {
  const map = { ok: 'badge-success', revisión: 'badge-warning', error: 'badge-error' }
  return map[estado] || 'badge-info'
}

function estadoLabel(estado) {
  const map = { ok: 'Completo', revisión: 'Revisión', error: 'Error' }
  return map[estado] || estado
}

function metodoLabel(metodo) {
  const map = { regla: 'Solo reglas', llm: 'Con LLM', mixto: 'Mixto' }
  return map[metodo] || metodo
}

function confidenceClass(conf) {
  if (conf >= 0.8) return 'high'
  if (conf >= 0.5) return 'medium'
  return 'low'
}

async function cargarDatosFactura(factura) {
  formData.value = { ...factura }
  originalData.value = { ...factura }
  lineasFactura.value = factura.lineas || []

  // URL firmada del bucket; si es un data URL antiguo, se usa tal cual
  pdfUrl.value = factura.ruta_pdf_url || factura.ruta_pdf || null
  idClienteSeleccionado.value = factura.id_cliente || ''
  avisoCliente.value = null
}

async function handleDrop(e) {
  dragActive.value = false
  const file = e.dataTransfer.files[0]
  if (!file) return
  const invalido = validarArchivo(file)
  if (invalido) {
    error.value = invalido
    return
  }
  await procesarPdf(file)
}

function triggerFileInput() {
  fileInput.value?.click()
}

function onFileSelect(e) {
  const file = e.target.files[0]
  e.target.value = ''
  if (!file) return
  const invalido = validarArchivo(file)
  if (invalido) {
    error.value = invalido
    return
  }
  procesarPdf(file)
}

async function procesarPdf(file) {
  cargando.value = true
  mensajeCarga.value = 'Procesando la factura…'
  try {
    error.value = null
    const nuevaFactura = await store.subirPdf(file, (progress) => {
      const pct = Math.round((progress.loaded / progress.total) * 100)
      mensajeCarga.value = pct < 100 ? `Subiendo archivo… ${pct}%` : 'Extrayendo texto y datos con IA…'
    })
    modoBorrador.value = false
    archivoBorrador.value = null
    await cargarDatosFactura(nuevaFactura)
  } catch (e) {
    // Si la subida automática falla, no se pierde el trabajo: se abre el
    // formulario en blanco con la imagen para guardarla a mano.
    entrarEnBorrador(file, e.message)
  } finally {
    cargando.value = false
  }
}

// Estado de rescate: archivo en memoria + formulario vacío
function entrarEnBorrador(file, motivo) {
  modoBorrador.value = true
  archivoBorrador.value = file || null
  formData.value = {}
  originalData.value = {}
  lineasFactura.value = []
  idClienteSeleccionado.value = ''
  avisoArchivo.value = null
  pdfUrl.value = file ? URL.createObjectURL(file) : null
  error.value = `No se pudo procesar la factura automáticamente${motivo ? ` (${motivo})` : ''}. Rellena los datos a mano y pulsa «Guardar cambios».`
}

// Guardado del borrador: archivo + datos + cliente en una sola petición
async function guardarManual() {
  if (!idClienteSeleccionado.value) {
    error.value = 'Selecciona un cliente antes de guardar la factura.'
    return
  }

  cargando.value = true
  mensajeCarga.value = 'Guardando la factura…'
  try {
    const datos = {}
    for (const campo of camposEditables) {
      const valor = formData.value[campo.key]
      if (valor !== undefined && valor !== null && valor !== '') datos[campo.key] = valor
    }

    const { factura, aviso } = await store.crearFacturaManual(archivoBorrador.value, datos, idClienteSeleccionado.value)

    modoBorrador.value = false
    archivoBorrador.value = null
    error.value = null
    avisoArchivo.value = aviso || null
    await cargarDatosFactura(factura)
    if (!aviso) mostrarGuardado()
    router.replace(`/detalle/${factura.id_factura}`)
  } catch (e) {
    error.value = 'Error al guardar: ' + e.message
  } finally {
    cargando.value = false
  }
}

// Al elegir cliente en el desplegable: se asigna y se renombra el archivo
async function asignarCliente(idCliente) {
  if (!facturaActual.value || !idCliente) return
  // Evita dos asignaciones simultáneas (doble clic, watcher + llamada directa)
  if (guardandoCliente.value) return
  guardandoCliente.value = true
  error.value = null
  try {
    const { factura, aviso } = await store.asignarCliente(facturaActual.value.id_factura, idCliente)
    await cargarDatosFactura(factura)
    avisoCliente.value = aviso || 'Cliente asignado y archivo renombrado.'
  } catch (e) {
    error.value = 'Error al asignar el cliente: ' + e.message
    idClienteSeleccionado.value = facturaActual.value.id_cliente || ''
  } finally {
    guardandoCliente.value = false
  }
}

function abrirNuevoCliente() {
  nuevoCliente.value = nuevoClienteVacio()
  errorCliente.value = null
  modalCliente.value = true
}

function cerrarNuevoCliente() {
  if (guardandoNuevoCliente.value) return
  modalCliente.value = false
}

async function guardarNuevoCliente() {
  guardandoNuevoCliente.value = true
  errorCliente.value = null
  try {
    const cliente = await clientesStore.crearCliente(nuevoCliente.value)
    modalCliente.value = false
    // Se asigna aquí y NO se toca idClienteSeleccionado antes: cambiarlo
    // dispararía el watcher y lanzaría una segunda asignación en paralelo.
    await asignarCliente(cliente.id_cliente)
  } catch (e) {
    errorCliente.value = e.message || 'No se pudo crear el cliente'
  } finally {
    guardandoNuevoCliente.value = false
  }
}

async function guardarCambios() {
  // En modo borrador no hay factura aún: se crea con el endpoint manual
  if (modoBorrador.value) {
    await guardarManual()
    return
  }

  if (!facturaActual.value) return

  // Sin cliente no se guarda: es obligatorio
  if (!facturaActual.value.id_cliente) {
    error.value = 'Selecciona un cliente antes de guardar la factura.'
    return
  }

  try {
    // Se envían solo los campos del formulario: los metadatos de la respuesta
    // (ruta_pdf_url, confianza...) no son columnas y rompían el PATCH.
    const datos = {}
    for (const campo of camposEditables) {
      datos[campo.key] = formData.value[campo.key]
    }

    const updated = await store.actualizarFactura(facturaActual.value.id_factura, {
      ...datos,
      lineas: lineasFactura.value
    })

    if (updated) {
      await cargarDatosFactura(updated)
    } else {
      originalData.value = { ...formData.value }
    }

    error.value = null
    mostrarGuardado()
  } catch (e) {
    error.value = 'Error al guardar: ' + e.message
  }
}

let temporizadorGuardado = null
const guardadoOk = ref(false)

function mostrarGuardado() {
  guardadoOk.value = true
  clearTimeout(temporizadorGuardado)
  temporizadorGuardado = setTimeout(() => { guardadoOk.value = false }, 2500)
}

// Vuelve a la pantalla anterior; si no hay historial interno, al listado
function volver() {
  const anterior = window.history.state?.back
  if (anterior && anterior !== route.fullPath) {
    router.back()
  } else {
    router.push('/lote')
  }
}

function nuevaFactura() {
  store.limpiarFacturaActual()
  formData.value = {}
  originalData.value = {}
  lineasFactura.value = []
  pdfUrl.value = null
  error.value = null
  idClienteSeleccionado.value = ''
  avisoCliente.value = null
  avisoArchivo.value = null
  // Se sale del modo borrador (descarta el archivo pendiente)
  if (pdfUrl.value && String(pdfUrl.value).startsWith('blob:')) URL.revokeObjectURL(pdfUrl.value)
  modoBorrador.value = false
  archivoBorrador.value = null
}

onMounted(async () => {
  // El listado de clientes es opcional al entrar: si falla, el formulario
  // sigue funcionando y se puede dar de alta uno nuevo.
  clientesStore.cargarClientes().catch((e) => {
    console.warn('No se pudieron cargar los clientes:', e.message)
  })

  if (route.params.id) {
    await store.cargarFactura(route.params.id)
    if (store.facturaActual) {
      await cargarDatosFactura(store.facturaActual)
    }
  }
})

// Cambio de cliente en el desplegable -> asignación + renombrado del archivo
watch(idClienteSeleccionado, (nuevo) => {
  if (!nuevo) return
  if (nuevo === facturaActual.value?.id_cliente) return
  asignarCliente(nuevo)
})

// === Bloqueo de salida mientras haya trabajo sin guardar ===
const modalSalida = ref(false)
const mensajeSalida = ref('')
let rutaPendiente = null

onBeforeRouteLeave((to) => {
  if (!pendienteDeGuardar.value) return true

  mensajeSalida.value = modoBorrador.value
    ? 'Esta factura aún no se ha guardado. Rellena los datos, elige cliente y pulsa "Guardar cambios" antes de cambiar de pantalla.'
    : (faltaCliente.value
      ? 'Esta factura no tiene cliente asignado. Selecciona uno (o créalo) y guarda antes de cambiar de pantalla.'
      : 'Tienes cambios sin guardar. Pulsa "Guardar cambios" antes de cambiar de pantalla.')
  rutaPendiente = to.fullPath
  modalSalida.value = true
  return false
})

function seguirEditando() {
  modalSalida.value = false
  rutaPendiente = null
}

function descartarYSalir() {
  modalSalida.value = false
  const destino = rutaPendiente
  rutaPendiente = null
  // Se limpia la factura actual para que el guardia no vuelva a bloquear
  store.limpiarFacturaActual()
  formData.value = {}
  originalData.value = {}
  if (destino) router.push(destino)
}

// Aviso del navegador si recarga o cierra con trabajo pendiente
function avisarAntesDeCerrar(evento) {
  if (!pendienteDeGuardar.value) return
  evento.preventDefault()
  evento.returnValue = ''
}

onMounted(() => {
  window.addEventListener('beforeunload', avisarAntesDeCerrar)
})

onUnmounted(() => {
  window.removeEventListener('beforeunload', avisarAntesDeCerrar)
})

watch(() => route.params.id, async (newId) => {
  if (newId) {
    await store.cargarFactura(newId)
    if (store.facturaActual) {
      await cargarDatosFactura(store.facturaActual)
    }
  }
})
</script>

<style scoped>
.page-header {
  margin-bottom: 2rem;
}

.page-header h1 {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--color-text);
}

.subtitle {
  color: var(--color-text-muted);
  margin-top: 0.375rem;
}

.upload-section {
  max-width: 600px;
  margin: 0 auto;
}

.drop-zone {
  position: relative;
}

.drop-zone.active {
  border-color: var(--color-primary);
  background-color: #eff6ff;
}

.drop-icon {
  color: var(--color-primary);
  margin-bottom: 1rem;
}

.drop-zone h3 {
  font-size: 1.125rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.file-input {
  display: none;
}

.factura-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
  gap: 1rem;
}

.factura-meta h2 {
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}

.meta-tags {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.confidence-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: var(--color-text-muted);
}

.confidence-text {
  font-weight: 500;
}

.factura-actions {
  display: flex;
  gap: 0.75rem;
}

.grid-2col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
}

@media (max-width: 1024px) {
  .grid-2col {
    grid-template-columns: 1fr;
  }
}

.pdf-panel {
  height: 70vh;
  min-height: 500px;
  display: flex;
  flex-direction: column;
}

.pdf-viewer {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.pdf-iframe {
  flex: 1;
  border: none;
  border-radius: 4px;
  background: white;
}

/* Las imágenes escaneadas se ajustan al panel sin deformarse */
.img-preview {
  object-fit: contain;
  width: 100%;
  max-height: 100%;
}

.pdf-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  gap: 0.75rem;
}

.fields-panel {
  overflow-y: auto;
  max-height: 70vh;
}

.field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.field-full {
  grid-column: 1 / -1;
}

.field-full h4 {
  font-size: 0.875rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--color-border);
}

.form-input-sm {
  padding: 0.375rem 0.625rem;
  font-size: 0.8125rem;
}

.table-container {
  max-height: 300px;
  overflow-y: auto;
}

table th, table td {
  padding: 0.5rem 0.75rem;
  font-size: 0.8125rem;
}

.form-actions {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--color-border);
  display: flex;
  justify-content: flex-end;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.error-toast {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  background: var(--color-error);
  color: white;
  padding: 1rem 1.25rem;
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
  display: flex;
  align-items: center;
  gap: 0.75rem;
  z-index: 1000;
  max-width: 400px;
  animation: slideIn 0.3s ease;
}

@keyframes slideIn {
  from { opacity: 0; transform: translateY(1rem); }
  to { opacity: 1; transform: translateY(0); }
}

.error-toast button {
  background: none;
  border: none;
  color: white;
  font-size: 1.25rem;
  line-height: 1;
  padding: 0;
  margin-left: 0.5rem;
  opacity: 0.8;
}

.error-toast button:hover {
  opacity: 1;
}

/* ===== Selector de cliente ===== */
.cliente-section {
  margin-bottom: 1.5rem;
  padding-bottom: 1.25rem;
  border-bottom: 1px solid var(--color-border);
}

.cliente-label {
  display: block;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin-bottom: 0.5rem;
}

.cliente-row {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.cliente-row .form-input {
  flex: 1;
  min-width: 220px;
}

.cliente-ayuda,
.ruta-archivo {
  margin-top: 0.6rem;
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}

.ruta-archivo code {
  background: var(--color-bg-subtle, rgba(0, 0, 0, 0.06));
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
  font-size: 0.78rem;
  word-break: break-all;
}

/* ===== Pantalla de carga ===== */
.loading-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(3px);
}

.loading-card {
  background: var(--color-bg, #fff);
  color: var(--color-text, #111);
  border-radius: 12px;
  padding: 2rem 2.5rem;
  text-align: center;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
  max-width: 380px;
}

.loading-card h3 {
  margin: 1rem 0 0.4rem;
  font-size: 1.05rem;
}

.loading-card p {
  margin: 0;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

.spinner-lg {
  width: 42px;
  height: 42px;
  margin: 0 auto;
  border: 4px solid var(--color-border);
  border-top-color: var(--color-primary, #2563eb);
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
}

/* ===== Modal de alta de cliente ===== */
.modal-fondo {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(2px);
}

.modal-card {
  background: var(--color-bg, #fff);
  color: var(--color-text, #111);
  border-radius: 12px;
  padding: 1.75rem;
  width: min(640px, 100%);
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
}

.modal-card h3 {
  margin: 0 0 1.25rem;
  font-size: 1.15rem;
}

.modal-acciones {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1.5rem;
}

.modal-error {
  margin-top: 1rem;
  padding: 0.6rem 0.8rem;
  border-radius: 6px;
  background: rgba(220, 38, 38, 0.1);
  color: #b91c1c;
  font-size: 0.85rem;
}

.checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  cursor: pointer;
}

.guardado-ok {
  margin-right: auto;
  font-size: 0.85rem;
  font-weight: 600;
  color: #15803d;
}

.btn-volver {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.75rem;
  font-size: 0.85rem;
  padding: 0.4rem 0.75rem;
}

.falta-cliente {
  margin-right: auto;
  font-size: 0.85rem;
  font-weight: 600;
  color: #b45309;
}

.aviso-manual {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-bottom: 1.25rem;
  padding: 0.85rem 1rem;
  border-radius: 8px;
  border-left: 4px solid #f59e0b;
  background: rgba(245, 158, 11, 0.12);
  font-size: 0.875rem;
}

.aviso-manual span {
  color: var(--color-text-muted);
}

.modal-texto {
  margin: 0 0 0.75rem;
  font-size: 0.9rem;
  color: var(--color-text-muted);
}
</style>