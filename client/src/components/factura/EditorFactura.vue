<template>
  <div class="editor">
    <form @submit.prevent="guardar">
      <div v-if="esManual" class="aviso-manual">
        <strong>No se ha podido leer la factura automáticamente.</strong>
        <span>Introduce los datos a mano, elige el cliente y pulsa «Guardar cambios».</span>
      </div>
      <div v-else-if="factura && sinDatosUtiles" class="aviso-manual">
        <strong>Esta factura no tiene datos extraídos.</strong>
        <span>Rellena los campos que falten y guarda.</span>
      </div>

      <div class="cliente-section">
        <label class="cliente-label" for="select-cliente">Cliente / Empresa *</label>
        <div class="cliente-row">
          <select
            id="select-cliente"
            v-model="idCliente"
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
          <p v-if="!rutaArchivo && !esManual" class="cliente-ayuda">
            Al elegir cliente, el archivo se guarda como <code>día-mes-año-idEmpresa-nºFactura.ext</code>.
          </p>
        </template>
      </div>

      <!-- ===== 1. Suministro y contrato ===== -->
      <section class="bloque">
        <h4 class="bloque-titulo">Suministro y contrato</h4>
        <div class="field-grid">
          <FieldInput
            v-for="campo in camposSuministro"
            :key="campo.key"
            v-model="formData[campo.key]"
            :label="campo.label"
            :type="campo.type"
            :step="campo.step"
            :method="metodoDe(campo.key)"
            :readonly="campo.readonly" />
        </div>
      </section>

      <!-- ===== 2. Potencia por periodo ===== -->
      <section class="bloque">
        <h4 class="bloque-titulo">
          Potencia por periodo (kW)
          <span v-if="peaje" class="bloque-nota">{{ peaje }}</span>
        </h4>
        <p class="bloque-ayuda">
          La máxima demandada la incluye la distribuidora: es el dato que detecta si sobra potencia contratada.
        </p>
        <div class="table-container compact">
          <table>
            <thead>
              <tr>
                <th>Periodo</th>
                <th>Contratada</th>
                <th>Máxima demandada</th>
                <th>Precio (€/kW/año)</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="periodo in periodosPotencia" :key="`pot-${periodo}`">
                <td class="periodo-celda">{{ periodo }}</td>
                <td><input v-model.number="formData.potencias_contratadas[periodo]" type="number" step="0.01" min="0" class="form-input form-input-sm" /></td>
                <td><input v-model.number="formData.potencias_maximas[periodo]" type="number" step="0.01" min="0" class="form-input form-input-sm" /></td>
                <td><input v-model.number="formData.precio_potencia[periodo]" type="number" step="0.0001" min="0" class="form-input form-input-sm" /></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="avisoPotencia" class="aviso-sugerencia">{{ avisoPotencia }}</p>
      </section>

      <!-- ===== 3. Energía por periodo ===== -->
      <section class="bloque">
        <h4 class="bloque-titulo">Energía por periodo</h4>
        <div class="table-container compact">
          <table>
            <thead>
              <tr>
                <th>Periodo</th>
                <th>Consumo (kWh)</th>
                <th>Precio (€/kWh)</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="periodo in periodosEnergia" :key="`ene-${periodo}`">
                <td class="periodo-celda">{{ periodo }}</td>
                <td><input v-model.number="formData.consumos_periodo[periodo]" type="number" step="0.01" min="0" class="form-input form-input-sm" /></td>
                <td><input v-model.number="formData.precios_periodo[periodo]" type="number" step="0.0001" min="0" class="form-input form-input-sm" /></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="bloque-nota" v-if="sumaConsumos > 0">
          Suma de periodos: <strong>{{ formatearNumero(sumaConsumos) }} kWh</strong>
          <template v-if="diferenciaConsumo !== null">
            <span :class="['descuadre', { ok: Math.abs(diferenciaConsumo) <= 0.5 }]">
              · {{ diferenciaConsumo > 0 ? 'faltan' : 'sobran' }}
              {{ formatearNumero(Math.abs(diferenciaConsumo)) }} kWh respecto al total
            </span>
          </template>
        </p>
        <div class="field-grid">
          <FieldInput
            v-model="formData.consumo_total_kwh"
            label="Consumo total facturado (kWh)"
            type="number"
            step="0.01"
            :method="metodoDe('consumo_total_kwh')" />
          <FieldInput
            v-model="formData.dias_facturados"
            label="Días facturados"
            type="number"
            step="1"
            :method="metodoDe('dias_facturados')" />
        </div>
      </section>

      <!-- ===== 4. Autoconsumo ===== -->
      <section class="bloque">
        <h4 class="bloque-titulo">Autoconsumo</h4>
        <div class="field-grid">
          <div class="form-group">
            <label class="form-label" for="autoconsumo">Modalidad</label>
            <select id="autoconsumo" v-model="formData.autoconsumo" class="form-input">
              <option value="">— Sin datos —</option>
              <option value="sin">Sin autoconsumo</option>
              <option value="excedentes">Con excedentes</option>
              <option value="compensacion_simplificada">Compensación simplificada</option>
            </select>
          </div>
          <FieldInput
            v-model="formData.excedentes_kwh"
            label="Excedentes (kWh)"
            type="number"
            step="0.01"
            :method="metodoDe('excedentes_kwh')" />
          <FieldInput
            v-model="formData.excedentes_eur"
            label="Compensación de excedentes (€)"
            type="number"
            step="0.01"
            :method="metodoDe('excedentes_eur')" />
        </div>
      </section>

      <!-- ===== 5. Desglose económico ===== -->
      <section class="bloque">
        <h4 class="bloque-titulo">Desglose económico (€)</h4>
        <div class="field-grid">
          <FieldInput
            v-for="campo in camposEconomicos"
            :key="campo.key"
            v-model="formData[campo.key]"
            :label="campo.label"
            type="number"
            step="0.01"
            :method="metodoDe(campo.key)" />
          <div class="form-group">
            <label class="form-label" for="tipo-lectura">Tipo de lectura</label>
            <select id="tipo-lectura" v-model="formData.tipo_lectura" class="form-input">
              <option value="">— Sin datos —</option>
              <option value="real">Real</option>
              <option value="estimada">Estimada</option>
            </select>
          </div>
          <div class="form-group campo-bono">
            <label class="checkbox-label">
              <input type="checkbox" v-model="formData.bono_social" />
              Bono social
            </label>
          </div>
        </div>
        <p class="bloque-nota">{{ textoCuadre }}</p>
      </section>

      <div class="field-grid" v-if="lineas.length > 0">
        <div class="field-full">
          <h4>Líneas de factura</h4>
          <div class="table-container compact">
            <table>
              <thead>
                <tr>
                  <th>Concepto</th>
                  <th>Periodo</th>
                  <th>Cantidad</th>
                  <th>Precio unit.</th>
                  <th>Importe</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(linea, i) in lineas" :key="i">
                  <td><input v-model="linea.concepto" class="form-input form-input-sm" /></td>
                  <td><input v-model="linea.periodo_tarifario" class="form-input form-input-sm" /></td>
                  <td><input v-model="linea.cantidad" type="number" step="0.01" class="form-input form-input-sm" /></td>
                  <td><input v-model="linea.precio_unitario" type="number" step="0.0001" class="form-input form-input-sm" /></td>
                  <td><input v-model="linea.importe" type="number" step="0.01" class="form-input form-input-sm" /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <p v-if="store.aviso" class="aviso-guardado">{{ store.aviso }}</p>

      <div class="form-actions">
        <span v-if="guardadoOk" class="guardado-ok">✓ Cambios guardados</span>
        <span v-else-if="faltaCliente" class="falta-cliente">Selecciona un cliente para poder guardar</span>
        <button
          type="submit"
          class="btn btn-primary"
          :disabled="!puedeGuardar"
          :title="faltaCliente ? 'Asigna un cliente antes de guardar' : ''">
          <svg v-if="loading" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/></svg>
          <span>{{ loading ? 'Guardando…' : 'Guardar cambios' }}</span>
        </button>
      </div>
    </form>

    <ModalCliente
      v-if="modalCliente"
      @cerrada="modalCliente = false"
      @guardado="alCrearCliente" />

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
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useFacturasStore } from '../../stores/facturas'
import { useClientesStore } from '../../stores/clientes'
import FieldInput from '../FieldInput.vue'
import ModalCliente from './ModalCliente.vue'

