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
  const aviso = ref(null)

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
      // Sin esto la vista se quedaba en la zona de subida y no mostraba
      // el resultado de la extracción.
      facturaActual.value = nuevaFactura
      return nuevaFactura
    } catch (e) {
      // Mensaje real del backend (formato inválido, sin texto, etc.)
      const detalle = e.response?.data?.error || e.message
      error.value = detalle
      throw new Error(detalle)
    } finally {
      loading.value = false
    }
  }

  async function actualizarFactura(id, data) {
    loading.value = true
    error.value = null
    try {
      const response = await facturasApi.updateFactura(id, data)
      // Aviso del backend (p. ej. columnas que aún no existen en la base)
      aviso.value = response.data.aviso || null
      const actualizada = response.data.data || response.data
      if (facturaActual.value?.id_factura === id) facturaActual.value = actualizada
      const idx = facturas.value.findIndex((f) => f.id_factura === id)
      if (idx !== -1) facturas.value[idx] = actualizada
      return actualizada
    } catch (e) {
      // Mensaje real del backend en vez de "Request failed with status code 500"
      const detalle = e.response?.data?.error || e.message
      error.value = detalle
      throw new Error(detalle)
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

  function limpiarFacturaActual() {
    facturaActual.value = null
  }

  // Alta manual de rescate: se envía el archivo original + los datos a mano
  async function crearFacturaManual(archivo, datos = {}, idCliente, onProgress) {
    loading.value = true
    error.value = null
    try {
      const formData = new FormData()
      if (archivo) formData.append('pdf', archivo)
      formData.append('id_cliente', idCliente)
      for (const [clave, valor] of Object.entries(datos)) {
        if (valor !== undefined && valor !== null && valor !== '') {
          formData.append(clave, valor)
        }
      }

      const response = await facturasApi.crearFacturaManual(formData, onProgress)
      const factura = response.data.data || response.data
      facturas.value.unshift(factura)
      facturaActual.value = factura
      return { factura, aviso: response.data.aviso || null }
    } catch (e) {
      const detalle = e.response?.data?.error || e.message
      error.value = detalle
      throw new Error(detalle)
    } finally {
      loading.value = false
    }
  }

  // Asigna cliente a la factura; el backend renombra el archivo en Storage
  async function asignarCliente(id, idCliente) {
    loading.value = true
    error.value = null
    try {
      const response = await facturasApi.asignarCliente(id, idCliente)
      const factura = response.data.data || response.data
      facturaActual.value = factura
      const idx = facturas.value.findIndex((f) => f.id_factura === id)
      if (idx !== -1) facturas.value[idx] = factura
      return { factura, aviso: response.data.aviso || null }
    } catch (e) {
      const detalle = e.response?.data?.error || e.message
      error.value = detalle
      throw new Error(detalle)
    } finally {
      loading.value = false
    }
  }

  return {
    facturas,
    facturaActual,
    loading,
    error,
    metricas,
    analiticaData,
    aviso,
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
    asignarCliente,
    crearFacturaManual,
    limpiarFacturaActual
  }
})