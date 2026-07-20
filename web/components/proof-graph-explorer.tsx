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
  DEFAULT_EDGE_LAYERS,
  EDGE_KIND_LABELS,
  EDGE_LAYER_LABELS,
  edgeLayer,
  type ProofGraph,
  type ProofGraphEdge,
  type ProofGraphNode,
  type ProofGraphSectionFrame,
} from "@/lib/proof-graph-types";
import {
  aggregateSectionEdges,
  isHonestDischarge,
  nodeDisplayName,
  searchGraphNodes,
  sectionDisplayName,
} from "@/lib/proof-graph-utils";

type DrawNode = ProofGraphNode & { x: number; y: number };
type ViewMode = "corpus" | "proofs";

const DEFAULT_EXCLUDE_FIELDS = new Set(["erdos"]);

type ProofGraphExplorerProps = {
  graph: ProofGraph;
};

function filterNodes(
  graph: ProofGraph,
  fieldFilter: string,
  statusFilter: string,
  excludeErdos: boolean,
  sectionFilter: string | null,
  dischargedOnly: boolean,
): ProofGraphNode[] {
  return graph.nodes.filter((n) => {
    if (excludeErdos && n.field === "erdos") return false;
    if (fieldFilter && n.field !== fieldFilter) return false;
    if (statusFilter && (n.proof_status ?? "") !== statusFilter) return false;
    if (sectionFilter && n.section_key !== sectionFilter) return false;
    if (dischargedOnly && !isHonestDischarge(n)) return false;
    return true;
  });
}

