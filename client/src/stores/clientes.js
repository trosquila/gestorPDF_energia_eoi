import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { clientesApi } from '../services/api'

export const useClientesStore = defineStore('clientes', () => {
  const clientes = ref([])
  const loading = ref(false)
  const error = ref(null)

  const clientesActivos = computed(() => clientes.value.filter((c) => c.activo))

  async function cargarClientes(params = {}) {
    loading.value = true
    error.value = null
    try {
      const response = await clientesApi.list(params)
      clientes.value = response.data.data || response.data
      return clientes.value
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function crearCliente(datos) {
    error.value = null
    try {
      const response = await clientesApi.create(datos)
      const cliente = response.data.data || response.data
      // Se añade a la lista ordenada por empresa para que aparezca ya en el select
      clientes.value = [...clientes.value, cliente].sort((a, b) =>
        String(a.empresa).localeCompare(String(b.empresa), 'es')
      )
      return cliente
    } catch (e) {
      // El backend devuelve el motivo en error.response.data.error
      const detalle = e.response?.data?.error || e.message
      error.value = detalle
      throw new Error(detalle)
    }
  }

  async function actualizarCliente(id, datos) {
    error.value = null
    try {
      const response = await clientesApi.update(id, datos)
      const actualizado = response.data.data || response.data
      const idx = clientes.value.findIndex((c) => c.id_cliente === id)
      if (idx !== -1) clientes.value[idx] = actualizado
      return actualizado
    } catch (e) {
      const detalle = e.response?.data?.error || e.message
      error.value = detalle
      throw new Error(detalle)
    }
  }

  async function eliminarCliente(id) {
    error.value = null
    try {
      const response = await clientesApi.remove(id)
      const cliente = response.data.data || response.data
      const idx = clientes.value.findIndex((c) => c.id_cliente === id)
      if (idx !== -1) clientes.value[idx] = cliente
      return { cliente, aviso: response.data.aviso || null }
    } catch (e) {
      const detalle = e.response?.data?.error || e.message
      error.value = detalle
      throw new Error(detalle)
    }
  }

  return {
    clientes,
    clientesActivos,
    loading,
    error,
    cargarClientes,
    crearCliente,
    actualizarCliente,
    eliminarCliente
  }
})
