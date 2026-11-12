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
              <button class="btn btn-secondary btn-sm" @click="showUserMenu = !showUserMenu">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M12 2v2m0 16v2M2 12h2m16 0h2"/>
                </svg>
              </button>
              <div class="user-dropdown" v-if="showUserMenu">
                <div class="dropdown-header">
                  <span class="dropdown-email">{{ authStore.usuario?.email }}</span>
                  <span class="badge" :class="roleBadgeClass">{{ authStore.usuario?.rol }}</span>
                </div>
                <hr class="dropdown-divider">
                <button class="dropdown-item" @click="changePassword">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  Cambiar contraseña
                </button>
                <button class="dropdown-item dropdown-item-danger" @click="logout">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                    <polyline points="16 17 21 12 16 7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                  Cerrar sesión
                </button>
              </div>
            </div>
          </div>
        </nav>
      </div>
    </header>
    <main class="main">
      <div class="container">
        <RouterView />
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from './stores/auth'
import { useSolicitudesStore } from './stores/solicitudes'

const router = useRouter()
const authStore = useAuthStore()
const solicitudesStore = useSolicitudesStore()
const showUserMenu = ref(false)

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

// Cerrar dropdown al hacer click fuera
document.addEventListener('click', (e) => {
  if (showUserMenu.value && !e.target.closest('.user-menu')) {
    showUserMenu.value = false
  }
})
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
  height: 64px;
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
  gap: 0.5rem;
}

.nav-link {
  padding: 0.5rem 1rem;
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
  position: absolute;
  top: calc(100% + 0.5rem);
  right: 0;
  min-width: 220px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
  z-index: 200;
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