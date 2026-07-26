import type { ProjectState } from "../app-state.js";
import type {
  MapProject,
  ProjectLoadResult,
  ProjectSaveResult,
} from "../bridge.js";
import type { AppDialogOptions } from "../ui/app-dialog.js";
import {
  projectDatapackMismatchMessage,
  projectValidationMessage,
} from "../project/project-messages.js";
import { ProjectOperationCoordinator } from "../project/operation-coordinator.js";
import { projectFingerprint } from "../project/project-state.js";

export type { ProjectSaveResult } from "../bridge.js";

export type AppliedProjectSummary = {
  historyRestored: boolean;
  preservedObjectCount: number;
};

export type ProjectControllerOptions = {
  state: ProjectState;
  buildProject: () => MapProject | null;
  applyLoadedProject: (
    project: MapProject,
  ) => Promise<AppliedProjectSummary> | AppliedProjectSummary;
  getDatapack: () => { id: string; version: string };
  setStatus: (message: string) => void;
  renderHeader: (state: {
    path: string | null;
    dirty: boolean;
  }) => void;
  showDialog: (options: AppDialogOptions) => Promise<number>;
  showNotice: (options: {
    eyebrow?: string;
    title: string;
    message: string;
    detail?: string;
    tone?: "info" | "warning" | "danger";
  }) => Promise<void>;
};

export class ProjectController {
  private readonly state: ProjectState;
  private readonly options: ProjectControllerOptions;
  private readonly operations = new ProjectOperationCoordinator();

  constructor(options: ProjectControllerOptions) {
    this.state = options.state;
    this.options = options;
  }

  get currentProject(): MapProject | null {
    return this.state.current;
  }

  get currentPath(): string | null {
    return this.state.path;
  }

  get isDirty(): boolean {
    return this.state.dirty;
  }

  renderHeader(): void {
    this.options.renderHeader({
      path: this.state.path,
      dirty: this.state.dirty,
    });
  }

  syncDirtyState(): void {
    const project = this.options.buildProject();
    if (!project || this.state.savedFingerprint === null) {
      this.setDirty(false);
      return;
    }
    this.setDirty(
      projectFingerprint(project) !== this.state.savedFingerprint,
    );
  }

  scheduleDirtyCheck(): void {
    if (this.state.dirtyCheckPending) {
      return;
    }
    this.state.dirtyCheckPending = true;
    window.requestAnimationFrame(() => {
      this.state.dirtyCheckPending = false;
      this.syncDirtyState();
    });
  }

  setBaseline(project?: MapProject | null): void {
    const baseline = project ?? this.options.buildProject();
    this.state.savedFingerprint = baseline
      ? projectFingerprint(baseline)
      : null;
    this.syncDirtyState();
  }

  save(saveAs = false): Promise<ProjectSaveResult | null> {
    return this.operations.enqueue(saveAs ? "saveAs" : "save", () =>
      this.performSave(saveAs),
    );
  }

  saveBeforeClose(): Promise<void> {
    return this.operations.enqueue("saveBeforeClose", async () => {
      const result = await this.performSave(false);
      if (!result?.ok) {
        return;
      }
      try {
        await window.mapSchematic?.closeAfterSave?.();
      } catch (error) {
        this.options.setStatus(
          `儲存完成，但關閉視窗失敗：${String(error)}`,
        );
      }
    });
  }

  load(): Promise<void> {
    return this.operations.enqueue("load", () => this.performLoad());
  }

  private setDirty(dirty: boolean): void {
    if (
      this.state.dirty === dirty &&
      this.state.reportedDirty === dirty
    ) {
      this.renderHeader();
      return;
    }
    this.state.dirty = dirty;
    this.state.reportedDirty = dirty;
    document.title = dirty ? "* 地圖示意圖" : "地圖示意圖";
    window.mapSchematic?.setProjectDirty?.(dirty);
    this.renderHeader();
  }

  private async performSave(
    saveAs: boolean,
  ): Promise<ProjectSaveResult | null> {
    if (!window.mapSchematic?.saveProject) {
      return null;
    }
    const project = this.options.buildProject();
    if (!project) {
      this.options.setStatus("資料包未載入，無法儲存。");
      return null;
    }
    let result: ProjectSaveResult;
    try {
      result = await window.mapSchematic.saveProject({
        project,
        path: this.state.path,
        saveAs,
      });
    } catch (error) {
      result = { ok: false, error: String(error) };
    }
    if (result.path) {
      this.state.path = result.path;
      this.renderHeader();
    }
    if (result.ok) {
      this.state.current = project;
      this.setBaseline(project);
    }
    if (result.canceled) {
      this.options.setStatus("已取消儲存。");
    } else {
      this.options.setStatus(
        result.ok
          ? `專案已儲存：${result.path}`
          : `專案儲存失敗：${
              result.error ?? result.errors?.join("；") ?? "未知錯誤"
            }`,
      );
    }
    return result;
  }

