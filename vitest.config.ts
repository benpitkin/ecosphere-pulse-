import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit tests for the money-critical pure functions. Node env; `@` resolves to src
// so tests import the same modules the app does.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
