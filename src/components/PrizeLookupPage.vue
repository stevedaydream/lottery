<template>
  <div class="lookup-page">

    <!-- Header -->
    <div class="lookup-header">
      <div class="lookup-title">中獎查詢</div>
      <div class="lookup-sub">{{ lastFetched ? '每 30 秒自動更新' : '請輸入您的兌獎碼' }}</div>
    </div>

    <!-- Code input form -->
    <div v-if="!queriedCode" class="lookup-card">
      <label class="card-label" for="code-input">輸入 6 位兌獎碼</label>
      <div class="code-input-row">
        <input
          id="code-input"
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
          <div class="id-card-head">
            <span>身分核對卡</span>
            <span>請出示給工作人員</span>
          </div>
          <div class="id-card-body">
            <div>
              <div class="id-name">{{ personName }}</div>
              <div class="id-unit">{{ personUnit }}</div>
            </div>
            <div class="id-code">
              <span class="id-code-label">兌獎碼</span>
              <span class="id-code-value">{{ queriedCode }}</span>
            </div>
          </div>
        </div>

        <!-- Won prizes -->
        <template v-if="myPrizes.length > 0">
          <div class="won-header">
            <div class="won-text">恭喜中獎</div>
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
                <div v-if="item.vip" class="vip-badge">特別保送</div>
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
        <button class="refresh-btn" @click="fetchResults" :disabled="loading" aria-label="立即更新">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>
        </button>
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
/* 查詢頁採淺色底，方便現場出示 */
.lookup-page {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 28px 20px 60px;
  gap: 20px;
  background: #F6EEDF;
  color: var(--ink);
}
.lookup-page > * { width: 100%; max-width: 440px; }

