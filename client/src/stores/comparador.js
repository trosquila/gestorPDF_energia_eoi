import { defineStore } from 'pinia'
import { ref } from 'vue'
import { comparadorApi } from '../services/api'

export const useComparadorStore = defineStore('comparador', () => {
  const fuentes = ref([])
  const precios = ref(null)
  const ofertas = ref([])
  const catalogoDisponible = ref(true)
  const avisoCatalogo = ref(null)
  const resultado = ref(null)
  const asistente = ref(null)
  const loading = ref(false)
  const error = ref(null)

  function mensaje(e) {
    return e.response?.data?.error || e.message
  }

  async function cargarFuentes() {
    try {
      const r = await comparadorApi.fuentes()
      fuentes.value = r.data.data || r.data
    } catch (e) {
      error.value = mensaje(e)
    }
  }

  async function cargarPrecios(params = {}) {
    try {
      const r = await comparadorApi.precios(params)
      precios.value = r.data.data || r.data
      return precios.value
    } catch (e) {
      error.value = mensaje(e)
      throw e
    }
  }

  async function cargarOfertas() {
    try {
      const r = await comparadorApi.ofertas()
      ofertas.value = r.data.data || r.data
      catalogoDisponible.value = true
      avisoCatalogo.value = null
    } catch (e) {
      const detalle = mensaje(e)
      catalogoDisponible.value = false
      avisoCatalogo.value = detalle
      ofertas.value = []
    }
  }

  // Catálogo oficial de la CNMC
  const estadoCatalogo = ref(null)
  const sincronizando = ref(false)
  const resumenSync = ref(null)

  async function cargarEstadoCatalogo() {
    try {
      const r = await comparadorApi.estadoCatalogo()
      estadoCatalogo.value = r.data.data || r.data
    } catch (e) {
      estadoCatalogo.value = null
    }
  }

  async function sincronizarCatalogo(fecha) {
    sincronizando.value = true
    error.value = null
    try {
      const r = await comparadorApi.sincronizarCatalogo(fecha)
      resumenSync.value = r.data.data || r.data
      await Promise.all([cargarOfertas(), cargarEstadoCatalogo()])
      return resumenSync.value
    } catch (e) {
      error.value = mensaje(e)
      throw e
    } finally {
      sincronizando.value = false
    }
  }

  async function crearOferta(datos) {
    const r = await comparadorApi.crearOferta(datos)
    const nueva = r.data.data || r.data
    ofertas.value = [...ofertas.value, nueva]
    return nueva
  }

  async function eliminarOferta(id) {
    await comparadorApi.eliminarOferta(id)
    ofertas.value = ofertas.value.filter((o) => o.id_oferta !== id)
  }

  async function simular(perfil) {
    loading.value = true
    error.value = null
    try {
      const r = await comparadorApi.simular(perfil)
      resultado.value = r.data.data || r.data
      avisoCatalogo.value = resultado.value.aviso_catalogo || null
      return resultado.value
    } catch (e) {
      error.value = mensaje(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  async function preguntarAlAsistente(pregunta) {
    if (!resultado.value) throw new Error('Primero calcula una comparación')
    error.value = null
    asistente.value = null
    try {
      const r = await comparadorApi.asistente(resultado.value, pregunta)
      asistente.value = r.data.data || r.data
      return asistente.value
    } catch (e) {
      error.value = mensaje(e)
      throw e
    }
  }

  async function perfilDeFactura(id) {
    const r = await comparadorApi.perfilDeFactura(id)
    return r.data.data || r.data
  }

  return {
    fuentes,
    precios,
    ofertas,
    catalogoDisponible,
    avisoCatalogo,
    resultado,
    asistente,
    loading,
    estadoCatalogo,
    sincronizando,
    resumenSync,
    cargarEstadoCatalogo,
    sincronizarCatalogo,
    error,
    cargarFuentes,
    cargarPrecios,
    cargarOfertas,
    crearOferta,
    eliminarOferta,
    simular,
    preguntarAlAsistente,
    perfilDeFactura
  }
})
