<template>
  <div class="analitica-view">
    <div class="page-header">
      <div>
        <h1>Analítica</h1>
        <p class="subtitle">Evolución del gasto, reparto de cargos, energía y avisos sobre tus facturas</p>
      </div>
      <button class="btn btn-secondary btn-sm" @click="limpiarFiltros" :disabled="!hayFiltros">
        Limpiar filtros
      </button>
    </div>

    <!-- Filtros compartidos por todas las pestañas -->
    <div class="card filtros-card">
      <div class="card-body filtros">
        <label class="campo">
          <span>Desde</span>
          <input type="date" v-model="filtros.fecha_desde" class="form-input" @change="aplicar" />
        </label>
        <label class="campo">
          <span>Hasta</span>
          <input type="date" v-model="filtros.fecha_hasta" class="form-input" @change="aplicar" />
        </label>
        <label class="campo">
          <span>Comercializadora</span>
          <select v-model="filtros.comercializadora" class="form-input" @change="aplicar">
            <option value="">Todas</option>
            <option v-for="c in opciones.comercializadoras" :key="c" :value="c">{{ c }}</option>
          </select>
        </label>
        <label class="campo">
          <span>Provincia</span>
          <select v-model="filtros.provincia" class="form-input" @change="aplicar">
            <option value="">Todas</option>
            <option v-for="p in opciones.provincias" :key="p" :value="p">{{ p }}</option>
          </select>
        </label>
        <label class="campo">
          <span>Cliente</span>
          <select v-model="filtros.id_cliente" class="form-input" @change="aplicar">
            <option value="">Todos</option>
            <option v-for="c in opciones.clientes" :key="c.id_cliente" :value="c.id_cliente">
              {{ c.nombre }}
            </option>
          </select>
        </label>
        <label class="campo">
          <span>Estado</span>
          <select v-model="filtros.estado" class="form-input" @change="aplicar">
            <option value="">Todos</option>
            <option value="ok">Completo</option>
            <option value="revisión">Revisión</option>
            <option value="error">Error</option>
          </select>
        </label>
      </div>
    </div>

    <!-- KPIs -->
    <div class="metricas">
      <div class="metric-card">
        <div class="metric-value">{{ kpis.facturas }}</div>
        <div class="metric-label">Facturas en el filtro</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">{{ formatoNumero(kpis.kwh) }}</div>
        <div class="metric-label">kWh facturados</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">{{ formatoDinero(kpis.importe) }}</div>
        <div class="metric-label">Importe total</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">{{ kpis.precio_medio_eur_kwh ? formatoPrecio(kpis.precio_medio_eur_kwh) : '—' }}</div>
        <div class="metric-label">€/kWh pagado de media</div>
      </div>
    </div>

    <div class="tabs">
      <button class="tab" :class="{ active: tabActiva === 'evolucion' }" @click="tabActiva = 'evolucion'">
        Evolución
      </button>
      <button class="tab" :class="{ active: tabActiva === 'reparto' }" @click="tabActiva = 'reparto'">
        Reparto de cargos
      </button>
      <button class="tab" :class="{ active: tabActiva === 'energia' }" @click="tabActiva = 'energia'">
        Energía y potencia
      </button>
      <button class="tab" :class="{ active: tabActiva === 'avisos' }" @click="tabActiva = 'avisos'">
        Avisos <span v-if="avisos.length" class="contador">{{ avisos.length }}</span>
      </button>
    </div>

    <div v-if="cargando" class="cargando">
      <div class="spinner"></div>
      <p>Cargando datos analíticos…</p>
    </div>

    <template v-else>
      <!-- ===== Evolución mensual ===== -->
      <div v-if="tabActiva === 'evolucion'" class="card">
        <div class="card-header">
          <h3>Evolución mensual: consumo, importe y precio</h3>
          <span class="eyebrow">{{ serie.length }} mes(es)</span>
        </div>
        <div class="card-body">
          <div v-if="serie.length > 0" class="chart-container">
            <canvas ref="graficoEvolucion"></canvas>
          </div>
          <p v-else class="texto-ayuda">
            Con los filtros actuales no hay facturas con fecha. Prueba a ampliar el rango.
          </p>
        </div>
      </div>

      <!-- ===== Reparto de cargos ===== -->
      <div v-if="tabActiva === 'reparto'" class="dos-columnas">
        <div class="card">
          <div class="card-header">
            <h3>Reparto medio por factura</h3>
            <span class="eyebrow" v-if="reparto">{{ reparto.facturas_con_desglose }} con desglose</span>
          </div>
          <div class="card-body">
            <template v-if="reparto">
              <div class="chart-container donut">
                <canvas ref="graficoReparto"></canvas>
              </div>
              <ul class="leyenda">
                <li v-for="parte in partesReparto" :key="parte.clave">
                  <span class="punto" :style="{ background: parte.color }"></span>
                  <span class="nombre">{{ parte.nombre }}</span>
                  <strong>{{ formatoDinero(parte.valor) }}</strong>
                  <em>{{ porcentaje(parte.valor, reparto) }}%</em>
                </li>
              </ul>
            </template>
            <p v-else class="texto-ayuda">
              Ninguna factura del filtro trae desglose de cargos (peajes, impuestos, IVA).
              Se rellena en la ficha de la factura.
            </p>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>Gasto por comercializadora</h3>
          </div>
          <div class="card-body">
            <table class="tabla-mini" v-if="porComercializadora.length">
              <thead>
                <tr><th>Comercializadora</th><th>Facturas</th><th>kWh</th><th>Importe</th><th>€/kWh</th></tr>
              </thead>
              <tbody>
                <tr v-for="c in porComercializadora" :key="c.nombre">
                  <td>{{ c.nombre }}</td>
                  <td>{{ c.facturas }}</td>
                  <td>{{ formatoNumero(c.kwh) }}</td>
                  <td>{{ formatoDinero(c.importe) }}</td>
                  <td>{{ c.precio_kwh ? formatoPrecio(c.precio_kwh) : '—' }}</td>
                </tr>
              </tbody>
            </table>
            <p v-else class="texto-ayuda">Sin datos con estos filtros.</p>

            <template v-if="porProvincia.length > 1">
              <h4 class="subtitulo-tabla">Por provincia</h4>
              <table class="tabla-mini">
                <thead><tr><th>Provincia</th><th>Facturas</th><th>Importe</th></tr></thead>
                <tbody>
                  <tr v-for="p in porProvincia" :key="p.nombre">
                    <td>{{ p.nombre }}</td>
                    <td>{{ p.facturas }}</td>
                    <td>{{ formatoDinero(p.importe) }}</td>
                  </tr>
                </tbody>
              </table>
            </template>
          </div>
        </div>
      </div>

      <!-- ===== Energía y potencia ===== -->
      <EnergiaPanel v-if="tabActiva === 'energia'" :filtros="filtrosActivos" />

      <!-- ===== Avisos ===== -->
      <div v-if="tabActiva === 'avisos'" class="avisos">
        <div v-if="avisos.length === 0" class="card estado-vacio">
          <p>No hay nada que corregir con los filtros actuales.</p>
        </div>
        <div v-for="aviso in avisos" :key="aviso.tipo" class="card aviso-card">
          <div class="card-header">
            <h3>{{ aviso.titulo }}</h3>
            <span class="badge badge-warning">{{ aviso.total }} factura(s)</span>
          </div>
          <div class="card-body">
            <p class="texto-ayuda">{{ aviso.detalle }}</p>
            <div class="lista-facturas">
              <button
                v-for="f in aviso.facturas"
                :key="f.id_factura"
                class="chip-factura"
                @click="irAFactura(f.id_factura)">
                {{ f.num_factura || 'sin número' }}
                <span v-if="f.importe"> · {{ formatoDinero(f.importe) }}</span>
                <span v-if="f.fecha" class="fecha"> · {{ f.fecha }}</span>
              </button>
            </div>
            <p v-if="aviso.total > aviso.facturas.length" class="texto-ayuda">
              y {{ aviso.total - aviso.facturas.length }} más…
            </p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useFacturasStore } from '../stores/facturas'
