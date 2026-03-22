<template>
  <div class="card" style="flex:1">
    <div class="card-title">🎖 得獎名單</div>
    <div v-if="winners.length === 0" style="color:var(--text-muted);font-size:0.82rem;text-align:center;padding:20px 0;">
      尚未開始抽獎
    </div>
    <div class="winners-list">
      <div class="winner-item" v-for="w in [...winners].reverse()" :key="w.id">
        <div class="winner-prize">{{ w.prize }}</div>
        <div class="winner-name">{{ w.name }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  winners: { type: Array, default: () => [] },
})
</script>
