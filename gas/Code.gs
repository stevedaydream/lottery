/**
 * 尾牙抽獎系統 - Google Apps Script 後端
 * doGet ?action=get        → 管理 API（完整 JSON）
 * doGet ?action=check&code → 兌獎查詢（按兌獎碼）
 * doGet (無參數)            → 報名表單（HTML）
 * doPost action=save        → 管理員儲存資料
 * doPost action=claimPrize  → 標記已兌獎
 * doPost action=unclaimPrize→ 取消兌獎標記
 * google.script.run         → registerParticipant（表單送出，無 CORS）
 *
 * 試算表結構（一張分頁一種資料，一列一筆）：
 *   設定        項目 | 值
 *   獎項        ID | 等第 | 獎項名稱 | 名額 | 已抽
 *   抽獎名單    姓名 | 來源（報名／手動／值班）
 *   中獎紀錄    序號 | 姓名 | 獎項 | 保送 | 中獎時間 | 已兌獎 | 兌獎時間
 *   VIP         姓名 | 類型（保送／後順位）| 指定獎項
 *   報名名單    姓名 | 單位 | 桌號 | 兌獎碼 | 報名時間
 *   員工白名單  姓名 | 單位 | 值班
 * 對前端的 JSON 格式與舊版相同，轉換都在本檔完成。
 */

const SHEETS = {
  settings:      { name: '設定',       headers: ['項目', '值'] },
  prizes:        { name: '獎項',       headers: ['ID', '等第', '獎項名稱', '名額', '已抽'] },
  participants:  { name: '抽獎名單',   headers: ['姓名', '來源'] },
  winners:       { name: '中獎紀錄',   headers: ['序號', '姓名', '獎項', '保送', '中獎時間', '已兌獎', '兌獎時間'] },
  vip:           { name: 'VIP',        headers: ['姓名', '類型', '指定獎項'] },
  registrations: { name: '報名名單',   headers: ['姓名', '單位', '桌號', '兌獎碼', '報名時間'] },
  employees:     { name: '員工白名單', headers: ['姓名', '單位', '值班'] },
}

// 設定分頁：前端欄位 ↔ 表格顯示名稱
const SETTING_KEYS = [
  ['eventTitle',           '活動標題'],
  ['registrationDeadline', '報名截止時間'],
]

// 舊版 key-value 分頁，遷移後改名保留
const LEGACY_SHEET        = '抽獎資料'
const LEGACY_BACKUP_SHEET = '抽獎資料（舊版備份）'

const YES = '是'

// ── GET ──
function doGet(e) {
  const action = e.parameter.action

  // 完整資料（管理員用）
  if (action === 'get') {
    try {
      return respond({ ok: true, data: readAll() })
    } catch (err) {
      return respond({ ok: false, error: err.message })
    }
  }

  // 兌獎碼查詢（參與者用）
  if (action === 'check') {
    try {
      const code = (e.parameter.code || '').trim().toUpperCase()
      if (!code) return respond({ ok: false, error: '請提供兌獎碼' })

      ensureMigrated()
      const reg = readRegistrations().find(r => r.code === code)
      if (!reg) return respond({ ok: false, error: '找不到此兌獎碼，請確認輸入是否正確' })

      const prizes = readWinnerRows()
        .filter(w => w.name === reg.name)
        .map(w => ({
          prize:     w.prize,
          vip:       w.vip,
          claimed:   w.claimed,
          claimedAt: w.claimedAt,
        }))

      return respond({ ok: true, name: reg.name, unit: reg.unit, prizes })
    } catch (err) {
      return respond({ ok: false, error: err.message })
    }
  }

  // 預設：顯示報名表單
  return HtmlService.createHtmlOutputFromFile('Form')
    .setTitle('尾牙抽獎報名')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
}

// ── POST（管理員 API）──
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents)

    if (body.action === 'save') {
      withLock(() => writeAll(body.data || {}))
      return respond({ ok: true })
    }

    if (body.action === 'claimPrize' || body.action === 'unclaimPrize') {
      const { name, prize } = body
      if (!name || !prize) return respond({ ok: false, error: '缺少參數' })
      withLock(() => setClaimed(name, prize, body.action === 'claimPrize' ? new Date() : null))
      return respond({ ok: true })
    }

    return respond({ ok: false, error: 'Unknown action' })
  } catch (err) {
    return respond({ ok: false, error: err.message })
  }
}

