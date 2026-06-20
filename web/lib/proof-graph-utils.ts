import type { ProofGraph, ProofGraphNode } from "./proof-graph-types";

export function edgesForNode(graph: ProofGraph, nodeId: string): ProofGraph["edges"] {
  return graph.edges.filter((e) => e.source === nodeId || e.target === nodeId);
}

export function buildExplainMarkdown(node: ProofGraphNode, related: ProofGraphNode[]): string {
  const lines = [
    "# Proof context bundle",
    "",
    `**ID:** \`${node.id}\``,
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
    if (node.li_snippet?.content) {
      lines.push("```li", node.li_snippet.content, "```", "");
    }
  }
  if (related.length) {
    lines.push("## Related entries");
    for (const r of related.slice(0, 12)) {
      lines.push(`- \`${r.id}\` (${r.proof_status}) — ${(r.statement ?? "").slice(0, 80)}`);
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
