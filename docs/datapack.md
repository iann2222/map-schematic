# 官方資料包

本文件描述官方資料包的目前格式、建置、安裝與更新流程。執行時資料政策以 `AGENTS.md` 為最高原則。

## 執行原則

- 一般編輯、地名搜尋、地圖渲染、專案存取與匯出必須完全離線。
- 不使用線上地圖瓦片、線上 geocoding 或第三方即時地理 API。
- 網路只用於首次初始化、使用者主動更新，或使用者確認後的損壞修復。
- 所有底圖、地名與地形資料都來自官方資料包。
- 官方資料包不提交至 Git repository，也不封裝進應用程式。

資料來源與授權見 repo 根目錄的 `ATTRIBUTIONS.md`。

## 資料內容

目前標準資料包包含：

- Natural Earth 50m 製圖級底圖 GeoJSON
- GeoNames SQLite + FTS 離線地名索引
- 可選的 Natural Earth Shaded Relief
- `datapack.json` manifest

底圖以中尺度使用為目標，不提供街道、建築、地址或導航資料。

典型目錄：

```text
geodata/
  active.json
  packs/
    standard/
      2026.02/
        datapack.json
        basemap/
        geonames/
        relief/
```

`active.json` 只指向已完整驗證的版本。不同版本可以並存，以便離線 fallback。

## 資料根目錄

`src/main/data-root.ts` 與 `src/shared/paths.ts` 統一決定資料位置：

- 開發版與封裝版讀取相同的 `%LOCALAPPDATA%\map-schematic\datapack-location.json`。
- repo 已有完整資料包時，第一次從開發版啟動會記住 repo 根目錄。
- 沒有既有資料包時，預設使用 `%LOCALAPPDATA%\map-schematic\geodata`。
- `MAP_SCHEMATIC_ROOT` 可暫時指定包含 `geodata/` 的根目錄。

程式碼不得自行硬編碼其他絕對路徑。

## 原始資料

`geodata_source/` 的最小建置輸入：

1. Natural Earth
   - 解壓後的 `50m_physical/`
2. GeoNames
   - `cities1000.zip`，預設
   - `alternateNamesV2.zip`
3. 地形陰影，可選
   - 建議直接提供 `hillshade_3857.png`
   - 或提供可由腳本辨識的 `MSR_50M.zip`／`US_MSR_10M.zip`

只有使用 `--geonames all` 時才需要 `allCountries.zip`。使用 `cities15000` 時需提供對應 ZIP。

## 建置

### 誰需要 Conda

- 一般使用封裝版 EXE：不需要 Conda、Python 或 GDAL。
- 開發、測試或封裝 Electron 應用程式：只需要 README 指定的 Node.js 與 npm。
- 重新製作官方資料包：才需要本節的 Conda 環境與 `geodata_source/` 官方原始資料。

Conda 環境只用於把 Natural Earth、GeoNames 與地形來源轉換成官方資料包，不是應用程式 runtime。封裝版會直接讀取已完成的資料包，不會在使用時執行 Python、GeoPandas、Pyogrio、Pyproj 或 GDAL。

### 環境契約

官方 Windows 資料包使用兩層 Conda 環境契約：

- `environment.yml`：維護者可讀的直接相依與版本來源。
- `environment-win-64.lock.txt`：正式建置使用的完整 win-64 鎖定檔，包含所有間接相依、來源 URL 與 MD5。

`environment.yml` 交給 Conda 重新解析時，間接相依可能因套件庫更新而改變，因此不作為跨設備完全重現正式環境的入口。`requirements.txt` 也不再作為另一套安裝入口。

正式環境檢查不只比較 Python、GeoPandas、Pyogrio、Pyproj、Pillow 與 GDAL。腳本會取得目前環境的 Conda explicit 清單，逐項核對鎖定檔中的套件 URL、版本、build 與 MD5，確認平台為 win-64，並拒絕鎖定檔外的 Conda 或 pip 套件。標準化後的鎖定檔 SHA-256 會寫入 manifest。

### 新設備建立相同環境

以下流程適用於 Windows x64。安裝 Git 與 Conda，取得 repository 後執行：

```powershell
cd path\to\map-schematic
conda create -n mapschem --file environment-win-64.lock.txt
conda activate mapschem
python scripts/build_datapack.py --check-environment
python -m unittest discover -s test/python -p "test_*.py"
```

環境檢查應顯示 Python 3.11.14、GeoPandas 1.1.2、Pyogrio 0.11.1、Pyproj 3.7.2、Pillow 12.1.0 與 GDAL 3.11.4。若 `mapschem` 名稱已存在，可用另一個名稱建立，不要在未確認用途前覆蓋既有環境：

```powershell
conda create -n mapschem-build --file environment-win-64.lock.txt
conda activate mapschem-build
```

既有環境即使六個核心版本相同，只要間接相依、來源、build、MD5 或額外套件不同，仍會被拒絕。這代表它不等同於正式鎖定環境，不應用來製作發布資料包。

Conda 環境只包含建置工具，不包含 `geodata_source/`。要真正產生資料包，仍需另外準備本文件「原始資料」列出的官方來源檔案。

### 更新建置版本

只有維護者決定升級 Python、GeoPandas、Pyogrio、Pyproj、Pillow 或 GDAL 時，才修改 `environment.yml`。可先建立試驗環境：

