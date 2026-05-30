import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/shell/header";
import { ProofLibraryBoard } from "@/components/proof-library-board";
import { MathProofDrilldownSection } from "@/components/math-proof-drilldown";
import { loadLibrary } from "@/lib/library";
import { loadProofPosture } from "@/lib/proof-posture";

export const metadata: Metadata = {
  title: "Li Proof Library",
  description: "Lemma and axiom catalog — catalog opinion vs Lean scan, with human votes",
};

const PROVABILITY_GAPS_URL =
  "https://github.com/li-langverse/lic/blob/main/docs/verification/provability-gaps.md";

export default function HomePage() {
  const library = loadLibrary();
  const posture = loadProofPosture();

  return (
    <main>
      <section className="placeholder">
        <h2>Proof library</h2>
        <p>
          Dedicated home for Li&apos;s proof corpus — separate from{" "}
          <a href="https://li-langverse.github.io/benchmarks/">benchmark wall-clock ratios</a>.
          Compare <strong>scientific catalog opinion</strong> (TOML / proof-db) vs{" "}
          <strong>Lean scan</strong>, then vote what you believe.
        </p>
        <ul className="intro-list">
          <li>
            <strong>Catalog</strong> — <code>proof_status</code> in{" "}
            <code>lic/docs/verification/proof-database/</code>
          </li>
          <li>
            <strong>Lean</strong> — static scan of theorem bodies in <code>lic</code> semantics
          </li>
          <li>
            <strong>Red row</strong> — catalog and Lean disagree
          </li>
        </ul>
        <p>
          Compiler gaps:{" "}
          <a href={PROVABILITY_GAPS_URL} target="_blank" rel="noopener noreferrer">
            provability-gaps.md
          </a>
        </p>
      </section>

      {posture && posture.rows.length > 0 ? (
        <section className="proof-posture-strip">
          <h3>G-* compiler gaps</h3>
          <div className="proof-posture-chips">
            {posture.rows.slice(0, 14).map((row) => (
              <span key={row.id} className="mono proof-posture-chip">
                {row.id}: {row.status}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {library ? (
        <>
          <MathProofDrilldownSection entries={library.entries} />
          <ProofLibraryBoard
            generatedAt={library.generated_at}
            licCommit={library.lic_commit}
            summary={library.summary}
            entries={library.entries}
            voteNote={library.vote_policy.note}
          />
        </>
      ) : (
        <section className="placeholder">
          <p>
            <code>data/library.json</code> missing. Run:{" "}
            <code className="mono">LIC_ROOT=../lic-studio-ui python3 scripts/build-library.py</code>
          </p>
        </section>
      )}
    </main>
  );
}
