#!/usr/bin/env python3
"""Parse lic provability-gaps.md → data/latest/proof-posture.json.

Env:
  LIC_ROOT — lic checkout (default: ../lic relative to benchmarks repo)
"""
from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIC = Path(os.environ.get("LIC_ROOT", ROOT.parent / "lic"))
if not (LIC / "docs/verification/provability-gaps.md").is_file():
    alt = ROOT.parent / "lic-studio-ui"
    if (alt / "docs/verification/provability-gaps.md").is_file():
        LIC = alt
GAPS_PATH = LIC / "docs/verification/provability-gaps.md"
OUT_PATH = ROOT / "data/posture.json"

G_ID = re.compile(r"^\*\*(G-[^*]+)\*\*$")
STATUS_IN_CELL = re.compile(
    r"\*\*(Done|Missing|Stub|Partial\+?|CI only|Axiomatic|Social)\*\*",
    re.IGNORECASE,
)
PHASE_IN_CELL = re.compile(r"\*\*([^*]+)\*\*")


def read_gaps() -> str | None:
    if not GAPS_PATH.is_file():
        return None
    return GAPS_PATH.read_text(encoding="utf-8", errors="replace")


def split_table_row(line: str) -> list[str]:
    parts = [p.strip() for p in line.strip().split("|")]
    if parts and parts[0] == "":
        parts = parts[1:]
    if parts and parts[-1] == "":
        parts = parts[:-1]
    return parts


def parse_gap_id(cell: str) -> str | None:
    cell = cell.strip()
    m = G_ID.match(cell)
    if m:
        return m.group(1)
    if cell.startswith("**G-") and cell.endswith("**"):
        return cell.strip("*")
    return None


def status_from_cell(cell: str) -> str | None:
    m = STATUS_IN_CELL.search(cell)
    return m.group(1) if m else None


def phase_from_cell(cell: str) -> str | None:
    cell = cell.strip()
    if not cell or cell in ("—", "-", "N/A"):
        return None
    m = PHASE_IN_CELL.search(cell)
    if not m:
        return cell if cell else None
    return m.group(1).strip() or None


def parse_rows(text: str) -> list[dict[str, str]]:
    """Parse G-* rows from markdown tables (Still open + Gap register)."""
    by_id: dict[str, dict[str, str]] = {}

    for line in text.splitlines():
        if not line.startswith("|") or "---" in line:
            continue
        cells = split_table_row(line)
        if not cells:
            continue
        gap_id = parse_gap_id(cells[0])
        if not gap_id or cells[0].strip("* ").lower() == "id":
            continue

        n = len(cells)
        status: str | None = None
        phase: str | None = None

        if n >= 6:
            status = status_from_cell(cells[3])
            phase = phase_from_cell(cells[4])
        elif n >= 2:
            status = status_from_cell(cells[1])
            if not status:
                plain = cells[1].strip()
                if plain in (
                    "Done",
                    "Missing",
                    "Stub",
                    "Partial",
                    "Partial+",
                    "CI only",
                    "Axiomatic",
                    "Social",
                ):
                    status = plain

        if not status:
            continue

        row = {"id": gap_id, "status": status, "phase": phase or ""}
        prev = by_id.get(gap_id)
        if prev is None:
            by_id[gap_id] = row
        elif phase and not prev.get("phase"):
            by_id[gap_id] = {**prev, "phase": phase}
        elif n < 6:
            by_id[gap_id] = {**prev, "status": status}

    return sorted(by_id.values(), key=lambda r: r["id"])


def main() -> int:
    text = read_gaps()
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")

    if text is None:
        payload = {
            "generated_at": now,
            "source": str(GAPS_PATH),
            "missing_source": True,
            "rows": [],
        }
        OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
        OUT_PATH.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        print(f"wrote {OUT_PATH} (missing source)", file=sys.stderr)
        return 1

    rows = parse_rows(text)
    payload = {
        "generated_at": now,
        "source": str(GAPS_PATH),
        "rows": rows,
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT_PATH} ({len(rows)} G-* rows)")
    return 0 if rows else 1


if __name__ == "__main__":
    raise SystemExit(main())
