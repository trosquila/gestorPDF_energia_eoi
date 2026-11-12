import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Request interceptor para añadir token de auth
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token')
    if (token) {
      config.headers.Authorization = token
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor para manejar errores de auth
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expirado o inválido
      localStorage.removeItem('auth_token')
      localStorage.removeItem('auth_user')
    }
    console.error('API Error:', error.response?.data || error.message)
    return Promise.reject(error)
  }
)

// Función para actualizar el token dinámicamente
export function setAuthToken(token) {
  if (token) {
    api.defaults.headers.common.Authorization = token
  } else {
    delete api.defaults.headers.common.Authorization
  }
}

export const authApi = {
  login: (email, password) => api.post('/usuarios/login', { email, password }),
  register: (email, password, nombre, rol) => api.post('/usuarios', { email, password, nombre, rol }),
  changePassword: (email, currentPassword, newPassword) => api.post('/usuarios/change-password', { email, current_password: currentPassword, new_password: newPassword }),
  getProfile: () => api.get('/usuarios/profile'),
  listUsuarios: (params) => api.get('/usuarios', { params }),
  updateUsuario: (id, data) => api.patch(`/usuarios/${id}`, data)
}

export const facturasApi = {
  uploadPdf: (file, onProgress) => {
    const formData = new FormData()
    formData.append('pdf', file)
    return api.post('/facturas/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress
    })
  },
  getFactura: (id) => api.get(`/facturas/${id}`),
  listFacturas: (params) => api.get('/facturas', { params }),
  updateFactura: (id, data) => api.patch(`/facturas/${id}`, data),
  deleteFactura: (id) => api.delete(`/facturas/${id}`),
  getMetricas: () => api.get('/facturas/metricas'),
  getAnalitica: (params) => api.get('/analitica', { params }),
  analiticaEnergia: (params) => api.get('/analitica/energia', { params }),
  asignarCliente: (id, id_cliente) => api.patch(`/facturas/${id}/cliente`, { id_cliente }),
  // Alta manual de rescate: archivo + datos escritos a mano
  crearFacturaManual: (formData, onProgress) => api.post('/facturas/manual', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: onProgress
  })
}

export const clientesApi = {
  list: (params) => api.get('/clientes', { params }),
  get: (id) => api.get(`/clientes/${id}`),
  create: (data) => api.post('/clientes', data),
  update: (id, data) => api.patch(`/clientes/${id}`, data),
  remove: (id) => api.delete(`/clientes/${id}`)
}

export const comparadorApi = {
  fuentes: () => api.get('/comparador/fuentes'),
  precios: (params) => api.get('/comparador/precios', { params }),
  ofertas: () => api.get('/comparador/ofertas'),
  crearOferta: (data) => api.post('/comparador/ofertas', data),
  actualizarOferta: (id, data) => api.patch(`/comparador/ofertas/${id}`, data),
  eliminarOferta: (id) => api.delete(`/comparador/ofertas/${id}`),
  simular: (perfil) => api.post('/comparador/simular', perfil),
  asistente: (datos, pregunta) => api.post('/comparador/asistente', { datos, pregunta }, { timeout: 60000 }),
  perfilDeFactura: (id) => api.get(`/comparador/facturas/${id}/perfil`)
}

export const solicitudesApi = {
  list: (params) => api.get('/solicitudes', { params }),
  aprobar: (id) => api.post(`/solicitudes/${id}/aprobar`),
  rechazar: (id, motivo) => api.post(`/solicitudes/${id}/rechazar`, { motivo })
}

export const historialApi = {
  getByFactura: (idFactura, params) => api.get(`/historial/factura/${idFactura}`, { params }),
  getAll: (params) => api.get('/historial', { params }),
  create: (data) => api.post('/historial', data)
}

export const usuariosApi = {
  list: (params) => api.get('/usuarios', { params }),
  update: (id, data) => api.patch(`/usuarios/${id}`, data)
}

export default api