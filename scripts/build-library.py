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
    # discrepancy = catalog already registers a known catalog/Lean gap (triage, not failure)
    if catalog == "discrepancy":
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


def github_blob(rel: str, line: int | None = None) -> str:
    url = f"https://github.com/{GITHUB_ORG}/{GITHUB_REPO}/blob/main/{rel}"
    if line and line > 0:
        url += f"#L{line}"
    return url


ID_PREFIX_PATTERN = (
    r"M-AX-[A-Z0-9-]+|M-LM-[A-Z0-9-]+"
    r"|N-AX-[A-Z0-9-]+|N-LM-[A-Z0-9-]+"
    r"|D-AX-[A-Z0-9-]+|D-LM-[A-Z0-9-]+"
    r"|ST-AX-[A-Z0-9-]+|ST-LM-[A-Z0-9-]+"
    r"|ML-AX-[A-Z0-9-]+|ML-LM-[A-Z0-9-]+"
    r"|GT-AX-[A-Z0-9-]+|GT-LM-[A-Z0-9-]+"
    r"|E-[A-Z0-9-]+"
    r"|CHEM-AX-[A-Z0-9-]+|CHEM-LM-[A-Z0-9-]+"
    r"|BIO-AX-[A-Z0-9-]+|BIO-LM-[A-Z0-9-]+"
    r"|P-AX-[A-Z0-9-]+|P-LM-[A-Z0-9-]+"
)


def parse_discharged_from(statement: str) -> list[str]:
    if not statement:
        return []
    return re.findall(ID_PREFIX_PATTERN, statement)


def extract_toml_entry_block(lic: Path, toml_rel: str, entry_id: str) -> dict | None:
    path = lic / toml_rel
    if not path.is_file():
        return None
    text = path.read_text(encoding="utf-8", errors="replace")
    blocks = re.split(r"(?=^\[\[entry\]\])", text, flags=re.MULTILINE)
    for block in blocks:
        if not block.strip():
            continue
        m = re.search(r'^id\s*=\s*"([^"]+)"', block, re.MULTILINE)
        if m and m.group(1) == entry_id:
            lines = block.strip().splitlines()
            start = text[: text.find(block.strip())].count("\n") + 1
            return {
                "language": "toml",
                "path": toml_rel,
                "start_line": start,
                "highlight_line": start + next(
                    (i for i, ln in enumerate(lines) if ln.strip().startswith("id =")), 0
                ),
                "content": block.strip(),
                "github_url": github_blob(toml_rel, start),
            }
    return None


def extract_lean_symbol(lic: Path, lean_rel: str, symbol: str) -> dict | None:
    path = lic / lean_rel
    if not path.is_file() or not symbol:
        return None
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    pat = re.compile(rf"^\s*(axiom|theorem|def)\s+{re.escape(symbol)}\b")
    for i, line in enumerate(lines):
        if not pat.match(line):
            continue
        start = max(0, i - 1) if i > 0 and lines[i - 1].strip().startswith("namespace") else i
        end = i + 1
        while end < len(lines) and not re.match(r"^\s*(axiom|theorem|def|end)\b", lines[end]):
            end += 1
        chunk = lines[start:end]
        return {
            "language": "lean",
            "path": lean_rel,
            "symbol": symbol,
            "start_line": start + 1,
            "highlight_line": i + 1,
            "content": "\n".join(chunk),
            "github_url": github_blob(lean_rel, i + 1),
        }
    return None


def extract_li_snippet(lic: Path, li_rel: str, symbol: str | None) -> dict | None:
    path = lic / li_rel
    if not path.is_file():
        return None
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    if symbol:
        pat = re.compile(rf"^\s*(extern proc|def|proc)\s+{re.escape(symbol)}\b")
        for i, line in enumerate(lines):
            if pat.match(line):
                end = i + 1
                depth = 0
                while end < len(lines):
                    if lines[end].strip() == "=":
                        depth = 1
                    if depth and lines[end].strip() and not lines[end].startswith(" ") and end > i + 1:
                        if not lines[end].strip().startswith(("def ", "extern ", "proc ")):
                            break
                    end += 1
                    if end - i > 24:
                        break
                chunk = lines[i:end]
                return {
                    "language": "li",
                    "path": li_rel,
                    "symbol": symbol,
                    "start_line": i + 1,
                    "highlight_line": i + 1,
                    "content": "\n".join(chunk),
                    "github_url": github_blob(li_rel, i + 1),
                }
    if len(lines) <= 40:
        return {
            "language": "li",
            "path": li_rel,
            "symbol": None,
            "start_line": 1,
            "highlight_line": 1,
            "content": "\n".join(lines),
            "github_url": github_blob(li_rel),
        }
    return {
        "language": "li",
        "path": li_rel,
        "symbol": None,
        "start_line": 1,
        "highlight_line": 1,
        "content": "\n".join(lines[:40]) + "\n-- …",
        "github_url": github_blob(li_rel),
    }


