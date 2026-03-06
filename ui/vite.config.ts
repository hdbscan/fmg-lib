import path from "node:path";
import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  plugins: [solidPlugin()],
  server: {
    fs: {
      allow: [".."],
    },
    port: 4174,
    host: "127.0.0.1",
  },
  preview: {
    port: 4174,
    host: "127.0.0.1",
  },
  resolve: {
    alias: {
      "fmg-lib": path.resolve(__dirname, "../src/index.ts"),
      "@app": path.resolve(__dirname, "./app"),
      "@adapter": path.resolve(__dirname, "./adapter"),
      "@renderer": path.resolve(__dirname, "./renderer"),
      "@workers": path.resolve(__dirname, "./workers"),
    },
  },
  worker: {
    format: "es",
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
