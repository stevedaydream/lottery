<template>
  <div class="admin-root">

    <!-- ── Login ── -->
    <div v-if="!authed" class="login-wrap">
      <div class="login-card">
        <div class="login-logo">⚙</div>
        <div class="login-title">管理員登入</div>
        <div class="login-sub">僅限授權帳號存取</div>
        <div v-if="clientId" id="google-signin-btn" class="signin-btn-wrap"></div>
        <div v-else class="config-warn">
          尚未設定 Google Client ID<br>
          請在 <code>.env</code> 中設定 <code>VITE_GOOGLE_CLIENT_ID</code><br>
          與 <code>VITE_ADMIN_EMAIL</code>
        </div>
        <div v-if="authError" class="auth-error">{{ authError }}</div>
      </div>
    </div>

    <!-- ── Admin Panel ── -->
    <div v-else class="admin-panel">
      <div class="admin-header">
        <div class="admin-title">⚙ 抽獎管理後台</div>
        <div class="sync-status" :class="{ 'sync-error-highlight': syncErr }">
          <span v-if="syncing" class="sync-dot syncing">⟳</span>
          <span v-else-if="syncErr" class="sync-dot err" :title="syncErr">!</span>
          <span v-else-if="lastSync" class="sync-dot ok" title="已同步">✓</span>
          <span v-if="!syncing" class="sync-label" @click="fetchAll" style="cursor:pointer;" title="點擊重新同步">
            {{ syncErr ? 'GAS 同步失敗，點擊重試' : lastSync ? `${lastSync.toLocaleTimeString()} 同步` : 'GAS 未設定' }}
          </span>
        </div>
        <a class="vip-entry-link" :href="vipPageUrl" target="_blank" title="VIP 黑箱設定">✦ VIP</a>
        <div class="admin-user">{{ userEmail }}</div>
        <button class="logout-btn" @click="logout">登出</button>
      </div>

      <div class="tab-bar">
        <button v-for="t in tabs" :key="t.key"
          :class="['tab-btn', { active: activeTab === t.key }]"
          @click="activeTab = t.key">
          {{ t.label }}
        </button>
      </div>

      <!-- ── 活動標題設定（常駐顯示於頁面頂部） ── -->
      <div class="title-setting-bar">
        <label class="title-setting-label">活動標題</label>
        <input class="title-setting-input" v-model="eventTitle" placeholder="尾牙抽獎大會" maxlength="20" />
      </div>

      <!-- ── 遙控器 ── -->
      <div v-if="activeTab === 'remote'" class="tab-content">
        <div class="remote-area">

          <!-- QR Code 區塊 -->
          <div class="qr-block">
            <div class="section-title" style="margin-bottom:12px">手機遙控器</div>
            <img v-if="remoteQrUrl" :src="remoteQrUrl" alt="Remote QR" class="qr-img" />
            <div v-else class="qr-placeholder">等待主畫面初始化…</div>
            <div class="conn-status">
              <div class="status-dot" :class="remoteConnected ? 'connected' : 'waiting'"></div>
              <span>{{ remoteConnected ? '手機已連線' : '等待手機掃描' }}</span>
            </div>
            <div class="peer-id-box">ID: {{ remotePeerId || '初始化中...' }}</div>
            <div class="hint" style="margin:0;text-align:center">掃描 QR Code 開啟手機遙控</div>
          </div>

          <!-- 後台直接控制區塊 -->
          <div class="admin-remote-ctrl">
            <div class="section-title" style="margin-bottom:12px">後台直接控制</div>

            <!-- 當前獎項資訊 -->
            <div class="admin-prize-info" :class="{ 'no-data': !adminPeerState }">
              <template v-if="adminPeerState">
                <span class="admin-prize-name">{{ adminPeerState.prize }}</span>
                <span class="admin-prize-rem" v-if="adminPeerState.remaining > 0">剩餘 <b>{{ adminPeerState.remaining }}</b> 名</span>
                <span class="admin-prize-rem all-done" v-else>全數抽出</span>
              </template>
              <span v-else style="color:var(--text-muted);font-size:0.82rem">等待主畫面同步...</span>
            </div>

            <!-- 抽出人數 -->
            <div class="admin-count-row">
              <span class="count-label-sm">抽出</span>
              <button class="admin-count-btn" @click="adminDrawCount = Math.max(1, adminDrawCount - 1)" :disabled="adminIsSpinning">－</button>
              <span class="admin-count-display">{{ adminDrawCount }}</span>
              <button class="admin-count-btn" @click="adminDrawCount = Math.min(adminMaxCount, adminDrawCount + 1)" :disabled="adminIsSpinning">＋</button>
              <span class="count-label-sm">位</span>
              <div style="display:flex;gap:4px;margin-left:4px;">
                <button v-for="n in [3,5,10]" :key="n"
                  class="preset-btn"
                  :class="{ active: adminDrawCount === n }"
                  :disabled="adminIsSpinning || n > adminMaxCount"
                  @click="adminDrawCount = n">{{ n }}</button>
              </div>
            </div>

            <!-- 抽獎按鈕 -->
            <button class="admin-draw-btn"
              :class="{ spinning: adminIsSpinning }"
              :disabled="!adminPeerConnected || !adminCanDraw || adminIsSpinning"
              @click="adminSendDraw(adminDrawCount)">
              <span v-if="adminIsSpinning" class="btn-spinner-sm"></span>
              <span v-else>🎰 開始抽獎</span>
            </button>

            <!-- 連線狀態 -->
            <div class="admin-peer-status">
              <div class="status-dot" :class="adminPeerConnected ? 'connected' : adminPeerError ? 'error' : 'waiting'"></div>
              <span>{{ adminPeerConnected ? '已連線至主畫面' : adminPeerError || '連線中...' }}</span>
              <span v-if="!adminPeerConnected && adminReconnectCountdown > 0" style="color:rgba(255,165,0,0.7);font-size:0.75rem">
                · {{ adminReconnectCountdown }}s 後重試
              </span>
            </div>
          </div>

        </div>
      </div>

      <!-- ── 名單匯入 ── -->
      <div v-if="activeTab === 'participants'" class="tab-content">

        <!-- 報名表單 QR Code -->
        <div class="section-title">報名表單</div>
        <div class="form-qr-row">
          <div class="qr-block">
            <img v-if="formQrUrl" :src="formQrUrl" alt="報名 QR" class="qr-img" />
            <div v-else class="qr-placeholder">需設定 VITE_GAS_URL</div>
            <a v-if="gasUrl" :href="gasUrl" target="_blank" class="form-link">直接開啟表單 ↗</a>
          </div>
          <div class="form-qr-hint">
            <p>員工掃描 QR Code 後填寫姓名、單位、桌號（選填）送出報名</p>
            <p>系統自動比對員工白名單並防止重複投入</p>
            <p style="color:var(--gold-dark);margin-top:8px;">※ 表單提示使用中文姓名填寫</p>

            <!-- 報名截止時間 -->
            <div class="deadline-row">
              <label class="deadline-label">報名截止時間</label>
              <input type="datetime-local" class="deadline-input" v-model="registrationDeadline" />
              <button v-if="registrationDeadline" class="deadline-clear" @click="registrationDeadline = ''" title="清除截止時間">✕</button>
            </div>
            <div v-if="registrationDeadline" class="deadline-hint">
              主畫面無參與者時將顯示倒數計時
            </div>
          </div>
        </div>

        <div class="divider"></div>

        <!-- 員工白名單 -->
        <div class="section-header">
          <div>
            <div class="section-title" style="margin-bottom:2px">員工白名單</div>
            <div class="hint" style="margin:0">可報名資格驗證用，留空則不驗證身分</div>
          </div>
          <div style="display:flex;gap:8px;">
            <button class="action-btn" @click="downloadTemplate">⬇ 下載範本</button>
            <button class="action-btn gold" @click="$refs.excelInput.click()">⬆ 匯入 Excel</button>
            <input ref="excelInput" type="file" accept=".xlsx,.xls,.csv" style="display:none" @change="importExcel" />
          </div>
        </div>
        <div class="hint" style="margin-bottom:10px;">
          每行一筆，格式：<code style="color:var(--gold-dark)">姓名,單位,值班</code>（例：<code style="color:var(--gold-dark)">王小明,9A,否</code>）<br>
          值班欄填「是」表示當天值班；或匯入 Excel（欄位：姓名、單位、值班）
        </div>
        <div v-if="importMsg" class="import-msg" :class="importMsgType">{{ importMsg }}</div>
        <textarea class="admin-textarea" v-model="employeeList"
          placeholder="王小明,9A,否&#10;李大華,NP,是&#10;張美玲,門診,否"></textarea>
        <div class="count-info">共 {{ employeeCount }} 人</div>

        <div class="divider"></div>

        <!-- 抽獎名單（報名後自動填入） -->
        <div class="section-header">
          <div>
            <div class="section-title" style="margin-bottom:2px">抽獎名單</div>
            <div class="hint" style="margin:0">實際進入球池的參與者。員工報名後自動加入；亦可手動編輯</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button v-if="clearedParticipants !== null" class="action-btn" @click="undoClear" title="還原清空前的名單">
              ↩ 復原
            </button>
            <button class="action-btn gold" :disabled="importingRegistered || !gasUrl" @click="importRegistered"
              title="從 GAS 報名名單匯入所有已報名者">
              {{ importingRegistered ? '匯入中...' : '📋 加入已報名者' }}
            </button>
            <button class="action-btn" @click="openDutyModal" :disabled="!employeeList">
              🏥 值班人員
            </button>
            <button class="action-btn" :disabled="syncing" @click="fetchAll" title="從 GAS 拉取最新報名資料">
              {{ syncing ? '同步中...' : '⟳ 重新整理' }}
            </button>
            <button class="action-btn danger" @click="clearParticipants" :disabled="!participantsRaw">
              🗑 清空名單
            </button>
          </div>
        </div>
        <textarea class="admin-textarea large" v-model="participantsRaw"
          placeholder="每行一名&#10;王小明&#10;李大華"></textarea>
        <div class="count-info">
          共 {{ participantCount }} 人
          <span v-if="dutyInParticipants.length" style="color:var(--gold-dark);margin-left:8px;">
            · 值班 {{ dutyInParticipants.length }} 人
          </span>
        </div>
      </div>

      <!-- ── 值班人員選取 Modal ── -->
      <teleport to="body">
        <div v-if="showDutyModal" class="modal-overlay" @click.self="showDutyModal = false">
          <div class="duty-modal">
            <div class="duty-modal-title">🏥 選取值班人員</div>
            <div class="duty-modal-hint">勾選後儲存，將加入抽獎名單並標記值班</div>

            <div class="duty-unit-list">
              <div v-for="(members, unit) in employeeByUnit" :key="unit" class="duty-unit-group">
                <div class="duty-unit-header">
                  <label class="duty-unit-label">
                    <input type="checkbox"
                      :checked="isUnitAllSelected(unit, members)"
                      :indeterminate.prop="isUnitPartial(unit, members)"
                      @change="toggleUnit(unit, members, $event.target.checked)" />
                    {{ unit }}
                  </label>
                  <span class="duty-unit-count">{{ selectedInUnit(unit, members) }}/{{ members.length }}</span>
                </div>
                <div class="duty-member-grid">
                  <label v-for="m in members" :key="m.name" class="duty-member-item"
                    :class="{ selected: dutySelected.has(m.name) }">
                    <input type="checkbox" :value="m.name"
                      :checked="dutySelected.has(m.name)"
                      @change="toggleDutyMember(m.name, $event.target.checked)" />
                    {{ m.name }}
                  </label>
                </div>
              </div>
            </div>

            <div class="duty-modal-footer">
              <span class="duty-selected-count">已選 {{ dutySelected.size }} 人</span>
              <button class="action-btn" @click="showDutyModal = false">取消</button>
              <button class="action-btn gold" @click="saveDutySelection">儲存並加入名單</button>
            </div>
          </div>
        </div>
      </teleport>

      <!-- ── 獎項設定 ── -->
      <div v-if="activeTab === 'prizes'" class="tab-content">
        <div class="section-title">獎項設定</div>
        <div class="prize-rows">
          <div v-for="(prize, idx) in prizes" :key="prize.id" class="prize-card">
            <!-- 快速標籤列 -->
            <div class="tag-row">
              <button v-for="tag in PRESET_TAGS" :key="tag.key"
                class="tag-btn"
                :class="{ active: getActiveTag(prize) === tag.key }"
                @click="applyTag(prize, tag)">
                {{ tag.label }}
              </button>
            </div>
            <!-- 現金金額調整列 -->
            <div v-if="getActiveTag(prize) === 'cash'" class="cash-row">
              <button class="cash-btn" @click="adjustCash(prize, -1000)">－1000</button>
              <span class="cash-amount">{{ getCashAmount(prize).toLocaleString() }} 元</span>
              <button class="cash-btn" @click="adjustCash(prize, +1000)">＋1000</button>
            </div>
            <!-- 主要輸入列 -->
            <div class="prize-row">
              <input class="rank-input" v-model="prize.rank" placeholder="🎁" />
              <input class="name-input" v-model="prize.name" placeholder="獎項名稱" />
              <div class="total-wrap">
                <span class="total-label">名額</span>
                <input class="total-input" type="number" min="1" v-model.number="prize.total" />
              </div>
              <span class="won-label">已抽 {{ prize.winners.length }}/{{ prize.total }}</span>
              <button class="icon-btn danger" @click="deletePrize(idx)" title="刪除">✕</button>
            </div>
          </div>
        </div>
        <button class="add-btn" @click="addPrize">＋ 新增獎項</button>
        <div class="hint warn">修改獎項名額不影響已中獎記錄</div>
      </div>


      <!-- ── 兌獎管理 ── -->
      <div v-if="activeTab === 'claims'" class="tab-content">
        <div class="section-header">
          <div class="section-title">兌獎管理</div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <input class="claim-search" v-model="claimSearch" placeholder="搜尋姓名…" />
            <select class="claim-filter-select" v-model="claimStatusFilter">
              <option value="all">全部狀態</option>
              <option value="unclaimed">未兌獎</option>
              <option value="claimed">已兌獎</option>
            </select>
            <select class="claim-filter-select" v-model="claimPrizeFilter">
              <option value="">全部獎項</option>
              <option v-for="p in prizes" :key="p.id" :value="p.name">{{ p.name }}</option>
            </select>
            <button class="action-btn" @click="loadClaimData" :disabled="claimLoading">↻ 刷新</button>
          </div>
        </div>

        <div v-if="claimLoading" class="claim-loading">載入中…</div>
        <div v-else-if="claimLoadErr" class="claim-err">{{ claimLoadErr }}</div>
        <template v-else>
          <div class="claim-stats">
            已兌 <b>{{ claimedCount }}</b> &nbsp;/&nbsp; 共 <b>{{ allWinners.length }}</b> 筆
            <span v-if="allWinners.length && claimedCount === allWinners.length" class="all-claimed-badge">全部完成 ✓</span>
          </div>

          <div v-if="!allWinners.length" class="empty-hint">尚無中獎記錄</div>
          <div v-else class="claim-table">
            <div class="claim-head">
              <span>姓名</span><span>單位</span><span>獎項</span><span>狀態</span>
            </div>
            <div
              v-for="w in filteredWinnersForClaim"
              :key="`${w.id}`"
              class="claim-row"
              :class="{ 'is-claimed': isWinnerClaimed(w.name, w.prize) }"
            >
              <span class="cl-name">{{ w.name }}</span>
              <span class="cl-unit">{{ getRegistration(w.name)?.unit || '—' }}</span>
              <span class="cl-prize">{{ w.prize }}</span>
              <span class="cl-action">
                <button
                  v-if="!isWinnerClaimed(w.name, w.prize)"
                  class="claim-btn"
                  @click="markClaimed(w.name, w.prize)"
                >✓ 確認兌獎</button>
                <span v-else class="claimed-badge">
                  ✓ 已兌獎
                  <span class="claimed-at">{{ formatClaimTime(w.name, w.prize) }}</span>
                  <button class="unclaim-btn" @click="unmarkClaimed(w.name, w.prize)" title="取消兌獎">✕</button>
                </span>
              </span>
            </div>
          </div>
        </template>
      </div>

      <!-- ── 中獎名單 ── -->
      <div v-if="activeTab === 'winners'" class="tab-content">
        <div class="section-header">
          <div class="section-title">中獎名單</div>
          <div style="display:flex;gap:8px;">
            <button v-if="allWinners.length" class="action-btn gold export-btn" @click="exportCSV">⬇ 匯出 CSV</button>
            <button v-if="allWinners.length" class="action-btn danger" @click="clearWinners">清除全部</button>
          </div>
        </div>
        <div v-if="!allWinners.length" class="empty-hint">尚無中獎記錄</div>
        <div v-else class="winners-table">
          <div class="table-head">
            <span>#</span><span>姓名</span><span>獎項</span><span>備註</span>
          </div>
          <div v-for="(w, i) in [...allWinners].reverse()" :key="w.id" class="table-row">
            <span class="cell-num">{{ allWinners.length - i }}</span>
            <span class="cell-name">{{ w.name }}</span>
            <span class="cell-prize">{{ w.prize }}</span>
            <span class="cell-vip"></span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import * as XLSX from 'xlsx'
