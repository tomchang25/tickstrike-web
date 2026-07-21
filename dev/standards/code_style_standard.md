# Code Style Standard

This standard defines Tickstrike Web's durable TypeScript and TSX formatting and control-flow conventions. It supplements the Web React naming conventions at `dev/foundation/platforms/web-react/standards/naming_conventions.md`; that platform standard remains the canonical owner of identifier and filename spelling.

## Automated Formatting

- Prettier is the canonical formatter. Use `npm run format` to apply it and `npm run format:check` to verify it without modifying files.
- Oxlint is the canonical static style checker. Use `npm run lint` to verify and `npm run lint:fix` only for its safe automatic fixes.
- `npm run verify` runs formatting, linting, unit tests, and the production build. A change is not verified until its applicable checks pass.
- The root `.prettierignore` and `.oxlintrc.json` exclusions are intentional boundaries. Do not format or lint generated output, the pinned foundation, reference project, or human-only reports through these commands.

## Control Flow

- Every `if`, `else`, `for`, `for...of`, `for...in`, `while`, and `do...while` body uses braces, including a single statement. Oxlint enforces this with `curly: ["error", "all"]`.
- Use an early return or continue for a simple guard. Do not add an `else` after a branch that always exits.
- Use `if` and `else` for mutually exclusive outcomes that share one decision, keeping the branches aligned and explicit.

```ts
if (this.processingCommands) {
  return;
}

if (job.generation !== this.currentGeneration) {
  job.reject(new Error("Command cancelled by scenario replacement."));
} else {
  job.resolve(resolution);
}
```

## Logical Spacing

- Separate adjacent logical phases in a function with one blank line. Typical phases are guards, input retrieval and validation, deterministic state updates, presentation or asynchronous scheduling, result settlement, and cleanup.
- Keep statements that implement one atomic operation together. Do not add blank lines between every declaration, condition, or call merely to create visual space.
- Use a short comment only when the phase boundary is not evident from the code itself.
- Semantic phase boundaries remain a review requirement because a linter cannot reliably infer program intent. Do not introduce a blanket blank-line rule that separates every declaration or statement.
