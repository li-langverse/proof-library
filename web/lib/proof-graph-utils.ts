import type { ProofGraph, ProofGraphNode } from "./proof-graph-types";

/** True when catalog row is honestly discharged (not rfl/axiom_layer stub). */
export function isHonestDischarge(node: ProofGraphNode): boolean {
  const status = node.proof_status ?? "";
  const technique = node.proof_technique ?? "";
  if (status === "axiomatic" || status === "discrepancy") return true;
  if (status !== "proved") return false;
  if (technique === "rfl" || technique === "axiom_layer") return false;
  if (["autovc", "lean_discharge", "hardware_axiom"].includes(technique) && node.lean_snippet) {
    return true;
  }
  return Boolean(node.lean_snippet) && technique !== "open_vc" && technique !== "sorry";
}

export function edgesForNode(graph: ProofGraph, nodeId: string): ProofGraph["edges"] {
  return graph.edges.filter((e) => e.source === nodeId || e.target === nodeId);
}

export function nodeById(graph: ProofGraph, id: string): ProofGraphNode | undefined {
  return graph.nodes.find((n) => n.id === id);
}

/** Human-readable label (statement-first, not internal ID). */
export function nodeDisplayName(node: ProofGraphNode): string {
  if (node.display_name?.trim()) return node.display_name.trim();
  const stmt = (node.statement ?? "").trim();
  if (stmt) return stmt.length > 80 ? `${stmt.slice(0, 77)}…` : stmt;
  return node.id;
}

/** Short subtitle: domain + status. */
export function nodeSubtitle(node: ProofGraphNode): string {
  const parts: string[] = [];
  if (node.domain) parts.push(node.domain.replace(/-/g, " "));
  else if (node.field) parts.push(node.field);
  if (node.proof_status) parts.push(node.proof_status);
  return parts.join(" · ");
}

export function sectionDisplayName(sectionKey: string): string {
  const [field, ...rest] = sectionKey.split("/");
  const sub = rest.join("/").replace(/-/g, " ");
  const fieldLabel = field.replace(/_/g, " ");
  return sub ? `${fieldLabel} · ${sub}` : fieldLabel;
}

const PROOF_ID_RE = /\b([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)\b/g;

export function linkifyProofIds(source: string, knownIds: Set<string>): string {
  return source.replace(PROOF_ID_RE, (match, _id: string, offset: number, full: string) => {
    if (!knownIds.has(match)) return match;
    const before = full[offset - 1] ?? "";
    const after = full[offset + match.length] ?? "";
    if (before === "`" || after === "`") return match;
    if (before === "(" && full.slice(offset - 6, offset) === "proof:") return match;
    const label = match;
    return `[${label}](proof-node:${match})`;
  });
}

export type SearchHit = {
  node: ProofGraphNode;
  score: number;
};

export function searchGraphNodes(nodes: ProofGraphNode[], query: string, limit = 20): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  const hits: SearchHit[] = [];

  for (const node of nodes) {
    const hay = (node.search_text ?? buildSearchText(node)).toLowerCase();
    let score = 0;
    if (hay.includes(q)) score += 10;
    for (const term of terms) {
      if (node.id.toLowerCase().includes(term)) score += 8;
      if ((node.display_name ?? "").toLowerCase().includes(term)) score += 6;
      if ((node.statement ?? "").toLowerCase().includes(term)) score += 5;
      if ((node.plain_summary ?? "").toLowerCase().includes(term)) score += 3;
      if (hay.includes(term)) score += 2;
    }
    if (score > 0) hits.push({ node, score });
  }

  hits.sort((a, b) => b.score - a.score || nodeDisplayName(a.node).localeCompare(nodeDisplayName(b.node)));
  return hits.slice(0, limit);
}

function buildSearchText(node: ProofGraphNode): string {
  return [
    node.id,
    node.display_name,
    node.statement,
    node.plain_summary,
    node.field,
    node.domain,
    node.subsection,
    node.section_key,
    node.lean_thm,
    node.proof_status,
    node.proof_technique,
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildExplainMarkdown(node: ProofGraphNode, related: ProofGraphNode[]): string {
  const title = nodeDisplayName(node);
  const lines = [
    "# Proof context bundle",
    "",
    `**Title:** ${title}`,
    `**Catalog ID:** \`${node.id}\` (internal reference)`,
    `**Field / section:** ${node.field} / ${node.subsection}`,
    node.domain ? `**Domain:** ${node.domain}` : "",
    "",
    "## Statement",
    node.statement ?? "(none)",
    "",
    "## Summary",
    node.plain_summary,
    "",
    "## Status",
    `- proof_status: ${node.proof_status ?? "?"}`,
    `- proof_technique: ${node.proof_technique}`,
    node.gap_kind ? `- gap_kind: ${node.gap_kind}` : "",
    node.gap_id ? `- gap_id: ${node.gap_id}` : "",
    "",
    "## Lean anchor",
    node.lean_module ? `- module: \`${node.lean_module}\`` : "",
    node.lean_thm ? `- theorem: \`${node.lean_thm}\`` : "",
    "",
  ].filter(Boolean);

  if (node.lean_snippet?.content) {
    lines.push("## Lean snippet", "```lean", node.lean_snippet.content, "```", "");
  }
  if (node.li_specimen) {
    lines.push(`## Li specimen`, `- path: \`${node.li_specimen}\``, "");
    if (node.li_derivation_steps && node.li_derivation_steps.length > 0) {
      lines.push("### Derivation steps");
      for (const step of node.li_derivation_steps) {
        const ofBit = step.of != null ? ` of ${step.of}` : "";
        const defBit = step.def ? ` (\`${step.def}\`)` : "";
        lines.push(`- Step ${step.index}${ofBit}: ${step.title}${defBit}`);
      }
      lines.push("");
    }
    if (node.li_snippet?.content) {
      lines.push("```li", node.li_snippet.content, "```", "");
    }
  }
  if (related.length) {
    lines.push("## Related entries");
    for (const r of related.slice(0, 12)) {
      lines.push(`- \`${r.id}\` — ${nodeDisplayName(r)} (${r.proof_status})`);
    }
    lines.push("");
  }
  lines.push(
    "## Prompt",
    "Explain this proof catalog entry in plain English for a developer new to formal verification.",
    "Cover: what it claims, why it matters, current proof status, and what would be needed to close any gap.",
  );
  return lines.join("\n");
}

export function aggregateSectionEdges(graph: ProofGraph): { source: string; target: string; weight: number }[] {
  const nodeSection = new Map(graph.nodes.map((n) => [n.id, n.section_key]));
  const weights = new Map<string, number>();
  for (const e of graph.edges) {
    const ss = nodeSection.get(e.source);
    const ts = nodeSection.get(e.target);
    if (!ss || !ts || ss === ts) continue;
    const key = ss < ts ? `${ss}|${ts}` : `${ts}|${ss}`;
    weights.set(key, (weights.get(key) ?? 0) + 1);
  }
  return [...weights.entries()].map(([key, weight]) => {
    const [source, target] = key.split("|");
    return { source, target, weight };
  });
}
