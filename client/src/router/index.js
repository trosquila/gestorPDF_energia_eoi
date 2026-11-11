import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

import DetalleView from '../views/DetalleView.vue'
import LoteView from '../views/LoteView.vue'
import AnaliticaView from '../views/AnaliticaView.vue'
import AuthView from '../views/AuthView.vue'

const routes = [
  { path: '/', name: 'Detalle', component: DetalleView, meta: { requiresAuth: true } },
  // Detalle de una factura concreta (el botón "Ver" del lote navega aquí)
  { path: '/detalle/:id', name: 'DetalleFactura', component: DetalleView, meta: { requiresAuth: true } },
  { path: '/lote', name: 'Lote', component: LoteView, meta: { requiresAuth: true } },
  { path: '/analitica', name: 'Analitica', component: AnaliticaView, meta: { requiresAuth: true } },
  { path: '/login', name: 'Login', component: AuthView, meta: { guestOnly: true } },
  { path: '/register', name: 'Register', component: AuthView, meta: { guestOnly: true } }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// Route guards
router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore()
  
  // Inicializar auth si no está hecho
  if (!authStore.token && localStorage.getItem('auth_token')) {
    authStore.initAuth()
  }
  
  const requiresAuth = to.matched.some(record => record.meta.requiresAuth)
  const guestOnly = to.matched.some(record => record.meta.guestOnly)
  
  if (requiresAuth && !authStore.isAuthenticated) {
    // Guardar la ruta a la que intentaba acceder
    next({ name: 'Login', query: { redirect: to.fullPath } })
    return
  }
  
  if (guestOnly && authStore.isAuthenticated) {
    // Usuario ya logado, redirigir al dashboard
    next({ name: 'Detalle' })
    return
  }
  
  next()
})

export default router