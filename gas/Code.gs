/**
 * 尾牙抽獎系統 - Google Apps Script 後端
 * doGet ?action=get        → 管理 API（完整 JSON）
 * doGet ?action=check&code → 兌獎查詢（按兌獎碼）
 * doGet (無參數)            → 報名表單（HTML）
 * doPost action=save        → 管理員儲存資料
 * doPost action=claimPrize  → 標記已兌獎
 * doPost action=unclaimPrize→ 取消兌獎標記
 * google.script.run         → registerParticipant（表單送出，無 CORS）
 */

const SHEET_NAME       = '抽獎資料'
const REGISTRATION_SHEET = '報名名單'
const EMPLOYEE_SHEET   = '員工白名單'

// 報名名單欄位順序
const REG_HEADERS = ['姓名', '單位', '桌號', '兌獎碼', '報名時間', '中獎獎項', '已兌獎獎項']

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

      const allData = readAll()
      const registrations = allData.registrations || []
      const reg = registrations.find(r => r.code === code)
      if (!reg) return respond({ ok: false, error: '找不到此兌獎碼，請確認輸入是否正確' })

      const winners = allData.winners || []
      const myWins = winners.filter(w => w.name === reg.name)
      const claimed = allData.claimedPrizes || []

      const prizes = myWins.map(w => {
        const record = claimed.find(c => c.name === reg.name && c.prize === w.prize)
        return {
          prize:     w.prize,
          vip:       w.vip || false,
          claimed:   !!record,
          claimedAt: record ? record.claimedAt : null,
        }
      })

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
      writeAll(body.data)
      return respond({ ok: true })
    }

    if (body.action === 'claimPrize') {
      const { name, prize } = body
      if (!name || !prize) return respond({ ok: false, error: '缺少參數' })
      const allData = readAll()
      const claimed = allData.claimedPrizes || []
      if (!claimed.some(c => c.name === name && c.prize === prize)) {
        claimed.push({ name, prize, claimedAt: new Date().toISOString() })
        writeKey('claimedPrizes', claimed)
        // 同步更新報名名單的兌獎狀態欄
        updateRegistrationStatus(name, allData.winners || [], claimed)
      }
      return respond({ ok: true })
    }

    if (body.action === 'unclaimPrize') {
      const { name, prize } = body
      const allData = readAll()
      const claimed = (allData.claimedPrizes || [])
        .filter(c => !(c.name === name && c.prize === prize))
      writeKey('claimedPrizes', claimed)
      // 同步更新報名名單的兌獎狀態欄
      updateRegistrationStatus(name, allData.winners || [], claimed)
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
  if (!/[\u4e00-\u9fa5]/.test(name)) {
    return { ok: false, message: '請使用中文姓名填寫，例如：王小明' }
  }

  const allData = readAll()

  // 比對員工白名單（每行格式：姓名,單位,值班）
  const employeeNames = (allData.employeeList || '')
    .split('\n')
    .map(line => line.split(',')[0].trim())
    .filter(Boolean)
  if (employeeNames.length > 0 && !employeeNames.includes(name)) {
    return { ok: false, message: '查無此員工，請確認是否以中文姓名填寫，或聯絡管理員' }
  }

  // 防止重複報名
  const participantsRaw = allData.participants || ''
  const participantList = participantsRaw.split('\n').map(s => s.trim()).filter(Boolean)
  if (participantList.includes(name)) {
    // 已報名：回傳既有兌獎碼
    const registrations = allData.registrations || []
    const existing = registrations.find(r => r.name === name)
    return {
      ok:      false,
      message: '您已在抽獎名單中，無需重複報名 🎉',
      code:    existing ? existing.code : null,
    }
  }

  // 產生唯一兌獎碼
  const registrations = allData.registrations || []
  const existingCodes = registrations.map(r => r.code)
  const code = generateCode(existingCodes)

  // 新增報名列至「報名名單」分頁
  appendRegistration({ name, unit, table, code })

  // 加入抽獎名單（主資料表）
  const newParticipants = participantsRaw.trim()
    ? participantsRaw.trim() + '\n' + name
    : name
  writeKey('participants', newParticipants)

  const tableMsg = table ? `（桌號：${table}）` : ''
  return { ok: true, message: `✓ ${name} 報名成功！${unit}${tableMsg} 已加入抽獎名單`, code }
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

// ── 一次性遷移：將「抽獎資料」中的舊 employeeList 複製至「員工白名單」分頁 ──
// 在 GAS 編輯器中手動執行一次即可，執行後可刪除此函式
function migrateEmployeeList() {
  const mainSheet = getSheet()
  const lastRow = mainSheet.getLastRow()
  if (lastRow === 0) { Logger.log('抽獎資料為空，無需遷移'); return }
  const rows = mainSheet.getRange(1, 1, lastRow, 2).getValues()
  const row = rows.find(r => r[0] === 'employeeList')
  if (!row) { Logger.log('找不到 employeeList，無需遷移'); return }
  let list = ''
  try { list = JSON.parse(row[1]) } catch { list = row[1] }
  if (!list || list.trim() === '') { Logger.log('employeeList 為空，無需遷移'); return }
  // 舊格式只有姓名，遷移時補空的單位和值班欄
  const migrated = list.split('\n').map(n => n.trim()).filter(Boolean).map(n => n + ',,').join('\n')
  writeEmployeeList(migrated)
  Logger.log('遷移完成，共 ' + list.split('\n').filter(Boolean).length + ' 人')
}

// ── 工具：主資料表（key-value）──
function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  return ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME)
}

