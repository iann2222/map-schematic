# 架構概覽

本文件只說明目前 repo 結構與 Electron 應用程式的實際執行流程。產品目標、專案格式、資料包與發布流程分別記錄於 `product-vision.md`、`project-format.md`、`datapack.md` 與 `release-checklist.md`；開發政策以 `AGENTS.md` 為準。

## 專案結構

- `AGENTS.md`：開發規範、離線原則與資料政策。
- `README.md`：專案簡介、目前功能與快速開始。
- `docs/`：產品願景、現行架構、專案格式、資料包與發布文件。
- `src/`：Electron main、preload、renderer 與共用 TypeScript 原始碼。
- `test/`：本機自動化測試與共用測試資料。
- `scripts/`：編譯靜態資源與官方資料包製作輔助腳本。
- `packaging/`：Windows 封裝設定、目標格式選擇與封裝腳本。
- `geodata/`：開發模式的官方資料包根目錄，已由 gitignore 排除。
- `geodata_source/`：資料包原始資料，已由 gitignore 排除。
- `project_files/`：開發模式的專案檔與匯出預設目錄，已由 gitignore 排除。
- `pack-release.json`：官方資料包版本、下載位置、SHA-256 與來源檔案設定。
- `out/build-info.json`：建置時產生的應用程式版本、commit SHA 與工作樹狀態，隨封裝產物一併保存。
- `package.json`、`tsconfig.*.json`、`vitest.config.ts`：應用程式建置與測試設定。
- `environment.yml`：官方資料包建置環境的直接相依與版本來源。
- `environment-win-64.lock.txt`：正式 Windows 資料包建置使用的完整 Conda 相依鎖定檔。
- `scripts/lock_datapack_environment.py`：依 `environment.yml` 在乾淨臨時環境解析並更新 win-64 鎖定檔。

## 開發環境

- Node.js：支援 Node 20.19 以上的 Node 20、Node 22.12 以上的 Node 22，以及 Node 24 以上；建議 Node 20 LTS。`.nvmrc` 提供 nvm／fnm 使用的主版本。
- 安裝依賴：使用 `npm ci` 依 `package-lock.json` 安裝固定版本。
- 換作業系統或 CPU 架構時不可直接複製 `node_modules`；`postinstall` 會透過 `electron-rebuild` 重建 `better-sqlite3` 的原生模組。
- Electron 應用程式的開發、測試與封裝不需要 Conda；Conda 只用於製作官方資料包。
- 已打包的 Electron 應用程式內含 runtime，一般使用者無須安裝 Node.js、Python 或 Conda。
- 新設備需重建官方資料包環境時，使用 `conda create -n mapschem --file environment-win-64.lock.txt`；完整步驟見 `docs/datapack.md`。

## 執行流程

1. `npm run build`
   - 編譯 main（CommonJS）與 renderer（ESM）。
   - 複製 renderer 靜態檔到 `out/renderer/`。
2. `npm start`
   - 啟動 Electron 並載入 preload 與 renderer。
   - 檢查官方資料包是否存在且完整。
   - 首次缺少資料包時，依 `pack-release.json` 下載、驗證並安裝。
   - 已安裝資料包損壞且無法恢復時，先詢問使用者是否重新下載。
   - 有新版資料包時保持離線使用目前版本，可在偏好設定主動下載更新。
3. `npm run start:dev`
   - 依序執行建置與啟動，適合本機開發。
4. `npm run package:win`
   - 先建置，再依 `packaging/release-config.mjs` 產生 Windows x64 安裝程式、可攜式資料夾或可攜式 ZIP。
   - 產物位於 `dist/`；不包含官方資料包；完成後會印出實際產物路徑。

## 本機測試

- `npm test`
  - 先檢查測試程式與相關原始碼的 TypeScript 型別，再執行全部測試一次。
  - 適合在提交變更前執行。
- `npm run test:watch`
  - 持續監看檔案變更，並自動重新執行相關測試。
  - 適合開發期間使用；按 `Ctrl+C` 結束。
- `npm run test:typecheck`
  - 只執行測試程式與相關原始碼的 TypeScript 型別檢查，不執行測試案例。
