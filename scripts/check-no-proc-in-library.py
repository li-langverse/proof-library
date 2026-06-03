#!/usr/bin/env python3
"""Fail if proof-library drilldown snippets contain the proc keyword."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIBRARY = ROOT / "data" / "library.json"
PROC = re.compile(r"\bproc\b")


def iter_snippets(payload: dict) -> list[tuple[str, str, str]]:
    hits: list[tuple[str, str, str]] = []
    for entry in payload.get("entries") or []:
        eid = str(entry.get("id") or "")
        drill = entry.get("drilldown") or {}
        for impl in drill.get("implementations") or []:
            if impl.get("role") != "li_specimen":
                continue
            content = impl.get("content") or ""
            if PROC.search(content):
                hits.append((eid, str(impl.get("path") or ""), content.splitlines()[0][:80]))
    return hits


def main() -> int:
    if not LIBRARY.is_file():
        print(f"FAIL: missing {LIBRARY}", file=sys.stderr)
        return 1
    payload = json.loads(LIBRARY.read_text(encoding="utf-8"))
    hits = iter_snippets(payload)
    if hits:
        print(f"FAIL: {len(hits)} li_specimen snippet(s) contain proc:", file=sys.stderr)
        for eid, path, preview in hits[:20]:
            print(f"  {eid} {path}: {preview}", file=sys.stderr)
        if len(hits) > 20:
            print(f"  … and {len(hits) - 20} more", file=sys.stderr)
        return 1
    print("check-no-proc-in-library: OK (0 proc in li_specimen snippets)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
