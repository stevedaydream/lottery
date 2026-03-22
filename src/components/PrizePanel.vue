<template>
  <div class="card">
    <div class="card-title">🏆 抽獎項目</div>
    <div class="prize-list">
      <div
        v-for="(prize, idx) in prizes"
        :key="prize.id"
        class="prize-item"
        :class="{
          active: selectedIdx === idx,
          'all-drawn': prize.winners.length >= prize.total
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
defineProps({
  prizes: { type: Array, required: true },
  selectedIdx: { type: Number, default: 0 },
})
defineEmits(['select'])
</script>

<style scoped>
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
