<template>
  <div class="modal-fondo" @click.self="cerrar">
    <div class="modal-card">
      <h3>{{ cliente ? 'Editar cliente' : 'Nuevo cliente' }}</h3>
      <form @submit.prevent="guardar">
        <div class="field-grid">
          <div class="field">
            <label class="form-label">Empresa *</label>
            <input v-model="datos.empresa" class="form-input" required placeholder="Nombre de la empresa" />
          </div>
          <div class="field">
            <label class="form-label">Nombre de contacto *</label>
            <input v-model="datos.nombre" class="form-input" required placeholder="Nombre y apellidos" />
          </div>
          <div class="field">
            <label class="form-label">Correo electrónico</label>
            <input v-model="datos.email" type="email" class="form-input" placeholder="cliente@empresa.com" />
          </div>
          <div class="field">
            <label class="form-label">Teléfono</label>
            <input v-model="datos.telefono" class="form-input" placeholder="600 000 000" />
          </div>
          <div class="field field-full">
            <label class="form-label">Dirección de la empresa</label>
            <input v-model="datos.direccion_empresa" class="form-input" placeholder="Calle, número, ciudad" />
          </div>
          <div class="field field-full">
            <label class="checkbox-label">
              <input type="checkbox" v-model="datos.activo" />
              Cliente activo
            </label>
          </div>
        </div>

        <p v-if="error" class="modal-error">{{ error }}</p>

        <div class="modal-acciones">
          <button type="button" class="btn btn-secondary" @click="cerrar">Cancelar</button>
          <button type="submit" class="btn btn-primary" :disabled="guardando">
            {{ guardando ? 'Guardando…' : (cliente ? 'Guardar cambios' : 'Crear cliente') }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useClientesStore } from '../../stores/clientes'

const props = defineProps({
  /** Si se pasa, el modal edita ese cliente en vez de crear uno nuevo. */
  cliente: { type: Object, default: null }
})
const emit = defineEmits(['cerrada', 'guardado'])

const store = useClientesStore()
const guardando = ref(false)
const error = ref(null)

const vacio = () => ({
  empresa: '',
  nombre: '',
  email: '',
  telefono: '',
  direccion_empresa: '',
  activo: true
})

const datos = ref(props.cliente ? { ...props.cliente } : vacio())

watch(() => props.cliente, (nuevo) => {
  datos.value = nuevo ? { ...nuevo } : vacio()
})

function cerrar() {
  if (guardando.value) return
  emit('cerrada')
}

async function guardar() {
  guardando.value = true
  error.value = null
  try {
    const guardado = props.cliente
      ? await store.actualizarCliente(props.cliente.id_cliente, datos.value)
      : await store.crearCliente(datos.value)
    emit('guardado', guardado)
  } catch (e) {
    error.value = e.message || 'No se pudo guardar el cliente'
  } finally {
    guardando.value = false
  }
}
</script>
