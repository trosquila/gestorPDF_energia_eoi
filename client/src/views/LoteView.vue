<template>
  <div class="lote-view">
    <div class="page-header">
      <h1>Lote y Exploración</h1>
      <p class="subtitle">Gestiona y filtra todas las facturas procesadas</p>
    </div>

    <div class="metrics-row">
      <div class="metric-card">
        <div class="metric-value">{{ store.totalFacturas }}</div>
        <div class="metric-label">Facturas procesadas</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">{{ store.facturasOk }}</div>
        <div class="metric-label">Extracción correcta</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">{{ store.porcentajeRegla }}%</div>
        <div class="metric-label">Solo con reglas</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">{{ formatearImporte(importeTotal) }}</div>
        <div class="metric-label">Importe total gestionado</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>Filtros</h3>
      </div>
      <div class="card-body">
        <div class="filters-grid">
          <div class="form-group">
            <label class="form-label">Comercializadora</label>
            <select v-model="filtros.comercializadora" class="form-input" @change="aplicarFiltros">
              <option value="">Todas</option>
              <option v-for="c in comercializadorasUnicas" :key="c" :value="c">{{ c }}</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Estado</label>
            <select v-model="filtros.estado" class="form-input" @change="aplicarFiltros">
              <option value="">Todos</option>
              <option value="ok">Completo</option>
              <option value="revisión">Revisión</option>
              <option value="error">Error</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Fecha desde</label>
            <input type="date" v-model="filtros.fecha_desde" class="form-input" @change="aplicarFiltros">
          </div>
          <div class="form-group">
            <label class="form-label">Fecha hasta</label>
            <input type="date" v-model="filtros.fecha_hasta" class="form-input" @change="aplicarFiltros">
          </div>
          <div class="form-group" style="align-self: flex-end;">
            <button class="btn btn-secondary" @click="limpiarFiltros" style="width: 100%;">
              Limpiar filtros
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>Facturas ({{ facturasFiltradas.length }})</h3>
      </div>
      <div class="card-body">
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>N° Factura</th>
                <th>Fecha</th>
                <th>Comercializadora</th>
                <th>CUPS</th>
                <th>Consumo (kWh)</th>
                <th>Importe (€)</th>
                <th>Estado</th>
                <th>Método</th>
                <th>Confianza</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="factura in facturasFiltradas" :key="factura.id_factura" @click="verDetalle(factura.id_factura)">
                <td>{{ factura.num_factura || '-' }}</td>
                <td>{{ formatearFecha(factura.fecha_emision) }}</td>
                <td>{{ factura.comercializadora || '-' }}</td>
                <td class="cups-cell">{{ factura.cups || '-' }}</td>
                <td>{{ factura.consumo_total_kwh ? factura.consumo_total_kwh.toLocaleString() : '-' }}</td>
                <td>{{ formatearImporte(factura.importe_total_eur) }}</td>
                <td>
                  <span class="badge" :class="badgeClass(factura.estado_extraccion)">
                    {{ estadoLabel(factura.estado_extraccion) }}
                  </span>
                </td>
                <td>
                  <span class="badge badge-info">{{ metodoLabel(factura.metodo_extraccion) }}</span>
                </td>
                <td>
                  <div v-if="factura.confianza !== null && factura.confianza !== undefined" class="confidence-indicator">
                    <div class="confidence-circle" :class="confidenceClass(factura.confianza)">
                      {{ Math.round(factura.confianza * 100) }}%
                    </div>
                  </div>
                  <span v-else>-</span>
                </td>
                <td>
                  <button class="btn btn-secondary btn-sm" @click.stop="verDetalle(factura.id_factura)">
                    Ver
                  </button>
                </td>
              </tr>
              <tr v-if="facturasFiltradas.length === 0">
                <td colspan="10" style="text-align: center; padding: 3rem; color: var(--color-text-muted);">
                  No se encontraron facturas con los filtros actuales
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useFacturasStore } from '../stores/facturas'

const router = useRouter()
const store = useFacturasStore()

const filtros = ref({
  comercializadora: '',
  estado: '',
  fecha_desde: '',
  fecha_hasta: ''
})

const facturasFiltradas = computed(() => {
  let resultado = store.facturas
  
  if (filtros.value.comercializadora) {
    resultado = resultado.filter(f => f.comercializadora === filtros.value.comercializadora)
  }
  if (filtros.value.estado) {
    resultado = resultado.filter(f => f.estado_extraccion === filtros.value.estado)
  }
  if (filtros.value.fecha_desde) {
    resultado = resultado.filter(f => f.fecha_emision && f.fecha_emision >= filtros.value.fecha_desde)
  }
  if (filtros.value.fecha_hasta) {
    resultado = resultado.filter(f => f.fecha_emision && f.fecha_emision <= filtros.value.fecha_hasta)
  }
  
  return resultado
})

const comercializadorasUnicas = computed(() => {
  const set = new Set(store.facturas.map(f => f.comercializadora).filter(Boolean))
  return Array.from(set).sort()
})

const importeTotal = computed(() => {
  return store.facturas.reduce((sum, f) => sum + (f.importe_total_eur || 0), 0)
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
  const map = { regla: 'Reglas', llm: 'LLM', mixto: 'Mixto' }
  return map[metodo] || metodo
}

function confidenceClass(conf) {
  if (conf >= 0.8) return 'high'
  if (conf >= 0.5) return 'medium'
  return 'low'
}

function formatearFecha(fecha) {
  if (!fecha) return '-'
  return new Date(fecha).toLocaleDateString('es-ES')
}

function formatearImporte(importe) {
  if (importe === null || importe === undefined) return '-'
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(importe)
}

function aplicarFiltros() {
  // Reactivo, se actualiza automáticamente
}

function limpiarFiltros() {
  filtros.value = {
    comercializadora: '',
    estado: '',
    fecha_desde: '',
    fecha_hasta: ''
  }
}

function verDetalle(id) {
  router.push(`/detalle/${id}`)
}

onMounted(async () => {
  await store.cargarFacturas()
  await store.cargarMetricas()
})
</script>

<style scoped>
.page-header {
  margin-bottom: 2rem;
}

.page-header h1 {
  font-size: 1.75rem;
  font-weight: 700;
}

.subtitle {
  color: var(--color-text-muted);
  margin-top: 0.375rem;
}

.metrics-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.filters-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  align-items: end;
}

.cups-cell {
  font-family: monospace;
  font-size: 0.8125rem;
}

.badge-sm {
  font-size: 0.7rem;
  padding: 0.125rem 0.375rem;
}

.btn-sm {
  padding: 0.375rem 0.75rem;
  font-size: 0.8125rem;
}

.confidence-indicator {
  justify-content: center;
}
</style>