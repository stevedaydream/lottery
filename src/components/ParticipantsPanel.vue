<template>
  <div class="card">
    <div class="card-title">👥 參與名單</div>

    <!-- 報名 QR Code -->
    <div v-if="formUrl" class="reg-qr-block">
      <img :src="qrImgUrl" alt="報名 QR Code" class="reg-qr-img" />
      <div class="reg-qr-label">掃描報名</div>
      <div v-if="deadlineCountdown" class="reg-countdown">
        <span class="reg-countdown-label">截止倒數</span>
        <span class="reg-countdown-value">{{ deadlineCountdown }}</span>
      </div>
      <div v-else-if="deadline" class="reg-closed">報名已截止</div>
    </div>

    <textarea
      class="participant-textarea"
      :value="modelValue"
      @input="$emit('update:modelValue', $event.target.value)"
      placeholder=""
    ></textarea>
    <div class="participant-count">共 {{ count }} 位</div>
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
.reg-qr-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 0 10px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  margin-bottom: 10px;
}
.reg-qr-img {
  width: 120px;
  height: 120px;
  border-radius: 8px;
  background: #fff;
  padding: 4px;
}
.reg-qr-label {
  font-size: 0.72rem;
  color: var(--text-muted);
  letter-spacing: 0.1em;
}
.reg-countdown {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(0,0,0,0.25);
  border: 1px solid rgba(255,215,0,0.2);
  border-radius: 8px;
  padding: 4px 10px;
}
.reg-countdown-label {
  font-size: 0.65rem;
  color: var(--text-muted);
  letter-spacing: 0.05em;
}
.reg-countdown-value {
  font-size: 0.9rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--gold);
  letter-spacing: 0.05em;
}
.reg-closed {
  font-size: 0.75rem;
  color: #ff6666;
  font-weight: 700;
}
</style>
