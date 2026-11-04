import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { facturasApi } from '../services/api'

export const useFacturasStore = defineStore('facturas', () => {
  const facturas = ref([])
  const facturaActual = ref(null)
  const loading = ref(false)
  const error = ref(null)
  const metricas = ref(null)
  const analiticaData = ref(null)
  const ejemplos = ref([])

  const totalFacturas = computed(() => facturas.value.length)
  const facturasOk = computed(() => facturas.value.filter(f => f.estado_extraccion === 'ok').length)
  const facturasRegla = computed(() => facturas.value.filter(f => f.metodo_extraccion === 'regla').length)
  const porcentajeRegla = computed(() => totalFacturas.value > 0
    ? Math.round((facturasRegla.value / totalFacturas.value) * 100)
    : 0)

  async function cargarFacturas(params = {}) {
    loading.value = true
    error.value = null
    try {
      const response = await facturasApi.listFacturas(params)
      facturas.value = response.data.data || response.data
      return facturas.value
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function cargarFactura(id) {
    loading.value = true
    error.value = null
    try {
      const response = await facturasApi.getFactura(id)
      facturaActual.value = response.data.data || response.data
      return facturaActual.value
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function subirPdf(file, onProgress) {
    loading.value = true
    error.value = null
    try {
      const response = await facturasApi.uploadPdf(file, onProgress)
      const nuevaFactura = response.data.data || response.data
      facturas.value.unshift(nuevaFactura)
      return nuevaFactura
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function actualizarFactura(id, data) {
    loading.value = true
    error.value = null
    try {
      const response = await facturasApi.updateFactura(id, data)
      const updated = response.data.data || response.data
      const idx = facturas.value.findIndex(f => f.id_factura === id)
      if (idx !== -1) facturas.value[idx] = updated
      if (facturaActual.value?.id_factura === id) facturaActual.value = updated
      return updated
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function eliminarFactura(id) {
    loading.value = true
    error.value = null
    try {
      await facturasApi.deleteFactura(id)
      facturas.value = facturas.value.filter(f => f.id_factura !== id)
      if (facturaActual.value?.id_factura === id) facturaActual.value = null
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function cargarMetricas() {
    try {
      const response = await facturasApi.getMetricas()
      metricas.value = response.data.data || response.data
      return metricas.value
    } catch (e) {
      error.value = e.message
      throw e
    }
  }

  async function cargarAnalitica(params = {}) {
    try {
      const response = await facturasApi.getAnalitica(params)
      analiticaData.value = response.data.data || response.data
      return analiticaData.value
    } catch (e) {
      error.value = e.message
      throw e
    }
  }

  async function cargarEjemplos() {
    try {
      const response = await facturasApi.getEjemplos()
      ejemplos.value = response.data.data || response.data
      return ejemplos.value
    } catch (e) {
      error.value = e.message
      throw e
    }
  }

  function limpiarFacturaActual() {
    facturaActual.value = null
  }

  return {
    facturas,
    facturaActual,
    loading,
    error,
    metricas,
    analiticaData,
    ejemplos,
    totalFacturas,
    facturasOk,
    facturasRegla,
    porcentajeRegla,
    cargarFacturas,
    cargarFactura,
    subirPdf,
    actualizarFactura,
    eliminarFactura,
    cargarMetricas,
    cargarAnalitica,
    cargarEjemplos,
    limpiarFacturaActual
  }
})