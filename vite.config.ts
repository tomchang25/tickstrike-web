import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const layer = (name: string) => fileURLToPath(new URL(`./src/${name}`, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@app": layer("app"),
      "@content": layer("content"),
      "@core": layer("core"),
      "@harness": layer("harness"),
      "@platform": layer("platform"),
      "@presentation": layer("presentation"),
      "@runtime": layer("runtime"),
      "@shared": layer("shared"),
      "@ui": layer("ui"),
    },
  },
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    target: "es2022",
    sourcemap: true,
  },
  test: {
    environment: "node",
    include: ["test/unit/**/*.test.ts"],
  },
});
