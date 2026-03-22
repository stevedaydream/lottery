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
          :form-url="gasUrl"
          :deadline="registrationDeadline"
        />
      </div>

      <!-- CENTER: Canvas -->
      <div style="display:flex;flex-direction:column;gap:16px;">
        <PhysicsCanvas
          ref="physicsCanvasRef"
          :participants="availableParticipants"
          :is-spinning="isSpinning"
          :countdown="countdown"
          :current-prize="currentPrize"
        />
        <div style="text-align:center;font-size:0.78rem;color:var(--text-muted);letter-spacing:0.1em;">
          {{ canDraw ? `使用手機遙控或後台觸發抽獎 · 當前獎項：${currentPrize?.name ?? '-'}` : '請確認有獎項且有參與者' }}
        </div>
      </div>

      <!-- RIGHT: Winners -->
      <div style="display:flex;flex-direction:column;gap:16px;" class="panel-right">
        <WinnersPanel :winners="allWinners" />
      </div>
    </div>

    <ResultModal
      :show="showResult"
      :prize="resultPrize"
      :winners="resultWinners"
      @close="closeResult"
    />

    <!-- Toast notification #1 -->
    <Transition name="toast">
      <div v-if="toastVisible" class="toast-msg">{{ toastMsg }}</div>
    </Transition>

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
const { participantsRaw, prizes, allWinners, vipGuarantee, vipExclude, registrationDeadline, eventTitle } = sharedState

// GAS sync (only on main display)
if (!isRemotePage && !isAdminPage && !isVIPPage && !isCheckPage) useGASSync(sharedState)

const participantList = computed(() =>
  participantsRaw.value.split('\n').map(s => s.trim()).filter(Boolean)
)

const availableParticipants = computed(() => {
  const wonNames = new Set(allWinners.value.map(w => w.name))
  return participantList.value.filter(n => !wonNames.has(n))
})

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

// ── Toast (#1) ──
const toastMsg     = ref('')
const toastVisible = ref(false)
let toastTimer = null
function showToast(msg) {
  toastMsg.value = msg
  toastVisible.value = true
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastVisible.value = false }, 3000)
}

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

// 計算指定獎項的實際可抽人數（可傳入任意 prize 物件）
function calcEffectiveMax(prize) {
  if (!prize) return 0
  const slotLeft = prize.total - prize.winners.length
  if (slotLeft <= 0) return 0

  const alreadyWon = new Set(allWinners.value.map(w => w.name))

  const guaranteeList = vipGuarantee.value
    .split('\n')
    .map(s => {
      const [name, prizeName = ''] = s.split(',').map(p => p.trim())
      return { name, prizeName }
    })
    .filter(g => g.name)

  const excludeList = vipExclude.value.split('\n').map(s => s.trim()).filter(Boolean)

  const reservedForOtherPrize = new Set(
    guaranteeList
      .filter(g => {
        if (!g.prizeName || alreadyWon.has(g.name)) return false
        const isForThisPrize = prize.name.includes(g.prizeName) || g.prizeName.includes(prize.name)
        return !isForThisPrize
      })
      .map(g => g.name)
  )

  let available = participantList.value.filter(n =>
    !alreadyWon.has(n) && !excludeList.includes(n) && !reservedForOtherPrize.has(n)
  ).length

  // 正常 pool 為空時（剩餘者全是被排除者），退回到所有未中獎者
  if (available === 0) {
    available = participantList.value.filter(n => !alreadyWon.has(n)).length
  }

  return Math.min(slotLeft, available)
}

// 實際可抽人數：排除已中獎、排除名單、保留給其他獎項的 VIP
const effectiveDrawMax = computed(() => calcEffectiveMax(currentPrize.value))

const drawCount = ref(1)

const canDraw = computed(() => {
  if (!currentPrize.value) return false
  if (currentPrize.value.winners.length >= currentPrize.value.total) return false
  return effectiveDrawMax.value > 0
})

// drawCount hint：說明為什麼上限比名額少 (#2)
const drawCountHint = computed(() => {
  if (!currentPrize.value) return ''
  if (effectiveDrawMax.value >= remainingSlots.value) return ''
  return `最多可抽 ${effectiveDrawMax.value} 位（已扣除保留及後順位名單）`
})