- `npm run test:datapack-tools`
  - 使用 Python 內建 unittest 驗證資料包安全路徑、GDAL 版本解析、完整 Conda 環境比對與 win-64 鎖定檔。
- `npm run perf`
  - 建置並使用真實 Electron 測量啟動、底圖解析及 Step 3 物件載入／拖曳；需已安裝官方資料包，不會下載或更新。
  - 固定案例、報告位置及指標限制見 [本機效能基準](performance.md)。

測試集中於 `test/`；共用測試資料放在 `test/fixtures/`，各模組測試依照原始碼領域分組。目前涵蓋 `.mapproj`、資料包 manifest、manager、初始化、更新、修復、fallback、Python 建置工具，以及 renderer Editor Core 的命令、歷史、專案操作排程、App State 與座標解析。

## 程式碼結構

主程序（Main）：

- `src/main/index.ts`
  - 作為 main process composition root，只負責 Electron 生命週期、建立控制器及註冊各領域 IPC。
- `src/main/window-controller.ts`
  - 建立安全隔離的 BrowserWindow，管理視窗生命週期、未儲存關閉確認與 renderer dialog 清理。
- `src/main/renderer-dialog.ts`
  - 集中 main 向 renderer 發出的應用程式內建 dialog 請求、回應驗證與待處理請求清理。
- `src/main/app-menu.ts`
  - 建立應用程式選單並將編輯、專案、匯出與偏好設定命令送至目前視窗。
- `src/main/app-info-ipc.ts`
  - 提供授權資訊、版本與 commit SHA，並設定「說明 > 關於」內容。
- `src/main/datapack-ipc.ts`
  - 註冊資料包狀態、更新、底圖、地形與 GeoNames IPC；地理資料只從已驗證的本機官方資料包讀取。
  - 底圖、地形與搜尋在資料根目錄的短期存取鎖內讀取；GeoNames 查詢結束即關閉 SQLite，地形回傳本機圖片的 data URL，避免背景解碼時檔案已被替換。
- `src/main/project-ipc.ts`
  - 序列化專案儲存，管理載入、備份恢復詢問、PNG／SVG／PDF 匯出及開發版／封裝版輸出路徑。
- `src/main/data-root.ts`
  - 決定開發版與封裝版共用的官方資料包位置，並保留使用中的位置設定。
- `src/main/preload.ts`
  - 透過 `contextBridge` 提供受限的 renderer API，包括唯讀的資料來源與授權內容。
- `src/main/datapack-download.ts`
  - 提供 GitHub HTTPS 下載、ZIP 解壓與 Electron app 路徑 adapter；狀態與安裝決策由 shared manager 負責。
- `src/main/geonames.ts`
  - 查詢官方資料包內的 GeoNames SQLite 索引。

渲染程序（Renderer）：

- `src/renderer/index.html`
  - Step 0 至 Step 3 的語意化介面骨架、搜尋與標示面板、匯出外框 dialog；不放置 inline CSS 或重複的 SVG path。
- `src/renderer/icons.svg`
  - 保存介面共用的 SVG symbol sprite；HTML 與動態清單只透過 `<use>` 引用 glyph，地圖 SVG 畫布不屬於此 sprite。
- `src/renderer/styles/cascade.css`
  - 固定 `legacy → tokens → base → components → utilities` 的 cascade layer 順序，避免載入順序或 selector specificity 意外改變覆寫結果。
- `src/renderer/styles/legacy.css`
  - 保存尚待淘汰的相容樣式，位於 `legacy` layer；一般宣告由目前設計系統覆寫，`!important` 的 layer 優先序相反，不能用來維持已遷移元件的尺寸。
- `src/renderer/styles/tokens.css`
  - 定義深色／淺色主題 token、尺寸、陰影與舊變數的相容映射。
- `src/renderer/styles/base.css`
  - 定義 box model、應用程式根布局、字型、表單控制與鍵盤 focus 基礎規則。
- `src/renderer/styles.css`
  - 位於 `components` cascade layer，依共用控制、工作流程、地圖、dialog 與 responsive 區段組織。
- `src/renderer/styles/inspector.css` 與 `slider.css`
  - 分別擁有屬性面板（含色票、旋轉控制）與共用拉桿的完整規則，legacy 不再保留同名規則或色彩彈窗的廢棄樣式。
  - 屬性標籤欄寬、欄位間距與色票偏移使用同一組局部 token，顏色框尺寸不依賴 `!important` 覆寫。
