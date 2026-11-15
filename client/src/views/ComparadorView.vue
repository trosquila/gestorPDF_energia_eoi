<template>
  <div class="comparador-view">
    <div class="page-header">
      <div>
        <h1>Comparador de precios</h1>
        <p class="subtitle">Precios reales de mercado y catálogo de ofertas de la empresa</p>
      </div>
      <div class="fuente-selector">
        <label class="mini-label" for="fuente">Fuente de precios</label>
        <select id="fuente" class="form-input" v-model="fuenteElegida">
          <option v-for="f in fuentes" :key="f.id" :value="f.id" :disabled="!f.disponible">
            {{ f.nombre }} · {{ f.coste }}{{ f.disponible ? '' : ' (no disponible)' }}
          </option>
        </select>
      </div>
    </div>

    <div class="aviso-fuentes">
      <div v-for="f in fuentes" :key="f.id" class="fuente-chip" :class="{ apagada: !f.disponible }">
        <strong>{{ f.nombre }}</strong>
        <span>{{ f.proveedor }}</span>
        <em>{{ f.disponible ? 'Disponible' : 'No disponible' }}</em>
      </div>
    </div>

    <div v-if="comparador.avisoCatalogo" class="aviso-manual">
      <strong>Catálogo de ofertas pendiente</strong>
      <span>{{ comparador.avisoCatalogo }}</span>
    </div>

    <!-- ===== Perfil de consumo ===== -->
    <div class="card">
      <div class="card-header">
        <h3>Perfil de consumo</h3>
        <span class="eyebrow">de una factura o a mano</span>
      </div>
      <div class="card-body">
        <div class="fila-factura">
          <select v-model="facturaElegida" class="form-input">
            <option value="">— Elegir una factura —</option>
            <option v-for="f in facturasConPerfil" :key="f.id_factura" :value="f.id_factura">
              {{ f.num_factura || 'sin número' }} · {{ f.comercializadora || 's/comercializadora' }} ·
              {{ f.provincia || 'sin provincia' }} · {{ formatearDinero(f.importe_total_eur) }}
            </option>
          </select>
          <button class="btn btn-secondary" :disabled="!facturaElegida" @click="cargarDeFactura">
            Cargar de la factura
          </button>
        </div>

        <div class="rejilla">
          <label class="campo">
            <span>Provincia</span>
            <input v-model="perfil.provincia" class="form-input" placeholder="Murcia, Salamanca…" />
          </label>
          <label class="campo">
            <span>Peaje</span>
            <select v-model="perfil.peaje" class="form-input">
              <option value="2.0TD">2.0TD</option>
              <option value="3.0TD">3.0TD</option>
              <option value="6.1TD">6.1TD</option>
            </select>
          </label>
          <label class="campo">
            <span>Días del periodo</span>
            <input v-model.number="perfil.dias" type="number" min="1" max="366" class="form-input" />
          </label>
          <label class="campo">
            <span>Excedentes (kWh)</span>
            <input v-model.number="perfil.excedentes_kwh" type="number" min="0" step="0.01" class="form-input" />
          </label>
        </div>

        <div class="tabla-bloque">
          <span class="tabla-titulo">Potencias contratadas y consumos por periodo</span>
          <table class="tabla-periodos">
            <thead>
              <tr><th>Periodo</th><th>Potencia (kW)</th><th>Consumo (kWh)</th></tr>
            </thead>
            <tbody>
              <tr v-for="p in periodos" :key="p">
                <td class="periodo">{{ p }}</td>
                <td><input v-model.number="perfil.potencias[p]" type="number" min="0" step="0.01" class="form-input form-input-sm" /></td>
                <td><input v-model.number="perfil.consumos[p]" type="number" min="0" step="0.01" class="form-input form-input-sm" /></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="acciones">
          <span class="resumen-perfil">
            Consumo: <strong>{{ formatearNumero(consumoTotal) }} kWh</strong> ·
            Potencia total: <strong>{{ formatearNumero(potenciaTotal) }} kW</strong>
          </span>
          <button class="btn btn-primary" :disabled="comparador.loading || consumoTotal <= 0" @click="comparar">
            {{ comparador.loading ? 'Calculando…' : 'Comparar ofertas' }}
          </button>
        </div>
        <p v-if="comparador.error" class="aviso-error">{{ comparador.error }}</p>
      </div>
    </div>

    <!-- ===== Precios de mercado ===== -->
    <div class="card">
      <div class="card-header">
        <h3>Precios de hoy por horas</h3>
        <span class="eyebrow" v-if="comparador.precios">
          media {{ formatearPrecio(comparador.precios.resumen?.media) }} €/kWh ·
          mín {{ formatearPrecio(comparador.precios.resumen?.minima) }} ·
          máx {{ formatearPrecio(comparador.precios.resumen?.maxima) }}
        </span>
      </div>
      <div class="card-body">
        <div v-if="comparador.precios" class="grafico">
          <div
            v-for="hora in comparador.precios.horario"
            :key="hora.datetime"
            class="barra"
            :class="clasePrecio(hora.pvpc)"
            :style="{ height: altura(hora.pvpc) + '%' }"
            :title="`${hora.datetime.slice(11, 16)} · PVPC ${formatearPrecio(hora.pvpc)} €/kWh · mercado ${formatearPrecio(hora.spot)}`"></div>
        </div>
        <p v-else class="texto-ayuda">Cargando precios de Red Eléctrica…</p>
        <p class="texto-ayuda" v-if="comparador.precios">
          Fuente: {{ comparador.precios.fuente }} · {{ comparador.precios.unidad }}
          {{ comparador.precios.cache ? '· en caché' : '' }}
        </p>
      </div>
    </div>

    <!-- ===== Resultados ===== -->
    <div v-if="comparador.resultado" class="card">
      <div class="card-header">
        <h3>Resultado de la comparación</h3>
        <span class="eyebrow">{{ comparador.resultado.perfil.dias }} días · {{ comparador.resultado.perfil.peaje }}</span>
      </div>
      <div class="card-body">
        <div class="tarjetas">
          <div class="metric-card" v-if="comparador.resultado.actual">
            <div class="metric-value">{{ formatearDinero(comparador.resultado.actual.importe) }}</div>
            <div class="metric-label">
              Factura actual ({{ comparador.resultado.actual.comercializadora || 'sin comercializadora' }})
            </div>
          </div>
          <div class="metric-card">
            <div class="metric-value">{{ formatearDinero(comparador.resultado.pvpc?.total) }}</div>
            <div class="metric-label">PVPC estimado (energía + impuestos)</div>
          </div>
          <div class="metric-card" v-if="mejorOferta">
            <div class="metric-value">{{ formatearDinero(mejorOferta.coste.total) }}</div>
            <div class="metric-label">Mejor oferta: {{ mejorOferta.comercializadora }}</div>
          </div>
        </div>

        <div v-if="comparador.resultado.ofertas.length > 0" class="table-container">
          <table>
            <thead>
              <tr>
                <th>Comercializadora</th>
                <th class="col-oferta">Oferta</th>
                <th class="col-tipo">Tipo</th>
                <th>Potencia</th>
                <th>Energía</th>
                <th>Impuestos</th>
                <th>Total</th>
                <th v-if="comparador.resultado.actual">Ahorro</th>
                <th class="col-aviso">Avisar</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="oferta in rankingVisibles" :key="oferta.id_oferta">
                <td class="empresa">{{ oferta.comercializadora }}</td>
                <td class="col-oferta">{{ oferta.nombre }}</td>
                <td class="col-tipo"><span class="badge badge-info">{{ oferta.tipo }}</span></td>
                <td>{{ formatearDinero(oferta.coste.potencia) }}</td>
                <td>{{ formatearDinero(oferta.coste.energia) }}</td>
                <td>{{ formatearDinero(oferta.coste.impuesto + oferta.coste.iva) }}</td>
                <td><strong>{{ formatearDinero(oferta.coste.total) }}</strong></td>
                <td v-if="comparador.resultado.actual" :class="oferta.ahorro > 0 ? 'ahorro-positivo' : 'ahorro-negativo'">
                  {{ oferta.ahorro > 0 ? '+' : '' }}{{ formatearDinero(oferta.ahorro) }}
                </td>
                <td class="col-aviso">
                  <button
                    v-if="puedeNotificar(oferta)"
                    class="btn btn-primary btn-sm"
                    @click="abrirAviso(oferta)">
                    Avisar
                  </button>
                  <span v-else class="sin-aviso" :title="motivoSinAviso(oferta)">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <PaginacionBar
          v-bind="rankingProps"
          @update:pagina="irARanking"
          @update:porPagina="tamanoRanking" />
        <p v-if="correoNoConfigurado" class="aviso-correo">
          <strong>Aviso por correo sin configurar:</strong> el aviso se registrará, pero no se entregará
          hasta definir <code>RESEND_API_KEY</code> o <code>SMTP_*</code> en el servidor.
        </p>
        <p v-if="!comparador.resultado.ofertas.length" class="texto-ayuda">
          No hay ofertas en el catálogo que se puedan comparar con este perfil.
          Añádelas más abajo.
        </p>

        <p class="texto-ayuda nota-legal">
          Estimación basada en los datos indicados. No es el comparador oficial de la CNMC.
        </p>
      </div>
    </div>

    <!-- ===== Asistente ===== -->
    <div class="card">
      <div class="card-header">
        <h3>Asistente</h3>
        <span class="eyebrow">solo usa las cifras de esta comparación</span>
      </div>
      <div class="card-body">
        <div class="fila-factura">
          <input
            v-model="pregunta"
            class="form-input"
            placeholder="¿Qué oferta me conviene? ¿Cuánto ahorraría?"
            :disabled="!comparador.resultado" />
          <button class="btn btn-primary" :disabled="!comparador.resultado || preguntando" @click="preguntar">
            {{ preguntando ? 'Analizando…' : 'Analizar con IA' }}
          </button>
        </div>
        <p v-if="!comparador.resultado" class="texto-ayuda">
          Primero calcula una comparación para que el asistente tenga datos reales.
        </p>
        <div v-if="comparador.asistente" class="respuesta-ia">
          <p class="texto-respuesta">{{ comparador.asistente.respuesta }}</p>
          <p class="meta-ia">
            Modelo: {{ comparador.asistente.modelo }} ·
            <span :class="comparador.asistente.cifras_verificadas ? 'ok' : 'aviso'">
              {{ comparador.asistente.cifras_verificadas
                ? 'todas las cifras están en los datos'
                : 'hay cifras sin respaldo: ' + comparador.asistente.cifras_inventadas.join(', ') }}
            </span>
          </p>
        </div>
      </div>
    </div>

    <!-- ===== Catálogo de ofertas ===== -->
    <div class="card">
      <div class="card-header">
        <h3>Catálogo de ofertas ({{ comparador.ofertas.length }})</h3>
        <div class="cabecera-catalogo">
          <button
            class="btn btn-primary btn-sm"
            :disabled="comparador.sincronizando"
            title="Descarga las ofertas oficiales del Comparador de la CNMC"
            @click="sincronizarCnmc">
            {{ comparador.sincronizando ? 'Sincronizando…' : '↻ Sincronizar CNMC' }}
          </button>
          <input ref="inputCsv" type="file" accept=".csv,text/csv" class="oculto" @change="importarCsv" />
          <button class="btn btn-secondary btn-sm" @click="inputCsv?.click()" :disabled="importando">
            {{ importando ? 'Importando…' : 'Importar CSV' }}
          </button>
          <button class="btn btn-secondary btn-sm" @click="mostrarFormulario = !mostrarFormulario">
            {{ mostrarFormulario ? 'Cerrar' : '+ Añadir oferta' }}
          </button>
        </div>
      </div>

      <div class="card-body" v-if="mostrarFormulario">
        <div class="rejilla rejilla-3">
          <label class="campo"><span>Comercializadora *</span>
            <input v-model="nueva.comercializadora" class="form-input" placeholder="Iberdrola" /></label>
          <label class="campo"><span>Nombre de la tarifa *</span>
            <input v-model="nueva.nombre" class="form-input" placeholder="Plan Online 2.0TD" /></label>
          <label class="campo"><span>Tipo</span>
            <select v-model="nueva.tipo" class="form-input">
              <option value="fijo">Fijo</option>
              <option value="indexado">Indexado</option>
              <option value="pvpc">PVPC</option>
            </select></label>
          <label class="campo"><span>Peajes</span>
            <input v-model="nueva.peajes" class="form-input" placeholder="2.0TD" /></label>
          <label class="campo"><span>Provincias (vacío = nacional)</span>
            <input v-model="nueva.provincias" class="form-input" placeholder="Murcia, Salamanca" /></label>
          <label class="campo"><span>Excedentes (€/kWh)</span>
            <input v-model.number="nueva.precio_excedentes" type="number" step="0.001" class="form-input" /></label>
          <label class="campo"><span>Alquiler contador (€/mes)</span>
            <input v-model.number="nueva.alquiler_contador" type="number" step="0.01" class="form-input" /></label>
          <label class="campo"><span>Fuente</span>
            <input v-model="nueva.fuente" class="form-input" placeholder="Web de la comercializadora" /></label>
        </div>

        <div class="tabla-bloque">
          <span class="tabla-titulo">Precios por periodo</span>
          <table class="tabla-periodos">
            <thead><tr><th>Periodo</th><th>Energía (€/kWh)</th><th>Potencia (€/kW/año)</th></tr></thead>
            <tbody>
              <tr v-for="p in periodos" :key="`nueva-${p}`">
                <td class="periodo">{{ p }}</td>
                <td><input v-model.number="nueva.precio_energia[p]" type="number" step="0.0001" class="form-input form-input-sm" /></td>
                <td><input v-model.number="nueva.precio_potencia[p]" type="number" step="0.01" class="form-input form-input-sm" /></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="acciones">
          <span v-if="errorOferta" class="aviso-error">{{ errorOferta }}</span>
          <button class="btn btn-primary" :disabled="guardandoOferta" @click="guardarOferta">
            {{ guardandoOferta ? 'Guardando…' : 'Guardar oferta' }}
          </button>
        </div>
      </div>

      <div class="card-body" v-if="resumenImportacion || errorOferta || comparador.resumenSync">
        <p v-if="resumenImportacion" class="resumen-importacion">{{ resumenImportacion }}</p>
        <p v-if="comparador.resumenSync" class="resumen-importacion">
          CNMC ({{ comparador.resumenSync.fecha_consulta }}):
          {{ comparador.resumenSync.ofertas_recibidas }} ofertas recibidas ·
          <strong>{{ comparador.resumenSync.nuevas }} nuevas</strong>,
          {{ comparador.resumenSync.actualizadas }} actualizadas,
          {{ comparador.resumenSync.desactivadas }} retiradas ·
          {{ comparador.resumenSync.descartadas.solo_gas }} de gas ignoradas
        </p>
        <p v-if="comparador.resumenSync?.aviso_migracion" class="resumen-importacion">
          {{ comparador.resumenSync.aviso_migracion }}
        </p>
        <p v-if="errorOferta" class="aviso-error">{{ errorOferta }}</p>
      </div>

      <div class="card-body" v-if="comparador.ofertas.length > 0" style="padding-bottom:0">
        <div class="table-container">
          <table>
            <thead>
              <tr><th>Comercializadora</th><th>Tarifa</th><th>Tipo</th><th>Peajes</th><th>Energía P1</th><th>Acciones</th></tr>
            </thead>
            <tbody>
              <tr v-for="oferta in catalogoVisibles" :key="oferta.id_oferta">
                <td class="empresa">{{ oferta.comercializadora }}</td>
                <td>{{ oferta.nombre }}</td>
                <td>{{ oferta.tipo }}</td>
                <td>{{ (oferta.peajes || []).join(', ') }}</td>
                <td>{{ oferta.precio_energia?.P1 ?? '—' }}</td>
                <td>
                  <button class="btn btn-danger btn-sm" @click="borrarOferta(oferta)">Quitar</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <PaginacionBar
          v-bind="catalogoProps"
          @update:pagina="irACatalogo"
          @update:porPagina="tamanoCatalogo" />
      </div>

      <!-- Atribución obligatoria mientras se usen datos de la CNMC -->
      <div class="card-body atribucion-cnmc" v-if="comparador.estadoCatalogo">
        <p class="nota-atribucion">
          {{ comparador.estadoCatalogo.atribucion }} ·
          <strong>{{ comparador.estadoCatalogo.activas }}</strong> ofertas activas de
          {{ comparador.estadoCatalogo.comercializadoras }} comercializadoras.
          <span v-if="comparador.estadoCatalogo.actualizado_en">
            Última actualización: {{ fechaCorta(comparador.estadoCatalogo.actualizado_en) }}
          </span>
        </p>
      </div>
    </div>

    <!-- Aviso por correo al cliente -->
    <div v-if="aviso" class="modal-fondo" @click.self="cerrarAviso">
      <div class="modal-card">
        <h3>Avisar al cliente del cambio de tarifa</h3>

        <p class="modal-texto">
          Se enviará un correo a <strong>{{ aviso.email || 'sin correo' }}</strong> con la comparación
          y el ahorro estimado. El importe se recalcula en el servidor con los datos de la factura.
        </p>

        <div class="resumen-aviso">
          <div><span>Cliente</span><strong>{{ nombreClienteAviso }}</strong></div>
          <div><span>Factura</span><strong>{{ facturaNumeroAviso }}</strong></div>
          <div><span>Paga ahora</span><strong>{{ formatearDinero(comparador.resultado?.actual?.importe) }}</strong></div>
          <div><span>{{ aviso.oferta.comercializadora }}</span><strong>{{ formatearDinero(aviso.oferta.coste.total) }}</strong></div>
          <div class="total"><span>Ahorro estimado al año</span><strong>{{ formatearDinero(ahorroAnualAviso) }}</strong></div>
        </div>

        <div class="form-group">
          <label class="form-label">Correo del cliente</label>
          <input
            v-model.trim="aviso.email"
            type="email"
            class="form-input"
            placeholder="cliente@empresa.com"
            :disabled="aviso.enviando || aviso.exito"
            @keyup.enter="enviarAviso" />
          <p class="ayuda-aviso">
            Si el cliente no tiene correo guardado, escríbelo aquí: no se modifica su ficha.
          </p>
        </div>

        <p v-if="correoNoConfigurado" class="modal-aviso">
          No hay proveedor de correo configurado: el aviso quedará registrado pero no se entregará.
        </p>
        <p v-if="aviso.error" class="modal-error">{{ aviso.error }}</p>
        <p v-if="aviso.exito" class="modal-exito">{{ aviso.exito }}</p>

        <div class="modal-acciones">
          <button class="btn btn-secondary" @click="cerrarAviso" :disabled="aviso.enviando">
            {{ aviso.exito ? 'Cerrar' : 'Cancelar' }}
          </button>
          <button
            v-if="!aviso.exito"
            class="btn btn-primary"
            @click="enviarAviso"
            :disabled="aviso.enviando || !aviso.email">
            {{ aviso.enviando ? 'Enviando…' : 'Enviar correo' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useComparadorStore } from '../stores/comparador'
import { useFacturasStore } from '../stores/facturas'
import { usePaginacion } from '../composables/usePaginacion'
import PaginacionBar from '../components/PaginacionBar.vue'

const comparador = useComparadorStore()
const facturasStore = useFacturasStore()

// Ranking de la simulación y catálogo completo: listas largas, paginadas.
const ofertasRanking = computed(() => comparador.resultado?.ofertas || [])
const ofertasCatalogo = computed(() => comparador.ofertas || [])

const {
  visibles: rankingVisibles,
  props: rankingProps,
  irA: irARanking,
  definirTamano: tamanoRanking
} = usePaginacion(ofertasRanking, { porPagina: 10 })

const {
  visibles: catalogoVisibles,
  props: catalogoProps,
  irA: irACatalogo,
  definirTamano: tamanoCatalogo
} = usePaginacion(ofertasCatalogo, { porPagina: 15 })

const fuentes = computed(() => comparador.fuentes)
const fuenteElegida = ref('ree')
const facturasConPerfil = ref([])
const facturaElegida = ref('')
const pregunta = ref('')
const preguntando = ref(false)
const mostrarFormulario = ref(false)
const guardandoOferta = ref(false)
const errorOferta = ref(null)
const inputCsv = ref(null)
const importando = ref(false)
const resumenImportacion = ref(null)

const periodos = computed(() => (
  perfil.value.peaje === '2.0TD' ? ['P1', 'P2', 'P3'] : ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']
))

const perfil = ref({
  provincia: '',
  peaje: '2.0TD',
  dias: 31,
  excedentes_kwh: 0,
  potencias: { P1: null, P2: null },
  consumos: { P1: null, P2: null, P3: null }
})

const nueva = ref(ofertaVacia())

function ofertaVacia() {
  const vacio = {}
  for (const p of periodos.value) vacio[p] = null
  return {
    comercializadora: '', nombre: '', tipo: 'fijo', peajes: '2.0TD', provincias: '',
    precio_excedentes: 0, alquiler_contador: 0, fuente: '',
    precio_energia: { ...vacio },
    precio_potencia: { ...vacio }
  }
}

const consumoTotal = computed(() =>
  Object.values(perfil.value.consumos || {}).reduce((t, v) => t + (Number(v) || 0), 0))
const potenciaTotal = computed(() =>
  Object.values(perfil.value.potencias || {}).reduce((t, v) => t + (Number(v) || 0), 0))
const mejorOferta = computed(() => comparador.resultado?.ofertas?.[0] || null)

// === Aviso por correo al cliente ===
const clienteDeFactura = ref(null)
const aviso = ref(null)

const correoNoConfigurado = computed(() => comparador.correo && comparador.correo.disponible === false)
const nombreClienteAviso = computed(() =>
  clienteDeFactura.value?.empresa || clienteDeFactura.value?.nombre || 'Cliente sin ficha')
const facturaNumeroAviso = computed(() => comparador.resultado?.actual?.num_factura || 'factura cargada')

const ahorroAnualAviso = computed(() => {
  const oferta = aviso.value?.oferta
  const dias = Number(comparador.resultado?.perfil?.dias) || 30
  if (!oferta || oferta.ahorro === null || oferta.ahorro === undefined) return null
  return oferta.ahorro * (365 / dias)
})

/** Solo se puede avisar partiendo de una factura real con un cliente detrás. */
function puedeNotificar(oferta) {
  return Boolean(facturaElegida.value) &&
    Boolean(comparador.resultado?.actual) &&
    Number(oferta.ahorro) > 0
}

function motivoSinAviso(oferta) {
  if (!comparador.resultado?.actual) return 'Carga el perfil desde una factura para poder avisar al cliente'
  if (!(Number(oferta.ahorro) > 0)) return 'Esta oferta no es más barata que la factura actual'
  return 'No se puede avisar de esta oferta'
}

function abrirAviso(oferta) {
  aviso.value = {
    oferta,
    email: clienteDeFactura.value?.email || '',
    enviando: false,
    error: null,
    exito: null
  }
}

function cerrarAviso() {
  if (aviso.value?.enviando) return
  aviso.value = null
}

async function enviarAviso() {
  if (!aviso.value || aviso.value.enviando || aviso.value.exito) return
  aviso.value.enviando = true
  aviso.value.error = null
  try {
    const respuesta = await comparador.notificarCambio({
      id_factura: facturaElegida.value,
      id_oferta: aviso.value.oferta.id_oferta,
      email: aviso.value.email
    })
    const entrega = respuesta.entrega?.estado
    const destino = respuesta.data?.email_destino || aviso.value.email
    aviso.value.exito = entrega === 'enviado'
      ? `Correo enviado a ${destino}.`
      : `Aviso guardado para ${destino}, pero no se ha entregado: falta configurar el proveedor de correo.`
    if (respuesta.aviso) aviso.value.exito += ` ${respuesta.aviso}`
  } catch (e) {
    aviso.value.error = e.response?.data?.error || e.message
  } finally {
    aviso.value.enviando = false
  }
}

function formatearDinero(valor) {
  if (valor === null || valor === undefined) return '—'
  return Number(valor).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
}

function formatearNumero(valor) {
  return Number(valor || 0).toLocaleString('es-ES', { maximumFractionDigits: 2 })
}

function formatearPrecio(valor) {
  if (!Number.isFinite(valor)) return '—'
  return Number(valor).toFixed(4)
}

function altura(valor) {
  const maximo = comparador.precios?.resumen?.maxima || 1
  return Math.max(4, Math.round((Number(valor) / maximo) * 100))
}

function clasePrecio(valor) {
  const media = comparador.precios?.resumen?.media || 0
  if (!Number.isFinite(valor)) return ''
  if (valor > media * 1.2) return 'caro'
  if (valor < media * 0.8) return 'barato'
  return 'medio'
}

async function cargarDeFactura() {
  const datos = await comparador.perfilDeFactura(facturaElegida.value)
  clienteDeFactura.value = datos.cliente || null
  perfil.value.provincia = datos.perfil.provincia || ''
  perfil.value.peaje = datos.perfil.peaje || '2.0TD'
  perfil.value.dias = datos.factura.dias_facturados || 31
  perfil.value.excedentes_kwh = datos.perfil.excedentes_kwh || 0

  // Solo se rellenan los periodos que la factura tenga de verdad
  const ampliar = (mapa, destino) => {
    for (const [p, v] of Object.entries(mapa || {})) {
      if (v === null || v === undefined || v === '') continue
      destino[p] = Number(v)
    }
  }
  ampliar(datos.perfil.potencias, perfil.value.potencias)
  ampliar(datos.perfil.consumos, perfil.value.consumos)
}

async function comparar() {
  const limpiar = (mapa) => Object.fromEntries(
    Object.entries(mapa || {}).filter(([, v]) => Number(v) > 0)
  )
  await comparador.simular({
    provincia: perfil.value.provincia || null,
    peaje: perfil.value.peaje,
    dias: Number(perfil.value.dias) || 31,
    excedentes_kwh: Number(perfil.value.excedentes_kwh) || 0,
    potencias: limpiar(perfil.value.potencias),
    consumos: limpiar(perfil.value.consumos),
    factura_id: facturaElegida.value || null
  })
}

async function preguntar() {
  preguntando.value = true
  try {
    await comparador.preguntarAlAsistente(pregunta.value)
  } catch (e) {
    // el store ya guarda el mensaje
  } finally {
    preguntando.value = false
  }
}

async function guardarOferta() {
  errorOferta.value = null
  if (!nueva.value.comercializadora.trim() || !nueva.value.nombre.trim()) {
    errorOferta.value = 'Comercializadora y nombre de la tarifa son obligatorios'
    return
  }
  guardandoOferta.value = true
  try {
    await comparador.crearOferta({
      ...nueva.value,
      peajes: nueva.value.peajes.split(',').map((p) => p.trim()).filter(Boolean),
      provincias: nueva.value.provincias.split(',').map((p) => p.trim()).filter(Boolean)
    })
    nueva.value = ofertaVacia()
    mostrarFormulario.value = false
  } catch (e) {
    errorOferta.value = e.response?.data?.error || e.message
  } finally {
    guardandoOferta.value = false
  }
}

/**
 * Importa ofertas desde CSV separado por ; o ,
 * Cabecera: comercializadora;nombre;tipo;peajes;provincias;P1_energia;P2_energia;P3_energia;P1_potencia;P2_potencia;excedentes;alquiler;fuente
 */
async function importarCsv(evento) {
  const archivo = evento.target.files?.[0]
  evento.target.value = ''
  if (!archivo) return

  importando.value = true
  resumenImportacion.value = null
  errorOferta.value = null

  try {
    const texto = await archivo.text()
    const lineas = texto
      .split(String.fromCharCode(10))
      .map((l) => l.replace(String.fromCharCode(13), ''))
      .filter((l) => l.trim())
    if (lineas.length < 2) throw new Error('El CSV está vacío o solo tiene la cabecera')

    const separador = lineas[0].includes(';') ? ';' : ','
    const cabecera = lineas[0].split(separador).map((c) => c.trim().toLowerCase())

    const leer = (celdas, nombre) => {
      const i = cabecera.indexOf(nombre)
      return i === -1 ? '' : (celdas[i] || '').trim()
    }

    let creadas = 0
    const errores = []

    for (const linea of lineas.slice(1)) {
      const celdas = linea.split(separador)
      try {
        await comparador.crearOferta({
          comercializadora: leer(celdas, 'comercializadora'),
          nombre: leer(celdas, 'nombre'),
          tipo: leer(celdas, 'tipo') || 'fijo',
          peajes: (leer(celdas, 'peajes') || '2.0TD').split(/[|,]/).map((p) => p.trim()).filter(Boolean),
          provincias: leer(celdas, 'provincias').split(/[|,]/).map((p) => p.trim()).filter(Boolean),
          precio_energia: {
            P1: leer(celdas, 'p1_energia'), P2: leer(celdas, 'p2_energia'), P3: leer(celdas, 'p3_energia')
          },
          precio_potencia: {
            P1: leer(celdas, 'p1_potencia'), P2: leer(celdas, 'p2_potencia')
          },
          precio_excedentes: leer(celdas, 'excedentes') || 0,
          alquiler_contador: leer(celdas, 'alquiler') || 0,
          fuente: leer(celdas, 'fuente')
        })
        creadas++
      } catch (e) {
        errores.push(e.response?.data?.error || e.message)
      }
    }

    resumenImportacion.value = `${creadas} oferta(s) importadas` +
      (errores.length ? ` · ${errores.length} con error: ${errores[0]}` : '')
  } catch (e) {
    errorOferta.value = e.message
  } finally {
    importando.value = false
  }
}

async function borrarOferta(oferta) {
  await comparador.eliminarOferta(oferta.id_oferta)
}

/** Pide a la CNMC su catálogo oficial y lo guarda en la base de datos. */
async function sincronizarCnmc() {
  errorOferta.value = null
  resumenImportacion.value = null
  try {
    await comparador.sincronizarCatalogo()
  } catch (e) {
    errorOferta.value = e.response?.data?.error || e.message
  }
}

function fechaCorta(valor) {
  if (!valor) return ''
  return new Date(valor).toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

onMounted(async () => {
  await Promise.all([
    comparador.cargarFuentes(),
    comparador.cargarPrecios(),
    comparador.cargarOfertas(),
    comparador.cargarEstadoCatalogo(),
    comparador.cargarEstadoCorreo()
  ])

  // Facturas que ya tienen consumo por periodo
  try {
    if (facturasStore.facturas.length === 0) await facturasStore.cargarFacturas()
    facturasConPerfil.value = (facturasStore.facturas || []).filter(
      (f) => f.consumos_periodo && Object.keys(f.consumos_periodo).length > 0
    )
  } catch (e) {
    facturasConPerfil.value = []
  }
})
</script>

<style scoped>
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.fuente-selector {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 280px;
}

.mini-label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.aviso-fuentes {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

@media (max-width: 900px) {
  .aviso-fuentes { grid-template-columns: 1fr; }
}

.fuente-chip {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.7rem 0.9rem;
  border-radius: 8px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  font-size: 0.78rem;
}

.fuente-chip strong { font-size: 0.8125rem; }
.fuente-chip span { color: var(--color-text-muted); }
.fuente-chip em { font-style: normal; color: var(--color-success); font-weight: 600; }
.fuente-chip.apagada em { color: var(--color-error); }
.fuente-chip.apagada { opacity: 0.75; }

.fila-factura {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.fila-factura .form-input { flex: 1; min-width: 240px; }

.rejilla {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.rejilla-3 { grid-template-columns: repeat(3, 1fr); }

@media (max-width: 900px) {
  .rejilla, .rejilla-3 { grid-template-columns: 1fr 1fr; }
}

.campo {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}

.tabla-bloque { margin-bottom: 1rem; }

.tabla-titulo {
  display: block;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--color-text-muted);
  margin-bottom: 0.5rem;
}

.tabla-periodos { width: 100%; border-collapse: collapse; }
.tabla-periodos th, .tabla-periodos td { padding: 0.4rem 0.5rem; font-size: 0.8125rem; text-align: left; }
.periodo { font-weight: 600; color: var(--color-text-muted); }

.acciones {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-top: 0.5rem;
}

.resumen-perfil { font-size: 0.8125rem; color: var(--color-text-muted); }

.grafico {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 140px;
  padding-bottom: 0.5rem;
}

.barra {
  flex: 1;
  border-radius: 2px 2px 0 0;
  background: var(--color-primary-light);
  min-width: 3px;
  transition: filter 0.15s;
}

.barra:hover { filter: brightness(1.2); }
.barra.caro { background: var(--color-error); }
.barra.medio { background: var(--color-warning); }
.barra.barato { background: var(--color-success); }

.tarjetas {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  margin-bottom: 1.25rem;
}

@media (max-width: 900px) {
  .tarjetas { grid-template-columns: 1fr; }
}

.empresa { font-weight: 600; }
.ahorro-positivo { color: var(--color-success); font-weight: 600; }
.ahorro-negativo { color: var(--color-error); font-weight: 600; }

.texto-ayuda {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
  margin-top: 0.5rem;
}

.nota-legal { margin-top: 1rem; font-size: 0.75rem; }

.respuesta-ia {
  margin-top: 1rem;
  padding: 0.9rem 1rem;
  border-radius: 8px;
  background: #eff6ff;
  border-left: 4px solid var(--color-primary);
}

.texto-respuesta { font-size: 0.875rem; white-space: pre-line; }

.meta-ia {
  margin-top: 0.6rem;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.meta-ia .ok { color: var(--color-success); font-weight: 600; }
.meta-ia .aviso { color: var(--color-warning); font-weight: 600; }

.aviso-error {
  font-size: 0.8125rem;
  color: #b91c1c;
  font-weight: 500;
}

.btn-sm { padding: 0.3rem 0.65rem; font-size: 0.8125rem; }
.cabecera-catalogo { display: flex; gap: 0.5rem; }
.oculto { display: none; }
.resumen-importacion { font-size: 0.8125rem; color: var(--color-success); font-weight: 500; }
.atribucion-cnmc {
  border-top: 1px solid var(--color-border);
  padding-top: 0.75rem;
  margin-top: 0.75rem;
}

.nota-atribucion {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
  align-items: baseline;
}

/* ===== Aviso por correo al cliente ===== */
.col-aviso {
  width: 92px;
  text-align: right;
  white-space: nowrap;
}

.sin-aviso {
  color: var(--color-text-muted);
}

.aviso-correo {
  margin: 0.75rem 0 0;
  padding: 0.6rem 0.8rem;
  border-radius: 8px;
  background: rgba(217, 119, 6, 0.1);
  color: #92400e;
  font-size: 0.8125rem;
}

.resumen-aviso {
  display: grid;
  gap: 0.35rem;
  margin: 1rem 0;
  padding: 0.85rem 1rem;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 0.85rem;
}

.resumen-aviso div {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

.resumen-aviso span {
  color: var(--color-text-muted);
}

.resumen-aviso .total {
  margin-top: 0.25rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--color-border);
  color: var(--color-primary);
}

.ayuda-aviso {
  margin-top: 0.35rem;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.modal-aviso {
  margin-top: 0.75rem;
  padding: 0.6rem 0.8rem;
  border-radius: 6px;
  background: rgba(217, 119, 6, 0.12);
  color: #92400e;
  font-size: 0.8125rem;
}

.modal-exito {
  margin-top: 0.75rem;
  padding: 0.6rem 0.8rem;
  border-radius: 6px;
  background: rgba(5, 150, 105, 0.12);
  color: #065f46;
  font-size: 0.8125rem;
}

/* En pantallas medianas se retiran las columnas que no son imprescindibles */
@media (max-width: 1120px) {
  .col-tipo {
    display: none;
  }
}

@media (max-width: 980px) {
  .col-oferta {
    display: none;
  }
}
</style>
