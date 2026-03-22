# 抽獎系統開發文件

## 專案概述

企業年度活動抽獎系統，以 Vue 3 + Vite 建構，部署於 Netlify。支援物理球池動畫、手機遙控、後台管理、VIP 保送/後順位、GAS 雲端同步、兌獎管理與中獎查詢。

---

## 技術棧

| 項目 | 技術 |
|------|------|
| 前端框架 | Vue 3 (Composition API + `<script setup>`) |
| 建構工具 | Vite |
| 物理引擎 | Matter.js |
| P2P 通訊 | PeerJS (0.peerjs.com) |
| 雲端同步 | Google Apps Script (GAS) |
| 認證 | Google OAuth (GSI) |
| 部署 | Netlify |
| Excel 匯入 | xlsx |
| 禮花動畫 | canvas-confetti |

---

## 環境變數 (`.env`)

```
VITE_GAS_URL=         # Google Apps Script 部署網址
VITE_GOOGLE_CLIENT_ID= # Google OAuth Client ID
VITE_ADMIN_EMAIL=     # 管理員 Google 帳號（留空則不限制）
```

---

## 部署指令

```bash
# 前端 (Netlify 自動 CI/CD，或手動)
npm run build

# GAS 後端
clasp push
clasp deploy --deploymentId <id> -d v3
```

---

## 頁面路由（URL 參數）

| URL | 頁面 | 說明 |
|-----|------|------|
| `/` | 主畫面 | 大螢幕投影用，顯示球池動畫與中獎名單 |
| `?admin` | 後台管理 | 需 Google 登入，管理名單/獎項/兌獎 |
| `?vip` | VIP 黑箱 | 隱藏入口，設定保送/後順位名單 |
| `?remote=<id>` | 手機遙控 | 掃 QR Code 進入，遠端觸發抽獎 |
| `?check` / `?check=<code>` | 中獎查詢 | 員工輸入兌獎碼查看中獎結果 |

---

## 角色與 UX 流程

### 主持人（主畫面）
1. 開啟主畫面投影至大螢幕
2. 球池自動載入所有未中獎參與者
3. 等待後台或手機遙控觸發抽獎
4. 5 秒倒數 → 球體漩渦旋轉 → 中獎者高亮 → 結果 Modal + 禮花
5. Modal 關閉後球池自動移除中獎者並重建
6. 獎項抽完自動跳至下一個，並顯示 Toast 通知

### 管理員（`?admin`）
1. Google 帳號登入（驗證 VITE_ADMIN_EMAIL）
2. **名單匯入** tab（預設）：
   - 上傳員工白名單 Excel（姓名+單位）或手動編輯
   - 查看/編輯實際抽獎名單
3. **獎項設定** tab：快速標籤（頭獎/二獎/現金等）+ 名額設定
4. **兌獎管理** tab：搜尋姓名、依狀態/獎項篩選、確認兌獎、匯出 CSV
5. **中獎名單** tab：完整中獎記錄、匯出 CSV
6. **遙控器** tab：
   - 左側：手機遙控 QR Code + 連線狀態
   - 右側：後台直接控制（選人數、觸發抽獎、顯示即時狀態）

### VIP 操作者（`?vip`，隱藏入口）
1. 手動輸入 `?vip` 或從 admin 頁點擊 VIP 連結
2. Google 帳號登入
3. **保送名單**：指定人員 + 指定獎項（抽到該獎時必定出線）
4. **後順位名單**：有其他人可抽時不選，其他人全部中獎後才進入剩餘獎項
5. 設定即時同步至 GAS

### 手機遙控者（`?remote=<id>`）
1. 掃 Admin 頁遙控器 tab 的 QR Code
2. 選擇抽出人數（－/＋，快速 3/5/10）
3. 按大紅按鈕觸發抽獎
4. 抽獎中按鈕顯示 spinner，無法重複觸發
5. 斷線後 5 秒自動重連

### 參與者（`?check`）
1. 掃報名確認信中的連結或輸入 6 位兌獎碼
2. 查看身分核對卡（出示給工作人員）
3. 查看中獎獎項與兌獎狀態（待兌獎橘色提示/已兌獎綠色）
4. 每 30 秒自動刷新，刷新時保留舊資料不閃爍

---

## 檔案結構

```
src/
├── App.vue                    # 主畫面 + 路由控制 + 抽獎核心邏輯
├── main.js
├── style.css / assets/main.css
│
├── components/
│   ├── AdminPage.vue          # 後台管理（五個 tab）
│   ├── VIPPage.vue            # VIP 黑箱設定
│   ├── RemotePage.vue         # 手機遙控器頁面
│   ├── PrizeLookupPage.vue    # 員工中獎查詢
│   ├── PhysicsCanvas.vue      # Matter.js 球池動畫
│   ├── PrizePanel.vue         # 獎項列表（含進度條）
│   ├── ParticipantsPanel.vue  # 參與者名單輸入
│   ├── WinnersPanel.vue       # 即時中獎名單
│   ├── ResultModal.vue        # 抽獎結果 Modal
│   ├── PrizeModal.vue         # 獎項新增/編輯 Modal
│   └── RemoteControlPanel.vue # Admin 遙控器 QR 區塊（已整合至 AdminPage）
│
└── composables/
    ├── useSharedState.js      # 全域狀態（localStorage + 跨 tab 同步）
    ├── usePhysics.js          # Matter.js 物理引擎封裝
    ├── usePeer.js             # PeerJS P2P 連線（host + remote）
    └── useGASSync.js          # GAS 雙向同步（fetch + debounce save）
```

---

