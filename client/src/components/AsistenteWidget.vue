<template>
  <div v-if="visible" class="asistente-widget">
    <div v-if="abierto" class="asistente-panel" role="dialog" aria-label="Asistente de Control Energía">
      <div class="asistente-header">
        <div>
          <strong>Asistente</strong>
          <span class="asistente-sub">Navegación y explicaciones</span>
        </div>
        <button type="button" class="asistente-cerrar" aria-label="Cerrar asistente" @click="cerrar">×</button>
      </div>

      <div class="asistente-mensajes" ref="cajaMensajes">
        <div v-for="m in mensajes" :key="m.id" class="msg" :class="m.rol">
          {{ m.texto }}
          <span v-if="m.meta" class="msg-meta">Modelo: {{ m.meta.modelo }}</span>
        </div>
      </div>

      <form class="asistente-form" @submit.prevent="enviar">
        <input
          v-model="nueva"
          class="asistente-input"
          type="text"
          placeholder="Pregunta sobre la app o tu factura…"
          :disabled="enviando"
        />
        <button type="submit" class="asistente-enviar" :disabled="enviando || !nueva.trim()" aria-label="Enviar">
          {{ enviando ? '…' : '➤' }}
        </button>
      </form>
    </div>

    <button
      type="button"
      class="asistente-fab"
      :aria-expanded="abierto"
      aria-label="Abrir asistente"
      @click="alternar">
      <svg v-if="!abierto" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <span v-else class="asistente-fab-cerrar">×</span>
    </button>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useComparadorStore } from '../stores/comparador'

const router = useRouter()
const authStore = useAuthStore()
const comparador = useComparadorStore()

const abierto = ref(false)
const enviando = ref(false)
const nueva = ref('')
const cajaMensajes = ref(null)

const NOMBRES_PAGINA = {
  Subida: 'Subida de facturas',
  Factura: 'Detalle de factura',
  FacturaLote: 'Lote de facturas',
  Lote: 'Lote',
  Analitica: 'Analítica',
  Comparador: 'Comparador de precios',
  Clientes: 'Clientes',
  Solicitudes: 'Solicitudes'
}

const contexto = computed(() => {
  const ruta = router.currentRoute.value
  const nombre = NOMBRES_PAGINA[ruta.name] || ruta.name || ruta.path
  const ctx = { pagina: String(nombre), ruta: String(ruta.path) }
  if (comparador.resultado) ctx.resultado = comparador.resultado
  if (ruta.name === 'Factura') ctx.factura_id = ruta.params?.id
  return ctx
})

const visible = computed(() => authStore.isAuthenticated && router.currentRoute.value.meta?.guestOnly !== true)

const mensajes = ref([
  {
    id: 1,
    rol: 'asistente',
    texto: 'Hola, soy el asistente de Control Energía. Puedo ayudarte a navegar por la aplicación, explicar cómo funciona cada sección y resolver tus dudas. ¿En qué te ayudo?'
  }
])

watch(
  () => mensajes.value,
  async () => {
    await nextTick()
    const caja = cajaMensajes.value
    if (caja) caja.scrollTop = caja.scrollHeight
  },
  { deep: true }
)

function alternar() { abierto.value = !abierto.value }
function cerrar() { abierto.value = false }

async function enviar() {
  const texto = nueva.value.trim()
  if (!texto || enviando.value) return
  mensajes.value.push({ id: Date.now(), rol: 'usuario', texto })
  nueva.value = ''
  enviando.value = true
  try {
    const respuesta = await comparador.preguntarAsistente(contexto.value, texto)
    if (respuesta?.accion?.tipo === 'navegar' && respuesta.accion.ruta) {
      router.push(respuesta.accion.ruta)
    }
    mensajes.value.push({
      id: Date.now() + 1,
      rol: 'asistente',
      texto: respuesta?.respuesta || 'No pude responder ahora mismo. Inténtalo de nuevo en unos momentos.',
      meta: respuesta
    })
  } catch (e) {
    mensajes.value.push({
      id: Date.now() + 1,
      rol: 'asistente',
      texto: e?.response?.data?.error || e?.message || 'No he podido consultar el asistente. Inténtalo de nuevo.'
    })
  } finally {
    enviando.value = false
  }
}
</script>

<style scoped>
.asistente-widget {
  position: fixed;
  right: 1.25rem;
  bottom: calc(1.5rem + 72px);
  z-index: 450;
}

.asistente-fab {
  position: fixed;
  right: 1.25rem;
  bottom: calc(1.5rem + 72px);
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--color-primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 10px 24px rgba(30, 64, 175, 0.4);
  transition: transform 0.15s ease, background 0.15s ease;
  z-index: 450;
}

.asistente-fab:hover { transform: scale(1.07); background: var(--color-primary-light); }

.asistente-fab-cerrar { font-size: 1.6rem; line-height: 1; }

.asistente-panel {
  position: fixed;
  right: 1.25rem;
  bottom: calc(1.5rem + 72px + 56px + 8px);
  width: min(92vw, 380px);
  height: min(65vh, 520px);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 14px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.28);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 450;
}

.asistente-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.8rem 1rem;
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-border);
}

.asistente-header strong { font-size: 0.9rem; }
.asistente-sub { display: block; font-size: 0.68rem; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.03em; }
.asistente-cerrar { font-size: 1.3rem; line-height: 1; color: var(--color-text-muted); padding: 0.15rem 0.5rem; border-radius: 6px; }
.asistente-cerrar:hover { background: var(--color-border); }

.asistente-mensajes {
  flex: 1;
  overflow-y: auto;
  padding: 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  background: var(--color-bg);
}

.msg { max-width: 85%; padding: 0.55rem 0.75rem; border-radius: 12px; font-size: 0.85rem; white-space: pre-line; line-height: 1.45; }
.msg.asistente { align-self: flex-start; background: var(--color-surface); border: 1px solid var(--color-border); border-bottom-left-radius: 4px; }
.msg.usuario { align-self: flex-end; background: var(--color-primary); color: #fff; border-bottom-right-radius: 4px; }
.msg-meta { display: block; margin-top: 0.25rem; font-size: 0.68rem; color: var(--color-text-muted); }

.asistente-form { display: flex; gap: 0.5rem; padding: 0.75rem; border-top: 1px solid var(--color-border); background: var(--color-surface); }
.asistente-input { flex: 1; }
.asistente-enviar { width: 44px; height: 44px; border-radius: 50%; background: var(--color-primary); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 1rem; flex-shrink: 0; }
.asistente-enviar:disabled { opacity: 0.5; cursor: not-allowed; }

@media (max-width: 560px) {
  .asistente-panel { width: calc(100vw - 2rem); }
}
</style>
