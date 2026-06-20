export type ProofGraphSnippet = {
  language: string;
  path: string;
  symbol?: string | null;
  keyword?: string;
  start_line: number;
  highlight_line: number;
  content: string;
};

export type ProofGraphNode = {
  id: string;
  field: string;
  subsection: string;
  section_key: string;
  domain?: string | null;
  color: string;
  kind?: string | null;
  proof_status?: string | null;
  gap_kind?: string | null;
  gap_id?: string | null;
  statement?: string | null;
  /** Human-readable title (usually trimmed statement). */
  display_name?: string | null;
  /** Lowercase blob for full-text search (build-time). */
  search_text?: string | null;
  plain_summary: string;
  proof_technique: string;
  lean_module?: string | null;
  lean_thm?: string | null;
  lean_thm_prefix?: string | null;
  theorem_family?: string | null;
  li_specimen?: string | null;
  li_axiom_symbol?: string | null;
  specimen_role?: string | null;
  li_package_impl?: string | null;
  li_package_snippet?: ProofGraphSnippet | null;
  source_toml?: string | null;
  corpus_file?: string | null;
  breadcrumb: string[];
  breadcrumb_label: string;
  lean_snippet?: ProofGraphSnippet | null;
  li_snippet?: ProofGraphSnippet | null;
  /** KaTeX-ready formal statement (build-time). */
  formal_latex?: string | null;
  context?: string | null;
  notes?: string | null;
  related_ids: string[];
  /** Precomputed layout coordinate (build-time). */
  x?: number;
  y?: number;
};

export type ProofGraphSectionFrame = {
  section_key: string;
  field: string;
  subsection: string;
  color: string;
  count: number;
  x: number;
  y: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
  /** Human label e.g. "physics · relativity". */
  label?: string | null;
};

export type ProofGraphLayout = {
  version: number;
  precomputed: boolean;
  width: number;
  height: number;
  bounds: { x: number; y: number; width: number; height: number };
  section_frames: ProofGraphSectionFrame[];
};

export type ProofGraphEdge = {
  source: string;
  target: string;
  kind: string;
};

export type ProofGraphSection = {
  section_key: string;
  field: string;
  subsection: string;
  color: string;
  count: number;
};

export type ProofGraph = {
  generated_at: string;
  lic_root: string;
  lic_commit: string | null;
  explain_llm_hook?: string | null;
  layout?: ProofGraphLayout;
  summary: {
    nodes: number;
    edges: number;
    by_field: Record<string, number>;
    by_edge_kind: Record<string, number>;
  };
  sections: ProofGraphSection[];
  nodes: ProofGraphNode[];
  edges: ProofGraphEdge[];
};

export const EDGE_KIND_LABELS: Record<string, string> = {
  shared_lean_module: "Same Lean module",
  shared_lean_thm_prefix: "Shared theorem prefix",
  same_subsection: "Same catalog subsection",
  theorem_family: "Same theorem family",
};

export const TECHNIQUE_LABELS: Record<string, string> = {
  rfl: "rfl / trivial",
  float_model_axiom: "Float model axiom",
  hardware_axiom: "Hardware axiom",
  trusted: "Trusted axiom",
  sorry: "sorry (open)",
  structural_def: "Structural def",
  axiom_layer: "Axiom layer",
  autovc: "AutoVC discharge",
  open_vc: "Open VC",
  lean_discharge: "Lean discharge",
  unknown: "Unknown",
};

export function proofGraphPublicUrl(): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return base ? `${base}/data/proof-graph.json` : "/data/proof-graph.json";
}
