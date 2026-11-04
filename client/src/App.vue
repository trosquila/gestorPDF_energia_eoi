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
        <nav class="nav">
          <router-link to="/" class="nav-link" :class="{ active: isActive('/') }">Detalle</router-link>
          <router-link to="/lote" class="nav-link" :class="{ active: isActive('/lote') }">Lote</router-link>
          <router-link to="/analitica" class="nav-link" :class="{ active: isActive('/analitica') }">Analítica</router-link>
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
import { useRouter } from 'vue-router'
const router = useRouter()
const isActive = (path) => router.currentRoute.value.path === path
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

.main {
  flex: 1;
  padding: 2rem 0;
}
</style>