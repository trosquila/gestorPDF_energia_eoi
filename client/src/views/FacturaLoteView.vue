<template>
  <div class="lote-factura-view">
    <div class="barra-lote">
      <button class="btn btn-secondary btn-volver" @click="router.push('/lote')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="19" y1="12" x2="5" y2="12"/>
          <polyline points="12 19 5 12 12 5"/>
        </svg>
        Volver al lote
      </button>

      <div class="navegacion" v-if="total > 0">
        <span class="posicion">{{ posicion }} de {{ total }}</span>
        <button class="btn btn-secondary btn-sm" :disabled="!anterior" @click="irA(anterior)" title="Factura anterior (←)">
          ← Anterior
        </button>
        <button class="btn btn-secondary btn-sm" :disabled="!siguiente" @click="irA(siguiente)" title="Factura siguiente (→)">
          Siguiente →
        </button>
      </div>
    </div>

    <div class="page-header">
      <div v-if="cargando" class="cabecera-skeleton">
        <div class="skeleton skeleton-line" style="width: 260px; height: 26px;"></div>
        <div class="skeleton skeleton-line" style="width: 200px;"></div>
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
          <button class="btn btn-secondary" @click="router.push(`/factura/${route.params.id}`)">
            Abrir ficha completa
          </button>
        </div>
      </div>
    </div>

    <div v-if="errorCarga" class="card">
      <div class="card-body estado-vacio">
        <p>{{ errorCarga }}</p>
        <div class="acciones-vacio">
          <button class="btn btn-secondary" @click="router.push('/lote')">Volver al lote</button>
          <button class="btn btn-primary" @click="cargar">Reintentar</button>
        </div>
      </div>
    </div>

    <div v-else class="grid-2col">
      <VisorArchivo :url="url" :es-imagen="esImagen" :cargando="cargando" />
      <div class="fields-panel card">
        <div class="card-header">
          <h3>Datos de la factura</h3>
          <span class="eyebrow">revisión rápida</span>
        </div>
        <div class="card-body">
          <div v-if="cargando" class="editor-skeleton">
            <div class="skeleton skeleton-line" style="width: 40%;"></div>
            <div class="skeleton skeleton-line"></div>
            <div class="skeleton skeleton-line"></div>
          </div>
          <EditorFactura
            v-else-if="factura"
            ref="editor"
            :key="factura.id_factura"
            :factura="factura"
            @guardada="alGuardar" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
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

// Posición dentro del listado del lote (para anterior/siguiente)
const total = computed(() => store.facturas.length)
const indice = computed(() => store.facturas.findIndex(f => f.id_factura === route.params.id))
const posicion = computed(() => (indice.value >= 0 ? indice.value + 1 : '—'))
const anterior = computed(() => (indice.value > 0 ? store.facturas[indice.value - 1].id_factura : null))
const siguiente = computed(() => (
  indice.value >= 0 && indice.value < total.value - 1
    ? store.facturas[indice.value + 1].id_factura
    : null
))

async function cargar() {
  if (!route.params.id) return
  cargando.value = true
  errorCarga.value = null
  try {
    if (store.facturas.length === 0) {
      // Necesario para saber qué factura va antes y cuál después
      await store.cargarFacturas().catch(() => {})
    }
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

function irA(id) {
  if (!id) return
  router.push(`/lote/${id}`)
}

// Navegación con flechas, salvo que el foco esté en un campo
function alPulsarTecla(evento) {
  const etiqueta = (evento.target?.tagName || '').toLowerCase()
  if (['input', 'select', 'textarea'].includes(etiqueta)) return
  if (evento.key === 'ArrowLeft' && anterior.value) irA(anterior.value)
  if (evento.key === 'ArrowRight' && siguiente.value) irA(siguiente.value)
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

onMounted(() => {
  cargar()
  window.addEventListener('keydown', alPulsarTecla)
})

onUnmounted(() => {
  window.removeEventListener('keydown', alPulsarTecla)
})

watch(() => route.params.id, cargar)

// Bloqueo de salida si el editor tiene cambios o le falta el cliente
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
.barra-lote {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 0.5rem;
}

.btn-volver {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
  padding: 0.4rem 0.75rem;
}

.navegacion {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.posicion {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
  margin-right: 0.25rem;
}

.btn-sm {
  font-size: 0.8125rem;
  padding: 0.35rem 0.7rem;
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
