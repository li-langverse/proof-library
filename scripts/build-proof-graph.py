#!/usr/bin/env python3
"""Rebuild data/proof-graph.json from sibling lic checkout."""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIC = os.environ.get("LIC_ROOT", "")
if not LIC:
    for c in (ROOT.parent / "lic", ROOT.parent / "lic-studio-ui"):
        if (c / "docs/verification/proof-database/entries").is_dir():
            LIC = str(c)
            break
LIC = LIC or str(ROOT.parent / "lic")
OUT = ROOT / "data" / "proof-graph.json"
BUILD = Path(LIC) / "scripts/proof-db/build-proof-graph.py"

if not BUILD.is_file():
    print(f"FAIL: {BUILD} missing", file=sys.stderr)
    sys.exit(1)

subprocess.run(
    [sys.executable, str(BUILD), "--out", str(OUT), "--lic-root", LIC],
    check=True,
    env={**os.environ, "LIC_ROOT": LIC},
)
print(f"ok: {OUT}")
