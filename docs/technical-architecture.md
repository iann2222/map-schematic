# 地圖示意圖製作工具 - 技術架構與技術選型說明文件

# 1. 系統總覽

本系統為一套基於真實地理資料之地圖示意圖製作工具。

核心原則：

- 不依賴外部 API 進行即時查詢
- 地圖與地名資料由系統自持
- 支援離線使用
- 採中尺度地圖範圍
- 控制資料包大小與系統複雜度

---

# 2. 技術選型決策

## 2.1 App 主體與語言

決策：桌面應用採 Electron + TypeScript。

理由：

- Electron 在檔案系統、跨平台、下載資料包、壓縮解壓、匯出檔案等需求上成熟。
- TypeScript 適合大型資料模型（`.mapproj` schema）、序列化與狀態管理。
- 以最低返工風險為優先，優先完成核心模型與流程。

補充：

- 目前 renderer 使用原生 HTML、CSS 與 TypeScript，尚未引入 React 或 Vue；bridge 契約、編輯歷史、投影幾何與共用控制已由入口檔拆成獨立模組。
- Step 3 的 Undo/Redo 使用記憶體快照，涵蓋標示與形狀的新增、刪除、拖曳、內容、樣式及排序；專案載入時重設歷史，不將單純選取或地圖縮放記入歷史。

## 2.2 渲染層策略

決策：以 SVG 為核心渲染與輸出格式，必要時輔以 Canvas 2D。

理由：

- 產品尺度與需求以清晰示意為主，SVG 性能足夠。
- SVG 便於顯示、向量輸出與印刷；PNG／PDF 則使用獨立的點陣合成管線。
- 物件模型可直接對應向量幾何 + 樣式，`.mapproj` 結構直覺。

影響：

- `.mapproj` 以地理座標幾何與樣式為真實來源，渲染為投影後的 SVG。
- SVG 匯出會重新建立真正的底圖 path 與標示元素；PNG／PDF 會將 Canvas 底圖與 SVG 標示合成為輸出畫布。

投影策略：

- 資料儲存採 `EPSG:4326`（經緯度）。
- 渲染顯示採 `EPSG:3857`（Web Mercator）。

## 2.3 資料包建置工具

決策：資料包建置採 Python（一次性或 CI 管線）。

理由：

- Python 在地理資料處理與索引建置生態成熟。
- 與前端執行環境隔離，確保使用者端離線只讀。

## 2.4 資料包格式與索引選型

底圖（Basemap）：

- 以 GeoJSON 作為第一版輸出格式（MVP）。
- 未來如遇效能瓶頸，再評估轉為 MBTiles（vector tiles）或 GeoPackage。

地名（GeoNames）：

- 採 SQLite + FTS 作為離線索引格式。
- 必要時可加入空間索引（R-Tree 或等價方案）。

語言策略：

- 必留 `en`（英文）。
- 中文優先 `zh-TW`，其次 `zh`。
- 顯示規則建議：`zh-TW` > `zh` > `name` > `en`。

## 2.5 本機資料目錄規範

決策：所有地理資料都位於統一資料根目錄下的 `geodata/`，路徑由 `src/shared/paths.ts` 解析。

原則：

- 開發模式預設以 repo 根目錄作為資料根目錄。
- 封裝版本預設以 Electron `userData` 作為資料根目錄，避免寫入唯讀安裝目錄。
- 可使用 `MAP_SCHEMATIC_ROOT` 覆寫資料根目錄，供開發、測試或可攜式部署使用。
- 路徑不得硬編碼，必須透過統一的資料目錄解析模組取得。
- repo 內的 `geodata/` 必須加入 `.gitignore`。

用途：

- 官方資料包（可多版本並存）
- `active.json`（目前啟用的已驗證版本）
- 解壓後資料
- 本地索引
- 快取資料

---

# 3. 整體架構

系統由以下五個核心模組構成：

1. 底圖資料系統（Basemap System）
2. 地名查詢系統（Geocoding System）
3. 標示與圖形系統（Annotation Engine）
4. 專案檔與匯出系統（Project & Export System）
5. 資料包分發與版本管理系統（Data Distribution & Versioning）

---

# 4. 關鍵規格補強（需先決定）

## 4.1 資料包裁切與索引策略

目的：控制資料包大小、確保離線查詢效能。

原則：

- 僅保留產品目標尺度所需資料。
- 避免全量 GeoNames 造成包體過大與查詢緩慢。

