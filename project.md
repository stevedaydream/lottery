# 抽獎系統 — 專案現況

> 功能與架構總覽見 `lotteryProject.md`。本文件記錄部署設定現況。

---

## 部署：Vercel（GitHub 自動部署）

| 項目 | 值 |
|------|------|
| Vercel 團隊 | `steves-projects-37bb3607` |
| Vercel 專案 | `lottery-vue` |
| GitHub repo | `stevedaydream/lottery`（公開） |
| 框架偵測 | Vite（Build: `vite build`，Output: `dist`） |
| 部署觸發 | push `main` → Production；其他分支 / PR → Preview |
| SPA 設定 | `vercel.json` rewrite `/(.*)` → `/index.html`（路由皆為 URL 參數） |

日常部署：

```bash
git push origin main
```

---

## 2026-09-22 從 Netlify 遷移至 Vercel — 設定過程

1. **建立 Vercel 專案**：`vercel link --yes --project lottery-vue`（本機產生 `.vercel/`，已 gitignore）。
2. **更換 GitHub remote**：`origin` 由 `boyprince03/lottery-vue` 改為 `stevedaydream/lottery`。
   - 原因：舊 repo 未授權給 Vercel GitHub App，`vercel git connect` 失敗。
3. **清除 `.env` 歷史**：新 repo 為公開，推送前用 `git filter-repo --path .env --invert-paths` 從所有 commit 移除 `.env`。
   - 注意：filter-repo 會刪除工作目錄的 `.env` 並移除 remote，需事後還原 `.env`、重新 `git remote add origin`。
   - 改寫後 commit hash 全數變更；舊 repo `boyprince03/lottery-vue` 仍保有含 `.env` 的舊歷史。
4. **移除 Netlify**：刪除 `netlify.toml`、`.netlify/`；`.gitignore` 改為忽略 `.env`、`.vercel`。
5. **推送並連結**：`git push -u origin main` → `vercel git connect https://github.com/stevedaydream/lottery.git`。

---

## 待辦（遷移未完成項）

- [ ] **Vercel 環境變數**：於 Vercel 專案 Settings → Environment Variables 設定（Production / Preview / Development），設定後需 Redeploy 才會生效（`VITE_*` 為建置時注入）。
  - `VITE_GAS_URL`
  - `VITE_GOOGLE_CLIENT_ID`
  - `VITE_ADMIN_EMAIL`
- [ ] **Google OAuth**：Google Cloud Console → OAuth Client → 「已授權的 JavaScript 來源」加入 Vercel 網域，否則 `?admin`、`?vip` 無法登入。
- [x] **GAS 中獎查詢網址**（2026-10-07 已改為 https://lottery-vue.vercel.app/ 並部署 @10）：`gas/Form.html` 的 `CHECK_BASE_URL` 仍指向 Netlify（`https://fancy-bombolone-80bcd2.netlify.app/`），改為 Vercel 網域後執行：
  ```bash
  clasp push
  clasp deploy --deploymentId <見 secret.md> -d v3
  ```
- [ ] （選用）停用舊 Netlify 站台 `fancy-bombolone-80bcd2`、處理舊 repo `boyprince03/lottery-vue`。

---

## 2026-10-07 視覺重新設計「紅幕舞台」（分支 `feature/redesign`）

- 設計稿：claude.ai Design 畫布「抽獎機重新設計」（主畫面、倒數、揭曉、手機遙控、中獎查詢五張）。
- 色票集中在 `src/assets/main.css` 的 `:root`：深酒紅底 `--ink`、香檳 `--cream`、朱紅 `--accent`；字體 Noto Serif TC（標題／人名）、Noto Sans TC（內文）、Big Shoulders Display（數字）。舊變數 `--gold*`／`--red*` 保留並對應新色，後台與 VIP 頁沿用。
- 主畫面改為滿版 100vh 三欄：左獎項＋報名卡（名單編輯收進「手動編輯名單」）、中「現正抽出」＋球池、右中獎名單；獎項名稱以「·」拆成主標／副標。
- 倒數改為全螢幕覆蓋；結果改為整面朱紅底的名字卡（依人數 1／3／6／更多 自動縮放字級）。
- 球池改平塗色（朱紅／香檳／深栗／空心），中獎高亮為朱紅。
- 中獎查詢頁改淺色底。
- 2026-10-07：後台 `?admin` 加入手機版樣式（≤640px：標頭換行、分頁列橫向捲動、獎項列兩行、兌獎表改卡片、輸入框 16px 避免 iOS 放大）；報名表單 `gas/Form.html` 改為與中獎查詢頁一致的淺色風格（需 `clasp push` + 重新部署才會生效）。
- 2026-10-08：試算表改為「一張分頁一種資料」（設定／獎項／抽獎名單／中獎紀錄／VIP／報名名單／員工白名單），對前端 API 格式不變；首次讀寫時自動從舊「抽獎資料」分頁遷移，舊分頁改名「抽獎資料（舊版備份）」保留。修正後台存檔會清空兌獎紀錄的 bug；報名截止時間與值班名單改為同步到雲端；GAS 寫入加鎖避免報名與存檔互相覆蓋。VIP 頁加入手機版樣式。
- 注意：本機 `.env` 的 `VITE_GAS_URL` 指向正式 GAS，`npm run dev` 時的任何操作都會寫入正式試算表。
