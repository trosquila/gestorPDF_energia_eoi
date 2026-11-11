<template>
  <div class="solicitudes-view">
    <div class="page-header">
      <h1>Solicitudes de registro</h1>
      <p class="subtitle">Aprueba o rechaza las altas. Solo los aprobados pueden entrar en la aplicación.</p>
    </div>

    <div v-if="error" class="error-banner">{{ error }}</div>

    <div class="filtros-card">
      <div class="filtros-row">
        <div class="filtro">
          <label class="filtro-label">Mostrar</label>
          <select v-model="filtro" class="form-input" @change="cargar">
            <option value="pendiente">Pendientes</option>
            <option value="aprobada">Aprobadas</option>
            <option value="rechazada">Rechazadas</option>
            <option value="">Todas</option>
          </select>
        </div>
        <div class="contador">
          <span class="contador-num">{{ solicitudes.length }}</span>
          <span class="contador-texto">{{ solicitudes.length === 1 ? 'solicitud' : 'solicitudes' }}</span>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Correo</th>
              <th>Rol solicitado</th>
              <th>Fecha</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="solicitud in solicitudes" :key="solicitud.id_solicitud">
              <td>{{ solicitud.nombre }}</td>
              <td>{{ solicitud.email }}</td>
              <td><span class="badge badge-info">{{ solicitud.rol }}</span></td>
              <td>{{ formatearFecha(solicitud.created_at) }}</td>
              <td>
                <span class="badge" :class="badgeClass(solicitud.estado)">{{ solicitud.estado }}</span>
                <div v-if="solicitud.motivo_rechazo" class="motivo">{{ solicitud.motivo_rechazo }}</div>
              </td>
              <td>
                <div v-if="solicitud.estado === 'pendiente'" class="acciones-fila">
                  <button class="btn btn-primary btn-sm" :disabled="procesando === solicitud.id_solicitud" @click="aprobar(solicitud)">
                    Aprobar
                  </button>
                  <button class="btn btn-danger btn-sm" :disabled="procesando === solicitud.id_solicitud" @click="abrirRechazo(solicitud)">
                    Rechazar
                  </button>
                </div>
                <span v-else class="sin-acciones">—</span>
              </td>
            </tr>
            <tr v-if="solicitudes.length === 0 && !loading">
              <td colspan="6" class="vacio">
                {{ filtro === 'pendiente' ? 'No hay solicitudes pendientes' : 'No hay solicitudes con ese filtro' }}
              </td>
            </tr>
            <tr v-if="loading">
              <td colspan="6" class="vacio">Cargando…</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Rechazo con motivo -->
    <div v-if="solicitudARechazar" class="modal-fondo" @click.self="cerrarRechazo">
      <div class="modal-card">
        <h3>Rechazar solicitud</h3>
        <p class="modal-texto">
          <strong>{{ solicitudARechazar.nombre }}</strong> ({{ solicitudARechazar.email }}) no podrá entrar en la aplicación.
        </p>
        <label class="filtro-label">Motivo (opcional)</label>
        <input v-model="motivo" class="form-input" placeholder="Ej.: no es un cliente de la empresa" />
        <p v-if="errorRechazo" class="modal-error">{{ errorRechazo }}</p>
        <div class="modal-acciones">
          <button class="btn btn-secondary" @click="cerrarRechazo" :disabled="procesando === solicitudARechazar.id_solicitud">
            Cancelar
          </button>
          <button class="btn btn-danger" @click="confirmarRechazo" :disabled="procesando === solicitudARechazar.id_solicitud">
            {{ procesando === solicitudARechazar.id_solicitud ? 'Rechazando…' : 'Rechazar' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useSolicitudesStore } from '../stores/solicitudes'

const store = useSolicitudesStore()

const solicitudes = computed(() => store.solicitudes)
const loading = computed(() => store.loading)
const error = computed(() => store.error)

const filtro = ref('pendiente')
const procesando = ref(null)
const solicitudARechazar = ref(null)
const motivo = ref('')
const errorRechazo = ref(null)

async function cargar() {
  try {
    await store.cargarSolicitudes(filtro.value ? { estado: filtro.value } : {})
  } catch {
    // el mensaje ya queda en store.error
  }
}

async function aprobar(solicitud) {
  procesando.value = solicitud.id_solicitud
  try {
    await store.aprobar(solicitud.id_solicitud)
  } catch {
    // el mensaje ya queda en store.error
  } finally {
    procesando.value = null
  }
}

function abrirRechazo(solicitud) {
  solicitudARechazar.value = solicitud
  motivo.value = ''
  errorRechazo.value = null
}

function cerrarRechazo() {
  if (procesando.value) return
  solicitudARechazar.value = null
}

async function confirmarRechazo() {
  const solicitud = solicitudARechazar.value
  if (!solicitud) return
  procesando.value = solicitud.id_solicitud
  errorRechazo.value = null
  try {
    await store.rechazar(solicitud.id_solicitud, motivo.value.trim())
    solicitudARechazar.value = null
  } catch (e) {
    errorRechazo.value = e.message
  } finally {
    procesando.value = null
  }
}

function badgeClass(estado) {
  return { pendiente: 'badge-warning', aprobada: 'badge-success', rechazada: 'badge-error' }[estado] || 'badge-info'
}

function formatearFecha(fecha) {
  if (!fecha) return '-'
  return new Date(fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

onMounted(cargar)
</script>

<style scoped>
.page-header {
  margin-bottom: 1.5rem;
}

.page-header h1 {
  font-size: 1.75rem;
  font-weight: 700;
}

.subtitle {
  color: var(--color-text-muted);
  margin-top: 0.375rem;
}

.filtros-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1rem;
}

.filtros-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.filtro {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 200px;
}

.filtro-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-text-muted);
}

.contador {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
}

.contador-num {
  font-size: 1.5rem;
  font-weight: 700;
}

.contador-texto {
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

.table-container {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  padding: 0.75rem 1rem;
  text-align: left;
  font-size: 0.875rem;
  border-bottom: 1px solid var(--color-border);
}

th {
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  font-size: 0.72rem;
  letter-spacing: 0.04em;
}

.acciones-fila {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.motivo {
  margin-top: 0.25rem;
  font-size: 0.78rem;
  color: #b91c1c;
}

.sin-acciones,
.vacio {
  color: var(--color-text-muted);
}

.vacio {
  text-align: center;
  padding: 3rem !important;
}

.error-banner {
  margin-bottom: 1rem;
  padding: 0.7rem 1rem;
  border-radius: 8px;
  background: rgba(220, 38, 38, 0.12);
  color: #b91c1c;
  font-size: 0.875rem;
}

.modal-fondo {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(2px);
}

.modal-card {
  background: var(--color-bg);
  color: var(--color-text);
  border-radius: 12px;
  padding: 1.75rem;
  width: min(480px, 100%);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.modal-card h3 {
  margin: 0 0 0.5rem;
  font-size: 1.15rem;
}

.modal-texto {
  margin: 0 0 0.5rem;
  font-size: 0.9rem;
  color: var(--color-text-muted);
}

.modal-error {
  margin: 0.5rem 0 0;
  padding: 0.6rem 0.8rem;
  border-radius: 6px;
  background: rgba(220, 38, 38, 0.1);
  color: #b91c1c;
  font-size: 0.85rem;
}

.modal-acciones {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1rem;
}
</style>
