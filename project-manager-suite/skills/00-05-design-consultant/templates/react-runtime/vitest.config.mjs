import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["runtime/react/tests/**/*.test.tsx"],
    restoreMocks: true
  }
});
