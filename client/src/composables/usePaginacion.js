import { ref, computed, watch } from 'vue'

/**
 * Paginación para listas en memoria.
 *
 * Uso:
 *   const lista = usePaginacion(facturasFiltradas, { porPagina: 25 })
 *   v-for="f in lista.visibles"   ·   <PaginacionBar v-bind="lista.props" />
 *
 * Al cambiar la fuente (filtros, búsqueda, recarga) vuelve a la página 1: si no,
 * el usuario filtra desde la página 4 y se queda mirando una lista vacía.
 */
export function usePaginacion(fuente, { porPagina = 25, opciones = [10, 25, 50, 100] } = {}) {
  const pagina = ref(1)
  const tamano = ref(porPagina)

  const total = computed(() => (fuente.value ? fuente.value.length : 0))
  const totalPaginas = computed(() => Math.max(1, Math.ceil(total.value / tamano.value)))

  const desde = computed(() => (total.value === 0 ? 0 : (pagina.value - 1) * tamano.value + 1))
  const hasta = computed(() => Math.min(pagina.value * tamano.value, total.value))

  const visibles = computed(() => {
    if (!fuente.value) return []
    const inicio = (pagina.value - 1) * tamano.value
    return fuente.value.slice(inicio, inicio + tamano.value)
  })

  const props = computed(() => ({
    total: total.value,
    pagina: pagina.value,
    porPagina: tamano.value,
    opciones,
    desde: desde.value,
    hasta: hasta.value
  }))

  // La fuente cambia de identidad al filtrar, buscar o recargar.
  watch(fuente, () => { pagina.value = 1 })

  // Si el total mengua (borrado, filtro) y la página actual se queda fuera.
  watch(totalPaginas, (paginas) => {
    if (pagina.value > paginas) pagina.value = paginas
  })

  function irA(n) {
    pagina.value = Math.min(Math.max(1, n), totalPaginas.value)
  }

  function definirTamano(n) {
    tamano.value = Number(n) || porPagina
    pagina.value = 1
  }

  return {
    pagina, tamano, total, totalPaginas, desde, hasta, visibles, props,
    irA, definirTamano,
    siguiente: () => irA(pagina.value + 1),
    anterior: () => irA(pagina.value - 1),
    puedeAnterior: computed(() => pagina.value > 1),
    puedeSiguiente: computed(() => pagina.value < totalPaginas.value),
    reiniciar: () => { pagina.value = 1 }
  }
}