// ── 報名（google.script.run 呼叫，無 CORS 問題）──
function registerParticipant(data) {
  const name  = (data.name  || '').trim()
  const unit  = (data.unit  || '').trim()
  const table = (data.table || '').trim()

  if (!name) return { ok: false, message: '請填寫姓名' }
  if (!/[一-龥]/.test(name)) {
    return { ok: false, message: '請使用中文姓名填寫，例如：王小明' }
  }

  return withLock(() => {
    ensureMigrated()

    // 比對員工白名單
    const employeeNames = readRows('employees').map(r => String(r[0]).trim()).filter(Boolean)
    if (employeeNames.length > 0 && !employeeNames.includes(name)) {
      return { ok: false, message: '查無此員工，請確認是否以中文姓名填寫，或聯絡管理員' }
    }

    // 防止重複報名：已報名則回傳既有兌獎碼
    const registrations = readRegistrations()
    const participantNames = readRows('participants').map(r => String(r[0]).trim())
    if (participantNames.includes(name)) {
      const existing = registrations.find(r => r.name === name)
      return {
        ok:      false,
        message: '您已在抽獎名單中，無需重複報名',
        code:    existing ? existing.code : null,
      }
    }

    const code = generateCode(registrations.map(r => r.code))
    getTable('registrations').appendRow([name, unit, table, code, new Date()])
    getTable('participants').appendRow([name, '報名'])

    const tableMsg = table ? `（桌號：${table}）` : ''
    return { ok: true, message: `${name} 報名成功！${unit}${tableMsg} 已加入抽獎名單`, code }
  })
}

