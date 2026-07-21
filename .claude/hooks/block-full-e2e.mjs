// PreToolUse hook: rejects bare full-suite Playwright runs.
// Policy: dev/agent_rules/test_operations.md — per-commit browser verification
// uses a targeted selection; the full suite belongs to CI and spec closeout.
let raw = "";
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  let command = "";
  try {
    command = JSON.parse(raw)?.tool_input?.command ?? "";
  } catch {
    process.exit(0);
  }
  const isE2eRun = /npm run test:e2e|playwright\s+test/.test(command);
  const hasFilter = /(^|\s)(-g|--grep[=\s])|--list|\.spec\.ts/.test(command);
  if (isE2eRun && !hasFilter) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason:
            'Full local e2e runs are reserved for spec closeout; CI runs the complete suite on every push. Use a targeted selection instead: npx playwright test -g "<test name>" or npx playwright test <file>.spec.ts:<line>. See dev/agent_rules/test_operations.md.',
        },
      }),
    );
  }
  process.exit(0);
});
