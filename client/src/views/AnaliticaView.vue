<template>
  <div class="analitica-view">
    <div class="page-header">
      <h1>Analítica</h1>
      <p class="subtitle">Visualiza tendencias y patrones en tus facturas de energía</p>
    </div>

    <div class="tabs">
      <button class="tab" :class="{ active: tabActiva === 'consumo' }" @click="tabActiva = 'consumo'">
        Consumo por CUPS
      </button>
      <button class="tab" :class="{ active: tabActiva === 'cargos' }" @click="tabActiva = 'cargos'">
        Desglose de cargos
      </button>
      <button class="tab" :class="{ active: tabActiva === 'ranking' }" @click="tabActiva = 'ranking'">
        Ranking suministros
      </button>
      <button class="tab" :class="{ active: tabActiva === 'alertas' }" @click="tabActiva = 'alertas'">
        Alertas
      </button>
    </div>

    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>Cargando datos analíticos...</p>
    </div>

    <div v-else>
      <!-- Consumo por CUPS -->
      <div v-if="tabActiva === 'consumo'" class="chart-card">
        <h3>Evolución de consumo por CUPS</h3>
        <div class="chart-container">
          <canvas ref="consumoChart"></canvas>
        </div>
        <div class="chart-controls" v-if="cupsConDatos.length > 1">
          <label>CUPS: </label>
          <select v-model="cupsSeleccionado" class="form-input" style="width: auto; display: inline-block;" @change="actualizarGraficoConsumo">
            <option v-for="cups in cupsConDatos" :key="cups" :value="cups">{{ cups }}</option>
          </select>
        </div>
      </div>

      <!-- Desglose de cargos -->
      <div v-if="tabActiva === 'cargos'" class="chart-card">
        <h3>Desglose de cargos por factura (barras apiladas)</h3>
        <div class="chart-container">
          <canvas ref="cargosChart"></canvas>
        </div>
        <div class="chart-controls">
          <label>Factura: </label>
          <select v-model="facturaSeleccionadaCargos" class="form-input" style="width: auto; display: inline-block;" @change="actualizarGraficoCargos">
            <option v-for="f in facturasConLineas" :key="f.id_factura" :value="f.id_factura">
              {{ f.num_factura }} - {{ f.comercializadora }} ({{ formatearFecha(f.fecha_emision) }})
            </option>
          </select>
        </div>
      </div>

      <!-- Ranking suministros -->
      <div v-if="tabActiva === 'ranking'" class="chart-card">
        <h3>Top 10 suministros por importe</h3>
        <div class="chart-container">
          <canvas ref="rankingChart"></canvas>
        </div>
      </div>

      <!-- Alertas -->
      <div v-if="tabActiva === 'alertas'" class="chart-card">
        <h3>Alertas: importe por kWh atípico</h3>
        <div v-if="alertas.length === 0" class="empty-state">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
          <p>No se detectaron anomalías en los datos actuales</p>
        </div>
        <div v-else class="table-container">
          <table>
            <thead>
              <tr>
                <th>CUPS</th>
                <th>Comercializadora</th>
                <th>Fecha</th>
                <th>Importe/kWh factura</th>
                <th>Media CUPS</th>
                <th>Desviación</th>
                <th>Severidad</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="alerta in alertas" :key="alerta.id_factura">
                <td class="cups-cell">{{ alerta.cups }}</td>
                <td>{{ alerta.comercializadora }}</td>
                <td>{{ formatearFecha(alerta.fecha_emision) }}</td>
                <td>{{ alerta.importe_kwh_factura.toFixed(4) }} €/kWh</td>
                <td>{{ alerta.media_cups.toFixed(4) }} €/kWh</td>
                <td class="desviacion" :class="alerta.desviacion > 0 ? 'positiva' : 'negativa'">
                  {{ alerta.desviacion > 0 ? '+' : '' }}{{ alerta.desviacion.toFixed(1) }}%
                </td>
                <td>
                  <span class="badge" :class="alerta.severidad === 'alta' ? 'badge-error' : 'badge-warning'">
                    {{ alerta.severidad === 'alta' ? 'Alta' : 'Media' }}
                  </span>
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
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useFacturasStore } from '../stores/facturas'
import Chart from 'chart.js/auto'