## 狀態管理（useSharedState）

所有頁面共用同一份狀態，透過 `localStorage` 持久化，`storage` 事件跨 tab 同步。

| Key | 說明 |
|-----|------|
| `lottery_participants` | 抽獎名單（換行分隔字串） |
| `lottery_prizes` | 獎項陣列 `[{ id, name, total, winners[], rank }]` |
| `lottery_winners` | 所有中獎記錄 `[{ id, name, prize, vip }]` |
| `lottery_vip_guarantee` | 保送名單（換行，格式：`姓名` 或 `姓名, 獎項名`） |
| `lottery_vip_exclude` | 後順位名單（換行，純姓名） |
| `lottery_employee_list` | 員工白名單（換行） |
| `lottery_event_title` | 活動標題 |

---

## 抽獎核心邏輯（App.vue）

### pickWinner() 選取順序

```
1. 掃描保送名單（vipGuarantee）
   - 有指定獎項 → 比對當前獎項名稱（contains 比對）
   - 無指定獎項 → 任意獎項皆適用
   - 條件：未中獎 + 在參與者名單中 → 直接回傳（isVip: true）

2. 建立隨機 pool
   - 排除：已中獎者
   - 排除：後順位名單（vipExclude）
   - 排除：保送給其他獎項且尚未中獎的 VIP（reservedForOtherPrize）
   - 若 pool 為空（所有人都是後順位）→ fallback：所有未中獎者皆可抽

3. 隨機選出一人回傳
```

### calcEffectiveMax(prize) 可抽人數計算

```
有效人數 = 參與者 - 已中獎 - 後順位名單 - 保留給其他獎項的 VIP
若有效人數 = 0 → fallback：所有未中獎者數量
回傳 min(獎項剩餘名額, 有效人數)
```

### startDraw() 流程

```
1. 鎖定 isSpinning = true，推送 spinning: true 至遙控器
2. 5 秒倒數動畫（physicsCanvas setSwirl）
3. 依序抽出 count 位（min(drawCount, effectiveDrawMax)）
   - 每位中獎者：球體高亮金色 → 短暫停留 → 恢復
   - 寫入 currentPrize.winners 與 allWinners
4. 顯示 ResultModal + 禮花
5. 若當前獎項已抽完 → 自動切換至下一獎項 + Toast 通知
6. 推送最新狀態至遙控器（spinning: false）
7. isSpinning = false
8. Modal 關閉後（closeResult）→ 重建球池（移除中獎者）
```

---

## PeerJS 通訊架構

```
主畫面（Host）
  └─ peer.on('connection') → 接收 DRAW 指令
  └─ pushState({ prize, remaining, spinning }) → 推送至所有遙控器

手機遙控 / Admin 後台（Remote）
  └─ remotePeer.connect(hostId) → 建立連線
  └─ sendDraw(count) → 送出 DRAW 指令
  └─ conn.on('data', STATE) → 更新 prize/remaining/spinning

斷線重連：
  - Remote 斷線後 5 秒自動重連
  - Host 收到新連線時立即推送當前狀態（消除「等待同步」）
```

---

## GAS 同步機制

| 方向 | 方式 | 時機 |
|------|------|------|
| GAS → Local | GET `?action=get` | 頁面載入時 |
| Local → GAS | POST (no-cors) | 任何狀態變更後 2 秒 debounce |
| Local → GAS | POST `claimPrize` / `unclaimPrize` | 兌獎操作（即時） |
| GAS → Local | GET `?action=check&code=` | 員工查詢兌獎碼 |
| GAS → Local | GET `?action=get`（claims） | Admin 兌獎管理 tab 開啟時 |

---

## VIP 系統設計（隱藏功能）

- 入口：手動輸入 `?vip`，或從 Admin 頁 header 的低調 VIP 連結進入
- 認證：同 Admin 使用 Google OAuth
- **保送名單**：格式 `姓名` 或 `姓名, 獎項名稱`，序列化為換行字串存入 localStorage/GAS
- **後順位名單**：只存姓名，有其他人可抽時不被選中，最終會獲得剩餘小獎
- **對外完全不顯示**：ResultModal、WinnersPanel、AdminPage 中獎名單均不顯示 VIP 標記
- VIP 標記只在 VIPPage 本身可見（管理員後台也不顯示）

---

## 球池動畫（usePhysics）

- 引擎：Matter.js，無重力，完全彈性碰撞（restitution 0.85）
- 球體數量對應參與者人數，半徑 18–32px 動態調整
- 正常狀態：隨機微弱力推動保持活動
- 抽獎中（setSwirl）：切向力繞中心旋轉 + 向心力聚攏
- 中獎者移除時機：ResultModal 關閉後才重建（避免與動畫衝突）
- 渲染：徑向漸層球體 + 白色高光 + 姓名文字（超過 3 字分兩行）

---

## 已知設計決策

| 決策 | 原因 |
|------|------|
| 主畫面移除「開始抽獎」按鈕 | 抽獎統一由後台/遙控器觸發，主畫面純展示 |
| 主畫面移除抽出份數控制 | 同上，由後台/遙控器設定 |
| 後順位名單非永久排除 | 設計目標是「排在最後分小獎」而非完全排除 |
| Modal 關閉後才重建球池 | 避免中獎動畫與球體消失同時發生造成視覺跳動 |
| PeerJS 5 秒自動重連 | 手機網路不穩定，現場斷線不應要求重新掃碼 |
| VIP 標記對外隱藏 | 避免現場觀眾察覺暗箱操作 |
| no-cors POST 至 GAS | GAS 限制，fire-and-forget，無法讀取回應 |
