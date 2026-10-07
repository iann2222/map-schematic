# 本機效能基準

## 執行

先依 README 安裝依賴與官方資料包，再執行：

```powershell
npm run perf
npm run perf -- --counts 100
```

指令會重新建置並開啟真實 Electron 視窗。預設依序載入 100、500、1000 個固定混合物件，包含點、文字、線段、箭頭、區域及長文字；每個案例執行一次 20 次滑鼠移動的拖曳，並檢查一次 Undo 能恢復位置且只產生一筆歷史。測試命中既有透明拖曳區；每次移動後等待更新完成，避免 Electron 合併事件而減少樣本，不模擬自由操作的滑鼠節奏。自訂數量須為 5–5000 的整數，最多六個不重複案例。

測試使用目前設定資料根目錄中的官方資料包，沿用 `MAP_SCHEMATIC_ROOT`／已保存位置／開發模式路徑選擇規則。禁止 HTTP／HTTPS 請求，不下載或更新資料包，不儲存正式專案。測試專案在系統暫存目錄產生，結束後清除；資料包管理器仍會進行正常的本機驗證、鎖定及快取／啟用資訊維護。資料包缺失或損壞時測試失敗，不會自動修復。

效能案例完成後，另載入 10 個物件的暫存專案，驗證文字／顏色／字型修改與 Undo／Redo、未變動節點重用、線段／箭頭旋轉、縮放／視窗調整後的文字命中框、跨種類排序及連續拖曳合併。最後執行正式 SVG／PNG／PDF 匯出流程，檢查 SVG 向量與文字、PNG 解碼及非空白像素、PDF 檔頭；所有匯出寫入同一暫存目錄，結束後清除。這些回歸操作不納入效能案例的載入／拖曳數據。

成功後印出 `performance-results/<時間>.json` 的完整路徑。此目錄不納入 Git；測試腳本與案例也不包含在封裝版本中。沒有新增套件、外部服務或 UI 控制項。

## 指標

所有時間單位為毫秒，報告包含硬體、Node／Electron／Chromium 版本、建置 commit、資料包版本、視窗尺寸與 DPR。

| 指標 | 範圍 |
| --- | --- |
| `startupWallMs` | 測試 Electron 主程序腳本開始到初始化完成，包含測試工具初始化；不是作業系統冷啟動時間 |
| `startup.initialize` | Renderer 地圖初始化，包括資料取得、解析、幾何準備、初次繪製及互動綁定 |
| `datapack.ready` | 官方資料包就緒請求，含 Main 驗證與 IPC |
| `mainBasemapReadsMs` | Main 中各次底圖檔案 `readFile` 的時間，不含 IPC 傳輸、完整檔案雜湊驗證或 Renderer 解析 |
| `basemap.request` | 底圖取得的端到端時間，含 Main 資料取得與 IPC |
| `basemap.parse` | 各底圖圖層的 GeoJSON 解析 |
| `basemap.geometryAndPaths` | 各圖層座標轉路徑字串及建立 Path2D |
| `basemap.draw` | 同步 Canvas 繪製呼叫，不代表 GPU 完成時間 |
| `overlay.rebuild` | 一次 SVG 更新流程；早期基準為全量重建，目前保留未變動群組，只重建有變更的物件，包含批次文字量測 |
| `overlay.textMeasure` | 每次 SVG `getBBox` 文字量測，可能包含瀏覽器同步 layout 成本 |
| `overlay.changedGroups` | 變更群組計數，包含世界複本；只看 count，時間欄位固定為 0 |
| `overlay.textCacheHit` | 文字量測快取命中計數；只看 count，時間欄位固定為 0 |
| `interaction.dragUpdate` | 一次有效拖曳資料更新；早期包含同步重建，目前畫面更新排入 rAF，因此不可單用此項比較完整渲染成本 |
| `interaction.frameInterval` | 拖曳期間 rAF 之間的時間，包含排程／繪製影響；不是單次繪製耗時 |

案例報告分開保存載入與拖曳指標。`renderedObjectGroups` 包含水平循環世界複本，不等同專案物件數。

文字邊界快取使用內容、字型、實際字級及錨點作為 key，最多保留 2048 筆；位置改變可重用相對邊界，字型載入完成或失敗時清除並重新渲染。文字量測分成「讀取所有邊界」與「寫入命中／選取框」兩個階段。命中快取時 `overlay.textMeasure` 可以不存在，不代表未繪製文字。

報告版本 2 新增 `regression` 驗證結果，固定效能案例版本保持不變。比較拖曳優化時應同時看 `overlay.rebuild`、`interaction.frameInterval` 與群組更新量，不要把同步資料更新移到動畫幀所降低的 handler 時間全部算成渲染加速。

`count`、`failures`、`totalMs`、`minMs`、`maxMs` 涵蓋該階段全部呼叫；p50／p95 使用最近最多 256 筆樣本，以 nearest-rank 計算。各指標會巢狀重疊，**不可相加**。重設時仍在執行的舊 span 不會混入新階段。

## 比較方式

平常啟動量測預設關閉，不讀取時鐘、不累積資料；只有測試工具在載入 HTML 時加上 `performance=1` 才啟用。診斷模式只公開 reset／snapshot／frame 記錄，沒有暴露可修改的 Editor State。

先在同一台設備、相同視窗尺寸、DPR、資料包、背景程式條件下連跑至少三次，再比較中位數與 p95。報告不宣稱清空 OS 檔案快取；首次與後續讀取可能不同。量測、測試指令排程與大量 getBBox 取樣本身也有成本，因此這是後續優化的相對基準，不是精確的無量測使用者耗時。

目前不設跨設備固定耗時門檻，只檢查量測是否完成、物件是否呈現及操作／匯出是否正確。拖曳資料即時提交至 Editor Core，連續畫面更新以動畫幀合併；結束拖曳或同步渲染時取消舊排程並立即更新，匯出前也同步最新物件。專案格式、資料包與 UI 版面不因這些優化改變。