const store = useFacturasStore()

const tabActiva = ref('consumo')
const loading = ref(true)
const alertas = ref([])

const consumoChart = ref(null)
const cargosChart = ref(null)
const rankingChart = ref(null)

const consumoChartInstance = ref(null)
const cargosChartInstance = ref(null)
const rankingChartInstance = ref(null)

const cupsSeleccionado = ref('')
const facturaSeleccionadaCargos = ref('')

const facturas = computed(() => store.facturas)
const analiticaData = computed(() => store.analiticaData)

const cupsConDatos = computed(() => {
  const set = new Set()
  facturas.value.forEach(f => {
    if (f.cups && f.consumo_total_kwh) set.add(f.cups)
  })
  return Array.from(set).sort()
})

const facturasConLineas = computed(() => {
  return facturas.value.filter(f => f.lineas && f.lineas.length > 0)
})

async function cargarDatos() {
  loading.value = true
  try {
    await store.cargarFacturas()
    await store.cargarAnalitica()
    procesarAlertas()
  } catch (e) {
    console.error('Error cargando analítica:', e)
  } finally {
    loading.value = false
    await nextTick()
    inicializarGraficos()
  }
}

function procesarAlertas() {
  const alertasCalculadas = []
  const consumosPorCups = {}
  
  facturas.value.forEach(f => {
    if (f.cups && f.consumo_total_kwh && f.importe_total_eur && f.consumo_total_kwh > 0) {
      const importeKwh = f.importe_total_eur / f.consumo_total_kwh
      if (!consumosPorCups[f.cups]) consumosPorCups[f.cups] = []
      consumosPorCups[f.cups].push({ importeKwh, factura: f })
    }
  })

  Object.entries(consumosPorCups).forEach(([cups, items]) => {
    if (items.length < 2) return
    
    const media = items.reduce((sum, i) => sum + i.importeKwh, 0) / items.length
    const std = Math.sqrt(items.reduce((sum, i) => sum + Math.pow(i.importeKwh - media, 2), 0) / items.length)
    
    items.forEach(({ importeKwh, factura }) => {
      const desviacion = ((importeKwh - media) / media) * 100
      if (Math.abs(desviacion) > 30) {
        alertasCalculadas.push({
          ...factura,
          importe_kwh_factura: importeKwh,
          media_cups: media,
          desviacion,
          severidad: Math.abs(desviacion) > 50 ? 'alta' : 'media'
        })
      }
    })
  })

  alertas.value = alertasCalculadas.sort((a, b) => Math.abs(b.desviacion) - Math.abs(a.desviacion))
}

async function inicializarGraficos() {
  await nextTick()
  actualizarGraficoConsumo()
  actualizarGraficoCargos()
  actualizarGraficoRanking()
}

function actualizarGraficoConsumo() {
  if (!consumoChart.value) return
  
  const ctx = consumoChart.value.getContext('2d')
  if (consumoChartInstance.value) consumoChartInstance.value.destroy()

  const cups = cupsSeleccionado.value || (cupsConDatos.value[0] || '')
  if (!cups) return

  const datosCups = facturas.value
    .filter(f => f.cups === cups && f.fecha_emision && f.consumo_total_kwh)
    .sort((a, b) => new Date(a.fecha_emision) - new Date(b.fecha_emision))

  const labels = datosCups.map(f => formatearFechaCorto(f.fecha_emision))
  const data = datosCups.map(f => f.consumo_total_kwh)

  consumoChartInstance.value = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Consumo (kWh)',
        data,
        borderColor: '#1e40af',
        backgroundColor: 'rgba(30, 64, 175, 0.1)',
        fill: true,
        tension: 0.3,
        pointBackgroundColor: '#1e40af',
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: 'kWh' } }
      }
    }
  })
}

