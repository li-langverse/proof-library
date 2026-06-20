"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProofGraphDrilldown } from "@/components/proof-graph-drilldown";
import {
  EDGE_KIND_LABELS,
  type ProofGraph,
  type ProofGraphEdge,
  type ProofGraphNode,
} from "@/lib/proof-graph-types";

type SimNode = ProofGraphNode & {
  x: number;
  y: number;
  vx: number;
  vy: number;
};

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

function initSimulation(nodes: ProofGraphNode[], width: number, height: number): SimNode[] {
  return nodes.map((n, i) => {
    const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 2;
    const r = Math.min(width, height) * 0.28;
    return {
      ...n,
      x: width / 2 + Math.cos(angle) * r + (Math.random() - 0.5) * 40,
      y: height / 2 + Math.sin(angle) * r + (Math.random() - 0.5) * 40,
      vx: 0,
      vy: 0,
    };
  });
}

function tickSimulation(sim: SimNode[], edges: ProofGraphEdge[], width: number, height: number, alpha: number) {
  const byId = new Map(sim.map((n) => [n.id, n]));
  const cx = width / 2;
  const cy = height / 2;

  for (const n of sim) {
    n.vx += (cx - n.x) * 0.002 * alpha;
    n.vy += (cy - n.y) * 0.002 * alpha;
  }

  for (let i = 0; i < sim.length; i++) {
    for (let j = i + 1; j < sim.length; j++) {
      const a = sim[i];
      const b = sim[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.max(Math.hypot(dx, dy), 1);
      const repulse = (8000 / (dist * dist)) * alpha;
      const fx = (dx / dist) * repulse;
      const fy = (dy / dist) * repulse;
      a.vx -= fx;
      a.vy -= fy;
      b.vx += fx;
      b.vy += fy;
    }
  }

  for (const e of edges) {
    const a = byId.get(e.source);
    const b = byId.get(e.target);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.max(Math.hypot(dx, dy), 1);
    const spring = (dist - 90) * 0.04 * alpha;
    const fx = (dx / dist) * spring;
    const fy = (dy / dist) * spring;
    a.vx += fx;
    a.vy += fy;
    b.vx -= fx;
    b.vy -= fy;
  }

  for (const n of sim) {
    n.vx *= 0.82;
    n.vy *= 0.82;
    n.x += n.vx;
    n.y += n.vy;
    n.x = Math.max(24, Math.min(width - 24, n.x));
    n.y = Math.max(24, Math.min(height - 24, n.y));
  }
}

export function ProofGraphExplorer({ graph }: ProofGraphExplorerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<SimNode[]>([]);
  const edgesRef = useRef<ProofGraphEdge[]>([]);
  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  const dragRef = useRef<{ mode: "pan" | "node" | null; id?: string; lastX: number; lastY: number }>({
    mode: null,
    lastX: 0,
    lastY: 0,
  });

  const [fieldFilter, setFieldFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [excludeErdos, setExcludeErdos] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 900, h: 520 });

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

  const visibleSections = useMemo(() => {
    const counts = new Map<string, { color: string; label: string; count: number }>();
    for (const n of visibleNodes) {
      const cur = counts.get(n.section_key);
      if (cur) cur.count += 1;
      else counts.set(n.section_key, { color: n.color, label: n.section_key, count: 1 });
    }
    return [...counts.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [visibleNodes]);

  const selectedNode = useMemo(
    () => (selectedId ? graph.nodes.find((n) => n.id === selectedId) ?? null : null),
    [graph.nodes, selectedId],
  );

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
    simRef.current = initSimulation(visibleNodes, size.w, size.h);
    edgesRef.current = visibleEdges;
    transformRef.current = { x: 0, y: 0, scale: 1 };
  }, [visibleNodes, visibleEdges, size.w, size.h]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const sim = simRef.current;
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

    const byId = new Map(sim.map((n) => [n.id, n]));

    ctx.lineWidth = 1;
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
      const r = selectedId === n.id ? 9 : 6;
      ctx.beginPath();
      ctx.fillStyle = n.color;
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fill();
      if (selectedId === n.id) {
        ctx.strokeStyle = "#e6edf3";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    ctx.restore();
  }, [size.w, size.h, selectedId]);

  useEffect(() => {
    let frame = 0;
    let alpha = 1;
    const loop = () => {
      if (alpha > 0.02) {
        tickSimulation(simRef.current, edgesRef.current, size.w, size.h, alpha);
        alpha *= 0.985;
      }
      draw();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [draw, size.w, size.h, visibleNodes, visibleEdges]);

  const screenToWorld = (sx: number, sy: number) => {
    const { x: tx, y: ty, scale } = transformRef.current;
    return { x: (sx - tx) / scale, y: (sy - ty) / scale };
  };

  const hitTest = (wx: number, wy: number): string | null => {
    let best: { id: string; d: number } | null = null;
    for (const n of simRef.current) {
      const d = Math.hypot(n.x - wx, n.y - wy);
      if (d <= 12 && (!best || d < best.d)) best = { id: n.id, d };
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
    if (hit) setSelectedId(hit);
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
    if (drag.mode === "node" && drag.id) {
      const scale = transformRef.current.scale;
      const node = simRef.current.find((n) => n.id === drag.id);
      if (node) {
        node.x += dx / scale;
        node.y += dy / scale;
        node.vx = 0;
        node.vy = 0;
      }
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
    t.scale = Math.max(0.25, Math.min(3, t.scale * factor));
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
        <label className="proof-graph-check">
          <input
            type="checkbox"
            checked={excludeErdos}
            onChange={(e) => {
              setExcludeErdos(e.target.checked);
              setSelectedId(null);
            }}
          />
          Hide Erdős register ({graph.summary.by_field.erdos ?? 0})
        </label>
      </div>

      <p className="proof-graph-stats mono">
        {visibleNodes.length} nodes · {visibleEdges.length} edges · pan drag background · scroll zoom ·
        click node for drilldown
      </p>

      <div className="proof-graph-legend" aria-label="Section color legend">
        {visibleSections.slice(0, 16).map((s) => (
          <span key={s.label} className="proof-graph-legend-item">
            <span className="proof-graph-legend-swatch" style={{ background: s.color }} />
            {s.label} ({s.count})
          </span>
        ))}
        {visibleSections.length > 16 ? (
          <span className="proof-graph-legend-more">+{visibleSections.length - 16} sections</span>
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
          aria-label="Proof relationship graph"
        />
      </div>

      {selectedNode ? (
        <ProofGraphDrilldown
          graph={graph}
          node={selectedNode}
          onClose={() => setSelectedId(null)}
          onSelectNode={setSelectedId}
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
