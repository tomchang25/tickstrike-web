---
description: Run the safe Web validation workflow
---

Read `AGENTS.md`, `dev/agent_rules/agent_startup.md`, `dev/agent_rules/test_operations.md`, and `dev/foundation/platforms/web-react/standards/testing_standard.md` first.

Use the narrowest validation layer that proves the requested change. Run `npm test` for unit behavior, `npm run build` for the production build, `npm run test:e2e` for browser-visible behavior, or `npm run check` for the canonical non-browser verification. Do not run browser tests unless browser coverage is required. Report every command run, its result, and any verification gap.

$ARGUMENTS
