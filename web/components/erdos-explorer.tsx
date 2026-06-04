"use client";

import { useMemo, useState } from "react";
import { ProofDrilldownPanel } from "@/components/math-proof-drilldown";
import type { ProofLibraryEntry } from "@/lib/proof-library-types";

const PAGE_SIZE = 25;

type ErdosExplorerProps = {
  entries: ProofLibraryEntry[];
};

export function ErdosExplorer({ entries }: ErdosExplorerProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [page, setPage] = useState(0);

  const erdosEntries = useMemo(
    () => entries.filter((e) => e.field === "erdos").sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })),
    [entries],
  );

  const statuses = useMemo(() => {
    const set = new Set(erdosEntries.map((e) => e.erdos_status ?? e.catalog_status).filter(Boolean));
    return [...set].sort();
  }, [erdosEntries]);

  const tiers = useMemo(() => {
    const set = new Set(erdosEntries.map((e) => e.priority_tier).filter(Boolean) as string[]);
    return [...set].sort();
  }, [erdosEntries]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return erdosEntries.filter((e) => {
      if (statusFilter) {
        const st = (e.erdos_status ?? e.catalog_status ?? "").toLowerCase();
        if (st !== statusFilter.toLowerCase()) return false;
      }
      if (tierFilter && e.priority_tier !== tierFilter) return false;
      if (!needle) return true;
      const num = e.erdos_id ?? parseInt(e.id.replace(/^E-/, ""), 10);
      return (
        e.id.toLowerCase().includes(needle) ||
        e.statement.toLowerCase().includes(needle) ||
        (e.domain ?? "").toLowerCase().includes(needle) ||
        String(num).includes(needle)
      );
    });
  }, [erdosEntries, query, statusFilter, tierFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const slice = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const resetPage = () => setPage(0);

  return (
    <div className="erdos-explorer">
      <div className="erdos-explorer-toolbar">
        <label className="erdos-explorer-search">
          <span className="sr-only">Search Erdős problems</span>
          <input
            type="search"
            placeholder="Search by number, statement, or domain…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              resetPage();
            }}
            className="erdos-explorer-input"
          />
        </label>
        <label>
          Status
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              resetPage();
            }}
            className="erdos-explorer-select"
          >
            <option value="">All</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tier
          <select
            value={tierFilter}
            onChange={(e) => {
              setTierFilter(e.target.value);
              resetPage();
            }}
            className="erdos-explorer-select"
          >
            <option value="">All</option>
            {tiers.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="erdos-explorer-summary mono">
        Showing {slice.length} of {filtered.length} problems
        {filtered.length !== erdosEntries.length ? ` (filtered from ${erdosEntries.length})` : ""}
      </p>

      <p className="erdos-explorer-epistemic">
        Rows are <strong>open targets</strong> unless catalog and Lean both show proved — the
        site does not mark Erdős problems solved without evidence.
      </p>

      <div className="math-proofs-list">
        {slice.map((entry) => (
          <ProofDrilldownPanel key={entry.id} entry={entry} />
        ))}
      </div>

      {pageCount > 1 ? (
        <nav className="erdos-explorer-pagination" aria-label="Erdős problem pages">
          <button
            type="button"
            disabled={safePage <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Previous
          </button>
          <span className="mono">
            Page {safePage + 1} / {pageCount}
          </span>
          <button
            type="button"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          >
            Next
          </button>
        </nav>
      ) : null}
    </div>
  );
}
