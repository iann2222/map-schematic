# map-schematic

`map-schematic` 是一套 Electron + TypeScript 的離線地圖示意圖製作工具。使用者可基於真實地理形狀設定地圖範圍與底圖樣式，加入地名、文字、點、線、區域與箭頭，並儲存為可重新編輯的 `.mapproj` 專案檔。

## 核心原則

- 日常使用完全離線，不呼叫外部地圖、地名或地理 API。
- 底圖、GeoNames 地名索引與地形陰影皆來自官方資料包。
- 網路僅用於首次初始化，或使用者主動更新、修復官方資料包。
- 產品定位為中尺度地圖示意，不提供街道、建築、地址或導航資料。

## 目前功能

- Step 0 大致定位、Step 1 範圍與比例、Step 2 底圖樣式、Step 3 標示與繪製。
- Natural Earth 向量底圖、GeoNames 離線搜尋、座標搜尋與地形陰影。
- 統一資料包管理：完整性驗證、版本切換、安全更新、舊版回退與損壞修復。
- 點、文字、線、區域與箭頭標示，支援排序、拖曳、樣式調整與復原／重做。
- `.mapproj` 專案檔支援版本遷移、編輯歷史保存、原子儲存、備份與復原、結構驗證與資料包版本提示。
- 匯出 PNG、PDF 與向量 SVG，PNG／PDF 可選擇無外框或簡易畫框。
- 支援本機系統字型（含 fallback）；專案檔僅記錄字型設定，不內嵌字型檔。
- 內建 Vitest 自動化測試。

## 開始使用

不同用途需要的環境不同：

| 用途 | 需要安裝 |
| --- | --- |
| 使用封裝後的 EXE | 不需要 Node.js、Python 或 Conda |
| 開發及封裝 Electron 應用程式 | Node.js 與 npm |
| 製作官方資料包 | Conda、固定的資料包建置環境與官方原始資料 |

**環境需求**：Node 20（20.19 以上）、22（22.12 以上）或 24 以上，建議使用 Node 20 LTS。若使用 nvm 或 fnm，可依 `.nvmrc` 切換版本。

```powershell
# 安裝依賴
npm ci

# 建置並啟動 Electron
npm run start:dev

# 已完成建置後，可直接啟動
npm start
```

> 換裝置、作業系統或 CPU 架構時，請重新執行 `npm ci`，不要直接複製 `node_modules`；安裝時會自動重建 `better-sqlite3` 的原生模組。打包後的應用程式已內含 runtime，一般使用者不需安裝 Node.js。

**首次啟動**：若缺少資料包，程式會依 `pack-release.json` 自動下載並驗證官方資料包。已安裝的資料包損壞且無法從舊版本恢復時，程式會先徵得使用者同意才重新下載；新版資料包則可在偏好設定中主動更新。

**新裝置啟動範例**：

```powershell
cd path\to\map-schematic
fnm install 20   # 或 nvm install 20
fnm use 20       # 或 nvm use 20
npm ci
npm run start:dev
```

使用 nvm 時，將前兩行改為 `nvm install 20` 與 `nvm use 20`。首次啟動若本機缺少完整資料包，應用程式會下載並完成驗證；安裝驗證完成後，日常使用即不需網路連線。

資料包不會隨 Git repository 複製。搬移既有 `.mapproj` 專案檔時，請確認新裝置已安裝相容版本的資料包，最簡單的方式是讓應用程式於首次啟動時自行初始化。

### 新設備建立資料包建置環境

只有需要重新製作官方資料包時才需執行以下步驟。`environment-win-64.lock.txt` 固定完整的 Windows x64 Conda 相依，應用程式開發與 EXE 執行不會使用這個環境。

```powershell
cd path\to\map-schematic
conda create -n mapschem --file environment-win-64.lock.txt
conda activate mapschem
python scripts/build_datapack.py --check-environment
python -m unittest discover -s test/python -p "test_*.py"
```

