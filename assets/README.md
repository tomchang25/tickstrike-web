# assets/

This directory holds general references and source material that are not consumed directly by the application build.

Copy or export every asset used at runtime into its owner at `src/content/<feature>/assets/`. Use `src/shared/assets/` only for package-ready assets with demonstrated cross-feature ownership, and import runtime assets from application code so Vite can fingerprint and package them.

See `dev/standards/project_structure.md` for the canonical asset placement contract.
