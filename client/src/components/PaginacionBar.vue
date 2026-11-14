<template>
  <div v-if="total > Math.min(...opciones)" class="paginacion">
    <span class="paginacion-resumen">
      <strong>{{ desde }}–{{ hasta }}</strong> de {{ total }}
    </span>

    <div class="paginacion-controles">
      <label class="paginacion-tamano">
        <span>por página</span>
        <select
          class="paginacion-select"
          :value="porPagina"
          @change="cambiarTamano">
          <option v-for="n in opciones" :key="n" :value="n">{{ n }}</option>
        </select>
      </label>

      <nav v-if="paginas.length > 1" class="paginacion-botones" aria-label="Paginación">
        <button
          class="paginacion-btn"
          :disabled="pagina === 1"
          aria-label="Página anterior"
          @click="ir(pagina - 1)">‹</button>

        <template v-for="(n, i) in paginas" :key="`${n}-${i}`">
          <span v-if="n === '…'" class="paginacion-puntos">…</span>
          <button
            v-else
            class="paginacion-btn"
            :class="{ activa: n === pagina }"
            :aria-current="n === pagina ? 'page' : undefined"
            @click="ir(n)">{{ n }}</button>
        </template>

        <button
          class="paginacion-btn"
          :disabled="pagina === totalPaginas"
          aria-label="Página siguiente"
          @click="ir(pagina + 1)">›</button>
      </nav>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  total: { type: Number, default: 0 },
  pagina: { type: Number, default: 1 },
  porPagina: { type: Number, default: 25 },
  desde: { type: Number, default: 0 },
  hasta: { type: Number, default: 0 },
  opciones: { type: Array, default: () => [10, 25, 50, 100] }
})

const emit = defineEmits(['update:pagina', 'update:porPagina'])

const totalPaginas = computed(() => Math.max(1, Math.ceil(props.total / props.porPagina)))

/** Ventana de páginas: primera, última y dos alrededor de la actual. */
const paginas = computed(() => {
  const total = totalPaginas.value
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  const actual = props.pagina
  const lista = new Set([1, total, actual, actual - 1, actual + 1])
  if (actual <= 3) [2, 3, 4].forEach((n) => lista.add(n))
  if (actual >= total - 2) [total - 1, total - 2, total - 3].forEach((n) => lista.add(n))

  const ordenadas = [...lista].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b)
  const salida = []
  ordenadas.forEach((n, i) => {
    if (i > 0 && n - ordenadas[i - 1] > 1) salida.push('…')
    salida.push(n)
  })
  return salida
})

function ir(n) {
  const destino = Math.min(Math.max(1, n), totalPaginas.value)
  if (destino !== props.pagina) emit('update:pagina', destino)
}

function cambiarTamano(evento) {
  emit('update:porPagina', Number(evento.target.value))
  emit('update:pagina', 1)
}
</script>

<style scoped>
.paginacion {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1rem;
  padding: 0.75rem 1.25rem;
  border-top: 1px solid var(--color-border);
}

.paginacion-resumen {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}

.paginacion-resumen strong {
  color: var(--color-text);
  font-weight: 600;
}

.paginacion-controles {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.paginacion-tamano {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8125rem;
  color: var(--color-text-muted);
}

.paginacion-select {
  padding: 0.25rem 0.4rem;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 0.8125rem;
}

.paginacion-botones {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.paginacion-btn {
  min-width: 2rem;
  height: 2rem;
  padding: 0 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 0.8125rem;
  font-weight: 500;
  line-height: 1;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.paginacion-btn:hover:not(:disabled):not(.activa) {
  background: var(--color-bg);
  border-color: var(--color-primary-light);
}

.paginacion-btn.activa {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
}

.paginacion-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.paginacion-puntos {
  padding: 0 0.25rem;
  color: var(--color-text-muted);
  user-select: none;
}

@media (max-width: 600px) {
  .paginacion {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
