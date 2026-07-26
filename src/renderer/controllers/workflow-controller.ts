import type { WorkflowState, WorkflowStep } from "../app-state.js";

const STEPS: WorkflowStep[] = ["0", "1", "2", "3"];

const STEP_TITLES: Record<WorkflowStep, string> = {
  "0": "大致定位",
  "1": "範圍與比例",
  "2": "底圖樣式",
  "3": "標示與繪製",
};

const STEP_SUBTITLES: Record<WorkflowStep, string> = {
  "0": "搜尋地名或座標，先將地圖移至預計製作的區域。",
  "1": "使用右鍵拖曳框選範圍，確定示意圖的視窗。",
  "2": "決定底圖樣式結果。",
  "3": "搜尋或新增標示與圖形，並調整項目屬性。",
};

export type WorkflowControllerElements = {
  layout: HTMLElement | null;
  stepButtons: HTMLButtonElement[];
  stepPanels: HTMLElement[];
  progress: HTMLElement | null;
  title: HTMLElement | null;
  subtitle: HTMLElement | null;
  previousButton: HTMLButtonElement | null;
  nextButton: HTMLButtonElement | null;
  editorTabs: HTMLButtonElement[];
  editorPanels: HTMLElement[];
};

export type WorkflowControllerOptions = {
  state: WorkflowState;
  elements: WorkflowControllerElements;
  beforeStepChange?: (previous: WorkflowStep, next: WorkflowStep) => void;
  afterStepChange?: (previous: WorkflowStep, next: WorkflowStep) => void;
  onComplete: () => void;
};

function isWorkflowStep(value: string | undefined): value is WorkflowStep {
  return value !== undefined && STEPS.includes(value as WorkflowStep);
}

function hookHorizontalNavigation(
  buttons: HTMLButtonElement[],
  activate: (button: HTMLButtonElement) => void,
): void {
  buttons.forEach((button, index) => {
    button.addEventListener("keydown", (event) => {
      let targetIndex: number | null = null;
      if (event.key === "ArrowLeft") {
        targetIndex = (index - 1 + buttons.length) % buttons.length;
      } else if (event.key === "ArrowRight") {
        targetIndex = (index + 1) % buttons.length;
      } else if (event.key === "Home") {
        targetIndex = 0;
      } else if (event.key === "End") {
        targetIndex = buttons.length - 1;
      }
      if (targetIndex === null) {
        return;
      }
      event.preventDefault();
      const target = buttons[targetIndex];
      target.focus();
      activate(target);
    });
  });
}

export class WorkflowController {
  private readonly state: WorkflowState;
  private readonly elements: WorkflowControllerElements;
  private readonly beforeStepChange?: WorkflowControllerOptions["beforeStepChange"];
  private readonly afterStepChange?: WorkflowControllerOptions["afterStepChange"];
  private readonly onComplete: () => void;

  constructor(options: WorkflowControllerOptions) {
    this.state = options.state;
    this.elements = options.elements;
    this.beforeStepChange = options.beforeStepChange;
    this.afterStepChange = options.afterStepChange;
    this.onComplete = options.onComplete;
  }

  get activeStep(): WorkflowStep {
    return this.state.activeStep;
  }

  setActiveStep(next: WorkflowStep): void {
    const previous = this.state.activeStep;
    this.beforeStepChange?.(previous, next);
    this.state.activeStep = next;
    this.renderStep();
    this.afterStepChange?.(previous, next);
  }

  bind(): void {
    this.elements.stepButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const step = button.dataset.stepJump;
        if (isWorkflowStep(step)) {
          this.setActiveStep(step);
        }
      });
    });
    this.elements.nextButton?.addEventListener("click", () => {
      if (this.activeStep === "3") {
        this.onComplete();
        return;
      }
      const index = STEPS.indexOf(this.activeStep);
      this.setActiveStep(STEPS[Math.min(STEPS.length - 1, index + 1)]);
    });
    this.elements.previousButton?.addEventListener("click", () => {
      const index = STEPS.indexOf(this.activeStep);
      this.setActiveStep(STEPS[Math.max(0, index - 1)]);
    });
    this.bindEditorTabs();
    this.bindSearchModes();
  }

  private renderStep(): void {
    const step = this.activeStep;
    const activeIndex = STEPS.indexOf(step);
    this.elements.stepPanels.forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.stepPanel === step);
    });
    this.elements.layout?.classList.toggle("step-3", step === "3");
    this.elements.stepButtons.forEach((button) => {
      const buttonStep = button.dataset.stepJump;
      const buttonIndex = isWorkflowStep(buttonStep)
        ? STEPS.indexOf(buttonStep)
        : -1;
      const active = buttonStep === step;
      button.classList.toggle("active", active);
      button.classList.toggle(
        "completed",
        buttonIndex >= 0 && buttonIndex < activeIndex,
      );
      button.setAttribute("aria-current", active ? "step" : "false");
    });
    if (this.elements.progress) {
      this.elements.progress.textContent = `步驟 ${step} / 3`;
    }
    if (this.elements.title) {
      this.elements.title.textContent = STEP_TITLES[step];
    }
    if (this.elements.subtitle) {
      this.elements.subtitle.textContent = STEP_SUBTITLES[step];
    }
    if (this.elements.nextButton) {
      const label = this.elements.nextButton.querySelector("span");
      const text = step === "3" ? "完成" : "下一步";
      if (label) {
        label.textContent = text;
      } else {
        this.elements.nextButton.textContent = text;
      }
    }
    this.elements.previousButton?.toggleAttribute("disabled", step === "0");
  }

  private setEditorTab(tabId: string): void {
    this.elements.editorTabs.forEach((button) => {
      const active = button.dataset.editorTab === tabId;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    this.elements.editorPanels.forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.editorTabPanel === tabId);
    });
  }

  private bindEditorTabs(): void {
    const activate = (button: HTMLButtonElement) => {
      this.setEditorTab(button.dataset.editorTab ?? "search");
    };
    this.elements.editorTabs.forEach((button) => {
      button.addEventListener("click", () => activate(button));
    });
    hookHorizontalNavigation(this.elements.editorTabs, activate);
    const initial =
      this.elements.editorTabs.find((button) =>
        button.classList.contains("active"),
      )?.dataset.editorTab ?? "search";
    this.setEditorTab(initial);
  }

  private bindSearchModes(): void {
    document
      .querySelectorAll<HTMLElement>("[data-search-switch]")
      .forEach((container) => {
        const group = container.dataset.searchSwitch;
        if (!group) {
          return;
        }
        const buttons = Array.from(
          container.querySelectorAll<HTMLButtonElement>("[data-search-mode]"),
        );
        if (buttons.length === 0) {
          return;
        }
        const activate = (button: HTMLButtonElement) => {
          const mode = button.dataset.searchMode ?? "place";
          buttons.forEach((candidate) => {
            const active = candidate.dataset.searchMode === mode;
            candidate.classList.toggle("active", active);
            candidate.setAttribute("aria-selected", String(active));
            candidate.tabIndex = active ? 0 : -1;
          });
          document
            .querySelectorAll<HTMLElement>(`[data-search-panel^="${group}:"]`)
            .forEach((panel) => {
              panel.classList.toggle(
                "active",
                panel.dataset.searchPanel === `${group}:${mode}`,
              );
            });
        };
        buttons.forEach((button) => {
          button.addEventListener("click", () => activate(button));
        });
        hookHorizontalNavigation(buttons, activate);
        activate(
          buttons.find((button) => button.classList.contains("active")) ??
            buttons[0],
        );
      });
  }
}
