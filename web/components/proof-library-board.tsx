"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LIBRARY_PUBLIC_URL,
  VOTE_LABELS,
  proofStatusBadgeClass,
  type ProofLibraryEntry,
  type ProofVoteOption,
} from "@/lib/proof-library-types";

const VOTE_KEY = "li-proof-votes-v1";
const GITHUB_ISSUE_BASE =
  "https://github.com/li-langverse/proof-library/issues/new?labels=proof-opinion&title=";

type ProofLibraryBoardProps = {
  generatedAt: string;
  licCommit: string | null;
  summary: {
    total: number;
    divergent: number;
    by_catalog_status: Record<string, number>;
    by_lean_status: Record<string, number>;
  };
  entries: ProofLibraryEntry[];
  voteNote: string;
};

function StatusBadge({ status }: { status: string }) {
  const tone = proofStatusBadgeClass(status);
  return <span className={`badge badge-${tone}`}>{status}</span>;
}

function KindBadge({ kind }: { kind: string }) {
  if (kind !== "axiom") return null;
  return <span className="badge badge-yellow proof-kind-axiom">AXIOM</span>;
}

function loadVotes(): Record<string, ProofVoteOption> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(VOTE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, ProofVoteOption>;
  } catch {
    return {};
  }
}

function saveVotes(votes: Record<string, ProofVoteOption>) {
  localStorage.setItem(VOTE_KEY, JSON.stringify(votes));
}

function issueUrl(entry: ProofLibraryEntry, vote: ProofVoteOption | undefined) {
  const title = encodeURIComponent(`Proof opinion: ${entry.id}`);
  const body = encodeURIComponent(
    [
      `Entry: \`${entry.id}\``,
      `Catalog status: ${entry.catalog_status}`,
      `Lean status: ${entry.lean_status}`,
      `Diverges: ${entry.diverges}`,
      vote ? `My vote: ${vote}` : "My vote: (not set in UI)",
      "",
      "Statement:",
      entry.statement,
    ].join("\n"),
  );
  return `${GITHUB_ISSUE_BASE}${title}&body=${body}`;
}

