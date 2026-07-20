export type ExportFrameStyle = "none" | "thin" | "mat" | "dark";

function frameSizeFor(canvas: HTMLCanvasElement, frame: ExportFrameStyle): number {
  const base = Math.min(canvas.width, canvas.height);
  if (frame === "thin") return Math.max(8, Math.round(base * 0.012));
  if (frame === "mat") return Math.max(24, Math.round(base * 0.0325));
  if (frame === "dark") return Math.max(17, Math.round(base * 0.0225));
  return 0;
}

export function applyExportFrame(
  source: HTMLCanvasElement,
  frame: ExportFrameStyle,
): HTMLCanvasElement {
  const inset = frameSizeFor(source, frame);
  if (frame === "none" || inset <= 0) return source;

  const framed = document.createElement("canvas");
  framed.width = source.width + inset * 2;
  framed.height = source.height + inset * 2;
  const ctx = framed.getContext("2d");
  if (!ctx) return source;

  if (frame === "mat") {
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, framed.width, framed.height);
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = Math.max(2, Math.round(inset * 0.06));
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, framed.width - ctx.lineWidth, framed.height - ctx.lineWidth);
    ctx.strokeStyle = "rgba(15, 23, 42, 0.24)";
    ctx.lineWidth = Math.max(1, Math.round(inset * 0.025));
    ctx.strokeRect(inset - ctx.lineWidth / 2, inset - ctx.lineWidth / 2, source.width + ctx.lineWidth, source.height + ctx.lineWidth);
  } else if (frame === "dark") {
    ctx.fillStyle = "#111827";
    ctx.fillRect(0, 0, framed.width, framed.height);
    const outer = Math.max(2, Math.round(inset * 0.08));
    const inner = Math.max(1, Math.round(inset * 0.04));
    ctx.strokeStyle = "#020617";
    ctx.lineWidth = outer;
    ctx.strokeRect(outer / 2, outer / 2, framed.width - outer, framed.height - outer);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
    ctx.lineWidth = inner;
    ctx.strokeRect(inset - inner / 2, inset - inner / 2, source.width + inner, source.height + inner);
  } else {
    ctx.fillStyle = "#111827";
    ctx.fillRect(0, 0, framed.width, framed.height);
  }

  ctx.drawImage(source, inset, inset);
  if (frame === "thin") {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    ctx.lineWidth = Math.max(1, Math.round(inset * 0.15));
    ctx.strokeRect(inset - ctx.lineWidth / 2, inset - ctx.lineWidth / 2, source.width + ctx.lineWidth, source.height + ctx.lineWidth);
  }
  return framed;
}
