import { ref, watch } from 'vue'

const DEFAULT_PARTICIPANTS =
  '王小明\n李大華\n張美玲\n陳小花\n林大偉\n黃雅婷\n吳志明\n劉淑芬\n周建宏\n蔡雅玲'

const DEFAULT_PRIZES = [
  { id: 1, name: '頭獎 · MacBook Pro', total: 1, winners: [], rank: '🥇' },
  { id: 2, name: '貳獎 · iPhone 15',   total: 2, winners: [], rank: '🥈' },
  { id: 3, name: '參獎 · AirPods Pro', total: 3, winners: [], rank: '🥉' },
  { id: 4, name: '紀念獎 · 禮券',       total: 5, winners: [], rank: '🎁' },
]

function storedRef(key, defaultVal) {
  let raw = null
  try { raw = localStorage.getItem(key) } catch {}
  const r = ref(raw !== null ? JSON.parse(raw) : defaultVal)

  watch(r, val => {
    try { localStorage.setItem(key, JSON.stringify(val)) } catch {}
  }, { deep: true })

  // storage event fires only in OTHER tabs — no infinite-loop risk
  window.addEventListener('storage', e => {
    if (e.key === key && e.newValue !== null) {
      try { r.value = JSON.parse(e.newValue) } catch {}
    }
  })

  return r
}

export function useSharedState() {
  return {
    participantsRaw: storedRef('lottery_participants',   DEFAULT_PARTICIPANTS),
    prizes:          storedRef('lottery_prizes',         DEFAULT_PRIZES),
    allWinners:      storedRef('lottery_winners',        []),
    vipGuarantee:    storedRef('lottery_vip_guarantee',  ''),
    vipExclude:      storedRef('lottery_vip_exclude',    ''),
    employeeList:    storedRef('lottery_employee_list',  ''),
    eventTitle:      storedRef('lottery_event_title',    '尾牙抽獎大會'),
  }
}
