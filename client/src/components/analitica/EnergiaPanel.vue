<template>
  <div class="energia-panel">
    <div v-if="cargando" class="cargando">
      <div class="skeleton skeleton-line" style="width: 30%"></div>
      <div class="skeleton skeleton-line"></div>
      <div class="skeleton skeleton-line" style="width: 60%"></div>
    </div>

    <p v-else-if="error" class="aviso-error">{{ error }}</p>

    <template v-else-if="datos">
      <div class="tarjetas">
        <div class="metric-card">
          <div class="metric-value">{{ datos.facturas_analizadas }}</div>
          <div class="metric-label">Facturas analizadas</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">{{ formatoNumero(datos.consumo_total_kwh) }}</div>
          <div class="metric-label">kWh facturados</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">{{ datos.precio_medio_eur_kwh ? formatoPrecio(datos.precio_medio_eur_kwh) : '—' }}</div>
          <div class="metric-label">€/kWh pagado de media</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">{{ datos.cobertura.porcentaje_periodos }}%</div>
          <div class="metric-label">Con consumo por periodo</div>
        </div>
      </div>

      <!-- Consumo por periodo -->
      <div class="card">
        <div class="card-header">
          <h3>Reparto del consumo por periodo</h3>
          <span class="eyebrow">punta · llano · valle</span>
        </div>
        <div class="card-body">
          <div v-if="datos.consumo_por_periodo.length > 0" class="barras-periodo">
            <div v-for="p in datos.consumo_por_periodo" :key="p.periodo" class="fila-periodo">
              <span class="etiqueta-periodo">{{ p.periodo }}</span>
              <div class="barra-fondo">
                <div class="barra-relleno" :class="clasePeriodo(p.periodo)" :style="{ width: p.porcentaje + '%' }"></div>
              </div>
              <span class="valor-periodo">
                {{ formatoNumero(p.kwh) }} kWh · {{ p.porcentaje }}% · {{ p.facturas }} factura(s)
              </span>
            </div>
          </div>
          <p v-else class="texto-ayuda">
            Ninguna factura tiene todavía el consumo desglosado por periodo. Se rellena al editar la
            ficha de una factura o al subirla con una extracción completa.
          </p>
        </div>
      </div>

      <!-- Sobrecontratación -->
      <div class="card">
        <div class="card-header">
          <h3>Sobrecontratación de potencia</h3>
          <span class="eyebrow">máxima demandada frente a contratada</span>
        </div>
        <div class="card-body">
          <template v-if="datos.sobrecontratacion.length > 0">
            <p class="texto-ayuda">
              Periodos donde la potencia máxima demandada está más de un 35 % por debajo de la contratada:
              se está pagando capacidad que no se usa.
            </p>
            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Factura</th>
                    <th>Comercializadora</th>
                    <th>Periodo</th>
                    <th>Contratada</th>
                    <th>Máx. demandada</th>
                    <th>Exceso</th>
                    <th>Ahorro anual est.</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(s, i) in datos.sobrecontratacion" :key="`${s.id_factura}-${s.periodo}-${i}`">
                    <td>{{ s.num_factura || 'sin número' }}</td>
                    <td>{{ s.comercializadora || '—' }}</td>
                    <td><span class="badge badge-info">{{ s.periodo }}</span></td>
                    <td>{{ s.contratada }} kW</td>
                    <td>{{ s.maxima }} kW</td>
                    <td class="exceso">{{ s.exceso_kw }} kW</td>
                    <td>
                      <strong v-if="s.ahorro_anual">{{ formatoDinero(s.ahorro_anual) }}</strong>
                      <span v-else class="sin-dato" title="Falta el precio de potencia en la factura">falta precio</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
          <p v-else class="texto-ayuda">
            Sin datos suficientes: hacen falta la potencia contratada y la máxima demandada en la misma factura.
          </p>
        </div>
      </div>

      <!-- Ahorro potencial -->
      <div class="card">
        <div class="card-header">
          <h3>Ahorro potencial con el catálogo</h3>
          <span class="eyebrow">mejor oferta frente a la factura actual</span>
        </div>
        <div class="card-body">
          <template v-if="datos.ahorro_potencial">
            <p class="resumen-ahorro">
              Comparadas {{ datos.ahorro_potencial.facturas_comparadas }} factura(s):
              ahorro estimado de <strong>{{ formatoDinero(datos.ahorro_potencial.ahorro_total) }}</strong>
              si se contratara la mejor oferta del catálogo.
            </p>
            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Factura</th>
                    <th>Importe actual</th>
                    <th>Mejor oferta</th>
                    <th>Coste estimado</th>
                    <th>Ahorro</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="c in datos.ahorro_potencial.detalle" :key="c.id_factura">
                    <td>{{ c.num_factura || 'sin número' }}</td>
                    <td>{{ formatoDinero(c.importe_actual) }}</td>
                    <td>{{ c.mejor_oferta }}</td>
                    <td>{{ formatoDinero(c.coste_mejor_oferta) }}</td>
                    <td :class="c.ahorro > 0 ? 'positivo' : 'negativo'">{{ formatoDinero(c.ahorro) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
          <p v-else class="texto-ayuda">
            Sin ofertas en el catálogo (o sin facturas con consumo por periodo) no se puede calcular.
            Añádelas en <strong>Comparador → Catálogo</strong>.
          </p>
        </div>
      </div>

      <!-- Cobertura y reparto -->
      <div class="dos-columnas">
        <div class="card">
          <div class="card-header"><h3>Cobertura de datos</h3></div>
          <div class="card-body">
            <ul class="lista-cobertura">
              <li><span>Consumo por periodo</span><strong>{{ datos.cobertura.con_periodos }}</strong></li>
              <li><span>Potencias contratadas</span><strong>{{ datos.cobertura.con_potencias }}</strong></li>
              <li><span>Potencias máximas</span><strong>{{ datos.cobertura.con_maximas }}</strong></li>
              <li><span>Excedentes</span><strong>{{ datos.cobertura.con_excedentes }}</strong></li>
              <li><span>Provincia</span><strong>{{ datos.cobertura.con_provincia }}</strong></li>
            </ul>
            <p class="texto-ayuda">
              Cuanto más completa esté una factura, mejor funciona el comparador y estos cálculos.
            </p>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h3>Por comercializadora</h3></div>
          <div class="card-body">
            <table class="tabla-mini">
              <thead><tr><th>Comercializadora</th><th>kWh</th><th>Importe</th></tr></thead>
              <tbody>
                <tr v-for="c in datos.por_comercializadora" :key="c.nombre">
                  <td>{{ c.nombre }}</td>
                  <td>{{ formatoNumero(c.kwh) }}</td>
                  <td>{{ formatoDinero(c.importe) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { facturasApi } from '../../services/api'

const props = defineProps({
  // Mismos filtros que la vista (fechas, comercializadora, provincia, cliente)
  filtros: { type: Object, default: () => ({}) }
})

const datos = ref(null)
const cargando = ref(true)
const error = ref(null)

async function cargar() {
  cargando.value = true
  error.value = null
  try {
    const r = await facturasApi.analiticaEnergia(props.filtros)
    datos.value = r.data.data || r.data
  } catch (e) {
    error.value = 'No se pudo cargar la analítica de energía: ' +
      (e.response?.data?.error || e.message)
  } finally {
    cargando.value = false
  }
}

watch(() => props.filtros, cargar, { deep: true })

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

function clasePeriodo(periodo) {
  return { P1: 'p1', P2: 'p2', P3: 'p3' }[periodo] || 'p3'
}

onMounted(cargar)
</script>

<style scoped>
.tarjetas {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
  margin-bottom: 1.5rem;
}

@media (max-width: 900px) {
  .tarjetas { grid-template-columns: 1fr 1fr; }
}

.dos-columnas {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
}

@media (max-width: 900px) {
  .dos-columnas { grid-template-columns: 1fr; }
}

.barras-periodo {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.fila-periodo {
  display: grid;
  grid-template-columns: 40px 1fr auto;
  align-items: center;
  gap: 0.75rem;
}

.etiqueta-periodo {
  font-weight: 700;
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}

.barra-fondo {
  height: 18px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  overflow: hidden;
}

.barra-relleno {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;
}

.barra-relleno.p1 { background: var(--color-error); }
.barra-relleno.p2 { background: var(--color-warning); }
.barra-relleno.p3 { background: var(--color-success); }

.valor-periodo {
  font-size: 0.78rem;
  color: var(--color-text-muted);
  white-space: nowrap;
}

.exceso { color: var(--color-warning); font-weight: 600; }
.sin-dato { color: var(--color-text-muted); font-size: 0.78rem; }
.positivo { color: var(--color-success); font-weight: 600; }
.negativo { color: var(--color-error); font-weight: 600; }

.resumen-ahorro {
  margin-bottom: 0.75rem;
  font-size: 0.875rem;
}

.lista-cobertura {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.lista-cobertura li {
  display: flex;
  justify-content: space-between;
  font-size: 0.8125rem;
  border-bottom: 1px dashed var(--color-border);
  padding-bottom: 0.3rem;
}

.tabla-mini {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
}

.tabla-mini th,
.tabla-mini td {
  padding: 0.4rem 0.25rem;
  text-align: left;
}

.texto-ayuda {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
  margin-top: 0.5rem;
}

.aviso-error {
  font-size: 0.875rem;
  color: #b91c1c;
}

.cargando { padding: 1rem 0; }
</style>
