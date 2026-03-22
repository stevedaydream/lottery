/**
 * GAS (Google Apps Script) 同步層
 *
 * - 頁面載入時：從 GAS 拉取最新資料（覆蓋 localStorage 舊快取）
 * - 資料變更時：2 秒防抖後推送至 GAS
 * - 使用 no-cors 送出 POST（fire-and-forget），GET 正常讀取
 */

import { ref, watch } from 'vue'

const GAS_URL = import.meta.env.VITE_GAS_URL || ''
const DEBOUNCE_MS = 2000

export function useGASSync(state) {
  const syncing  = ref(false)
  const syncErr  = ref('')
  const lastSync = ref(null)
  let saveTimer  = null
  let saveSkip   = false // prevent watch from re-saving after a GAS fetch

  // ── Fetch (GAS → local) ──
  async function fetchAll() {
    if (!GAS_URL) return
    syncing.value = true
    syncErr.value = ''
    try {
      const res  = await fetch(`${GAS_URL}?action=get`, { redirect: 'follow' })
      const json = await res.json()
      if (!json.ok) { syncErr.value = json.error || 'GAS error'; return }

      const d = json.data || {}
      saveSkip = true
      if (typeof d.participants === 'string')   state.participantsRaw.value = d.participants
      if (Array.isArray(d.prizes))              state.prizes.value         = d.prizes
      if (Array.isArray(d.winners))             state.allWinners.value     = d.winners
      if (typeof d.vipGuarantee === 'string')   state.vipGuarantee.value   = d.vipGuarantee
      if (typeof d.vipExclude === 'string')     state.vipExclude.value     = d.vipExclude
      if (typeof d.employeeList === 'string')   state.employeeList.value   = d.employeeList
      if (typeof d.eventTitle === 'string')     state.eventTitle.value     = d.eventTitle
      saveSkip = false

      lastSync.value = new Date()
    } catch (err) {
      syncErr.value = err.message
    } finally {
      syncing.value = false
    }
  }

  // ── Save (local → GAS) ──
  function scheduleSave() {
    if (!GAS_URL || saveSkip) return
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      const body = JSON.stringify({
        action: 'save',
        data: {
          participants: state.participantsRaw.value,
          prizes:       state.prizes.value,
          winners:      state.allWinners.value,
          vipGuarantee: state.vipGuarantee.value,
          vipExclude:   state.vipExclude.value,
          employeeList: state.employeeList.value,
          eventTitle:   state.eventTitle.value,
        },
      })
      // no-cors: GAS still processes the request, we just can't read the response
      fetch(GAS_URL, { method: 'POST', body, mode: 'no-cors' })
        .then(() => { lastSync.value = new Date() })
        .catch(() => {})
    }, DEBOUNCE_MS)
  }

  // Watch all shared state
  watch(
    [state.participantsRaw, state.prizes, state.allWinners, state.vipGuarantee, state.vipExclude, state.employeeList, state.eventTitle],
    scheduleSave,
    { deep: true }
  )

  // Initial load
  fetchAll()

  return { syncing, syncErr, lastSync, fetchAll }
}
