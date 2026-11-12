<template>
  <div class="meta-tags">
    <template v-if="factura">
      <span class="badge" :class="badgeClass(factura.estado_extraccion)">
        {{ estadoLabel(factura.estado_extraccion) }}
      </span>
      <span class="badge badge-info">{{ metodoLabel(factura.metodo_extraccion) }}</span>
      <div
        v-if="factura.confianza !== null && factura.confianza !== undefined"
        class="confidence-indicator">
        <div class="confidence-circle" :class="confidenceClass(factura.confianza)">
          {{ Math.round(factura.confianza * 100) }}%
        </div>
        <span class="confidence-text">Confianza</span>
      </div>
    </template>
    <span v-else class="badge badge-warning">Entrada manual</span>
  </div>
</template>

<script setup>
defineProps({
  factura: { type: Object, default: null }
})

function badgeClass(estado) {
  const map = { ok: 'badge-success', revisión: 'badge-warning', error: 'badge-error' }
  return map[estado] || 'badge-info'
}

function estadoLabel(estado) {
  const map = { ok: 'Completo', revisión: 'Revisión', error: 'Error' }
  return map[estado] || estado
}

function metodoLabel(metodo) {
  const map = { regla: 'Solo reglas', llm: 'Con LLM', mixto: 'Mixto', manual: 'Manual' }
  return map[metodo] || metodo
}

function confidenceClass(conf) {
  if (conf >= 0.8) return 'high'
  if (conf >= 0.5) return 'medium'
  return 'low'
}
</script>

<style scoped>
.meta-tags {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.confidence-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: var(--color-text-muted);
}

.confidence-text {
  font-weight: 500;
}
</style>