策略：

- GeoNames 僅保留類型：城市、行政區、山脈、河流、島嶼、水域。
- 依重要性欄位（如 population / featureClass / featureCode / rank）設定保留門檻。
- 建議提供分級資料包：`global`、`region`，或依大洲分包。

索引：

- 建立本地全文索引（名稱、別名、語言欄位）。
- 附加索引欄位：類型、重要性、人口、中心座標。

## 4.2 資料版本相容策略

目的：避免資料包與專案檔不一致導致錯誤。

規則：

- `.mapproj` 內必含 `schemaVersion` 與 `dataPackVersion`。
- 若 `dataPackVersion` 不一致：
  - 提示專案與本機資料包版本差異；
  - 由使用者確認是否仍要載入，不在背景自動下載或替換資料包。
- 目前 schema 版本為 `0.2`，載入時會依明確 migration chain 逐版轉換；目前支援 `0.1 → 0.2`，未知與較新版本會停止載入。
- 更新資料包時需下載完成並通過 SHA-256 與內容驗證後才切換。
- `pack-release.json` 是 App 目標資料包 id／version 的唯一設定來源，避免 runtime 常數與 release 設定不一致。

---

# 5. 地圖尺度策略

## 5.1 支援範圍

本系統支援：

- 全球
- 洲際
- 國家
- 區域
- 城市層級

不支援：

- 街道層級
- 建築層級
- 地址解析
- 導航路線

## 5.2 技術實作策略

- 設定最大縮放層級（Zoom Cap）
- 使用低至中解析度製圖級資料
- 不載入街道、POI、建築等資料
- 必要時對幾何進行簡化（geometry simplification）

此策略可有效：

- 降低資料包體積
- 降低渲染負擔
- 明確產品邊界

---

# 6. 底圖資料系統

## 6.1 選用資料來源

採用：

- **Natural Earth**（Public Domain 製圖級資料）

用途：

- 海岸線
- 陸地
- 湖泊
- 河流
- 國界
- 行政區
- 主要地理要素

Natural Earth 為公開可自由使用資料集，適合製圖用途。

不使用：

- OpenStreetMap 線上瓦片服務
- 第三方即時地圖 API

## 6.2 解析度選型

建議：

- 50m 或 110m 解析度為預設底圖
- 10m 僅在必要時選用

選型原則：

- 以中尺度示意圖為優先
- 避免高精度資料導致資料包過大

## 6.3 地形層（Relief Layer）

地形層設計為可選附加層。

方案：

- 使用公開 DEM（數值高程模型）生成 hillshade
- 或使用製圖級 hillshade 資料（Natural Earth Shaded Relief / MSR）
- 作為獨立圖層

特性：

- 可開關
- 可調透明度
- 不與底圖耦合

地形層與底圖資料一併納入官方資料包。

補充（目前實作）：

- 可使用 Natural Earth 的 `MSR_50M.zip` 或 `US_MSR_10M.zip` 作為來源。
- 為避免超大 GeoTIFF 造成建置不穩定，建議先轉成 `hillshade.png` 放入 `geodata_source/`，建置時直接採用。

## 專案檔與匯出路徑

- 開發模式預設存放於 repo 的 `project_files/`（gitignore）。
- 封裝版本預設存放於使用者文件目錄下的 `map-schematic/`。
- 儲存與匯出均透過 Electron 檔案 dialog 讓使用者確認實際位置。

## 資料包載入與失敗處理

- 啟動與首次讀取資料時會驗證 manifest、資料包 id／version、必要檔案、檔案大小與每個內容檔的 SHA-256。
- 若上一次切換留下有效的前一版本，會先嘗試恢復，不直接連網。
- 首次缺少資料包時，依 `pack-release.json` 初始化官方資料包。
- 若 `pack-release.json` 指向新版本，先詢問使用者；取消後繼續使用 `active.json` 指向的有效舊版。
- 已安裝資料包損壞且無法恢復時，先詢問使用者；只有取得同意才連網重新下載。
- 下載、checksum、解壓或驗證失敗會回報錯誤並清理暫存檔，不把不完整資料包當成可用版本。

## 資料包發佈與下載設定