import { useSharedState } from '../composables/useSharedState'
import { useGASSync } from '../composables/useGASSync'
import { useRemotePeer } from '../composables/usePeer'

const sharedState = useSharedState()
const { participantsRaw, prizes, allWinners, vipGuarantee, vipExclude, employeeList, dutyList, registrationDeadline, eventTitle } = sharedState
const { syncing, syncErr, lastSync, fetchAll } = useGASSync(sharedState)

const clientId   = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const adminEmail = import.meta.env.VITE_ADMIN_EMAIL || ''
const gasUrl     = import.meta.env.VITE_GAS_URL || ''
const formQrUrl  = computed(() =>
  gasUrl ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(gasUrl)}` : ''
)

const authed    = ref(false)
const userEmail = ref('')
const authError = ref('')
const activeTab = ref('participants')

const tabs = [
  { key: 'participants', label: '👥 名單匯入' },
  { key: 'prizes',       label: '🏆 獎項設定' },
  { key: 'claims',       label: '🎫 兌獎管理' },
  { key: 'winners',      label: '🎉 中獎名單' },
  { key: 'remote',       label: '📱 遙控器' },
]

// ── Remote control (reads peer ID stored by main display page) ──
const remotePeerId = ref(localStorage.getItem('lottery_peer_id') || '')
const remoteConnected = ref(localStorage.getItem('lottery_peer_connected') === 'true')

window.addEventListener('storage', e => {
  if (e.key === 'lottery_peer_id' && e.newValue) remotePeerId.value = e.newValue
  if (e.key === 'lottery_peer_connected') remoteConnected.value = e.newValue === 'true'
})

// ── Admin 遙控器（直接連接主畫面，發送抽獎指令）──
const {
  remoteConnected: adminPeerConnected,
  remoteError: adminPeerError,
  remoteState: adminPeerState,
  remoteIsSpinning: adminIsSpinning,
  reconnectCountdown: adminReconnectCountdown,
  init: initAdminPeer,
  sendDraw: adminSendDraw,
  destroy: destroyAdminPeer,
} = useRemotePeer(remotePeerId.value)

const adminDrawCount = ref(1)

const adminMaxCount = computed(() => {
  const rem = adminPeerState.value?.remaining ?? 99
  return Math.max(1, rem)
})

const adminCanDraw = computed(() => {
  if (!adminPeerState.value) return true
  return adminPeerState.value.remaining > 0
})

// 切到遙控器 tab 時才初始化連線，離開時中斷
// 切到名單 tab 時自動從 GAS 拉取最新報名資料
watch(activeTab, (val, old) => {
  if (val === 'remote' && remotePeerId.value) initAdminPeer()
  if (old === 'remote') destroyAdminPeer()
  if (val === 'participants') fetchAll()
})

const remoteQrUrl = computed(() => {
  if (!remotePeerId.value) return ''
  const remoteUrl = `${window.location.href.split('?')[0]}?remote=${remotePeerId.value}`
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(remoteUrl)}`
})

