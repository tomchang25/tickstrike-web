import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
  },
  build: {
    outDir: "build",
    target: "es2022",
    sourcemap: true,
  },
  test: {
    environment: "node",
    include: ["test/unit/**/*.test.ts"],
  },
});
