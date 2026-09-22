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
- [ ] **GAS 中獎查詢網址**：`gas/Form.html` 的 `CHECK_BASE_URL` 仍指向 Netlify（`https://fancy-bombolone-80bcd2.netlify.app/`），改為 Vercel 網域後執行：
  ```bash
  clasp push
  clasp deploy --deploymentId <deploy.txt 中的 id> -d v3
  ```
- [ ] （選用）停用舊 Netlify 站台 `fancy-bombolone-80bcd2`、處理舊 repo `boyprince03/lottery-vue`。