const vipPageUrl = computed(() => `${window.location.href.split('?')[0]}?vip`)

const participantCount = computed(() =>
  participantsRaw.value.split('\n').map(s => s.trim()).filter(Boolean).length
)
const employeeCount = computed(() =>
  employeeList.value.split('\n').map(s => s.split(',')[0].trim()).filter(Boolean).length
)

// ── 值班人員 Modal ──
const showDutyModal = ref(false)
const dutySelected  = ref(new Set())

// 解析員工白名單為物件陣列
const employeeEntries = computed(() =>
  employeeList.value.split('\n')
    .map(line => {
      const parts = line.split(',').map(s => s.trim())
      return { name: parts[0], unit: parts[1] || '未分類', duty: parts[2] || '' }
    })
    .filter(e => e.name)
)

// 按單位分組（保持插入順序）
const employeeByUnit = computed(() => {
  const groups = {}
  employeeEntries.value.forEach(e => {
    if (!groups[e.unit]) groups[e.unit] = []
    groups[e.unit].push(e)
  })
  return groups
})

// 目前參與者中有值班標記的人
const dutyInParticipants = computed(() => {
  const dutyNames = new Set(dutyList.value.split('\n').map(s => s.trim()).filter(Boolean))
  return participantsRaw.value.split('\n').map(s => s.trim()).filter(n => dutyNames.has(n))
})

