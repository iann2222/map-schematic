# map-schematic

`map-schematic` 是一套 Electron + TypeScript 的離線地圖示意圖製作工具。使用者可基於真實地理形狀設定地圖範圍與底圖樣式，加入地名、文字、點、線、區域與箭頭，並保存為可重新編輯的 `.mapproj` 專案檔。

## 核心原則

- 日常使用時完全離線，不呼叫外部地圖、地名或地理 API。
- 底圖、GeoNames 地名索引與地形陰影均來自官方資料包。
- 網路只用於首次初始化或使用者主動更新、修復官方資料包。
- 產品定位為中尺度地圖示意，不提供街道、建築、地址或導航資料。

## 目前功能

- Step 0 大致定位、Step 1 範圍與比例、Step 2 底圖樣式、Step 3 標示與繪製。
- Natural Earth 向量底圖、GeoNames 離線搜尋、座標搜尋與地形陰影。
- 點、文字、線、區域與箭頭標示，以及排序、拖曳和樣式調整。
- `.mapproj` 專案檔保存、載入、結構驗證與資料包版本提示。
- PNG、PDF 與真正向量 SVG 匯出；PNG／PDF 匯出前可選擇無外框或簡易畫框。
- 本機系統字型選項與 fallback；專案檔保存字型設定但不內嵌字型檔。
- Vitest 本機自動化測試。

## 開始使用

安裝依賴：

```powershell
npm install
```

建置並啟動 Electron：

```powershell
npm run start:dev
```

若已完成建置，也可直接啟動：

```powershell
npm start
```

首次啟動若缺少資料包，程式會依 `pack-release.json` 下載並驗證官方資料包。已安裝資料包損壞且無法由上一版本恢復時，程式會先詢問使用者，取得同意後才重新連網下載。

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

- 開發模式：資料包位於 repo 的 `geodata/`，專案檔與匯出預設位於 `project_files/`。
- 封裝版本：資料包位於 Electron `userData` 下的 `geodata/`，專案檔與匯出預設位於使用者文件目錄下的 `map-schematic/`。

大型資料與本機輸出不應提交至 Git repository。
