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
      if (typeof d.participants === 'string') {
        state.participantsRaw.value = d.participants
        lastFetchedParticipants = d.participants
      }
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

  // 上次從 GAS fetch 回來時的參與者快照，用來判斷管理員「新增了誰」或「刪除了誰」
  let lastFetchedParticipants = null

  // ── Save (local → GAS) ──
  function scheduleSave() {
    if (!GAS_URL || saveSkip) return
    clearTimeout(saveTimer)
    saveTimer = setTimeout(async () => {
      let mergedParticipants = state.participantsRaw.value

      // 若有上次 fetch 快照，可精確計算管理員的異動，再與 GAS 最新狀態合併
      // 目的：保留表單新報名者，同時尊重管理員的新增/刪除
      if (lastFetchedParticipants !== null) {
        try {
          const res  = await fetch(`${GAS_URL}?action=get`, { redirect: 'follow' })
          const json = await res.json()
          if (json.ok && typeof json.data?.participants === 'string') {
            const gasNames      = new Set(json.data.participants.split('\n').map(s => s.trim()).filter(Boolean))
            const fetchedNames  = new Set(lastFetchedParticipants.split('\n').map(s => s.trim()).filter(Boolean))
            const localNames    = new Set(state.participantsRaw.value.split('\n').map(s => s.trim()).filter(Boolean))

            // 管理員主動刪除的人 = 上次 fetch 有、現在本地沒有
            const adminRemoved = new Set([...fetchedNames].filter(n => !localNames.has(n)))
            // 管理員主動新增的人 = 上次 fetch 沒有、現在本地有
            const adminAdded   = new Set([...localNames].filter(n => !fetchedNames.has(n)))

            // 結果 = (GAS 名單 ∪ 管理員新增) - 管理員刪除
            const merged = [...new Set([...gasNames, ...adminAdded])].filter(n => !adminRemoved.has(n))
            mergedParticipants = merged.join('\n')

            // 靜默同步回本地顯示
            if (mergedParticipants !== state.participantsRaw.value) {
              saveSkip = true
              state.participantsRaw.value = mergedParticipants
              lastFetchedParticipants = mergedParticipants
              saveSkip = false
            } else {
              lastFetchedParticipants = mergedParticipants
            }
          }
        } catch {
          // 合併失敗就用本地值，不阻塞存檔
        }
      }

      const body = JSON.stringify({
        action: 'save',
        data: {
          participants: mergedParticipants,
          prizes:       state.prizes.value,
          winners:      state.allWinners.value,
          vipGuarantee: state.vipGuarantee.value,
          vipExclude:   state.vipExclude.value,
          employeeList: state.employeeList.value,
          eventTitle:   state.eventTitle.value,
        },
      })
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
