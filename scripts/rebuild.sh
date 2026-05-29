#!/usr/bin/env bash
# Rebuild data/library.json + data/posture.json from lic checkout.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LIC="${LIC_ROOT:-}"
if [[ -z "$LIC" ]]; then
  for c in "$ROOT/../lic" "$ROOT/../lic-studio-ui"; do
    if [[ -d "$c/proof-db" || -d "$c/docs/verification/proof-database/entries" ]]; then
      LIC="$c"
      break
    fi
  done
fi
export LIC_ROOT="${LIC:-$ROOT/../lic}"
python3 "$ROOT/scripts/build-library.py"
python3 "$ROOT/scripts/build-posture.py"
echo "ok: $ROOT/data/library.json"
