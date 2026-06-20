import type { ProofGraph, ProofGraphNode } from "./proof-graph-types";

export type GraphTransform = { x: number; y: number; scale: number };

export type GraphBounds = { x: number; y: number; width: number; height: number };

export function boundsForNodes(nodes: Pick<ProofGraphNode, "x" | "y">[]): GraphBounds | null {
  const placed = nodes.filter((n) => typeof n.x === "number" && typeof n.y === "number");
  if (!placed.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of placed) {
    minX = Math.min(minX, n.x!);
    minY = Math.min(minY, n.y!);
    maxX = Math.max(maxX, n.x!);
    maxY = Math.max(maxY, n.y!);
  }
  const pad = 56;
  return {
    x: minX - pad,
    y: minY - pad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  };
}

export function fitTransform(
  bounds: GraphBounds,
  viewW: number,
  viewH: number,
  padding = 32,
  maxScale = 8,
): GraphTransform {
  const scale = Math.min(
    (viewW - padding * 2) / Math.max(bounds.width, 1),
    (viewH - padding * 2) / Math.max(bounds.height, 1),
    maxScale,
  );
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  return {
    scale: Math.max(0.08, scale),
    x: viewW / 2 - cx * scale,
    y: viewH / 2 - cy * scale,
  };
}

export function focusNodeTransform(
  node: Pick<ProofGraphNode, "x" | "y">,
  viewW: number,
  viewH: number,
  scale = 1.35,
): GraphTransform | null {
  if (typeof node.x !== "number" || typeof node.y !== "number") return null;
  return {
    scale,
    x: viewW / 2 - node.x * scale,
    y: viewH / 2 - node.y * scale,
  };
}

export function graphHasPrecomputedLayout(graph: ProofGraph): boolean {
  return Boolean(graph.layout?.precomputed && graph.nodes.some((n) => typeof n.x === "number"));
}

export function defaultGraphBounds(graph: ProofGraph): GraphBounds | null {
  if (graph.layout?.bounds) return graph.layout.bounds;
  return boundsForNodes(graph.nodes);
}
