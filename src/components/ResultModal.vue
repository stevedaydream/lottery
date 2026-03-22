<template>
  <div class="modal-backdrop" v-if="show" @click.self="$emit('close')">
    <div class="modal-box" :class="{ multi: winners.length > 1 }">
      <div class="modal-prize-label">恭喜獲得</div>
      <div class="modal-prize-name">{{ prize }}</div>

      <!-- 單人 -->
      <template v-if="winners.length === 1">
        <div class="modal-winner-name">{{ winners[0].name }}</div>
        <div class="modal-winner-sub">恭喜 · CONGRATULATIONS</div>
      </template>

      <!-- 多人 -->
      <template v-else>
        <div class="multi-list">
          <div v-for="(w, i) in winners" :key="i" class="multi-item">
            <span class="multi-idx">{{ i + 1 }}</span>
            <span class="multi-name">{{ w.name }}</span>
          </div>
        </div>
        <div class="modal-winner-sub">恭喜以上得獎者 · CONGRATULATIONS</div>
      </template>

      <button class="modal-close-btn" @click="$emit('close')">確認</button>
    </div>
  </div>
</template>

<script setup>
defineProps({
  show:    { type: Boolean, default: false },
  prize:   { type: String,  default: '' },
  winners: { type: Array,   default: () => [] },
})
defineEmits(['close'])
</script>

<style scoped>
.multi-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 12px 0 20px;
  max-height: 300px;
  overflow-y: auto;
  padding: 0 4px;
}
.multi-item {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(255,215,0,0.06);
  border: 1px solid rgba(255,215,0,0.15);
  border-radius: 10px;
  padding: 10px 16px;
}
.multi-idx {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 1.2rem;
  color: var(--gold-dark);
  width: 24px;
  text-align: center;
  flex-shrink: 0;
}
.multi-name {
  flex: 1;
  font-size: 1.3rem;
  font-weight: 900;
  color: #fff;
  text-shadow: 0 0 20px rgba(255,215,0,0.3);
}
.multi-vip {
  font-size: 0.72rem;
  color: var(--gold-dark);
  letter-spacing: 0.1em;
}
.modal-box.multi {
  max-width: 480px;
  padding: 36px 40px;
}
</style>
