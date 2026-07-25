# 2026-07-25 — Li derivation steps in explorer drilldown

## Summary

Proof explorer now lists labeled Li derivation steps (`li_derivation_steps`) on the Proof and Li tabs when specimens use `# Step N of M:` comments.

## Agent continuation

1. Rebuild from lic: `LIC_ROOT=../lic-gpu-paper-wt python scripts/build-proof-graph.py && python scripts/build-library.py`
2. Deploy Pages via GitHub Actions on `main` (workflow `pages.yml`) for proofs.lilangverse.xyz
3. Verify: open E-60 → How we proved it / Li code → Step 1…5

## Changed

- `web/components/proof-graph-drilldown.tsx` — derivation step list
- `web/lib/proof-graph-types.ts` — `ProofGraphDerivationStep`
- `web/lib/proof-graph-utils.ts` — explain markdown includes steps
- `web/app/globals.css` — step list styling
- `data/proof-graph.json` — rebuilt from lic showcase specimens

## Not changed

- Catalog honesty / Lean discharge (owned by lic)
- Self-merge of lic MR !1375