def li_symbol_for_entry(entry_id: str, lean_symbol: str | None) -> str | None:
    mapping = {
        "M-AX-REAL-ADD-COMM": "proof_db_real_add_comm",
        "M-AX-REAL-ADD-ASSOC": "proof_db_real_add_assoc",
        "M-AX-REAL-MUL-DIST": "proof_db_real_mul_distrib",
        "M-AX-REAL-MUL-ONE": "proof_db_real_mul_one",
        "M-AX-PEANO-ZERO-NOT-SUCC": "proof_db_peano_zero_not_succ",
    }
    if entry_id in mapping:
        return mapping[entry_id]
    if entry_id == "M-LM-FLOAT-ADD-COMM":
        return "add_commutative"
    return None


def build_drilldown(row: dict, lean: dict[str, dict], lic: Path) -> dict | None:
    lean_sym = lean_ref_name(row)
    lean_mod = row.get("lean_module")
    li_spec = row.get("li_specimen")
    toml_src = row.get("_source_toml")
    entry_id = str(row.get("id") or "")

    implementations: list[dict] = []
    if lean_mod and lean_sym:
        snip = extract_lean_symbol(lic, str(lean_mod), lean_sym)
        if snip:
            snip["role"] = "lean_formal"
            snip["label"] = "Lean formalization"
            implementations.append(snip)
    if li_spec:
        li_sym = li_symbol_for_entry(entry_id, lean_sym)
        snip = extract_li_snippet(lic, str(li_spec), li_sym)
        if snip:
            snip["role"] = "li_specimen"
            snip["label"] = "Li specimen / contract"
            implementations.append(snip)
    if toml_src and entry_id:
        snip = extract_toml_entry_block(lic, str(toml_src), entry_id)
        if snip:
            snip["role"] = "catalog"
            snip["label"] = "Catalog entry (TOML)"
            implementations.append(snip)

    if not implementations:
        return None

    discharged = parse_discharged_from(str(row.get("statement") or ""))
    return {
        "discharged_from": discharged,
        "release_pin": row.get("release_pin"),
        "backlog_ref": row.get("backlog_ref"),
        "implementations": implementations,
    }


def load_export_math_overlay(lic: Path) -> dict[str, dict]:
    """Merge lic export-math rows (Phase 6/7 li_specimen + v3 fields) by entry id."""
    path = lic / "proof-db/export-math.json"
    if not path.is_file():
        script = lic / "scripts/export-math.py"
        if script.is_file():
            try:
                subprocess.run(
                    [sys.executable, str(script), "--pretty", "-o", str(path)],
                    cwd=str(lic),
                    check=True,
                    capture_output=True,
                    text=True,
                )
            except subprocess.CalledProcessError:
                return {}
        else:
            return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    out: dict[str, dict] = {}
    for row in payload.get("entries") or []:
        eid = row.get("id")
        if eid:
            out[str(eid)] = row
    return out


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


def build_entry(row: dict, lean: dict[str, dict], lic: Path, export_overlay: dict[str, dict]) -> dict:
    eid = str(row.get("id") or "")
    if eid in export_overlay:
        ex = export_overlay[eid]
        for key in (
            "li_specimen",
            "content_tier",
            "latex",
            "context",
            "sources",
            "proof_status",
            "erdos_status",
            "priority_tier",
        ):
            if ex.get(key) is not None:
                row = {**row, key: ex[key]}
    catalog = catalog_status(row)
    lean_st = resolve_lean_status(row, lean)
    div = diverges(catalog, lean_st)
    entry = {
        "id": row.get("id"),
        "kind": row.get("kind", "lemma"),
        "field": row.get("field", ""),
        "domain": row.get("domain"),
        "statement": row.get("statement", ""),
        "catalog_status": catalog,
        "lean_status": lean_st,
        "diverges": div,
        "gap_id": row.get("gap_id"),
        "gap_kind": row.get("gap_kind"),
        "erdos_id": row.get("erdos_id"),
        "erdos_status": row.get("erdos_status"),
        "convergence_class": row.get("convergence_class"),
        "benchmark_ref": row.get("benchmark_ref"),
        "mathlib_ref": row.get("mathlib_ref"),
        "priority_tier": row.get("priority_tier"),
        "lean_theorem": row.get("lean_theorem") or row.get("lean_thm"),
        "lean_module": row.get("lean_module"),
        "li_specimen": row.get("li_specimen"),
        "content_tier": row.get("content_tier"),
        "export_math": bool(eid and eid in export_overlay),
        "bench_refs": row.get("bench_refs") or [],
        "source": row.get("_source_toml"),
        "github_url": github_url(lic, row),
        "notes": row.get("notes"),
    }
    drill = build_drilldown(row, lean, lic)
    if drill:
        entry["drilldown"] = drill
    return entry


def main() -> int:
    lic = resolve_lic_root()
    if not lic.is_dir():
        print(f"FAIL: LIC_ROOT not found: {lic}", file=sys.stderr)
        return 1

    lean = scan_all_lean(lic)
    toml_rows = parse_toml_entries(lic)
    index_rows = parse_index_json(lic)
    export_overlay = load_export_math_overlay(lic)
    merged = merge_entries(toml_rows, index_rows)
    entries = [build_entry(r, lean, lic, export_overlay) for r in merged]

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
            "export_math": "proof-db/export-math.json",
            "lean_scan": LEAN_SOURCES,
            "discrepancies": "proof-database/discrepancies.json",
        },
        "export_math_overlay_count": len(export_overlay),
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
