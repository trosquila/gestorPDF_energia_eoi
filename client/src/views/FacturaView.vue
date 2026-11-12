<template>
  <div class="factura-view">
    <div class="page-header">
      <button class="btn btn-secondary btn-volver" @click="volver" title="Volver a la pantalla anterior">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="19" y1="12" x2="5" y2="12"/>
          <polyline points="12 19 5 12 12 5"/>
        </svg>
        Volver
      </button>

      <div v-if="cargando" class="cabecera-skeleton">
        <div class="skeleton skeleton-line" style="width: 240px; height: 26px;"></div>
        <div class="skeleton skeleton-line" style="width: 180px;"></div>
      </div>

      <div v-else-if="factura" class="factura-header">
        <div class="factura-meta">
          <h1>{{ factura.num_factura ? `Factura ${factura.num_factura}` : (factura.comercializadora || 'Factura') }}</h1>
          <p class="subtitle">
            {{ factura.comercializadora || 'Sin comercializadora' }}
            <template v-if="factura.fecha_emision"> · {{ formatearFecha(factura.fecha_emision) }}</template>
            <template v-if="factura.importe_total_eur"> · {{ formatearImporte(factura.importe_total_eur) }}</template>
          </p>
          <BadgesFactura :factura="factura" />
        </div>
        <div class="factura-actions">
          <button class="btn btn-secondary" @click="router.push('/')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M12 3v18"/></svg>
            Nueva factura
          </button>
          <button class="btn btn-secondary" @click="router.push(`/lote/${route.params.id}`)">
            Ver en lote
          </button>
        </div>
      </div>
    </div>

    <div v-if="errorCarga" class="card">
      <div class="card-body estado-vacio">
        <p>{{ errorCarga }}</p>
        <div class="acciones-vacio">
          <button class="btn btn-secondary" @click="volver">Volver</button>
          <button class="btn btn-primary" @click="cargar">Reintentar</button>
        </div>
      </div>
    </div>

    <div v-else class="grid-2col">
      <VisorArchivo :url="url" :es-imagen="esImagen" :cargando="cargando" />
      <div class="fields-panel card">
        <div class="card-header">
          <h3>Datos de la factura</h3>
        </div>
        <div class="card-body">
          <div v-if="cargando" class="editor-skeleton">
            <div class="skeleton skeleton-line" style="width: 40%;"></div>
            <div class="skeleton skeleton-line"></div>
            <div class="skeleton skeleton-line"></div>
            <div class="skeleton skeleton-line" style="width: 70%;"></div>
          </div>
          <EditorFactura
            v-else-if="factura"
            ref="editor"
            :factura="factura"
            @guardada="alGuardar" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { useFacturasStore } from '../stores/facturas'
import { facturasApi } from '../services/api'
import VisorArchivo from '../components/factura/VisorArchivo.vue'
import EditorFactura from '../components/factura/EditorFactura.vue'
import BadgesFactura from '../components/factura/BadgesFactura.vue'
import { esImagenDe, urlDelArchivo } from '../utils/factura'

const route = useRoute()
const router = useRouter()
const store = useFacturasStore()

const factura = ref(null)
const cargando = ref(true)
const errorCarga = ref(null)

const url = computed(() => urlDelArchivo(factura.value))
const esImagen = computed(() => esImagenDe(factura.value))

async function cargar() {
  if (!route.params.id) return
  cargando.value = true
  errorCarga.value = null
  try {
    // Se pide directamente por id: no depende del listado ni del store previo.
    const respuesta = await facturasApi.getFactura(route.params.id)
    factura.value = respuesta.data.data || respuesta.data
  } catch (e) {
    factura.value = null
    errorCarga.value = e.response?.status === 404
      ? 'No encontramos esa factura. Puede que se haya eliminado.'
      : `No se pudo cargar la factura: ${e.response?.data?.error || e.message}`
  } finally {
    cargando.value = false
  }
}

function alGuardar(actualizada) {
  if (actualizada) factura.value = actualizada
}

function volver() {
  const anterior = window.history.state?.back
  if (anterior && anterior !== route.fullPath) router.back()
  else router.push('/lote')
}

function formatearFecha(fecha) {
  if (!fecha) return '-'
  const [anio, mes, dia] = String(fecha).slice(0, 10).split('-')
  return `${dia}/${mes}/${anio}`
}

function formatearImporte(importe) {
  if (importe === null || importe === undefined) return '-'
  return Number(importe).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
}

onMounted(cargar)
watch(() => route.params.id, cargar)

// El editor expone su estado: si hay trabajo pendiente, se bloquea la salida
const editor = ref(null)
function guardiaDeSalida(to) {
  if (!editor.value?.pendiente) return true
  editor.value.pedirConfirmacion(to.fullPath)
  return false
}

// Al cambiar de factura se reutiliza el componente (misma ruta, otro id):
// eso dispara "update", no "leave". Hay que cubrir los dos casos.
onBeforeRouteLeave(guardiaDeSalida)
onBeforeRouteUpdate(guardiaDeSalida)
</script>

<style scoped>
.btn-volver {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.75rem;
  font-size: 0.85rem;
  padding: 0.4rem 0.75rem;
}

.factura-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.factura-meta {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
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

.fields-panel {
  overflow-y: auto;
  max-height: 70vh;
}

.editor-skeleton {
  padding: 0.5rem 0;
}

.estado-vacio {
  text-align: center;
  padding: 3rem 1.5rem;
  color: var(--color-text-muted);
}

.acciones-vacio {
  display: flex;
  gap: 0.75rem;
  justify-content: center;
  margin-top: 1rem;
}

.cabecera-skeleton {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
</style>
