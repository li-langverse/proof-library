"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { ProofCodeGrid } from "@/components/proof-code-block";
import { ProofFormalMath } from "@/components/proof-formal-math";
import {
  proofStatusBadgeClass,
  type ProofLibraryEntry,
} from "@/lib/proof-library-types";
import { leanFormalToLatex } from "@/lib/lean-formal-latex";

function StatusBadge({ status }: { status: string }) {
  const tone = proofStatusBadgeClass(status);
  return <span className={`badge badge-${tone}`}>{status}</span>;
}

function TargetEpistemicBadge({ entry }: { entry: ProofLibraryEntry }) {
  if (entry.field !== "erdos" && entry.kind !== "target") return null;
  const proved =
    entry.catalog_status === "proved" || entry.lean_status === "proved";
  if (proved) {
    return <span className="badge badge-green">proved (catalog)</span>;
  }
  return <span className="badge badge-red">open target</span>;
}

type ProofDrilldownPanelProps = {
  entry: ProofLibraryEntry;
  defaultOpen?: boolean;
};

export function ProofDrilldownPanel({ entry, defaultOpen = false }: ProofDrilldownPanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [exporting, setExporting] = useState(false);
  const exportRef = useRef<HTMLElement>(null);
  const drill = entry.drilldown;

  if (!drill?.implementations?.length) {
    return null;
  }

  const leanSnippet = drill.implementations.find((s) => s.role === "lean_formal");
  const formalStatement = drill.implementations.find((s) => s.role === "formal_statement");
  const codeSnippets = drill.implementations.filter(
    (s) => s.role !== "formal_statement",
  );
  const formalLatex = leanSnippet
    ? leanFormalToLatex(leanSnippet.content)
    : formalStatement?.content?.includes("$") ||
        formalStatement?.content?.includes("\\")
      ? formalStatement.content
      : null;

  const exportPng = useCallback(async () => {
    const node = exportRef.current;
    if (!node) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(node, {
        backgroundColor: "#161b22",
        pixelRatio: 2,
        cacheBust: true,
        filter: (el) => !(el instanceof HTMLElement && el.dataset.exportIgnore === "true"),
      });
      const link = document.createElement("a");
      link.download = `${entry.id}-proof.png`;
      link.href = dataUrl;
      link.click();
    } finally {
      setExporting(false);
    }
  }, [entry.id]);

  return (
    <article
      ref={exportRef}
      className={`proof-drilldown ${entry.diverges ? "proof-drilldown-divergent" : ""}`}
    >
      <header className="proof-drilldown-header">
        <div className="proof-drilldown-header-row">
          <button
            type="button"
            className="proof-drilldown-toggle"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span className="mono proof-drilldown-id">{entry.id}</span>
            <span className="proof-drilldown-chevron">{open ? "\u25BE" : "\u25B8"}</span>
          </button>
          {open ? (
            <button
              type="button"
              className="proof-export-btn"
              data-export-ignore="true"
              disabled={exporting}
              onClick={() => void exportPng()}
            >
              {exporting ? "Exporting\u2026" : "Export PNG"}
            </button>
          ) : null}
        </div>

        <p className="proof-drilldown-statement">{entry.statement}</p>

        {entry.catalog_status === "discrepancy" ? (
          <p className="proof-discrepancy-note">
            Known modeling gap (not a CI failure) — catalog registers float vs&nbsp;ℝ triage under backlog{" "}
            {drill.backlog_ref ? <code className="mono">{drill.backlog_ref}</code> : null}.
          </p>
        ) : null}
        <div className="proof-drilldown-badges">
          <TargetEpistemicBadge entry={entry} />
          <StatusBadge status={entry.catalog_status} />
          <StatusBadge status={entry.lean_status} />
          {entry.diverges ? <span className="badge badge-red">divergent</span> : null}
        </div>
        {entry.field === "erdos" ? (
          <p className="proof-erdos-epistemic">
            Erdős register row — catalog marks{" "}
            <strong>{entry.erdos_status ?? entry.catalog_status}</strong>; not claimed
            proved in Lean unless both votes agree.
          </p>
        ) : null}
      </header>

      {open ? (
        <div className="proof-drilldown-body">
          {formalLatex ? (
            <section className="proof-formal-section" aria-label="Formal statement">
              <h4 className="proof-formal-heading">
                {leanSnippet ? "Formal (Lean → LaTeX)" : "Problem statement"}
              </h4>
              <ProofFormalMath latex={formalLatex} />
            </section>
          ) : formalStatement ? (
            <section className="proof-formal-section" aria-label="Problem statement">
              <h4 className="proof-formal-heading">{formalStatement.label}</h4>
              <p className="proof-drilldown-statement">{formalStatement.content}</p>
            </section>
          ) : null}

          <dl className="proof-drilldown-meta">
            {entry.domain ? (
              <>
                <dt>Domain</dt>
                <dd className="mono">{entry.domain}</dd>
              </>
            ) : null}
            {entry.priority_tier ? (
              <>
                <dt>Priority tier</dt>
                <dd className="mono">{entry.priority_tier}</dd>
              </>
            ) : null}
            {entry.lean_theorem ? (
              <>
                <dt>Lean theorem</dt>
                <dd className="mono">{entry.lean_theorem}</dd>
              </>
            ) : null}
            {drill.discharged_from.length > 0 ? (
              <>
                <dt>Discharged from</dt>
                <dd className="mono">{drill.discharged_from.join(", ")}</dd>
              </>
            ) : null}
            {drill.backlog_ref ? (
              <>
                <dt>Backlog</dt>
                <dd className="mono">{drill.backlog_ref}</dd>
              </>
            ) : null}
          </dl>

          {entry.notes ? <p className="proof-drilldown-notes">{entry.notes}</p> : null}

          <ProofCodeGrid snippets={codeSnippets} />

          <footer className="proof-export-footer">
            <span className="mono">{entry.id}</span>
            <span>proofs.lilangverse.xyz</span>
          </footer>
        </div>
      ) : null}
    </article>
  );
}

