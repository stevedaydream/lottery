<template>
  <div class="vip-root">

    <!-- ── Login ── -->
    <div v-if="!authed" class="login-wrap">
      <div class="login-card">
        <div class="login-logo">✦</div>
        <div class="login-title">黑箱登入</div>
        <div class="login-sub">僅限授權帳號存取</div>
        <div v-if="clientId" id="vip-signin-btn" class="signin-btn-wrap"></div>
        <div v-else class="config-warn">尚未設定 <code>VITE_GOOGLE_CLIENT_ID</code></div>
        <div v-if="authError" class="auth-error">{{ authError }}</div>
      </div>
    </div>

    <!-- ── VIP Panel ── -->
    <div v-else class="vip-panel">

      <div class="vip-header">
        <div class="vip-title">✦ VIP 黑箱設定</div>
        <div class="sync-status">
          <span v-if="syncing" class="sync-dot syncing">⟳</span>
          <span v-else-if="syncErr" class="sync-dot err" :title="syncErr">!</span>
          <span v-else-if="lastSync" class="sync-dot ok">✓</span>
          <span class="sync-label" @click="fetchAll" style="cursor:pointer">
            {{ syncErr ? 'GAS 錯誤' : lastSync ? `${lastSync.toLocaleTimeString()} 同步` : 'GAS 未設定' }}
          </span>
        </div>
        <div class="vip-user">{{ userEmail }}</div>
        <button class="logout-btn" @click="logout">登出</button>
      </div>

      <div class="vip-cols">

        <!-- ── 保送名單 ── -->
        <div class="vip-col">
          <div class="col-title gold">✦ 保送名單（必中）</div>
          <div class="col-hint">指定人員配對獎項，抽到該獎時必定出線；不指定獎項則任何獎皆優先</div>

          <!-- 現有條目 -->
          <div class="entry-list">
            <div v-if="!guaranteeEntries.length" class="empty-hint">尚無保送設定</div>
            <div v-for="(g, i) in guaranteeEntries" :key="i" class="entry-row">
              <span class="entry-name">{{ g.name }}</span>
              <span class="entry-arrow">→</span>
              <span class="entry-prize" :class="{ any: !g.prizeName }">
                {{ g.prizeName || '任意獎項' }}
              </span>
              <button class="del-btn" @click="removeGuarantee(i)">✕</button>
            </div>
          </div>

          <!-- 新增表單 -->
          <div v-if="!showAddGuarantee" class="add-row">
            <button class="add-btn" @click="showAddGuarantee = true">＋ 新增保送</button>
          </div>
          <div v-else class="add-form">
            <select class="form-select" v-model="newG.name">
              <option value="">— 選擇人員 —</option>
              <option v-for="p in participantList" :key="p" :value="p">{{ p }}</option>
            </select>
            <select class="form-select" v-model="newG.prizeName">
              <option value="">任意獎項</option>
              <option v-for="p in prizes" :key="p.id" :value="p.name">
                {{ p.rank }} {{ p.name }}
              </option>
            </select>
            <div class="form-btns">
              <button class="confirm-btn" @click="addGuarantee" :disabled="!newG.name">確認</button>
              <button class="cancel-btn" @click="cancelAddG">取消</button>
            </div>
          </div>
        </div>

        <!-- ── 排除名單 ── -->
        <div class="vip-col">
          <div class="col-title muted">✕ 排除名單（不抽）</div>
          <div class="col-hint">選定人員不參與抽獎</div>

          <!-- 現有條目 -->
          <div class="entry-list">
            <div v-if="!excludeEntries.length" class="empty-hint">尚無排除設定</div>
            <div v-for="(name, i) in excludeEntries" :key="i" class="entry-row">
              <span class="entry-name">{{ name }}</span>
              <button class="del-btn" @click="removeExclude(i)">✕</button>
            </div>
          </div>

          <!-- 新增表單 -->
          <div v-if="!showAddExclude" class="add-row">
            <button class="add-btn" @click="showAddExclude = true">＋ 新增排除</button>
          </div>
          <div v-else class="add-form">
            <select class="form-select" v-model="newExcludeName">
              <option value="">— 選擇人員 —</option>
              <option v-for="p in availableForExclude" :key="p" :value="p">{{ p }}</option>
            </select>
            <div class="form-btns">
              <button class="confirm-btn" @click="addExclude" :disabled="!newExcludeName">確認</button>
              <button class="cancel-btn" @click="cancelAddE">取消</button>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useSharedState } from '../composables/useSharedState'
import { useGASSync } from '../composables/useGASSync'

const sharedState = useSharedState()
const { vipGuarantee, vipExclude, participantsRaw, prizes } = sharedState
const { syncing, syncErr, lastSync, fetchAll } = useGASSync(sharedState)

