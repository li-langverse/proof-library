import type { Metadata } from "next";
import Link from "next/link";
import { ProofGraphExplorer } from "@/components/proof-graph-explorer";
import { loadProofGraph } from "@/lib/proof-graph";

export const metadata: Metadata = {
  title: "Proof graph — Li Proof Library",
  description: "Interactive proof relationship graph coloured by corpus section",
};

export default function ProofGraphPage() {
  const graph = loadProofGraph();

  return (
    <main>
      <section className="placeholder">
        <h2>Proof relationship graph</h2>
        <p>
          Explore how catalog entries connect — shared Lean modules, theorem prefixes, corpus subsections,
          and theorem families. Colours follow field and subsection; Erdős register is hidden by default
          for performance.
        </p>
        <p>
          <Link href="/">← Back to full proof library</Link>
        </p>
      </section>

      {graph ? (
        <ProofGraphExplorer graph={graph} />
      ) : (
        <section className="placeholder">
          <p>
            <code>data/proof-graph.json</code> missing. Regenerate with:
          </p>
          <pre className="mono proof-graph-cmd">
            {`LIC_ROOT=../lic python3 scripts/build-proof-graph.py\n# or from lic:\npython3 scripts/proof-db/build-proof-graph.py --out ../proof-library/data/proof-graph.json`}
          </pre>
        </section>
      )}
    </main>
  );
}