// 切換獎項或可用人數變動時，自動將 drawCount 夾在合法範圍內
watch(effectiveDrawMax, max => {
  if (drawCount.value > max) drawCount.value = Math.max(1, max)
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

  // 有指定獎項的保底名單：這些人要留給指定獎項，不能被其他獎項隨機抽走
  const reservedForOtherPrize = new Set(
    guaranteeList
      .filter(g => g.prizeName && !alreadyWon.has(g.name))
      .map(g => g.name)
  )

  let pool = participantList.value.filter(n =>
    !alreadyWon.has(n) && !excludeList.includes(n) && !reservedForOtherPrize.has(n)
  )
  // 正常 pool 為空（剩餘者全是被排除者）→ 退回所有未中獎者，排除規則此時失效
  if (pool.length === 0) pool = participantList.value.filter(n => !alreadyWon.has(n))
  if (pool.length === 0) return null

  return { name: pool[Math.floor(Math.random() * pool.length)], isVip: false }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function startDraw() {
  if (isSpinning.value || !canDraw.value) return
  isSpinning.value = true
  pushState({ prize: currentPrize.value?.name, remaining: remainingSlots.value, spinning: true })

  const count = Math.min(drawCount.value, effectiveDrawMax.value)

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
      showToast(`已自動切換至「${prizes.value[next].name}」`)
    }
  }

  // 推送最新狀態到遙控器（含 spinning: false）
  pushState({ prize: currentPrize.value?.name, remaining: remainingSlots.value, spinning: false })

  isSpinning.value = false
}

// Modal 關閉後才重建球池，避免與結果動畫同時發生 (#3)
function closeResult() {
  showResult.value = false
  physicsCanvasRef.value?.rebuild()
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
  // 遙控器剛連線時立刻推送當前狀態，讓「等待主畫面同步」立即消失
  if (v) pushState({ prize: currentPrize.value?.name, remaining: remainingSlots.value, spinning: isSpinning.value })
})

// ── Admin QR Code ──
const showAdminQr = ref(false)
const adminPageUrl = computed(() => `${window.location.href.split('?')[0]}?admin`)
const adminQrUrl = computed(() =>
  `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(adminPageUrl.value)}`
)

// ── 報名表單 URL ──
const gasUrl = import.meta.env.VITE_GAS_URL || ''

onMounted(() => {
  if (!isRemotePage && !isAdminPage && !isVIPPage && !isCheckPage) initPeer()
})
onUnmounted(() => {
  if (!isRemotePage && !isAdminPage && !isVIPPage && !isCheckPage) destroyPeer()
})
</script>

<style scoped>
/* ── 空狀態（無參與者）── */
.empty-state-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  background: rgba(255,215,0,0.04);
  border: 1px solid rgba(255,215,0,0.15);
  border-radius: 20px;
  padding: 36px 28px;
  min-height: 460px;
  text-align: center;
}
.empty-state-title {
  font-size: 1.6rem;
  font-weight: 900;
  background: linear-gradient(135deg, var(--gold-dark), var(--gold));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.empty-state-sub {
  font-size: 0.9rem;
  color: var(--text-muted);
  letter-spacing: 0.05em;
}
.empty-state-qr {
  width: 220px;
  height: 220px;
  border-radius: 12px;
  border: 2px solid rgba(255,215,0,0.25);
  padding: 8px;
  background: #fff;
}
.empty-state-no-qr {
  font-size: 0.78rem;
  color: var(--text-muted);
}
.empty-state-countdown {
  background: rgba(0,0,0,0.3);
  border: 1px solid rgba(255,215,0,0.3);
  border-radius: 14px;
  padding: 14px 28px;
}
.countdown-label {
  font-size: 0.72rem;
  color: var(--text-muted);
  letter-spacing: 0.12em;
  margin-bottom: 6px;
}
.countdown-value {
  font-size: 1.8rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.08em;
  color: var(--gold);
}
.empty-state-closed {
  font-size: 1rem;
  color: #ff6666;
  font-weight: 700;
}
.empty-state-hint {
  font-size: 0.75rem;
  color: rgba(255,255,255,0.25);
  letter-spacing: 0.08em;
}

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

/* ── Toast (#1) ── */
.toast-msg {
  position: fixed;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(20, 20, 30, 0.92);
  border: 1px solid rgba(255,215,0,0.3);
  border-radius: 24px;
  color: var(--gold);
  font-family: 'Noto Serif TC', serif;
  font-size: 0.88rem;
  padding: 10px 24px;
  z-index: 999;
  backdrop-filter: blur(8px);
  white-space: nowrap;
  pointer-events: none;
}
.toast-enter-active { transition: opacity 0.25s, transform 0.25s; }
.toast-leave-active { transition: opacity 0.4s, transform 0.4s; }
.toast-enter-from  { opacity: 0; transform: translateX(-50%) translateY(12px); }
.toast-leave-to    { opacity: 0; transform: translateX(-50%) translateY(8px); }
</style>