function openDutyModal() {
  // 預選：已存在 dutyList 中的人
  const existing = new Set(dutyList.value.split('\n').map(s => s.trim()).filter(Boolean))
  dutySelected.value = new Set(existing)
  showDutyModal.value = true
}

function toggleDutyMember(name, checked) {
  const s = new Set(dutySelected.value)
  checked ? s.add(name) : s.delete(name)
  dutySelected.value = s
}

function isUnitAllSelected(unit, members) {
  return members.length > 0 && members.every(m => dutySelected.value.has(m.name))
}
function isUnitPartial(unit, members) {
  const count = members.filter(m => dutySelected.value.has(m.name)).length
  return count > 0 && count < members.length
}
function selectedInUnit(unit, members) {
  return members.filter(m => dutySelected.value.has(m.name)).length
}
function toggleUnit(unit, members, checked) {
  const s = new Set(dutySelected.value)
  members.forEach(m => checked ? s.add(m.name) : s.delete(m.name))
  dutySelected.value = s
}

function saveDutySelection() {
  const selected = [...dutySelected.value]

  // 更新 dutyList（完整替換）
  dutyList.value = selected.join('\n')

  // 將選取的人加入抽獎名單（去重）
  const existing = new Set(participantsRaw.value.split('\n').map(s => s.trim()).filter(Boolean))
  const toAdd    = selected.filter(n => !existing.has(n))
  if (toAdd.length > 0) {
    participantsRaw.value = [...existing, ...toAdd].join('\n')
  }

  showDutyModal.value = false
}

// ── 清空參與者 / 復原 ──
const clearedParticipants = ref(null)

function clearParticipants() {
  if (!participantsRaw.value.trim()) return
  clearedParticipants.value = participantsRaw.value
  participantsRaw.value = ''
}

function undoClear() {
  participantsRaw.value = clearedParticipants.value
  clearedParticipants.value = null
}

// ── 從 GAS 報名名單匯入已報名者 ──
const importingRegistered = ref(false)

async function importRegistered() {
  if (!gasUrl || importingRegistered.value) return
  importingRegistered.value = true
  try {
    const res  = await fetch(`${gasUrl}?action=get`, { redirect: 'follow' })
    const json = await res.json()
    if (!json.ok) throw new Error(json.error || 'GAS 錯誤')

    const registrations = json.data?.registrations || []
    if (registrations.length === 0) {
      alert('目前尚無報名記錄')
      return
    }

    const existing = new Set(participantsRaw.value.split('\n').map(s => s.trim()).filter(Boolean))
    const toAdd    = registrations.map(r => r.name).filter(n => n && !existing.has(n))

    if (toAdd.length === 0) {
      alert('所有已報名者都已在名單中')
      return
    }

    const merged = [...existing, ...toAdd]
    participantsRaw.value = merged.join('\n')
    alert(`已加入 ${toAdd.length} 人，合計 ${merged.length} 人`)
  } catch (err) {
    alert('匯入失敗：' + err.message)
  } finally {
    importingRegistered.value = false
  }
}

// ── Excel 匯入 / 範本下載 ──
const importMsg     = ref('')
const importMsgType = ref('ok')

function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['姓名', '單位', '值班'],
    ['王小明', '9A',  '否'],
    ['李大華', '8A',  '否'],
    ['張美玲', '門診', '是'],
    ['陳小花', 'NP',  '否'],
    ['林大偉', 'VS',  '否'],
    ['黃雅婷', '開刀房', '否'],
  ])
  ws['!cols'] = [{ wch: 14 }, { wch: 10 }, { wch: 6 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '員工名單')
  XLSX.writeFile(wb, '員工白名單範本.xlsx')
}

function importExcel(e) {
  const file = e.target.files[0]
  if (!file) return
  e.target.value = '' // reset so same file can be re-imported

  const reader = new FileReader()
  reader.onload = evt => {
    try {
      const wb   = XLSX.read(evt.target.result, { type: 'array' })
      const ws   = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

      // 找欄位索引（支援中英文標題）
      let nameCol = 0, unitCol = -1, dutyCol = -1
      if (rows.length > 0) {
        const header = rows[0].map(c => String(c).trim())
        const ni = header.findIndex(h => h === '姓名' || h === 'name' || h === 'Name')
        const ui = header.findIndex(h => h === '單位' || h === 'unit' || h === 'Unit')
        const di = header.findIndex(h => h === '值班' || h === 'duty' || h === 'Duty')
        if (ni !== -1) nameCol = ni
        if (ui !== -1) unitCol = ui
        if (di !== -1) dutyCol = di
      }

      // 判斷是否有標題行
      const startRow = /[\u4e00-\u9fa5]/.test(String(rows[0]?.[nameCol])) ? 0 : 1
      const entries = rows
        .slice(startRow)
        .map(r => ({
          name: String(r[nameCol] ?? '').trim(),
          unit: unitCol !== -1 ? String(r[unitCol] ?? '').trim() : '',
          duty: dutyCol !== -1 ? String(r[dutyCol] ?? '').trim() : '',
        }))
        .filter(e => e.name && /[\u4e00-\u9fa5]/.test(e.name))

      if (entries.length === 0) {
        importMsg.value = '未找到有效的中文姓名，請確認欄位格式'
        importMsgType.value = 'err'
        return
      }

      // 合併：以姓名去重
      const existingNames = new Set(
        employeeList.value.split('\n').map(l => l.split(',')[0].trim()).filter(Boolean)
      )
      const newEntries = entries.filter(e => !existingNames.has(e.name))
      const allLines = [
        ...employeeList.value.split('\n').filter(l => l.trim()),
        ...newEntries.map(e => [e.name, e.unit, e.duty].join(',')),
      ]
      employeeList.value = allLines.join('\n')

      importMsg.value = `成功匯入 ${newEntries.length} 筆，合計 ${allLines.length} 人`
      importMsgType.value = 'ok'
    } catch {
      importMsg.value = '檔案格式錯誤，請使用範本重新匯入'
      importMsgType.value = 'err'
    }
    setTimeout(() => { importMsg.value = '' }, 4000)
  }
  reader.readAsArrayBuffer(file)
}

// ── Google Sign-In ──
function decodeJwt(token) {
  try {
    const payload = token.split('.')[1]
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
  } catch { return null }
}

function handleCredentialResponse(response) {
  const payload = decodeJwt(response.credential)
  if (!payload) { authError.value = '登入失敗，請重試'; return }
  if (adminEmail && payload.email !== adminEmail) {
    authError.value = `此帳號（${payload.email}）無管理權限`
    return
  }
  userEmail.value = payload.email
  authed.value = true
  authError.value = ''
  sessionStorage.setItem('lottery_admin_authed', payload.email)
}