- `src/renderer/styles/utilities.css`
  - 位於最高優先的 `utilities` layer，保存 `hidden` 等單一用途狀態契約。
- `src/renderer/index.ts`
  - 作為 renderer composition root，建立控制器、注入共享狀態與 callback，並負責應用程式啟動。
  - 專案、工作流程、搜尋、匯出、地圖、裁切、選取、排序與屬性面板的狀態及互動分別由對應模組管理。
  - 保留跨控制器的畫面刷新與流程接線；物件操作、專案快照與匯出內容由獨立模組處理。
- `src/renderer/app-state.ts`
  - 定義 renderer 的 `AppState` 根結構，集中工作流程、專案生命週期、搜尋、匯出、選取、物件工具／預覽及目前資料包版本。
  - Core 擁有編輯文件與歷史，Crop Controller 擁有裁切與畫布設定，Basemap Renderer 擁有底圖設定；Modal Manager 擁有對話框堆疊與焦點，偏好設定控制器擁有更新請求，不重複存入 App State。
- `src/renderer/ui/modal-manager.ts`
  - 所有應用內對話框共用同一個管理器，集中開啟／關閉、初始焦點、焦點恢復、Tab 邊界及 Escape／背景點擊取消；各控制器保留自己的確認、取消與清理動作。
  - 開啟時以 `inert` 暫停背景及下層對話框；巢狀確認框只關閉最上層，並恢復至下層原控制項。最後關閉時恢復背景原有的 `inert` 狀態與焦點。
  - Tab 在對話框首尾循環，內部保留瀏覽器原生表單與 radio group 行為；沒有可操作控制項時改由對話框本身承接焦點。
  - 確認框佇列依序呈現，每次回應只完成一個請求；排序拖曳清理與匯出外框的 Promise 完成都走控制器原有關閉流程。
- `src/renderer/controllers/*`
  - `workflow-controller.ts` 管理步驟切換、導覽、工作區分頁與搜尋模式分頁。
  - `project-controller.ts` 管理載入、儲存、另存、未儲存狀態與資料包版本確認，並透過 operation coordinator 序列化操作。
  - 未儲存檢查僅由 Core、裁切、底圖設定與資料包版本變更通知，不監聽整份文件的 click／input／pointerup；通知按畫面幀合併，物件拖曳完成交易後再比對完整內容。
  - 儲存以送出時的內容指紋為基準；等待期間的新修改仍保留未儲存提示，關閉前儲存也不會丟棄這些變更。
  - `object-controller.ts` 管理工具與搜尋預覽、新增、修改、刪除、清空及座標標示編輯；已加入文件的物件一律提交 Core 命令，預覽不寫入文件或歷史。
  - `preferences-controller.ts` 管理主題偏好、資料包狀態與更新按鈕，防止重複更新及過期狀態回應，並區分更新失敗與更新後畫面載入失敗。
  - `search-controller.ts` 管理離線地名搜尋、座標解析、結果排序與結果清單。
  - `export-controller.ts` 管理匯出格式、外框選擇、進度與輸出請求。
  - `app-command-controller.ts` 集中全域快捷鍵、Electron menu action 與 dialog request 路由。
  - Modal 開啟時不執行背景編輯快捷鍵或一般選單操作；Main 要求的確認框仍可疊加，關閉前儲存的生命週期回應也可繼續執行。
  - `order-dialog-controller.ts` 管理項目排序 dialog、置頂／置底操作、拖曳 session 與 FLIP 動畫，排序結果再透過 Editor Core 命令提交。
  - `inspector-controller.ts` 協調 Step 3 屬性面板的選取、顯示與欄位綁定；每次只提交當次編輯欄位，並檢查物件種類，不將整組控制項回寫至物件。
  - `inspector-panel-controller.ts` 管理屬性欄展開／收起、焦點與無障礙狀態；收起後保留窄工具列，切換步驟仍保留本次使用狀態，不寫入專案或編輯歷史。收合以約 180ms 的低幅橫向滑移及淡出／淡入銜接，減少動畫偏好下直接切換，快速反向操作會取消舊動畫；動畫中離開 Step 3 不重算其他步驟或搶走焦點。收合時以保存的裁切範圍一次重新置中及完整適配畫布，不在動畫中持續縮放；地理範圍、畫布比例與選取不變。
  - 畫面同步不產生編輯命令；修改顏色、大小等樣式不會重設字型、顯示文字或座標標示模式，物件變更仍透過 Editor Core 提交。
  - `selection-controller.ts` 集中選取狀態、物件拖曳、鍵盤微調、空白區域取消選取與 Inspector 同步。
  - `crop-controller.ts` 協調裁切模型、畫面與互動，集中步驟切換前後的範圍保存／恢復；入口不再自行維護裁切快照或重複更新裁切框。
  - `map-viewport-controller.ts` 管理地圖縮放、平移、畫布適配、座標換算與循環世界偏移。
  - `map-interaction-controller.ts` 管理地圖滾輪、平移、框選縮放及指標事件生命週期。
  - `map-initialization-controller.ts` 統一首次啟動與資料包更新後的地圖載入、重繪、視角同步及互動初始化流程。
