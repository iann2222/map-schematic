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

- UI 框架暫不綁死（React/Vue 皆可），先確保核心 domain（資料包、schema、查詢、渲染）可框架無關地運作。

## 2.2 渲染層策略

決策：以 SVG 為核心渲染與輸出格式，必要時輔以 Canvas 2D。

理由：

- 產品尺度與需求以清晰示意為主，SVG 性能足夠。
- SVG 便於輸出與印刷，可直接用於 SVG / PNG / PDF 匯出管線。
- 物件模型可直接對應向量幾何 + 樣式，`.mapproj` 結構直覺。

影響：

- `.mapproj` 以地理座標幾何與樣式為真實來源，渲染為投影後的 SVG。
- 匯出流程可統一為「生成 SVG → 轉 PNG/PDF」。

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

決策：所有地理資料只存放於 repo 內的 `geodata/` 目錄。

原則：

- 不使用作業系統 userData 目錄。
- 不寫入 repo 之外的任何位置。
- 路徑不得硬編碼，必須透過統一的資料目錄解析模組取得。
- `geodata/` 必須加入 `.gitignore`。

用途：

- 官方資料包（可多版本並存）
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
  - 提示使用者更新資料包；
  - 允許「唯讀開啟」或「強制轉換」策略（需先決定）。
- 定義相容矩陣（最低支援版本、可升級版本）。
- 更新資料包時需下載完成並驗證（checksum/簽名）後才切換。

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

- 專案檔與匯出結果預設存放於 `project_files/`（repo 內、gitignore）。
- 目前採固定路徑策略，避免 OS userData 路徑差異造成測試不一致。
- 若日後進入正式發佈版本，需改為可寫入位置（避免安裝包或唯讀路徑寫入失敗）。

## 資料包載入失敗處理（待完善）

目前若資料包缺失會直接讀檔失敗。未來需補：

- 明確錯誤提示（缺少資料包 / 版本不相容 / 解壓失敗）
- 引導使用者前往下載或重新初始化
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

- 結構化 JSON + 資源打包（ZIP 容器）

## 9.2 內容包含

- 畫布設定
- 投影設定
- 底圖版本
- 地名資料版本
- 圖層結構
- 標示物件
- 樣式設定

## 9.3 `.mapproj` v0.1 最小欄位

File header：

- schemaVersion（例如 "0.1"）
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

## 9.4 版本相容策略

- 每個專案檔包含資料包版本號
- 若資料版本不一致，提供更新提示

---

# 10. 匯出系統

支援：

- PNG
- SVG
- PDF
- `.mapproj`

SVG 用於設計軟體編輯

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

1. 使用者 pull 原始碼
2. 首次啟動時：
   - 檢查本機資料包是否存在
   - 若不存在 → 從 GitHub Releases 下載官方資料包
3. 下載完成後：
   - 本地解壓
   - 後續使用完全離線

## 11.4 更新策略

- 預設手動更新
- 可選自動更新
- 支援保留前一版本作回滾
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

所有運行時行為均不依賴外部服務。

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
