<template>
  <div class="reg-card">
    <div class="reg-row">
      <img v-if="formUrl" :src="qrImgUrl" alt="報名 QR Code" class="reg-qr-img" />
      <div class="reg-info">
        <div class="reg-title">{{ formUrl ? '掃碼報名' : '參與名單' }}</div>
        <div v-if="deadlineCountdown" class="reg-sub">截止倒數 <b>{{ deadlineCountdown }}</b></div>
        <div v-else-if="deadline" class="reg-sub reg-closed">報名已截止</div>
        <div class="reg-sub">共 {{ count }} 位</div>
      </div>
    </div>

    <details class="reg-edit">
      <summary>手動編輯名單</summary>
      <textarea
        class="participant-textarea"
        :value="modelValue"
        @input="$emit('update:modelValue', $event.target.value)"
        placeholder="一行一位"
        aria-label="參與名單"
      ></textarea>
    </details>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  modelValue:        { type: String, default: '' },
  count:             { type: Number, default: 0 },
  formUrl:           { type: String, default: '' },
  deadline:          { type: String, default: '' },
})
defineEmits(['update:modelValue'])

const qrImgUrl = computed(() =>
  props.formUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(props.formUrl)}`
    : ''
)

const now = ref(Date.now())
let timer = null
onMounted(() => { timer = setInterval(() => { now.value = Date.now() }, 1000) })
onUnmounted(() => { clearInterval(timer) })

const deadlineCountdown = computed(() => {
  if (!props.deadline) return null
  const diff = new Date(props.deadline).getTime() - now.value
  if (diff <= 0) return null
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const s = Math.floor((diff % 60000) / 1000)
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  return `${m}:${String(s).padStart(2,'0')}`
})
</script>

<style scoped>
.reg-card {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px;
  border-radius: 14px;
  border: 1px solid var(--line);
  flex-shrink: 0;
}
.reg-row { display: flex; gap: 16px; align-items: center; }
.reg-qr-img {
  width: 96px;
  height: 96px;
  border-radius: 8px;
  background: #fff;
  padding: 4px;
  flex-shrink: 0;
}
.reg-info { display: flex; flex-direction: column; gap: 4px; }
.reg-title { font-size: 1.15rem; font-weight: 700; }
.reg-sub { font-size: 0.95rem; color: var(--muted); }
.reg-sub b { font-family: var(--font-num); font-weight: 800; font-size: 1.2rem; color: var(--cream); font-variant-numeric: tabular-nums; }
.reg-closed { color: #F08A78; }
.reg-edit summary {
  font-size: 0.85rem;
  color: var(--muted);
  cursor: pointer;
  margin-bottom: 8px;
}
</style>
