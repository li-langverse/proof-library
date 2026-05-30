export type ProofCodeSnippet = {
  role: string;
  label: string;
  language: string;
  path: string;
  symbol?: string | null;
  start_line: number;
  highlight_line: number;
  content: string;
  github_url: string;
};

export type ProofDrilldown = {
  discharged_from: string[];
  release_pin?: string | null;
  backlog_ref?: string | null;
  implementations: ProofCodeSnippet[];
};

export type ProofVoteOption = "catalog" | "lean" | "both" | "undecided";

export type ProofLibraryEntry = {
  id: string;
  kind: string;
  field: string;
  statement: string;
  catalog_status: string;
  lean_status: string;
  diverges: boolean;
  gap_id?: string | null;
  gap_kind?: string | null;
  lean_theorem?: string | null;
  lean_module?: string | null;
  li_specimen?: string | null;
  bench_refs?: string[];
  source?: string | null;
  github_url?: string | null;
  notes?: string | null;
  drilldown?: ProofDrilldown | null;
};

export type ProofLibrary = {
  generated_at: string;
  lic_root: string;
  lic_commit: string | null;
  summary: {
    total: number;
    divergent: number;
    by_catalog_status: Record<string, number>;
    by_lean_status: Record<string, number>;
    discrepancy_register_count: number;
  };
  entries: ProofLibraryEntry[];
  vote_policy: {
    storage: string;
    key: string;
    options: ProofVoteOption[];
    note: string;
  };
};

export function proofStatusBadgeClass(status: string): string {
  const key = status.toLowerCase();
  if (key === "proved" || key === "axiomatic") return "green";
  if (key === "discrepancy" || key === "open" || key === "target") return "red";
  if (key === "placeholder") return "yellow";
  return "unknown";
}

export const VOTE_LABELS: Record<ProofVoteOption, string> = {
  catalog: "Catalog / scientific opinion",
  lean: "Lean scan",
  both: "Both are right",
  undecided: "Neither / need evidence",
};

import { withBasePath } from "./base-path";

export const LIBRARY_PUBLIC_URL = withBasePath("/data/library.json");

export function isMathProof(entry: ProofLibraryEntry): boolean {
  return entry.field === "math" && /^M-(AX|LM)-/.test(entry.id);
}
