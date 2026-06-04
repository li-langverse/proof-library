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

LEAN_SOURCES_BASE = [
    "docs/semantics/Core.lean",
    "docs/semantics/trusted.lean",
    "docs/semantics/Discharge.lean",
    "proof-db/lean/ProofDB.lean",
    "proof-db/math/axioms/MathAxioms.lean",
    "proof-db/math/axioms/MathLemmas.lean",
    "proof-db/graph/GraphAxioms.lean",
    "proof-db/numerics/axioms/NumericsAxioms.lean",
    "proof-db/discrete/axioms/DiscreteAxioms.lean",
    "proof-db/chemistry/ChemAxioms.lean",
    "proof-db/biology/BioAxioms.lean",
    "proof-db/ml/OptAxioms.lean",
    "proof-db/ml/Convex.lean",
    "proof-db/ml/SGD.lean",
    "proof-db/statistics/StatsAxioms.lean",
    "build/generated/AutoVC.lean",
]

NS_FALLBACK = {
    "Core.lean": "Li",
    "trusted.lean": "Li.Trusted",
    "Discharge.lean": "Li.Discharge",
    "ProofDB.lean": "Li.ProofDB",
    "MathAxioms.lean": "Li.ProofDb.Math",
    "MathLemmas.lean": "Li.ProofDb.Math",
    "GraphAxioms.lean": "Li.ProofDb.Graph",
    "NumericsAxioms.lean": "Li.ProofDb.Numerics",
    "DiscreteAxioms.lean": "Li.ProofDb.Discrete",
    "ChemAxioms.lean": "Li.ProofDb.Chemistry",
    "BioAxioms.lean": "Li.ProofDb.Biology",
    "OptAxioms.lean": "Li.ProofDb.Ml",
    "Convex.lean": "Li.ProofDb.Ml",
    "SGD.lean": "Li.ProofDb.Ml",
    "StatsAxioms.lean": "Li.ProofDb.Statistics",
    "AutoVC.lean": "AutoVC",
}


def discover_lean_sources(lic: Path) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for rel in LEAN_SOURCES_BASE:
        if rel not in seen and (lic / rel).is_file():
            seen.add(rel)
            out.append(rel)
    proof_db = lic / "proof-db"
    if proof_db.is_dir():
        for path in sorted(proof_db.rglob("*.lean")):
            rel = str(path.relative_to(lic)).replace("\\", "/")
            if rel not in seen:
                seen.add(rel)
                out.append(rel)
    return out


def infer_namespace(path: Path, lines: list[str]) -> str:
    for line in lines[:40]:
        m = re.match(r"^\s*namespace\s+([\w.]+)", line)
        if m:
            return m.group(1)
    return NS_FALLBACK.get(path.name, "")

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


def register_lean_aliases(symbols: dict[str, dict], name: str, sym: dict, ns: str) -> None:
    symbols[name] = sym
    if not ns:
        return
    symbols[f"{ns}.{name}"] = sym
    parts = ns.split(".")
    if len(parts) >= 2:
        symbols[f"{parts[-1]}.{name}"] = sym
        symbols[f"{parts[-2]}.{parts[-1]}.{name}"] = sym


