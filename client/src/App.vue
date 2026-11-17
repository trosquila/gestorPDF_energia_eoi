<template>
  <div class="app">
    <header class="header">
      <div class="container header-content">
        <router-link to="/" class="logo">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
          </svg>
          <span>Control Energía</span>
        </router-link>
        <nav class="nav" v-if="authStore.isAuthenticated">
          <router-link to="/" class="nav-link" :class="{ active: isActive('/') }">Subir factura</router-link>
          <router-link to="/lote" class="nav-link" :class="{ active: esZonaLote }">Lote</router-link>
          <router-link to="/analitica" class="nav-link" :class="{ active: isActive('/analitica') }">Analítica</router-link>
          <router-link
            to="/comparador"
            class="nav-link"
            :class="{ active: isActive('/comparador') }">Comparador</router-link>
          <router-link
            v-if="authStore.isAdmin"
            to="/clientes"
            class="nav-link"
            :class="{ active: isActive('/clientes') }">Clientes</router-link>
          <router-link
            v-if="authStore.isAdmin"
            to="/solicitudes"
            class="nav-link"
            :class="{ active: isActive('/solicitudes') }">
            Solicitudes
            <span v-if="pendientes > 0" class="badge-pendientes">{{ pendientes }}</span>
          </router-link>
          <div class="nav-user">
            <span class="user-name">{{ authStore.userName }}</span>
            <div class="user-menu">
              <button
                ref="botonUsuario"
                class="btn btn-secondary btn-sm"
                aria-haspopup="menu"
                :aria-expanded="showUserMenu"
                @click.stop="alternarMenu">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M12 2v2m0 16v2M2 12h2m16 0h2"/>
                </svg>
              </button>
            </div>
          </div>
        </nav>
      </div>
    </header>

    <!-- El menú va pegado al body a propósito: dentro del header lo recortaba
         el contenedor de la cabecera y solo se veían un par de píxeles. -->
    <Teleport to="body">
      <div
        v-if="showUserMenu"
        class="user-dropdown"
        role="menu"
        :style="estiloMenu"
        @click.stop>
        <div class="dropdown-header">
          <span class="dropdown-email">{{ authStore.usuario?.email }}</span>
          <span class="badge" :class="roleBadgeClass">{{ authStore.usuario?.rol }}</span>
        </div>
        <hr class="dropdown-divider">
        <button class="dropdown-item" role="menuitem" @click="changePassword">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          Cambiar contraseña
        </button>
        <button class="dropdown-item dropdown-item-danger" role="menuitem" @click="logout">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Cerrar sesión
        </button>
      </div>
    </Teleport>
    <main class="main">
      <div class="container">
        <RouterView />
      </div>
    </main>

    <AsistenteWidget />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from './stores/auth'
import { useSolicitudesStore } from './stores/solicitudes'
import AsistenteWidget from './components/AsistenteWidget.vue'

const router = useRouter()
const authStore = useAuthStore()
const solicitudesStore = useSolicitudesStore()
const showUserMenu = ref(false)
const botonUsuario = ref(null)
const estiloMenu = ref({})

// Contador de solicitudes pendientes (solo se consulta si es admin)
const pendientes = computed(() => solicitudesStore.solicitudes.filter((s) => s.estado === 'pendiente').length)

function cargarPendientes() {
  if (!authStore.isAdmin) return
  solicitudesStore.cargarSolicitudes({ estado: 'pendiente' }).catch(() => {})
}

onMounted(cargarPendientes)
watch(() => authStore.isAdmin, (esAdmin) => { if (esAdmin) cargarPendientes() })

const isActive = (path) => router.currentRoute.value.path === path
// "Lote" queda activo también dentro de la ficha abierta desde el lote
const esZonaLote = computed(() => router.currentRoute.value.path.startsWith('/lote'))

const roleBadgeClass = computed(() => {
  const role = authStore.usuario?.rol
  if (role === 'admin') return 'badge-error'
  if (role === 'operador') return 'badge-warning'
  return 'badge-info'
})

