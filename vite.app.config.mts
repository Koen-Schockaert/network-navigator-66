import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Static SPA build used by the Electron desktop app and the Docker container.
 * `base: "./"` keeps asset URLs relative so file:// loading works in Electron.
 */
export default defineConfig({
  root: fileURLToPath(new URL("./app", import.meta.url)),
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    outDir: fileURLToPath(new URL("./dist-app", import.meta.url)),
    emptyOutDir: true,
    target: "es2022",
  },
});
