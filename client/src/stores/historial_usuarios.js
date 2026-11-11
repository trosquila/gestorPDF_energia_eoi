import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { historialApi, usuariosApi } from '../services/api'

export const useHistorialStore = defineStore('historial', () => {
  const historial = ref([])
  const loading = ref(false)
  const error = ref(null)
  const total = ref(0)

  async function cargarHistorialFactura(idFactura, params = {}) {
    loading.value = true
    error.value = null
    try {
      const response = await historialApi.getByFactura(idFactura, params)
      historial.value = response.data.data || response.data
      total.value = response.data.total || 0
      return historial.value
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function cargarHistorialGlobal(params = {}) {
    loading.value = true
    error.value = null
    try {
      const response = await historialApi.getAll(params)
      historial.value = response.data.data || response.data
      total.value = response.data.total || 0
      return historial.value
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  return {
    historial,
    loading,
    error,
    total,
    cargarHistorialFactura,
    cargarHistorialGlobal
  }
})

export const useUsuariosStore = defineStore('usuarios', () => {
  const usuarios = ref([])
  const loading = ref(false)
  const error = ref(null)

  async function cargarUsuarios(params = {}) {
    loading.value = true
    error.value = null
    try {
      const response = await usuariosApi.list(params)
      usuarios.value = response.data.data || response.data
      return usuarios.value
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function actualizarUsuario(id, data) {
    loading.value = true
    error.value = null
    try {
      const response = await usuariosApi.update(id, data)
      const updated = response.data.data || response.data
      const idx = usuarios.value.findIndex(u => u.id_usuario === id)
      if (idx !== -1) usuarios.value[idx] = updated
      return updated
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  return {
    usuarios,
    loading,
    error,
    cargarUsuarios,
    actualizarUsuario
  }
})