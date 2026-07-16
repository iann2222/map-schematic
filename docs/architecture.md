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

測試集中於 `test/`；共用測試資料放在 `test/fixtures/`，各模組測試依照原始碼領域分組。目前涵蓋 `.mapproj`、資料包 manifest、manager、初始化、更新、修復、fallback，以及 renderer Editor Core 的命令與歷史行為。

## 程式碼結構

主程序（Main）：

- `src/main/index.ts`
  - 建立安全隔離的 Electron 視窗與應用程式選單。
  - 註冊資料包、底圖、地形、GeoNames、專案檔與匯出 IPC。
  - 管理檔案選擇、未儲存變更確認、專案備份恢復詢問、PDF 產生及開發版／封裝版輸出路徑。
- `src/main/preload.ts`
  - 透過 `contextBridge` 提供受限的 renderer API。
- `src/main/datapack-download.ts`
  - 提供 GitHub HTTPS 下載、ZIP 解壓與 Electron app 路徑 adapter；狀態與安裝決策由 shared manager 負責。
- `src/main/geonames.ts`
  - 查詢官方資料包內的 GeoNames SQLite 索引。

渲染程序（Renderer）：

- `src/renderer/index.html`
  - Step 0 至 Step 3 介面、搜尋與標示面板、匯出外框 dialog。
- `src/renderer/index.ts`
  - 組合 renderer 模組、管理工作流程狀態並綁定畫面事件。
  - 管理範圍裁切、比例、底圖風格與地形陰影。
  - 管理地名／座標搜尋、點、文字、線、區域、箭頭及其排序、拖曳與樣式。
  - 將目前狀態轉換為 `.mapproj`，並從專案檔還原編輯狀態。
  - 產生高解析 PNG、PDF 輸入與真正向量 SVG；地形陰影啟用時僅陰影部分維持點陣圖片。
- `src/renderer/bridge.ts`
  - 定義 preload bridge 與 GeoNames 查詢結果；專案契約直接引用 shared schema，避免重複定義。
- `src/renderer/editor/*`
  - 以單一 `EditorDocument.objects` 管理點標示與形狀，並以可辨識物件型別提供安全存取。
  - `editor-core.ts` 集中套用編輯命令、交易與最多 300 筆的 Undo/Redo 歷史；UI 不再自行維護完整文件快照。
  - `commands.ts` 定義可序列化的新增、刪除、欄位更新、排序與清空命令，套用前會檢查目前資料狀態。
  - 命令只保存實際變更欄位；連續文字與滑桿修改可合併，拖曳期間即時預覽並在結束時記為單一命令。
- `src/renderer/project/project-state.ts`
  - 比較目前專案與最近一次成功儲存／載入的內容，供未儲存狀態提示使用。
  - 分離目前 renderer 可編輯的 point 物件與尚未支援的幾何物件；後者不顯示，但再次儲存時會原樣保留。
- `src/renderer/project/v02-adapter.ts`
  - 集中處理 `.mapproj` v0.2 與 `EditorDocument` 的雙向轉換，renderer 互動邏輯不直接解析專案欄位。
- `src/renderer/map/geometry.ts`
  - 集中 EPSG:4326／EPSG:3857 投影與 GeoJSON 至 SVG path 轉換。
- `src/renderer/ui/slider.ts`
  - 提供共用滑桿建立、鍵盤操作、數值吸附與畫面同步。

共用模組（Shared）：

- `src/shared/paths.ts`
  - 統一解析資料根目錄。
- `src/shared/datapack/*`
  - 定義 manifest／release 契約、檔案校驗、active 版本、初始化、更新、修復、安全啟用與 fallback。
  - `pack-release.json` 是目標資料包 id／version 的唯一來源，不另在程式碼維護重複版本常數。
- `src/shared/schema/mapproj.ts`
  - 提供目前 `.mapproj` v0.2 版本常數與初始專案。
- `src/shared/schema/mapproj-contract.d.ts`
  - 集中定義 main、preload、renderer 共用的 `.mapproj` 資料契約。
- `src/shared/schema/migrate.ts`
  - 依 schemaVersion 逐版遷移專案；目前支援 v0.1 → v0.2，未知版本不會被猜測轉換。
- `src/shared/schema/validate.ts`
  - 驗證專案結構、物件、座標、樣式、ID 與圖層引用。
- `src/shared/schema/io.ts`
  - 負責純 JSON 專案檔的序列化、遷移、原子儲存、`.bak` 備份、恢復與載入。

## 資料與輸出路徑

- 開發模式：`MAP_SCHEMATIC_ROOT` 預設為 repo 根目錄，資料包位於 `geodata/`，專案與匯出預設位於 `project_files/`。
- 封裝版本：`MAP_SCHEMATIC_ROOT` 預設為 Electron `userData`，資料包位於其下的 `geodata/`；專案與匯出預設位於使用者文件目錄下的 `map-schematic/`。
- 可透過 `MAP_SCHEMATIC_ROOT` 覆寫資料根目錄；程式碼不得硬編碼絕對路徑。

## 資料包建置與發佈

- `scripts/build_datapack.py`
  - 讀取 `geodata_source/`，在暫存建置目錄建立並驗證完整資料包，成功後才替換正式產物；缺少必要內容時保留舊建置。
- `scripts/update_pack_release.py`
  - 驗證資料包 ZIP 內的 manifest、檔案清單、大小與 checksum，再由 manifest 產生 `pack-release.json` 的 id／version。
- `dist/`
  - 存放 TypeScript 編譯結果與 renderer 靜態檔，不是原始碼來源。
