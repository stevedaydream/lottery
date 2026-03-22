<template>
  <div class="lookup-page">

    <!-- Header -->
    <div class="lookup-header">
      <div class="lookup-icon">🎫</div>
      <div class="lookup-title">中獎查詢</div>
      <div class="lookup-sub">PRIZE LOOKUP · 請輸入您的兌獎碼</div>
    </div>

    <!-- Code input form -->
    <div v-if="!queriedCode" class="lookup-card">
      <div class="card-label">輸入 6 位兌獎碼</div>
      <div class="code-input-row">
        <input
          v-model="inputCode"
          class="code-input"
          type="text"
          placeholder="例：A3K9QZ"
          maxlength="6"
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
          @input="inputCode = inputCode.toUpperCase().replace(/[^A-Z0-9]/g, '')"
          @keydown.enter="submitQuery"
          autofocus
        />
        <button class="query-btn" @click="submitQuery" :disabled="inputCode.length < 6">
          查詢
        </button>
      </div>
      <div class="code-hint">兌獎碼於報名完成後顯示，共 6 個英數字</div>
      <div v-if="inputError" class="input-error">{{ inputError }}</div>
    </div>

    <!-- Results -->
    <template v-else>

      <!-- 首次載入 Loading（尚無舊資料時才全屏顯示） -->
      <div v-if="loading && !lastFetched" class="status-card status-loading">
        <div class="spinner"></div>
        <span>查詢中...</span>
      </div>

      <!-- Error -->
      <div v-else-if="fetchError && !lastFetched" class="status-card status-error">
        <div class="status-icon">⚠️</div>
        <div>{{ fetchError }}</div>
        <button class="retry-btn" @click="fetchResults">重試</button>
      </div>

      <!-- Results loaded（含刷新中 overlay） -->
      <template v-else-if="lastFetched">
        <!-- 刷新中輕量 overlay，不蓋掉舊資料 #15 -->
        <div v-if="loading" class="refresh-overlay">
          <div class="spinner-sm"></div> 更新中...
        </div>

        <!-- ── Identity Card (for showing to staff) ── -->
        <div class="identity-card">
          <div class="id-card-label">身分核對卡 · 請出示給工作人員</div>
          <div class="id-name">{{ personName }}</div>
          <div class="id-unit">{{ personUnit }}</div>
          <div class="id-code">兌獎碼 {{ queriedCode }}</div>
        </div>

        <!-- Won prizes -->
        <template v-if="myPrizes.length > 0">
          <div class="won-header">
            <div class="won-icon">🏆</div>
            <div class="won-text">恭喜中獎！</div>
            <div class="won-count">共 {{ myPrizes.length }} 個獎項</div>
          </div>

          <div class="prize-list">
            <div
              v-for="(item, i) in myPrizes"
              :key="i"
              class="prize-card"
              :class="{ 'is-claimed': item.claimed, 'is-vip': item.vip }"
            >
              <div class="prize-rank">{{ i + 1 }}</div>
              <div class="prize-info">
                <div class="prize-name">{{ item.prize }}</div>
                <div v-if="item.vip" class="vip-badge">⭐ 特別保送</div>
              </div>
              <div class="prize-claim-status">
                <span v-if="item.claimed" class="claimed-tag">
                  ✓ 已兌獎
                  <span v-if="item.claimedAt" class="claimed-time">
                    {{ formatTime(item.claimedAt) }}
                  </span>
                </span>
                <span v-else class="unclaimed-tag">待兌獎</span>
              </div>
            </div>
          </div>
        </template>

        <!-- Not yet won -->
        <div v-else class="status-card status-waiting">
          <div class="wait-icon">🎰</div>
          <div class="wait-title">尚未中獎</div>
          <div class="wait-sub">抽獎進行中，敬請期待！</div>
        </div>

      </template>

      <!-- Refresh bar -->
      <div v-if="lastFetched && !fetchError" class="refresh-bar">
        <span class="refresh-time">{{ lastFetchedStr }} 更新</span>
        <span class="refresh-divider">·</span>
        <span v-if="!loading" class="refresh-countdown">{{ countdown }}s 後自動刷新</span>
        <span v-else class="refresh-live">
          <span class="live-dot"></span>更新中
        </span>
        <button class="refresh-btn" @click="fetchResults" :disabled="loading">↻</button>
      </div>

      <!-- Search another code -->
      <button class="search-again-btn" @click="resetQuery">查詢其他兌獎碼</button>
    </template>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const GAS_URL = import.meta.env.VITE_GAS_URL

