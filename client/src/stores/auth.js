import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// Base de la API. Si no hay .env, queda vacío y el proxy de Vite
// (/api -> http://localhost:3000) se encarga de enrutar la petición.
// Se tolera barra final y sufijo '/api' para no acabar en /api/api/...
const API_URL = (import.meta.env.VITE_API_URL || '')
  .replace(/\/+$/, '')
  .replace(/\/api$/, '')

export const useAuthStore = defineStore('auth', () => {
  const usuario = ref(null)
  const token = ref(localStorage.getItem('auth_token') || null)
  const loading = ref(false)
  const error = ref(null)

  const isAuthenticated = computed(() => !!token.value && !!usuario.value)
  const isAdmin = computed(() => usuario.value?.rol === 'admin')
  const isOperador = computed(() => ['admin', 'operador'].includes(usuario.value?.rol))
  const userName = computed(() => usuario.value?.nombre || usuario.value?.email || 'Usuario')

  // ===== LOGIN =====
  async function login(email, password) {
    loading.value = true
    error.value = null
    try {
      const response = await fetch(`${API_URL}/api/usuarios/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      const data = await response.json()
      
      if (!response.ok) throw new Error(data.error || 'Credenciales inválidas')
      
      usuario.value = data.data
      token.value = `Bearer ${data.data.id_usuario}`
      localStorage.setItem('auth_token', token.value)
      localStorage.setItem('auth_user', JSON.stringify(data.data))
      return data.data
    } catch (e) {
      error.value = e.message || 'Error al iniciar sesión'
      throw e
    } finally {
      loading.value = false
    }
  }

  // ===== REGISTRO (Registro propio con Bcrypt en backend) =====
  async function register(email, password, nombre, rol = 'lector') {
    loading.value = true
    error.value = null
    try {
      const response = await fetch(`${API_URL}/api/usuarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, nombre, rol })
      })
      const data = await response.json()
      
      if (!response.ok) throw new Error(data.error || 'Error al registrarse')

      // El registro solo crea una solicitud: no se inicia sesión hasta que
      // un administrador la apruebe.
      return data
    } catch (e) {
      error.value = e.message || 'Error al registrarse'
      throw e
    } finally {
      loading.value = false
    }
  }

  // ===== CAMBIAR CONTRASEÑA =====
  async function changePassword(currentPassword, newPassword) {
    loading.value = true
    error.value = null
    try {
      const email = usuario.value?.email
      if (!email) throw new Error('Usuario no autenticado')
      
      const response = await fetch(`${API_URL}/api/usuarios/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, current_password: currentPassword, new_password: newPassword })
      })
      const data = await response.json()
      
      if (!response.ok) throw new Error(data.error || 'Error al cambiar contraseña')
      
      return true
    } catch (e) {
      error.value = e.message || 'Error al cambiar contraseña'
      throw e
    } finally {
      loading.value = false
    }
  }

  // ===== LOGOUT =====
  function logout() {
    usuario.value = null
    token.value = null
    localStorage.removeItem('auth_token')
    localStorage.removeItem('auth_user')
  }

  // ===== INIT AUTH =====
  function initAuth() {
    const savedToken = localStorage.getItem('auth_token')
    const savedUser = localStorage.getItem('auth_user')
    if (savedToken && savedUser) {
      token.value = savedToken
      usuario.value = JSON.parse(savedUser)
    }
  }

  // ===== FETCH PROFILE =====
  async function fetchProfile() {
    if (!token.value) return null
    try {
      const response = await fetch(`${API_URL}/api/usuarios/profile`, {
        method: 'GET',
        headers: {
          'Authorization': token.value
        }
      })
      const data = await response.json()
      
      if (!response.ok) throw new Error(data.error || 'Error al obtener perfil')
      
      usuario.value = data.data
      localStorage.setItem('auth_user', JSON.stringify(usuario.value))
      return usuario.value
    } catch (e) {
      logout()
      return null
    }
  }

  return {
    usuario,
    token,
    loading,
    error,
    isAuthenticated,
    isAdmin,
    isOperador,
    userName,
    login,
    register,
    changePassword,
    logout,
    initAuth,
    fetchProfile
  }
})
