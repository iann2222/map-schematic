export type ThemePreference = "dark" | "light" | "system";

const THEME_STORAGE_KEY = "map-schematic.theme";

export function initializeThemePreferences(options: {
  buttons: HTMLButtonElement[];
  onChange?: (preference: ThemePreference) => void;
}): { apply: (preference: ThemePreference) => void } {
  const systemDarkTheme = window.matchMedia("(prefers-color-scheme: dark)");
  let currentPreference: ThemePreference = "dark";

  const isThemePreference = (value: string | null): value is ThemePreference =>
    value === "dark" || value === "light" || value === "system";

  const apply = (preference: ThemePreference): void => {
    currentPreference = preference;
    const resolved =
      preference === "system"
        ? systemDarkTheme.matches
          ? "dark"
          : "light"
        : preference;
    document.documentElement.dataset.theme = resolved;
    options.buttons.forEach((button) => {
      const active = button.dataset.themePreference === preference;
      button.classList.toggle("active", active);
      button.setAttribute("aria-checked", String(active));
    });
    options.onChange?.(preference);
  };

  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemePreference(stored)) {
      currentPreference = stored;
    }
  } catch {
    // The default dark theme remains available if local storage is unavailable.
  }
  apply(currentPreference);

  options.buttons.forEach((button, index) => {
    button.addEventListener("click", () => {
      const preference = button.dataset.themePreference ?? null;
      const nextPreference = isThemePreference(preference) ? preference : "dark";
      apply(nextPreference);
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, nextPreference);
      } catch {
        // Theme switching still works for the current session.
      }
    });
    button.addEventListener("keydown", (event) => {
      const offset = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
      if (offset === 0 || options.buttons.length === 0) {
        return;
      }
      event.preventDefault();
      const nextIndex =
        (index + offset + options.buttons.length) % options.buttons.length;
      options.buttons[nextIndex]?.focus();
      options.buttons[nextIndex]?.click();
    });
  });

  systemDarkTheme.addEventListener("change", () => {
    if (currentPreference === "system") {
      apply("system");
    }
  });

  return { apply };
}
