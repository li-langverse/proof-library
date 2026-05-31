import type { Metadata } from "next";
import Link from "next/link";
import { ErdosExplorer } from "@/components/erdos-explorer";
import { loadLibrary } from "@/lib/library";

export const metadata: Metadata = {
  title: "Erdős problems — Li Proof Library",
  description: "Browse ~1,200 Erdős problems with catalog statements, tiers, and sources",
};

export default function ErdosExplorerPage() {
  const library = loadLibrary();
  const erdosCount = library?.entries.filter((e) => e.field === "erdos").length ?? 0;

  return (
    <main>
      <section className="placeholder">
        <h2>Erdős problem explorer</h2>
        <p>
          Plain-text statements and TOML sources from the{" "}
          <a href="https://www.erdosproblems.com/" target="_blank" rel="noopener noreferrer">
            Erdős register
          </a>
          , ingested into <code>lic/proof-db</code>. Search by number or statement; expand a row for
          source and export.
        </p>
        <p>
          <Link href="/">← Back to full proof library</Link>
        </p>
      </section>

      {library && erdosCount > 0 ? (
        <ErdosExplorer entries={library.entries} />
      ) : (
        <section className="placeholder">
          <p>
            <code>data/library.json</code> missing or has no Erdős rows. Rebuild with{" "}
            <code className="mono">LIC_ROOT=../lic python3 scripts/build-library.py</code>.
          </p>
        </section>
      )}
    </main>
  );
}