```powershell
conda env create -n mapschem-next -f environment.yml
conda activate mapschem-next
```

確認新版本可用後，必須在 Windows 重新產生並提交完整鎖定檔：

```powershell
python scripts/lock_datapack_environment.py
python -m unittest discover -s test/python -p "test_*.py"
```

正式建置前仍應執行 `python scripts/build_datapack.py --check-environment`。缺少工具或版本不同時，腳本會在讀取原始資料前停止。

資料包建置腳本依責任分為：

- `build_datapack.py`：命令列參數、建置順序、完整性檢查與版本目錄切換。
- `datapack_environment.py`：Conda 鎖定環境與 GDAL 工具鏈驗證。
- `datapack_basemap.py`：Natural Earth 圖層轉換與跨日期變更線幾何處理。
- `datapack_geonames.py`：GeoNames ZIP 讀取、SQLite schema、批次匯入與 FTS 索引。
- `datapack_relief.py`：地形來源辨識、GDAL 投影與陰影圖片產生。
- `datapack_manifest.py`：內容檔 checksum 收集與 manifest 安全寫入。
- `datapack_common.py`：建置與發布腳本共用的版本、安全路徑及 Conda 鎖定契約。

標準範例：

```powershell
python scripts/build_datapack.py --id standard --version 2026.02 --geonames cities1000 --force
```

常用參數：

- `--raw`：原始資料根目錄，預設 `geodata_source`
- `--out`：輸出根目錄，預設 `geodata/packs/standard`
- `--id`：資料包 id
- `--version`：資料包版本
- `--geonames`：`cities1000`、`cities15000` 或 `all`
- `--force`：允許替換既有目標版本

非 manifest-only 建置會先在同層建置目錄產生完整資料包。必要內容與 checksum 驗證成功後才替換正式版本；失敗時保留既有資料。

`--id` 與 `--version` 只能使用 1 至 64 個英數字、點、底線或連字號，不可包含 `..`、路徑分隔符、結尾點或 Windows 保留裝置名稱。輸出路徑還會再次確認必須位於指定 output root 的直接下一層。

地形投影會優先使用 `MAPSCHEM_GDALWARP` 指定的 `gdalwarp`，否則使用目前 Conda 環境 `PATH` 中的版本。環境檢查會先執行 `gdalwarp --version`；正式資料包應使用 `EPSG:3857` 的 `hillshade_3857.png`。

## 成功輸出

至少應包含：

```text
geodata/packs/standard/<version>/datapack.json
geodata/packs/standard/<version>/basemap/*.geojson
geodata/packs/standard/<version>/geonames/geonames.sqlite
geodata/packs/standard/<version>/relief/hillshade_3857.png  # 可選
```

`datapack.json` 保存資料包 id、version、資料入口、固定工具鏈的 `buildEnvironment`，以及每個內容檔的 size／SHA-256。`buildEnvironment` 包含六個核心版本、`condaPlatform` 與標準化的 `condaLockSha256`；manifest 不將自己列入 `files`。

## 發布設定

`pack-release.json` 是應用程式目標資料包 id／version 與下載資訊的唯一來源，包含：

- `id`
- `version`
- GitHub Release asset `url`
- ZIP `sha256`
- `sourceFiles`

資料包建置完成後：

1. 將 `{id}/{version}/` 內容打包為 ZIP。
2. 上傳至 GitHub Releases。
3. 執行 `scripts/update_pack_release.py` 驗證 ZIP。
4. 由腳本更新 `pack-release.json`。
5. 依 `release-checklist.md` 完成安裝、更新與離線 fallback 驗證。

`update_pack_release.py` 會驗證 ZIP 根目錄的 `datapack.json`、引用路徑、檔案大小與 checksum，通過後才寫入 release 設定。

## Runtime 安裝

首次缺少資料包時：

1. 讀取 `pack-release.json`。
2. 下載至暫存 ZIP。
3. 驗證 Release SHA-256。
4. 防護性解壓至暫存安裝目錄。
5. 驗證 manifest、路徑、必要檔案、size 與內容 checksum。
6. 完整驗證後才切換 `active.json`。

ZIP 安裝會拒絕路徑跳脫、符號連結與異常大的內容。下載、解壓或切換失敗時會清理暫存內容，不把半成品當成可用版本。

## 更新、修復與 Fallback

- 本機已有有效舊版時，啟動不會自動下載新版。
- 偏好設定顯示目前版本、目標版本與資料包狀態。
- 只有使用者主動按下更新並確認後才下載。
- 新版完整驗證後才切換，舊版保留為 fallback。
- 使用中的版本損壞時，先嘗試恢復其他有效版本。
- 必須重新下載修復時，先詢問使用者是否允許連網。
- 目標版本切換失敗時會恢復原目標與原 active 狀態。

一般使用期間的狀態檢查只讀取本機檔案。

## 常見失敗

- `50m_physical.zip` 尚未解壓為 `50m_physical/`
- 缺少 `alternateNamesV2.zip`
- 選擇 `all` 卻未提供 `allCountries.zip`
- 地形來源檔名無法辨識，且沒有 `hillshade_3857.png`
- ZIP 內容與 `datapack.json` 的 size／checksum 不一致
- `pack-release.json` 的 id／version 與 ZIP manifest 不一致
