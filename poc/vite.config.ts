import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// 既存レンダラー(src/renderer/src)を「参照」してビルドする。コピーせず 1 ソース共有。
const rendererSrc = resolve(import.meta.dirname, "../src/renderer/src");
const repoRoot = resolve(import.meta.dirname, "..");

// https://vite.dev/config/
export default defineConfig(async () => ({
  // フロントエンドは front/ に集約（index.html もここ）。backend は src-tauri/。
  root: "front",
  build: {
    // tauri.conf.json の frontendDist "../dist"（= poc/dist）に出力する
    outDir: "../dist",
    emptyOutDir: true,
  },

  plugins: [react()],

  resolve: {
    // 既存レンダラーの `@` / `@renderer` エイリアスを再現
    alias: {
      "@": rendererSrc,
      "@renderer": rendererSrc,
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
    // front の外(src/renderer)を参照するため、リポジトリルートを配信許可
    fs: {
      allow: [repoRoot],
    },
  },
}));
