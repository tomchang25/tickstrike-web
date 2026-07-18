# Agent Rules

## Startup

Before repository work, read `dev/foundation/core/agent_rules/foundation_startup.md`, `dev/foundation/platforms/web-react/platform_startup.md`, and `dev/agent_rules/agent_startup.md` in that order.

If `dev/foundation/` is missing or uninitialized, stop and request `git submodule update --init --recursive`.

## Project structure

Read `dev/standards/project_structure.md` before adding, moving, or reorganizing source, tests, assets, build output, or project documentation. That standard is the canonical owner for repository layout and dependency boundaries.

## Feature completion contract

A feature is complete only when it has:

1. Core rule or content definition.
2. Deterministic scenario setup.
3. Unit assertions for logical results.
4. Pixi/GSAP presentation where applicable.
5. Playwright assertion for the browser-visible result.
6. No pending animation or orphan visual after scenario completion.

## Porting rule

Port behavior and content. Do not preserve Godot lifecycle patterns such as `_ready`, signals as universal plumbing, NodePath lookups, `queue_free`, Autoload ownership, or scene inheritance unless a Web-native equivalent is independently justified.
