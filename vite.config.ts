import { defineConfig } from "vite";
import electron from "vite-plugin-electron";
import renderer from "vite-plugin-electron-renderer";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(__dirname, "src"),
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "src"),
    },
  },
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, "src/index.html"),
        preview: resolve(__dirname, "src/preview.html"),
      },
    },
  },
  plugins: [
    electron([
      {
        entry: resolve(__dirname, "electron/main.ts"),
        vite: {
          build: {
            outDir: resolve(__dirname, "dist-electron"),
            rollupOptions: {
              external: ["electron", "node-pty", "node-llama-cpp"],
            },
          },
        },
      },
      {
        entry: resolve(__dirname, "electron/preload.ts"),
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            outDir: resolve(__dirname, "dist-electron"),
            rollupOptions: {
              external: ["electron", "node-pty", "node-llama-cpp"],
            },
          },
        },
      },
    ]),
    renderer(),
  ],
});
