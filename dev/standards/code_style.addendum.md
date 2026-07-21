# Code Style Addendum

Canonical control-flow and logical-spacing conventions are owned by `dev/foundation/platforms/web-react/standards/code_style_standard.md`; formatting configuration by `dev/foundation/platforms/web-react/standards/command_surface_standard.md`; identifier and filename spelling by `dev/foundation/platforms/web-react/standards/naming_conventions.md`. This addendum records only Tickstrike Web's tool bindings.

- Prettier is the canonical formatter: `npm run format` applies it and `npm run format:check` verifies without modifying files.
- Oxlint is the canonical static style checker: `npm run lint` verifies and `npm run lint:fix` applies only its safe automatic fixes. The shared brace rule is enforced with `curly: ["error", "all"]`.
- The root `.prettierignore` and `.oxlintrc.json` exclusions are intentional boundaries. Do not format or lint generated output, the pinned foundation, the reference project, or human-only reports through these commands.
