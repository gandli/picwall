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
      // lib/vision.ts excluded: browser-only (WebGPU + window.Translator), not
      // exercisable in node; verified via manual E2E on device
      include: ["app/api/**/*.ts"],
      exclude: ["**/*.test.ts"],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