import Chart from 'chart.js/auto'
import EnergiaPanel from '../components/analitica/EnergiaPanel.vue'

const router = useRouter()
const store = useFacturasStore()

const tabActiva = ref('evolucion')
const cargando = ref(true)

const filtros = ref({
  fecha_desde: '',
  fecha_hasta: '',
  comercializadora: '',
  provincia: '',
  id_cliente: '',
  estado: ''
})

const opciones = ref({ comercializadoras: [], provincias: [], clientes: [] })
const kpis = ref({ facturas: 0, kwh: 0, importe: 0, precio_medio_eur_kwh: null })
const serie = ref([])
const reparto = ref(null)
const porComercializadora = ref([])
const porProvincia = ref([])
const avisos = ref([])

const graficoEvolucion = ref(null)
const graficoReparto = ref(null)
let instanciaEvolucion = null
let instanciaReparto = null

const hayFiltros = computed(() => Object.values(filtros.value).some(Boolean))

// Solo se mandan al backend los filtros con valor
const filtrosActivos = computed(() => {
  const salida = {}
  for (const [clave, valor] of Object.entries(filtros.value)) {
    if (valor) salida[clave] = valor
  }
  return salida
})

const partesReparto = computed(() => {
  if (!reparto.value) return []
  return [
    { clave: 'energia', nombre: 'Energía', color: '#1e40af', valor: reparto.value.energia },
    { clave: 'potencia', nombre: 'Peajes y cargos', color: '#0891b2', valor: reparto.value.potencia },
    { clave: 'impuestos', nombre: 'Impuestos e IVA', color: '#d97706', valor: reparto.value.impuestos },
    { clave: 'alquiler', nombre: 'Alquiler contador', color: '#7c3aed', valor: reparto.value.alquiler },
    { clave: 'otros', nombre: 'Otros servicios', color: '#64748b', valor: reparto.value.otros }
  ].filter((p) => p.valor > 0)
})