- 下載資訊集中於 `pack-release.json`（repo 根目錄）
- `pack-release.json` 同時是目標資料包 id／version 的唯一來源
- App 啟動時若發現本機資料包不存在，會讀取 `pack-release.json` 進行下載、校驗、解壓
- `pack-release.json` 內容包含：
  - `id`
  - `version`
  - `url`（Release asset 直連）
  - `sha256`（校驗用）
  - `sourceFiles`（本次資料包來源檔案清單）
- 每次發布新的資料包版本時，需同步更新 `pack-release.json`
  - 可使用 `scripts/update_pack_release.py` 依 zip 與來源目錄自動生成/更新

## 資料包發布與下載流程（概略）

1. 原始資料放入 `geodata_source/`
2. 執行 `scripts/build_datapack.py` 產出 `geodata/packs/{id}/{version}/`
3. 將資料包打包成 zip 並發布到 GitHub Releases（tag 對應資料包版本）
4. 執行 `scripts/update_pack_release.py` 驗證 zip 並更新 `pack-release.json`（含 url、sha256、sourceFiles）
   - 需手動提供 `--url`（Release asset 直連）與 `--zip`（本地 zip 路徑）
   - id／version 直接讀取 zip 根目錄的 `datapack.json`；可選的 `--id`／`--version` 只用來交叉檢查
5. App 啟動時若偵測本機缺少資料包：
   - 依 `pack-release.json` 下載 zip → 驗證 SHA-256 → 解壓至暫存安裝目錄
   - 驗證暫存資料包的 manifest、引用路徑與所有內容檔 checksum
   - 完整安裝目標版本後才原子更新 `active.json`
   - 不覆蓋其他有效版本；下載或切換失敗時仍沿用原 active 版本
   - 成功或失敗都清除下載 zip 與暫存安裝目錄
- 正式使用建議以 GDAL 轉成 `EPSG:3857` 的 `hillshade_3857.png`，確保與渲染投影一致。
- 地形陰影顯示採 Canvas 混合模式（如 `overlay` / `multiply` / `screen`）可調，以平衡可讀性與清晰度。

---

# 7. 地名查詢系統

## 7.1 選用資料來源

採用：

- **GeoNames** 資料庫

用途：

- 城市
- 行政區
- 山脈
- 河流
- 島嶼
- 水域
- 別名資料

不使用：

- 線上 Geocoding API
- 即時第三方查詢服務

## 7.2 查詢實作策略

- 本地資料庫索引
- 支援文字搜尋
- 支援類型過濾
- 支援語言匹配
- 排序邏輯包含：
  - 與目前畫布距離
  - 類型匹配
  - 名稱精度
  - 重要性指標

## 7.3 查詢結果處理

- 回傳候選清單
- 使用者手動選擇
- 避免自動決定錯誤位置

---

# 8. 標示與圖形系統

## 8.1 支援標示模式

### 模式 P（Point Label）

- 點座標
- 符號
- 文字
- 引線

### 模式 A（Approx Area）

- 多邊形
- 半透明填色
- 邊線
- 區域文字

### 純文字模式

- 自由放置
- 可附箭頭

## 8.2 幾何來源

- 點：GeoNames
- 區域：Natural Earth 多邊形
- 手繪：使用者自定義多邊形

---

# 9. 專案檔設計

## 9.1 專案檔格式

自訂格式：

`.mapproj`

本質為：

- UTF-8 編碼的結構化 JSON
- 不使用 ZIP 容器，也不內嵌資料包或字型檔

## 9.2 內容包含

- 畫布設定
- 投影設定
- 底圖版本
- 地名資料版本
- 圖層結構
- 標示物件
- 樣式設定

## 9.3 `.mapproj` v0.2 最小欄位

File header：

- schemaVersion（目前為 "0.2"）
- createdAt, updatedAt
- appVersion（可選）

Data dependency：

- dataPackVersion（例如 "2026.02"）
- dataPackId（可選）

Document / Canvas：

- canvas: width, height, unit（px/mm）
- viewport: bbox（minLon/minLat/maxLon/maxLat）
- projection（例如 "EPSG:3857" 或 "EPSG:4326"）

Layers：

- layers[]: id, name, visible, locked, opacity, zIndex

Objects：

- 共通欄位: id, type, layerId, style, geometry, text
- provenance（可選，但建議保留）:
  - source: "geonames" / "manual"
  - sourceId（例如 GeoNames id）
  - query（使用者查詢字串）

UI state：

- ui（v0.2 起為必要容器）
- 可包含標示排序、底圖樣式、地形陰影、比例與裁切設定

## 9.4 版本相容策略

