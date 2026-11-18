import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  plugins: [vue()],
  server: {
    port: 5179,
    proxy: {
      "/api": { target: "http://localhost:5178", changeOrigin: true },
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
