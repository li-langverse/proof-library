"use client";

import { useCallback, useMemo, useState } from "react";
import { CollapsibleText } from "@/components/collapsible-text";
import { ProofCodeBlock } from "@/components/proof-code-block";
import { ProofFormalMath } from "@/components/proof-formal-math";
import { ProofMarkdown } from "@/components/proof-markdown";
import {
  EDGE_KIND_LABELS,
  TECHNIQUE_LABELS,
  type ProofGraph,
  type ProofGraphDerivationStep,
  type ProofGraphNode,
} from "@/lib/proof-graph-types";
import { buildExplainMarkdown, edgesForNode, nodeDisplayName } from "@/lib/proof-graph-utils";
import { leanFormalToLatex, statementToLatex } from "@/lib/lean-formal-latex";
import { proofStatusBadgeClass } from "@/lib/proof-library-types";
import type { ProofCodeSnippet } from "@/lib/proof-library-types";

type TabId = "overview" | "proof" | "lean" | "latex" | "li" | "related" | "explain";

const TABS: { id: TabId; label: string; shortLabel: string }[] = [
  { id: "overview", label: "Overview", shortLabel: "Overview" },
  { id: "proof", label: "How we proved it", shortLabel: "Proof" },
  { id: "lean", label: "Formal (Lean)", shortLabel: "Lean" },
  { id: "latex", label: "Formal (LaTeX)", shortLabel: "LaTeX" },
  { id: "li", label: "Li code", shortLabel: "Li" },
  { id: "related", label: "Related", shortLabel: "Links" },
  { id: "explain", label: "Explain", shortLabel: "Explain" },
];

function snippetFromGraph(
  snip: NonNullable<ProofGraphNode["lean_snippet"]>,
  role: string,
  label: string,
): ProofCodeSnippet {
  return {
    role,
    label,
    language: snip.language,
    path: snip.path,
    symbol: snip.symbol ?? null,
    start_line: snip.start_line,
    highlight_line: snip.highlight_line,
    content: snip.content,
    github_url: `https://github.com/li-langverse/lic/blob/main/${snip.path.replace(/\\/g, "/")}#L${snip.highlight_line}`,
  };
}

function StatusBadge({ status }: { status: string }) {
  const tone = proofStatusBadgeClass(status);
  return <span className={`badge badge-${tone}`}>{status}</span>;
}

