"use client";

import { useCallback, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { ProofCodeGrid } from "@/components/proof-code-block";
import { ProofFormalMath } from "@/components/proof-formal-math";
import {
  proofStatusBadgeClass,
  type ProofLibraryEntry,
} from "@/lib/proof-library-types";
import { leanFormalToLatex, statementToLatex } from "@/lib/lean-formal-latex";

function StatusBadge({ status }: { status: string }) {
  const tone = proofStatusBadgeClass(status);
  return <span className={`badge badge-${tone}`}>{status}</span>;
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
  const formalLatex = leanSnippet ? leanFormalToLatex(leanSnippet.content) : null;
  const statementLatex = statementToLatex(entry.statement);

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

        <div className="proof-drilldown-statement">
          <ProofFormalMath latex={statementLatex} display={false} className="proof-statement-math" />
        </div>

        <div className="proof-drilldown-badges">
          <StatusBadge status={entry.catalog_status} />
          <StatusBadge status={entry.lean_status} />
          {entry.diverges ? <span className="badge badge-red">divergent</span> : null}
        </div>
      </header>

      {open ? (
        <div className="proof-drilldown-body">
          {formalLatex ? (
            <section className="proof-formal-section" aria-label="Formal statement">
              <h4 className="proof-formal-heading">Formal (Lean \u2192 LaTeX)</h4>
              <ProofFormalMath latex={formalLatex} />
            </section>
          ) : null}

          <dl className="proof-drilldown-meta">
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

          <ProofCodeGrid snippets={drill.implementations} />

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
      <h3>Math proofs \u2014 formal drilldown</h3>
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
