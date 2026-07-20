import type { MapProject } from "../bridge.js";

export function projectValidationMessage(
  validation: { valid: boolean; errors: Array<{ path: string; message: string }> } | undefined,
): string | null {
  if (!validation || validation.valid) return null;
  const details = validation.errors.slice(0, 6).map((error) => `${error.path}: ${error.message}`).join("\n");
  const extraCount = Math.max(0, validation.errors.length - 6);
  return ["專案檔格式驗證失敗，已停止載入。", details, extraCount > 0 ? `另有 ${extraCount} 個錯誤。` : ""]
    .filter(Boolean)
    .join("\n");
}

export function projectDatapackMismatchMessage(
  project: MapProject,
  currentPackId: string | null,
  currentPackVersion: string | null,
): string | null {
  const messages: string[] = [];
  if (project.dataPackId && currentPackId && project.dataPackId !== currentPackId) {
    messages.push(`資料包 ID 不一致：專案使用 ${project.dataPackId}，本機目前為 ${currentPackId}。`);
  }
  if (project.dataPackVersion && currentPackVersion && project.dataPackVersion !== currentPackVersion) {
    messages.push(`資料包版本不一致：專案使用 ${project.dataPackVersion}，本機目前為 ${currentPackVersion}。`);
  }
  return messages.length > 0 ? messages.join("\n") : null;
}
