"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProofGraphDrilldown } from "@/components/proof-graph-drilldown";
import {
  boundsForNodes,
  defaultGraphBounds,
  fitTransform,
  focusNodeTransform,
  graphHasPrecomputedLayout,
  type GraphTransform,
} from "@/lib/proof-graph-nav";
import {
  EDGE_KIND_LABELS,
  type ProofGraph,
  type ProofGraphEdge,
  type ProofGraphNode,
  type ProofGraphSectionFrame,
} from "@/lib/proof-graph-types";

type DrawNode = ProofGraphNode & { x: number; y: number };

const DEFAULT_EXCLUDE_FIELDS = new Set(["erdos"]);

type ProofGraphExplorerProps = {
  graph: ProofGraph;
};

function filterNodes(
  graph: ProofGraph,
  fieldFilter: string,
  statusFilter: string,
  excludeErdos: boolean,
): ProofGraphNode[] {
  return graph.nodes.filter((n) => {
    if (excludeErdos && n.field === "erdos") return false;
    if (fieldFilter && n.field !== fieldFilter) return false;
    if (statusFilter && (n.proof_status ?? "") !== statusFilter) return false;
    return true;
  });
}

function filterEdges(nodes: ProofGraphNode[], edges: ProofGraphEdge[]): ProofGraphEdge[] {
  const ids = new Set(nodes.map((n) => n.id));
  return edges.filter((e) => ids.has(e.source) && ids.has(e.target));
}

function withLayout(nodes: ProofGraphNode[], width: number, height: number): DrawNode[] {
  const hasLayout = nodes.some((n) => typeof n.x === "number" && typeof n.y === "number");
  if (hasLayout) {
    return nodes.map((n) => ({
      ...n,
      x: n.x ?? width / 2,
      y: n.y ?? height / 2,
    }));
  }
  return nodes.map((n, i) => {
    const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 2;
    const r = Math.min(width, height) * 0.28;
    return {
      ...n,
      x: width / 2 + Math.cos(angle) * r,
      y: height / 2 + Math.sin(angle) * r,
    };
  });
}

