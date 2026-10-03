import type { ExportState } from "../app-state.js";
import type { ExportFormat } from "../bridge.js";
import type { ModalManager } from "../ui/modal-manager.js";
import {
  applyExportFrame,
  type ExportFrameStyle,
} from "../export/export-frame.js";

export type { ExportFormat } from "../bridge.js";

export type RenderedCanvasExport = {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
};

export type RenderedSvgExport = {
  data: string;
  width: number;
  height: number;
};

export type ExportControllerElements = {
  completeModal: HTMLElement | null;
  completePngButton: HTMLButtonElement | null;
  completeSvgButton: HTMLButtonElement | null;
  completePdfButton: HTMLButtonElement | null;
  completeContinueButton: HTMLButtonElement | null;
  completeCloseButton: HTMLButtonElement | null;
  frameModal: HTMLElement | null;
  frameOptions: HTMLButtonElement[];
  frameCloseButton: HTMLButtonElement | null;
  frameCancelButton: HTMLButtonElement | null;
  frameApplyButton: HTMLButtonElement | null;
};

export type ExportControllerOptions = {
  modals: ModalManager;
  state: ExportState;
  elements: ExportControllerElements;
  pngScale: number;
  renderCanvas: (scale: number) => Promise<RenderedCanvasExport | null>;
  renderSvg: () => RenderedSvgExport | null;
  setStatus: (message: string) => void;
  showToast: (
    message: string,
    state: "loading" | "success" | "error",
    autoHideMs?: number,
  ) => void;
  hideToast: () => void;
};

export class ExportController {
  private readonly state: ExportState;
  private readonly elements: ExportControllerElements;
  private readonly options: ExportControllerOptions;

  constructor(options: ExportControllerOptions) {
    this.state = options.state;
    this.elements = options.elements;
    this.options = options;
  }

  openCompleteDialog(): void {
    this.options.modals.open(this.elements.completeModal, {
      onDismiss: () => this.closeCompleteDialog(),
      initialFocus: () => this.elements.completePngButton,
    });
  }

  closeCompleteDialog(): void {
    this.options.modals.close(this.elements.completeModal);
  }

  closeFrameDialog(value: ExportFrameStyle | null): void {
    this.options.modals.close(this.elements.frameModal);
    const resolver = this.state.frameResolver;
    this.state.frameResolver = null;
    resolver?.(value);
  }

  bind(): void {
    this.elements.completeContinueButton?.addEventListener("click", () => {
      this.closeCompleteDialog();
    });
    this.elements.completeCloseButton?.addEventListener("click", () => {
      this.closeCompleteDialog();
    });
    const exportFromComplete = (format: ExportFormat) => {
      this.closeCompleteDialog();
      void this.export(format);
    };
    this.elements.completePngButton?.addEventListener("click", () =>
      exportFromComplete("png"),
    );
    this.elements.completeSvgButton?.addEventListener("click", () =>
      exportFromComplete("svg"),
    );
    this.elements.completePdfButton?.addEventListener("click", () =>
      exportFromComplete("pdf"),
    );
    this.elements.frameOptions.forEach((button) => {
      button.addEventListener("click", () => {
        const frame = button.dataset.exportFrame as
          | ExportFrameStyle
          | undefined;
        if (!frame) {
          return;
        }
        this.state.selectedFrame = frame;
        this.renderFrameOptions();
      });
    });
    this.elements.frameCloseButton?.addEventListener("click", () =>
      this.closeFrameDialog(null),
    );
    this.elements.frameCancelButton?.addEventListener("click", () =>
      this.closeFrameDialog(null),
    );
    this.elements.frameApplyButton?.addEventListener("click", () =>
      this.closeFrameDialog(this.state.selectedFrame),
    );
  }

  async export(format: ExportFormat): Promise<void> {
    if (!window.mapSchematic?.exportProject) {
      return;
    }
    if (this.state.inProgress) {
      this.options.setStatus("已有匯出作業正在進行。");
      return;
    }
    this.state.inProgress = true;
    this.options.showToast("正在準備匯出…", "loading", 0);
    try {
      const frame =
        format === "png" || format === "pdf"
          ? await this.chooseFrame()
          : "none";
      if (frame === null) {
        this.options.setStatus("已取消匯出。");
        this.options.hideToast();
        return;
      }

      let data: string;
      let width: number;
      let height: number;
      if (format === "svg") {
        const rendered = this.options.renderSvg();
        if (!rendered) {
          throw new Error("無法建立向量 SVG");
        }
        ({ data, width, height } = rendered);
      } else {
        const rendered = await this.options.renderCanvas(
          format === "png" ? this.options.pngScale : 1,
        );
        if (!rendered) {
          throw new Error("無法建立匯出畫布");
        }
        const framedCanvas = applyExportFrame(rendered.canvas, frame);
        width = framedCanvas.width;
        height = framedCanvas.height;
        data = framedCanvas.toDataURL("image/png");
      }

      const result = await window.mapSchematic.exportProject({
        format,
        data,
        width,
        height,
      });
      if (result.canceled) {
        this.options.setStatus("已取消匯出。");
        this.options.hideToast();
      } else if (result.ok) {
        this.options.setStatus(`已匯出：${result.path}`);
        this.options.showToast("地圖已匯出", "success");
      } else {
        this.options.setStatus(
          `匯出失敗：${result.error ?? "未知錯誤"}`,
        );
        this.options.showToast("匯出失敗", "error", 2800);
      }
    } catch (error) {
      this.options.setStatus(`匯出失敗：${String(error)}`);
      this.options.showToast("匯出失敗", "error", 2800);
    } finally {
      this.state.inProgress = false;
    }
  }

  private renderFrameOptions(): void {
    this.elements.frameOptions.forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.exportFrame === this.state.selectedFrame,
      );
    });
  }

  private chooseFrame(): Promise<ExportFrameStyle | null> {
    if (!this.elements.frameModal) {
      return Promise.resolve("none");
    }
    if (this.state.frameResolver) {
      return Promise.resolve(null);
    }
    this.renderFrameOptions();
    return new Promise((resolve) => {
      this.state.frameResolver = resolve;
      this.options.modals.open(this.elements.frameModal, {
        onDismiss: () => this.closeFrameDialog(null),
        initialFocus: () => this.elements.frameModal?.querySelector<HTMLElement>(".frame-option.active"),
      });
    });
  }
}
