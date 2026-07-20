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
  mathlib_deps?: string[];
  tags?: string[];
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
  /** Relationship layer L1–L5 (optional for older graphs). */
  layer?: string;
  /** True for mathlib_dep (A uses B). */
  directed?: boolean;
};

export type ProofGraphSection = {
  section_key: string;
  field: string;
  subsection: string;
  color: string;
  count: number;
};

export type ProofGraphHubBridge = {
  l1_in_degree_hubs?: Array<{
    id: string;
    degree: number;
    field?: string | null;
    section_key?: string | null;
    proof_status?: string | null;
  }>;
  cross_section_bridge_count?: number;
  cross_section_bridges_sample?: Array<{
    source: string;
    target: string;
    kind: string;
    layer?: string;
    source_section?: string;
    target_section?: string;
  }>;
  notes?: string;
};

export type ProofGraph = {
  generated_at: string;
  lic_root: string;
  lic_commit: string | null;
  explain_llm_hook?: string | null;
  discharge_stats?: ProofGraphDischargeStats;
  hub_bridge?: ProofGraphHubBridge;
  layout?: ProofGraphLayout;
  layers?: Record<string, string>;
  summary: {
    nodes: number;
    edges: number;
    by_field: Record<string, number>;
    by_edge_kind: Record<string, number>;
    by_layer?: Record<string, number>;
  };
  sections: ProofGraphSection[];
  nodes: ProofGraphNode[];
  edges: ProofGraphEdge[];
};

export type ProofGraphDischargeStats = {
  catalog_total: number;
  real_discharged: number;
  real_proved?: number;
  stub_proved: number;
  open: number;
  target: number;
  witness?: number;
  axiomatic?: number;
  discrepancy?: number;
  non_target_remaining?: number;
};

export const EDGE_KIND_LABELS: Record<string, string> = {
  mathlib_dep: "Catalog Mathlib dep (L1)",
  shared_li_specimen: "Shared Li specimen (L2)",
  same_li_package: "Same Li package (L2)",
  shared_lean_module: "Same Lean module (L3)",
  shared_lean_thm_prefix: "Shared theorem prefix (L3)",
  same_subsection: "Same catalog subsection (L3)",
  theorem_family: "Same theorem family (L3)",
  same_gap_id: "Same gap id (L4)",
  same_domain: "Same domain, cross-field (L4)",
  shared_tag: "Shared tag, cross-field (L4)",
  status_cohort: "Status cohort (L5)",
};

/** Default layers shown when discovering structural relationships. */
export const DEFAULT_EDGE_LAYERS = new Set(["L1", "L2", "L4"]);

export const EDGE_LAYER_LABELS: Record<string, string> = {
  L1: "L1 · catalog deps",
  L2: "L2 · Li specimen",
  L3: "L3 · Lean co-occurrence",
  L4: "L4 · semantic bridges",
  L5: "L5 · status cohort",
};

export function edgeLayer(edge: { kind: string; layer?: string }): string {
  if (edge.layer) return edge.layer;
  const k = edge.kind;
  if (k === "mathlib_dep") return "L1";
  if (k === "shared_li_specimen" || k === "same_li_package") return "L2";
  if (k === "same_gap_id" || k === "same_domain" || k === "shared_tag") return "L4";
  if (k === "status_cohort") return "L5";
  return "L3";
}

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
  erdos_target: "Erdős open target (literature anchor)",
  literature_witness: "Literature / register witness (not formal proof)",
  unknown: "Unknown",
};

export function proofGraphPublicUrl(): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return base ? `${base}/data/proof-graph.json` : "/data/proof-graph.json";
}