- `src/renderer/bridge.ts`
  - 將 shared IPC 契約提供給 renderer，並宣告 `window.mapSchematic`；不再另外維護 preload API、GeoNames 或專案操作型別。
- `src/renderer/editor/*`
  - 以單一 `EditorDocument.objects` 管理點標示與形狀，並以可辨識物件型別提供安全存取。
  - `defaults.ts` 與 `presentation.ts` 分別集中物件預設樣式、標示顯示文字與座標格式，供建立、載入與畫面呈現共用。
  - `editor-core.ts` 集中套用編輯命令、交易與最多 300 筆的 Undo/Redo 歷史；UI 不再自行維護完整文件快照。
  - 拖曳使用 Core 的 `updateTransactionObject` 即時更新，結束時提交一筆歷史；切換步驟或執行其他命令前先完成交易。
  - 排序鍵只在 Core 建立或替換文件時正規化；查詢名稱、顯示順位與繪製不修改文件。
  - `commands.ts` 定義可序列化的新增、刪除、欄位更新、排序與清空命令，套用前會檢查目前資料狀態。
  - 命令只保存實際變更欄位；連續文字與滑桿修改可合併，拖曳期間即時預覽並在結束時記為單一命令。
- `src/renderer/project/project-state.ts`
  - 提供專案檔內容比較工具。
  - 分離目前 renderer 可編輯的 point 物件與尚未支援的幾何物件；後者不顯示，但再次儲存時會原樣保留。
- `src/renderer/project/project-snapshot.ts`
  - 統一組裝儲存內容及套用專案資料，保存未支援物件，處理 Core 歷史恢復、canvas／bbox 與底圖設定。
  - 根據 Core 的文件 revision 快取內容指紋；dirty 檢查不轉換物件，也不複製歷史。歷史依 history revision 快取，僅儲存時需要完整快照。
  - 未儲存判斷比較物件、排序、畫布、裁切、底圖及資料版本，不把歷史清單本身視為地圖內容變更；Undo 回到儲存內容時可恢復已儲存狀態。
- `src/renderer/export/export-renderer.ts`
  - 產生高解析 PNG、PDF 輸入與真正向量 SVG；地形陰影啟用時僅陰影部分維持點陣圖片，匯出互動及檔案輸出仍由 Export Controller 管理。
- `src/renderer/project/operation-coordinator.ts`
  - 依照請求順序逐一執行載入、儲存、另存與關閉前儲存，避免非同步結果互相覆寫專案路徑與狀態。
  - 單一操作失敗後仍會繼續處理後續操作，不讓整條佇列永久停止。
- `src/renderer/project/project-adapter.ts`
  - 集中處理 `.mapproj` 與 `EditorDocument` 的雙向轉換，保留可編輯物件的圖層歸屬，renderer 互動邏輯不直接解析專案欄位；名稱不再綁定特定舊 schema 版本。
- `src/renderer/project/canvas.ts`
  - 集中處理專案畫布比例、px／mm 邏輯尺寸與匯出像素換算。
- `src/renderer/map/geometry.ts`
  - 集中 EPSG:4326／EPSG:3857 投影、循環經度正規化、跨日期變更線範圍轉換與 GeoJSON 至 SVG path 轉換。
