"use client";

import { useState } from "react";
import { CarbonCodeBlock } from "@/components/carbon-code-block";
import {
  proofStatusBadgeClass,
  type ProofLibraryEntry,
} from "@/lib/proof-library-types";

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
  const drill = entry.drilldown;

  if (!drill?.implementations?.length) {
    return null;
  }

  return (
    <article className={`proof-drilldown ${entry.diverges ? "proof-drilldown-divergent" : ""}`}>
      <header className="proof-drilldown-header">
        <button
          type="button"
          className="proof-drilldown-toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="mono proof-drilldown-id">{entry.id}</span>
          <span className="proof-drilldown-chevron">{open ? "▾" : "▸"}</span>
        </button>
        <p className="proof-drilldown-statement">{entry.statement}</p>
        <div className="proof-drilldown-badges">
          <StatusBadge status={entry.catalog_status} />
          <StatusBadge status={entry.lean_status} />
          {entry.diverges ? <span className="badge badge-red">divergent</span> : null}
        </div>
      </header>

      {open ? (
        <div className="proof-drilldown-body">
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

          <div className="proof-drilldown-code-grid">
            {drill.implementations.map((snippet) => (
              <CarbonCodeBlock key={`${entry.id}-${snippet.role}`} snippet={snippet} />
            ))}
          </div>
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
        Each classical-math row shows how we implemented it in{" "}
        <strong>Lean</strong> (formal layer), <strong>Li</strong> (specimen contracts), and{" "}
        <strong>TOML catalog</strong> (scientific opinion). Carbon-style panes mirror the source
        files in <code>lic/proof-db/math/</code>.
      </p>
      <div className="math-proofs-list">
        {mathEntries.map((entry, i) => (
          <ProofDrilldownPanel key={entry.id} entry={entry} defaultOpen={i === 0} />
        ))}
      </div>
    </section>
  );
}