function formatoNumero(valor) {
  return Number(valor || 0).toLocaleString('es-ES', { maximumFractionDigits: 1 })
}

function formatoDinero(valor) {
  if (valor === null || valor === undefined) return '—'
  return Number(valor).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
}

function formatoPrecio(valor) {
  return Number(valor).toFixed(4)
}

function porcentaje(valor, total) {
  const suma = total.energia + total.potencia + total.impuestos + total.alquiler + total.otros
  if (!suma) return '0'
  return ((valor / suma) * 100).toFixed(1)
}

function irAFactura(id) {
  router.push(`/factura/${id}`)
}

function limpiarFiltros() {
  filtros.value = {
    fecha_desde: '', fecha_hasta: '', comercializadora: '', provincia: '', id_cliente: '', estado: ''
  }
  aplicar()
}

async function aplicar() {
  await cargar()
}

async function cargar() {
  cargando.value = true
  try {
    const r = await store.cargarAnalitica(filtrosActivos.value)
    const d = r || store.analiticaData
    opciones.value = d.opciones || opciones.value
    kpis.value = d.kpis || kpis.value
    serie.value = d.serie_mensual || []
    reparto.value = d.reparto_medio || null
    porComercializadora.value = d.por_comercializadora || []
    porProvincia.value = d.por_provincia || []
    avisos.value = d.avisos || []
  } catch (e) {
    console.error('Error cargando analítica:', e)
  } finally {
    cargando.value = false
    await nextTick()
    dibujar()
  }
}

function dibujar() {
  if (tabActiva.value === 'evolucion') dibujarEvolucion()
  if (tabActiva.value === 'reparto') dibujarReparto()
}

