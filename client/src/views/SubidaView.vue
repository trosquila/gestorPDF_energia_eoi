<template>
  <div class="subida-view">
    <div class="page-header">
      <h1>Subir factura</h1>
      <p class="subtitle">Sube un PDF o una foto y los datos se extraen automáticamente</p>
    </div>

    <!-- Pantalla inicial de captura -->
    <div v-if="!modoManual" class="upload-section">
      <div class="card">
        <div class="card-body">
          <div
            class="drop-zone"
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
              ref="fileInput"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.tif,.tiff,.bmp,application/pdf,image/*"
              class="file-input"
              @change="onFileSelect" />
            <button type="button" class="btn btn-primary" @click.stop="triggerFileInput">
              Seleccionar archivo
            </button>
          </div>
        </div>
      </div>

      <p class="hint">
        Si el archivo no se puede leer, se abre el formulario vacío para que lo rellenes a mano:
        nunca se pierde una factura.
      </p>
    </div>

    <!-- Rescate: el archivo no se pudo procesar, se rellena a mano -->
    <div v-else class="rescate">
      <div class="aviso-manual">
        <strong>No se pudo procesar el archivo automáticamente{{ motivoFallo ? ` (${motivoFallo})` : '' }}.</strong>
        <span>Rellena los datos, elige el cliente y pulsa «Guardar cambios».</span>
      </div>
      <div class="grid-2col">
        <VisorArchivo :url="urlBorrador" :es-imagen="esImagenBorrador" />
        <div class="fields-panel card">
          <div class="card-header">
            <h3>Datos de la factura</h3>
          </div>
          <div class="card-body">
            <EditorFactura ref="editor" manual :archivo="archivo" @creada="alCrear" />
          </div>
        </div>
      </div>
      <button class="btn btn-secondary" @click="cancelarRescate">Descartar archivo</button>
    </div>

    <div v-if="cargando" class="loading-overlay">
      <div class="loading-card">
        <div class="spinner-lg"></div>
        <h3>{{ mensajeCarga }}</h3>
        <p>Leyendo el archivo, extrayendo el texto y los datos…</p>
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
import { ref, computed, onUnmounted } from 'vue'
import { useRouter, onBeforeRouteLeave } from 'vue-router'
import { useFacturasStore } from '../stores/facturas'
import VisorArchivo from '../components/factura/VisorArchivo.vue'
import EditorFactura from '../components/factura/EditorFactura.vue'
import { esImagenPorNombre } from '../utils/factura'

const router = useRouter()
const store = useFacturasStore()

const dragActive = ref(false)
const fileInput = ref(null)
const cargando = ref(false)
const mensajeCarga = ref('Procesando factura…')
const error = ref(null)

const modoManual = ref(false)
const archivo = ref(null)
const urlBorrador = ref(null)
const motivoFallo = ref('')

const esImagenBorrador = computed(() => esImagenPorNombre(archivo.value?.name))

const MIMETYPES_PERMITIDOS = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/tiff',
  'image/bmp'
]
const TAMANO_MAXIMO = 10 * 1024 * 1024 // 10MB, igual que el backend

function validarArchivo(file) {
  if (!MIMETYPES_PERMITIDOS.includes(file.type)) {
    return 'Formato no admitido. Sube un PDF o una imagen (JPG, PNG, WEBP, TIFF o BMP).'
  }
  if (file.size > TAMANO_MAXIMO) {
    return `El archivo ocupa ${(file.size / 1024 / 1024).toFixed(1)}MB y el máximo son 10MB.`
  }
  return null
}

function triggerFileInput() {
  fileInput.value?.click()
}

function handleDrop(e) {
  dragActive.value = false
  const file = e.dataTransfer.files[0]
  if (!file) return
  prepararSubida(file)
}

function onFileSelect(e) {
  const file = e.target.files[0]
  e.target.value = ''
  if (!file) return
  prepararSubida(file)
}

function prepararSubida(file) {
  const invalido = validarArchivo(file)
  if (invalido) {
    error.value = invalido
    return
  }
  procesar(file)
}

async function procesar(file) {
  cargando.value = true
  mensajeCarga.value = 'Procesando la factura…'
  error.value = null
  try {
    const nueva = await store.subirPdf(file, (progress) => {
      const pct = Math.round((progress.loaded / progress.total) * 100)
      mensajeCarga.value = pct < 100
        ? `Subiendo archivo… ${pct}%`
        : 'Extrayendo texto y datos con IA…'
    })
    // Se navega a la ficha por id: la vista pide la factura al backend y no
    // depende de lo que haya en memoria.
    router.push(`/factura/${nueva.id_factura}`)
  } catch (e) {
    entrarEnRescate(file, e.message)
  } finally {
    cargando.value = false
  }
}

function entrarEnRescate(file, motivo) {
  modoManual.value = true
  archivo.value = file || null
  motivoFallo.value = motivo || ''
  liberarUrl()
  urlBorrador.value = file ? URL.createObjectURL(file) : null
}

function liberarUrl() {
  if (urlBorrador.value && String(urlBorrador.value).startsWith('blob:')) {
    URL.revokeObjectURL(urlBorrador.value)
  }
  urlBorrador.value = null
}

function cancelarRescate() {
  liberarUrl()
  archivo.value = null
  motivoFallo.value = ''
  modoManual.value = false
  error.value = null
}

function alCrear(factura) {
  liberarUrl()
  router.push(`/factura/${factura.id_factura}`)
}

onUnmounted(liberarUrl)

// En modo rescate hay datos sin guardar: no se puede cambiar de pantalla
const editor = ref(null)
onBeforeRouteLeave((to) => {
  if (!modoManual.value) return true
  if (!editor.value?.pendiente) return true
  editor.value.pedirConfirmacion(to.fullPath)
  return false
})
</script>

<style scoped>
.upload-section {
  max-width: 600px;
  margin: 0 auto;
}

.drop-zone {
  position: relative;
}

.drop-zone h3 {
  font-size: 1.125rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.drop-icon {
  color: var(--color-primary);
  margin-bottom: 1rem;
}

.file-input {
  display: none;
}

.hint {
  margin-top: 1rem;
  text-align: center;
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}

.grid-2col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  margin-bottom: 1rem;
}

@media (max-width: 1024px) {
  .grid-2col {
    grid-template-columns: 1fr;
  }
}

.fields-panel {
  overflow-y: auto;
  max-height: 70vh;
}
</style>