- 每個專案檔包含資料包版本號
- 載入前先驗證 schema 與必要欄位；格式無效時停止載入並顯示錯誤
- 若資料包 id 或版本不一致，提示風險並由使用者決定是否繼續
- 目前寫入 schema `0.2`，並可將 `0.1` 逐版遷移至目前格式
- migration 只處理明確定義的結構變更；缺少版本、未知舊版與較新版本一律不猜測轉換

## 9.5 原子儲存與恢復

- 儲存前先驗證記憶體中的專案內容。
- 在正式檔同目錄建立唯一暫存檔，完成寫入、fsync、重新載入與驗證後才提交。
- 正式檔原本有效時，先複製並驗證為固定的 `.mapproj.bak`；損壞檔不會覆蓋既有有效備份。
- 以同目錄 rename 將完整暫存檔替換正式檔；提交失敗時保留原檔並清理暫存檔。
- 載入正式檔失敗時才檢查 `.bak`。只有備份有效才詢問使用者，確認後才覆蓋損壞檔並恢復。
- 第一次儲存尚無前一版本，因此不建立空備份；後續每次成功儲存保留上一份有效內容。

---

# 10. 匯出系統

支援：

- 高解析 PNG
- 真正向量 SVG
- PDF
- `.mapproj`

SVG 會輸出真正的底圖 path、文字、點、線、區域與箭頭，可供向量設計軟體繼續編輯。若啟用地形陰影，陰影會以內嵌 PNG image 保存，其餘內容仍維持向量。

PNG 與 PDF 匯出前可選擇無外框、細邊框、白色留邊或深色畫框。PNG 使用放大倍率產生較高解析度；PDF 使用匯出畫布建立對應頁面尺寸。

文字使用系統字型與 font-family fallback。`.mapproj` 與 SVG 保存字型名稱，但不散布或內嵌本機字型檔；其他裝置若缺少相同字型，會使用 fallback，排版可能略有差異。

`.mapproj` 為完整可回編格式

---

# 11. 資料包策略

## 11.1 官方資料包內容

資料包包含：

- Natural Earth 底圖資料
- GeoNames 地名資料
- 可選地形層資料
- 本地索引檔
- `datapack.json`（單一入口，描述版本、圖層、索引與校驗）

目前資料包實際使用的原始檔案（MVP，解壓前）：

- Natural Earth 50m Physical（zip 檔）
  - `50m_physical.zip`
- GeoNames
  - `cities1000.zip`
  - `alternateNamesV2.zip`
  - `allCountries.zip`（可選，全量地名）

## 11.2 分發策略

採用：

- **GitHub Releases 作為資料包發佈點**

特性：

- 每個版本對應一個 release
- 單檔上限 2GB
- 可刪除舊版本
- 不影響 repo clone 體積

## 11.3 初始化流程

1. App 首次啟動或首次讀取地圖資料時：
   - 檢查本機資料包是否存在
   - 若不存在 → 從 GitHub Releases 下載官方資料包
2. 下載完成後：
   - 驗證 SHA-256、解壓至暫存目錄並驗證資料內容
   - 驗證成功後才切換至正式資料包目錄
   - 後續使用完全離線

## 11.4 更新策略

- 新版目標由隨 App 發佈的 `pack-release.json` 指定
- 已有有效舊版時，必須由使用者確認才下載並更新
- 不在一般編輯流程中自動連網檢查或下載
- 新版完整驗證後才切換 `active.json`，舊版保留為離線 fallback
- 已安裝資料包損壞時，重新下載前必須取得使用者同意
- 可刪除舊 release 以控制儲存

---

# 12. 不依賴外部 API 的界定

本系統：

- 不呼叫線上地名 API
- 不使用線上地圖瓦片服務
- 不依賴第三方即時地理服務

僅於：

- 初始化或更新時下載官方資料包

---

# 13. 外部支援項目

本專案使用以下外部資料來源：

- Natural Earth（製圖級公開資料）
- GeoNames（地名資料）
- GitHub Releases（資料包分發）

一般編輯、查詢、渲染、專案存取與匯出均不依賴外部服務；網路只允許用於官方資料包的首次初始化、使用者主動更新或使用者確認後的損壞修復。

---

# 14. 技術總結

本系統採用：

- 製圖級資料（Natural Earth）
- 精選地名資料（GeoNames）
- 尺度限制策略
- 官方資料包分發機制
- GitHub Releases 作為靜態資產發佈點

