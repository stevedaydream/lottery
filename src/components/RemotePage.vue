<template>
  <div id="remote-page">
    <div class="remote-top">
      <div class="remote-title">遙控器</div>
      <div class="remote-status">
        <div class="status-dot" :class="remoteConnected ? 'connected' : remoteError ? 'error' : 'waiting'"></div>
        <span :class="remoteError && !remoteConnected ? 'remote-error' : ''">
          {{ remoteConnected ? '已連線主畫面' : remoteError || '連線中...' }}
        </span>
        <span v-if="!remoteConnected && reconnectCountdown > 0" class="reconnect-hint">
          · {{ reconnectCountdown }}s 後重試
        </span>
      </div>
    </div>

    <!-- Prize info from main display -->
    <div v-if="remoteState" class="remote-prize-info">
      <div class="prize-label">目前獎項</div>
      <div class="prize-row">
        <div class="prize-name">{{ remoteState.prize }}</div>
        <div class="prize-remaining">
          <template v-if="remoteState.remaining > 0">尚餘 <b>{{ remoteState.remaining }}</b> 名</template>
          <span v-else class="all-drawn">全數抽出</span>
        </div>
      </div>
    </div>
    <div v-else class="remote-prize-info remote-prize-placeholder">
      等待主畫面同步...
    </div>

    <!-- Draw count control -->
    <div class="count-block">
      <div class="prize-label">抽出人數</div>
      <div class="draw-count-ctrl">
        <button class="count-btn" aria-label="減少一位" @click="drawCount = Math.max(1, drawCount - 1)" :disabled="remoteIsSpinning">−</button>
        <div><span class="count-display">{{ drawCount }}</span><span class="count-label-sm">位</span></div>
        <button class="count-btn" aria-label="增加一位" @click="drawCount = Math.min(maxCount, drawCount + 1)" :disabled="remoteIsSpinning">+</button>
      </div>
      <div class="count-presets">
        <button v-for="n in [3,5,10]" :key="n"
          class="preset-btn"
          :class="{ active: drawCount === n }"
          :disabled="n > maxCount || remoteIsSpinning"
          @click="drawCount = n">
          {{ n }} 位
        </button>
      </div>
    </div>

    <!-- Big draw button: show spinning state #19 -->
    <div class="btn-area">
      <button class="big-red-btn"
        :class="{ spinning: remoteIsSpinning }"
        @pointerdown="triggerDraw"
        :disabled="!remoteConnected || !canRemoteDraw || remoteIsSpinning">
        <template v-if="remoteIsSpinning">
          <span class="btn-spinner"></span>
          <span class="btn-sub">請看大螢幕</span>
        </template>
        <template v-else>
          <span>開抽</span>
          <span class="btn-sub">抽出 {{ drawCount }} 位</span>
        </template>
      </button>
    </div>

    <div class="remote-foot">斷線時將自動重新連線</div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRemotePeer } from '../composables/usePeer'

const props = defineProps({
  targetId: { type: String, required: true }
})

const { remoteConnected, remoteError, remoteState, remoteIsSpinning, reconnectCountdown, init, sendDraw, destroy } = useRemotePeer(props.targetId)

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
  if (remoteIsSpinning.value) return
  sendDraw(drawCount.value)
}

onMounted(init)
onUnmounted(destroy)
</script>

<style scoped>
#remote-page {
  min-height: 100dvh;
  max-width: 480px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  padding: 28px 24px 32px;
  gap: 24px;
  background: var(--ink);
}

.remote-top { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.remote-title { font-size: 0.95rem; letter-spacing: 0.24em; color: var(--muted); }

.remote-prize-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 20px;
  border-radius: 20px;
  background: var(--surface);
}
.remote-prize-placeholder { color: var(--muted); font-size: 0.95rem; }
.prize-label { font-size: 0.875rem; letter-spacing: 0.2em; color: var(--muted); }
.remote-prize-info .prize-label { color: var(--accent); }
.prize-row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.prize-name {
  font-family: var(--font-display);
  font-weight: 900;
  font-size: 2.2rem;
  overflow-wrap: anywhere;
}
.prize-remaining { font-size: 0.95rem; color: var(--muted); white-space: nowrap; }
.prize-remaining b { font-family: var(--font-num); font-weight: 800; font-size: 1.75rem; color: var(--cream); }
.all-drawn { color: var(--muted); }

/* Draw count control */
.count-block { display: flex; flex-direction: column; gap: 14px; }
.draw-count-ctrl { display: flex; align-items: center; justify-content: space-between; }
.count-label-sm { font-size: 1rem; color: var(--muted); margin-left: 6px; }
.count-btn {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: 1px solid var(--line-strong);
  background: transparent;
  color: var(--cream);
  font-size: 1.75rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.count-btn:active:not(:disabled) { background: var(--surface); }
.count-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.count-display {
  font-family: var(--font-num);
  font-weight: 800;
  font-size: 4.5rem;
  line-height: 1;
}
.count-presets { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.preset-btn {
  height: 44px;
  border-radius: 22px;
  border: 1px solid var(--line-strong);
  background: transparent;
  color: var(--cream);
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
}
.preset-btn.active { background: var(--cream); border-color: var(--cream); color: var(--ink); }
.preset-btn:disabled { opacity: 0.25; cursor: not-allowed; }

/* Big draw button */
.btn-area { flex: 1; display: flex; align-items: center; justify-content: center; min-height: 240px; }
.big-red-btn {
  width: 220px;
  height: 220px;
  border-radius: 50%;
  background: var(--accent);
  border: 10px solid rgba(232,69,44,0.25);
  background-clip: padding-box;
  color: var(--cream-hi);
  font-family: var(--font-display);
  font-weight: 900;
  font-size: 2.5rem;
  letter-spacing: 0.12em;
  cursor: pointer;
  transition: transform 0.1s, background 0.2s, opacity 0.2s;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  touch-action: manipulation;
}
.btn-sub { font-family: var(--font-body); font-weight: 500; font-size: 0.875rem; letter-spacing: 0.2em; opacity: 0.85; }
.big-red-btn:active:not(:disabled) { transform: scale(0.96); }
.big-red-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.big-red-btn.spinning {
  opacity: 1;
  background: var(--maroon);
  border-color: var(--line);
  font-size: 1.5rem;
}

/* Spinner inside button */
.btn-spinner {
  width: 36px;
  height: 36px;
  border: 4px solid rgba(255,246,234,0.2);
  border-top-color: var(--cream-hi);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Status */
.remote-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.875rem;
  color: var(--muted);
  flex-wrap: wrap;
  justify-content: flex-end;
}
.reconnect-hint { color: #E0A040; }
.remote-foot { text-align: center; font-size: 0.8rem; color: var(--muted); }
</style>
