<template>
  <div class="card">
    <div class="participants-header">
      <div class="card-title" style="margin-bottom:0">👥 參與名單</div>
    </div>
    <textarea
      class="participant-textarea"
      :value="modelValue"
      @input="$emit('update:modelValue', $event.target.value)"
      placeholder="每行一位參與者名稱&#10;例如：&#10;王小明&#10;李大華&#10;張美玲"
    ></textarea>
    <div class="participant-count">共 {{ count }} 位</div>
  </div>
</template>

<script setup>
defineProps({
  modelValue: { type: String, default: '' },
  count: { type: Number, default: 0 },
})
defineEmits(['update:modelValue'])
</script>
