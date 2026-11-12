<template>
  <div class="pdf-panel card">
    <div class="card-header">
      <h3>{{ esImagen ? 'Vista imagen' : 'Vista PDF' }}</h3>
      <span v-if="cargando" class="eyebrow">cargando…</span>
    </div>
    <div class="card-body pdf-viewer">
      <div v-if="cargando" class="skeleton skeleton-block"></div>
      <img
        v-else-if="url && esImagen"
        :src="url"
        class="pdf-iframe img-preview"
        alt="Factura escaneada"
        @error="$emit('error-documento')" />
      <iframe
        v-else-if="url"
        :src="url"
        class="pdf-iframe"
        title="Factura PDF"></iframe>
      <div v-else class="pdf-placeholder">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
        <p>Documento no disponible</p>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  url: { type: String, default: null },
  esImagen: { type: Boolean, default: false },
  cargando: { type: Boolean, default: false }
})
defineEmits(['error-documento'])
</script>

<style scoped>
.pdf-panel {
  height: 70vh;
  min-height: 500px;
  display: flex;
  flex-direction: column;
}

.pdf-viewer {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.pdf-iframe {
  flex: 1;
  border: none;
  border-radius: 4px;
  background: white;
}

/* Las imágenes escaneadas se ajustan al panel sin deformarse */
.img-preview {
  object-fit: contain;
  width: 100%;
  max-height: 100%;
}

.pdf-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  gap: 0.75rem;
}
</style>