- `src/renderer/crop/*`
  - `types.ts` 明確區分專案裁切資料、畫面框、地圖 view 與步驟還原紀錄；地圖模組只依賴這些型別，不依賴裁切控制器。
  - `crop-model.ts` 管理地圖座標範圍、畫布比例、自訂比例與 Step 1 還原紀錄，不讀取 DOM；畫面框與視窗尺寸屬於獨立的暫存狀態。
  - Step 1 由畫面框提交地圖範圍；Step 2／3 只將保存範圍投影到畫面，調整視窗或縮放不回寫範圍與畫布。回到 Step 0 重新定位仍保留上次框大小與比例。
  - 載入專案的新範圍時清除舊還原紀錄；返回 Step 1 若沒有還原紀錄，從載入範圍重建可編輯框。
  - `geometry.ts` 統一畫面框與地圖範圍的雙向轉換、範圍適配、畫面交集及框選幾何，供遮罩、拖曳及匯出使用。
  - `crop-view.ts` 負責比例控制項、裁切框、SVG clip 與遮罩的 DOM 呈現；自訂比例輸入值透過模型保存，不由專案系統直接讀取輸入框。
  - `crop-interaction.ts` 擁有單一指標拖曳 session，僅在拖曳期間監聽文件移動／結束事件；放開、取消、失去捕捉、切換步驟或視窗失焦時清理監聽與捕捉。
- `src/renderer/map/basemap-renderer.ts`
  - 載入官方資料包底圖並按需載入地形陰影，集中 Canvas 繪製、風格切換、預覽與匯出所需的底圖狀態。
- `src/renderer/overlay/object-order-model.ts`
  - 集中標示顯示名稱、唯一名稱、顯示順位與重複物件判斷，保持查詢無副作用。
  - 標示與圖形使用同一個 SVG 物件容器，每個物件的文字、圖形及命中範圍位於同一群組，依共用顯示順序排列；畫面與匯出沿用相同順序。
- `src/renderer/overlay/overlay-renderer.ts`、`retained-scene.ts`、`text-layout.ts`、`frame-scheduler.ts`
  - 根據物件、選取狀態與視圖設定更新有變動的 SVG 群組，保留其餘節點與事件；刪除、預覽及跨種類排序由同一場景管理。
  - 文字邊界以有上限的相對座標快取跨世界複本共用，批次讀取量測後才寫入命中／選取框，字型載入事件使快取失效。
  - 拖曳畫面更新合併至 rAF；拖曳結束、同步渲染及匯出前 flush。縮放與選取沿用同一條物件渲染流程，不再另有僅更新標示文字的樣式寫入器。
- `src/renderer/ui/slider.ts`
  - 提供共用滑桿建立、鍵盤操作、數值吸附與畫面同步。
- `src/renderer/ui/color-control.ts`
  - 統一顏色輸入、色票點選、HEX 正規化、選取狀態與無障礙標籤；各物件面板只提供自己的欄位更新 callback。
- `src/renderer/ui/rotation-control.ts`
  - 線段與箭頭共用 0–360 度輸入、首次點擊全選及按鈕連按控制；選取物件改變或視窗失焦時停止連按。
- `src/renderer/ui/input-selection.ts`
  - 提供輸入框首次點擊全選行為，供屬性面板、座標 dialog 與比例欄位共用。

共用模組（Shared）：

- `src/shared/ipc-contract.d.ts`
  - 定義 main、preload 與 renderer 共用的 IPC payload、回傳值、選單動作及 `MapSchematicApi`，讓兩端的介面變更可由 TypeScript 一起檢查。
- `src/shared/ipc-channels.ts`
  - 保存 IPC channel 名稱的唯一來源，避免 main 與 preload 使用不同字串。
- `src/shared/paths.ts`
  - 統一解析資料根目錄。
