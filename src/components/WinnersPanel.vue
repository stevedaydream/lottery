<template>
  <div style="display:flex;flex-direction:column;gap:12px;min-height:0;flex:1">
    <div style="display:flex;justify-content:space-between;align-items:baseline">
      <div class="section-label">中獎名單</div>
      <div style="font-family:var(--font-num);font-weight:800;font-size:1.4rem">{{ winners.length }}</div>
    </div>
    <div v-if="winners.length === 0" style="color:var(--muted);font-size:0.95rem;padding:20px 0;">
      尚未開始抽獎
    </div>
    <div class="winners-list">
      <div class="winner-item" v-for="w in [...winners].reverse()" :key="w.id">
        <div class="winner-prize" :title="w.prize">{{ shortPrize(w.prize) }}</div>
        <div class="winner-name">{{ w.name }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  winners: { type: Array, default: () => [] },
})

// 只顯示「·」前的等第，完整名稱放在 title
const shortPrize = name => String(name ?? '').split(/\s*[·・]\s*/)[0]
</script>