環境檢查會確認目前 Conda 環境的完整套件 URL、版本、build、MD5 與 win-64 平台都符合鎖定檔，並拒絕額外的 Conda 或 pip 套件。只有六個核心套件版本相同仍不算通過。

`environment.yml` 是維護核心套件版本的來源，不保證間接相依永遠相同；跨設備重建正式環境時應使用鎖定檔。既有同名環境不符合時，應依 `docs/datapack.md` 以其他名稱建立乾淨環境。資料包原始地理資料不在 Git repository，實際建置前仍須另外準備官方來源檔案。

## 測試與建置

```powershell
npm test                # 執行測試
npm run test:datapack-tools # 資料包 Python 工具測試
npm run test:watch      # 監看模式
npm run test:typecheck  # 型別檢查
npm run build           # 建置
npm run package:win     # Windows 封裝
```

各測試指令的用途詳見 `docs/architecture.md`。

## 文件

- 產品願景與完成狀態：`docs/product-vision.md`
- 現行程式架構：`docs/architecture.md`
- `.mapproj` 專案格式：`docs/project-format.md`
- 官方資料包：`docs/datapack.md`
- 發布檢查清單：`docs/release-checklist.md`
- 開發與資料政策：`AGENTS.md`
- 資料來源與授權：`ATTRIBUTIONS.md`

## Windows 封裝

```powershell
npm run package:win
```

此指令會先建置，再依 `packaging/release-config.mjs` 產生 x64 產物，完成後終端機會印出實際產物路徑。`releaseTarget` 可選擇以下三種格式（各格式說明見檔案內註解）：

| 格式     | 產物位置                               | 說明                                       |
| -------- | -------------------------------------- | ------------------------------------------ |
| `setup`  | `dist/Map Schematic-<version>-Setup-x64.exe` | 安裝程式，已內含 Electron runtime    |
| `folder` | `dist/win-unpacked/`                   | 可攜式程式，執行其中的 `Map Schematic.exe` |
| `zip`    | `dist/Map Schematic-<version>-Portable-x64.zip` | 可攜式程式壓縮檔                      |

封裝產物中不含官方資料包；首次啟動時仍會詢問並下載、驗證，之後即可離線使用。

建置時會將 `package.json` 版本與目前 Git commit SHA 寫入應用程式，可在「說明 > 關於」查看。若從沒有 `.git` 的來源封裝，需先設定 `MAP_SCHEMATIC_COMMIT_SHA`；工作樹含未提交變更時會標示為 dirty。

資料來源與授權檔會放在封裝內容的 `resources/ATTRIBUTIONS.md`，也可從應用程式的「說明 > 資料來源與授權」查看。

> 封裝使用 `packaging/icon.ico` 作為 Windows 應用程式、安裝程式與捷徑圖示；原始設計檔保留為 `packaging/icon-source.png`。尚未設定程式碼簽章，首次執行或安裝時 Windows 可能顯示未知發行者或 SmartScreen 提示。

更換原始 PNG 後，可在 Windows 執行 `powershell -ExecutionPolicy Bypass -File packaging/create-icon.ps1`，重新產生多尺寸的 `icon.ico`。

## 資料與輸出位置

- **共用資料包**：開發版與安裝版共用同一個資料包根目錄（實際資料位於其下的 `geodata/`），不會因安裝版而複製一份。位置設定儲存於 `%LOCALAPPDATA%\map-schematic\datapack-location.json`。
- **首次從開發版啟動**：若 repo 內已有完整資料包，會直接使用 repo 的 `geodata/`，並讓之後的安裝版共用它。
- **無既有資料包時**：開發版與安裝版皆使用 `%LOCALAPPDATA%\map-schematic\geodata`；初始化完成後只會保留一份資料包。
- **進階指定位置**：可在啟動前設定環境變數 `MAP_SCHEMATIC_ROOT`，暫時指定包含 `geodata/` 的根目錄，適合可攜式部署或測試。
- **專案與匯出**：開發模式預設使用 repo 的 `project_files/`；安裝版預設使用使用者文件目錄下的 `map-schematic/`。

大型資料與本機輸出不應提交至 Git repository。
