import { cpSync } from "node:fs";
import { defineConfig } from "vite";

/* The PWA assets live at the repo root (not public/) so the app also works
 * unbundled from any static server; copy them into dist at build time. */
const copyPwaAssets = {
  name: "copy-pwa-assets",
  apply: "build",
  closeBundle() {
    for (const file of ["manifest.webmanifest", "sw.js"]) {
      cpSync(file, `dist/${file}`);
    }
    cpSync("icons", "dist/icons", { recursive: true });
  },
};

export default defineConfig({
  plugins: [copyPwaAssets],
  server: {
    port: 8422,
    strictPort: true,
  },
  test: {
    environment: "jsdom",
  },
});