function LiDerivationSteps({ steps }: { steps: ProofGraphDerivationStep[] }) {
  if (!steps.length) return null;
  return (
    <section className="proof-graph-derivation" aria-label="Li derivation steps">
      <h3>Li derivation steps</h3>
      <p className="proof-graph-kw-hint">
        Finite constructive witness — named <code className="mono">def</code>s composed by{" "}
        <code className="mono">main</code>. Lean still holds the Mathlib / decide-pack claim;
        Li does not assert the full ∀ Erdős statement.
      </p>
      <ol className="proof-graph-derivation-list">
        {steps.map((step) => (
          <li key={`${step.index}-${step.def ?? step.title}`}>
            <span className="proof-graph-derivation-index mono">
              Step {step.index}
              {step.of != null ? ` of ${step.of}` : ""}
            </span>
            <span className="proof-graph-derivation-title">{step.title}</span>
            {step.def ? (
              <code className="mono proof-graph-derivation-def">{step.def}</code>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

type ProofGraphDrilldownProps = {
  graph: ProofGraph;
  node: ProofGraphNode;
  knownNodeIds?: Set<string>;
  onClose: () => void;
  onSelectNode: (id: string) => void;
  explainLlmUrl?: string | null;
};

export function ProofGraphDrilldown({
  graph,
  node,
  knownNodeIds,
  onClose,
  onSelectNode,
  explainLlmUrl,
}: ProofGraphDrilldownProps) {
  const [tab, setTab] = useState<TabId>("overview");
  const [copied, setCopied] = useState(false);

  const related = useMemo(() => {
    const ids = new Set(node.related_ids ?? []);
    return graph.nodes.filter((n) => ids.has(n.id));
  }, [graph.nodes, node.related_ids]);

  const edgeDetails = useMemo(() => edgesForNode(graph, node.id), [graph, node.id]);

  const explainMd = useMemo(() => buildExplainMarkdown(node, related), [node, related]);

  const formalLatex = useMemo(() => {
    if (node.formal_latex) return node.formal_latex;
    if (node.lean_snippet?.content) {
      return leanFormalToLatex(node.lean_snippet.content);
    }
    return statementToLatex(node.statement);
  }, [node.formal_latex, node.lean_snippet, node.statement]);

  const copyContext = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(explainMd);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = explainMd;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  }, [explainMd]);

  return (
    <>
      <button type="button" className="proof-graph-backdrop" aria-label="Close panel" onClick={onClose} />
      <aside className="proof-graph-panel" role="dialog" aria-labelledby="graph-panel-title">
        <header className="proof-graph-panel-header">
          <nav className="proof-graph-breadcrumb mono" aria-label="Breadcrumb">
            <span className="proof-graph-breadcrumb-compact">{node.breadcrumb_label ?? node.id}</span>
            <span className="proof-graph-breadcrumb-full" aria-hidden="true">
              {node.breadcrumb.map((crumb, i) => (
                <span key={`${crumb}-${i}`}>
                  {i > 0 ? <span className="proof-graph-breadcrumb-sep"> › </span> : null}
                  <span className={i === node.breadcrumb.length - 1 ? "proof-graph-breadcrumb-current" : ""}>
                    {crumb}
                  </span>
                </span>
              ))}
            </span>
          </nav>
          <div className="proof-graph-panel-title-row">
            <div>
              <h2 id="graph-panel-title" className="proof-graph-panel-title">
                {nodeDisplayName(node)}
              </h2>
              <p className="mono proof-graph-panel-id">{node.id}</p>
            </div>
            <button type="button" className="proof-graph-panel-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
          <div className="proof-drilldown-badges">
            <StatusBadge status={node.proof_status ?? "unknown"} />
            <span className="badge badge-unknown">{node.kind ?? "entry"}</span>
            <span className="badge badge-unknown" style={{ borderColor: node.color, color: node.color }}>
              {node.section_key}
            </span>
          </div>
        </header>

        <div className="proof-graph-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={tab === t.id ? "proof-graph-tab proof-graph-tab-active" : "proof-graph-tab"}
              onClick={() => setTab(t.id)}
            >
              <span className="proof-graph-tab-long">{t.label}</span>
              <span className="proof-graph-tab-short">{t.shortLabel}</span>
            </button>
          ))}
        </div>

        <div className="proof-graph-panel-body">
          {tab === "overview" ? (
            <div className="proof-graph-tab-panel">
              <ProofMarkdown
                source={node.plain_summary}
                className="proof-graph-summary-md"
                knownNodeIds={knownNodeIds}
                onNavigateToNode={onSelectNode}
              />
              {node.context ? (
                <section className="proof-graph-section">
                  <h3>Context</h3>
                  <CollapsibleText text={node.context} className="proof-readable" maxChars={280} />
                </section>
              ) : null}
              <section className="proof-graph-section">
                <h3>What it claims</h3>
                <CollapsibleText
                  text={node.statement ?? "No statement recorded."}
                  className="proof-readable"
                  maxChars={320}
                />
              </section>
              <section>
                <h3>Why it matters</h3>
                <p>
                  Part of the <strong>{node.field}</strong> corpus ({node.subsection.replace(/-/g, " ")}).
                  {node.gap_id ? (
                    <>
                      {" "}
                      Tracked under backlog <code className="mono">{node.gap_id}</code>.
                    </>
                  ) : null}
                </p>
              </section>
            </div>
          ) : null}

          {tab === "proof" ? (
            <div className="proof-graph-tab-panel">
              <dl className="proof-drilldown-meta">
                <dt>proof_status</dt>
                <dd>
                  <StatusBadge status={node.proof_status ?? "unknown"} />
                </dd>
                <dt>proof_technique</dt>
                <dd>
                  <code className="mono">{node.proof_technique}</code>
                  {" — "}
                  {TECHNIQUE_LABELS[node.proof_technique] ?? node.proof_technique}
                </dd>
                {node.gap_kind ? (
                  <>
                    <dt>gap_kind</dt>
                    <dd>{node.gap_kind}</dd>
                  </>
                ) : null}
                {node.gap_id ? (
                  <>
                    <dt>gap_id</dt>
                    <dd>{node.gap_id}</dd>
                  </>
                ) : null}
                <dt>Lean module</dt>
                <dd className="mono">{node.lean_module ?? "—"}</dd>
                <dt>lean_thm</dt>
                <dd className="mono">{node.lean_thm ?? "—"}</dd>
                {node.li_def_count != null && node.li_def_count > 0 ? (
                  <>
                    <dt>Li defs</dt>
                    <dd className="mono">{node.li_def_count}</dd>
                  </>
                ) : null}
              </dl>
              {node.li_derivation_steps && node.li_derivation_steps.length > 0 ? (
                <LiDerivationSteps steps={node.li_derivation_steps} />
              ) : null}
            </div>
          ) : null}

          {tab === "lean" ? (
            <div className="proof-graph-tab-panel">
              {node.lean_snippet ? (
                <>
                  {node.lean_snippet.keyword ? (
                    <p className="proof-graph-kw-hint">
                      Declared as <strong>{node.lean_snippet.keyword}</strong>{" "}
                      <code className="mono">{node.lean_snippet.symbol}</code>
                    </p>
                  ) : null}
                  <ProofCodeBlock
                    snippet={snippetFromGraph(node.lean_snippet, "lean", "Lean formalization")}
                  />
                </>
              ) : (
                <p className="proof-graph-empty">
                  No Lean snippet extracted
                  {node.lean_module ? ` from ${node.lean_module}` : ""}.
                  Rebuild graph data after adding <code>lean_thm</code>.
                </p>
              )}
            </div>
          ) : null}

          {tab === "latex" ? (
            <div className="proof-graph-tab-panel">
              {formalLatex ? (
                <>
                  <p className="proof-graph-kw-hint">
                    Rendered with KaTeX
                    {node.lean_snippet?.symbol ? (
                      <>
                        {" "}
                        from Lean symbol <code className="mono">{node.lean_snippet.symbol}</code>
                      </>
                    ) : node.formal_latex ? (
                      <> from build-time <code className="mono">formal_latex</code></>
                    ) : (
                      <> from catalog statement</>
                    )}
                    .
                  </p>
                  <ProofFormalMath latex={formalLatex} />
                </>
              ) : (
                <p className="proof-graph-empty">
                  No formal LaTeX available. Rebuild graph data after adding{" "}
                  <code>lean_thm</code> or a math-rich <code>statement</code>.
                </p>
              )}
            </div>
          ) : null}

          {tab === "li" ? (
            <div className="proof-graph-tab-panel">
              {node.specimen_role ? (
                <p className="proof-graph-kw-hint">
                  Specimen role: <strong>{node.specimen_role}</strong>
                  {node.li_axiom_symbol ? (
                    <>
                      {" "}
                      · axiom symbol <code className="mono">{node.li_axiom_symbol}</code>
                    </>
                  ) : null}
                </p>
              ) : null}
              {node.li_specimen ? (
                <p className="mono proof-graph-path-line">{node.li_specimen}</p>
              ) : null}
              {node.li_derivation_steps && node.li_derivation_steps.length > 0 ? (
                <LiDerivationSteps steps={node.li_derivation_steps} />
              ) : null}
              {node.li_snippet ? (
                <>
                  <h3>Proof-db specimen (multi-step witness)</h3>
                  <ProofCodeBlock
                    snippet={snippetFromGraph(node.li_snippet, "li", "Catalog specimen")}
                  />
                </>
              ) : (
                <p className="proof-graph-empty">
                  {node.li_specimen
                    ? "Specimen path recorded but content could not be extracted."
                    : "No li_specimen linked for this entry."}
                </p>
              )}
              {node.li_package_impl && node.li_package_snippet ? (
                <>
                  <h3>Package implementation</h3>
                  <p className="mono proof-graph-path-line">{node.li_package_impl}</p>
                  <ProofCodeBlock
                    snippet={snippetFromGraph(
                      node.li_package_snippet,
                      "li",
                      "Runtime package API",
                    )}
                  />
                </>
              ) : node.proof_status === "axiomatic" ? (
                <p className="proof-graph-empty">
                  Axiomatic rows should link a built Li axiom layer via <code>li_specimen</code> and{" "}
                  <code>li_package_impl</code>.
                </p>
              ) : null}
            </div>
          ) : null}

          {tab === "related" ? (
            <div className="proof-graph-tab-panel">
              <p className="proof-graph-related-intro">
                {related.length} related entr{related.length === 1 ? "y" : "ies"} via shared Lean module,
                theorem prefix, subsection, or family.
              </p>
              <ul className="proof-graph-related-list">
                {related.map((r) => {
                  const edge = edgeDetails.find(
                    (e) =>
                      (e.source === node.id && e.target === r.id) ||
                      (e.target === node.id && e.source === r.id),
                  );
                  return (
                    <li key={r.id}>
                      <button type="button" className="proof-graph-related-btn" onClick={() => onSelectNode(r.id)}>
                        <span className="proof-graph-related-title">{nodeDisplayName(r)}</span>
                        <span className="mono proof-graph-related-id">{r.id}</span>
                        <StatusBadge status={r.proof_status ?? "?"} />
                        {edge ? (
                          <span className="proof-graph-edge-kind">{EDGE_KIND_LABELS[edge.kind] ?? edge.kind}</span>
                        ) : null}
                        <span className="proof-graph-related-stmt">{r.statement ?? ""}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {related.length === 0 ? <p className="proof-graph-empty">No related entries in this graph slice.</p> : null}
            </div>
          ) : null}

          {tab === "explain" ? (
            <div className="proof-graph-tab-panel">
              <p>
                Copy a structured markdown bundle for ChatGPT, Claude, or Cursor. Works fully offline via
                clipboard.
              </p>
              {explainLlmUrl ? (
                <p className="proof-graph-llm-hook mono">
                  Optional build hook: <code>PROOF_EXPLAIN_LLM_URL={explainLlmUrl}</code>
                </p>
              ) : null}
              <button type="button" className="proof-export-btn" onClick={() => void copyContext()}>
                {copied ? "Copied!" : "Copy context for ChatGPT / Claude / Cursor"}
              </button>
              <ProofMarkdown
                source={explainMd}
                className="proof-graph-explain-md"
                knownNodeIds={knownNodeIds}
                onNavigateToNode={onSelectNode}
              />
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
}