export function ProofLibraryBoard({
  generatedAt,
  licCommit,
  summary,
  entries,
  voteNote,
}: ProofLibraryBoardProps) {
  const [query, setQuery] = useState("");
  const [fieldFilter, setFieldFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [divergentOnly, setDivergentOnly] = useState(false);
  const [votes, setVotes] = useState<Record<string, ProofVoteOption>>({});

  useEffect(() => {
    setVotes(loadVotes());
  }, []);

  const fields = useMemo(() => {
    const set = new Set(entries.map((e) => e.field).filter(Boolean));
    return [...set].sort();
  }, [entries]);

  const catalogStatuses = useMemo(() => {
    const set = new Set(entries.map((e) => e.catalog_status).filter(Boolean));
    return [...set].sort();
  }, [entries]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (divergentOnly && !e.diverges) return false;
      if (fieldFilter && e.field !== fieldFilter) return false;
      if (statusFilter && e.catalog_status !== statusFilter) return false;
      if (!needle) return true;
      return (
        e.id.toLowerCase().includes(needle) ||
        e.statement.toLowerCase().includes(needle) ||
        (e.gap_id ?? "").toLowerCase().includes(needle) ||
        (e.lean_theorem ?? "").toLowerCase().includes(needle)
      );
    });
  }, [entries, query, fieldFilter, statusFilter, divergentOnly]);

  const setVote = useCallback((id: string, option: ProofVoteOption) => {
    setVotes((prev) => {
      const next = { ...prev, [id]: option };
      saveVotes(next);
      return next;
    });
  }, []);

  const clearVote = useCallback((id: string) => {
    setVotes((prev) => {
      const next = { ...prev };
      delete next[id];
      saveVotes(next);
      return next;
    });
  }, []);

  return (
    <div className="proof-library-board">
      <section className="proof-library-meta coverage-honesty">
        <p>
          <strong>Scientific opinion</strong> = catalog / TOML <code>proof_status</code>{" "}
          (what we claim in the proof database). <strong>Lean opinion</strong> = static scan
          of theorem bodies in <code>lic</code> semantics (sorry → open, axiom → axiomatic).
        </p>
        <p className="coverage-honesty-sub">
          Generated {generatedAt}
          {licCommit ? (
            <>
              {" "}
              · lic{" "}
              <code className="mono">{licCommit.slice(0, 8)}</code>
            </>
          ) : null}
          {" "}
          · {summary.total} entries ·{" "}
          <strong>{summary.divergent} divergent</strong>
        </p>
        <p className="coverage-honesty-sub">{voteNote}</p>
      </section>

      <section className="proof-library-summary">
        <div className="proof-summary-card">
          <h3>Catalog</h3>
          <ul>
            {Object.entries(summary.by_catalog_status).map(([k, v]) => (
              <li key={k}>
                <StatusBadge status={k} /> <span className="mono">{v}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="proof-summary-card">
          <h3>Lean scan</h3>
          <ul>
            {Object.entries(summary.by_lean_status).map(([k, v]) => (
              <li key={k}>
                <StatusBadge status={k} /> <span className="mono">{v}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="proof-library-filters">
        <label>
          Search
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="id, statement, gap, theorem…"
          />
        </label>
        <label>
          Field
          <select value={fieldFilter} onChange={(e) => setFieldFilter(e.target.value)}>
            <option value="">All</option>
            {fields.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label>
          Catalog status
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            {catalogStatuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="proof-filter-check">
          <input
            type="checkbox"
            checked={divergentOnly}
            onChange={(e) => setDivergentOnly(e.target.checked)}
          />
          Divergent only
        </label>
        {fields.includes("erdos") ? (
          <label className="proof-filter-check">
            <input
              type="checkbox"
              checked={fieldFilter === "erdos"}
              onChange={(e) => setFieldFilter(e.target.checked ? "erdos" : "")}
            />
            Erdos only
          </label>
        ) : null}
        <span className="mono proof-filter-count">
          {filtered.length} / {entries.length} shown
        </span>
      </section>

      <div className="proof-library-table-wrap">
        <table className="data-table proof-library-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Statement</th>
              <th>Catalog</th>
              <th>Lean</th>
              <th>Gap</th>
              <th>Your vote</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((entry) => {
              const vote = votes[entry.id];
              return (
                <tr
                  key={entry.id}
                  className={entry.diverges ? "proof-row-divergent" : undefined}
                >
                  <td className="mono proof-id-cell">
                    <div>{entry.id}</div>
                    <div className="proof-id-meta">
                      {entry.field}
                      {entry.domain ? ` · ${entry.domain}` : ""}
                      {entry.kind ? ` · ${entry.kind}` : ""}
                      {entry.priority_tier ? ` · ${entry.priority_tier}` : ""}
                    </div>
                    {entry.github_url ? (
                      <a href={entry.github_url} target="_blank" rel="noopener noreferrer">
                        source
                      </a>
                    ) : null}
                  </td>
                  <td>
                    <p className="proof-statement">{entry.statement}</p>
                    {entry.notes ? (
                      <p className="proof-notes mono">{entry.notes}</p>
                    ) : null}
                    {entry.li_specimen ? (
                      <p className="proof-notes mono">{entry.li_specimen}</p>
                    ) : null}
                  </td>
                  <td>
                    <div className="proof-status-badges">
                      <StatusBadge status={entry.catalog_status} />
                      {entry.kind === "axiom" ? <KindBadge kind={entry.kind} /> : null}
                    </div>
                  </td>
                  <td>
                    <StatusBadge status={entry.lean_status} />
                    {entry.diverges ? (
                      <span className="badge badge-red proof-diverge-tag">≠</span>
                    ) : null}
                  </td>
                  <td className="mono">
                    {entry.gap_id ?? "—"}
                    {entry.gap_kind ? (
                      <div className="proof-id-meta">{entry.gap_kind}</div>
                    ) : null}
                  </td>
                  <td className="proof-vote-cell">
                    <div className="proof-vote-buttons">
                      {(Object.keys(VOTE_LABELS) as ProofVoteOption[]).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          className={
                            vote === opt ? "proof-vote-btn proof-vote-active" : "proof-vote-btn"
                          }
                          title={VOTE_LABELS[opt]}
                          onClick={() => setVote(entry.id, opt)}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                    {vote ? (
                      <p className="proof-vote-selected">
                        You: <strong>{VOTE_LABELS[vote]}</strong>{" "}
                        <button type="button" className="proof-vote-clear" onClick={() => clearVote(entry.id)}>
                          clear
                        </button>
                      </p>
                    ) : null}
                    <a
                      href={issueUrl(entry, vote)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="proof-discuss-link"
                    >
                      Discuss on GitHub
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="proof-library-footer">
        Raw JSON:{" "}
        <a href={LIBRARY_PUBLIC_URL} target="_blank" rel="noopener noreferrer">
          library.json
        </a>
        {" · "}
        <a
          href="https://github.com/li-langverse/benchmarks/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Li benchmarks
        </a>
        {" · "}
        <a
          href="https://github.com/li-langverse/lic/tree/main/proof-db"
          target="_blank"
          rel="noopener noreferrer"
        >
          lic/proof-db
        </a>
      </p>
    </div>
  );
}
