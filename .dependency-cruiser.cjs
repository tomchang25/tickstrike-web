/**
 * Machine-enforced layering. These rules restate contracts that are otherwise
 * prose in `dev/standards/project_structure.md` and
 * `dev/standards/gameplay_feature_architecture.md`; changing one without the
 * other leaves the repository with two disagreeing sources of truth.
 *
 * The cross-layer sets below were measured from the graph at adoption time and
 * are frozen, not aspirational. Widening one is an architecture decision.
 */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "warn",
      comment:
        "What this should forbid is a runtime cycle, which makes initialization order load-bearing. Classifying an import as type-only requires the TypeScript compiler, which dependency-cruiser cannot use here, so the swc parser reports every edge as a plain import and this rule cannot tell a harmless type cycle from a real one. It warns rather than blocks until that classification returns; raise it to error then.",
      from: {},
      to: { circular: true, dependencyTypesNot: ["type-only"] },
    },
    {
      name: "no-orphan-modules",
      severity: "warn",
      comment: "A module nothing imports is either dead or missing its registration.",
      from: { orphan: true, pathNot: "\\.d\\.ts$|(^|/)vite-env\\.d\\.ts$" },
      to: {},
    },

    {
      name: "core-imports-only-core",
      severity: "error",
      comment:
        "src/core holds framework-independent gameplay rules. It must not reach content, presentation, runtime, harness, or UI.",
      from: { path: "^src/core/" },
      to: { path: "^src/", pathNot: "^src/core/" },
    },
    {
      name: "content-imports-only-content-and-core",
      severity: "error",
      from: { path: "^src/content/" },
      to: { path: "^src/", pathNot: "^src/(content|core)/" },
    },
    {
      name: "presentation-imports-only-presentation-content-core",
      severity: "error",
      from: { path: "^src/presentation/" },
      to: { path: "^src/", pathNot: "^src/(presentation|content|core)/" },
    },
    {
      name: "harness-imports-within-its-measured-set",
      severity: "error",
      from: { path: "^src/harness/" },
      to: { path: "^src/", pathNot: "^src/(harness|content|core|runtime)/" },
    },
    {
      name: "runtime-imports-within-its-measured-set",
      severity: "error",
      from: { path: "^src/runtime/" },
      to: { path: "^src/", pathNot: "^src/(runtime|core|harness|presentation)/" },
    },
    {
      name: "ui-imports-within-its-measured-set",
      severity: "error",
      from: { path: "^src/ui/" },
      to: { path: "^src/", pathNot: "^src/(ui|content|core|harness)/" },
    },
    {
      name: "app-imports-within-its-measured-set",
      severity: "error",
      from: { path: "^src/app/" },
      to: { path: "^src/", pathNot: "^src/(app|core|harness|presentation|runtime|ui)/" },
    },
    {
      name: "platform-and-shared-are-leaves",
      severity: "error",
      comment: "Support layers must not depend on the layers that consume them.",
      from: { path: "^src/(platform|shared)/" },
      to: { path: "^src/", pathNot: "^src/(platform|shared)/" },
    },

    {
      name: "world-subsystems-do-not-import-each-other",
      severity: "error",
      comment:
        "A6 acceptance: each World subsystem owns one kind of state and is composed in World's constructor, never by importing a sibling.",
      from: { path: "^src/core/world/(grid-board|wave-runtime|run-build)\\.ts$" },
      to: { path: "^src/core/world/(grid-board|wave-runtime|run-build|combat-operations)\\.ts$" },
    },
    {
      name: "combat-operations-reaches-only-the-board",
      severity: "error",
      comment:
        "The one recorded subsystem dependency: combat resolution needs the board's spatial answers. It must not reach wave or run state.",
      from: { path: "^src/core/world/combat-operations\\.ts$" },
      to: { path: "^src/core/world/(wave-runtime|run-build)\\.ts$" },
    },

    {
      name: "enemy-behaviors-through-their-registry",
      severity: "error",
      comment:
        "Adding an enemy behavior is one module plus one registry entry. Reaching past the registry reintroduces the per-role knowledge the registry exists to remove.",
      from: { path: "^src/", pathNot: "^src/core/enemies/" },
      to: {
        path: "^src/core/enemies/behaviors/",
        pathNot: "^src/core/enemies/behaviors/index\\.ts$",
      },
    },
    {
      name: "enemy-presenters-through-their-registry",
      severity: "error",
      from: { path: "^src/", pathNot: "^src/presentation/timelines/enemy-presenters/" },
      to: {
        path: "^src/presentation/timelines/enemy-presenters/",
        pathNot: "^src/presentation/timelines/enemy-presenters/index\\.ts$",
      },
    },
    {
      name: "enemy-features-through-their-registry",
      severity: "error",
      from: { path: "^src/", pathNot: "^src/content/enemies/features/" },
      to: {
        path: "^src/content/enemies/features/",
        pathNot: "^src/content/enemies/features/index\\.ts$",
      },
    },
  ],

  options: {
    doNotFollow: { path: "node_modules" },
    // The swc parser dependency-cruiser falls back to cannot parse JSX, so the
    // five React shell files are outside the cruise. Every gameplay layer is
    // TypeScript and fully covered; revisit when dependency-cruiser supports
    // TypeScript 7 and the tsc parser becomes available again.
    exclude: { path: "\.tsx$" },
    // dependency-cruiser has no TypeScript 7 support yet; swc parses the sources
    // instead so the cruise sees modules at all. Verify the module count is
    // non-zero after changing this — the tool reports "no violations" when it
    // silently parsed nothing.
    parser: "swc",
    tsConfig: { fileName: "tsconfig.app.json" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
    },
  },
};
