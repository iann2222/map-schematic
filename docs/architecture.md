# 架構概覽

本文件只說明目前 repo 結構與 Electron 應用程式的實際執行流程。產品目標、專案格式、資料包與發布流程分別記錄於 `product-vision.md`、`project-format.md`、`datapack.md` 與 `release-checklist.md`；開發政策以 `AGENTS.md` 為準。

## 專案結構

- `AGENTS.md`：開發規範、離線原則與資料政策。
- `README.md`：專案簡介、目前功能與快速開始。
- `docs/`：產品願景、現行架構、專案格式、資料包與發布文件。
- `src/`：Electron main、preload、renderer 與共用 TypeScript 原始碼。
- `test/`：本機自動化測試與共用測試資料。
- `scripts/`：編譯靜態資源與官方資料包製作輔助腳本。
- `packaging/`：Windows 封裝設定、目標格式選擇與封裝腳本。
- `geodata/`：開發模式的官方資料包根目錄，已由 gitignore 排除。
- `geodata_source/`：資料包原始資料，已由 gitignore 排除。
- `project_files/`：開發模式的專案檔與匯出預設目錄，已由 gitignore 排除。
- `pack-release.json`：官方資料包版本、下載位置、SHA-256 與來源檔案設定。
- `out/build-info.json`：建置時產生的應用程式版本、commit SHA 與工作樹狀態，隨封裝產物一併保存。
- `package.json`、`tsconfig.*.json`、`vitest.config.ts`：應用程式建置與測試設定。
- `environment.yml`：官方資料包建置環境的直接相依與版本來源。
- `environment-win-64.lock.txt`：正式 Windows 資料包建置使用的完整 Conda 相依鎖定檔。
- `scripts/lock_datapack_environment.py`：依 `environment.yml` 在乾淨臨時環境解析並更新 win-64 鎖定檔。

## 開發環境

- Node.js：支援 Node 20.19 以上的 Node 20、Node 22.12 以上的 Node 22，以及 Node 24 以上；建議 Node 20 LTS。`.nvmrc` 提供 nvm／fnm 使用的主版本。
- 安裝依賴：使用 `npm ci` 依 `package-lock.json` 安裝固定版本。
- 換作業系統或 CPU 架構時不可直接複製 `node_modules`；`postinstall` 會透過 `electron-rebuild` 重建 `better-sqlite3` 的原生模組。
- Electron 應用程式的開發、測試與封裝不需要 Conda；Conda 只用於製作官方資料包。
- 已打包的 Electron 應用程式內含 runtime，一般使用者無須安裝 Node.js、Python 或 Conda。
- 新設備需重建官方資料包環境時，使用 `conda create -n mapschem --file environment-win-64.lock.txt`；完整步驟見 `docs/datapack.md`。

## 執行流程

1. `npm run build`
   - 編譯 main（CommonJS）與 renderer（ESM）。
   - 複製 renderer 靜態檔到 `out/renderer/`。
2. `npm start`
   - 啟動 Electron 並載入 preload 與 renderer。
   - 檢查官方資料包是否存在且完整。
   - 首次缺少資料包時，依 `pack-release.json` 下載、驗證並安裝。
   - 已安裝資料包損壞且無法恢復時，先詢問使用者是否重新下載。
   - 有新版資料包時保持離線使用目前版本，可在偏好設定主動下載更新。
3. `npm run start:dev`
   - 依序執行建置與啟動，適合本機開發。
4. `npm run package:win`
   - 先建置，再依 `packaging/release-config.mjs` 產生 Windows x64 安裝程式、可攜式資料夾或可攜式 ZIP。
   - 產物位於 `dist/`；不包含官方資料包；完成後會印出實際產物路徑。

## 本機測試

- `npm test`
  - 先檢查測試程式與相關原始碼的 TypeScript 型別，再執行全部測試一次。
  - 適合在提交變更前執行。
- `npm run test:watch`
  - 持續監看檔案變更，並自動重新執行相關測試。
  - 適合開發期間使用；按 `Ctrl+C` 結束。
- `npm run test:typecheck`
  - 只執行測試程式與相關原始碼的 TypeScript 型別檢查，不執行測試案例。
- `npm run test:datapack-tools`
  - 使用 Python 內建 unittest 驗證資料包安全路徑、GDAL 版本解析、完整 Conda 環境比對與 win-64 鎖定檔。

測試集中於 `test/`；共用測試資料放在 `test/fixtures/`，各模組測試依照原始碼領域分組。目前涵蓋 `.mapproj`、資料包 manifest、manager、初始化、更新、修復、fallback、Python 建置工具，以及 renderer Editor Core 的命令、歷史、專案操作排程、App State 與座標解析。

## 程式碼結構

主程序（Main）：

- `src/main/index.ts`
  - 建立安全隔離的 Electron 視窗與應用程式選單。
  - 註冊資料包、底圖、地形、GeoNames、專案檔與匯出 IPC。
  - 依開發版／封裝版路徑讀取同一份 `ATTRIBUTIONS.md`，供應用程式內的授權入口顯示。
  - 讀取建置時固化的版本與 commit SHA，透過受限 IPC 提供給「說明 > 關於」。
  - 管理檔案選擇、未儲存變更確認、專案備份恢復詢問、PDF 產生及開發版／封裝版輸出路徑。
