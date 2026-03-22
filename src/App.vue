<template>
  <!-- Remote Controller Page -->
  <RemotePage v-if="isRemotePage" :target-id="remoteTargetId" />

  <!-- Admin Page -->
  <AdminPage v-else-if="isAdminPage" />

  <!-- VIP Page（隱藏路由，需手動輸入 ?vip） -->
  <VIPPage v-else-if="isVIPPage" />

  <!-- Prize Lookup Page（中獎查詢，報名後提供連結） -->
  <PrizeLookupPage v-else-if="isCheckPage" />

  <!-- Main Display Page -->
  <template v-else>
    <div class="header">
      <div class="header-title">🎊 {{ eventTitle }} 🎊</div>
      <div class="header-sub">ANNUAL LUCKY DRAW · {{ new Date().getFullYear() }}</div>
      <div class="header-deco">
        <span></span><i>✦</i><span></span>
      </div>
      <!-- Admin entry button (discreet, top-right) -->
      <button class="admin-entry-btn" @click="showAdminQr = !showAdminQr" title="管理員入口">⚙</button>

      <!-- Admin QR Modal -->
      <div v-if="showAdminQr" class="admin-qr-backdrop" @click.self="showAdminQr = false">
        <div class="admin-qr-card">
          <div class="admin-qr-title">管理員入口</div>
          <img :src="adminQrUrl" alt="Admin QR" class="admin-qr-img" />
          <div class="admin-qr-sub">使用授權帳號掃描登入</div>
          <a class="admin-qr-link" :href="adminPageUrl" target="_blank">直接開啟管理頁面 ↗</a>
          <button class="admin-qr-close" @click="showAdminQr = false">關閉</button>
        </div>
      </div>
    </div>

    <div class="main-layout">
      <!-- LEFT: Prizes + Participants -->
      <div style="display:flex;flex-direction:column;gap:16px;">
        <PrizePanel
          :prizes="prizes"
          :selected-idx="selectedPrizeIdx"
          @select="selectedPrizeIdx = $event"
        />
        <ParticipantsPanel
          v-model="participantsRaw"
          :count="participantList.length"
        />
      </div>

      <!-- CENTER: Canvas + Button -->
      <div style="display:flex;flex-direction:column;gap:16px;">
        <PhysicsCanvas
          ref="physicsCanvasRef"
          :participants="participantList"
          :is-spinning="isSpinning"
          :countdown="countdown"
          :current-prize="currentPrize"
        />

        <div class="draw-btn-wrap">
          <button
            class="draw-btn"
            @click="startDraw"
            :disabled="isSpinning || !canDraw"
          >
            <div class="btn-shine"></div>
            {{ isSpinning ? '攪拌中...' : '開始抽獎' }}
          </button>
          <div class="draw-count-ctrl">
            <span class="count-label-sm">抽出</span>
            <button class="count-btn" @click="drawCount = Math.max(1, drawCount - 1)" :disabled="isSpinning">－</button>
            <span class="count-display">{{ drawCount }}</span>
            <button class="count-btn" @click="drawCount = Math.min(remainingSlots, drawCount + 1)" :disabled="isSpinning">＋</button>
            <span class="count-label-sm">位</span>
            <div class="count-presets">
              <button v-for="n in [3,5,10]" :key="n"
                class="preset-btn"
                :class="{ active: drawCount === n }"
                :disabled="isSpinning || n > remainingSlots"
                @click="drawCount = n">
                {{ n }}
              </button>
            </div>
          </div>
        </div>

        <div style="text-align:center;font-size:0.78rem;color:var(--text-muted);letter-spacing:0.1em;">
          {{ canDraw ? `點擊按鈕或使用手機遙控 · 當前獎項：${currentPrize?.name ?? '-'}` : '請確認有獎項且有參與者' }}
        </div>
      </div>

      <!-- RIGHT: Winners -->
      <div style="display:flex;flex-direction:column;gap:16px;" class="panel-right">
        <WinnersPanel :winners="allWinners" @clear="clearWinners" />
      </div>
    </div>

    <ResultModal
      :show="showResult"
      :prize="resultPrize"
      :winners="resultWinners"
      @close="showResult = false"
    />

    <PrizeModal
      :show="showPrizeModal"
      :is-editing="editingPrizeIdx !== null"
      :initial="prizeForm"
      @close="showPrizeModal = false"
      @save="savePrize"
      @delete="deletePrize"
    />
  </template>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import confetti from 'canvas-confetti'
