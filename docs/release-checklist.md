# 發布檢查清單

本文件是應用程式與官方資料包發布前的操作清單。架構說明見 `architecture.md`，資料包細節見 `datapack.md`。

## 應用程式發布

### 版本與原始碼

- [ ] 工作目錄只包含預期變更。
- [ ] `package.json` 版本與發布名稱一致。
- [ ] `npm run build` 產生的 `out/build-info.json` 版本與完整 commit SHA 正確，且 `dirty` 為 `false`。
- [ ] `package-lock.json` 已提交且可由 `npm ci` 安裝。
- [ ] Node.js 版本符合 `package.json#engines`。
- [ ] `pack-release.json` 指向預計支援的官方資料包。

### 自動驗證

```powershell
npm ci
npm test
npm run build
```

- [ ] TypeScript main、preload、renderer 均成功建置。
- [ ] 所有 Vitest 測試通過。
- [ ] `git diff --check` 無錯誤。

### 封裝

1. 在 `packaging/release-config.mjs` 選擇 `setup`、`folder` 或 `zip`。
2. 執行：

```powershell
npm run package:win
```

- [ ] 終端機顯示封裝成功與實際輸出路徑。
- [ ] 檔名包含產品名稱、應用程式版本、形式與架構。
- [ ] 應用程式 icon、安裝程式 icon 與捷徑 icon 正確。
- [ ] 發行產物不包含 `geodata/`、`geodata_source/` 或本機專案檔。
- [ ] `resources/ATTRIBUTIONS.md` 存在。
- [ ] 應用程式「說明 > 資料來源與授權」可顯示相同內容。
- [ ] 應用程式「說明 > 關於」顯示的版本與 commit SHA 和發布目標一致。
- [ ] `builder-debug.yml` 與 `builder-effective-config.yaml` 未留在正式產物。

### Smoke Test

- [ ] 在未安裝 Node.js 的乾淨 Windows 環境啟動。
- [ ] 首次缺少資料包時可完成官方資料包下載與驗證。
- [ ] 離線重啟後可載入底圖、搜尋地名與地形陰影。
- [ ] 可新建、儲存、另存與重新載入 `.mapproj`。
- [ ] 未儲存狀態、關閉確認與 `.bak` 恢復正常。
- [ ] Undo／Redo 可使用，重新載入後歷史仍有效。
- [ ] PNG、真正向量 SVG 與 PDF 可開啟且尺寸正確。
- [ ] 深色、淺色主題及 Step 0 至 Step 3 基本流程正常。

### 發布紀錄

- [ ] 對正式產物計算 SHA-256。
- [ ] 保存測試日期、Windows 版本、CPU 架構與產物格式。
- [ ] Release notes 列出 schema、資料包需求與已知限制。
- [ ] 未簽章版本明確標示可能出現 SmartScreen／未知發行者提示。

## 官方資料包發布

### 建置輸入

- [ ] 原始檔案來自 `ATTRIBUTIONS.md` 列出的官方來源。
- [ ] 保存原始檔名、下載日期、來源 URL 與 checksum。
- [ ] 使用 `conda create -n mapschem --file environment-win-64.lock.txt` 建立正式 win-64 建置環境。
- [ ] 若調整 `environment.yml`，已執行 `python scripts/lock_datapack_environment.py` 並提交新的鎖定檔。
- [ ] `python scripts/build_datapack.py --check-environment` 通過。
- [ ] `npm run test:datapack-tools` 通過。
- [ ] 資料包 id／version 通過安全片段限制，例如 `standard`、`2026.02`。

### 建置與內容

- [ ] `scripts/build_datapack.py` 完整成功。
- [ ] `datapack.json` 的 id／version 正確。
- [ ] `datapack.json.buildEnvironment` 記錄固定的核心版本、win-64 平台與標準化鎖定內容 SHA-256。
- [ ] 所有必要底圖與 GeoNames SQLite 存在。
- [ ] 地形陰影存在時使用 `EPSG:3857`。
- [ ] manifest 的每個 path、size 與 SHA-256 均通過驗證。
- [ ] 使用相同原始資料與完整鎖定環境重建可得到相同資料結構；若內容 checksum 不同，已記錄原因。

### 發布與更新

- [ ] ZIP 根目錄直接包含 `datapack.json`。
- [ ] ZIP 不含原始下載檔、暫存目錄或上一版資料。
- [ ] GitHub Release tag、asset 名稱與 manifest version 一致。
- [ ] `scripts/update_pack_release.py` 驗證 ZIP 後更新 `pack-release.json`。
- [ ] 新安裝可完成首次初始化。
- [ ] 已有舊版時只在使用者主動確認後更新。
- [ ] 更新失敗可繼續使用原 active 版本。
- [ ] 損壞修復會先詢問使用者，離線 fallback 正常。
- [ ] 更新完成後一般編輯不再產生網路請求。

## 授權確認

- [ ] `ATTRIBUTIONS.md` 列出 Natural Earth、Natural Earth Shaded Relief 與 GeoNames。
- [ ] GeoNames 保留 CC BY 4.0、GeoNames 名稱及官方連結。
- [ ] 應用程式發行產物與官方資料包發布頁都可找到署名資訊。
- [ ] 新增資料來源時，同步更新 `ATTRIBUTIONS.md` 與本清單。
