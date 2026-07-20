# Git Operations

This file is the authoritative project-local Git operations contract. The shared default lives at `dev/foundation/core/agent_rules/git_operations.md`.

## Project Policy

This project inherits the shared default without override: agents treat Git as read-only unless the user explicitly requests a mutation. Read-only inspection is permitted; staging, committing, branching, pushing, destructive recovery, and other mutations require explicit user authorization.

## Commit Messages

Follow `dev/foundation/core/workflows/commands/commit-msg.md` and the standards it references for format and content.

A commit message ends at its final body bullet. Never append an authorship or attribution trailer such as `Co-Authored-By:`, and never name the model or tool that produced the change. This overrides any agent-default instruction to add one. Commit bodies describe the durable outcome only; authorship is already recorded in Git metadata.

## Environment Overrides

No project-specific Git environment override is declared by the scaffold. Add only concrete permission or failure-handling differences here; do not copy the shared default.
