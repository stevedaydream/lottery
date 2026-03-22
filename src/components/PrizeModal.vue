<template>
  <div class="prize-modal-backdrop" v-if="show" @click.self="$emit('close')">
    <div class="prize-modal-box">
      <div class="prize-modal-title">{{ isEditing ? '編輯獎項' : '新增獎項' }}</div>
      <div class="form-group">
        <label class="form-label">獎項名稱</label>
        <input class="form-input" v-model="form.name" placeholder="例如：頭獎 · PS5">
      </div>
      <div class="form-row">
        <div class="form-group" style="flex:1">
          <label class="form-label">名額（人數）</label>
          <input class="form-input" type="number" min="1" v-model.number="form.total" placeholder="1">
        </div>
        <div class="form-group" style="flex:1">
          <label class="form-label">等級標示</label>
          <input class="form-input" v-model="form.rank" placeholder="例如：🥇">
        </div>
      </div>
      <div class="modal-btns">
        <button class="btn-secondary" @click="$emit('close')">取消</button>
        <button v-if="isEditing" class="btn-danger" @click="$emit('delete')">刪除</button>
        <button class="btn-primary" @click="$emit('save', form)">儲存</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, watch } from 'vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  isEditing: { type: Boolean, default: false },
  initial: { type: Object, default: () => ({ name: '', total: 1, rank: '' }) },
})
defineEmits(['close', 'save', 'delete'])

const form = reactive({ name: '', total: 1, rank: '' })

watch(() => props.initial, val => {
  form.name = val.name
  form.total = val.total
  form.rank = val.rank
}, { immediate: true })
</script>
