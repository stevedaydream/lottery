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

const SHEET_NAME = '抽獎資料'

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
      }
      return respond({ ok: true })
    }

    if (body.action === 'unclaimPrize') {
      const { name, prize } = body
      const allData = readAll()
      const claimed = (allData.claimedPrizes || [])
        .filter(c => !(c.name === name && c.prize === prize))
      writeKey('claimedPrizes', claimed)
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

  // 比對員工白名單
  const employeeRaw  = allData.employeeList || ''
  const employeeList = employeeRaw.split('\n').map(s => s.trim()).filter(Boolean)
  if (employeeList.length > 0 && !employeeList.includes(name)) {
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

  // 儲存報名資料（含兌獎碼）
  registrations.push({ name, unit, table, code })
  writeKey('registrations', registrations)

  // 加入抽獎名單
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

// ── 工具函式 ──
function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  return ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME)
}

function readAll() {
  const sheet = getSheet()
  const lastRow = sheet.getLastRow()
  if (lastRow === 0) return {}
  const rows = sheet.getRange(1, 1, lastRow, 2).getValues()
  const data = {}
  rows.forEach(([key, value]) => {
    if (!key) return
    try { data[key] = JSON.parse(value) } catch { data[key] = value }
  })
  return data
}

function writeAll(data) {
  const sheet = getSheet()
  sheet.clearContents()
  const rows = Object.entries(data).map(([k, v]) => [k, JSON.stringify(v)])
  if (rows.length > 0) sheet.getRange(1, 1, rows.length, 2).setValues(rows)
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
