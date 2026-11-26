import { defineConfig } from "vite";
import { readFileSync, existsSync } from "node:fs";

// Attribution for the 3D model (CC BY requires naming the author).
const creditsFile = "public/model/CREDITS.txt";
const credits = existsSync(creditsFile)
  ? readFileSync(creditsFile, "utf8").trim()
  : "Figur: prozedurales Fellknäuel.";

export default defineConfig({
  base: "./",
  define: { __CREDITS__: JSON.stringify(credits) },
  build: { chunkSizeWarningLimit: 1500 },
});
