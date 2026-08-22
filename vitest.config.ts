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
    coverage: {
      // lib/vision.ts is browser-only (wasm pipeline + window guards); its logic
      // is unit-tested in lib/vision.test.ts with the heavy dep mocked — include it.
      include: ["app/api/**/*.ts", "lib/**/*.ts"],
      exclude: ["**/*.test.ts"],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
