import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "fmg-lib": path.resolve(__dirname, "../src/index.ts"),
      "@app": path.resolve(__dirname, "./app"),
      "@adapter": path.resolve(__dirname, "./adapter"),
      "@renderer": path.resolve(__dirname, "./renderer"),
      "@workers": path.resolve(__dirname, "./workers"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    coverage: {
      reporter: ["text", "lcov"],
    },
  },
});
