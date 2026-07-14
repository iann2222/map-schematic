# 架構概覽

本文件說明目前 repo 結構與 Electron 應用程式的實際執行流程。產品政策與長期技術決策分別記錄於 `AGENTS.md` 與 `docs/technical-architecture.md`。

## 專案結構

- `AGENTS.md`：開發規範、離線原則與資料政策。
- `README.md`：專案簡介、目前功能與快速開始。
- `docs/`：產品與技術架構文件。
- `src/`：Electron main、preload、renderer 與共用 TypeScript 原始碼。
- `test/`：本機自動化測試與共用測試資料。
- `scripts/`：建置與官方資料包製作輔助腳本。
- `geodata/`：開發模式的官方資料包根目錄，已由 gitignore 排除。
- `geodata_source/`：資料包原始資料，已由 gitignore 排除。
- `project_files/`：開發模式的專案檔與匯出預設目錄，已由 gitignore 排除。
- `pack-release.json`：官方資料包版本、下載位置、SHA-256 與來源檔案設定。
- `package.json`、`tsconfig.*.json`、`vitest.config.ts`：建置與測試設定。

## 執行流程

1. `npm run build`
   - 編譯 main（CommonJS）與 renderer（ESM）。
   - 複製 renderer 靜態檔到 `dist/renderer/`。
2. `npm start`
   - 啟動 Electron 並載入 preload 與 renderer。
   - 檢查官方資料包是否存在且完整。
   - 首次缺少資料包時，依 `pack-release.json` 下載、驗證並安裝。
   - 已安裝資料包損壞且無法恢復時，先詢問使用者是否重新下載。
3. `npm run start:dev`
   - 依序執行建置與啟動，適合本機開發。

## 本機測試

- `npm test`
  - 先檢查測試程式與相關原始碼的 TypeScript 型別，再執行全部測試一次。
  - 適合在提交變更前執行。
- `npm run test:watch`
  - 持續監看檔案變更，並自動重新執行相關測試。
  - 適合開發期間使用；按 `Ctrl+C` 結束。
- `npm run test:typecheck`
  - 只執行測試程式與相關原始碼的 TypeScript 型別檢查，不執行測試案例。

測試集中於 `test/`；共用測試資料放在 `test/fixtures/`，各模組測試依照原始碼領域分組。目前涵蓋 `.mapproj` validator、序列化、儲存與載入。

## 程式碼結構

主程序（Main）：

- `src/main/index.ts`
  - 建立安全隔離的 Electron 視窗與應用程式選單。
  - 註冊資料包、底圖、地形、GeoNames、專案檔與匯出 IPC。
  - 管理檔案選擇、PDF 產生及開發版／封裝版輸出路徑。
- `src/main/preload.ts`
  - 透過 `contextBridge` 提供受限的 renderer API。
- `src/main/datapack-download.ts`
  - 處理資料包下載、SHA-256 驗證、解壓、完整性驗證、安全切換與上一版本恢復。
- `src/main/geonames.ts`
  - 查詢官方資料包內的 GeoNames SQLite 索引。

渲染程序（Renderer）：

- `src/renderer/index.html`
  - Step 0 至 Step 3 介面、搜尋與標示面板、匯出外框 dialog。
- `src/renderer/index.ts`
  - 將 EPSG:4326 地理資料投影至 EPSG:3857 並渲染底圖。
  - 管理範圍裁切、比例、底圖風格與地形陰影。
  - 管理地名／座標搜尋、點、文字、線、區域、箭頭及其排序、拖曳與樣式。
  - 將目前狀態轉換為 `.mapproj`，並從專案檔還原編輯狀態。
  - 產生高解析 PNG、PDF 輸入與真正向量 SVG；地形陰影啟用時僅陰影部分維持點陣圖片。

共用模組（Shared）：

- `src/shared/paths.ts`、`src/shared/config.ts`
  - 統一解析資料根目錄與目前資料包設定。
- `src/shared/datapack/*`
  - 定義資料包 layout、manifest、版本狀態與路徑解析。
- `src/shared/schema/mapproj.ts`
  - 定義 `.mapproj` v0.1 資料模型與初始專案。
- `src/shared/schema/validate.ts`
  - 驗證專案結構、物件、座標、樣式、ID 與圖層引用。
- `src/shared/schema/io.ts`
  - 負責純 JSON 專案檔的序列化、儲存與載入。

## 資料與輸出路徑

- 開發模式：`MAP_SCHEMATIC_ROOT` 預設為 repo 根目錄，資料包位於 `geodata/`，專案與匯出預設位於 `project_files/`。
- 封裝版本：`MAP_SCHEMATIC_ROOT` 預設為 Electron `userData`，資料包位於其下的 `geodata/`；專案與匯出預設位於使用者文件目錄下的 `map-schematic/`。
- 可透過 `MAP_SCHEMATIC_ROOT` 覆寫資料根目錄；程式碼不得硬編碼絕對路徑。

## 資料包建置與發佈

- `scripts/build_datapack.py`
  - 讀取 `geodata_source/`，建立 Natural Earth 底圖、GeoNames SQLite 與選用的地形陰影資料。
- `scripts/update_pack_release.py`
  - 依資料包 zip 與來源資料更新 `pack-release.json` 的版本、下載位置與 SHA-256。
- `dist/`
  - 存放 TypeScript 編譯結果與 renderer 靜態檔，不是原始碼來源。
