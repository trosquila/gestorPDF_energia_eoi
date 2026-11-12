<template>
  <div class="clientes-view">
    <div class="page-header">
      <div>
        <h1>Clientes</h1>
        <p class="subtitle">Empresas y contactos a los que se asignan las facturas</p>
      </div>
      <div class="acciones-cabecera">
        <button class="btn btn-secondary" @click="exportarCsv" :disabled="clientes.length === 0">
          Exportar CSV
        </button>
        <button class="btn btn-primary" @click="abrirAlta">+ Nuevo cliente</button>
      </div>
    </div>

    <div v-if="aviso" class="aviso-ok">
      {{ aviso }}
      <button class="cerrar-aviso" @click="aviso = null">×</button>
    </div>
    <div v-if="errorAccion" class="aviso-error">
      {{ errorAccion }}
      <button class="cerrar-aviso" @click="errorAccion = null">×</button>
    </div>

    <div class="metricas">
      <div class="metric-card">
        <div class="metric-value">{{ clientes.length }}</div>
        <div class="metric-label">Clientes {{ filtroActivo === 'true' ? 'activos' : 'listados' }}</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">{{ totalFacturas }}</div>
        <div class="metric-label">Facturas asignadas</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">{{ sinFacturas }}</div>
        <div class="metric-label">Clientes sin facturas</div>
      </div>
    </div>

    <div class="card">
      <div class="card-body filtros">
        <input
          v-model="busqueda"
          class="form-input"
          type="search"
          placeholder="Buscar por empresa, contacto o correo…"
          @input="programarBusqueda" />
        <select v-model="filtroActivo" class="form-input select-estado" @change="cargar">
          <option value="true">Solo activos</option>
          <option value="false">Solo inactivos</option>
          <option value="">Todos</option>
        </select>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>Listado ({{ clientes.length }})</h3>
        <span v-if="cargando" class="eyebrow">cargando…</span>
      </div>
      <div class="card-body">
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Contacto</th>
                <th>Correo</th>
                <th>Teléfono</th>
                <th>Facturas</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="cliente in clientes" :key="cliente.id_cliente" :class="{ inactivo: cliente.activo === false }">
                <td class="empresa">{{ cliente.empresa }}</td>
                <td>{{ cliente.nombre || '—' }}</td>
                <td>{{ cliente.email || '—' }}</td>
                <td>{{ cliente.telefono || '—' }}</td>
                <td>
                  <span v-if="cliente.total_facturas > 0" class="badge badge-info">{{ cliente.total_facturas }}</span>
                  <span v-else class="sin-facturas">0</span>
                </td>
                <td>
                  <span class="badge" :class="cliente.activo === false ? 'badge-error' : 'badge-success'">
                    {{ cliente.activo === false ? 'Inactivo' : 'Activo' }}
                  </span>
                </td>
                <td>
                  <div class="acciones-fila">
                    <button class="btn btn-secondary btn-sm" @click="abrirEdicion(cliente)">Editar</button>
                    <button
                      v-if="cliente.activo !== false"
                      class="btn btn-danger btn-sm"
                      @click="pedirBaja(cliente)">Baja</button>
                    <button
                      v-else
                      class="btn btn-secondary btn-sm"
                      :disabled="reactivando === cliente.id_cliente"
                      @click="reactivar(cliente)">
                      {{ reactivando === cliente.id_cliente ? 'Reactivando…' : 'Reactivar' }}
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="clientes.length === 0 && !cargando">
                <td colspan="7" class="vacio">
                  {{ busqueda ? 'Ningún cliente coincide con la búsqueda' : 'Todavía no hay clientes' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Alta / edición -->
    <ModalCliente
      v-if="modalAbierto"
      :cliente="clienteEnEdicion"
      @cerrada="cerrarModal"
      @guardado="alGuardar" />

    <!-- Confirmación de baja -->
    <div v-if="clienteABajar" class="modal-fondo" @click.self="clienteABajar = null">
      <div class="modal-card">
        <h3>¿Dar de baja el cliente?</h3>
        <p class="modal-texto">
          <strong>{{ clienteABajar.empresa }}</strong>
          será <strong>desactivado</strong>: dejará de aparecer en el selector de facturas,
          pero sus datos y sus facturas se conservan.
        </p>
        <p v-if="clienteABajar.total_facturas > 0" class="modal-texto aviso-bloqueo">
          Tiene {{ clienteABajar.total_facturas }} factura(s) activa(s). El sistema lo rechazará:
          reasígnalas a otro cliente antes de la baja.
        </p>
        <p v-if="errorBaja" class="modal-error">{{ errorBaja }}</p>
        <div class="modal-acciones">
          <button class="btn btn-secondary" @click="clienteABajar = null" :disabled="dandoBaja">
            Cancelar
          </button>
          <button class="btn btn-danger" @click="confirmarBaja" :disabled="dandoBaja">
            {{ dandoBaja ? 'Dando de baja…' : 'Sí, dar de baja' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useClientesStore } from '../stores/clientes'
import ModalCliente from '../components/factura/ModalCliente.vue'

const store = useClientesStore()

const busqueda = ref('')
const filtrosAplicados = ref('')
const filtroActivo = ref('true')
const cargando = ref(false)
const aviso = ref(null)
const errorAccion = ref(null)
const modalAbierto = ref(false)
const clienteEnEdicion = ref(null)
const clienteABajar = ref(null)
const dandoBaja = ref(false)
const errorBaja = ref(null)
const reactivando = ref(null)

const clientes = computed(() => store.clientes)
const totalFacturas = computed(() => clientes.value.reduce((t, c) => t + (c.total_facturas || 0), 0))
const sinFacturas = computed(() => clientes.value.filter(c => !c.total_facturas).length)

let temporizador = null

async function cargar() {
  cargando.value = true
  errorAccion.value = null
  try {
    const params = {}
    if (filtroActivo.value !== '') params.activo = filtroActivo.value
    if (filtrosAplicados.value) params.busqueda = filtrosAplicados.value
    await store.cargarClientes(params)
  } catch (e) {
    errorAccion.value = 'No se pudieron cargar los clientes: ' + e.message
  } finally {
    cargando.value = false
  }
}

function programarBusqueda() {
  clearTimeout(temporizador)
  temporizador = setTimeout(() => {
    filtrosAplicados.value = busqueda.value.trim()
    cargar()
  }, 300)
}

function abrirAlta() {
  clienteEnEdicion.value = null
  modalAbierto.value = true
}

function abrirEdicion(cliente) {
  clienteEnEdicion.value = cliente
  modalAbierto.value = true
}

function cerrarModal() {
  modalAbierto.value = false
  clienteEnEdicion.value = null
}

async function alGuardar(cliente) {
  cerrarModal()
  aviso.value = cliente
    ? `Cliente guardado: ${cliente.empresa}`
    : 'Cliente guardado'
  await cargar()
}

function pedirBaja(cliente) {
  clienteABajar.value = cliente
  errorBaja.value = null
}

async function confirmarBaja() {
  dandoBaja.value = true
  errorBaja.value = null
  try {
    const { aviso: mensaje } = await store.eliminarCliente(clienteABajar.value.id_cliente)
    clienteABajar.value = null
    aviso.value = mensaje || 'Cliente dado de baja'
    await cargar()
  } catch (e) {
    errorBaja.value = e.message
  } finally {
    dandoBaja.value = false
  }
}

async function reactivar(cliente) {
  reactivando.value = cliente.id_cliente
  try {
    await store.actualizarCliente(cliente.id_cliente, { activo: true })
    aviso.value = `${cliente.empresa} reactivado`
    await cargar()
  } catch (e) {
    errorAccion.value = 'No se pudo reactivar: ' + e.message
  } finally {
    reactivando.value = null
  }
}

function exportarCsv() {
  const cabecera = ['Empresa', 'Contacto', 'Correo', 'Teléfono', 'Dirección', 'Facturas', 'Activo']
  const filas = clientes.value.map(c => [
    c.empresa, c.nombre, c.email, c.telefono, c.direccion_empresa,
    c.total_facturas || 0, c.activo === false ? 'No' : 'Sí'
  ])
  const csv = [cabecera, ...filas]
    .map(fila => fila.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';'))
    .join('\r\n')

  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = `clientes-${new Date().toISOString().slice(0, 10)}.csv`
  enlace.click()
  URL.revokeObjectURL(url)
}

onMounted(cargar)
onUnmounted(() => clearTimeout(temporizador))
</script>

<style scoped>
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.acciones-cabecera {
  display: flex;
  gap: 0.75rem;
}

.metricas {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  margin-bottom: 1.5rem;
}

@media (max-width: 720px) {
  .metricas {
    grid-template-columns: 1fr;
  }
}

.filtros {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-bottom: 1.5rem;
}

.filtros .form-input {
  flex: 1;
  min-width: 220px;
}

.select-estado {
  max-width: 200px;
}

.empresa {
  font-weight: 600;
}

.sin-facturas {
  color: var(--color-text-muted);
}

.acciones-fila {
  display: flex;
  gap: 0.5rem;
}

.btn-sm {
  padding: 0.3rem 0.65rem;
  font-size: 0.8125rem;
}

tr.inactivo td {
  color: var(--color-text-muted);
}

.vacio {
  text-align: center;
  padding: 3rem 1rem;
  color: var(--color-text-muted);
}

.aviso-ok,
.aviso-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  font-size: 0.875rem;
}

.aviso-ok {
  background: #f0fdf4;
  border-left: 4px solid var(--color-success);
  color: #15803d;
}

.aviso-error {
  background: #fef2f2;
  border-left: 4px solid var(--color-error);
  color: #b91c1c;
}

.cerrar-aviso {
  background: none;
  border: none;
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
  color: inherit;
  opacity: 0.7;
}

.aviso-bloqueo {
  color: #b45309;
  font-weight: 500;
}
</style>