const props = defineProps({
  /** Factura ya guardada. En modo manual llega null. */
  factura: { type: Object, default: null },
  /** Archivo pendiente de guardar (rescate tras un fallo de subida). */
  archivo: { type: Object, default: null },
  /** true = alta manual desde cero (no hay factura todavía). */
  manual: { type: Boolean, default: false }
})
const emit = defineEmits(['guardada', 'creada'])

const store = useFacturasStore()
const clientesStore = useClientesStore()
const router = useRouter()

const formData = ref({})
const originalData = ref({})
const lineas = ref([])
const idCliente = ref('')
const guardandoCliente = ref(false)
const guardadoOk = ref(false)
const error = ref(null)
const modalCliente = ref(false)
const avisoCliente = ref(null)
const avisoArchivo = ref(null)
const sinDatosUtiles = ref(false)
const permitirSalir = ref(false)  // true = ya se guardó o el usuario descartó

const esManual = computed(() => props.manual)
const clientes = computed(() => clientesStore.clientes)
const loading = computed(() => store.loading)
const faltaCliente = computed(() => !idCliente.value)
const rutaArchivo = computed(() => {
  const ruta = props.factura?.ruta_pdf
  return ruta && !String(ruta).startsWith('data:') ? ruta : null
})

const camposSuministro = [
  { key: 'num_factura', label: 'Número de factura', type: 'text' },
  { key: 'id_contrato', label: 'Nº de contrato', type: 'text' },
  { key: 'fecha_emision', label: 'Fecha emisión', type: 'date' },
  { key: 'fecha_fin_contrato', label: 'Fin de contrato', type: 'date' },
  { key: 'periodo_inicio', label: 'Periodo inicio', type: 'date' },
  { key: 'periodo_fin', label: 'Periodo fin', type: 'date' },
  { key: 'titular', label: 'Titular', type: 'text' },
  { key: 'nif', label: 'NIF/CIF', type: 'text' },
  { key: 'cups', label: 'CUPS', type: 'text', readonly: true },
  { key: 'direccion_suministro', label: 'Dirección de suministro', type: 'text' },
  { key: 'codigo_postal', label: 'Código postal', type: 'text' },
  { key: 'provincia', label: 'Provincia', type: 'text' },
  { key: 'comercializadora', label: 'Comercializadora', type: 'text' },
  { key: 'peaje_acceso', label: 'Tarifa de acceso (peaje)', type: 'text' },
  { key: 'tipo_contrato', label: 'Tipo de contrato', type: 'text' },
  { key: 'tipo_suministro', label: 'Tipo de suministro', type: 'text' }
]