function filterEdges(
  nodes: ProofGraphNode[],
  edges: ProofGraphEdge[],
  enabledLayers: Set<string>,
  crossSectionOnly: boolean,
): ProofGraphEdge[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const ids = new Set(byId.keys());
  return edges.filter((e) => {
    if (!ids.has(e.source) || !ids.has(e.target)) return false;
    const layer = edgeLayer(e);
    if (!enabledLayers.has(layer)) return false;
    if (crossSectionOnly) {
      const a = byId.get(e.source);
      const b = byId.get(e.target);
      if (!a || !b || a.section_key === b.section_key) return false;
    }
    return true;
  });
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

function sectionRadius(count: number): number {
  return Math.min(72, Math.max(28, 16 + Math.sqrt(count) * 5));
}

export function ProofGraphExplorer({ graph }: ProofGraphExplorerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<DrawNode[]>([]);
  const edgesRef = useRef<ProofGraphEdge[]>([]);
  const transformRef = useRef<GraphTransform>({ x: 0, y: 0, scale: 1 });
  const dragRef = useRef<{ mode: "pan" | "node" | "section" | null; id?: string; lastX: number; lastY: number }>({
    mode: null,
    lastX: 0,
    lastY: 0,
  });
  const fitPendingRef = useRef(true);
  const hoverRef = useRef<{ kind: "node" | "section" | null; id?: string }>({ kind: null });

  const [viewMode, setViewMode] = useState<ViewMode>("corpus");
  const [fieldFilter, setFieldFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [excludeErdos, setExcludeErdos] = useState(true);
  const [dischargedOnly, setDischargedOnly] = useState(true);
  const [crossSectionOnly, setCrossSectionOnly] = useState(false);
  const [enabledLayers, setEnabledLayers] = useState<Set<string>>(
    () => new Set(DEFAULT_EDGE_LAYERS),
  );
  const [sectionFilter, setSectionFilter] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [hoverCursor, setHoverCursor] = useState<"default" | "pointer" | "grab" | "grabbing">("grab");
  const [size, setSize] = useState({ w: 900, h: 560 });

  const precomputed = graphHasPrecomputedLayout(graph);
  const knownNodeIds = useMemo(() => new Set(graph.nodes.map((n) => n.id)), [graph.nodes]);

  const fields = useMemo(
    () => [...new Set(graph.nodes.map((n) => n.field))].filter(Boolean).sort(),
    [graph.nodes],
  );
  const statuses = useMemo(
    () => [...new Set(graph.nodes.map((n) => n.proof_status).filter(Boolean) as string[])].sort(),
    [graph.nodes],
  );

  const sectionFrames = useMemo(() => {
    let frames = graph.layout?.section_frames ?? [];
    if (fieldFilter) frames = frames.filter((f) => f.field === fieldFilter);
    if (excludeErdos) frames = frames.filter((f) => f.field !== "erdos");
    return frames;
  }, [graph.layout?.section_frames, fieldFilter, excludeErdos]);

  const visibleNodes = useMemo(
    () => filterNodes(graph, fieldFilter, statusFilter, excludeErdos, sectionFilter, dischargedOnly),
    [graph, fieldFilter, statusFilter, excludeErdos, sectionFilter, dischargedOnly],
  );
  const visibleEdges = useMemo(
    () => filterEdges(visibleNodes, graph.edges, enabledLayers, crossSectionOnly),
    [visibleNodes, graph.edges, enabledLayers, crossSectionOnly],
  );
  const sectionEdges = useMemo(() => {
    const layered = filterEdges(graph.nodes, graph.edges, enabledLayers, crossSectionOnly);
    return aggregateSectionEdges({ ...graph, edges: layered });
  }, [graph, enabledLayers, crossSectionOnly]);

  const toggleLayer = useCallback((layer: string) => {
    setEnabledLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  }, []);

  const searchMatches = useMemo(
    () =>
      searchGraphNodes(
        filterNodes(graph, fieldFilter, statusFilter, excludeErdos, null, dischargedOnly),
        searchQuery,
        16,
      ),
    [graph, fieldFilter, statusFilter, excludeErdos, dischargedOnly, searchQuery],
  );

  const selectedNode = useMemo(
    () => (selectedId ? graph.nodes.find((n) => n.id === selectedId) ?? null : null),
    [graph.nodes, selectedId],
  );

  const applyFit = useCallback(
    (bounds: { x: number; y: number; width: number; height: number } | null, viewW: number, viewH: number) => {
      if (!bounds) return;
      transformRef.current = fitTransform(bounds, viewW, viewH, 40, viewMode === "corpus" ? 1.2 : 4);
      fitPendingRef.current = false;
    },
    [viewMode],
  );

  const fitCorpus = useCallback(() => {
    const bounds = defaultGraphBounds(graph);
    if (bounds) applyFit(bounds, size.w, size.h);
    setActiveSection(null);
    setSectionFilter(null);
    drawRef.current?.();
  }, [applyFit, graph, size.w, size.h]);

  const flyToNode = useCallback(
    (id: string) => {
      setViewMode("proofs");
      setSectionFilter(null);
      const node = graph.nodes.find((n) => n.id === id);
      if (!node) return;
      nodesRef.current = withLayout(
        filterNodes(graph, fieldFilter, statusFilter, excludeErdos, null, dischargedOnly),
        graph.layout?.width ?? size.w,
        graph.layout?.height ?? size.h,
      );
      const placed = nodesRef.current.find((n) => n.id === id);
      if (placed) {
        const t = focusNodeTransform(placed, size.w, size.h, 1.5);
        if (t) transformRef.current = t;
      }
      setSelectedId(id);
      setActiveSection(node.section_key);
      drawRef.current?.();
    },
    [graph, fieldFilter, statusFilter, excludeErdos, dischargedOnly, size.w, size.h],
  );

  const flyToSection = useCallback(
    (frame: ProofGraphSectionFrame) => {
      setViewMode("proofs");
      setSectionFilter(frame.section_key);
      setActiveSection(frame.section_key);
      setSelectedId(null);
      fitPendingRef.current = true;
      drawRef.current?.();
    },
    [],
  );

  const drawRef = useRef<(() => void) | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
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

    if (viewMode === "corpus") {
      const frameIds = new Set(sectionFrames.map((f) => f.section_key));
      const secEdges = sectionEdges.filter(
        (e) => frameIds.has(e.source) && frameIds.has(e.target),
      );
      const frameByKey = new Map(sectionFrames.map((f) => [f.section_key, f]));

      for (const e of secEdges) {
        const a = frameByKey.get(e.source);
        const b = frameByKey.get(e.target);
        if (!a || !b) continue;
        ctx.strokeStyle = "rgba(88, 166, 255, 0.15)";
        ctx.lineWidth = Math.min(3, 0.5 + e.weight / 8) / scale;
        ctx.beginPath();
        ctx.moveTo(a.cx, a.cy);
        ctx.lineTo(b.cx, b.cy);
        ctx.stroke();
      }

      for (const frame of sectionFrames) {
        const r = sectionRadius(frame.count);
        const isActive = activeSection === frame.section_key;
        const isHover = hoverRef.current.kind === "section" && hoverRef.current.id === frame.section_key;
        ctx.beginPath();
        ctx.fillStyle = frame.color + (isActive || isHover ? "ee" : "99");
        ctx.arc(frame.cx, frame.cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = isActive ? "#e6edf3" : "rgba(48, 54, 61, 0.8)";
        ctx.lineWidth = (isActive ? 2.5 : 1) / scale;
        ctx.stroke();

        const label = frame.label ?? sectionDisplayName(frame.section_key);
        ctx.fillStyle = "#e6edf3";
        ctx.font = `600 ${Math.max(11, 13 / scale)}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(label, frame.cx, frame.cy - 4 / scale);
        ctx.fillStyle = "rgba(139, 148, 158, 0.95)";
        ctx.font = `${Math.max(9, 11 / scale)}px system-ui, sans-serif`;
        ctx.fillText(`${frame.count} proofs`, frame.cx, frame.cy + 12 / scale);
        ctx.textAlign = "left";
      }
    } else {
      const sim = nodesRef.current;
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
        const isSel = selectedId === n.id;
        const isHover = hoverRef.current.kind === "node" && hoverRef.current.id === n.id;
        const r = (isSel || isHover ? 10 : 7) / scale;
        ctx.beginPath();
        ctx.fillStyle = n.color;
        ctx.arc(n.x, n.y, Math.max(r, 3), 0, Math.PI * 2);
        ctx.fill();
        if (isSel || isHover) {
          ctx.strokeStyle = "#e6edf3";
          ctx.lineWidth = 2 / scale;
          ctx.stroke();
        }
        if (scale > 0.55 || isSel || isHover) {
          const label = nodeDisplayName(n);
          const short = label.length > 42 ? `${label.slice(0, 39)}…` : label;
          ctx.fillStyle = "#e6edf3";
          ctx.font = `${Math.max(9, 10 / scale)}px system-ui, sans-serif`;
          ctx.fillText(short, n.x + 10 / scale, n.y + 3 / scale);
        }
      }
    }

    ctx.restore();
  }, [size.w, size.h, selectedId, viewMode, sectionFrames, sectionEdges, activeSection]);

  drawRef.current = draw;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: Math.max(480, Math.min(window.innerHeight * 0.72, 820)) });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: Math.max(480, Math.min(window.innerHeight * 0.72, 820)) });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (viewMode === "corpus") {
      nodesRef.current = [];
      edgesRef.current = [];
      fitPendingRef.current = true;
      return;
    }
    nodesRef.current = withLayout(visibleNodes, graph.layout?.width ?? size.w, graph.layout?.height ?? size.h);
    edgesRef.current = visibleEdges;
    fitPendingRef.current = true;
  }, [visibleNodes, visibleEdges, graph.layout?.width, graph.layout?.height, size.w, size.h, viewMode]);

  useEffect(() => {
    if (!fitPendingRef.current) {
      draw();
      return;
    }
    if (viewMode === "corpus") {
      applyFit(defaultGraphBounds(graph), size.w, size.h);
    } else if (nodesRef.current.length) {
      applyFit(boundsForNodes(nodesRef.current) ?? defaultGraphBounds(graph), size.w, size.h);
    }
    draw();
  }, [applyFit, draw, size.w, size.h, visibleNodes, visibleEdges, viewMode, graph, sectionFrames]);

  const screenToWorld = (sx: number, sy: number) => {
    const { x: tx, y: ty, scale } = transformRef.current;
    return { x: (sx - tx) / scale, y: (sy - ty) / scale };
  };

  const hitTestSection = (wx: number, wy: number): string | null => {
    let best: { id: string; d: number } | null = null;
    for (const frame of sectionFrames) {
      const r = sectionRadius(frame.count);
      const d = Math.hypot(frame.cx - wx, frame.cy - wy);
      if (d <= r && (!best || d < best.d)) best = { id: frame.section_key, d };
    }
    return best?.id ?? null;
  };

  const hitTestNode = (wx: number, wy: number): string | null => {
    const scale = transformRef.current.scale;
    const hitR = 14 / scale;
    let best: { id: string; d: number } | null = null;
    for (const n of nodesRef.current) {
      const d = Math.hypot(n.x - wx, n.y - wy);
      if (d <= hitR && (!best || d < best.d)) best = { id: n.id, d };
    }
    return best?.id ?? null;
  };

  const updateHover = (sx: number, sy: number) => {
    const { x, y } = screenToWorld(sx, sy);
    if (viewMode === "corpus") {
      const sec = hitTestSection(x, y);
      hoverRef.current = sec ? { kind: "section", id: sec } : { kind: null };
      setHoverCursor(sec ? "pointer" : dragRef.current.mode === "pan" ? "grabbing" : "grab");
    } else {
      const node = hitTestNode(x, y);
      hoverRef.current = node ? { kind: "node", id: node } : { kind: null };
      setHoverCursor(node ? "pointer" : dragRef.current.mode === "pan" ? "grabbing" : "grab");
    }
    draw();
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { x, y } = screenToWorld(sx, sy);

    if (viewMode === "corpus") {
      const sec = hitTestSection(x, y);
      if (sec) {
        const frame = sectionFrames.find((f) => f.section_key === sec);
        if (frame) flyToSection(frame);
        return;
      }
    } else {
      const hit = hitTestNode(x, y);
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
      return;
    }

    dragRef.current = { mode: "pan", lastX: e.clientX, lastY: e.clientY };
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const drag = dragRef.current;

    if (!drag.mode) {
      updateHover(sx, sy);
      return;
    }

    const dx = e.clientX - drag.lastX;
    const dy = e.clientY - drag.lastY;
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
    if (drag.mode === "pan") {
      transformRef.current.x += dx;
      transformRef.current.y += dy;
      setHoverCursor("grabbing");
      draw();
    }
  };

  const onPointerUp = () => {
    dragRef.current.mode = null;
    setHoverCursor("grab");
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
    t.scale = Math.max(0.04, Math.min(6, t.scale * factor));
    t.x = sx - wx * t.scale;
    t.y = sy - wy * t.scale;
    draw();
  };

  return (
    <div className="proof-graph-explorer">
      <div className="proof-graph-toolbar">
        <label>
          View
          <select
            className="erdos-explorer-select"
            value={viewMode}
            onChange={(e) => {
              const mode = e.target.value as ViewMode;
              setViewMode(mode);
              setSelectedId(null);
              if (mode === "corpus") setSectionFilter(null);
              fitPendingRef.current = true;
            }}
          >
            <option value="corpus">Corpus map (sections)</option>
            <option value="proofs">Proof detail (nodes)</option>
          </select>
        </label>
        <label>
          Domain
          <select
            className="erdos-explorer-select"
            value={fieldFilter}
            onChange={(e) => {
              setFieldFilter(e.target.value);
              setSelectedId(null);
              setActiveSection(null);
              setSectionFilter(null);
              fitPendingRef.current = true;
            }}
          >
            <option value="">All domains</option>
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
          Search corpus
          <input
            className="proof-graph-search"
            type="search"
            placeholder="Plain language, statement, ID, theorem…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && searchMatches[0]) flyToNode(searchMatches[0].node.id);
            }}
          />
        </label>
        <button type="button" className="proof-graph-nav-btn" onClick={fitCorpus}>
          Fit whole corpus
        </button>
        {sectionFilter ? (
          <button
            type="button"
            className="proof-graph-nav-btn"
            onClick={() => {
              setSectionFilter(null);
              setViewMode("corpus");
              fitPendingRef.current = true;
            }}
          >
            ← Back to map
          </button>
        ) : null}
        <label className="proof-graph-check">
          <input
            type="checkbox"
            checked={dischargedOnly}
            onChange={(e) => {
              setDischargedOnly(e.target.checked);
              setSelectedId(null);
              fitPendingRef.current = true;
            }}
          />
          Discharged only
        </label>
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
        <label className="proof-graph-check">
          <input
            type="checkbox"
            checked={crossSectionOnly}
            onChange={(e) => setCrossSectionOnly(e.target.checked)}
          />
          Cross-section bridges only
        </label>
      </div>

      <div className="proof-graph-toolbar proof-graph-layer-toggles">
        <span className="proof-graph-layer-label mono">Layers</span>
        {Object.entries(EDGE_LAYER_LABELS).map(([layer, label]) => (
          <label key={layer} className="proof-graph-check">
            <input
              type="checkbox"
              checked={enabledLayers.has(layer)}
              onChange={() => toggleLayer(layer)}
            />
            {label}
            {graph.summary.by_layer?.[layer] != null
              ? ` (${graph.summary.by_layer[layer]})`
              : ""}
          </label>
        ))}
        <button
          type="button"
          className="proof-graph-chip"
          onClick={() => setEnabledLayers(new Set(DEFAULT_EDGE_LAYERS))}
        >
          Discover (L1+L2+L4)
        </button>
        <button
          type="button"
          className="proof-graph-chip"
          onClick={() => setEnabledLayers(new Set(Object.keys(EDGE_LAYER_LABELS)))}
        >
          All layers
        </button>
      </div>

      {graph.discharge_stats ? (
        <p className="proof-graph-discharge-banner">
          <strong>
            {graph.discharge_stats.real_discharged} discharged
          </strong>
          {" / "}
          {graph.discharge_stats.catalog_total} catalog
          {" · "}
          {graph.discharge_stats.target} open targets
          {graph.discharge_stats.stub_proved > 0 ? (
            <span className="proof-graph-discharge-warn">
              {" "}
              · {graph.discharge_stats.stub_proved} stub proved
            </span>
          ) : null}
        </p>
      ) : null}

      {graph.hub_bridge ? (
        <p className="proof-graph-discharge-banner">
          <strong>{graph.hub_bridge.cross_section_bridge_count ?? 0}</strong>
          {" cross-section bridges"}
          {graph.hub_bridge.l1_in_degree_hubs?.[0] ? (
            <span>
              {" · top L1 hub "}
              <button
                type="button"
                className="proof-graph-chip"
                onClick={() => flyToNode(graph.hub_bridge!.l1_in_degree_hubs![0].id)}
              >
                {graph.hub_bridge.l1_in_degree_hubs[0].id}
              </button>
            </span>
          ) : null}
        </p>
      ) : null}

      {searchQuery.trim() ? (
        <ul className="proof-graph-search-results">
          {searchMatches.length === 0 ? (
            <li className="proof-graph-empty">No matches for “{searchQuery.trim()}”.</li>
          ) : (
            searchMatches.map(({ node }) => (
              <li key={node.id}>
                <button type="button" className="proof-graph-search-hit" onClick={() => flyToNode(node.id)}>
                  <strong>{nodeDisplayName(node)}</strong>
                  <span>
                    {node.id} · {sectionDisplayName(node.section_key)}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}

      <p className="proof-graph-stats">
        {viewMode === "corpus"
          ? `${sectionFrames.length} sections · ${visibleNodes.length} proofs in filter`
          : `${visibleNodes.length} nodes · ${visibleEdges.length} edges`}
        {" · "}
        {precomputed ? "stable layout" : "fallback layout"}
        {sectionFilter ? ` · zoomed: ${sectionDisplayName(sectionFilter)}` : null}
      </p>

      <div className="proof-graph-edge-legend mono">
        {viewMode === "corpus" ? (
          <span>Click a section bubble to drill into proofs · scroll to zoom · drag to pan</span>
        ) : (
          Object.entries(EDGE_KIND_LABELS).map(([k, v]) => <span key={k}>{v}</span>)
        )}
      </div>

      <div ref={containerRef} className="proof-graph-canvas-wrap proof-graph-canvas-wrap-tall">
        <canvas
          ref={canvasRef}
          className="proof-graph-canvas"
          style={{ cursor: hoverCursor }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => {
            onPointerUp();
            hoverRef.current = { kind: null };
            setHoverCursor("grab");
            draw();
          }}
          onWheel={onWheel}
          role="img"
          aria-label="Proof relationship graph"
        />
      </div>

      {selectedNode ? (
        <ProofGraphDrilldown
          graph={graph}
          node={selectedNode}
          knownNodeIds={knownNodeIds}
          onClose={() => setSelectedId(null)}
          onSelectNode={flyToNode}
          explainLlmUrl={graph.explain_llm_hook}
        />
      ) : null}
    </div>
  );
}

export { DEFAULT_EXCLUDE_FIELDS };
