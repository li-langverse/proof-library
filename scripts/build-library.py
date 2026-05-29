#!/usr/bin/env python3
"""Merge lic proof-db catalog + Lean scan → data/latest/proof-library.json.

Scientific opinion = TOML/index `proof_status` (catalog).
Lean opinion = static scan of theorem/axiom bodies in semantics + ProofDB.

Env:
  LIC_ROOT — lic checkout (default: ../lic, then ../lic-studio-ui if missing proof-db)
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    import tomllib
except ImportError:  # pragma: no cover
    import tomli as tomllib  # type: ignore

ROOT = Path(__file__).resolve().parents[1]
OUT_PATH = ROOT / "data/library.json"
GITHUB_ORG = "li-langverse"
GITHUB_REPO = "lic"

THM = re.compile(r"^theorem\s+(\w+)")
DEF = re.compile(r"^def\s+(\w+)")
AX = re.compile(r"^axiom\s+(\w+)")
SORRY = re.compile(r"\bsorry\b")
PH = re.compile(r"placeholder", re.I)

LEAN_SOURCES = [
    "docs/semantics/Core.lean",
    "docs/semantics/trusted.lean",
    "docs/semantics/Discharge.lean",
    "proof-db/lean/ProofDB.lean",
    "proof-db/math/axioms/MathAxioms.lean",
    "proof-db/math/axioms/MathLemmas.lean",
    "build/generated/AutoVC.lean",
]

STATUS_RANK = {
    "proved": 0,
    "axiomatic": 1,
    "placeholder": 2,
    "open": 3,
    "discrepancy": 3,
    "target": 3,
    "unknown": 4,
}


def resolve_lic_root() -> Path:
    env = os.environ.get("LIC_ROOT")
    if env:
        return Path(env).resolve()
    for candidate in (ROOT.parent / "lic", ROOT.parent / "lic-studio-ui"):
        if (candidate / "proof-db").is_dir() or (
            candidate / "docs/verification/proof-database/entries"
        ).is_dir():
            return candidate.resolve()
    return (ROOT.parent / "lic").resolve()


def lic_commit(lic: Path) -> str | None:
    try:
        out = subprocess.run(
            ["git", "-C", str(lic), "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            check=True,
        )
        return out.stdout.strip() or None
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


def classify_lean(name: str, body: str, kind: str) -> str:
    if kind == "axiom":
        return "axiomatic"
    if SORRY.search(body):
        return "open"
    if PH.search(name) or "placeholder" in name.lower() or name.endswith("_stub"):
        return "placeholder"
    if ":= rfl" in body or ":= trivial" in body:
        return "proved"
    if re.search(r":=\s*(Int|Float|Li|Nat)\.", body):
        return "proved"
    if kind == "theorem" and re.search(r":=\s*[A-Za-z_.][\w.]*", body):
        return "proved"
    if ":= by" in body:
        return "proved"
    return "open"


def scan_lean_file(path: Path, namespace: str, lic: Path) -> dict[str, dict]:
    if not path.is_file():
        return {}
    out: dict[str, dict] = {}
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    i = 0
    while i < len(lines):
        stripped = lines[i].strip()
        m = THM.match(stripped) or DEF.match(stripped) or AX.match(stripped)
        if not m:
            i += 1
            continue
        name = m.group(1)
        kind = "axiom" if AX.match(stripped) else "theorem" if THM.match(stripped) else "def"
        chunk = [lines[i]]
        i += 1
        while i < len(lines):
            nxt = lines[i].strip()
            if THM.match(nxt) or DEF.match(nxt) or AX.match(nxt):
                break
            chunk.append(lines[i])
            if ":=" in lines[i] and not lines[i].strip().startswith("--"):
                i += 1
                while i < len(lines) and lines[i].startswith(" "):
                    chunk.append(lines[i])
                    i += 1
                break
            i += 1
        body = "\n".join(chunk)
        status = classify_lean(name, body, kind)
        try:
            rel = str(path.relative_to(lic))
        except ValueError:
            rel = str(path)
        out[name] = {
            "name": name,
            "qualified": f"{namespace}.{name}" if namespace else name,
            "kind": kind,
            "status": status,
            "file": path.name,
            "path": rel,
        }
    return out


def scan_all_lean(lic: Path) -> dict[str, dict]:
    symbols: dict[str, dict] = {}
    ns_map = {
        "Core.lean": "Li",
        "trusted.lean": "Li.Trusted",
        "Discharge.lean": "Li.Discharge",
        "ProofDB.lean": "Li.ProofDB",
        "MathAxioms.lean": "Li.ProofDb.Math",
        "MathLemmas.lean": "Li.ProofDb.Math",
        "AutoVC.lean": "AutoVC",
    }
    for rel in LEAN_SOURCES:
        path = lic / rel
        ns = ns_map.get(path.name, "")
        for name, sym in scan_lean_file(path, ns, lic).items():
            symbols[name] = sym
            if ns:
                symbols[f"{ns.split('.')[-1]}.{name}"] = sym
                symbols[f"{ns}.{name}"] = sym
    return symbols


def parse_toml_entries(lic: Path) -> list[dict]:
    entries_dir = lic / "docs/verification/proof-database/entries"
    rows: list[dict] = []
    if not entries_dir.is_dir():
        return rows
    for path in sorted(entries_dir.glob("*.toml")):
        data = tomllib.loads(path.read_text(encoding="utf-8"))
        raw = data.get("entry")
        if raw is None:
            continue
        block = [raw] if isinstance(raw, dict) else list(raw)
        for e in block:
            if isinstance(e, dict) and e.get("id"):
                rows.append({**e, "_source_toml": str(path.relative_to(lic))})
    return rows


def parse_index_json(lic: Path) -> list[dict]:
    path = lic / "proof-db/index.json"
    if not path.is_file():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    rows = []
    for e in data.get("entries", []):
        rows.append(
            {
                "id": e.get("id"),
                "kind": "lemma",
                "field": "stdlib",
                "statement": e.get("textbook", ""),
                "proof_status": e.get("status", "open"),
                "gap_id": (e.get("gap") or "").split(":")[0] if e.get("gap") else None,
                "lean_thm": (e.get("lean_theorem") or "").split(".")[-1],
                "lean_module": e.get("lean_path"),
                "lean_theorem": e.get("lean_theorem"),
                "discharge_link": e.get("discharge_link"),
                "_source_toml": "proof-db/index.json",
            }
        )
    return rows


def lean_ref_name(entry: dict) -> str | None:
    for key in ("lean_thm", "lean_theorem", "discharge_link"):
        val = entry.get(key)
        if not val or not isinstance(val, str):
            continue
        val = val.strip()
        if not val:
            continue
        return val.split(".")[-1]
    return None


def catalog_status(entry: dict) -> str:
    return str(entry.get("proof_status") or entry.get("status") or "unknown").lower()


def resolve_lean_status(entry: dict, lean: dict[str, dict]) -> str:
    ref = lean_ref_name(entry)
    if ref and ref in lean:
        return lean[ref]["status"]
    kind = entry.get("kind")
    if catalog_status(entry) == "axiomatic":
        return "axiomatic"
    if kind == "axiom":
        return "axiomatic"
    return "unknown"


def comparable(catalog: str, lean: str) -> tuple[str, str]:
    c = catalog
    if c == "discrepancy":
        c = "open"
    if c == "target":
        c = "open"
    l = lean
    if l == "placeholder":
        l = "open"
    return c, l


def diverges(catalog: str, lean: str) -> bool:
    if lean == "unknown":
        return False
    c, l = comparable(catalog, lean)
    if c == "axiomatic" and l == "axiomatic":
        return False
    if c == "proved" and l in ("proved", "axiomatic"):
        return False
    return c != l


def github_url(lic: Path, entry: dict) -> str | None:
    rel = entry.get("li_specimen") or entry.get("lean_module") or entry.get("_source_toml")
    if not rel or not isinstance(rel, str):
        return None
    rel = rel.strip()
    if not rel:
        return None
    return f"https://github.com/{GITHUB_ORG}/{GITHUB_REPO}/blob/main/{rel}"


def merge_entries(toml_rows: list[dict], index_rows: list[dict]) -> list[dict]:
    by_id: dict[str, dict] = {}
    for row in toml_rows + index_rows:
        eid = row.get("id")
        if not eid:
            continue
        if eid not in by_id:
            by_id[eid] = row
        else:
            by_id[eid] = {**by_id[eid], **row}
    return sorted(by_id.values(), key=lambda r: str(r.get("id", "")))


def build_entry(row: dict, lean: dict[str, dict], lic: Path) -> dict:
    catalog = catalog_status(row)
    lean_st = resolve_lean_status(row, lean)
    div = diverges(catalog, lean_st)
    return {
        "id": row.get("id"),
        "kind": row.get("kind", "lemma"),
        "field": row.get("field", ""),
        "statement": row.get("statement", ""),
        "catalog_status": catalog,
        "lean_status": lean_st,
        "diverges": div,
        "gap_id": row.get("gap_id"),
        "gap_kind": row.get("gap_kind"),
        "lean_theorem": row.get("lean_theorem") or row.get("lean_thm"),
        "lean_module": row.get("lean_module"),
        "li_specimen": row.get("li_specimen"),
        "bench_refs": row.get("bench_refs") or [],
        "source": row.get("_source_toml"),
        "github_url": github_url(lic, row),
        "notes": row.get("notes"),
    }


def main() -> int:
    lic = resolve_lic_root()
    if not lic.is_dir():
        print(f"FAIL: LIC_ROOT not found: {lic}", file=sys.stderr)
        return 1

    lean = scan_all_lean(lic)
    toml_rows = parse_toml_entries(lic)
    index_rows = parse_index_json(lic)
    merged = merge_entries(toml_rows, index_rows)
    entries = [build_entry(r, lean, lic) for r in merged]

    by_catalog: dict[str, int] = {}
    by_lean: dict[str, int] = {}
    divergent = 0
    for e in entries:
        by_catalog[e["catalog_status"]] = by_catalog.get(e["catalog_status"], 0) + 1
        by_lean[e["lean_status"]] = by_lean.get(e["lean_status"], 0) + 1
        if e["diverges"]:
            divergent += 1

    discrepancies: list[dict] = []
    disc_path = lic / "proof-database/discrepancies.json"
    if disc_path.is_file():
        discrepancies = json.loads(disc_path.read_text()).get("discrepancies", [])

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
    payload = {
        "generated_at": now,
        "lic_root": str(lic),
        "lic_commit": lic_commit(lic),
        "sources": {
            "toml_entries": "docs/verification/proof-database/entries/",
            "proof_db_index": "proof-db/index.json",
            "lean_scan": LEAN_SOURCES,
            "discrepancies": "proof-database/discrepancies.json",
        },
        "summary": {
            "total": len(entries),
            "divergent": divergent,
            "by_catalog_status": by_catalog,
            "by_lean_status": by_lean,
            "discrepancy_register_count": len(discrepancies),
        },
        "entries": entries,
        "discrepancies": discrepancies[:12],
        "vote_policy": {
            "storage": "browser_local",
            "key": "li-proof-votes-v1",
            "options": ["catalog", "lean", "both", "undecided"],
            "note": "Votes persist in this browser only until a shared tally backend ships.",
        },
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT_PATH} ({len(entries)} entries, {divergent} divergent)")
    return 0 if entries else 1


if __name__ == "__main__":
    raise SystemExit(main())