const camposEconomicos = [
  { key: 'importe_total_eur', label: 'Total factura' },
  { key: 'peajes_cargos_eur', label: 'Peajes y cargos' },
  { key: 'alquiler_contador_eur', label: 'Alquiler de contador' },
  { key: 'impuesto_electrico_eur', label: 'Impuesto eléctrico' },
  { key: 'iva_eur', label: 'IVA' },
  { key: 'otros_servicios_eur', label: 'Otros servicios' }
]

// Campos planos que viajan al backend
const CAMPOS_PLANOS = [
  ...camposSuministro.map(c => c.key),
  'consumo_total_kwh', 'dias_facturados', 'tipo_lectura', 'autoconsumo',
  'excedentes_kwh', 'excedentes_eur',
  ...camposEconomicos.map(c => c.key),
  'bono_social'
]

const CAMPOS_PERIODOS = [
  'potencias_contratadas', 'potencias_maximas', 'precio_potencia',
  'consumos_periodo', 'precios_periodo'
]

let sincronizando = false

function estadoDeFormulario(factura) {
  const datos = {}
  for (const campo of CAMPOS_PLANOS) {
    const valor = factura?.[campo]
    if (campo === 'bono_social') {
      datos[campo] = valor === true
      continue
    }
    datos[campo] = valor === null || valor === undefined ? '' : valor
  }
  // Los mapas se copian para no mutar el objeto del padre
  for (const campo of CAMPOS_PERIODOS) {
    datos[campo] = { ...(factura?.[campo] || {}) }
  }
  // Facturas antiguas: el consumo total no tenía desglose por periodos
  if (Object.keys(datos.consumos_periodo).length === 0 && factura?.consumo_total_kwh) {
    datos.consumos_periodo = { P1: factura.consumo_total_kwh }
  }
  return datos
}

