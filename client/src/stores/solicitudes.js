import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { solicitudesApi } from '../services/api'

export const useSolicitudesStore = defineStore('solicitudes', () => {
  const solicitudes = ref([])
  const loading = ref(false)
  const error = ref(null)

  const pendientes = computed(() => solicitudes.value.filter((s) => s.estado === 'pendiente'))

  async function cargarSolicitudes(params = {}) {
    loading.value = true
    error.value = null
    try {
      const response = await solicitudesApi.list(params)
      solicitudes.value = response.data.data || response.data
      return solicitudes.value
    } catch (e) {
      error.value = mensajeDe(e)
      throw new Error(error.value)
    } finally {
      loading.value = false
    }
  }

  async function aprobar(id) {
    try {
      const response = await solicitudesApi.aprobar(id)
      marcarEstado(id, 'aprobada')
      return response.data.data
    } catch (e) {
      error.value = mensajeDe(e)
      throw new Error(error.value)
    }
  }

  async function rechazar(id, motivo = '') {
    try {
      const response = await solicitudesApi.rechazar(id, motivo)
      marcarEstado(id, 'rechazada', motivo)
      return response.data.data
    } catch (e) {
      error.value = mensajeDe(e)
      throw new Error(error.value)
    }
  }

  function marcarEstado(id, estado, motivo = null) {
    const idx = solicitudes.value.findIndex((s) => s.id_solicitud === id)
    if (idx !== -1) {
      solicitudes.value[idx] = {
        ...solicitudes.value[idx],
        estado,
        motivo_rechazo: motivo,
        revisado_at: new Date().toISOString()
      }
    }
  }

  function mensajeDe(e) {
    return e.response?.data?.error || e.message
  }

  return {
    solicitudes,
    pendientes,
    loading,
    error,
    cargarSolicitudes,
    aprobar,
    rechazar
  }
})