type MathProofDrilldownSectionProps = {
  entries: ProofLibraryEntry[];
};

export function MathProofDrilldownSection({ entries }: MathProofDrilldownSectionProps) {
  const mathEntries = entries.filter(
    (e) => e.field === "math" && /^M-(AX|LM)-/.test(e.id) && e.drilldown?.implementations?.length,
  );

  if (mathEntries.length === 0) {
    return null;
  }

  return (
    <section className="math-proofs-section">
      <h3>Math proofs — formal drilldown</h3>
      <p className="math-proofs-intro">
        Each classical-math row shows the <strong>LaTeX formal statement</strong> (from Lean), then
        source for <strong>Lean</strong>, <strong>Li</strong>, and <strong>TOML catalog</strong>.
        Use <strong>Export PNG</strong> on an expanded row to share on X.
      </p>
      <div className="math-proofs-list">
        {mathEntries.map((entry, i) => (
          <ProofDrilldownPanel key={entry.id} entry={entry} defaultOpen={i === 0} />
        ))}
      </div>
    </section>
  );
}

const ERDOS_HOME_PREVIEW = 5;

export function ErdosProofDrilldownSection({ entries }: MathProofDrilldownSectionProps) {
  const erdosEntries = entries
    .filter((e) => e.field === "erdos" && e.drilldown?.implementations?.length)
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

  if (erdosEntries.length === 0) {
    return null;
  }

  const preview = erdosEntries.slice(0, ERDOS_HOME_PREVIEW);

  return (
    <section className="math-proofs-section erdos-proofs-section">
      <h3>Erdős problems</h3>
      <p className="math-proofs-intro">
        <strong>{erdosEntries.length}</strong> problems from the{" "}
        <a href="https://www.erdosproblems.com/" target="_blank" rel="noopener noreferrer">
          Erdős register
        </a>
        . Preview below — browse all with search on the{" "}
        <Link href="/erdos">Erdős explorer</Link>.
      </p>
      <div className="math-proofs-list">
        {preview.map((entry) => (
          <ProofDrilldownPanel key={entry.id} entry={entry} />
        ))}
      </div>
      {erdosEntries.length > ERDOS_HOME_PREVIEW ? (
        <p className="erdos-explorer-cta">
          <Link href="/erdos">Open Erdős explorer →</Link> ({erdosEntries.length} problems)
        </p>
      ) : null}
    </section>
  );
}