- `src/main/data-root.ts`
  - 決定開發版與封裝版共用的官方資料包位置，並保留使用中的位置設定。
- `src/main/preload.ts`
  - 透過 `contextBridge` 提供受限的 renderer API，包括唯讀的資料來源與授權內容。
- `src/main/datapack-download.ts`
  - 提供 GitHub HTTPS 下載、ZIP 解壓與 Electron app 路徑 adapter；狀態與安裝決策由 shared manager 負責。
- `src/main/geonames.ts`
  - 查詢官方資料包內的 GeoNames SQLite 索引。

渲染程序（Renderer）：

- `src/renderer/index.html`
  - Step 0 至 Step 3 介面、搜尋與標示面板、匯出外框 dialog；不放置 inline CSS。
- `src/renderer/styles/foundation.css`
  - 保存由舊版 `index.html` 移出的基礎樣式，位於 `foundation` cascade layer；後續元件規則可穩定覆寫。
- `src/renderer/styles.css`
  - 位於 `components` cascade layer，依 design token、共用控制、工作流程、地圖、屬性面板、dialog 與 responsive 區段組織。
- `src/renderer/index.ts`
  - 作為 renderer composition root，建立控制器、注入共享狀態與 callback，並負責應用程式啟動。
  - 專案、工作流程、搜尋、匯出、地圖、裁切、選取、排序與屬性面板的狀態及互動分別由對應模組管理。
  - 保留跨控制器的 Editor Core 命令組裝、專案資料轉換與匯出內容組裝。
  - 產生高解析 PNG、PDF 輸入與真正向量 SVG；地形陰影啟用時僅陰影部分維持點陣圖片。
- `src/renderer/app-state.ts`
  - 定義 renderer 唯一的 `AppState` 根結構；工作流程、專案生命週期、搜尋請求與匯出狀態不再由入口檔的零散全域變數維護。
- `src/renderer/controllers/*`
  - `workflow-controller.ts` 管理步驟切換、導覽、工作區分頁與搜尋模式分頁。
  - `project-controller.ts` 管理載入、儲存、另存、未儲存狀態與資料包版本確認，並透過 operation coordinator 序列化操作。
  - `search-controller.ts` 管理離線地名搜尋、座標解析、結果排序與結果清單。
  - `export-controller.ts` 管理匯出格式、外框選擇、進度與輸出請求。
  - `app-command-controller.ts` 集中全域快捷鍵、Electron menu action 與 dialog request 路由。
  - `order-dialog-controller.ts` 管理項目排序 dialog、置頂／置底操作、拖曳 session 與 FLIP 動畫，排序結果再透過 Editor Core 命令提交。
  - `inspector-controller.ts` 管理 Step 3 屬性面板的欄位同步、色票、滑桿、旋轉控制與編輯事件，物件變更仍透過 Editor Core 命令提交。
  - `selection-controller.ts` 集中選取狀態、物件拖曳、鍵盤微調、空白區域取消選取與 Inspector 同步。
  - `crop-controller.ts` 管理 Step 1 比例選擇、裁切框、專案裁切狀態、地圖 clip 與遮罩；純幾何運算位於 `crop-geometry.ts`。
  - `map-viewport-controller.ts` 管理地圖縮放、平移、畫布適配、座標換算與循環世界偏移。
  - `map-interaction-controller.ts` 管理地圖滾輪、平移、框選縮放及指標事件生命週期。
- `src/renderer/bridge.ts`
  - 將 shared IPC 契約提供給 renderer，並宣告 `window.mapSchematic`；不再另外維護 preload API、GeoNames 或專案操作型別。
- `src/renderer/editor/*`
  - 以單一 `EditorDocument.objects` 管理點標示與形狀，並以可辨識物件型別提供安全存取。
  - `defaults.ts` 與 `presentation.ts` 分別集中物件預設樣式、標示顯示文字與座標格式，供建立、載入與畫面呈現共用。
  - `editor-core.ts` 集中套用編輯命令、交易與最多 300 筆的 Undo/Redo 歷史；UI 不再自行維護完整文件快照。
  - `commands.ts` 定義可序列化的新增、刪除、欄位更新、排序與清空命令，套用前會檢查目前資料狀態。
  - 命令只保存實際變更欄位；連續文字與滑桿修改可合併，拖曳期間即時預覽並在結束時記為單一命令。
- `src/renderer/project/project-state.ts`
  - 比較目前專案與最近一次成功儲存／載入的內容，供未儲存狀態提示使用。
  - 分離目前 renderer 可編輯的 point 物件與尚未支援的幾何物件；後者不顯示，但再次儲存時會原樣保留。
- `src/renderer/project/operation-coordinator.ts`
  - 依照請求順序逐一執行載入、儲存、另存與關閉前儲存，避免非同步結果互相覆寫專案路徑與狀態。
  - 單一操作失敗後仍會繼續處理後續操作，不讓整條佇列永久停止。