function actualizarGraficoCargos() {
  if (!cargosChart.value) return
  
  const ctx = cargosChart.value.getContext('2d')
  if (cargosChartInstance.value) cargosChartInstance.value.destroy()

  const facturaId = facturaSeleccionadaCargos.value || (facturasConLineas.value[0]?.id_factura)
  if (!facturaId) return

  const factura = facturas.value.find(f => f.id_factura === facturaId)
  if (!factura || !factura.lineas) return

  const conceptosAgrupados = {}
  factura.lineas.forEach(l => {
    const key = l.concepto || 'Otros'
    if (!conceptosAgrupados[key]) conceptosAgrupados[key] = 0
    conceptosAgrupados[key] += l.importe || 0
  })

  const labels = Object.keys(conceptosAgrupados)
  const data = Object.values(conceptosAgrupados)
  const colors = [
    '#1e40af', '#059669', '#d97706', '#dc2626', '#7c3aed', '#ea580c', '#0891b2'
  ]

  cargosChartInstance.value = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Factura'],
      datasets: labels.map((label, i) => ({
        label,
        data: [data[i]],
        backgroundColor: colors[i % colors.length],
        borderRadius: 4
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } },
      scales: {
        x: { stacked: true },
        y: { stacked: true, beginAtZero: true, title: { display: true, text: '€' } }
      }
    }
  })
}

function actualizarGraficoRanking() {
  if (!rankingChart.value) return
  
  const ctx = rankingChart.value.getContext('2d')
  if (rankingChartInstance.value) rankingChartInstance.value.destroy()

  const ranking = facturas.value
    .filter(f => f.cups && f.importe_total_eur)
    .reduce((acc, f) => {
      if (!acc[f.cups]) acc[f.cups] = { cups: f.cups, comercializadora: f.comercializadora, total: 0, count: 0 }
      acc[f.cups].total += f.importe_total_eur
      acc[f.cups].count++
      return acc
    }, {})

  const top10 = Object.values(ranking)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)

  const labels = top10.map(r => `${r.cups.substring(0, 12)}...`)
  const data = top10.map(r => r.total)

  rankingChartInstance.value = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Importe total (€)',
        data,
        backgroundColor: '#1e40af',
        borderRadius: 4,
        maxBarThickness: 50
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, title: { display: true, text: '€' } }
      }
    }
  })
}

function formatearFecha(fecha) {
  if (!fecha) return '-'
  return new Date(fecha).toLocaleDateString('es-ES')
}

function formatearFechaCorto(fecha) {
  if (!fecha) return '-'
  return new Date(fecha).toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })
}

watch(tabActiva, () => {
  nextTick(() => {
    if (tabActiva.value === 'consumo') actualizarGraficoConsumo()
    else if (tabActiva.value === 'cargos') actualizarGraficoCargos()
    else if (tabActiva.value === 'ranking') actualizarGraficoRanking()
  })
})

onMounted(cargarDatos)
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

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem;
  color: var(--color-text-muted);
  gap: 1rem;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.chart-card {
  background: var(--color-surface);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  border: 1px solid var(--color-border);
  padding: 1.5rem;
}

.chart-card h3 {
  font-size: 1.125rem;
  font-weight: 600;
  margin-bottom: 1.5rem;
}

.chart-container {
  height: 400px;
  position: relative;
}

.chart-controls {
  margin-top: 1rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.875rem;
}

.chart-controls label {
  font-weight: 500;
  color: var(--color-text-muted);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  color: var(--color-text-muted);
  gap: 1rem;
  text-align: center;
}

.cups-cell {
  font-family: monospace;
  font-size: 0.8125rem;
}

.desviacion.positiva {
  color: var(--color-error);
  font-weight: 600;
}

.desviacion.negativa {
  color: var(--color-success);
  font-weight: 600;
}
</style>