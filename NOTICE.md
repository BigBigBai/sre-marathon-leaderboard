# Sources and modifications

Original website: https://www.swe-marathon.org/

Original benchmark repository: https://github.com/abundant-ai/swe-marathon

Original attribution: SWE-Marathon by Abundant AI and its credited contributors.
The original website footer states “Open-source under Apache 2.0.” The benchmark
repository's Apache 2.0 license is preserved in `vendor/UPSTREAM-LICENSE`.
React and other third-party license comments embedded in the bundles are retained.

Snapshot date: 2026-10-19. Original files and hashes are recorded in `vendor/manifest.json`.

Modifications made for this independent replica:

- Separate editable benchmark JSON from the preserved rendering bundle.
- Resolve assets, preloaded modules, and the web manifest relative to the deployment.
- Read trajectories on demand from the original CORS-enabled origin.
- Replace the original subscriber destination with an explicitly configured endpoint.
- Add configurable metadata/contact information and a small mirror attribution.
- Add dependency-free build, preview, validation and GitHub Pages deployment scripts.

The original evaluation results, author attributions, external references, and
benchmark claims are reproduced as snapshot content. This project does not claim
to have performed the original evaluations or to be the official SWE-Marathon site.
