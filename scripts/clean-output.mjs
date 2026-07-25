import fs from "fs";
import path from "path";

const outputDir = path.resolve(process.cwd(), "out");

fs.rmSync(outputDir, { recursive: true, force: true });