實現：

- 完全不依賴外部 API
- 中尺度地圖示意專用
- 可離線使用
- 可版本控制
- 可長期維護


---

# 15. 從空 geodata_source/ 重建資料包（實作版 SOP）

本節提供可直接執行的重建流程，避免僅看概念文件時遺漏關鍵檔名或目錄結構。

## 15.1 目標

當 geodata_source/ 為空時，依下列步驟補齊原始資料，並成功執行：

- scripts/build_datapack.py
- 產出 geodata/packs/{id}/{version}/

## 15.2 最小可行原始資料（MVP）

請準備以下檔案／目錄到 geodata_source/：

1. Natural Earth 底圖
- 50m_physical.zip（下載後**必須解壓**）
- 解壓結果需為：geodata_source/50m_physical/
- 注意：建置腳本讀的是資料夾 50m_physical/，不是 zip 本身。

2. GeoNames（預設模式 `--geonames cities1000`）
- `cities1000.zip`
- `alternateNamesV2.zip`
- 以上兩個檔案保持 zip 即可，不需手動解壓。

3. 地形陰影（可選）
- 建議直接放：hillshade_3857.png
- 若未提供，腳本會嘗試從 MSR_50M.zip / US_MSR_10M.zip（或檔名包含 msr+10m/50m）生成。

## 15.3 何時需要 `allCountries.zip`

- 只有在使用 `--geonames all` 時才需要 `allCountries.zip`。
- 若使用預設 `--geonames cities1000`，`allCountries.zip` 非必要。

## 15.4 建置指令

以標準資料包為例：

```bash
python scripts/build_datapack.py --id standard --version 2026.02 --geonames cities1000 --force
```

常用參數：
- `--raw`：原始資料根目錄（預設 `geodata_source`）
- `--out`：輸出根目錄（預設 `geodata/packs/standard`）
- `--geonames`：`cities1000 | cities15000 | all`

非 manifest-only 建置若目標版本已存在，必須使用 `--force`。腳本會先在同層暫存建置目錄產生並驗證完整資料包，成功後才替換正式版本；切換失敗時恢復舊建置。必要底圖或 GeoNames 資料缺失時會直接失敗，不以半成品覆蓋既有產物。

## 15.5 成功輸出檢查

至少應看到：

- geodata/packs/standard/2026.02/datapack.json
- geodata/packs/standard/2026.02/basemap/*.geojson
- geodata/packs/standard/2026.02/geonames/geonames.sqlite
- （若有地形）geodata/packs/standard/2026.02/relief/hillshade_3857.png

## 15.6 常見失敗原因

1. 只有 50m_physical.zip，但未解壓成 geodata_source/50m_physical/。
2. 少了 `alternateNamesV2.zip`，導致 GeoNames 建置略過。
3. 使用 `--geonames all` 但未提供 `allCountries.zip`。
4. 提供了地形 zip，但檔名不符合腳本辨識規則，且沒有 hillshade_3857.png。

## 15.7 發佈流程銜接

建置成功後再進行：

1. 打包 geodata/packs/{id}/{version}/ 為 zip
2. 上傳到 GitHub Releases
3. 更新 pack-release.json（至少更新 url 與 sha256）

`scripts/update_pack_release.py` 會先確認 zip 根目錄存在 `datapack.json`，且所有封裝檔案均在 manifest 中列出並符合 size／SHA-256；通過後才寫入 release 設定。新版 manifest 不再將 `datapack.json` 自己列入 `files`，避免自我 checksum。

> 每次發佈新資料包版本都必須同步更新 pack-release.json。

---

# 16. 本機測試與驗證

目前使用 Vitest 測試可獨立於 Electron UI 執行的共用模組，測試檔集中於 `test/`。

```powershell
npm test
npm run test:watch
npm run test:typecheck
npm run build
```

- `npm test`：先執行測試專用 TypeScript 型別檢查，再執行全部測試一次。
- `npm run test:watch`：監看檔案變更並重跑相關測試，供開發期間使用。
- `npm run test:typecheck`：只檢查測試與相關原始碼型別，不執行案例。
- `npm run build`：編譯 main、renderer 並複製靜態資源。

目前自動化測試涵蓋 `.mapproj` validator、migration、原子儲存與恢復、資料包 manager，以及 renderer 的 Undo/Redo 歷史與地圖幾何。下一階段將擴充匯出與 Electron 互動測試。
