import fs from "fs";
import path from "path";

import { describe, expect, it } from "vitest";

const rendererRoot = path.resolve(
  process.cwd(),
  "src",
  "renderer",
);

function readRendererFile(relativePath: string): string {
  return fs.readFileSync(
    path.join(rendererRoot, relativePath),
    "utf8",
  );
}

describe("renderer static assets", () => {
  it("defines every referenced interface icon in the shared SVG sprite", () => {
    const sprite = readRendererFile("icons.svg");
    const sources = [
      readRendererFile("index.html"),
      readRendererFile("overlay/object-list.ts"),
      readRendererFile("controllers/order-dialog-controller.ts"),
    ];
    const symbolIds = new Set(
      [...sprite.matchAll(/\bid="(icon-[^"]+)"/g)].map(
        (match) => match[1],
      ),
    );
    const references = sources.flatMap((source) =>
      [...source.matchAll(/icons\.svg#(icon-[^"'<>]+)/g)].map(
        (match) => match[1],
      ),
    );

    expect(references.length).toBeGreaterThan(0);
    expect(
      references.filter((reference) => !symbolIds.has(reference)),
    ).toEqual([]);
  });

  it("keeps interface glyphs and presentation styles out of HTML", () => {
    const html = readRendererFile("index.html");
    const buttons = [...html.matchAll(/<button\b([^>]*)>/gs)];
    const stylesheets = [
      ...html.matchAll(/<link[^>]+href="\.\/([^"]+\.css)"/g),
    ].map((match) => match[1]);

    expect(html).not.toMatch(
      /<(?:path|circle|line|rect)\b/,
    );
    expect(html).not.toMatch(/\sstyle="/);
    expect(
      buttons.filter((button) => !/\btype="button"/.test(button[1])),
    ).toEqual([]);
    expect(stylesheets.length).toBeGreaterThan(0);
    expect(
      stylesheets.filter(
        (stylesheet) =>
          !fs.existsSync(path.join(rendererRoot, stylesheet)),
      ),
    ).toEqual([]);
  });

  it("declares the renderer cascade from compatibility to utilities", () => {
    expect(readRendererFile("styles/cascade.css").trim()).toBe(
      "@layer legacy, tokens, base, components, utilities;",
    );
    expect(readRendererFile("styles/legacy.css")).toMatch(
      /^@layer legacy\s*\{/,
    );
    expect(readRendererFile("styles/tokens.css")).toMatch(
      /^@layer tokens\s*\{/,
    );
    expect(readRendererFile("styles/base.css")).toMatch(
      /^@layer base\s*\{/,
    );
    expect(readRendererFile("styles.css")).toMatch(
      /^@layer components\s*\{/,
    );
    expect(readRendererFile("styles/utilities.css")).toMatch(
      /^@layer utilities\s*\{/,
    );
  });
});