function dibujarEvolucion() {
  if (!graficoEvolucion.value || serie.value.length === 0) return
  if (instanciaEvolucion) instanciaEvolucion.destroy()

  const labels = serie.value.map((m) => {
    const [anio, mes] = m.mes.split('-')
    return new Date(Number(anio), Number(mes) - 1, 1)
      .toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })
  })

  instanciaEvolucion = new Chart(graficoEvolucion.value.getContext('2d'), {
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Importe (€)',
          data: serie.value.map((m) => m.importe),
          backgroundColor: 'rgba(30, 64, 175, 0.75)',
          borderRadius: 4,
          yAxisID: 'y'
        },
        {
          type: 'line',
          label: '€/kWh',
          data: serie.value.map((m) => m.precio_kwh),
          borderColor: '#d97706',
          backgroundColor: '#d97706',
          tension: 0.3,
          pointRadius: 4,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom' } },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: '€' },
          ticks: { callback: (v) => `${v} €` }
        },
        y1: {
          position: 'right',
          beginAtZero: true,
          grid: { drawOnChartArea: false },
          title: { display: true, text: '€/kWh' },
          ticks: { callback: (v) => Number(v).toFixed(3) }
        }
      }
    }
  })
}

function dibujarReparto() {
  if (!graficoReparto.value || partesReparto.value.length === 0) return
  if (instanciaReparto) instanciaReparto.destroy()

  instanciaReparto = new Chart(graficoReparto.value.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: partesReparto.value.map((p) => p.nombre),
      datasets: [{
        data: partesReparto.value.map((p) => p.valor),
        backgroundColor: partesReparto.value.map((p) => p.color),
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '58%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.label}: ${formatoDinero(ctx.parsed)}`
          }
        }
      }
    }
  })
}

watch(tabActiva, async () => {
  await nextTick()
  dibujar()
})

onMounted(cargar)
</script>

<style scoped>
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 1.5rem;
}

.filtros-card {
  margin-bottom: 1.5rem;
}

.filtros {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 0.75rem;
}

@media (max-width: 1100px) {
  .filtros { grid-template-columns: repeat(3, 1fr); }
}

@media (max-width: 700px) {
  .filtros { grid-template-columns: 1fr 1fr; }
}

.campo {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.78rem;
  color: var(--color-text-muted);
}

.metricas {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
  margin-bottom: 1.5rem;
}

@media (max-width: 900px) {
  .metricas { grid-template-columns: 1fr 1fr; }
}

.chart-container {
  height: 360px;
  position: relative;
}

.chart-container.donut {
  height: 280px;
}

.dos-columnas {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
}

@media (max-width: 1024px) {
  .dos-columnas { grid-template-columns: 1fr; }
}

.leyenda {
  list-style: none;
  padding: 0;
  margin: 1rem 0 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.leyenda li {
  display: grid;
  grid-template-columns: 12px 1fr auto auto;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.8125rem;
}

.punto {
  width: 10px;
  height: 10px;
  border-radius: 3px;
}

.leyenda em {
  font-style: normal;
  color: var(--color-text-muted);
  font-size: 0.75rem;
}

.tabla-mini {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
}

.tabla-mini th,
.tabla-mini td {
  padding: 0.45rem 0.35rem;
  text-align: left;
}

.subtitulo-tabla {
  margin: 1.25rem 0 0.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.texto-ayuda {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
  margin-top: 0.5rem;
}

.cargando {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 3rem;
  color: var(--color-text-muted);
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

.contador {
  display: inline-block;
  margin-left: 0.35rem;
  padding: 0 0.35rem;
  border-radius: 999px;
  background: var(--color-error);
  color: #fff;
  font-size: 0.7rem;
  font-weight: 700;
}

.avisos {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.aviso-card .card-body {
  padding-top: 0.75rem;
}

.lista-facturas {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.6rem;
}

.chip-factura {
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  border-radius: 999px;
  padding: 0.25rem 0.65rem;
  font-size: 0.75rem;
  cursor: pointer;
  color: var(--color-text);
}

.chip-factura:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.chip-factura .fecha {
  color: var(--color-text-muted);
}

.estado-vacio {
  padding: 2rem;
  text-align: center;
  color: var(--color-text-muted);
}

.btn-sm {
  padding: 0.35rem 0.75rem;
  font-size: 0.8125rem;
}
</style>