- `src/shared/datapack/*`
  - 定義 manifest／release 契約、檔案校驗、初始化、更新、修復、安全啟用與 fallback。
  - 安裝時執行完整 checksum 驗證；後續啟動以可失效的本機驗證記錄避免重複雜湊未變更的大型檔案。
  - `manager.ts` 負責目標版本、fallback、快取與產品層的資料包就緒決策。
  - `local-store.ts` 負責掃描本機版本、讀寫 active 指標及載入已安裝 manifest。
  - `installer.ts` 負責下載、ZIP 驗證、暫存安裝、完整性檢查、安全替換與中斷恢復。
  - 每次安裝使用獨立工作目錄；完整驗證後才取得存取鎖替換並啟用，啟用失敗時嘗試還原原目標。
  - `data-root-lock.ts` 以唯一程序紀錄與順位協調共用根目錄，各階段只發布一次，不覆寫其他程序可能正在讀取的紀錄；安裝鎖保護安裝／狀態決策，存取鎖保護實際讀取及替換。程序退出後可回收紀錄，不以檔案年齡強制解除仍在使用的鎖。
  - `errors.ts` 統一資料包錯誤代碼、階段與原始原因；權限、磁碟與占用錯誤不視為資料損壞，已完成安裝的清理失敗以 warning 回報。
  - `validation-cache.ts` 保存可失效的本機驗證記錄；檔案資訊不符時自動退回完整 checksum 驗證。
  - `contract.d.ts` 保存跨 main／renderer 使用的資料包型別，runtime 模組只保留實際邏輯。
  - `pack-release.json` 是目標資料包 id／version 的唯一來源，不另在程式碼維護重複版本常數。
- `src/shared/validation/primitives.ts`
  - 提供 schema、資料包 manifest 與建置資訊解析共用的 record、有限數值及非空字串檢查。
- `src/shared/schema/mapproj.ts`
  - 提供目前 `.mapproj` v0.7 版本常數與初始專案。
- `src/shared/schema/mapproj-contract.d.ts`
  - 集中定義 main、preload、renderer 共用的 `.mapproj` 與可序列化歷史命令契約；0.7 物件 style 的標記欄位、圖形欄位與視覺樣式均使用明確型別，不接受任意欄位。
- `src/shared/schema/history.ts`
  - 驗證 historyVersion、命令結構、物件快照、數量與遞迴深度，並安全處理舊版歷史。
- `src/shared/schema/migrate.ts`
  - 依 schemaVersion 逐版遷移專案；目前支援 v0.1 → v0.2 → v0.3 → v0.4 → v0.5 → v0.6 → v0.7，未知版本不會被猜測轉換。
- `src/shared/schema/validate.ts`
  - 驗證專案結構、物件、座標、樣式、ID 與圖層引用。
- `src/shared/schema/io.ts`
  - 負責純 JSON 專案檔的序列化、遷移、原子儲存、`.bak` 備份、恢復與載入。

## 資料與輸出路徑

- 資料包根目錄由 `src/main/data-root.ts` 統一決定，實際資料位於其下的 `geodata/`；開發版與封裝版會讀取 `%LOCALAPPDATA%\map-schematic\datapack-location.json` 的相同位置設定，因此可共用同一份資料包。
- 第一次從已有資料包的開發版啟動時，會使用 repo 根目錄並記住這個位置；之後安裝版會直接共用該資料包。
- 若尚無既有資料包，兩種模式都預設使用 `%LOCALAPPDATA%\map-schematic\geodata`，首次初始化後只會保存一份。
- `MAP_SCHEMATIC_ROOT` 可暫時覆寫資料包根目錄，供可攜式部署、測試或進階使用；程式碼不得硬編碼絕對路徑。
- 專案與匯出預設位置：開發模式為 repo 的 `project_files/`；封裝版本為使用者文件目錄下的 `map-schematic/`。

## 建置與發行產物

- `out/`
  - TypeScript 編譯結果與 renderer 靜態檔。
- `dist/`
  - Windows 封裝產物，例如安裝程式與 exe。
- `packaging/`
  - 集中 Windows 封裝設定、目標格式選擇與封裝腳本。可輸出 NSIS 安裝程式、可攜式資料夾或可攜式 ZIP，且不會發佈或下載資料包。
  - `electron-builder.yml` 會將 `ATTRIBUTIONS.md` 複製至發行內容的 `resources/`，供應用程式內顯示與使用者直接查閱。

官方資料包的建置、發布、安裝與更新流程見 `datapack.md`；應用程式與資料包的發布前驗證見 `release-checklist.md`。
