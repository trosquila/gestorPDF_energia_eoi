import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

// Las vistas se cargan bajo demanda (code splitting): entrar a subir una
// factura no descarga el código de analítica, del lote ni de solicitudes.
const SubidaView = () => import('../views/SubidaView.vue')
const FacturaView = () => import('../views/FacturaView.vue')
const FacturaLoteView = () => import('../views/FacturaLoteView.vue')
const LoteView = () => import('../views/LoteView.vue')
const AnaliticaView = () => import('../views/AnaliticaView.vue')
const AuthView = () => import('../views/AuthView.vue')
const SolicitudesView = () => import('../views/SolicitudesView.vue')
const ClientesView = () => import('../views/ClientesView.vue')
const ComparadorView = () => import('../views/ComparadorView.vue')

const routes = [
  // Subir una factura nueva
  { path: '/', name: 'Subida', component: SubidaView, meta: { requiresAuth: true } },
  // Ficha de una factura: pide sus datos por id a la API
  { path: '/factura/:id', name: 'Factura', component: FacturaView, meta: { requiresAuth: true } },
  // La misma ficha dentro del flujo del lote, con anterior/siguiente
  { path: '/lote/:id', name: 'FacturaLote', component: FacturaLoteView, meta: { requiresAuth: true } },
  { path: '/lote', name: 'Lote', component: LoteView, meta: { requiresAuth: true } },
  { path: '/analitica', name: 'Analitica', component: AnaliticaView, meta: { requiresAuth: true } },
  // Comparador: privado, para usuarios de la empresa
  { path: '/comparador', name: 'Comparador', component: ComparadorView, meta: { requiresAuth: true } },
  // Gestión de clientes: solo administradores
  { path: '/clientes', name: 'Clientes', component: ClientesView, meta: { requiresAuth: true, requiresAdmin: true } },
  // Panel de administración: solo para rol admin
  { path: '/solicitudes', name: 'Solicitudes', component: SolicitudesView, meta: { requiresAuth: true, requiresAdmin: true } },
  { path: '/login', name: 'Login', component: AuthView, meta: { guestOnly: true } },
  { path: '/register', name: 'Register', component: AuthView, meta: { guestOnly: true } },
  // Compatibilidad con enlaces antiguos
  { path: '/detalle/:id', redirect: to => ({ name: 'Factura', params: { id: to.params.id } }) },
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  }
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

  // Rutas de administración
  const requiresAdmin = to.matched.some(record => record.meta.requiresAdmin)
  if (requiresAdmin && !authStore.isAdmin) {
    next({ name: 'Subida' })
    return
  }

  if (guestOnly && authStore.isAuthenticated) {
    // Usuario ya logado, redirigir al inicio
    next({ name: 'Subida' })
    return
  }
  
  next()
})

export default router