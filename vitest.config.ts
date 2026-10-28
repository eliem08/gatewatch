import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // OCR fuzz/property tests are CPU-heavy; vitest >= 4 parallel workers hit
    // the 5s default under load (timeouts, not logic failures).
    testTimeout: 60_000,
  },
});
