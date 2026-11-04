import { createRouter, createWebHistory } from 'vue-router'
import DetalleView from '../views/DetalleView.vue'
import LoteView from '../views/LoteView.vue'
import AnaliticaView from '../views/AnaliticaView.vue'

const routes = [
  { path: '/', name: 'Detalle', component: DetalleView },
  { path: '/lote', name: 'Lote', component: LoteView },
  { path: '/analitica', name: 'Analitica', component: AnaliticaView }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router