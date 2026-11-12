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

      <div class="field-grid">
        <FieldInput
          v-for="campo in camposEditables"
          :key="campo.key"
          v-model="formData[campo.key]"
          :label="campo.label"
          :type="campo.type"
          :step="campo.step"
          :method="factura?.metodos_extraccion?.[campo.key] || (esManual ? 'manual' : 'regla')"
          :readonly="campo.readonly"
          :placeholder="campo.placeholder" />
      </div>

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

let sincronizando = false

function estadoDeFormulario(factura) {
  const datos = {}
  for (const campo of camposEditables) {
    const valor = factura?.[campo.key]
    datos[campo.key] = valor === null || valor === undefined ? '' : valor
  }
  return datos
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

function datosDelFormulario() {
  const datos = {}
  for (const campo of camposEditables) {
    const valor = formData.value[campo.key]
    if (valor !== undefined && valor !== null && valor !== '') datos[campo.key] = valor
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
</style>
