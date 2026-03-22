<template>
  <div class="card">
    <div class="card-title">🏆 抽獎項目</div>

    <!-- 進度摘要 #5 -->
    <div class="prize-progress">
      <span class="progress-text">已完成 {{ completedCount }}/{{ prizes.length }} 個獎項</span>
      <div class="progress-track">
        <div class="progress-fill" :style="{ width: progressPct + '%' }"></div>
      </div>
    </div>

    <div class="prize-list">
      <div
        v-for="(prize, idx) in prizes"
        :key="prize.id"
        class="prize-item"
        :class="{
          active: selectedIdx === idx,
          'all-drawn': prize.winners.length >= prize.total,
          'flash': flashIdx === idx,
        }"
        @click="prize.winners.length < prize.total && $emit('select', idx)"
      >
        <div class="prize-rank">{{ prize.rank || (idx + 1) }}</div>
        <div class="prize-info">
          <div class="prize-name">{{ prize.name }}</div>
          <div class="prize-count">
            <template v-if="prize.winners.length >= prize.total">
              <span class="prize-full">全數抽出</span>
            </template>
            <template v-else>
              剩餘 <span class="prize-remain">{{ prize.total - prize.winners.length }}</span> 名
              <span class="prize-won">· 已抽 {{ prize.winners.length }}/{{ prize.total }}</span>
            </template>
          </div>
        </div>
        <div v-if="prize.winners.length >= prize.total" class="drawn-check">✓</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  prizes: { type: Array, required: true },
  selectedIdx: { type: Number, default: 0 },
})
defineEmits(['select'])

const completedCount = computed(() => props.prizes.filter(p => p.winners.length >= p.total).length)
const progressPct    = computed(() => props.prizes.length ? (completedCount.value / props.prizes.length) * 100 : 0)

// Flash animation when selectedIdx changes (#1)
const flashIdx = ref(-1)
let flashTimer = null
watch(() => props.selectedIdx, (newVal) => {
  flashIdx.value = newVal
  clearTimeout(flashTimer)
  flashTimer = setTimeout(() => { flashIdx.value = -1 }, 600)
})
</script>

<style scoped>
/* Progress summary */
.prize-progress {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.progress-text {
  font-size: 0.72rem;
  color: var(--text-muted);
  white-space: nowrap;
  letter-spacing: 0.04em;
}
.progress-track {
  flex: 1;
  height: 3px;
  background: rgba(255,255,255,0.07);
  border-radius: 2px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--gold-dark), var(--gold));
  border-radius: 2px;
  transition: width 0.5s ease;
}

/* Flash animation */
@keyframes prize-flash {
  0%   { background: rgba(255,215,0,0.25); border-color: rgba(255,215,0,0.6); }
  100% { background: var(--bg-card2); border-color: rgba(255,255,255,0.06); }
}
.prize-item.flash {
  animation: prize-flash 0.6s ease-out;
}

.prize-item.all-drawn {
  opacity: 0.45;
  cursor: default;
}
.prize-item.all-drawn:hover {
  border-color: rgba(255,255,255,0.06);
  background: var(--bg-card2);
}
.prize-full {
  color: var(--gold-dark);
  font-size: 0.72rem;
  letter-spacing: 0.05em;
}
.prize-remain {
  color: var(--gold);
  font-weight: 700;
}
.drawn-check {
  font-size: 1rem;
  color: var(--gold-dark);
  flex-shrink: 0;
}
</style>