// ── 產生唯一 6 碼兌獎碼（排除易混淆字元）──
function generateCode(existingCodes) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code, attempts = 0
  do {
    code = Array.from({ length: 6 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join('')
    attempts++
  } while (existingCodes.includes(code) && attempts < 200)
  return code
}

// ════════════════════════════════════════
//  讀取：分頁 → 前端 JSON
// ════════════════════════════════════════

function readAll() {
  ensureMigrated()
  const data = {}

  // 設定
  const settings = {}
  readRows('settings').forEach(([label, value]) => { settings[String(label)] = value })
  SETTING_KEYS.forEach(([key, label]) => {
    if (label in settings) data[key] = toText(settings[label])
  })

  // 中獎紀錄（同時產生 winners 與 claimedPrizes）
  const winnerRows = readWinnerRows()
  data.winners = winnerRows.map(w => ({ id: w.id, name: w.name, prize: w.prize, vip: w.vip }))
  data.claimedPrizes = winnerRows
    .filter(w => w.claimed)
    .map(w => ({ name: w.name, prize: w.prize, claimedAt: w.claimedAt }))

  // 獎項（各獎項的中獎者由中獎紀錄推得）
  data.prizes = readRows('prizes')
    .filter(r => String(r[2]).trim())
    .map(r => {
      const name = String(r[2]).trim()
      return {
        id:      Number(r[0]) || String(r[0]),
        rank:    toText(r[1]),
        name,
        total:   Number(r[3]) || 1,
        winners: winnerRows.filter(w => w.prize === name).map(w => w.name),
      }
    })

  // 抽獎名單（來源為「值班」者另組成值班名單）
  const participantRows = readRows('participants').filter(r => String(r[0]).trim())
  data.participants = participantRows.map(r => String(r[0]).trim()).join('\n')
  data.dutyList = participantRows
    .filter(r => String(r[1]).trim() === '值班')
    .map(r => String(r[0]).trim())
    .join('\n')

  // VIP
  const vipRows = readRows('vip').filter(r => String(r[0]).trim())
  data.vipGuarantee = vipRows
    .filter(r => String(r[1]).trim() === '保送')
    .map(r => {
      const name = String(r[0]).trim()
      const prize = String(r[2]).trim()
      return prize ? `${name}, ${prize}` : name
    })
    .join('\n')
  data.vipExclude = vipRows
    .filter(r => String(r[1]).trim() === '後順位')
    .map(r => String(r[0]).trim())
    .join('\n')

  // 報名名單、員工白名單
  data.registrations = readRegistrations()
  data.employeeList = readRows('employees')
    .filter(r => String(r[0]).trim())
    .map(r => [r[0], r[1], r[2]].map(v => String(v).trim()).join(','))
    .join('\n')

  return data
}

function readWinnerRows() {
  return readRows('winners')
    .filter(r => String(r[1]).trim())
    .map(r => ({
      id:        Number(r[0]) || String(r[0]),
      name:      String(r[1]).trim(),
      prize:     String(r[2]).trim(),
      vip:       String(r[3]).trim() === YES,
      wonAt:     r[4],
      claimed:   String(r[5]).trim() === YES,
      claimedAt: toIso(r[6]),
    }))
}

function readRegistrations() {
  return readRows('registrations')
    .filter(r => String(r[0]).trim())
    .map(r => ({
      name:  String(r[0]).trim(),
      unit:  String(r[1]).trim(),
      table: String(r[2]).trim(),
      code:  String(r[3]).trim(),
    }))
}

// ════════════════════════════════════════
//  寫入：前端 JSON → 分頁（只寫有傳入的欄位）
// ════════════════════════════════════════

function writeAll(data) {
  ensureMigrated()

  // 設定：只更新已知項目，保留表中其他列
  const changedSettings = SETTING_KEYS.filter(([key]) => data[key] !== undefined)
  if (changedSettings.length) {
    const rows = readRows('settings')
    changedSettings.forEach(([key, label]) => {
      const row = rows.find(r => String(r[0]) === label)
      if (row) row[1] = String(data[key])
      else rows.push([label, String(data[key])])
    })
    // 值欄以純文字儲存，避免日期被自動轉換格式
    getTable('settings').getRange(2, 2, rows.length, 1).setNumberFormat('@')
    writeRows('settings', rows)
  }

  // 中獎紀錄：沿用既有的中獎時間與兌獎狀態（以 姓名＋獎項 對應）
  if (Array.isArray(data.winners)) {
    const existing = {}
    readWinnerRows().forEach(w => { existing[winnerKey(w.name, w.prize)] = w })
    const now = new Date()
    writeRows('winners', data.winners.map(w => {
      const old = existing[winnerKey(w.name, w.prize)]
      return [
        w.id,
        w.name,
        w.prize,
        w.vip ? YES : '',
        old && old.wonAt ? old.wonAt : now,
        old && old.claimed ? YES : '',
        old && old.claimedAt ? new Date(old.claimedAt) : '',
      ]
    }))
  }

  // 獎項（已抽數以中獎紀錄計算）
  if (Array.isArray(data.prizes)) {
    const winners = Array.isArray(data.winners) ? data.winners : readWinnerRows()
    writeRows('prizes', data.prizes.map(p => [
      p.id,
      p.rank || '',
      p.name,
      Number(p.total) || 1,
      winners.filter(w => w.prize === p.name).length,
    ]))
  }

  // 抽獎名單：依值班名單與報名名單標示來源
  if (typeof data.participants === 'string') {
    const registered = new Set(readRegistrations().map(r => r.name))
    const duty = new Set(splitLines(data.dutyList))
    writeRows('participants', splitLines(data.participants).map(name => [
      name,
      duty.has(name) ? '值班' : registered.has(name) ? '報名' : '手動',
    ]))
  }

  // VIP
  if (typeof data.vipGuarantee === 'string' || typeof data.vipExclude === 'string') {
    const rows = []
    splitLines(data.vipGuarantee).forEach(line => {
      const [name, prize = ''] = line.split(',').map(s => s.trim())
      if (name) rows.push([name, '保送', prize])
    })
    splitLines(data.vipExclude).forEach(name => rows.push([name, '後順位', '']))
    writeRows('vip', rows)
  }

  // 員工白名單
  if (typeof data.employeeList === 'string') {
    writeRows('employees', splitLines(data.employeeList).map(line => {
      const parts = line.split(',').map(s => s.trim())
      return [parts[0] || '', parts[1] || '', parts[2] || '']
    }))
  }
}

// ── 標記（claimedAt 為時間）或取消（null）兌獎 ──
function setClaimed(name, prize, claimedAt) {
  const sheet = getTable('winners')
  readRows('winners').forEach((r, i) => {
    if (String(r[1]).trim() !== name || String(r[2]).trim() !== prize) return
    sheet.getRange(i + 2, 6, 1, 2).setValues([[claimedAt ? YES : '', claimedAt || '']])
  })
}

function winnerKey(name, prize) {
  return name + '\u0000' + prize
}

// ════════════════════════════════════════
//  舊版遷移（「抽獎資料」key-value 分頁 → 新分頁）
// ════════════════════════════════════════

// 新結構尚未建立時自動執行一次
function ensureMigrated() {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  if (ss.getSheetByName(SHEETS.settings.name)) return
  const legacy = ss.getSheetByName(LEGACY_SHEET)
  getTable('settings') // 先建立「設定」，之後不再進入遷移
  if (legacy && legacy.getLastRow() > 0) migrateFromLegacy(legacy)
}

function migrateFromLegacy(legacy) {
  const old = {}
  legacy.getRange(1, 1, legacy.getLastRow(), 2).getValues().forEach(([key, value]) => {
    if (!key) return
    try { old[key] = JSON.parse(value) } catch (e) { old[key] = value }
  })

  writeAll({
    eventTitle:   typeof old.eventTitle === 'string' ? old.eventTitle : undefined,
    winners:      Array.isArray(old.winners) ? old.winners : [],
    prizes:       Array.isArray(old.prizes) ? old.prizes : [],
    participants: typeof old.participants === 'string' ? old.participants : '',
    vipGuarantee: typeof old.vipGuarantee === 'string' ? old.vipGuarantee : '',
    vipExclude:   typeof old.vipExclude === 'string' ? old.vipExclude : '',
  })

  // 補上舊的兌獎紀錄
  ;(Array.isArray(old.claimedPrizes) ? old.claimedPrizes : []).forEach(c => {
    setClaimed(c.name, c.prize, c.claimedAt ? new Date(c.claimedAt) : new Date())
  })

  // 報名名單移除舊的「中獎獎項」「已兌獎獎項」欄（已併入中獎紀錄）
  const reg = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.registrations.name)
  if (reg && reg.getLastColumn() >= 7 && String(reg.getRange(1, 6).getValue()) === '中獎獎項') {
    reg.deleteColumns(6, 2)
  }

  legacy.setName(LEGACY_BACKUP_SHEET)
  Logger.log('遷移完成，舊資料保留於「' + LEGACY_BACKUP_SHEET + '」分頁')
}