function logout() {
  authStore.logout()
  showUserMenu.value = false
  router.push('/login')
}

function changePassword() {
  showUserMenu.value = false
  // TODO: Implementar modal de cambio de contraseña
  alert('Funcionalidad pendiente: implementar modal de cambio de contraseña')
}

/**
 * Coloca el menú bajo el botón. Va en el body (position: fixed) para que no lo
 * recorte ningún ancestro con overflow, y se recoloca al redimensionar.
 */
function colocarMenu() {
  const boton = botonUsuario.value
  if (!boton) return
  const r = boton.getBoundingClientRect()
  const ancho = 240
  const izquierda = Math.max(8, Math.min(r.right - ancho, window.innerWidth - ancho - 8))
  estiloMenu.value = {
    position: 'fixed',
    top: `${Math.round(r.bottom + 8)}px`,
    left: `${Math.round(izquierda)}px`,
    width: `${ancho}px`
  }
}

function alternarMenu() {
  showUserMenu.value = !showUserMenu.value
  if (showUserMenu.value) colocarMenu()
}

// Cerrar el dropdown al hacer click fuera, con Escape, o al desplazar la página
document.addEventListener('click', (e) => {
  if (!showUserMenu.value) return
  if (e.target.closest('.user-menu') || e.target.closest('.user-dropdown')) return
  showUserMenu.value = false
})
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') showUserMenu.value = false
})
window.addEventListener('resize', () => { if (showUserMenu.value) colocarMenu() })
window.addEventListener('scroll', () => { showUserMenu.value = false }, { passive: true })
</script>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.header {
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  /* Antes era height fija: al partirse el menú en dos líneas se salía del header */
  min-height: 64px;
  padding-top: 0.5rem;
  padding-bottom: 0.5rem;
  flex-wrap: wrap;
}

.logo {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  font-weight: 700;
  white-space: nowrap;
  font-size: 1.125rem;
  color: var(--color-primary);
  text-decoration: none;
}

.logo:hover {
  text-decoration: none;
}

.logo svg {
  color: var(--color-primary);
}

.nav {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-wrap: wrap;
  justify-content: flex-end;
  /* SIN overflow: cualquier overflow aquí recorta el menú de usuario, que se
     dibuja fuera del flujo. En pantallas estrechas se parte en dos líneas. */
}

.nav-link {
  padding: 0.5rem 1rem;
  white-space: nowrap;
  border-radius: var(--radius);
  font-weight: 500;
  color: var(--color-text-muted);
  transition: all 0.15s;
}

.nav-link:hover {
  color: var(--color-text);
  background-color: var(--color-bg);
  text-decoration: none;
}

.nav-link.active {
  color: var(--color-primary);
  background-color: #eff6ff;
}

.badge-pendientes {
  display: inline-block;
  margin-left: 0.35rem;
  min-width: 1.15rem;
  padding: 0 0.3rem;
  border-radius: 999px;
  background: var(--color-error);
  color: #fff;
  font-size: 0.7rem;
  font-weight: 700;
  line-height: 1.15rem;
  text-align: center;
}

.main {
  flex: 1;
  padding: 2rem 0;
}

.nav-user {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-left: 1rem;
  padding-left: 1rem;
  border-left: 1px solid var(--color-border);
}

.user-name {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text);
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-menu {
  position: relative;
}

.user-dropdown {
  /* posición, top y left vienen del estilo en línea calculado al abrir */
  min-width: 220px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
  z-index: 300;
  overflow: hidden;
}

.dropdown-header {
  padding: 0.75rem 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-border);
}

.dropdown-email {
  font-size: 0.8125rem;
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dropdown-divider {
  margin: 0;
  border-color: var(--color-border);
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  width: 100%;
  padding: 0.625rem 1rem;
  background: none;
  border: none;
  color: var(--color-text);
  font-size: 0.875rem;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
}

.dropdown-item:hover {
  background: var(--color-bg);
}

.dropdown-item-danger {
  color: var(--color-error);
}

.dropdown-item-danger:hover {
  background: #fef2f2;
}
</style>