// ── 工具：報名名單分頁 ──
function getRegistrationSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  let sheet = ss.getSheetByName(REGISTRATION_SHEET)
  if (!sheet) {
    sheet = ss.insertSheet(REGISTRATION_SHEET)
    sheet.getRange(1, 1, 1, REG_HEADERS.length).setValues([REG_HEADERS])
    sheet.setFrozenRows(1)
  }
  return sheet
}

// ── 工具：員工白名單分頁 ──
function getEmployeeSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  let sheet = ss.getSheetByName(EMPLOYEE_SHEET)
  if (!sheet) {
    sheet = ss.insertSheet(EMPLOYEE_SHEET)
    sheet.getRange(1, 1, 1, 3).setValues([['姓名', '單位', '值班']])
    sheet.setFrozenRows(1)
  }
  return sheet
}

// ── 讀取報名名單（→ 物件陣列）──
function readRegistrations() {
  const sheet = getRegistrationSheet()
  const lastRow = sheet.getLastRow()
  if (lastRow <= 1) return []
  const rows = sheet.getRange(2, 1, lastRow - 1, 4).getValues() // 只取前4欄（姓名/單位/桌號/兌獎碼）
  return rows
    .filter(r => r[0])
    .map(r => ({ name: String(r[0]), unit: String(r[1]), table: String(r[2]), code: String(r[3]) }))
}

// ── 新增報名列 ──
function appendRegistration(reg) {
  const sheet = getRegistrationSheet()
  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm:ss')
  sheet.appendRow([reg.name, reg.unit, reg.table || '', reg.code, now, '', ''])
}

// ── 讀取員工白名單（→ 換行字串，格式：姓名,單位,值班）──
function readEmployeeList() {
  const sheet = getEmployeeSheet()
  const lastRow = sheet.getLastRow()
  if (lastRow <= 1) return ''
  const rows = sheet.getRange(2, 1, lastRow - 1, 3).getValues()
  return rows
    .filter(r => String(r[0]).trim())
    .map(r => {
      const name  = String(r[0]).trim()
      const unit  = String(r[1]).trim()
      const duty  = String(r[2]).trim()
      return [name, unit, duty].join(',')
    })
    .join('\n')
}