export function ProofGraphExplorer({ graph }: ProofGraphExplorerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<DrawNode[]>([]);
  const edgesRef = useRef<ProofGraphEdge[]>([]);
  const transformRef = useRef<GraphTransform>({ x: 0, y: 0, scale: 1 });
  const dragRef = useRef<{ mode: "pan" | "node" | null; id?: string; lastX: number; lastY: number }>({
    mode: null,
    lastX: 0,
    lastY: 0,
  });
  const fitPendingRef = useRef(true);

  const [fieldFilter, setFieldFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [excludeErdos, setExcludeErdos] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [size, setSize] = useState({ w: 900, h: 520 });

  const precomputed = graphHasPrecomputedLayout(graph);

  const fields = useMemo(
    () => [...new Set(graph.nodes.map((n) => n.field))].filter(Boolean).sort(),
    [graph.nodes],
  );
  const statuses = useMemo(
    () => [...new Set(graph.nodes.map((n) => n.proof_status).filter(Boolean) as string[])].sort(),
    [graph.nodes],
  );

  const visibleNodes = useMemo(
    () => filterNodes(graph, fieldFilter, statusFilter, excludeErdos),
    [graph, fieldFilter, statusFilter, excludeErdos],
  );
  const visibleEdges = useMemo(() => filterEdges(visibleNodes, graph.edges), [visibleNodes, graph.edges]);

  const sectionFrames = useMemo(() => {
    const frames = graph.layout?.section_frames ?? [];
    if (!fieldFilter) return frames;
    return frames.filter((f) => f.field === fieldFilter);
  }, [graph.layout?.section_frames, fieldFilter]);

  const visibleSections = useMemo(() => {
    const counts = new Map<string, { color: string; label: string; count: number; section_key: string }>();
    for (const n of visibleNodes) {
      const cur = counts.get(n.section_key);
      if (cur) cur.count += 1;
      else
        counts.set(n.section_key, {
          color: n.color,
          label: n.section_key,
          count: 1,
          section_key: n.section_key,
        });
    }
    return [...counts.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [visibleNodes]);

  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return visibleNodes
      .filter(
        (n) =>
          n.id.toLowerCase().includes(q) ||
          (n.statement ?? "").toLowerCase().includes(q) ||
          (n.lean_thm ?? "").toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [searchQuery, visibleNodes]);

  const selectedNode = useMemo(
    () => (selectedId ? graph.nodes.find((n) => n.id === selectedId) ?? null : null),
    [graph.nodes, selectedId],
  );

  const applyFit = useCallback(
    (nodes: DrawNode[], viewW: number, viewH: number) => {
      const bounds = boundsForNodes(nodes) ?? defaultGraphBounds(graph);
      if (!bounds) return;
      transformRef.current = fitTransform(bounds, viewW, viewH);
      fitPendingRef.current = false;
    },
    [graph],
  );

  const flyToNode = useCallback(
    (id: string) => {
      const node = nodesRef.current.find((n) => n.id === id);
      if (!node) return;
      const t = focusNodeTransform(node, size.w, size.h);
      if (t) transformRef.current = t;
      setSelectedId(id);
      setActiveSection(node.section_key);
      drawRef.current?.();
    },
    [size.w, size.h],
  );

  const flyToSection = useCallback(
    (frame: ProofGraphSectionFrame | { section_key: string }) => {
      const full =
        graph.layout?.section_frames.find((f) => f.section_key === frame.section_key) ??
        (frame as ProofGraphSectionFrame);
      if (full && typeof full.x === "number") {
        transformRef.current = fitTransform(
          { x: full.x, y: full.y, width: full.width, height: full.height },
          size.w,
          size.h,
          24,
        );
      } else {
        const sectionNodes = nodesRef.current.filter((n) => n.section_key === frame.section_key);
        const bounds = boundsForNodes(sectionNodes);
        if (bounds) transformRef.current = fitTransform(bounds, size.w, size.h);
      }
      setActiveSection(frame.section_key);
      setSelectedId(null);
      drawRef.current?.();
    },
    [graph.layout?.section_frames, size.w, size.h],
  );

  const drawRef = useRef<(() => void) | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const sim = nodesRef.current;
    if (!canvas || !sim.length) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, size.w, size.h);

    const { x: tx, y: ty, scale } = transformRef.current;
    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(scale, scale);

    if (precomputed && graph.layout?.section_frames) {
      for (const frame of graph.layout.section_frames) {
        if (fieldFilter && frame.field !== fieldFilter) continue;
        const isActive = activeSection === frame.section_key;
        ctx.strokeStyle = isActive ? "rgba(88, 166, 255, 0.55)" : "rgba(48, 54, 61, 0.35)";
        ctx.lineWidth = isActive ? 2 / scale : 1 / scale;
        ctx.setLineDash(isActive ? [] : [6 / scale, 4 / scale]);
        ctx.strokeRect(frame.x, frame.y, frame.width, frame.height);
        ctx.setLineDash([]);
        if (scale > 0.35) {
          ctx.fillStyle = "rgba(139, 148, 158, 0.85)";
          ctx.font = `${Math.max(10, 12 / scale)}px ui-monospace, monospace`;
          ctx.fillText(frame.section_key, frame.x + 8 / scale, frame.y + 16 / scale);
        }
      }
    }

    const byId = new Map(sim.map((n) => [n.id, n]));

    ctx.lineWidth = 1 / scale;
    for (const e of edgesRef.current) {
      const a = byId.get(e.source);
      const b = byId.get(e.target);
      if (!a || !b) continue;
      ctx.strokeStyle = "rgba(48, 54, 61, 0.85)";
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    for (const n of sim) {
      const r = (selectedId === n.id ? 9 : 6) / scale;
      ctx.beginPath();
      ctx.fillStyle = n.color;
      ctx.arc(n.x, n.y, Math.max(r, 3), 0, Math.PI * 2);
      ctx.fill();
      if (selectedId === n.id) {
        ctx.strokeStyle = "#e6edf3";
        ctx.lineWidth = 2 / scale;
        ctx.stroke();
      }
    }

    ctx.restore();
  }, [size.w, size.h, selectedId, precomputed, graph.layout?.section_frames, fieldFilter, activeSection]);

  drawRef.current = draw;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: Math.max(420, Math.min(640, el.clientWidth * 0.55)) });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: Math.max(420, Math.min(640, el.clientWidth * 0.55)) });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    nodesRef.current = withLayout(visibleNodes, graph.layout?.width ?? size.w, graph.layout?.height ?? size.h);
    edgesRef.current = visibleEdges;
    fitPendingRef.current = true;
  }, [visibleNodes, visibleEdges, graph.layout?.width, graph.layout?.height, size.w, size.h]);

  useEffect(() => {
    if (fitPendingRef.current && nodesRef.current.length) {
      applyFit(nodesRef.current, size.w, size.h);
    }
    draw();
  }, [applyFit, draw, size.w, size.h, visibleNodes, visibleEdges]);

  const screenToWorld = (sx: number, sy: number) => {
    const { x: tx, y: ty, scale } = transformRef.current;
    return { x: (sx - tx) / scale, y: (sy - ty) / scale };
  };

  const hitTest = (wx: number, wy: number): string | null => {
    const scale = transformRef.current.scale;
    const hitR = 14 / scale;
    let best: { id: string; d: number } | null = null;
    for (const n of nodesRef.current) {
      const d = Math.hypot(n.x - wx, n.y - wy);
      if (d <= hitR && (!best || d < best.d)) best = { id: n.id, d };
    }
    return best?.id ?? null;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { x, y } = screenToWorld(sx, sy);
    const hit = hitTest(x, y);
    dragRef.current = {
      mode: hit ? "node" : "pan",
      id: hit ?? undefined,
      lastX: e.clientX,
      lastY: e.clientY,
    };
    if (hit) {
      setSelectedId(hit);
      const node = nodesRef.current.find((n) => n.id === hit);
      if (node) setActiveSection(node.section_key);
    }
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag.mode) return;
    const dx = e.clientX - drag.lastX;
    const dy = e.clientY - drag.lastY;
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
    if (drag.mode === "pan") {
      transformRef.current.x += dx;
      transformRef.current.y += dy;
      draw();
      return;
    }
    if (drag.mode === "node" && drag.id && !precomputed) {
      const scale = transformRef.current.scale;
      const node = nodesRef.current.find((n) => n.id === drag.id);
      if (node) {
        node.x += dx / scale;
        node.y += dy / scale;
      }
      draw();
    }
  };

  const onPointerUp = () => {
    dragRef.current.mode = null;
  };

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    const t = transformRef.current;
    const wx = (sx - t.x) / t.scale;
    const wy = (sy - t.y) / t.scale;
    t.scale = Math.max(0.06, Math.min(4, t.scale * factor));
    t.x = sx - wx * t.scale;
    t.y = sy - wy * t.scale;
    draw();
  };

  return (
    <div className="proof-graph-explorer">
      <div className="proof-graph-toolbar">
        <label>
          Domain
          <select
            className="erdos-explorer-select"
            value={fieldFilter}
            onChange={(e) => {
              setFieldFilter(e.target.value);
              setSelectedId(null);
              setActiveSection(null);
              fitPendingRef.current = true;
            }}
          >
            <option value="">All (filtered)</option>
            {fields.map((f) => (
              <option key={f} value={f}>
                {f} ({graph.summary.by_field[f] ?? 0})
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            className="erdos-explorer-select"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setSelectedId(null);
              fitPendingRef.current = true;
            }}
          >
            <option value="">All</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="proof-graph-search-wrap">
          Jump to proof
          <input
            className="proof-graph-search"
            type="search"
            placeholder="ID, theorem, statement…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && searchMatches[0]) flyToNode(searchMatches[0].id);
            }}
          />
        </label>
        <button
          type="button"
          className="proof-graph-nav-btn"
          onClick={() => {
            fitPendingRef.current = true;
            applyFit(nodesRef.current, size.w, size.h);
            setActiveSection(null);
            draw();
          }}
        >
          Fit all
        </button>
        <label className="proof-graph-check">
          <input
            type="checkbox"
            checked={excludeErdos}
            onChange={(e) => {
              setExcludeErdos(e.target.checked);
              setSelectedId(null);
              fitPendingRef.current = true;
            }}
          />
          Hide Erdős ({graph.summary.by_field.erdos ?? 0})
        </label>
      </div>

      {searchMatches.length > 0 ? (
        <ul className="proof-graph-search-results">
          {searchMatches.map((n) => (
            <li key={n.id}>
              <button type="button" className="proof-graph-search-hit" onClick={() => flyToNode(n.id)}>
                <strong>{n.id}</strong>
                <span>{n.section_key}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="proof-graph-stats mono">
        {visibleNodes.length} nodes · {visibleEdges.length} edges ·{" "}
        {precomputed ? "precomputed layout" : "fallback layout"} · pan · scroll zoom · click section or node
      </p>

      <div className="proof-graph-legend" aria-label="Section color legend — click to navigate">
        {visibleSections.slice(0, 20).map((s) => (
          <button
            key={s.section_key}
            type="button"
            className={`proof-graph-legend-item proof-graph-legend-btn${activeSection === s.section_key ? " proof-graph-legend-active" : ""}`}
            onClick={() => {
              const frame = sectionFrames.find((f) => f.section_key === s.section_key);
              if (frame) flyToSection(frame);
              else flyToSection({ section_key: s.section_key });
            }}
          >
            <span className="proof-graph-legend-swatch" style={{ background: s.color }} />
            {s.label} ({s.count})
          </button>
        ))}
        {visibleSections.length > 20 ? (
          <span className="proof-graph-legend-more">+{visibleSections.length - 20} sections</span>
        ) : null}
      </div>

      <div className="proof-graph-edge-legend mono">
        {Object.entries(EDGE_KIND_LABELS).map(([k, v]) => (
          <span key={k}>{v}</span>
        ))}
      </div>

      <div ref={containerRef} className="proof-graph-canvas-wrap">
        <canvas
          ref={canvasRef}
          className="proof-graph-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onWheel={onWheel}
          role="img"
          aria-label="Proof relationship graph with precomputed layout"
        />
      </div>

      {selectedNode ? (
        <ProofGraphDrilldown
          graph={graph}
          node={selectedNode}
          onClose={() => setSelectedId(null)}
          onSelectNode={flyToNode}
          explainLlmUrl={graph.explain_llm_hook}
        />
      ) : null}

      {selectedId && !selectedNode ? (
        <p className="proof-graph-empty">Selected node not in current filter.</p>
      ) : null}
    </div>
  );
}

export { DEFAULT_EXCLUDE_FIELDS };
