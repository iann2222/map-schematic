# 架構概覽

本文件說明目前 repo 結構，以及 Electron MVP demo 的執行流程。

## 專案結構

- `AGENTS.md`：專案規範與資料政策（離線、禁用外部 API）。
- `README.md`：專案簡介與文件索引。
- `docs/`：規格與架構文件。
- `src/`：TypeScript 原始碼。
- `scripts/`：建置輔助腳本（資料包建置）。
- `geodata/`：官方資料包的本機資料根目錄（repo 內、gitignore）。
- `geodata_source/`：原始資料來源（repo 內、gitignore）。
- `project_files/`：專案檔與匯出結果的固定存放目錄（repo 內、gitignore）。
- `package.json`、`tsconfig.*.json`：專案設定與建置配置。
- `pack-release.json`：資料包下載設定（Release 直連與校驗資訊）。

## 執行流程（MVP）

1. `npm run build`
   - 編譯 main（CommonJS）與 renderer（ESM）
   - 複製 renderer 靜態檔到 `dist/renderer/`
2. `npm run start`
   - 啟動 Electron
   - Renderer 載入並顯示 basemap + GeoNames 搜尋結果

## 程式碼結構（目前）

主程序（Main）：

- `src/main/index.ts`
  - 建立視窗
  - 註冊 IPC（datapack/basemap/geonames/project）
- `src/main/preload.ts`
  - `contextBridge` API 封裝
- `src/main/geonames.ts`
  - GeoNames SQLite 查詢

渲染程序（Renderer）：

- `src/renderer/index.html`
  - UI：搜尋欄、結果清單、儲存/載入按鈕
- `src/renderer/index.ts`
  - Basemap SVG 渲染（EPSG:4326 → 3857）
  - GeoNames 搜尋結果列表 + 點標示
  - `.mapproj` 儲存/載入（demo）
  - 地形陰影：讀取資料包 relief，採 EPSG:3857 紋理與可切換混合模式顯示

共用模組（Shared）：

- `src/shared/paths.ts`
  - `geodata/` 路徑解析
- `src/shared/config.ts`
  - 資料包 id/version 設定
- `src/shared/datapack/*`
  - 資料包路徑/manifest 管理
- `src/shared/schema/*`
  - `.mapproj` schema、驗證、IO

建置與輸出：

- `scripts/build_datapack.py`
  - 讀取 `geodata_source/` 原始資料
  - 產出 `geodata/packs/...` 官方資料包
  - 若提供 `geodata_source/hillshade.png`，會直接納入地形陰影層（避免大型 GeoTIFF 轉檔不穩）
- `project_files/`
  - `.mapproj` 專案檔與匯出檔的預設存放位置
- `dist/`
  - TypeScript 編譯輸出
