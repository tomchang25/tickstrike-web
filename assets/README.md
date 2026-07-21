# assets/

This directory holds general references and source material that are not consumed directly by the application build.

Copy or export every asset used at runtime into its owner at `src/content/<feature>/assets/`. Use `src/shared/assets/` only for package-ready assets with demonstrated cross-feature ownership, and import runtime assets from application code so Vite can fingerprint and package them.

See `dev/foundation/platforms/web-react/standards/project_structure_standard.md` and `dev/standards/project_structure.addendum.md` for the canonical asset placement contract.