// ════════════════════════════════════════
//  工具
// ════════════════════════════════════════

// 取得分頁；不存在時建立並寫好標題列
function getTable(key) {
  const def = SHEETS[key]
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  let sheet = ss.getSheetByName(def.name)
  if (!sheet) {
    sheet = ss.insertSheet(def.name)
    sheet.getRange(1, 1, 1, def.headers.length).setValues([def.headers]).setFontWeight('bold')
    sheet.setFrozenRows(1)
  }
  return sheet
}

// 讀取標題列以下的資料列
function readRows(key) {
  const sheet = getTable(key)
  const lastRow = sheet.getLastRow()
  if (lastRow <= 1) return []
  return sheet.getRange(2, 1, lastRow - 1, SHEETS[key].headers.length).getValues()
}

// 以 rows 取代標題列以下的全部資料
function writeRows(key, rows) {
  const sheet = getTable(key)
  const width = SHEETS[key].headers.length
  const lastRow = sheet.getLastRow()
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, width).clearContent()
  if (rows.length > 0) sheet.getRange(2, 1, rows.length, width).setValues(rows)
}

function splitLines(str) {
  return String(str || '').split('\n').map(s => s.trim()).filter(Boolean)
}

function toText(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm")
  return String(v)
}

function toIso(v) {
  if (!v) return null
  if (v instanceof Date) return v.toISOString()
  const d = new Date(v)
  return isNaN(d.getTime()) ? String(v) : d.toISOString()
}

// 避免報名與管理員存檔同時寫入互相覆蓋
function withLock(fn) {
  const lock = LockService.getScriptLock()
  lock.waitLock(20000)
  try {
    return fn()
  } finally {
    lock.releaseLock()
  }
}

function respond(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON)
}
