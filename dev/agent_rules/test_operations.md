# Test Operations

This file is the authoritative project-local test and Web React validation contract for Tickstrike Web. Every agent-run static check, unit test, component test, application test, build smoke, browser check, or accessibility validation must follow this file.

## When To Run

Use the narrowest available layer that proves the changed behavior. Follow the selected Web React platform standards, then map their required coverage to the concrete project commands declared here.

## Environment And Preparation

Use Node.js 22.12 or newer with the npm lockfile. Run `npm install` when dependencies are absent or the lockfile changed. Playwright browser tests require Chromium installed through `npx playwright install chromium`; do not install it unless browser coverage is required.

## Available Layers

- Unit: Vitest tests under `test/unit/`.
- Build smoke: TypeScript project compilation followed by the Vite production export to `build/`.
- Browser acceptance: Playwright tests under `test/e2e/` against the Vite development server.
- Component and accessibility layers are not configured yet.

## Commands And Pass Criteria

- `npm test`: passes when Vitest exits successfully with every unit assertion passing.
- `npm run build`: passes when TypeScript and Vite exit successfully and produce the Web export in `build/`.
- `npm run test:e2e`: passes when Playwright starts or reuses the development server and every Chromium scenario passes. On browser launch failure, distinguish a missing browser installation from an application test failure.
- `npm run check`: canonical non-browser verification; runs unit tests and the production build.

Use the default command timeout for unit and build checks. Browser checks may use Playwright's configured test and server timeouts; do not replace readiness with arbitrary sleeps.

## Result Reporting

Report every layer actually run, the source state tested, the pass/fail result, any expected noise that affected interpretation, and every verification gap or manual-only boundary.