const clientId   = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const adminEmail = import.meta.env.VITE_ADMIN_EMAIL || ''
const authed     = ref(false)
const userEmail  = ref('')
const authError  = ref('')

// ── Participants ──
const participantList = computed(() =>
  participantsRaw.value.split('\n').map(s => s.trim()).filter(Boolean)
)

// ── Guarantee list ──
const guaranteeEntries = computed(() =>
  vipGuarantee.value
    .split('\n')
    .map(s => {
      const [name, prizeName = ''] = s.split(',').map(p => p.trim())
      return { name, prizeName }
    })
    .filter(g => g.name)
)

function serializeGuarantee(entries) {
  return entries.map(g => g.prizeName ? `${g.name}, ${g.prizeName}` : g.name).join('\n')
}

const showAddGuarantee = ref(false)
const newG = ref({ name: '', prizeName: '' })

function addGuarantee() {
  if (!newG.value.name) return
  const entries = [...guaranteeEntries.value, { ...newG.value }]
  vipGuarantee.value = serializeGuarantee(entries)
  cancelAddG()
}
function removeGuarantee(idx) {
  const entries = guaranteeEntries.value.filter((_, i) => i !== idx)
  vipGuarantee.value = serializeGuarantee(entries)
}
function cancelAddG() {
  showAddGuarantee.value = false
  newG.value = { name: '', prizeName: '' }
}

// ── Exclude list ──
const excludeEntries = computed(() =>
  vipExclude.value.split('\n').map(s => s.trim()).filter(Boolean)
)

// Only show participants not already excluded
const availableForExclude = computed(() =>
  participantList.value.filter(n => !excludeEntries.value.includes(n))
)

const showAddExclude   = ref(false)
const newExcludeName   = ref('')

function addExclude() {
  if (!newExcludeName.value) return
  const entries = [...excludeEntries.value, newExcludeName.value]
  vipExclude.value = entries.join('\n')
  cancelAddE()
}
function removeExclude(idx) {
  const entries = excludeEntries.value.filter((_, i) => i !== idx)
  vipExclude.value = entries.join('\n')
}
function cancelAddE() {
  showAddExclude.value = false
  newExcludeName.value = ''
}

// ── Auth ──
function decodeJwt(token) {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
  } catch { return null }
}
function handleCredentialResponse(response) {
  const payload = decodeJwt(response.credential)
  if (!payload) { authError.value = '登入失敗，請重試'; return }
  if (adminEmail && payload.email !== adminEmail) {
    authError.value = `此帳號（${payload.email}）無存取權限`
    return
  }
  userEmail.value = payload.email
  authed.value = true
  sessionStorage.setItem('lottery_vip_authed', payload.email)
}
function logout() {
  authed.value = false
  userEmail.value = ''
  sessionStorage.removeItem('lottery_vip_authed')
}

onMounted(() => {
  const saved = sessionStorage.getItem('lottery_vip_authed')
  if (saved && (!adminEmail || saved === adminEmail)) {
    userEmail.value = saved; authed.value = true; return
  }
  if (!clientId) return
  const script = document.createElement('script')
  script.src = 'https://accounts.google.com/gsi/client'
  script.async = true
  script.onload = () => {
    window.google.accounts.id.initialize({ client_id: clientId, callback: handleCredentialResponse })
    window.google.accounts.id.renderButton(
      document.getElementById('vip-signin-btn'),
      { theme: 'filled_black', size: 'large', text: 'signin_with', locale: 'zh-TW' }
    )
  }
  document.head.appendChild(script)
})
</script>

<style scoped>
.vip-root { min-height:100vh; background:var(--bg-dark); color:var(--text-light); font-family:'Noto Serif TC',serif; }

