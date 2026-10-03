import type { AppDialogButton, AppDialogOptions } from "../bridge.js";
import type { ModalManager } from "./modal-manager.js";

export type { AppDialogOptions } from "../bridge.js";

type QueuedAppDialog = {
  options: AppDialogOptions;
  resolve: (response: number) => void;
};

type AppDialogElements = {
  modal: HTMLDivElement | null;
  dialog: HTMLDivElement | null;
  icon: HTMLElement | null;
  eyebrow: HTMLElement | null;
  title: HTMLElement | null;
  message: HTMLElement | null;
  detail: HTMLElement | null;
  actions: HTMLElement | null;
};

export type AppDialogService = {
  show: (options: AppDialogOptions) => Promise<number>;
  notice: (options: {
    eyebrow?: string;
    title: string;
    message: string;
    detail?: string;
    tone?: "info" | "warning" | "danger";
  }) => Promise<void>;
  closeCancel: () => void;
};

export function createAppDialogService(elements: AppDialogElements, modals: ModalManager): AppDialogService {
  const queue: QueuedAppDialog[] = [];
  let active: QueuedAppDialog | null = null;
  let defaultValue = 0;
  let cancelValue = 0;

  const close = (response: number): void => {
    if (!active || !elements.modal) {
      return;
    }
    const current = active;
    active = null;
    modals.close(elements.modal);
    elements.actions?.replaceChildren();
    current.resolve(response);
    if (queue.length > 0) {
      presentNext();
    }
  };

  const presentNext = (): void => {
    if (
      active ||
      queue.length === 0 ||
      !elements.modal ||
      !elements.dialog ||
      !elements.actions ||
      !elements.title ||
      !elements.message
    ) {
      return;
    }
    active = queue.shift() ?? null;
    if (!active) {
      return;
    }
    const { options } = active;
    defaultValue = options.defaultValue;
    cancelValue = options.cancelValue;
    const tone = options.tone ?? "info";
    elements.dialog.dataset.tone = tone;
    if (elements.icon) {
      elements.icon.textContent = tone === "info" ? "i" : "!";
    }
    if (elements.eyebrow) {
      elements.eyebrow.textContent =
        options.eyebrow ??
        (tone === "danger" ? "發生錯誤" : tone === "warning" ? "請確認" : "提示");
    }
    elements.title.textContent = options.title;
    elements.message.textContent = options.message;
    if (elements.detail) {
      elements.detail.textContent = options.detail ?? "";
    }
    elements.actions.replaceChildren();
    elements.actions.classList.toggle(
      "decision-actions",
      options.buttons.some((button) => button.variant === "dangerGhost"),
    );
    let defaultButton: HTMLButtonElement | null = null;
    options.buttons.forEach((dialogButton: AppDialogButton) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = dialogButton.label;
      const variant = dialogButton.variant ?? "ghost";
      button.className =
        variant === "primary"
          ? "ui-button primary"
          : variant === "danger"
            ? "ui-button danger-solid"
            : variant === "dangerGhost"
              ? "ui-button danger-ghost"
              : "ui-button ghost";
      button.addEventListener("click", () => close(dialogButton.value));
      elements.actions?.appendChild(button);
      if (dialogButton.value === options.defaultValue) {
        defaultButton = button;
      }
    });
    modals.open(elements.modal, {
      onDismiss: () => close(cancelValue),
      initialFocus: () => defaultButton,
      onKeyDown: (event) => {
        if (event.key === "Enter" && !(event.target instanceof HTMLButtonElement)) {
          event.preventDefault();
          close(defaultValue);
        }
      },
    });
  };

  return {
    show(options) {
      if (!elements.modal || !elements.dialog || !elements.actions || !elements.title || !elements.message) {
        return Promise.resolve(options.cancelValue);
      }
      return new Promise((resolve) => {
        queue.push({ options, resolve });
        presentNext();
      });
    },
    async notice(options) {
      await this.show({
        ...options,
        buttons: [{ label: "知道了", value: 0, variant: "primary" }],
        defaultValue: 0,
        cancelValue: 0,
      });
    },
    closeCancel() {
      close(cancelValue);
    },
  };
}
