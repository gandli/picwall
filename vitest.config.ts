import { defineConfig, configDefaults } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname),
    },
  },
  test: {
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
