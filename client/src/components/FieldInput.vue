<template>
  <div class="form-group">
    <label class="form-label">{{ label }}
      <span v-if="method" class="field-method" :class="methodClass">{{ methodLabel }}</span>
    </label>
    <input 
      :value="modelValue"
      :type="type"
      :step="step"
      :placeholder="placeholder"
      :readonly="readonly"
      :disabled="readonly"
      class="form-input"
      @input="$emit('update:modelValue', $event.target.value)"
      @blur="$emit('blur')" />
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  label: { type: String, required: true },
  type: { type: String, default: 'text' },
  step: { type: String, default: 'any' },
  placeholder: { type: String, default: '' },
  readonly: { type: Boolean, default: false },
  method: { type: String, default: 'regla' }
})

const emit = defineEmits(['update:modelValue', 'blur'])

const methodClass = computed(() => {
  return props.method
})

const methodLabel = computed(() => {
  const map = { regla: 'Regla', llm: 'LLM', mixto: 'Mixto' }
  return map[props.method] || props.method
})
</script>

<style scoped>
.form-group {
  margin-bottom: 1rem;
}

.field-method {
  margin-left: 0.5rem;
  font-size: 0.65rem;
  padding: 0.125rem 0.375rem;
}

.field-method.regla {
  background-color: #dcfce7;
  color: #166534;
}

.field-method.llm {
  background-color: #fef3c7;
  color: #92400e;
}

.field-method.mixto {
  background-color: #e0e7ff;
  color: #3730a3;
}
</style>