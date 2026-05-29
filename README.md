# Li Proof Library

Dedicated repository for the Li **proof corpus UI** — catalog scientific opinion vs Lean scan, divergence highlighting, and browser-local human votes.

**Live site (after Pages deploy):** [https://li-langverse.github.io/proof-library/](https://li-langverse.github.io/proof-library/)

## What lives here vs elsewhere

| Repo | Role |
|------|------|
| **proof-library** (this) | Published UI, `data/library.json`, ingest scripts, human vote UX |
| **lic** | Canonical proof-db, TOML entries, Lean semantics, specimens |
| **benchmarks** | Wall-clock perf matrix only — links out to this repo |

## Rebuild catalog JSON

Requires a sibling **lic** checkout (`proof-db/` and TOML entries). Feature worktrees (`lic-studio-ui`) are optional overrides only:

```bash
LIC_ROOT=../lic ./scripts/rebuild.sh
# or
LIC_ROOT=../lic python3 scripts/build-library.py
LIC_ROOT=../lic python3 scripts/build-posture.py
```

Outputs:

- `data/library.json` — entries with `catalog_status`, `lean_status`, `diverges`
- `data/posture.json` — G-* rows from `provability-gaps.md`

## Local web dev

```bash
cd web && npm ci && npm run dev
```

Open with base path `/proof-library` (see `web/next.config.ts`).

## Deploy

GitHub Actions workflow `.github/workflows/pages.yml` builds `web/` and publishes to GitHub Pages.

## Human votes

Votes are stored in **browser localStorage** (`li-proof-votes-v1`). Use **Discuss on GitHub** on divergent rows to open a pre-filled issue in this repo (`proof-opinion` label). Shared tally backend is future work.

## Policy

- No `sorry` in proof-db Lean bridge — explicit axioms only (`lic/docs/semantics/trusted.lean`)
- Catalog claims are honest inventory, not a universal proof certificate