// ── 寫入員工白名單（換行字串 → 分頁列，格式：姓名,單位,值班）──
function writeEmployeeList(str) {
  const sheet = getEmployeeSheet()
  const lastRow = sheet.getLastRow()
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, 3).clearContent()
  const lines = str.split('\n').map(s => s.trim()).filter(Boolean)
  if (lines.length > 0) {
    const rows = lines.map(line => {
      const parts = line.split(',').map(s => s.trim())
      return [parts[0] || '', parts[1] || '', parts[2] || '']
    })
    sheet.getRange(2, 1, rows.length, 3).setValues(rows)
  }
}

// ── 更新報名名單中單一人員的兌獎狀態 ──
function updateRegistrationStatus(name, winners, claimedPrizes) {
  const sheet = getRegistrationSheet()
  const lastRow = sheet.getLastRow()
  if (lastRow <= 1) return
  const nameCol = sheet.getRange(2, 1, lastRow - 1, 1).getValues()
  const rowIdx = nameCol.findIndex(r => String(r[0]) === name)
  if (rowIdx === -1) return
  const sheetRow = rowIdx + 2
  const myWins   = (winners || []).filter(w => w.name === name).map(w => w.prize)
  const myClaims = (claimedPrizes || []).filter(c => c.name === name).map(c => c.prize)
  sheet.getRange(sheetRow, 6).setValue(myWins.join(', '))
  sheet.getRange(sheetRow, 7).setValue(myClaims.join(', '))
}

// ── 批次同步報名名單的中獎/兌獎狀態（writeAll 時呼叫）──
function syncAllRegistrationStatus(winners, claimedPrizes) {
  const sheet = getRegistrationSheet()
  const lastRow = sheet.getLastRow()
  if (lastRow <= 1) return
  const nameCol = sheet.getRange(2, 1, lastRow - 1, 1).getValues()
  const statusRows = nameCol.map(r => {
    const n = String(r[0])
    const myWins   = (winners || []).filter(w => w.name === n).map(w => w.prize)
    const myClaims = (claimedPrizes || []).filter(c => c.name === n).map(c => c.prize)
    return [myWins.join(', '), myClaims.join(', ')]
  })
  sheet.getRange(2, 6, statusRows.length, 2).setValues(statusRows)
}

// ── readAll：合併三個分頁的資料 ──
function readAll() {
  // 1. 主資料表（key-value）
  const sheet = getSheet()
  const lastRow = sheet.getLastRow()
  const data = {}
  if (lastRow > 0) {
    const rows = sheet.getRange(1, 1, lastRow, 2).getValues()
    rows.forEach(([key, value]) => {
      if (!key) return
      try { data[key] = JSON.parse(value) } catch { data[key] = value }
    })
  }

  // 2. 報名名單分頁
  data.registrations = readRegistrations()

  // 3. 員工白名單分頁
  data.employeeList = readEmployeeList()

  return data
}

// ── writeAll：主資料表寫 key-value；員工白名單寫分頁；同步報名狀態 ──
function writeAll(data) {
  const sheet = getSheet()
  sheet.clearContents()

  // 寫入 key-value（排除由其他分頁管理的欄位）
  const skip = new Set(['registrations', 'employeeList'])
  const rows = Object.entries(data)
    .filter(([k]) => !skip.has(k))
    .map(([k, v]) => [k, JSON.stringify(v)])
  if (rows.length > 0) sheet.getRange(1, 1, rows.length, 2).setValues(rows)

  // 員工白名單
  if (data.employeeList !== undefined) {
    writeEmployeeList(data.employeeList)
  }

  // 同步報名名單的中獎/兌獎狀態
  syncAllRegistrationStatus(data.winners || [], data.claimedPrizes || [])
}

function writeKey(key, value) {
  const sheet = getSheet()
  const lastRow = sheet.getLastRow()
  if (lastRow > 0) {
    const rows = sheet.getRange(1, 1, lastRow, 1).getValues()
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === key) {
        sheet.getRange(i + 1, 2).setValue(JSON.stringify(value))
        return
      }
    }
  }
  sheet.appendRow([key, JSON.stringify(value)])
}

function respond(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON)
}
