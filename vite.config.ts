import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
// Keep the dev writer independent of the runtime catalog import. If Vite config loads
// that JSON, every Apply becomes a config restart and forces a full-page reload.
import { parseEntityPresentationProfileCatalog } from "./src/presentation/pixi/entity-presentation-profile-schema";
import { parseActionPresentationCatalog } from "./src/presentation/actions/action-presentation-schema";

const layer = (name: string) => fileURLToPath(new URL(`./src/${name}`, import.meta.url));
const entityPresentationCatalogPath = fileURLToPath(
  new URL("./src/presentation/pixi/entity-presentation-profile-catalog.json", import.meta.url),
);
const actionPresentationCatalogPath = fileURLToPath(
  new URL("./src/presentation/actions/action-presentation-catalog.json", import.meta.url),
);

function sendJson(response: ServerResponse, statusCode: number, value: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(value));
}

function entityPresentationCatalogWriter(): Plugin {
  return {
    name: "entity-presentation-catalog-writer",
    configureServer(server) {
      // Catalog changes arrive through the endpoint response. Watching this runtime-imported JSON
      // would hot-replace its Pixi dependencies, destroy the Lab scene, and leave React's retained
      // `ready` state pointing at a disposed renderer. Reload Runtime Catalog remains the explicit
      // way to pick up an external edit; the gameplay runtime picks it up on a normal page reload.
      server.watcher.unwatch(entityPresentationCatalogPath);
      server.middlewares.use(async (request, response, next) => {
        if (request.url !== "/__debug/entity-presentation-profile-catalog") {
          next();
          return;
        }
        try {
          if (request.method === "GET") {
            const catalog = parseEntityPresentationProfileCatalog(
              JSON.parse(await readFile(entityPresentationCatalogPath, "utf8")),
            );
            sendJson(response, 200, catalog);
            return;
          }
          if (request.method !== "PUT") {
            sendJson(response, 405, { error: "Only GET and PUT are supported." });
            return;
          }

          const chunks: Buffer[] = [];
          let size = 0;
          for await (const chunk of request) {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            size += buffer.length;
            if (size > 100_000) {
              sendJson(response, 413, { error: "Profile catalog exceeds 100 KB." });
              return;
            }
            chunks.push(buffer);
          }
          const catalog = parseEntityPresentationProfileCatalog(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          await writeFile(entityPresentationCatalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
          server.ws.send({ type: "custom", event: "entity-presentation-catalog-updated" });
          sendJson(response, 200, catalog);
        } catch (error) {
          sendJson(response, 400, { error: error instanceof Error ? error.message : "Invalid profile catalog." });
        }
      });
    },
    handleHotUpdate(context) {
      return context.file === entityPresentationCatalogPath ? [] : undefined;
    },
  };
}

function actionPresentationCatalogWriter(): Plugin {
  return {
    name: "action-presentation-catalog-writer",
    configureServer(server) {
      // Same rationale as the entity writer: the endpoint owns the round-trip so the runtime-imported
      // JSON is not watched into an HMR replacement that would dispose the live Action Lab scene.
      server.watcher.unwatch(actionPresentationCatalogPath);
      server.middlewares.use(async (request, response, next) => {
        if (request.url !== "/__debug/action-presentation-catalog") {
          next();
          return;
        }
        try {
          if (request.method === "GET") {
            const catalog = parseActionPresentationCatalog(
              JSON.parse(await readFile(actionPresentationCatalogPath, "utf8")),
            );
            sendJson(response, 200, catalog);
            return;
          }
          if (request.method !== "PUT") {
            sendJson(response, 405, { error: "Only GET and PUT are supported." });
            return;
          }

          const chunks: Buffer[] = [];
          let size = 0;
          for await (const chunk of request) {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            size += buffer.length;
            if (size > 100_000) {
              sendJson(response, 413, { error: "Action catalog exceeds 100 KB." });
              return;
            }
            chunks.push(buffer);
          }
          const catalog = parseActionPresentationCatalog(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          await writeFile(actionPresentationCatalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
          server.ws.send({ type: "custom", event: "action-presentation-catalog-updated" });
          sendJson(response, 200, catalog);
        } catch (error) {
          sendJson(response, 400, { error: error instanceof Error ? error.message : "Invalid action catalog." });
        }
      });
    },
    handleHotUpdate(context) {
      return context.file === actionPresentationCatalogPath ? [] : undefined;
    },
  };
}

export default defineConfig({
  plugins: [react(), entityPresentationCatalogWriter(), actionPresentationCatalogWriter()],
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
    // Node is the default for the pure-logic unit suite. Component tests opt into jsdom per file
    // with a `// @vitest-environment jsdom` docblock so React can render into a simulated DOM
    // without a browser; see dev/standards/test_economy_standard.md.
    environment: "node",
    include: ["test/unit/**/*.test.ts", "test/component/**/*.test.tsx"],
  },
});