def scan_all_lean(lic: Path) -> dict[str, dict]:
    symbols: dict[str, dict] = {}
    for rel in discover_lean_sources(lic):
        path = lic / rel
        if not path.is_file():
            continue
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        ns = infer_namespace(path, lines)
        for name, sym in scan_lean_file(path, ns, lic).items():
            register_lean_aliases(symbols, name, sym, ns)
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
    lean_path = data.get("lean_path") or "proof-db/lean/ProofDB.lean"
    rows = []
    for e in data.get("entries", []):
        lean_thm = e.get("lean_theorem") or ""
        rows.append(
            {
                "id": e.get("id"),
                "kind": "lemma",
                "field": "stdlib",
                "statement": e.get("textbook", ""),
                "proof_status": e.get("status", "open"),
                "gap_id": (e.get("gap") or "").split(":")[0] if e.get("gap") else None,
                "lean_thm": lean_thm.split(".")[-1] if lean_thm else None,
                "lean_module": lean_path,
                "lean_theorem": lean_thm or None,
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


def lean_lookup_keys(entry: dict) -> list[str]:
    keys: list[str] = []
    ref = lean_ref_name(entry)
    if ref:
        keys.append(ref)
    for key in ("lean_theorem", "lean_thm", "discharge_link"):
        val = entry.get(key)
        if not val or not isinstance(val, str):
            continue
        val = val.strip()
        if not val:
            continue
        keys.append(val)
        keys.append(val.split(".")[-1])
    out: list[str] = []
    seen: set[str] = set()
    for k in keys:
        if k and k not in seen:
            seen.add(k)
            out.append(k)
    return out


def catalog_lean_fallback(entry: dict) -> str:
    catalog = catalog_status(entry)
    if catalog == "axiomatic" or entry.get("kind") == "axiom":
        return "axiomatic"
    mapping = {
        "proved": "proved",
        "open": "open",
        "target": "open",
        "sorry": "open",
        "discrepancy": "open",
        "placeholder": "placeholder",
    }
    return mapping.get(catalog, "unknown")


def resolve_lean_status(entry: dict, lean: dict[str, dict]) -> str:
    for key in lean_lookup_keys(entry):
        if key in lean:
            return lean[key]["status"]
    return catalog_lean_fallback(entry)


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


LI_BOILERPLATE_DEFS = frozenset({"main"})
LI_WITNESS_MARKERS = ("_axiom_witness", "witness_stub")


def is_witness_stub_row(row: dict) -> bool:
    if str(row.get("specimen_role") or "") == "witness_stub":
        return True
    sym = row.get("li_axiom_symbol")
    return isinstance(sym, str) and sym.endswith("_axiom_witness")


def is_boilerplate_li_symbol(symbol: str | None) -> bool:
    if not symbol:
        return False
    if symbol in LI_BOILERPLATE_DEFS:
        return True
    if symbol.endswith("_axiom_witness"):
        return True
    return False


def strip_li_boilerplate_blocks(content: str) -> str:
    """Remove def main / _axiom_witness blocks from site-facing snippets."""
    lines = content.splitlines()
    out: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        m = re.match(r"^\s*def\s+(\w+)", line)
        if m and (
            m.group(1) in LI_BOILERPLATE_DEFS
            or m.group(1).endswith("_axiom_witness")
        ):
            i += 1
            while i < len(lines) and (
                not lines[i].strip()
                or lines[i].startswith(" ")
                or lines[i].strip() == "="
            ):
                i += 1
            continue
        out.append(line)
        i += 1
    return "\n".join(out).strip()


def strip_extern_proc_lines(content: str) -> str:
    """Drop extern proc declarations from site-facing Li snippets."""
    out: list[str] = []
    skip = False
    for line in content.splitlines():
        if re.match(r"^\s*extern proc\b", line):
            skip = True
            continue
        if skip:
            if line.startswith("  ") or not line.strip():
                continue
            skip = False
        if re.search(r"\bproc\b", line):
            continue
        out.append(line)
    return "\n".join(out).strip()


def extract_li_snippet(lic: Path, li_rel: str, symbol: str | None) -> dict | None:
    path = lic / li_rel
    if not path.is_file():
        return None
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    if symbol and symbol.endswith("_axiom_witness"):
        symbol = None
    if symbol:
        def_pat = re.compile(rf"^\s*def\s+{re.escape(symbol)}\b")
        proc_pat = re.compile(rf"^\s*(extern proc|proc)\s+{re.escape(symbol)}\b")
        start_idx: int | None = None
        for i, line in enumerate(lines):
            if def_pat.match(line):
                start_idx = i
                break
        if start_idx is None:
            for i, line in enumerate(lines):
                if proc_pat.match(line):
                    start_idx = i
                    break
        if start_idx is not None:
            i = start_idx
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
            content = strip_li_boilerplate_blocks(strip_extern_proc_lines("\n".join(chunk)))
            if content and not is_boilerplate_li_symbol(symbol):
                return {
                    "language": "li",
                    "path": li_rel,
                    "symbol": symbol,
                    "start_line": i + 1,
                    "highlight_line": i + 1,
                    "content": content,
                    "github_url": github_blob(li_rel, i + 1),
                }
    start = 0
    for i, line in enumerate(lines):
        m = re.match(r"^\s*def\s+(\w+)", line)
        if not m:
            continue
        if is_boilerplate_li_symbol(m.group(1)):
            continue
        start = i
        break
    if start or len(lines) <= 40:
        chunk = lines[start : start + 40] if len(lines) > 40 else lines[start:]
        suffix = "\n-- …" if len(lines) > start + 40 else ""
        content = strip_li_boilerplate_blocks(
            strip_extern_proc_lines("\n".join(chunk) + suffix)
        )
        if content and "_axiom_witness" not in content:
            return {
                "language": "li",
                "path": li_rel,
                "symbol": None,
                "start_line": start + 1,
                "highlight_line": start + 1,
                "content": content,
                "github_url": github_blob(li_rel, start + 1),
            }
    return None


def build_formal_statement_snippet(row: dict) -> dict | None:
    statement = str(row.get("statement") or "").strip()
    latex = row.get("latex")
    if isinstance(latex, str) and latex.strip():
        body = latex.strip()
        label = "Formal statement (LaTeX)"
    elif statement:
        body = statement
        label = "Problem statement"
    else:
        return None
    toml_src = row.get("_source_toml")
    path = str(toml_src) if toml_src else "catalog"
    return {
        "language": "text",
        "path": path,
        "symbol": None,
        "start_line": 1,
        "highlight_line": 1,
        "content": body,
        "github_url": github_blob(path, 1) if toml_src else "",
        "role": "formal_statement",
        "label": label,
    }


def pick_erdos_li_symbol(li_rel: str, lic: Path) -> str | None:
    path = lic / li_rel
    if not path.is_file():
        return None
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        m = re.match(r"^\s*def\s+(erdos_\w+)\b", line)
        if m and not is_boilerplate_li_symbol(m.group(1)):
            return m.group(1)
    return None


def li_symbol_for_entry(entry_id: str, lean_symbol: str | None, row: dict | None = None) -> str | None:
    if row and row.get("li_axiom_symbol"):
        return str(row["li_axiom_symbol"])
    mapping = {
        "M-AX-REAL-ADD-COMM": "proof_db_real_add_comm",
        "M-AX-REAL-ADD-ASSOC": "proof_db_real_add_assoc",
        "M-AX-REAL-MUL-DIST": "proof_db_real_mul_distrib",
        "M-AX-REAL-MUL-ONE": "proof_db_real_mul_one",
        "M-AX-PEANO-ZERO-NOT-SUCC": "proof_db_peano_zero_not_succ",
        "M-AX-PEANO-SUCC-INJ": "proof_db_peano_succ_injective",
        "M-AX-PEANO-IND": "proof_db_peano_induction",
        "M-AX-ORDER-TRICHOTOMY": "proof_db_order_trichotomy_nat",
        "M-AX-ORDER-ANTISYM": "proof_db_order_antisym",
    }
    if entry_id in mapping:
        return mapping[entry_id]
    if entry_id == "M-LM-FLOAT-ADD-COMM":
        return "add_commutative"
    if lean_symbol and not lean_symbol.endswith("_axiom_witness"):
        return lean_symbol
    return None


def build_drilldown(row: dict, lean: dict[str, dict], lic: Path) -> dict | None:
    lean_sym = lean_ref_name(row)
    lean_mod = row.get("lean_module")
    if not lean_mod and row.get("_source_toml") == "proof-db/index.json":
        lean_mod = "proof-db/lean/ProofDB.lean"
    li_spec = row.get("li_specimen")
    toml_src = row.get("_source_toml")
    entry_id = str(row.get("id") or "")
    field = str(row.get("field") or "")

    implementations: list[dict] = []
    formal = build_formal_statement_snippet(row)
    if formal and field == "erdos":
        implementations.append(formal)

    lean_rel = str(lean_mod) if lean_mod else ""
    if lean_rel.endswith(".lean") and lean_sym:
        snip = extract_lean_symbol(lic, lean_rel, lean_sym)
        if snip:
            snip["role"] = "lean_formal"
            snip["label"] = "Lean formalization"
            implementations.append(snip)
    if li_spec and not is_witness_stub_row(row):
        li_sym = li_symbol_for_entry(entry_id, lean_sym, row)
        if field == "erdos" and not li_sym:
            li_sym = pick_erdos_li_symbol(str(li_spec), lic)
        snip = extract_li_snippet(lic, str(li_spec), li_sym)
        if snip:
            content = snip.get("content") or ""
            if "_axiom_witness" not in content and "def main()" not in content:
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
        "erdos_id": row.get("erdos_id") or row.get("erdos_number"),
        "erdos_status": row.get("erdos_status"),
        "convergence_class": row.get("convergence_class"),
        "benchmark_ref": row.get("benchmark_ref"),
        "mathlib_ref": row.get("mathlib_ref"),
        "priority_tier": row.get("priority_tier"),
        "lean_theorem": row.get("lean_theorem") or row.get("lean_thm"),
        "lean_module": row.get("lean_module"),
        "li_specimen": row.get("li_specimen"),
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

    lean_sources = discover_lean_sources(lic)
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
            "lean_scan": lean_sources,
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

    proc_hits: list[str] = []
    witness_hits: list[str] = []
    for entry in entries:
        drill = entry.get("drilldown") or {}
        for impl in drill.get("implementations") or []:
            content = impl.get("content") or ""
            if impl.get("role") == "li_specimen":
                if re.search(r"\bproc\b", content):
                    proc_hits.append(str(entry.get("id")))
                if "_axiom_witness" in content or re.search(
                    r"def\s+main\s*\(", content
                ):
                    witness_hits.append(str(entry.get("id")))
    if proc_hits:
        print(
            f"FAIL: {len(proc_hits)} li_specimen snippet(s) contain proc: "
            + ", ".join(proc_hits[:12])
            + (" …" if len(proc_hits) > 12 else ""),
            file=sys.stderr,
        )
        return 1
    if witness_hits:
        print(
            f"FAIL: {len(witness_hits)} li_specimen snippet(s) contain witness/main boilerplate: "
            + ", ".join(witness_hits[:12])
            + (" …" if len(witness_hits) > 12 else ""),
            file=sys.stderr,
        )
        return 1

    return 0 if entries else 1


if __name__ == "__main__":
    raise SystemExit(main())
