import type { DataPackStatus } from "../bridge.js";
import type { DatapackUpdateResult } from "../../shared/ipc-contract.js";
import type { AppDialogOptions } from "../ui/app-dialog.js";
import { initializeThemePreferences } from "../ui/theme-preferences.js";
import type { ModalManager } from "../ui/modal-manager.js";

export function createPreferencesController(options: {
  modals: ModalManager;
  reloadMap: () => Promise<void>;
  showDialog: (options: AppDialogOptions) => Promise<number>;
  showToast: (message: string, state: "loading" | "success" | "error", autoHideMs?: number) => void;
  root?: Document;
}) {
  const root = options.root ?? document;
  const preferencesModal = root.getElementById("preferencesModal");
  const preferencesButton = root.getElementById("preferencesBtn");
  const preferencesClose = root.getElementById("preferencesClose");
  const preferencesDone = root.getElementById("preferencesDone");
  const themePreferenceButtons = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-theme-preference]"));
  const datapackPreferenceState = root.getElementById("datapackPreferenceState");
  const datapackPreferenceDetail = root.getElementById("datapackPreferenceDetail");
  const datapackUpdateButton = root.getElementById("datapackUpdateBtn") as HTMLButtonElement | null;
  const datapackUpdateLabel = root.getElementById("datapackUpdateLabel");
  const showAppDialog = options.showDialog;
  const showAppToast = options.showToast;
  let updating = false;
  let statusRequest = 0;

  function syncDatapackPreferences(status: DataPackStatus): void {
    if (!datapackPreferenceState || !datapackPreferenceDetail || !datapackUpdateButton) {
      return;
    }
    const targetLabel = `${status.target.id} ${status.target.version}`;
    const activeLabel = status.active
      ? `${status.active.id} ${status.active.version}`
      : null;
    let buttonLabel = "已是最新版本";
    let enabled = false;

    if (status.availability === "ready") {
      datapackPreferenceState.textContent = "官方資料包已就緒";
      datapackPreferenceDetail.textContent = `${targetLabel} 已安裝，可離線使用。`;
    } else if (status.availability === "updateAvailable") {
      datapackPreferenceState.textContent = "有新版官方資料包可用";
      datapackPreferenceDetail.textContent = `目前使用 ${activeLabel}，可更新至 ${targetLabel}。`;
      buttonLabel = "下載並更新";
      enabled = true;
    } else if (status.availability === "repairRequired") {
      datapackPreferenceState.textContent = "資料包需要修復";
      datapackPreferenceDetail.textContent = activeLabel
        ? `目前可使用 ${activeLabel}；重新下載後會修復 ${targetLabel}。`
        : `${targetLabel} 無法使用，請重新下載官方資料包。`;
      buttonLabel = "重新下載";
      enabled = true;
    } else {
      datapackPreferenceState.textContent = "尚未安裝官方資料包";
      datapackPreferenceDetail.textContent = `首次使用需要下載 ${targetLabel}，完成後即可離線使用。`;
      buttonLabel = "下載資料包";
      enabled = true;
    }

    datapackUpdateButton.disabled = updating || !enabled;
    if (datapackUpdateLabel) {
      datapackUpdateLabel.textContent = updating ? "正在處理" : buttonLabel;
    }
  }

  async function refreshDatapackPreferences(): Promise<DataPackStatus | null> {
    if (!window.mapSchematic?.getDatapackStatus) {
      return null;
    }
    const request = ++statusRequest;
    try {
      const status = await window.mapSchematic.getDatapackStatus();
      if (request !== statusRequest) return null;
      syncDatapackPreferences(status);
      return status;
    } catch {
      if (request !== statusRequest) return null;
      if (datapackPreferenceState) {
        datapackPreferenceState.textContent = "無法檢查資料包狀態";
      }
      if (datapackPreferenceDetail) {
        datapackPreferenceDetail.textContent = "請稍後再試，或重新啟動應用程式。";
      }
      if (datapackUpdateButton) {
        datapackUpdateButton.disabled = true;
      }
      if (datapackUpdateLabel) {
        datapackUpdateLabel.textContent = "暫時無法使用";
      }
      return null;
    }
  }

  async function handleDatapackUpdate(): Promise<void> {
    if (!window.mapSchematic?.updateDatapack || !datapackUpdateButton || updating) {
      return;
    }
    updating = true;
    statusRequest += 1;
    try {
      datapackUpdateButton.disabled = true;
      if (datapackUpdateLabel) {
        datapackUpdateLabel.textContent = "正在處理";
      }
      showAppToast("正在下載、驗證並安裝官方資料包…", "loading", 0);
      let result: DatapackUpdateResult;
      try {
        result = await window.mapSchematic.updateDatapack();
      } catch (error) {
        result = { ok: false, error: String(error) };
      }
      if (!result.ok) {
        await showAppDialog({
          eyebrow: "資料包更新失敗",
          title: "無法完成官方資料包更新",
          message: result.issue?.code === "busy"
            ? "資料包正由其他程式使用或更新。請稍後再試，或先關閉共用資料包的其他程式。"
            : result.issue?.code === "permissionDenied"
              ? "請檢查資料包資料夾的讀寫權限或檔案占用狀況，不需要立即重新下載。"
              : result.issue?.code === "storageFailure"
                ? "請檢查磁碟可用空間與儲存裝置狀態後再試。"
                : "更新未完成。請依下方原因處理；原有有效資料包會保留供離線使用。",
          detail: result.error ?? "請確認網路連線後再試一次。",
          tone: "danger",
          buttons: [{ label: "知道了", value: 0, variant: "primary" }],
          defaultValue: 0,
          cancelValue: 0,
        });
        showAppToast("資料包更新失敗", "error");
        return;
      }
      if (result.canceled) {
        showAppToast("已取消資料包更新", "success");
        return;
      }
      try {
        await options.reloadMap();
      } catch (error) {
        await showAppDialog({
          eyebrow: "資料包已更新",
          title: "資料包已安裝，但畫面重新載入失敗",
          message: "請重新啟動應用程式後再繼續使用。",
          detail: String(error),
          tone: "warning",
          buttons: [{ label: "知道了", value: 0, variant: "primary" }],
          defaultValue: 0,
          cancelValue: 0,
        });
        showAppToast("資料包已更新，請重新啟動應用程式", "error");
        return;
      }
      if (result.warnings?.length) {
        await showAppDialog({
          eyebrow: "資料包已更新", title: "資料包可用，但仍有後續事項",
          message: "安裝已完成，不需要重新下載。請查看以下清理或狀態檢查資訊。",
          detail: result.warnings.map((issue) => issue.message).join("\n"),
          tone: "warning", buttons: [{ label: "知道了", value: 0, variant: "primary" }],
          defaultValue: 0, cancelValue: 0,
        });
      }
      showAppToast("官方資料包已更新並套用", "success");
    } finally {
      updating = false;
      await refreshDatapackPreferences();
    }
  }

  function openPreferencesDialog(): void {
    if (!preferencesModal) {
      return;
    }
    options.modals.open(preferencesModal, {
      onDismiss: closePreferencesDialog,
      initialFocus: () => themePreferenceButtons.find((button) => button.classList.contains("active")),
    });
    void refreshDatapackPreferences();
  }

  function closePreferencesDialog(): void {
    options.modals.close(preferencesModal);
  }

  function bind(): void {
    initializeThemePreferences({ buttons: themePreferenceButtons });
    preferencesButton?.addEventListener("click", openPreferencesDialog);
    preferencesClose?.addEventListener("click", closePreferencesDialog);
    preferencesDone?.addEventListener("click", closePreferencesDialog);
    datapackUpdateButton?.addEventListener("click", () => { void handleDatapackUpdate(); });
  }
  return {
    open: openPreferencesDialog, close: closePreferencesDialog, bind,
    isOpen: () => options.modals.isOpen(preferencesModal),
    updateDatapack: handleDatapackUpdate
  };
}
