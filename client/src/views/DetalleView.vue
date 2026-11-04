<template>
  <div class="detalle-view">
    <div class="page-header">
      <h1>Detalle de Factura</h1>
      <p class="subtitle">Sube una factura de energía para extraer sus datos automáticamente</p>
    </div>

    <div v-if="!facturaActual" class="upload-section">
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
            <h3>Arrastra tu factura PDF aquí</h3>
            <p>O haz clic para seleccionar un archivo (máx. 10MB)</p>
            <input type="file" ref="fileInput" accept=".pdf" @change="onFileSelect" class="file-input" />
            <button class="btn btn-primary" @click="triggerFileInput" style="margin-top: 1rem;">
              Seleccionar archivo
            </button>
          </div>

          <div v-if="ejemplos.length > 0" class="ejemplos-section">
            <h4>O prueba con facturas de ejemplo (dataset IDSEM):</h4>
            <div class="ejemplos-grid">
              <button 
                v-for="ejemplo in ejemplos" 
                :key="ejemplo.id"
                class="btn btn-secondary ejemplo-btn"
                @click="cargarEjemplo(ejemplo)"
                :disabled="loading">
                {{ ejemplo.comercializadora }} - {{ ejemplo.periodo }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="factura-content">
      <div class="factura-header">
        <div class="factura-meta">
          <h2>{{ facturaActual.comercializadora || 'Factura' }}</h2>
          <div class="meta-tags">
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
            <h3>Vista PDF</h3>
          </div>
          <div class="card-body pdf-viewer">
            <iframe 
              v-if="pdfUrl" 
              :src="pdfUrl" 
              class="pdf-iframe"
              title="Factura PDF">
            </iframe>
            <div v-else class="pdf-placeholder">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              <p>PDF no disponible</p>
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
                <div class="field-grid">
                  <FieldInput 
                    v-for="campo in camposEditables" 
                    :key="campo.key"
                    v-model="formData[campo.key]"
                    :label="campo.label"
                    :type="campo.type"
                    :method="facturaActual.metodos_extraccion?.[campo.key] || 'regla'"
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
                  <button type="submit" class="btn btn-primary" :disabled="loading || !hayCambios">
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

    <div v-if="error" class="error-toast">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span>{{ error }}</span>
      <button @click="error = null">×</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useFacturasStore } from '../stores/facturas'
import FieldInput from '../components/FieldInput.vue'

const router = useRouter()
const route = useRoute()
const store = useFacturasStore()

const facturaActual = computed(() => store.facturaActual)
const loading = computed(() => store.loading)
const error = computed(() => store.error)
const ejemplos = computed(() => store.ejemplos)
const dragActive = ref(false)
const fileInput = ref(null)
const formData = ref({})
const originalData = ref({})
const lineasFactura = ref([])
const pdfUrl = ref(null)

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
  
  if (factura.ruta_pdf) {
    pdfUrl.value = factura.ruta_pdf
  }
}

async function handleDrop(e) {
  dragActive.value = false
  const file = e.dataTransfer.files[0]
  if (file && file.type === 'application/pdf') {
    await procesarPdf(file)
  }
}

function triggerFileInput() {
  fileInput.value?.click()
}

function onFileSelect(e) {
  const file = e.target.files[0]
  if (file) procesarPdf(file)
  e.target.value = ''
}

async function procesarPdf(file) {
  try {
    error.value = null
    const nuevaFactura = await store.subirPdf(file, (progress) => {
      console.log('Upload progress:', Math.round((progress.loaded / progress.total) * 100) + '%')
    })
    await cargarDatosFactura(nuevaFactura)
  } catch (e) {
    error.value = 'Error al procesar la factura: ' + e.message
  }
}

async function cargarEjemplo(ejemplo) {
  try {
    error.value = null
    await store.cargarFactura(ejemplo.id)
    await cargarDatosFactura(store.facturaActual)
  } catch (e) {
    error.value = 'Error al cargar ejemplo: ' + e.message
  }
}

async function guardarCambios() {
  if (!facturaActual.value) return
  try {
    const updated = await store.actualizarFactura(facturaActual.value.id_factura, {
      ...formData.value,
      lineas: lineasFactura.value
    })
    originalData.value = { ...formData.value }
    error.value = null
  } catch (e) {
    error.value = 'Error al guardar: ' + e.message
  }
}

function nuevaFactura() {
  store.limpiarFacturaActual()
  formData.value = {}
  originalData.value = {}
  lineasFactura.value = []
  pdfUrl.value = null
  error.value = null
}

onMounted(async () => {
  if (ejemplos.value.length === 0) {
    await store.cargarEjemplos()
  }
  
  if (route.params.id) {
    await store.cargarFactura(route.params.id)
    if (store.facturaActual) {
      await cargarDatosFactura(store.facturaActual)
    }
  }
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

.ejemplos-section {
  margin-top: 2rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--color-border);
}

.ejemplos-section h4 {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-muted);
  margin-bottom: 1rem;
}

.ejemplos-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.ejemplo-btn {
  white-space: nowrap;
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
</style>