// ── State ──
const queriedCode = ref('')
const inputCode   = ref('')
const inputError  = ref('')
const loading     = ref(false)
const fetchError  = ref('')
const personName  = ref('')
const personUnit  = ref('')
const myPrizes    = ref([])  // [{ prize, vip, claimed, claimedAt }]
const lastFetched = ref(null)
const countdown   = ref(30)
let   countTimer  = null

// ── Init: check URL param ──
onMounted(() => {
  const params = new URLSearchParams(window.location.search)
  const codeFromUrl = (params.get('check') || '').trim().toUpperCase()
  if (codeFromUrl.length === 6) {
    queriedCode.value = codeFromUrl
    fetchResults()
  }
})

onUnmounted(() => {
  clearInterval(countTimer)
})

// ── Computed ──
const lastFetchedStr = computed(() => {
  if (!lastFetched.value) return ''
  return lastFetched.value.toLocaleTimeString('zh-TW', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
})

// ── Actions ──
function submitQuery() {
  const code = inputCode.value.trim().toUpperCase()
  if (code.length !== 6) {
    inputError.value = '兌獎碼為 6 個英數字，請重新確認'
    return
  }
  inputError.value  = ''
  queriedCode.value = code
  fetchResults()
}

function resetQuery() {
  queriedCode.value = ''
  inputCode.value   = ''
  inputError.value  = ''
  personName.value  = ''
  personUnit.value  = ''
  myPrizes.value    = []
  lastFetched.value = null
  fetchError.value  = ''
  clearInterval(countTimer)
}

async function fetchResults() {
  if (!GAS_URL) {
    fetchError.value = '查詢服務未設定，請聯絡管理員'
    return
  }
  loading.value    = true
  fetchError.value = ''
  clearInterval(countTimer)

  try {
    const res  = await fetch(`${GAS_URL}?action=check&code=${encodeURIComponent(queriedCode.value)}`)
    const json = await res.json()
    if (json.ok) {
      personName.value = json.name  || ''
      personUnit.value = json.unit  || ''
      myPrizes.value   = json.prizes || []
    } else {
      fetchError.value = json.error || '查詢失敗，請重試'
    }
  } catch {
    fetchError.value = '無法連線，請確認網路狀態後重試'
  }

  loading.value     = false
  lastFetched.value = new Date()
  startCountdown()
}

function startCountdown() {
  countdown.value = 30
  clearInterval(countTimer)
  countTimer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      clearInterval(countTimer)
      fetchResults()
    }
  }, 1000)
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}
</script>

