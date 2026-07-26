# `.mapproj` 專案格式

本文件描述目前可由應用程式讀寫的 `.mapproj` v0.7。產品目標見
`product-vision.md`，程式模組位置見 `architecture.md`。

## 基本格式

- 副檔名：`.mapproj`
- 編碼：UTF-8
- 容器：純 JSON，不使用 ZIP
- 目前 `schemaVersion`：`"0.7"`
- 契約來源：`src/shared/schema/mapproj-contract.d.ts`
- 驗證入口：`src/shared/schema/validate.ts`
- 遷移入口：`src/shared/schema/migrate.ts`

專案檔不內嵌官方資料包或本機字型。移至其他裝置時，該裝置必須另行安裝相容資料包；缺少同名系統字型時會使用 `font-family` fallback。

## 頂層結構

必要內容：

- `schemaVersion`
- `createdAt`、`updatedAt`
- `dataPackVersion`
- `canvas`
- `viewport`
- `layers`
- `objects`
- `history`
- `ui`

`appVersion` 與 `dataPackId` 為可選欄位。專案載入時若資料包 id 或版本與本機不同，應用程式會提示風險，由使用者決定是否繼續，不會在背景下載或替換資料。

## Canvas 與 Viewport

`canvas` 保存匯出結果的邏輯尺寸：

- `width`、`height` 必須為正數。
- `unit` 為 `px` 或 `mm`。
- 換算後任一輸出邊不得超過 8192 邏輯像素。
- 長寬比必須與 `ui.cropRatio` 一致。

renderer 內部地圖座標固定為 1200 × 800；PNG、SVG 與 PDF 匯出時才依 `canvas` 尺寸縮放。`mm` 以 96 DPI 換算，PNG 目前使用 2 倍輸出倍率。

`viewport`：

- `projection` 固定為 `EPSG:4326`。
- `bbox` 使用經緯度 `west`、`south`、`east`、`north`。
- 一般範圍為 `west < east`。
- 跨越日期變更線時為 `west > east`，並將 `crossesAntimeridian` 設為 `true`。
- 達到完整 360 度的框選保存為單一全世界範圍。

物件經度保存於 -180 至 180 度。水平循環副本只存在 renderer 的畫布座標，不會重複寫入專案。

## Layers

目前只支援單一圖層：

- `layers` 必須剛好包含一筆 `id`、`name`。
- 每個物件的 `layerId` 必須指向該圖層。
- 尚未支援圖層顯示、鎖定、透明度或多圖層排序。
- 含多圖層的專案會明確驗證失敗，不會靜默合併或改寫物件歸屬。

## Objects

共通欄位：

- `id`
- `type`
- `layerId`
- `style`
- `geometry`
- `text`，可選
- `provenance`，可選

目前物件種類為 `pointLabel`、`areaLabel`、`textOnly`、`arrow` 與 `polyline`；geometry 可為 point、polygon 或 none。`provenance` 可保存 `geonames`／`manual` 來源、GeoNames id 與原始查詢。

v0.7 為維持既有 JSON 相容性，仍將部分標記資料、圖形尺寸與旋轉資訊保存在 `style`。這些欄位已在 shared schema 分成明確型別，不再接受任意 TypeScript 欄位；若未來搬移其實體位置，必須透過新版 schema migration 完成。

schema 合法但目前 renderer 尚不能編輯的幾何物件會在載入時提示，且再次儲存時原樣保留。

## History

`history` 包含：

- `historyVersion`，目前為 `1`
- `undo`
- `redo`

歷史格式與專案 schema 分開版本化。Undo 與 Redo 合計最多保存 300 筆頂層命令，batch 另有遞迴深度與命令節點限制。

載入時會驗證命令結構，並確認歷史可重建目前文件。歷史異常時只略過 Undo／Redo，不丟棄已載入的專案內容。

## UI State

`ui` 可包含：

- 項目清單與顯示排序
- 底圖樣式
- 地形陰影與混合模式
- 比例模式與選取比例
- 裁切比例與自訂比例

單純選取狀態及地圖縮放不會保存至編輯歷史。

## 版本遷移

目前 migration chain：

```text
0.1 -> 0.2 -> 0.3 -> 0.4 -> 0.5 -> 0.6 -> 0.7
```

- 舊版只沿明確定義的步驟逐版轉換。
- 缺少版本、未知版本或比目前更新的版本不會被猜測轉換。
- v0.1 至 v0.3 遷移後以空白歷史開始。
- v0.4 的合法歷史會保留。
- v0.5 明確保存日期變更線狀態。
- v0.6 同步實際 canvas 比例並移除尚未支援的圖層外觀欄位。
- v0.7 加入 `historyVersion`；歷史不合法時只清空歷史。

舊版專案成功載入後仍在記憶體中使用最新版結構；下次儲存時寫入目前版本。

## 安全儲存與恢復

1. 儲存前驗證記憶體中的專案。
2. 在正式檔同目錄寫入唯一暫存檔。
3. 完成寫入、fsync、重新載入與驗證。
4. 原檔有效時，保存為固定的 `.mapproj.bak`。
5. 以同目錄 rename 將完整暫存檔替換正式檔。

第一次儲存沒有前一版本，因此不建立空備份。後續每次成功儲存只保留上一份有效內容；損壞原檔不會覆蓋既有有效備份。

載入正式檔失敗時才檢查 `.bak`。只有備份有效才詢問使用者，確認後才恢復。載入、儲存、另存與關閉前儲存由 Project Operation Coordinator 依序執行，避免非同步結果互相覆寫。