/* ── Header ── */
.lookup-header { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.lookup-title {
  font-family: var(--font-display);
  font-weight: 900;
  font-size: 1.4rem;
  letter-spacing: 0.06em;
}
.lookup-sub { font-size: 0.82rem; color: #6B5A4C; }

/* ── Code input ── */
.lookup-card {
  background: #FFFFFF;
  border-radius: 20px;
  padding: 22px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.card-label { font-size: 0.82rem; color: #6B5A4C; letter-spacing: 0.2em; }
.code-input-row { display: flex; gap: 8px; }
.code-input {
  flex: 1;
  min-width: 0;
  height: 52px;
  background: #FFFFFF;
  border: 1px solid #CDBDA6;
  border-radius: 14px;
  color: var(--ink);
  font-family: var(--font-num);
  font-weight: 800;
  font-size: 1.6rem;
  letter-spacing: 0.2em;
  padding: 0 16px;
  outline: none;
  text-transform: uppercase;
  text-align: center;
}
.code-input:focus { border-color: var(--ink); }
.code-input::placeholder { color: #A8977F; font-family: var(--font-body); font-weight: 400; font-size: 1rem; letter-spacing: 0.1em; }
.query-btn {
  height: 52px;
  padding: 0 22px;
  background: var(--ink);
  border: none;
  border-radius: 14px;
  color: var(--cream);
  font-weight: 700;
  font-size: 1rem;
  cursor: pointer;
  white-space: nowrap;
}
.query-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.code-hint { font-size: 0.8rem; color: #6B5A4C; }
.input-error { font-size: 0.85rem; color: #9E2A18; }

/* ── Identity Card ── */
.identity-card {
  background: var(--ink);
  color: var(--cream);
  border-radius: 24px;
  padding: 24px 22px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.id-card-head { display: flex; justify-content: space-between; font-size: 0.82rem; color: var(--muted); letter-spacing: 0.12em; }
.id-card-body { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; }
.id-name {
  font-family: var(--font-display);
  font-size: 2.75rem;
  font-weight: 900;
  line-height: 1.1;
  overflow-wrap: anywhere;
}
.id-unit { font-size: 0.95rem; color: var(--muted); margin-top: 4px; }
.id-code { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; flex-shrink: 0; }
.id-code-label { font-size: 0.75rem; color: var(--muted); letter-spacing: 0.2em; }
.id-code-value { font-family: var(--font-num); font-weight: 800; font-size: 2.25rem; letter-spacing: 0.12em; line-height: 1; }

/* ── Won header ── */
.won-header { display: flex; justify-content: space-between; align-items: baseline; }
.won-text { font-size: 0.82rem; letter-spacing: 0.24em; color: #6B5A4C; }
.won-count { font-size: 0.82rem; color: #6B5A4C; }

/* ── Prize cards ── */
.prize-list { display: flex; flex-direction: column; gap: 10px; }
.prize-card {
  display: flex;
  align-items: center;
  gap: 14px;
  background: #FFFFFF;
  border-radius: 20px;
  padding: 18px 20px;
  animation: slide-in 0.3s ease-out both;
}
.prize-card.is-claimed { opacity: 0.7; }
@keyframes slide-in {
  from { transform: translateY(10px); opacity: 0; }
  to   { transform: translateY(0); opacity: 1; }
}
.prize-rank { font-family: var(--font-num); font-weight: 800; font-size: 1.3rem; color: #A8977F; min-width: 18px; }
.prize-info { flex: 1; min-width: 0; }
.prize-name {
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 900;
  color: #9E2A18;
  overflow-wrap: anywhere;
}
.vip-badge { font-size: 0.78rem; color: #6B5A4C; margin-top: 2px; }
.prize-claim-status { text-align: right; white-space: nowrap; }
.claimed-tag {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  font-size: 0.9rem;
  font-weight: 700;
  color: #1F6B3F;
  background: #DDEFE3;
  border-radius: 12px;
  padding: 8px 12px;
}
.claimed-time { font-size: 0.72rem; font-weight: 400; }
.unclaimed-tag {
  display: inline-block;
  font-size: 0.9rem;
  font-weight: 700;
  color: #7A3A0C;
  background: #FBE7D3;
  border-radius: 12px;
  padding: 8px 12px;
}

/* ── Status cards ── */
.status-card {
  border-radius: 20px;
  padding: 32px 20px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  background: #FFFFFF;
}
.status-loading { flex-direction: row; justify-content: center; padding: 20px; font-size: 0.95rem; color: #6B5A4C; }
.status-error { color: #9E2A18; font-size: 0.95rem; }
.wait-title { font-family: var(--font-display); font-weight: 900; font-size: 1.6rem; }
.wait-sub { font-size: 0.9rem; color: #6B5A4C; }
.retry-btn {
  height: 44px;
  padding: 0 22px;
  background: var(--ink);
  border: none;
  border-radius: 22px;
  color: var(--cream);
  font-size: 0.9rem;
  cursor: pointer;
}

/* ── Refresh bar ── */
.refresh-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 0.8rem;
  color: #6B5A4C;
}
.refresh-divider { opacity: 0.5; }
.refresh-live { display: flex; align-items: center; gap: 4px; color: #1F6B3F; }
.live-dot { width: 6px; height: 6px; border-radius: 50%; background: #1F6B3F; animation: pulse 1s ease-in-out infinite; }
.refresh-btn {
  background: none;
  border: 1px solid #CDBDA6;
  border-radius: 50%;
  color: #6B5A4C;
  width: 44px; height: 44px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.refresh-btn:disabled { opacity: 0.4; }

/* ── Search again ── */
.search-again-btn {
  height: 52px;
  background: var(--ink);
  border: none;
  border-radius: 14px;
  color: var(--cream);
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
}

/* ── Refresh overlay (non-blocking) ── */
.refresh-overlay {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 0.82rem;
  color: #6B5A4C;
}
.spinner-sm {
  width: 12px; height: 12px;
  border: 2px solid #CDBDA6;
  border-top-color: var(--ink);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}

/* ── Spinner ── */
.spinner {
  width: 18px; height: 18px;
  border: 2px solid #CDBDA6;
  border-top-color: var(--ink);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin    { to { transform: rotate(360deg); } }
@keyframes pulse   { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
</style>