/* Login */
.login-wrap { min-height:100vh; display:flex; align-items:center; justify-content:center; background:radial-gradient(ellipse 60% 50% at 50% 0%,rgba(200,160,0,.07) 0%,transparent 60%); }
.login-card { background:var(--bg-card); border:1px solid rgba(255,215,0,.15); border-radius:20px; padding:48px 40px; text-align:center; width:340px; max-width:90vw; }
.login-logo { font-size:2.5rem; color:var(--gold); margin-bottom:12px; }
.login-title { font-family:'Bebas Neue',sans-serif; font-size:1.8rem; letter-spacing:.2em; color:var(--gold); margin-bottom:6px; }
.login-sub { font-size:.8rem; color:var(--text-muted); letter-spacing:.1em; margin-bottom:28px; }
.signin-btn-wrap { display:flex; justify-content:center; min-height:44px; }
.config-warn { font-size:.8rem; color:#f0a040; background:rgba(240,160,64,.08); border:1px solid rgba(240,160,64,.2); border-radius:8px; padding:12px; font-family:monospace; }
.auth-error { margin-top:14px; font-size:.8rem; color:#ff6666; }

/* Panel */
.vip-panel { max-width:860px; margin:0 auto; padding:32px 20px 48px; }
.vip-header { display:flex; align-items:center; gap:12px; margin-bottom:28px; padding-bottom:16px; border-bottom:1px solid rgba(255,215,0,.1); }
.vip-title { font-family:'Bebas Neue',sans-serif; font-size:1.5rem; letter-spacing:.15em; color:var(--gold); flex:1; }
.vip-user { font-size:.78rem; color:var(--text-muted); }
.logout-btn { background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.1); border-radius:8px; color:var(--text-muted); font-family:'Noto Serif TC',serif; font-size:.8rem; padding:6px 14px; cursor:pointer; transition:all .2s; }
.logout-btn:hover { background:rgba(255,255,255,.1); color:var(--text-light); }
.sync-status { display:flex; align-items:center; gap:6px; }
.sync-dot { font-size:.85rem; }
.sync-dot.syncing { color:var(--gold); animation:spin 1s linear infinite; }
.sync-dot.ok { color:#4caf50; }
.sync-dot.err { color:#ff6666; }
.sync-label { font-size:.72rem; color:var(--text-muted); }
@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }

/* Columns */
.vip-cols { display:flex; gap:20px; flex-wrap:wrap; align-items:flex-start; }
.vip-col { flex:1; min-width:280px; background:var(--bg-card); border:1px solid rgba(255,215,0,.1); border-radius:16px; padding:20px; }
.col-title { font-size:.9rem; font-weight:700; margin-bottom:6px; }
.col-title.gold { color:var(--gold); }
.col-title.muted { color:var(--text-muted); }
.col-hint { font-size:.75rem; color:var(--text-muted); margin-bottom:14px; line-height:1.7; }

/* Entry list */
.entry-list { display:flex; flex-direction:column; gap:6px; margin-bottom:12px; min-height:40px; }
.empty-hint { font-size:.78rem; color:#444; text-align:center; padding:16px 0; }
.entry-row { display:flex; align-items:center; gap:8px; background:var(--bg-card2); border:1px solid rgba(255,255,255,.06); border-radius:8px; padding:8px 12px; }
.entry-name { font-size:.88rem; font-weight:700; flex-shrink:0; }
.entry-arrow { color:var(--text-muted); font-size:.8rem; }
.entry-prize { flex:1; font-size:.82rem; color:var(--gold-dark); }
.entry-prize.any { color:#555; font-style:italic; }
.del-btn { background:transparent; border:none; color:#555; font-size:.8rem; cursor:pointer; padding:2px 4px; transition:color .15s; flex-shrink:0; }
.del-btn:hover { color:#ff6666; }

/* Add form */
.add-row { display:flex; }
.add-btn { flex:1; padding:8px; background:rgba(255,215,0,.06); border:1px dashed rgba(255,215,0,.25); border-radius:8px; color:var(--gold-dark); font-family:'Noto Serif TC',serif; font-size:.82rem; cursor:pointer; transition:all .2s; text-align:center; }
.add-btn:hover { background:rgba(255,215,0,.12); border-color:var(--gold); color:var(--gold); }
.add-form { display:flex; flex-direction:column; gap:8px; background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.07); border-radius:10px; padding:12px; }
.form-select { width:100%; background:var(--bg-card2); border:1px solid rgba(255,255,255,.1); border-radius:8px; color:var(--text-light); font-family:'Noto Serif TC',serif; font-size:.88rem; padding:8px 10px; outline:none; cursor:pointer; -webkit-appearance:none; appearance:none; transition:border-color .2s; }
.form-select:focus { border-color:rgba(255,215,0,.35); }
.form-select option { background:#1a1a1a; }
.form-btns { display:flex; gap:8px; }
.confirm-btn { flex:1; padding:8px; background:linear-gradient(135deg,var(--gold-dark),var(--gold)); border:none; border-radius:8px; color:#000; font-family:'Noto Serif TC',serif; font-weight:700; font-size:.85rem; cursor:pointer; transition:opacity .2s; }
.confirm-btn:hover:not(:disabled) { opacity:.85; }
.confirm-btn:disabled { opacity:.4; cursor:not-allowed; }
.cancel-btn { padding:8px 16px; background:transparent; border:1px solid rgba(255,255,255,.1); border-radius:8px; color:var(--text-muted); font-family:'Noto Serif TC',serif; font-size:.85rem; cursor:pointer; transition:all .2s; }
.cancel-btn:hover { background:rgba(255,255,255,.07); color:var(--text-light); }
</style>
