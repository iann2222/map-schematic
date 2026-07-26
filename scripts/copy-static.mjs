import fs from "fs";
import path from "path";

const srcDir = path.resolve(process.cwd(), "src", "renderer");
const outDir = path.resolve(process.cwd(), "out", "renderer");

fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(path.join(srcDir, "index.html"), path.join(outDir, "index.html"));
fs.copyFileSync(
  path.join(srcDir, "styles.css"),
  path.join(outDir, "styles.css")
);
fs.cpSync(path.join(srcDir, "styles"), path.join(outDir, "styles"), {
  recursive: true
});