// --- Periodos según el peaje (2.0TD: P1-P2 potencia, P1-P3 energía) ---
const peaje = computed(() => String(formData.value.peaje_acceso || '').trim().toUpperCase())
// Sin peaje identificado se asume 2.0TD (el caso más común); si la factura
// trae datos de P3..P6 se muestran igualmente (periodosVisibles los añade).
const es2punto0 = computed(() => !peaje.value || peaje.value.startsWith('2.0'))

function periodosVisibles(base) {
  const conDatos = new Set()
  for (const campo of CAMPOS_PERIODOS) {
    for (const [periodo, valor] of Object.entries(formData.value[campo] || {})) {
      if (valor !== null && valor !== undefined && valor !== '') conDatos.add(periodo)
    }
  }
  return [...new Set([...base, ...conDatos])].filter(p => /^P[1-6]$/.test(p)).sort()
}

const periodosPotencia = computed(() =>
  periodosVisibles(es2punto0.value ? ['P1', 'P2'] : ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'])
)
const periodosEnergia = computed(() =>
  periodosVisibles(es2punto0.value ? ['P1', 'P2', 'P3'] : ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'])
)

function metodoDe(campo) {
  return props.factura?.metodos_extraccion?.[campo] || (esManual.value ? 'manual' : 'regla')
}

// --- Avisos de coherencia ---
const sumaConsumos = computed(() => {
  const valores = Object.values(formData.value.consumos_periodo || {})
  return valores.reduce((total, v) => total + (Number(v) || 0), 0)
})

const diferenciaConsumo = computed(() => {
  const total = Number(formData.value.consumo_total_kwh)
  if (!total || !sumaConsumos.value) return null
  return Math.round((total - sumaConsumos.value) * 100) / 100
})

const avisoPotencia = computed(() => {
  const contratadas = formData.value.potencias_contratadas || {}
  const maximas = formData.value.potencias_maximas || {}
  const periodos = Object.keys(contratadas).filter(p =>
    maximas[p] !== undefined && maximas[p] !== null && maximas[p] !== ''
  )
  if (periodos.length === 0) return null
  const sobre = periodos.filter(p => Number(contratadas[p]) > Number(maximas[p]) * 1.35 && Number(maximas[p]) > 0)
  if (sobre.length === 0) return null
  return `Posible sobrecontratación en ${sobre.join(', ')}: la potencia máxima demandada está muy por debajo de la contratada.`
})

const textoCuadre = computed(() => {
  const total = Number(formData.value.importe_total_eur)
  const suma = ['peajes_cargos_eur', 'alquiler_contador_eur', 'impuesto_electrico_eur', 'iva_eur', 'otros_servicios_eur']
    .reduce((t, k) => t + (Number(formData.value[k]) || 0), 0)
  if (!total) return 'Sin total no se puede comprobar el desglose.'
  if (!suma) return 'Sin desglose: escribe peajes, impuestos e IVA para poder auditarla.'
  const diferencia = Math.round((total - suma) * 100) / 100
  return Math.abs(diferencia) <= 0.5
    ? 'El desglose cuadra con el total (falta aún el término de energía: es normal).'
    : `Desglose y total difieren en ${formatearNumero(Math.abs(diferencia))} €.`
})

function formatearNumero(valor) {
  return Number(valor).toLocaleString('es-ES', { maximumFractionDigits: 2 })
}

function cargarDesde(factura) {
  sincronizando = true
  formData.value = estadoDeFormulario(factura)
  originalData.value = JSON.parse(JSON.stringify(formData.value))
  lineas.value = factura?.lineas ? JSON.parse(JSON.stringify(factura.lineas)) : []
  idCliente.value = factura?.id_cliente || ''
  avisoCliente.value = null
  sinDatosUtiles.value = !!factura && factura.metodo_extraccion === 'manual'
  nextTick(() => { sincronizando = false })
}

const hayCambios = computed(() => {
  if (!props.factura) return false
  return JSON.stringify(formData.value) !== JSON.stringify(originalData.value)
    || JSON.stringify(lineas.value) !== JSON.stringify(props.factura.lineas || [])
})

const pendienteDeGuardar = computed(() => {
  if (permitirSalir.value) return false
  if (esManual.value) return true
  return !!props.factura && (faltaCliente.value || hayCambios.value)
})

const puedeGuardar = computed(() => {
  if (loading.value) return false
  if (esManual.value) return !!idCliente.value
  return !!props.factura && !faltaCliente.value && hayCambios.value
})

function mostrarGuardado() {
  guardadoOk.value = true
  setTimeout(() => { guardadoOk.value = false }, 2500)
}

/** Cuerpo que espera la API: planos + mapas por periodo (vacíos = null). */
function datosDelFormulario() {
  const datos = {}

  for (const campo of CAMPOS_PLANOS) {
    const valor = formData.value[campo]
    if (campo === 'bono_social') {
      datos[campo] = valor === true
      continue
    }
    if (valor === undefined || valor === null || valor === '') continue
    datos[campo] = valor
  }

  for (const campo of CAMPOS_PERIODOS) {
    const periodos = {}
    for (const [periodo, valor] of Object.entries(formData.value[campo] || {})) {
      if (valor === '' || valor === null || valor === undefined) continue
      const numero = Number(valor)
      if (Number.isFinite(numero)) periodos[periodo] = numero
    }
    datos[campo] = Object.keys(periodos).length > 0 ? periodos : null
  }

  return datos
}

async function guardar() {
  if (esManual.value) return guardarManual()
  if (!props.factura) return
  if (!idCliente.value) {
    error.value = 'Selecciona un cliente antes de guardar la factura.'
    return
  }
  try {
    error.value = null
    const actualizada = await store.actualizarFactura(props.factura.id_factura, {
      ...datosDelFormulario(),
      id_cliente: idCliente.value,
      lineas: lineas.value
    })
    if (actualizada) cargarDesde(actualizada)
    emit('guardada', actualizada)
    mostrarGuardado()
  } catch (e) {
    error.value = 'Error al guardar: ' + e.message
  }
}

async function guardarManual() {
  if (!idCliente.value) {
    error.value = 'Selecciona un cliente antes de guardar la factura.'
    return
  }
  try {
    error.value = null
    const { factura, aviso } = await store.crearFacturaManual(
      props.archivo, datosDelFormulario(), idCliente.value
    )
    avisoArchivo.value = aviso || null
    mostrarGuardado()
    // La factura ya existe: se permite salir para que el padre navegue a su ficha
    permitirSalir.value = true
    emit('creada', factura)
  } catch (e) {
    error.value = 'Error al guardar: ' + e.message
  }
}

async function asignarCliente(nuevoId) {
  if (!props.factura || !nuevoId) return
  if (guardandoCliente.value) return
  guardandoCliente.value = true
  error.value = null
  try {
    const { factura, aviso } = await store.asignarCliente(props.factura.id_factura, nuevoId)
    emit('guardada', factura)
    cargarDesde(factura)
    // Después de recargar, para que el aviso no lo borre el reset del formulario
    avisoCliente.value = aviso || 'Cliente asignado y archivo renombrado.'
  } catch (e) {
    error.value = 'Error al asignar el cliente: ' + e.message
    idCliente.value = props.factura?.id_cliente || ''
  } finally {
    guardandoCliente.value = false
  }
}

function abrirNuevoCliente() {
  error.value = null
  modalCliente.value = true
}

async function alCrearCliente(cliente) {
  modalCliente.value = false
  if (!cliente) return
  if (props.factura) {
    await asignarCliente(cliente.id_cliente)
  } else {
    // Alta manual: no hay factura a la que asignar, solo se selecciona
    idCliente.value = cliente.id_cliente
  }
}

// === Bloqueo de salida con trabajo pendiente ===
// El guard real vive en la vista (componente de ruta): Vue Router no ejecuta
// onBeforeRouteLeave de componentes hijos. Aquí solo se guarda el estado y el
// modal que la vista abre cuando detecta trabajo sin guardar.
const modalSalida = ref(false)
const mensajeSalida = ref('')
let rutaPendiente = null

function pedirConfirmacion(destino) {
  mensajeSalida.value = esManual.value
    ? 'Esta factura aún no se ha guardado. Rellena los datos, elige cliente y pulsa «Guardar cambios» antes de cambiar de pantalla.'
    : (faltaCliente.value
      ? 'Esta factura no tiene cliente asignado. Selecciona uno (o créalo) y guarda antes de cambiar de pantalla.'
      : 'Tienes cambios sin guardar. Pulsa «Guardar cambios» antes de cambiar de pantalla.')
  rutaPendiente = destino
  modalSalida.value = true
}

function seguirEditando() {
  modalSalida.value = false
  rutaPendiente = null
}

function descartarYSalir() {
  modalSalida.value = false
  permitirSalir.value = true
  const destino = rutaPendiente
  rutaPendiente = null
  if (destino) router.push(destino)
}

function avisarAntesDeCerrar(evento) {
  if (!pendienteDeGuardar.value) return
  evento.preventDefault()
  evento.returnValue = ''
}

watch(() => props.factura, (nueva) => {
  cargarDesde(nueva)
}, { immediate: true })

watch(() => props.manual, (manual) => {
  if (manual) cargarDesde(null)
}, { immediate: true })

watch(idCliente, (nuevo) => {
  if (sincronizando || !nuevo) return
  if (nuevo === props.factura?.id_cliente) return
  if (esManual.value) return
  asignarCliente(nuevo)
})

// La vista (componente de ruta) consulta esto en su onBeforeRouteLeave
defineExpose({
  pendiente: pendienteDeGuardar,
  pedirConfirmacion
})

onMounted(() => {
  clientesStore.cargarClientes().catch((e) => {
    console.warn('No se pudieron cargar los clientes:', e.message)
  })
  window.addEventListener('beforeunload', avisarAntesDeCerrar)
})

onUnmounted(() => {
  window.removeEventListener('beforeunload', avisarAntesDeCerrar)
})
</script>

<style scoped>
.editor {
  min-height: 320px;
}

.bloque {
  margin-bottom: 1.75rem;
  padding-bottom: 1.25rem;
  border-bottom: 1px solid var(--color-border);
}

.bloque:last-of-type {
  border-bottom: none;
  padding-bottom: 0;
}

.bloque-titulo {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--color-text-muted);
  margin-bottom: 0.75rem;
}

.bloque-nota {
  font-size: 0.78rem;
  font-weight: 500;
  text-transform: none;
  letter-spacing: 0;
  color: var(--color-text-muted);
}

.bloque-ayuda {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
  margin-bottom: 0.6rem;
}

.periodo-celda {
  font-weight: 600;
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}

.aviso-sugerencia {
  margin-top: 0.6rem;
  padding: 0.6rem 0.8rem;
  border-radius: 6px;
  border-left: 4px solid var(--color-warning);
  background: rgba(245, 158, 11, 0.12);
  font-size: 0.8125rem;
}

.descuadre {
  color: var(--color-warning);
}

.descuadre.ok {
  color: var(--color-success);
}

.aviso-guardado {
  margin-top: 1rem;
  padding: 0.7rem 0.9rem;
  border-radius: 6px;
  border-left: 4px solid var(--color-warning);
  background: rgba(245, 158, 11, 0.12);
  font-size: 0.8125rem;
}

.campo-bono {
  display: flex;
  align-items: center;
  padding-top: 1.6rem;
}
</style>
