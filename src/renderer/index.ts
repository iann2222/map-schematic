declare global {
  interface Window {
    mapSchematic?: {
      ping?: () => string;
    };
  }
}

const root = document.querySelector(".card p");
if (root) {
  const ping = window.mapSchematic?.ping?.() ?? "no-bridge";
  root.textContent = `Skeleton app is running. (${ping})`;
}
