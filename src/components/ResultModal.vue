<template>
  <div class="modal-backdrop" v-if="show">
    <div class="modal-box">
      <div>
        <div class="modal-prize-label">恭喜獲得</div>
        <div class="modal-prize-name">{{ prize }}</div>
      </div>

      <div class="winner-grid" :class="sizeClass">
        <div v-for="(w, i) in winners" :key="i" class="winner-card">
          <div v-if="winners.length > 1" class="winner-no">No.{{ String(i + 1).padStart(2, '0') }}</div>
          <div class="winner-card-name">{{ w.name }}</div>
        </div>
      </div>

      <div class="modal-footer-row">
        <div class="modal-winner-sub">CONGRATULATIONS</div>
        <button class="modal-close-btn" @click="$emit('close')">確認</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
const props = defineProps({
  show:    { type: Boolean, default: false },
  prize:   { type: String,  default: '' },
  winners: { type: Array,   default: () => [] },
})
defineEmits(['close'])

// 依人數決定卡片尺寸，人多時縮小字級
const sizeClass = computed(() => {
  const n = props.winners.length
  if (n <= 1) return 'size-1'
  if (n <= 3) return 'size-3'
  if (n <= 6) return 'size-6'
  return 'size-many'
})
</script>

<style scoped>
.winner-grid {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: grid;
  gap: clamp(12px, 1.7vw, 32px);
  overflow-y: auto;
}
.size-1 { grid-template-columns: minmax(0, 1fr); max-width: 960px; }
.size-3 { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
.size-6 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.size-many { grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); align-content: start; }

.winner-card {
  background: var(--cream-hi);
  color: var(--ink);
  border-radius: 28px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: clamp(20px, 3.7vh, 40px) 24px;
  animation: cardIn 0.5s cubic-bezier(0.34,1.56,0.64,1) both;
}
.winner-card:nth-child(2) { animation-delay: 0.08s; }
.winner-card:nth-child(3) { animation-delay: 0.16s; }
@keyframes cardIn {
  from { transform: translateY(24px); opacity: 0; }
  to   { transform: translateY(0); opacity: 1; }
}
.winner-no {
  font-family: var(--font-num);
  font-weight: 800;
  font-size: clamp(1.4rem, 2vw, 2.5rem);
  color: var(--accent-deep);
}
.winner-card-name {
  font-family: var(--font-display);
  font-weight: 900;
  line-height: 1;
  letter-spacing: 0.04em;
  overflow-wrap: anywhere;
}
.size-1 .winner-card-name { font-size: clamp(4rem, 10vw, 12rem); }
.size-3 .winner-card-name { font-size: clamp(3rem, 7vw, 8.5rem); }
.size-6 .winner-card-name { font-size: clamp(2.2rem, 4.4vw, 5.5rem); }
.size-many .winner-card-name { font-size: clamp(1.8rem, 2.8vw, 3.5rem); }
.size-many .winner-card { border-radius: 20px; gap: 8px; }
</style>