function logout() {
  authed.value = false
  userEmail.value = ''
  sessionStorage.removeItem('lottery_admin_authed')
}

// ── Prize quick tags ──
const PRESET_TAGS = [
  { key: 'first',  label: '頭獎', name: '頭獎', rank: '🥇' },
  { key: 'second', label: '二獎', name: '二獎', rank: '🥈' },
  { key: 'third',  label: '三獎', name: '三獎', rank: '🥉' },
  { key: 'common', label: '普獎', name: '普獎', rank: '🎁' },
  { key: 'bonus',  label: '加碼', name: '加碼獎', rank: '✨' },
  { key: 'cash',   label: '現金', name: null,    rank: '💵' },
  { key: 'custom', label: '自訂', name: null,    rank: null  },
]

const TAG_PATTERNS = {
  first:  /^頭獎/,
  second: /^二獎/,
  third:  /^三獎/,
  common: /^普獎/,
  bonus:  /^加碼/,
  cash:   /^現金/,
}

function getActiveTag(prize) {
  for (const [key, re] of Object.entries(TAG_PATTERNS)) {
    if (re.test(prize.name)) return key
  }
  return 'custom'
}

function applyTag(prize, tag) {
  if (tag.key === 'custom') return           // 自訂：不改，讓使用者手動輸入
  if (tag.key === 'cash') {
    prize.name = `現金 ${getCashAmount(prize).toLocaleString()} 元`
    prize.rank = '💵'
    return
  }
  prize.name = tag.name
  prize.rank = tag.rank
}

function getCashAmount(prize) {
  const m = prize.name.match(/[\d,]+/)
  return m ? parseInt(m[0].replace(/,/g, '')) : 1000
}

function adjustCash(prize, delta) {
  const next = Math.max(1000, getCashAmount(prize) + delta)
  prize.name = `現金 ${next.toLocaleString()} 元`
  prize.rank = '💵'
}

// ── Prize management ──
function addPrize() {
  prizes.value.push({ id: Date.now(), name: '新獎項', total: 1, winners: [], rank: '🎁' })
}

function deletePrize(idx) {
  if (prizes.value[idx].winners.length > 0) {
    if (!confirm(`「${prizes.value[idx].name}」已有中獎記錄，確定刪除？`)) return
  }
  prizes.value.splice(idx, 1)
}

function clearWinners() {
  if (!confirm('確定清除所有中獎記錄？此操作無法復原。')) return
  allWinners.value = []
  prizes.value.forEach(p => { p.winners = [] })
}

