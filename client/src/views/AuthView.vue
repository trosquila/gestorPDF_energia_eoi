<template>
  <div class="auth-page">
    <div class="auth-container">
      <div class="auth-card card">
        <div class="card-body">
          <div class="auth-header">
            <router-link to="/" class="logo">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
              </svg>
              <span>Control Energía</span>
            </router-link>
            <h2>{{ isLogin ? 'Iniciar sesión' : 'Crear cuenta' }}</h2>
            <p class="auth-subtitle">{{ isLogin ? 'Accede a tu panel de facturas' : 'Regístrate para empezar' }}</p>
          </div>

          <form @submit.prevent="handleSubmit" class="auth-form">
            <div class="form-group" v-if="!isLogin">
              <label class="form-label">Nombre</label>
              <input
                v-model="form.nombre"
                type="text"
                class="form-input"
                placeholder="Tu nombre"
                @blur="validateField('nombre')"
              />
              <p v-if="errors.nombre" class="form-error">{{ errors.nombre }}</p>
            </div>

            <div class="form-group">
              <label class="form-label">Email</label>
              <input
                v-model="form.email"
                type="email"
                class="form-input"
                placeholder="tu@email.com"
                @blur="validateField('email')"
                :disabled="loading"
              />
              <p v-if="errors.email" class="form-error">{{ errors.email }}</p>
            </div>

            <div class="form-group">
              <label class="form-label">Contraseña</label>
              <div class="password-input-wrapper">
                <input
                  :type="showPassword ? 'text' : 'password'"
                  v-model="form.password"
                  class="form-input password-input"
                  placeholder="Mínimo 8 caracteres"
                  @blur="validateField('password')"
                  :disabled="loading"
                />
                <button
                  type="button"
                  class="password-toggle"
                  @click="showPassword = !showPassword"
                  :aria-label="showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'"
                >
                  <svg v-if="!showPassword" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                  <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                </button>
              </div>
              <p v-if="errors.password" class="form-error">{{ errors.password }}</p>
            </div>

            <div class="form-group" v-if="!isLogin">
              <label class="form-label">Confirmar contraseña</label>
              <input
                :type="showPassword ? 'text' : 'password'"
                v-model="form.confirmPassword"
                class="form-input"
                placeholder="Repite la contraseña"
                @blur="validateField('confirmPassword')"
                :disabled="loading"
              />
              <p v-if="errors.confirmPassword" class="form-error">{{ errors.confirmPassword }}</p>
            </div>

            <div v-if="error" class="auth-error">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span>{{ error }}</span>
            </div>

            <button
              type="submit"
              class="btn btn-primary btn-block"
              :disabled="loading || !isFormValid"
            >
              <span v-if="loading" class="btn-loading">
                <svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
                  <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/>
                </svg>
                {{ isLogin ? 'Entrando...' : 'Creando cuenta...' }}
              </span>
              <span v-else>{{ isLogin ? 'Iniciar sesión' : 'Crear cuenta' }}</span>
            </button>
          </form>

          <div class="auth-footer">
            <p>
              {{ isLogin ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?' }}
              <router-link :to="isLogin ? '/register' : '/login'" class="auth-link">
                {{ isLogin ? 'Regístrate' : 'Inicia sesión' }}
              </router-link>
            </p>
          </div>

          <div class="auth-demo" v-if="isLogin">
            <p class="demo-hint">Demo: usa un usuario creado vía API</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const isLogin = computed(() => route.path === '/login')

const form = ref({
  nombre: '',
  email: '',
  password: '',
  confirmPassword: ''
})

const errors = ref({})
const error = ref(null)
const showPassword = ref(false)
const loading = computed(() => authStore.loading)

const isFormValid = computed(() => {
  if (isLogin.value) {
    return form.value.email && form.value.password.length >= 8
  }
  return form.value.nombre && form.value.email && form.value.password.length >= 8 && form.value.password === form.value.confirmPassword
})

function validateField(field) {
  errors.value[field] = ''
  
  switch (field) {
    case 'nombre':
      if (!isLogin.value && !form.value.nombre.trim()) {
        errors.value.nombre = 'El nombre es requerido'
      }
      break
    case 'email':
      if (!form.value.email) {
        errors.value.email = 'El email es requerido'
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.value.email)) {
        errors.value.email = 'Email inválido'
      }
      break
    case 'password':
      if (!form.value.password) {
        errors.value.password = 'La contraseña es requerida'
      } else if (form.value.password.length < 8) {
        errors.value.password = 'Mínimo 8 caracteres'
      }
      break
    case 'confirmPassword':
      if (!isLogin.value && form.value.password !== form.value.confirmPassword) {
        errors.value.confirmPassword = 'Las contraseñas no coinciden'
      }
      break
  }
}

async function handleSubmit() {
  console.log('🔵 handleSubmit llamado', form.value);
  error.value = null
  Object.keys(errors.value).forEach(k => errors.value[k] = '')
  
  // Validar todos los campos
  if (isLogin.value) {
    validateField('email')
    validateField('password')
  } else {
    validateField('nombre')
    validateField('email')
    validateField('password')
    validateField('confirmPassword')
  }
  
  if (Object.values(errors.value).some(e => e)) return

  try {
    if (isLogin.value) {
      await authStore.login(form.value.email, form.value.password)
    } else {
      await authStore.register(form.value.email, form.value.password, form.value.nombre)
    }
    
    // Redirigir a la página que intentaba acceder o al dashboard
    const redirect = route.query.redirect || '/'
    router.push(redirect)
  } catch (e) {
    error.value = e.response?.data?.error || (isLogin.value ? 'Credenciales inválidas' : 'Error al registrarse')
  }
}

// Limpiar formulario al cambiar entre login/register
watch(isLogin, () => {
  form.value = { nombre: '', email: '', password: '', confirmPassword: '' }
  errors.value = {}
  error.value = null
})
</script>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem;
  background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
}

.auth-container {
  width: 100%;
  max-width: 420px;
}

.auth-card {
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
}

.auth-header {
  text-align: center;
  margin-bottom: 2rem;
}

.auth-header .logo {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 700;
  font-size: 1.25rem;
  color: var(--color-primary);
  margin-bottom: 1.5rem;
}

.auth-header h2 {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: 0.5rem;
}

.auth-subtitle {
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.form-error {
  margin-top: 0.375rem;
  font-size: 0.75rem;
  color: var(--color-error);
}

.password-input-wrapper {
  position: relative;
}

.password-input {
  padding-right: 3rem !important;
}

.password-toggle {
  position: absolute;
  right: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: var(--color-text-muted);
  padding: 0.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.password-toggle:hover {
  color: var(--color-text);
}

.auth-error {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background-color: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: var(--radius);
  color: var(--color-error);
  font-size: 0.875rem;
}

.btn-block {
  width: 100%;
  padding: 0.875rem 1.5rem;
  font-size: 1rem;
  margin-top: 0.5rem;
}

.btn-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.auth-footer {
  margin-top: 1.5rem;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.auth-link {
  font-weight: 600;
  color: var(--color-primary);
  margin-left: 0.5rem;
}

.auth-link:hover {
  text-decoration: underline;
}

.auth-demo {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--color-border);
}

.demo-hint {
  text-align: center;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}
</style>