<template>
  <div id="remote-page">
    <div style="font-size:3rem;margin-bottom:12px">🎰</div>
    <div class="remote-title">手機遙控器</div>

    <!-- Prize info from main display -->
    <div v-if="remoteState" class="remote-prize-info">
      <div class="prize-name">{{ remoteState.prize }}</div>
      <div class="prize-remaining">
        <span v-if="remoteState.remaining > 0">剩餘 <b>{{ remoteState.remaining }}</b> 個名額</span>
        <span v-else class="all-drawn">全數抽出</span>
      </div>
    </div>
    <div v-else class="remote-prize-info remote-prize-placeholder">
      等待主畫面同步...
    </div>

    <!-- Draw count control -->
    <div class="draw-count-ctrl">
      <button class="count-btn" @click="drawCount = Math.max(1, drawCount - 1)">－</button>
      <span class="count-display">{{ drawCount }}</span>
      <button class="count-btn" @click="drawCount = Math.min(maxCount, drawCount + 1)">＋</button>
      <span class="count-label-sm">位</span>
    </div>
    <div class="count-presets">
      <button v-for="n in [3,5,10]" :key="n"
        class="preset-btn"
        :class="{ active: drawCount === n }"
        :disabled="n > maxCount"
        @click="drawCount = n">
        {{ n }}
      </button>
    </div>

    <button class="big-red-btn" @pointerdown="triggerDraw" :disabled="!remoteConnected || !canRemoteDraw">
      <span>抽獎</span>
    </button>

    <div class="remote-status">
      <div class="status-dot" :class="remoteConnected ? 'connected' : remoteError ? 'error' : 'waiting'"></div>
      <span :class="remoteConnected ? 'remote-connected' : remoteError ? 'remote-error' : ''">
        {{ remoteConnected ? '已連線至主機' : remoteError || '連線中...' }}
      </span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRemotePeer } from '../composables/usePeer'

const props = defineProps({
  targetId: { type: String, required: true }
})

const { remoteConnected, remoteError, remoteState, init, sendDraw, destroy } = useRemotePeer(props.targetId)

const drawCount = ref(1)

const maxCount = computed(() => {
  const rem = remoteState.value?.remaining ?? 99
  return Math.max(1, rem)
})

const canRemoteDraw = computed(() => {
  if (!remoteState.value) return true // optimistic before first sync
  return remoteState.value.remaining > 0
})

function triggerDraw() {
  sendDraw(drawCount.value)
}

onMounted(init)
onUnmounted(destroy)
</script>

<style scoped>
#remote-page {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 20px;
  gap: 16px;
  background: var(--bg-dark, #0d0d14);
}

.remote-title {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 1.6rem;
  letter-spacing: 0.2em;
  color: var(--gold, #ffd700);
}

.remote-prize-info {
  background: rgba(255, 215, 0, 0.06);
  border: 1px solid rgba(255, 215, 0, 0.15);
  border-radius: 12px;
  padding: 12px 24px;
  text-align: center;
  min-width: 220px;
}
.remote-prize-placeholder {
  color: rgba(255,255,255,0.3);
  font-size: 0.82rem;
}
.prize-name {
  font-family: 'Noto Serif TC', serif;
  font-size: 1.1rem;
  color: var(--gold, #ffd700);
  font-weight: 700;
  margin-bottom: 4px;
}
.prize-remaining {
  font-size: 0.82rem;
  color: rgba(255,255,255,0.6);
}
.prize-remaining b { color: var(--gold, #ffd700); }
.all-drawn {
  color: rgba(255,255,255,0.3);
}

/* Draw count control */
.draw-count-ctrl {
  display: flex;
  align-items: center;
  gap: 10px;
}
.count-label-sm {
  font-size: 0.85rem;
  color: rgba(255,255,255,0.5);
}
.count-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid rgba(255, 215, 0, 0.25);
  background: rgba(255, 215, 0, 0.06);
  color: var(--gold, #ffd700);
  font-size: 1.2rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.count-btn:active { background: rgba(255, 215, 0, 0.18); }
.count-display {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 2rem;
  color: var(--gold, #ffd700);
  min-width: 40px;
  text-align: center;
}
.count-presets {
  display: flex;
  gap: 8px;
}
.preset-btn {
  padding: 6px 16px;
  border-radius: 8px;
  border: 1px solid rgba(255, 215, 0, 0.2);
  background: transparent;
  color: rgba(255,255,255,0.5);
  font-family: 'Noto Serif TC', serif;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.15s;
}
.preset-btn.active {
  background: rgba(255, 215, 0, 0.12);
  border-color: var(--gold, #ffd700);
  color: var(--gold, #ffd700);
  font-weight: 700;
}
.preset-btn:disabled { opacity: 0.2; cursor: not-allowed; }

/* Big draw button */
.big-red-btn {
  width: 180px;
  height: 180px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #ff5252, #c62828);
  border: 4px solid #ff8a80;
  box-shadow: 0 0 32px rgba(255, 80, 80, 0.5), inset 0 2px 8px rgba(255,255,255,0.15);
  color: #fff;
  font-family: 'Bebas Neue', sans-serif;
  font-size: 2rem;
  letter-spacing: 0.2em;
  cursor: pointer;
  transition: transform 0.1s, box-shadow 0.1s;
  margin: 8px 0;
}
.big-red-btn:active:not(:disabled) {
  transform: scale(0.95);
  box-shadow: 0 0 16px rgba(255, 80, 80, 0.4);
}
.big-red-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Status */
.remote-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.82rem;
  color: rgba(255,255,255,0.5);
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.status-dot.connected { background: #4caf50; box-shadow: 0 0 6px #4caf50; }
.status-dot.error     { background: #f44336; }
.status-dot.waiting   { background: #ff9800; animation: pulse 1s ease-in-out infinite; }

.remote-connected { color: #4caf50; }
.remote-error     { color: #f44336; }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}
</style>