function exportCSV() {
  const rows = [['序號', '姓名', '獎項', '備註']]
  allWinners.value.forEach((w, i) =>
    rows.push([i + 1, w.name, w.prize, w.vip ? 'VIP保送' : ''])
  )
  const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `中獎名單_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── 兌獎管理 ──
const claimedPrizes  = ref([])  // [{ name, prize, claimedAt }]
const registrations  = ref([])  // [{ name, unit, table, code }]
const claimSearch    = ref('')
const claimLoading   = ref(false)
const claimLoadErr   = ref('')

const claimStatusFilter = ref('all')  // 'all' | 'unclaimed' | 'claimed'
const claimPrizeFilter  = ref('')

const claimedCount = computed(() =>
  allWinners.value.filter(w => isWinnerClaimed(w.name, w.prize)).length
)

const filteredWinnersForClaim = computed(() => {
  let list = allWinners.value
  const q = claimSearch.value.trim()
  if (q) list = list.filter(w => w.name.includes(q) || w.prize.includes(q))
  if (claimPrizeFilter.value) list = list.filter(w => w.prize === claimPrizeFilter.value)
  if (claimStatusFilter.value === 'claimed')   list = list.filter(w => isWinnerClaimed(w.name, w.prize))
  if (claimStatusFilter.value === 'unclaimed') list = list.filter(w => !isWinnerClaimed(w.name, w.prize))
  return list
})

function isWinnerClaimed(name, prize) {
  return claimedPrizes.value.some(c => c.name === name && c.prize === prize)
}

function getRegistration(name) {
  return registrations.value.find(r => r.name === name)
}

function formatClaimTime(name, prize) {
  const rec = claimedPrizes.value.find(c => c.name === name && c.prize === prize)
  if (!rec?.claimedAt) return ''
  try {
    return new Date(rec.claimedAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

async function loadClaimData() {
  if (!gasUrl) return
  claimLoading.value = true
  claimLoadErr.value = ''
  try {
    const res  = await fetch(`${gasUrl}?action=get`)
    const json = await res.json()
    if (json.ok) {
      claimedPrizes.value = json.data.claimedPrizes || []
      registrations.value = json.data.registrations || []
    } else {
      claimLoadErr.value = 'GAS 回傳錯誤，請稍後重試'
    }
  } catch {
    claimLoadErr.value = '無法連線至 GAS'
  }
  claimLoading.value = false
}

function markClaimed(name, prize) {
  // Optimistic update
  if (!isWinnerClaimed(name, prize)) {
    claimedPrizes.value.push({ name, prize, claimedAt: new Date().toISOString() })
  }
  // Persist to GAS (no-cors, fire-and-forget)
  fetch(gasUrl, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action: 'claimPrize', name, prize }),
  })
}

function unmarkClaimed(name, prize) {
  claimedPrizes.value = claimedPrizes.value.filter(
    c => !(c.name === name && c.prize === prize)
  )
  fetch(gasUrl, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action: 'unclaimPrize', name, prize }),
  })
}

// 切到兌獎管理 tab 時自動載入
watch(activeTab, v => { if (v === 'claims') loadClaimData() })

// ── Mount: check session, init Google GSI ──
onMounted(() => {
  const saved = sessionStorage.getItem('lottery_admin_authed')
  if (saved && (!adminEmail || saved === adminEmail)) {
    userEmail.value = saved
    authed.value = true
    return
  }
  if (!clientId) return

  const script = document.createElement('script')
  script.src = 'https://accounts.google.com/gsi/client'
  script.async = true
  script.onload = () => {
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: handleCredentialResponse,
    })
    window.google.accounts.id.renderButton(
      document.getElementById('google-signin-btn'),
      { theme: 'filled_black', size: 'large', text: 'signin_with', locale: 'zh-TW' }
    )
  }
  document.head.appendChild(script)
})
</script>

<style scoped>
.admin-root {
  min-height: 100vh;
  background: var(--bg-dark);
  color: var(--text-light);
  font-family: 'Noto Serif TC', serif;
}

/* ── Login ── */
.login-wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(ellipse 80% 60% at 50% 0%, rgba(200,160,0,0.08) 0%, transparent 60%);
}
.login-card {
  background: var(--bg-card);
  border: 1px solid rgba(255,215,0,0.2);
  border-radius: 20px;
  padding: 48px 40px;
  text-align: center;
  width: 360px;
  max-width: 90vw;
}
.login-logo {
  font-size: 3rem;
  margin-bottom: 16px;
}
.login-title {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 1.8rem;
  letter-spacing: 0.2em;
  color: var(--gold);
  margin-bottom: 6px;
}
.login-sub {
  font-size: 0.8rem;
  color: var(--text-muted);
  letter-spacing: 0.1em;
  margin-bottom: 32px;
}
.signin-btn-wrap {
  display: flex;
  justify-content: center;
  min-height: 44px;
}
.config-warn {
  font-size: 0.8rem;
  color: #f0a040;
  background: rgba(240,160,64,0.08);
  border: 1px solid rgba(240,160,64,0.2);
  border-radius: 8px;
  padding: 16px;
  line-height: 2;
  text-align: left;
}
.config-warn code {
  background: rgba(255,255,255,0.08);
  border-radius: 4px;
  padding: 1px 5px;
  font-family: monospace;
  font-size: 0.85em;
}
.auth-error {
  margin-top: 16px;
  font-size: 0.8rem;
  color: #ff6666;
}

/* ── Admin Panel ── */
.admin-panel {
  max-width: 900px;
  margin: 0 auto;
  padding: 24px 20px 48px;
}
.admin-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(255,215,0,0.12);
}
.admin-title {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 1.6rem;
  letter-spacing: 0.15em;
  color: var(--gold);
  flex: 1;
}
.admin-user {
  font-size: 0.8rem;
  color: var(--text-muted);
}
.logout-btn {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  color: var(--text-muted);
  font-family: 'Noto Serif TC', serif;
  font-size: 0.8rem;
  padding: 6px 14px;
  cursor: pointer;
  transition: all 0.2s;
}
.logout-btn:hover { background: rgba(255,255,255,0.12); color: var(--text-light); }
.sync-status { display:flex; align-items:center; gap:6px; margin-right:8px; }
.sync-dot { font-size:0.85rem; }
.sync-dot.syncing { color: var(--gold); animation: spin 1s linear infinite; }
.sync-dot.ok  { color: #4caf50; }
.sync-dot.err { color: #ff6666; }
.sync-label { font-size:0.72rem; color: var(--text-muted); }
@keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
.title-setting-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(255,215,0,0.04);
  border: 1px solid rgba(255,215,0,0.1);
  border-radius: 12px;
  padding: 10px 16px;
  margin-bottom: 16px;
}
.title-setting-label {
  font-size: 0.78rem;
  color: var(--text-muted);
  white-space: nowrap;
}
.title-setting-input {
  flex: 1;
  background: transparent;
  border: none;
  border-bottom: 1px solid rgba(255,215,0,0.2);
  color: var(--gold);
  font-family: 'Noto Serif TC', serif;
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  padding: 2px 4px;
  outline: none;
  transition: border-color 0.2s;
}
.title-setting-input:focus { border-color: var(--gold); }

/* ── Tabs ── */
.tab-bar {
  display: flex;
  gap: 4px;
  margin-bottom: 24px;
  background: var(--bg-card);
  border: 1px solid rgba(255,215,0,0.1);
  border-radius: 12px;
  padding: 6px;
  flex-wrap: wrap;
}
.tab-btn {
  flex: 1;
  min-width: 80px;
  padding: 8px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  font-family: 'Noto Serif TC', serif;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.tab-btn:hover { color: var(--text-light); background: rgba(255,255,255,0.05); }
.tab-btn.active {
  background: rgba(255,215,0,0.12);
  color: var(--gold);
  font-weight: 700;
}

/* ── Tab Content ── */
.tab-content {
  background: var(--bg-card);
  border: 1px solid rgba(255,215,0,0.1);
  border-radius: 16px;
  padding: 28px 24px;
}
.section-title {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 1.3rem;
  letter-spacing: 0.15em;
  color: var(--gold);
  margin-bottom: 16px;
}
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.section-header .section-title { margin-bottom: 0; }
.hint {
  font-size: 0.78rem;
  color: var(--text-muted);
  margin-bottom: 12px;
}
.hint.warn { color: #f0a040; margin-top: 12px; margin-bottom: 0; }

/* ── Remote tab ── */
.remote-area {
  display: flex;
  gap: 32px;
  align-items: flex-start;
  flex-wrap: wrap;
}
.qr-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.qr-img {
  width: 200px;
  height: 200px;
  border-radius: 10px;
  background: #fff;
  padding: 4px;
}
.qr-placeholder {
  width: 200px;
  height: 200px;
  border-radius: 10px;
  border: 2px dashed rgba(255,215,0,0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  color: var(--text-muted);
  text-align: center;
}
.conn-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.82rem;
  color: var(--text-muted);
}
.status-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: #555;
}
.status-dot.connected { background: #4caf50; box-shadow: 0 0 8px rgba(76,175,80,0.6); animation: pulse 1.5s ease-in-out infinite; }
.status-dot.waiting   { background: #B8860B; animation: pulse 2s ease-in-out infinite; }
@keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
.peer-id-box {
  font-size: 0.7rem;
  color: #555;
  background: #111;
  border: 1px solid #222;
  border-radius: 6px;
  padding: 4px 10px;
  font-family: monospace;
}
.remote-hint {
  flex: 1;
  min-width: 180px;
  color: var(--text-muted);
  font-size: 0.85rem;
  line-height: 2;
  padding-top: 8px;
}

/* ── Admin remote control ── */
.admin-remote-ctrl {
  flex: 1;
  min-width: 260px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.admin-prize-info {
  background: rgba(255,215,0,0.06);
  border: 1px solid rgba(255,215,0,0.15);
  border-radius: 10px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.admin-prize-name {
  font-family: 'Noto Serif TC', serif;
  font-weight: 700;
  color: var(--gold);
  font-size: 1rem;
  flex: 1;
}
.admin-prize-rem { font-size: 0.82rem; color: rgba(255,255,255,0.5); }
.admin-prize-rem b { color: var(--gold); }
.admin-prize-rem.all-done { color: rgba(255,255,255,0.25); }
.admin-count-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.admin-count-btn {
  width: 30px; height: 30px;
  border-radius: 50%;
  border: 1px solid rgba(255,215,0,0.25);
  background: rgba(255,215,0,0.06);
  color: var(--gold);
  font-size: 1rem;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s;
}
.admin-count-btn:hover:not(:disabled) { background: rgba(255,215,0,0.15); }
.admin-count-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.admin-count-display {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 1.6rem;
  color: var(--gold);
  min-width: 30px;
  text-align: center;
}
.admin-draw-btn {
  padding: 14px;
  border-radius: 12px;
  border: 2px solid rgba(255,215,0,0.3);
  background: linear-gradient(135deg, rgba(184,134,11,0.2), rgba(255,215,0,0.12));
  color: var(--gold);
  font-family: 'Bebas Neue', sans-serif;
  font-size: 1.3rem;
  letter-spacing: 0.15em;
  cursor: pointer;
  transition: all 0.2s;
  display: flex; align-items: center; justify-content: center; gap: 8px;
}
.admin-draw-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, rgba(184,134,11,0.35), rgba(255,215,0,0.2));
  border-color: var(--gold);
}
.admin-draw-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.admin-draw-btn.spinning { animation: draw-pulse 1s ease-in-out infinite; cursor: not-allowed; }
@keyframes draw-pulse {
  0%, 100% { border-color: rgba(255,215,0,0.3); }
  50%       { border-color: var(--gold); box-shadow: 0 0 16px rgba(255,215,0,0.2); }
}
.btn-spinner-sm {
  width: 18px; height: 18px;
  border: 2px solid rgba(255,215,0,0.2);
  border-top-color: var(--gold);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.admin-peer-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.78rem;
  color: var(--text-muted);
  flex-wrap: wrap;
}
.preset-btn {
  padding: 3px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255,215,0,0.2);
  background: transparent;
  color: var(--text-muted);
  font-family: 'Noto Serif TC', serif;
  font-size: 0.82rem;
  cursor: pointer;
  transition: all 0.15s;
}
.preset-btn:hover:not(:disabled) { border-color: rgba(255,215,0,0.4); color: var(--text-light); }
.preset-btn.active { background: rgba(255,215,0,0.12); border-color: var(--gold-dark); color: var(--gold); font-weight: 700; }
.preset-btn:disabled { opacity: 0.2; cursor: not-allowed; }

/* ── Participants tab ── */
.admin-textarea {
  width: 100%;
  height: 200px;
  background: var(--bg-card2);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px;
  color: var(--text-light);
  font-family: 'Noto Serif TC', serif;
  font-size: 0.85rem;
  padding: 12px;
  resize: vertical;
  outline: none;
  line-height: 1.8;
  transition: border-color 0.2s;
}
.admin-textarea:focus { border-color: rgba(255,215,0,0.35); }
.admin-textarea.large { height: 320px; }
.count-info {
  margin-top: 8px;
  font-size: 0.78rem;
  color: var(--text-muted);
  text-align: right;
}
.divider {
  border: none;
  border-top: 1px solid rgba(255,255,255,0.06);
  margin: 24px 0;
}
.form-qr-row {
  display: flex;
  gap: 24px;
  align-items: flex-start;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.form-qr-hint {
  flex: 1;
  min-width: 180px;
  color: var(--text-muted);
  font-size: 0.82rem;
  line-height: 2;
  padding-top: 4px;
}
.form-link {
  display: block;
  margin-top: 8px;
  font-size: 0.78rem;
  color: var(--gold-dark);
  text-decoration: none;
  text-align: center;
}
.form-link:hover { color: var(--gold); text-decoration: underline; }

/* ── Prizes tab ── */
.prize-rows { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
.prize-card {
  background: var(--bg-card2);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px;
  overflow: hidden;
}
.prize-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
}
.tag-row {
  display: flex;
  gap: 4px;
  padding: 8px 12px 6px;
  flex-wrap: wrap;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.tag-btn {
  padding: 3px 10px;
  border-radius: 20px;
  border: 1px solid rgba(255,255,255,0.1);
  background: transparent;
  color: var(--text-muted);
  font-family: 'Noto Serif TC', serif;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.tag-btn:hover { border-color: rgba(255,215,0,0.3); color: var(--text-light); }
.tag-btn.active {
  background: rgba(255,215,0,0.12);
  border-color: var(--gold-dark);
  color: var(--gold);
  font-weight: 700;
}
.cash-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px;
  background: rgba(255,215,0,0.04);
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.cash-btn {
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid rgba(255,215,0,0.2);
  background: transparent;
  color: var(--gold-dark);
  font-family: 'Noto Serif TC', serif;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.15s;
}
.cash-btn:hover { background: rgba(255,215,0,0.1); border-color: var(--gold); color: var(--gold); }
.cash-amount {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 1.1rem;
  color: var(--gold);
  letter-spacing: 0.1em;
  min-width: 90px;
  text-align: center;
}
.rank-input {
  width: 44px;
  background: transparent;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 6px;
  color: var(--text-light);
  font-size: 1.1rem;
  padding: 4px;
  text-align: center;
  outline: none;
}
.name-input {
  flex: 1;
  background: transparent;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 6px;
  color: var(--text-light);
  font-family: 'Noto Serif TC', serif;
  font-size: 0.9rem;
  padding: 6px 10px;
  outline: none;
  transition: border-color 0.2s;
}
.name-input:focus { border-color: rgba(255,215,0,0.35); }
.total-wrap { display: flex; align-items: center; gap: 6px; }
.total-label { font-size: 0.75rem; color: var(--text-muted); white-space: nowrap; }
.total-input {
  width: 56px;
  background: transparent;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 6px;
  color: var(--text-light);
  font-family: 'Noto Serif TC', serif;
  font-size: 0.9rem;
  padding: 6px 8px;
  outline: none;
  text-align: center;
}
.won-label { font-size: 0.75rem; color: var(--text-muted); white-space: nowrap; min-width: 70px; }
.icon-btn {
  background: transparent;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 6px;
  color: var(--text-muted);
  font-size: 0.8rem;
  width: 28px; height: 28px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex; align-items: center; justify-content: center;
}
.icon-btn.danger:hover { background: rgba(200,0,0,0.2); border-color: rgba(200,0,0,0.4); color: #ff6666; }
.add-btn {
  background: rgba(255,215,0,0.08);
  border: 1px dashed rgba(255,215,0,0.3);
  border-radius: 10px;
  color: var(--gold-dark);
  font-family: 'Noto Serif TC', serif;
  font-size: 0.85rem;
  padding: 10px;
  width: 100%;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
}
.add-btn:hover { background: rgba(255,215,0,0.15); border-color: var(--gold); color: var(--gold); }

/* ── VIP tab ── */
.vip-cols {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}
.vip-col { flex: 1; min-width: 220px; }
.vip-label {
  font-size: 0.85rem;
  font-weight: 700;
  margin-bottom: 6px;
}
.vip-label.gold  { color: var(--gold); }
.vip-label.muted { color: var(--text-muted); }

/* ── Winners tab ── */
.empty-hint { color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 32px; }
.winners-table { border-radius: 10px; overflow: hidden; border: 1px solid rgba(255,255,255,0.06); }
.table-head, .table-row {
  display: grid;
  grid-template-columns: 48px 1fr 2fr 80px;
  gap: 0;
}
.table-head {
  background: rgba(255,215,0,0.07);
  padding: 10px 14px;
  font-size: 0.75rem;
  color: var(--text-muted);
  letter-spacing: 0.08em;
}
.table-head span, .table-row span { padding: 0 4px; }
.table-row {
  padding: 10px 14px;
  font-size: 0.85rem;
  border-top: 1px solid rgba(255,255,255,0.04);
  transition: background 0.15s;
}
.table-row:hover { background: rgba(255,255,255,0.03); }
.cell-num  { color: var(--text-muted); font-size: 0.78rem; }
.cell-name { font-weight: 700; }
.cell-prize { color: var(--text-muted); font-size: 0.82rem; }
.cell-vip  { color: var(--gold-dark); font-size: 0.75rem; }

.action-btn {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  color: var(--text-muted);
  font-family: 'Noto Serif TC', serif;
  font-size: 0.8rem;
  padding: 6px 14px;
  cursor: pointer;
  transition: all 0.2s;
}
.action-btn:hover { background: rgba(255,255,255,0.12); color: var(--text-light); }
.action-btn.danger { border-color: rgba(200,0,0,0.25); color: #cc6666; }
.action-btn.danger:hover { background: rgba(200,0,0,0.2); border-color: rgba(200,0,0,0.4); color: #ff6666; }
.action-btn.gold { border-color: rgba(255,215,0,0.25); color: var(--gold-dark); }
.action-btn.gold:hover { background: rgba(255,215,0,0.1); border-color: var(--gold); color: var(--gold); }
.export-btn { font-weight: 700; padding: 6px 18px; }

/* 報名截止時間 */
.deadline-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  flex-wrap: wrap;
}
.deadline-label { font-size: 0.8rem; color: var(--text-muted); white-space: nowrap; }
.deadline-input {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,215,0,0.2);
  border-radius: 8px;
  color: var(--text-light);
  font-family: 'Noto Serif TC', serif;
  font-size: 0.85rem;
  padding: 6px 10px;
  outline: none;
  color-scheme: dark;
}
.deadline-input:focus { border-color: rgba(255,215,0,0.5); }
.deadline-clear {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.9rem;
  padding: 2px 6px;
}
.deadline-clear:hover { color: #ff6666; }
.deadline-hint { font-size: 0.75rem; color: var(--gold-dark); margin-top: 4px; }

/* Sync error highlight */
.sync-error-highlight .sync-label { color: #ff6666; font-weight: 700; }

/* ── 值班人員 Modal ── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}
.duty-modal {
  background: var(--card);
  border: 1px solid rgba(255,215,0,0.2);
  border-radius: 16px;
  padding: 24px;
  width: 90%;
  max-width: 560px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.duty-modal-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--gold);
}
.duty-modal-hint {
  font-size: 0.78rem;
  color: var(--text-muted);
  margin-top: -8px;
}
.duty-unit-list {
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.duty-unit-group {
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 10px;
  padding: 12px 14px;
}
.duty-unit-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.duty-unit-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--gold-dark);
  cursor: pointer;
}
.duty-unit-count {
  font-size: 0.75rem;
  color: var(--text-muted);
}
.duty-member-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.duty-member-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 20px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.duty-member-item:hover { background: rgba(255,255,255,0.07); }
.duty-member-item.selected {
  background: rgba(255,215,0,0.12);
  border-color: rgba(255,215,0,0.4);
  color: var(--gold);
}
.duty-member-item input { display: none; }
.duty-modal-footer {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-top: 4px;
  border-top: 1px solid rgba(255,255,255,0.06);
}
.duty-selected-count {
  flex: 1;
  font-size: 0.82rem;
  color: var(--text-muted);
}

/* VIP entry link */
.vip-entry-link {
  font-size: 0.75rem;
  color: rgba(255,215,0,0.35);
  text-decoration: none;
  border: 1px solid rgba(255,215,0,0.12);
  border-radius: 6px;
  padding: 4px 10px;
  transition: all 0.2s;
  white-space: nowrap;
  letter-spacing: 0.08em;
}
.vip-entry-link:hover { color: var(--gold-dark); border-color: rgba(255,215,0,0.3); background: rgba(255,215,0,0.05); }

/* Claims filter select */
.claim-filter-select {
  background: var(--bg-card2);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  color: var(--text-light);
  font-family: 'Noto Serif TC', serif;
  font-size: 0.82rem;
  padding: 6px 10px;
  outline: none;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
  transition: border-color 0.2s;
}
.claim-filter-select:focus { border-color: rgba(255,215,0,0.3); }
.claim-filter-select option { background: #1a1a1a; }
.import-msg {
  font-size: 0.8rem;
  padding: 8px 12px;
  border-radius: 8px;
  margin-bottom: 8px;
}
.import-msg.ok  { background: rgba(76,175,80,0.1);  border: 1px solid rgba(76,175,80,0.25);  color: #81c784; }
.import-msg.err { background: rgba(200,0,0,0.1);    border: 1px solid rgba(200,0,0,0.25);    color: #ff6b6b; }

/* ── 兌獎管理 ── */
.claim-search {
  background: var(--bg-card2);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  color: var(--text-light);
  font-family: 'Noto Serif TC', serif;
  font-size: 0.82rem;
  padding: 6px 12px;
  outline: none;
  width: 180px;
  transition: border-color 0.2s;
}
.claim-search:focus { border-color: rgba(255,215,0,0.3); }
.claim-loading { color: var(--text-muted); font-size: 0.85rem; padding: 20px 0; text-align: center; }
.claim-err     { color: #ff6b6b; font-size: 0.85rem; padding: 12px 0; }
.claim-stats {
  font-size: 0.82rem;
  color: var(--text-muted);
  margin-bottom: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.claim-stats b { color: var(--text-light); }
.all-claimed-badge {
  font-size: 0.75rem;
  background: rgba(76,175,80,0.12);
  border: 1px solid rgba(76,175,80,0.3);
  border-radius: 6px;
  color: #81c784;
  padding: 2px 8px;
}
.claim-table {
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px;
  overflow: hidden;
}
.claim-head {
  display: grid;
  grid-template-columns: 90px 60px 1fr 140px;
  padding: 10px 14px;
  background: rgba(255,255,255,0.04);
  font-size: 0.72rem;
  color: var(--text-muted);
  letter-spacing: 0.08em;
  gap: 8px;
}
.claim-row {
  display: grid;
  grid-template-columns: 90px 60px 1fr 140px;
  padding: 11px 14px;
  font-size: 0.85rem;
  border-top: 1px solid rgba(255,255,255,0.04);
  align-items: center;
  gap: 8px;
  transition: background 0.15s;
}
.claim-row:hover { background: rgba(255,255,255,0.025); }
.claim-row.is-claimed { opacity: 0.5; }
.cl-name { font-weight: 700; }
.cl-vip  { color: var(--gold-dark); font-size: 0.75rem; margin-left: 4px; }
.cl-unit { color: var(--text-muted); font-size: 0.8rem; }
.cl-prize { color: var(--text-muted); font-size: 0.82rem; }
.cl-action { display: flex; align-items: center; }
.claim-btn {
  background: rgba(76,175,80,0.12);
  border: 1px solid rgba(76,175,80,0.35);
  border-radius: 7px;
  color: #81c784;
  font-family: 'Noto Serif TC', serif;
  font-size: 0.78rem;
  padding: 5px 10px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}
.claim-btn:hover { background: rgba(76,175,80,0.22); border-color: rgba(76,175,80,0.6); }
.claimed-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.78rem;
  color: #81c784;
}
.claimed-at {
  font-size: 0.68rem;
  color: rgba(255,255,255,0.2);
}
.unclaim-btn {
  background: none;
  border: none;
  color: rgba(255,255,255,0.2);
  font-size: 0.75rem;
  cursor: pointer;
  padding: 0 3px;
  margin-left: 2px;
  transition: color 0.15s;
}
.unclaim-btn:hover { color: #ff6b6b; }
</style>