<style scoped>
.lookup-page {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 20px 60px;
  gap: 20px;
  background: var(--bg-dark, #0d0d14);
}

/* ── Header ── */
.lookup-header { text-align: center; }
.lookup-icon { font-size: 2.8rem; margin-bottom: 8px; }
.lookup-title {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 1.8rem;
  letter-spacing: 0.2em;
  background: linear-gradient(135deg, #b8860b, #ffd700);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.lookup-sub {
  font-size: 0.72rem;
  color: rgba(255,255,255,0.25);
  letter-spacing: 0.18em;
  margin-top: 4px;
}

/* ── Code input ── */
.lookup-card {
  width: 100%;
  max-width: 400px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,215,0,0.15);
  border-radius: 16px;
  padding: 24px 20px;
}
.card-label {
  font-size: 0.82rem;
  color: rgba(255,255,255,0.4);
  letter-spacing: 0.08em;
  margin-bottom: 14px;
  text-align: center;
}
.code-input-row {
  display: flex;
  gap: 10px;
}
.code-input {
  flex: 1;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,215,0,0.2);
  border-radius: 10px;
  color: #ffd700;
  font-family: 'Courier New', monospace;
  font-size: 1.4rem;
  font-weight: 700;
  letter-spacing: 0.25em;
  padding: 12px 14px;
  outline: none;
  text-transform: uppercase;
  transition: border-color 0.2s;
  text-align: center;
}
.code-input:focus { border-color: rgba(255,215,0,0.5); }
.code-input::placeholder { color: rgba(255,255,255,0.15); font-size: 1rem; letter-spacing: 0.1em; }
.query-btn {
  padding: 12px 20px;
  background: linear-gradient(135deg, #b8860b, #ffd700);
  border: none;
  border-radius: 10px;
  color: #000;
  font-family: 'Noto Serif TC', serif;
  font-weight: 700;
  font-size: 0.95rem;
  cursor: pointer;
  white-space: nowrap;
  transition: opacity 0.15s;
}
.query-btn:hover:not(:disabled) { opacity: 0.85; }
.query-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.code-hint {
  font-size: 0.72rem;
  color: rgba(255,255,255,0.2);
  text-align: center;
  margin-top: 10px;
}
.input-error {
  font-size: 0.8rem;
  color: #ff6b6b;
  text-align: center;
  margin-top: 8px;
}

/* ── Identity Card ── */
.identity-card {
  width: 100%;
  max-width: 400px;
  background: linear-gradient(145deg, rgba(184,134,11,0.12), rgba(255,215,0,0.06));
  border: 2px solid rgba(255,215,0,0.35);
  border-radius: 18px;
  padding: 24px 20px;
  text-align: center;
  position: relative;
  overflow: hidden;
}
.identity-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; height: 3px;
  background: linear-gradient(90deg, transparent, #b8860b, #ffd700, #b8860b, transparent);
}
.id-card-label {
  font-size: 0.7rem;
  color: rgba(255,215,0,0.45);
  letter-spacing: 0.12em;
  margin-bottom: 14px;
  text-transform: uppercase;
}
.id-name {
  font-family: 'Noto Serif TC', serif;
  font-size: 2.6rem;
  font-weight: 900;
  color: #ffd700;
  letter-spacing: 0.15em;
  line-height: 1;
  margin-bottom: 8px;
}
.id-unit {
  font-size: 1rem;
  color: rgba(255,255,255,0.5);
  letter-spacing: 0.2em;
  margin-bottom: 14px;
}
.id-code {
  display: inline-block;
  font-family: 'Courier New', monospace;
  font-size: 0.9rem;
  letter-spacing: 0.2em;
  color: rgba(255,215,0,0.5);
  background: rgba(0,0,0,0.3);
  border: 1px solid rgba(255,215,0,0.15);
  border-radius: 6px;
  padding: 4px 12px;
}

/* ── Won header ── */
.won-header { text-align: center; }
.won-icon {
  font-size: 3rem;
  animation: trophy-bounce 0.6s ease-out;
}
.won-text {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 1.8rem;
  letter-spacing: 0.2em;
  background: linear-gradient(135deg, #b8860b, #ffd700, #fffacd, #ffd700);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.won-count {
  font-size: 0.75rem;
  color: rgba(255,255,255,0.3);
  letter-spacing: 0.1em;
  margin-top: 2px;
}
@keyframes trophy-bounce {
  0%   { transform: scale(0.5) rotate(-10deg); opacity: 0; }
  60%  { transform: scale(1.15) rotate(3deg); }
  100% { transform: scale(1) rotate(0); opacity: 1; }
}

/* ── Prize cards ── */
.prize-list {
  width: 100%;
  max-width: 400px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.prize-card {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(255,215,0,0.06);
  border: 1px solid rgba(255,215,0,0.2);
  border-radius: 14px;
  padding: 14px 16px;
  animation: slide-in 0.3s ease-out both;
  transition: opacity 0.2s;
}
.prize-card.is-claimed {
  opacity: 0.55;
  background: rgba(255,255,255,0.03);
  border-color: rgba(255,255,255,0.08);
}
.prize-card.is-vip {
  border-color: rgba(255,215,0,0.4);
  background: rgba(255,215,0,0.08);
}
@keyframes slide-in {
  from { transform: translateY(10px); opacity: 0; }
  to   { transform: translateY(0); opacity: 1; }
}
.prize-rank {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 1.2rem;
  color: rgba(255,255,255,0.2);
  min-width: 18px;
}
.prize-info { flex: 1; }
.prize-name {
  font-family: 'Noto Serif TC', serif;
  font-size: 1.05rem;
  font-weight: 700;
  color: #ffd700;
}
.vip-badge {
  font-size: 0.7rem;
  color: rgba(255,215,0,0.55);
  margin-top: 2px;
}
.prize-claim-status { text-align: right; white-space: nowrap; }
.claimed-tag {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  font-size: 0.9rem;
  font-weight: 700;
  color: #4caf50;
}
.claimed-time {
  font-size: 0.68rem;
  color: rgba(255,255,255,0.25);
}
.unclaimed-tag {
  font-size: 0.9rem;
  font-weight: 700;
  color: #ff9800;
  border: 1px solid rgba(255,152,0,0.4);
  border-radius: 8px;
  padding: 5px 12px;
  background: rgba(255,152,0,0.08);
}

/* ── Status cards ── */
.status-card {
  width: 100%;
  max-width: 400px;
  border-radius: 16px;
  padding: 32px 20px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.status-loading {
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.4);
  flex-direction: row;
  justify-content: center;
  gap: 10px;
  padding: 20px;
  font-size: 0.9rem;
}
.status-error {
  background: rgba(200,0,0,0.08);
  border: 1px solid rgba(200,0,0,0.2);
  color: #ff6b6b;
  font-size: 0.9rem;
}
.status-waiting {
  background: rgba(255,215,0,0.04);
  border: 1px solid rgba(255,215,0,0.1);
}
.status-icon { font-size: 2rem; }
.wait-icon { font-size: 3rem; }
.wait-title {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 1.6rem;
  letter-spacing: 0.15em;
  color: rgba(255,255,255,0.5);
}
.wait-sub {
  font-size: 0.82rem;
  color: rgba(255,255,255,0.25);
}
.retry-btn {
  padding: 8px 20px;
  background: rgba(255,107,107,0.12);
  border: 1px solid rgba(255,107,107,0.3);
  border-radius: 8px;
  color: #ff6b6b;
  font-family: 'Noto Serif TC', serif;
  font-size: 0.85rem;
  cursor: pointer;
  margin-top: 4px;
}

/* ── Refresh bar ── */
.refresh-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.72rem;
  color: rgba(255,255,255,0.22);
}
.refresh-divider { opacity: 0.4; }
.refresh-live {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #4caf50;
}
.live-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: #4caf50;
  animation: pulse 1s ease-in-out infinite;
}
.refresh-btn {
  background: none;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 6px;
  color: rgba(255,255,255,0.25);
  font-size: 0.85rem;
  width: 24px; height: 24px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.refresh-btn:hover:not(:disabled) { border-color: rgba(255,215,0,0.3); color: rgba(255,215,0,0.5); }
.refresh-btn:disabled { opacity: 0.3; }

/* ── Search again ── */
.search-again-btn {
  background: none;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px;
  color: rgba(255,255,255,0.22);
  font-family: 'Noto Serif TC', serif;
  font-size: 0.8rem;
  padding: 8px 20px;
  cursor: pointer;
  letter-spacing: 0.05em;
  transition: all 0.2s;
}
.search-again-btn:hover { border-color: rgba(255,255,255,0.2); color: rgba(255,255,255,0.4); }

/* ── Refresh overlay (non-blocking) ── */
.refresh-overlay {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.78rem;
  color: rgba(255,215,0,0.5);
  background: rgba(0,0,0,0.4);
  border: 1px solid rgba(255,215,0,0.12);
  border-radius: 20px;
  padding: 6px 16px;
}
.spinner-sm {
  width: 12px; height: 12px;
  border: 2px solid rgba(255,215,0,0.2);
  border-top-color: rgba(255,215,0,0.6);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}

/* ── Spinner ── */
.spinner {
  width: 18px; height: 18px;
  border: 2px solid rgba(255,255,255,0.1);
  border-top-color: rgba(255,215,0,0.5);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin    { to { transform: rotate(360deg); } }
@keyframes pulse   { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
</style>
