# map-schematic

`map-schematic` 是一套 Electron + TypeScript 的離線地圖示意圖製作工具。使用者可基於真實地理形狀設定地圖範圍與底圖樣式，加入地名、文字、點、線、區域與箭頭，並保存為可重新編輯的 `.mapproj` 專案檔。

## 核心原則

- 日常使用完全離線，不呼叫外部地圖、地名或地理 API。
- 底圖、GeoNames 地名索引與地形陰影皆來自官方資料包。
- 網路僅用於首次初始化，或使用者主動更新、修復官方資料包。
- 產品定位為中尺度地圖示意，不提供街道、建築、地址或導航資料。

## 目前功能

- Step 0 大致定位、Step 1 範圍與比例、Step 2 底圖樣式、Step 3 標示與繪製。
- Natural Earth 向量底圖、GeoNames 離線搜尋、座標搜尋與地形陰影。
- 統一資料包 manager：完整性驗證、active 版本管理、安全更新、舊版 fallback 與損壞修復。
- 點、文字、線、區域與箭頭標示，並支援排序、拖曳、樣式調整與 Undo/Redo。
- `.mapproj` 專案檔遷移、原子儲存、有效備份、確認後恢復、結構驗證與資料包版本提示。
- PNG、PDF 與真正向量 SVG 匯出；PNG／PDF 匯出前可選擇無外框或簡易畫框。
- 本機系統字型選項與 fallback；專案檔保存字型設定，但不內嵌字型檔。
- Vitest 本機自動化測試。

## 開始使用

開發環境支援 Node 20（20.19 以上）、Node 22（22.12 以上）與 Node 24 以上，建議使用 Node 20 LTS。若使用 nvm 或 fnm，可依 `.nvmrc` 切換版本。

安裝依賴：

```powershell
npm ci
```

建置並啟動 Electron：

```powershell
npm run start:dev
```

若已完成建置，可直接啟動：

```powershell
npm start
```

換裝置、作業系統或 CPU 架構時，請重新執行 `npm ci`，不要直接複製 `node_modules`；安裝後專案會自動重建 `better-sqlite3` 的 Electron 原生模組。打包後的應用程式已內含 runtime，一般使用者無需安裝 Node.js。

首次啟動若缺少資料包，程式會依 `pack-release.json` 下載並驗證官方資料包。若已安裝的資料包損壞且無法由上一版本恢復，程式會先徵得使用者同意，才重新連網下載。

### 新裝置啟動

取得專案後，依序執行：

```powershell
cd path\to\map-schematic
fnm install 20
fnm use 20
npm ci
npm run start:dev
```

使用 nvm 時，將前兩行改為 `nvm install 20` 與 `nvm use 20`。首次啟動若本機缺少完整資料包，應用程式會詢問並下載官方資料包；安裝驗證完成後，日常使用即不需網路連線。

資料包不會隨 Git repository 複製。搬移既有 `.mapproj` 專案檔時，請確認新裝置已安裝相容的資料包版本；最簡單的方式是讓應用程式於首次啟動時自行初始化。

## 測試與建置

```powershell
npm test
npm run test:watch
npm run test:typecheck
npm run build
```

各測試指令的用途詳見 `docs/architecture.md`。

## 文件

- 產品理念：`docs/product-vision.md`
- 技術架構與選型：`docs/technical-architecture.md`
- 程式碼架構：`docs/architecture.md`
- 開發與資料政策：`AGENTS.md`
- 資料來源與授權：`ATTRIBUTIONS.md`

## 資料與輸出位置

- **目前的開發模式**：以 `npm run start:dev` 或 `npm start` 從 repo 啟動時，資料包位於 repo 的 `geodata/`，專案檔與匯出預設位於 `project_files/`。
- **未來的封裝版本**：透過安裝後的桌面應用程式啟動時，資料包位於 Electron `userData` 下的 `geodata/`，專案檔與匯出預設位於使用者文件目錄下的 `map-schematic/`。
- 兩種模式預設使用不同位置，不會自動共用資料包。目前 repo 尚未提供封裝腳本；新裝置 clone 後依 README 的啟動流程執行，仍屬於開發模式。

大型資料與本機輸出不應提交至 Git repository。
