import fs from "fs";
import path from "path";

const srcDir = path.resolve(process.cwd(), "src", "renderer");
const distDir = path.resolve(process.cwd(), "dist", "renderer");

fs.mkdirSync(distDir, { recursive: true });
fs.copyFileSync(path.join(srcDir, "index.html"), path.join(distDir, "index.html"));
fs.copyFileSync(
  path.join(srcDir, "styles.css"),
  path.join(distDir, "styles.css")
);