import RemotePage from './components/RemotePage.vue'
import AdminPage from './components/AdminPage.vue'
import VIPPage from './components/VIPPage.vue'
import PrizeLookupPage from './components/PrizeLookupPage.vue'
import PhysicsCanvas from './components/PhysicsCanvas.vue'
import PrizePanel from './components/PrizePanel.vue'
import ParticipantsPanel from './components/ParticipantsPanel.vue'
import WinnersPanel from './components/WinnersPanel.vue'
import ResultModal from './components/ResultModal.vue'
import PrizeModal from './components/PrizeModal.vue'
import { useHostPeer } from './composables/usePeer'
import { useSharedState } from './composables/useSharedState'
import { useGASSync } from './composables/useGASSync'

// ── Page routing ──
const urlParams = new URLSearchParams(window.location.search)
const isRemotePage = urlParams.has('remote')
const isAdminPage  = urlParams.has('admin')
const isVIPPage    = urlParams.has('vip')
const isCheckPage  = urlParams.has('check')
const remoteTargetId = urlParams.get('remote') || ''

// ── Shared persistent state ──
const sharedState = useSharedState()
const { participantsRaw, prizes, allWinners, vipGuarantee, vipExclude, eventTitle } = sharedState

// GAS sync (only on main display)
if (!isRemotePage && !isAdminPage && !isVIPPage && !isCheckPage) useGASSync(sharedState)

const participantList = computed(() =>
  participantsRaw.value.split('\n').map(s => s.trim()).filter(Boolean)
)

// ── Prize selection ──
const selectedPrizeIdx = ref(0)
const currentPrize = computed(() => prizes.value[selectedPrizeIdx.value] || null)

// Keep selectedPrizeIdx in bounds when prizes change from admin
watch(prizes, () => {
  if (selectedPrizeIdx.value >= prizes.value.length) {
    selectedPrizeIdx.value = Math.max(0, prizes.value.length - 1)
  }
}, { deep: true })

// Sync prize selection state to remote controller
watch([selectedPrizeIdx, prizes], () => {
  if (currentPrize.value) {
    pushState({ prize: currentPrize.value.name, remaining: remainingSlots.value })
  }
}, { deep: true })

// ── Draw state ──
const isSpinning   = ref(false)
const countdown    = ref(0)
const showResult   = ref(false)
const resultWinners = ref([])
const resultPrize  = ref('')
let winnerIdCounter = allWinners.value.length

const remainingSlots = computed(() => {
  if (!currentPrize.value) return 0
  return currentPrize.value.total - currentPrize.value.winners.length
})
const drawCount = ref(1)

const canDraw = computed(() => {
  if (!currentPrize.value) return false
  if (currentPrize.value.winners.length >= currentPrize.value.total) return false
  return participantList.value.length > 0
})

// ── Prize Modal (main screen quick-add, still available) ──
const showPrizeModal  = ref(false)
const editingPrizeIdx = ref(null)
const prizeForm       = ref({ name: '', total: 1, rank: '' })

function openAddPrize() {
  editingPrizeIdx.value = null
  prizeForm.value = { name: '', total: 1, rank: '' }
  showPrizeModal.value = true
}
function openEditPrize(idx) {
  editingPrizeIdx.value = idx
  const p = prizes.value[idx]
  prizeForm.value = { name: p.name, total: p.total, rank: p.rank || '' }
  showPrizeModal.value = true
}
function savePrize(form) {
  if (!form.name.trim()) return
  if (editingPrizeIdx.value === null) {
    prizes.value.push({ id: Date.now(), name: form.name, total: form.total, winners: [], rank: form.rank })
  } else {
    const p = prizes.value[editingPrizeIdx.value]
    p.name = form.name; p.total = form.total; p.rank = form.rank
  }
  showPrizeModal.value = false
}
function deletePrize() {
  prizes.value.splice(editingPrizeIdx.value, 1)
  if (selectedPrizeIdx.value >= prizes.value.length)
    selectedPrizeIdx.value = Math.max(0, prizes.value.length - 1)
  showPrizeModal.value = false
}
function clearWinners() {
  allWinners.value = []
  prizes.value.forEach(p => { p.winners = [] })
}

