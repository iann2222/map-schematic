import type { WorkflowStep } from "../app-state.js";
import type {
  AppDialogRequest,
  ExportFormat,
  MenuAction,
} from "../bridge.js";

export type AppCommandControllerOptions = {
  getActiveStep: () => WorkflowStep;
  hasOpenModal: () => boolean;
  undo: () => void;
  redo: () => void;
  nudgeSelection: (event: KeyboardEvent) => boolean;
  clearSelection: () => void;
  deleteSelection: () => void;
  loadProject: () => void;
  saveProject: (saveAs: boolean) => void;
  saveBeforeClose: () => void;
  showAbout: () => void;
  showAttributions: () => void;
  exportProject: (format: ExportFormat) => void;
  showRequestedDialog: (request: AppDialogRequest) => void;
};

function isTextEditingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export class AppCommandController {
  private readonly options: AppCommandControllerOptions;

  constructor(options: AppCommandControllerOptions) {
    this.options = options;
  }

  bind(): void {
    window.addEventListener("keydown", (event) => this.handleKeyDown(event));
    window.mapSchematic?.onMenuAction?.((action) =>
      this.handleMenuAction(action),
    );
    window.mapSchematic?.onAppDialogRequest?.((request) => {
      this.options.showRequestedDialog(request);
    });
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented || this.options.hasOpenModal()) return;
    const key = event.key.toLowerCase();
    const textEditing = isTextEditingTarget(event.target);
    if ((event.ctrlKey || event.metaKey) && !event.altKey) {
      if (textEditing) {
        return;
      }
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        this.options.undo();
        return;
      }
      if (
        (key === "z" && event.shiftKey) ||
        (key === "y" && !event.shiftKey)
      ) {
        event.preventDefault();
        this.options.redo();
        return;
      }
    }
    if (!textEditing && this.options.nudgeSelection(event)) {
      event.preventDefault();
      return;
    }
    if (event.key === "Escape") {
      if (this.options.getActiveStep() === "3" && !textEditing) {
        this.options.clearSelection();
      }
    }
    if (
      event.key === "Delete" &&
      this.options.getActiveStep() === "3" &&
      !textEditing
    ) {
      this.options.deleteSelection();
    }
  }

  private handleMenuAction(action: MenuAction): void {
    // The close-confirmation response is a lifecycle continuation, not an editor command.
    if (this.options.hasOpenModal() && action !== "project:saveBeforeClose") return;
    switch (action) {
      case "edit:undo":
        this.options.undo();
        break;
      case "edit:redo":
        this.options.redo();
        break;
      case "project:open":
        this.options.loadProject();
        break;
      case "project:save":
        this.options.saveProject(false);
        break;
      case "project:saveAs":
        this.options.saveProject(true);
        break;
      case "project:saveBeforeClose":
        this.options.saveBeforeClose();
        break;
      case "app:about":
        this.options.showAbout();
        break;
      case "app:attributions":
        this.options.showAttributions();
        break;
      case "export:png":
        this.options.exportProject("png");
        break;
      case "export:svg":
        this.options.exportProject("svg");
        break;
      case "export:pdf":
        this.options.exportProject("pdf");
        break;
      default:
        break;
    }
  }
}
