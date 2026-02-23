# 架構概覽

本文件說明目前 repo 結構，以及最小 Electron 骨架的執行流程。

## 專案結構

- `AGENTS.md`：專案規範與資料政策（離線、禁用外部 API）。
- `README.md`：專案簡介與文件索引。
- `docs/`：規格與架構文件。
- `src/`：TypeScript 原始碼。
- `scripts/`：建置輔助腳本。
- `geodata/`：官方資料包的本機資料根目錄（僅 repo 內）。
- `package.json`、`tsconfig.json`：專案設定。

## 執行流程（骨架）

1. `npm run build` 編譯 `src/` 到 `dist/`，並複製 `src/renderer/index.html` 至 `dist/renderer/`。
2. `npm run start` 啟動 Electron，載入 `dist/renderer/index.html`。

## 程式碼結構

主程序（Main）：

- `src/main/index.ts`：Electron 進入點，負責建立視窗與載入 renderer。
- `src/main/preload.ts`：`contextBridge` 封裝，提供 renderer 使用的最小 API（目前為 `ping`）。

渲染程序（Renderer）：

- `src/renderer/index.html`：最小 UI 殼，確認應用啟動成功。
- `src/renderer/index.ts`：渲染端入口，顯示 bridge 狀態。

共用模組（Shared）：

- `src/shared/paths.ts`：統一解析 `geodata/` 資料目錄，避免硬編碼路徑。

建置與輸出：

- `scripts/copy-static.mjs`：複製 renderer 靜態檔到 `dist/renderer/`。
- `dist/`：TypeScript 編譯輸出（由 `npm run build` 產生）。

資料目錄：

- `geodata/`：官方資料包、本地索引、快取等資料的唯一根目錄（repo 內）。