- `src/renderer/project/project-adapter.ts`
  - 集中處理 `.mapproj` 與 `EditorDocument` 的雙向轉換，保留可編輯物件的圖層歸屬，renderer 互動邏輯不直接解析專案欄位；名稱不再綁定特定舊 schema 版本。
- `src/renderer/project/canvas.ts`
  - 集中處理專案畫布比例、px／mm 邏輯尺寸與匯出像素換算。
- `src/renderer/map/geometry.ts`
  - 集中 EPSG:4326／EPSG:3857 投影、循環經度正規化、跨日期變更線範圍轉換與 GeoJSON 至 SVG path 轉換。
- `src/renderer/map/basemap-renderer.ts`
  - 載入官方資料包底圖與地形陰影，集中 Canvas 繪製、風格切換、預覽與匯出所需的底圖狀態。
- `src/renderer/overlay/object-order-model.ts`
  - 集中標示顯示名稱、唯一名稱、排序鍵正規化、顯示順位與重複物件判斷。
- `src/renderer/ui/slider.ts`
  - 提供共用滑桿建立、鍵盤操作、數值吸附與畫面同步。
- `src/renderer/ui/input-selection.ts`
  - 提供輸入框首次點擊全選行為，供屬性面板、座標 dialog 與比例欄位共用。

共用模組（Shared）：

- `src/shared/ipc-contract.d.ts`
  - 定義 main、preload 與 renderer 共用的 IPC payload、回傳值、選單動作及 `MapSchematicApi`，讓兩端的介面變更可由 TypeScript 一起檢查。
- `src/shared/ipc-channels.ts`
  - 保存 IPC channel 名稱的唯一來源，避免 main 與 preload 使用不同字串。
- `src/shared/paths.ts`
  - 統一解析資料根目錄。
- `src/shared/datapack/*`
  - 定義 manifest／release 契約、檔案校驗、active 版本、初始化、更新、修復、安全啟用與 fallback。
  - `contract.d.ts` 保存跨 main／renderer 使用的資料包型別，runtime 模組只保留實際邏輯。
  - `pack-release.json` 是目標資料包 id／version 的唯一來源，不另在程式碼維護重複版本常數。
- `src/shared/validation/primitives.ts`
  - 提供 schema、資料包 manifest 與建置資訊解析共用的 record、有限數值及非空字串檢查。
- `src/shared/schema/mapproj.ts`
  - 提供目前 `.mapproj` v0.7 版本常數與初始專案。
- `src/shared/schema/mapproj-contract.d.ts`
  - 集中定義 main、preload、renderer 共用的 `.mapproj` 與可序列化歷史命令契約；0.7 物件 style 的標記欄位、圖形欄位與視覺樣式均使用明確型別，不接受任意欄位。
- `src/shared/schema/history.ts`
  - 驗證 historyVersion、命令結構、物件快照、數量與遞迴深度，並安全處理舊版歷史。
- `src/shared/schema/migrate.ts`
  - 依 schemaVersion 逐版遷移專案；目前支援 v0.1 → v0.2 → v0.3 → v0.4 → v0.5 → v0.6 → v0.7，未知版本不會被猜測轉換。
- `src/shared/schema/validate.ts`
  - 驗證專案結構、物件、座標、樣式、ID 與圖層引用。
- `src/shared/schema/io.ts`
  - 負責純 JSON 專案檔的序列化、遷移、原子儲存、`.bak` 備份、恢復與載入。

## 資料與輸出路徑

- 資料包根目錄由 `src/main/data-root.ts` 統一決定，實際資料位於其下的 `geodata/`；開發版與封裝版會讀取 `%LOCALAPPDATA%\map-schematic\datapack-location.json` 的相同位置設定，因此可共用同一份資料包。
- 第一次從已有資料包的開發版啟動時，會使用 repo 根目錄並記住這個位置；之後安裝版會直接共用該資料包。
- 若尚無既有資料包，兩種模式都預設使用 `%LOCALAPPDATA%\map-schematic\geodata`，首次初始化後只會保存一份。
- `MAP_SCHEMATIC_ROOT` 可暫時覆寫資料包根目錄，供可攜式部署、測試或進階使用；程式碼不得硬編碼絕對路徑。
- 專案與匯出預設位置：開發模式為 repo 的 `project_files/`；封裝版本為使用者文件目錄下的 `map-schematic/`。

## 建置與發行產物

- `out/`
  - TypeScript 編譯結果與 renderer 靜態檔。
- `dist/`
  - Windows 封裝產物，例如安裝程式與 exe。
- `packaging/`
  - 集中 Windows 封裝設定、目標格式選擇與封裝腳本。可輸出 NSIS 安裝程式、可攜式資料夾或可攜式 ZIP，且不會發佈或下載資料包。
  - `electron-builder.yml` 會將 `ATTRIBUTIONS.md` 複製至發行內容的 `resources/`，供應用程式內顯示與使用者直接查閱。

官方資料包的建置、發布、安裝與更新流程見 `datapack.md`；應用程式與資料包的發布前驗證見 `release-checklist.md`。
