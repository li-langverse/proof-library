#!/usr/bin/env bash
# Quality gate for data/library.json after rebuild.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LIB="$ROOT/data/library.json"

if [[ ! -f "$LIB" ]]; then
  echo "check-library-quality: missing $LIB" >&2
  exit 1
fi

python3 - "$LIB" <<'PY'
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

lib = Path(sys.argv[1])
data = json.loads(lib.read_text(encoding="utf-8"))
fail = 0

gen = data.get("generated_at") or ""
if not gen:
    print("check-library-quality: missing generated_at", file=sys.stderr)
    fail = 1
else:
    try:
        ts = datetime.strptime(gen.replace("Z", "+0000"), "%Y-%m-%dT%H:%MZ%z")
        age_days = (datetime.now(timezone.utc) - ts).total_seconds() / 86400
        if age_days > 14:
            print(f"check-library-quality: generated_at stale ({age_days:.1f}d)", file=sys.stderr)
            fail = 1
    except ValueError:
        print(f"check-library-quality: bad generated_at {gen!r}", file=sys.stderr)
        fail = 1

if not data.get("lic_commit"):
    print("check-library-quality: missing lic_commit", file=sys.stderr)
    fail = 1

stdlib_ids = (
    "std_add_comm",
    "std_dot4_bilinear_right",
    "std_dot4_comm",
    "std_mul_assoc",
    "std_triangle_ineq_scalar",
)
by_id = {e.get("id"): e for e in data.get("entries") or []}
for sid in stdlib_ids:
    row = by_id.get(sid)
    if not row:
        print(f"check-library-quality: missing stdlib row {sid}", file=sys.stderr)
        fail = 1
        continue
    drill = row.get("drilldown") or {}
    impls = drill.get("implementations") or []
    if not impls:
        print(f"check-library-quality: {sid} has no drilldown", file=sys.stderr)
        fail = 1
        continue
    if not any(i.get("role") == "lean_formal" for i in impls):
        print(f"check-library-quality: {sid} missing lean_formal drilldown", file=sys.stderr)
        fail = 1

witness = re.compile(r"_axiom_witness|def\s+main\s*\(")
proc = re.compile(r"\bproc\b")
for entry in data.get("entries") or []:
    eid = entry.get("id")
    for impl in (entry.get("drilldown") or {}).get("implementations") or []:
        if impl.get("role") != "li_specimen":
            continue
        content = impl.get("content") or ""
        if witness.search(content):
            print(f"check-library-quality: {eid} li_specimen has witness/main", file=sys.stderr)
            fail = 1
        if proc.search(content):
            print(f"check-library-quality: {eid} li_specimen has proc", file=sys.stderr)
            fail = 1

unknown = sum(1 for e in data.get("entries") or [] if e.get("lean_status") == "unknown")
total = len(data.get("entries") or [])
if total and unknown / total > 0.5:
    print(
        f"check-library-quality: lean_status unknown {unknown}/{total} (>50%)",
        file=sys.stderr,
    )
    fail = 1

if fail:
    sys.exit(1)
print(
    f"check-library-quality: OK (unknown={unknown}/{total}, lic_commit={data.get('lic_commit', '')[:8]})"
)
PY
