<template>
  <div style="display:flex;flex-direction:column;gap:16px;min-height:0">
    <div style="display:flex;justify-content:space-between;align-items:baseline">
      <div class="section-label">獎項</div>
      <div class="progress-text">已完成 {{ completedCount }}/{{ prizes.length }}</div>
    </div>

    <div class="prize-list">
      <button
        v-for="(prize, idx) in prizes"
        :key="prize.id"
        type="button"
        class="prize-item"
        :class="{
          active: selectedIdx === idx,
          'all-drawn': prize.winners.length >= prize.total,
          'flash': flashIdx === idx,
        }"
        :disabled="prize.winners.length >= prize.total"
        @click="$emit('select', idx)"
      >
        <div class="prize-head">
          <div class="prize-info">
            <span class="prize-rank">{{ prize.rank || prize.name }}</span>
            <span v-if="prize.rank" class="prize-name">{{ prize.name }}</span>
          </div>
          <span class="prize-count">{{ prize.winners.length }}/{{ prize.total }}</span>
        </div>
        <div class="prize-bar"><i :style="{ width: (prize.winners.length / prize.total * 100) + '%' }"></i></div>
      </button>
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
.progress-text {
  font-size: 0.9rem;
  color: var(--muted);
  letter-spacing: 0.06em;
}

@keyframes prize-flash {
  0%   { background: var(--accent); }
  100% { background: var(--cream); }
}
.prize-item.flash { animation: prize-flash 0.6s ease-out; }

.prize-item.all-drawn { color: var(--dim); cursor: default; }
.prize-item.all-drawn:hover { background: transparent; }
.prize-item.all-drawn .prize-bar i { background: var(--dim); }
</style>