  private async performLoad(): Promise<void> {
    if (!window.mapSchematic?.loadProject) {
      return;
    }
    this.syncDirtyState();
    if (this.state.dirty) {
      const response = await this.options.showDialog({
        eyebrow: "未儲存變更",
        title: "載入其他專案？",
        message: "目前專案有尚未儲存的變更。",
        detail: "繼續載入會放棄這些變更，且無法復原。",
        tone: "warning",
        buttons: [
          { label: "取消", value: 0, variant: "ghost" },
          { label: "放棄並載入", value: 1, variant: "danger" },
        ],
        defaultValue: 0,
        cancelValue: 0,
      });
      if (response !== 1) {
        this.options.setStatus("已取消載入，未儲存的變更仍保留。");
        return;
      }
    }

    let result: ProjectLoadResult;
    try {
      result = await window.mapSchematic.loadProject();
    } catch (error) {
      this.options.setStatus(`載入失敗：${String(error)}`);
      return;
    }
    if (!result.ok || !result.project) {
      this.options.setStatus(
        result.canceled
          ? "已取消載入。"
          : `載入失敗：${result.error ?? "未知錯誤"}`,
      );
      return;
    }

    const loadedProject = result.project;
    const validationMessage = projectValidationMessage(result.validation);
    if (validationMessage) {
      await this.options.showNotice({
        eyebrow: "載入失敗",
        title: "專案格式無效",
        message: "專案檔格式驗證失敗，已停止載入。",
        detail: validationMessage,
        tone: "danger",
      });
      this.options.setStatus("專案檔格式驗證失敗，已停止載入。");
      return;
    }

    const datapack = this.options.getDatapack();
    const mismatchMessage = projectDatapackMismatchMessage(
      loadedProject,
      datapack.id,
      datapack.version,
    );
    if (mismatchMessage) {
      const response = await this.options.showDialog({
        eyebrow: "資料版本不同",
        title: "使用本機資料包載入？",
        message: mismatchMessage,
        detail: "繼續後仍可編輯，但地名或底圖可能與原專案版本不同。",
        tone: "warning",
        buttons: [
          { label: "取消", value: 0, variant: "ghost" },
          { label: "仍要載入", value: 1, variant: "primary" },
        ],
        defaultValue: 0,
        cancelValue: 0,
      });
      if (response !== 1) {
        this.options.setStatus(
          "已取消載入：專案資料包版本與本機不一致。",
        );
        return;
      }
    }

    this.state.current = loadedProject;
    this.state.path = result.path ?? null;
    this.renderHeader();
    const summary = await this.options.applyLoadedProject(loadedProject);
    this.setBaseline();

    if (summary.preservedObjectCount > 0) {
      await this.options.showNotice({
        eyebrow: "相容性提示",
        title: "部分物件暫時無法編輯",
        message: `此專案有 ${summary.preservedObjectCount} 個物件使用目前編輯器尚未支援的幾何格式。`,
        detail: "這些物件不會顯示或提供編輯，但再次儲存時會原樣保留。",
        tone: "warning",
      });
    }
    if (!summary.historyRestored) {
      await this.options.showNotice({
        eyebrow: "編輯歷史未恢復",
        title: "此專案的復原紀錄無法使用",
        message: "專案內容已正常載入，但復原與重做紀錄已略過。",
        detail: "可能是較舊的專案格式，或歷史紀錄與目前內容不一致。",
        tone: "warning",
      });
    }

    const preservedNotice =
      summary.preservedObjectCount > 0
        ? `；另保留 ${summary.preservedObjectCount} 個目前無法編輯的物件`
        : "";
    if (result.recoveredFromBackup) {
      this.options.setStatus(
        `已從備份恢復並載入：${result.path}${preservedNotice}`,
      );
    } else if (result.migratedFromVersion) {
      this.options.setStatus(
        `已載入並將專案格式從 ${result.migratedFromVersion} 升級為 ${loadedProject.schemaVersion}；下次儲存時會寫入新版格式${preservedNotice}。`,
      );
    } else {
      this.options.setStatus(
        `專案已載入：${result.path}${preservedNotice}`,
      );
    }
  }
}
