import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json'
  }
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.response?.data || error.message)
    return Promise.reject(error)
  }
)

export const facturasApi = {
  // Subir y procesar PDF
  uploadPdf: (file, onProgress) => {
    const formData = new FormData()
    formData.append('pdf', file)
    return api.post('/facturas/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress
    })
  },

  // Obtener factura por ID
  getFactura: (id) => api.get(`/facturas/${id}`),

  // Listar facturas con filtros
  listFacturas: (params) => api.get('/facturas', { params }),

  // Actualizar factura (correcciones manuales)
  updateFactura: (id, data) => api.patch(`/facturas/${id}`, data),

  // Eliminar factura
  deleteFactura: (id) => api.delete(`/facturas/${id}`),

  // Obtener métricas para dashboard
  getMetricas: () => api.get('/facturas/metricas'),

  // Obtener datos para analítica
  getAnalitica: (params) => api.get('/analitica', { params }),

  // Obtener facturas de ejemplo (dataset IDSEM)
  getEjemplos: () => api.get('/ejemplos')
}

export default api