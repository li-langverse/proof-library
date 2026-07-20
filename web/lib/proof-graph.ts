import { existsSync, readFileSync } from "fs";
import path from "path";
import type { ProofGraph } from "./proof-graph-types";

export type { ProofGraph, ProofGraphNode, ProofGraphEdge } from "./proof-graph-types";
export {
  EDGE_KIND_LABELS,
  EDGE_LAYER_LABELS,
  DEFAULT_EDGE_LAYERS,
  TECHNIQUE_LABELS,
  edgeLayer,
  proofGraphPublicUrl,
} from "./proof-graph-types";
export { edgesForNode, buildExplainMarkdown } from "./proof-graph-utils";

const GRAPH_PATH = path.join(process.cwd(), "..", "data", "proof-graph.json");

export function loadProofGraph(): ProofGraph | null {
  if (!existsSync(GRAPH_PATH)) return null;
  return JSON.parse(readFileSync(GRAPH_PATH, "utf8")) as ProofGraph;
}

export function nodeMap(graph: ProofGraph): Map<string, ProofGraph["nodes"][number]> {
  return new Map(graph.nodes.map((n) => [n.id, n]));
}