// ── Physics Canvas ──
const physicsCanvasRef = ref(null)

// ── Draw Logic ──
function pickWinner() {
  const prize = currentPrize.value
  if (!prize) return null
  const alreadyWon = new Set(allWinners.value.map(w => w.name))

  // 格式：「姓名」或「姓名, 獎項名稱」
  const guaranteeList = vipGuarantee.value
    .split('\n')
    .map(s => {
      const [name, prizeName = ''] = s.split(',').map(p => p.trim())
      return { name, prizeName }
    })
    .filter(g => g.name)

  const excludeList = vipExclude.value.split('\n').map(s => s.trim()).filter(Boolean)

  for (const g of guaranteeList) {
    // 無指定獎項 = 任何獎項皆適用；有指定則比對當前獎項名稱
    const prizeMatch = !g.prizeName || prize.name.includes(g.prizeName) || g.prizeName.includes(prize.name)
    if (prizeMatch && !alreadyWon.has(g.name) && participantList.value.includes(g.name))
      return { name: g.name, isVip: true }
  }

  let pool = participantList.value.filter(n => !alreadyWon.has(n) && !excludeList.includes(n))
  if (pool.length === 0) pool = participantList.value.filter(n => !alreadyWon.has(n))
  if (pool.length === 0) return null

  return { name: pool[Math.floor(Math.random() * pool.length)], isVip: false }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function startDraw() {
  if (isSpinning.value || !canDraw.value) return
  isSpinning.value = true

  const count = Math.min(drawCount.value, remainingSlots.value)

  // ── 倒數 ──
  physicsCanvasRef.value?.setSwirl(1)
  for (let i = 5; i >= 1; i--) {
    countdown.value = i
    await sleep(1000)
  }
  countdown.value = 0
  physicsCanvasRef.value?.setSwirl(0)

  // ── 依序抽出 N 位 ──
  const drawn = []
  const bodies = physicsCanvasRef.value?.getBodies() ?? []

  for (let n = 0; n < count; n++) {
    const result = pickWinner()
    if (!result) break

    // 短暫highlight
    const winnerBody = bodies.find(b => b.label === result.name)
    if (winnerBody) {
      const originalColors = bodies.map(b => b._color)
      bodies.forEach(b => { if (b !== winnerBody) b._color = '#333333' })
      winnerBody._color = '#FFD700'
      await sleep(count === 1 ? 800 : 500)
      bodies.forEach((b, i) => { b._color = originalColors[i] })
    }

    currentPrize.value.winners.push(result.name)
    allWinners.value.push({
      id: ++winnerIdCounter,
      name: result.name,
      prize: currentPrize.value.name,
      vip: result.isVip,
    })
    drawn.push(result)
  }

  if (!drawn.length) { isSpinning.value = false; return }

  resultWinners.value = drawn
  resultPrize.value   = currentPrize.value.name
  showResult.value    = true

  launchConfetti()

  // 自動推進到下一個未抽完的獎項
  if (currentPrize.value.winners.length >= currentPrize.value.total) {
    const next = prizes.value.findIndex((p, i) => i > selectedPrizeIdx.value && p.winners.length < p.total)
    if (next !== -1) {
      selectedPrizeIdx.value = next
      drawCount.value = 1
    }
  }

  // 推送最新狀態到遙控器
  pushState({ prize: currentPrize.value?.name, remaining: remainingSlots.value })

  isSpinning.value = false
}

function launchConfetti() {
  const duration = 3000
  const animEnd = Date.now() + duration
  const colors = ['#FFD700', '#FF0000', '#FFE866', '#CC0000', '#FFF']
  ;(function frame() {
    confetti({ particleCount: 8, angle: 60,  spread: 55, origin: { x: 0 }, colors })
    confetti({ particleCount: 8, angle: 120, spread: 55, origin: { x: 1 }, colors })
    if (Date.now() < animEnd) requestAnimationFrame(frame)
  })()
}

// ── PeerJS host ──
const { myPeerId, peerConnected, pushState, init: initPeer, destroy: destroyPeer } = useHostPeer((count) => {
  drawCount.value = Math.min(count, remainingSlots.value) || 1
  startDraw()
})

// Store peer info in localStorage so admin page can build the remote QR
watch(myPeerId, id => {
  if (id) localStorage.setItem('lottery_peer_id', id)
})
watch(peerConnected, v => {
  localStorage.setItem('lottery_peer_connected', String(v))
})

// ── Admin QR Code ──
const showAdminQr = ref(false)
const adminPageUrl = computed(() => `${window.location.href.split('?')[0]}?admin`)
const adminQrUrl = computed(() =>
  `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(adminPageUrl.value)}`
)

onMounted(() => {
  if (!isRemotePage && !isAdminPage && !isVIPPage && !isCheckPage) initPeer()
})
onUnmounted(() => {
  if (!isRemotePage && !isAdminPage && !isVIPPage && !isCheckPage) destroyPeer()
})
</script>

<style scoped>
/* ── Draw count control ── */
.draw-btn-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.draw-count-ctrl {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.count-label-sm {
  font-size: 0.75rem;
  color: var(--text-muted);
  letter-spacing: 0.05em;
}
.count-btn {
  width: 28px; height: 28px;
  border-radius: 50%;
  border: 1px solid rgba(255,215,0,0.25);
  background: rgba(255,215,0,0.06);
  color: var(--gold-dark);
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.15s;
  display: flex; align-items: center; justify-content: center;
  line-height: 1;
}
.count-btn:hover:not(:disabled) { background: rgba(255,215,0,0.15); border-color: var(--gold); color: var(--gold); }
.count-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.count-display {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 1.4rem;
  letter-spacing: 0.05em;
  color: var(--gold);
  min-width: 28px;
  text-align: center;
}
.count-presets {
  display: flex;
  gap: 4px;
  margin-left: 4px;
}
.preset-btn {
  padding: 3px 8px;
  border-radius: 6px;
  border: 1px solid rgba(255,215,0,0.2);
  background: transparent;
  color: var(--text-muted);
  font-family: 'Noto Serif TC', serif;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s;
}
.preset-btn:hover:not(:disabled) { border-color: rgba(255,215,0,0.4); color: var(--text-light); }
.preset-btn.active { background: rgba(255,215,0,0.12); border-color: var(--gold-dark); color: var(--gold); font-weight: 700; }
.preset-btn:disabled { opacity: 0.2; cursor: not-allowed; }

/* ── Admin entry button ── */
.admin-entry-btn {
  position: absolute;
  top: 16px;
  right: 20px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px;
  color: rgba(255,255,255,0.2);
  font-size: 1rem;
  width: 32px;
  height: 32px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}
.admin-entry-btn:hover {
  color: var(--gold-dark);
  border-color: rgba(255,215,0,0.2);
  background: rgba(255,215,0,0.05);
}

/* ── Admin QR overlay ── */
.admin-qr-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 500;
  backdrop-filter: blur(4px);
}
.admin-qr-card {
  background: var(--bg-card);
  border: 1px solid rgba(255,215,0,0.2);
  border-radius: 20px;
  padding: 36px 32px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}
.admin-qr-title {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 1.4rem;
  letter-spacing: 0.2em;
  color: var(--gold);
}
.admin-qr-img {
  width: 200px;
  height: 200px;
  border-radius: 10px;
  background: #fff;
  padding: 4px;
}
.admin-qr-sub {
  font-size: 0.78rem;
  color: var(--text-muted);
}
.admin-qr-close {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  color: var(--text-muted);
  font-family: 'Noto Serif TC', serif;
  font-size: 0.85rem;
  padding: 8px 24px;
  cursor: pointer;
  transition: all 0.2s;
}
.admin-qr-link {
  font-size: 0.8rem;
  color: var(--gold-dark);
  text-decoration: none;
  letter-spacing: 0.05em;
}
.admin-qr-link:hover { color: var(--gold); text-decoration: underline; }
.admin-qr-close:hover { background: rgba(255,255,255,0.12); color: var(--text-light); }
</style>
