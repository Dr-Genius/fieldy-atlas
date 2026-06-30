"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

// react-force-graph-2d touches window — load client-only to avoid SSR errors.
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

const NODE_COLORS: Record<string, string> = {
  Person: "#d9a24a", Company: "#4a78d9", Event: "#52b788",
  Email: "#e5544b", Document: "#9b7ede", Deal: "#e09f3e",
};
const EDGE_COLORS: Record<string, string> = {
  attended_with: "#52b788", emailed_with: "#e5544b", committed_to: "#d9a24a",
  reported_by: "#4a78d9", linked_to: "#5e6a82", discussed_with: "#9b7ede", delegated_to: "#e09f3e",
};
const TYPES = ["All", "Person", "Company", "Event", "Email", "Deal"];

export default function KnowledgeGraph() {
  const [data, setData] = useState<{ nodes: any[]; links: any[] }>({ nodes: [], links: [] });
  const [source, setSource] = useState("loading");
  const [filter, setFilter] = useState("All");
  const [selected, setSelected] = useState<any>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 600, h: 460 });

  useEffect(() => {
    fetch("/api/graph")
      .then((r) => r.json())
      .then((g) => {
        setSource(g.source || "live");
        setData({ nodes: g.nodes || [], links: (g.edges || []).map((e: any) => ({ ...e })) });
      })
      .catch(() => setSource("error"));
  }, []);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(() => {
      const r = wrapRef.current!.getBoundingClientRect();
      setDims({ w: r.width, h: 460 });
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const nodes = filter === "All" ? data.nodes : data.nodes.filter((n) => n.type === filter || n.id === "founder-lester");
  const ids = new Set(nodes.map((n) => n.id));
  const links = data.links.filter((l) => ids.has(l.source.id ?? l.source) && ids.has(l.target.id ?? l.target));

  const rels = selected
    ? data.links.filter((l) => (l.source.id ?? l.source) === selected.id || (l.target.id ?? l.target) === selected.id)
    : [];

  return (
    <div className="graph-card">
      <div className="graph-head">
        <div>
          <h2>Relationship map</h2>
          <div className="meta">{data.nodes.length} nodes · {data.links.length} relationships</div>
        </div>
        <span className={"tag " + (source === "live" ? "live" : "stub")}>{source}</span>
      </div>

      <div className="graph-filters">
        {TYPES.filter((t) => t === "All" || data.nodes.some((n) => n.type === t)).map((t) => (
          <button key={t} onClick={() => setFilter(t)}
            style={{ color: t === "All" ? "#e8ecf4" : NODE_COLORS[t], background: filter === t ? "rgba(217,162,74,.15)" : "transparent" }}>
            {t}
          </button>
        ))}
      </div>

      <div className="graph-body">
        <div className="graph-canvas-wrap" ref={wrapRef}>
          <ForceGraph2D
            graphData={{ nodes, links }}
            width={dims.w}
            height={dims.h}
            backgroundColor="rgba(0,0,0,0)"
            nodeColor={(n: any) => NODE_COLORS[n.type] || "#888"}
            nodeLabel={(n: any) => `${n.name} (${n.type})`}
            nodeRelSize={6}
            linkColor={(l: any) => EDGE_COLORS[l.edge_type] || "#333"}
            linkWidth={1.2}
            linkDirectionalParticles={0}
            onNodeClick={(n: any) => setSelected(n)}
            nodeCanvasObjectMode={() => "after"}
            nodeCanvasObject={(node: any, ctx: any, scale: number) => {
              const label = node.name;
              ctx.font = `${11 / scale}px Inter, sans-serif`;
              ctx.fillStyle = "#e8ecf4";
              ctx.fillText(label, node.x + 8 / scale, node.y + 3 / scale);
            }}
          />
        </div>
        <div className="graph-inspector">
          {selected ? (
            <>
              <div className="insp-name">{selected.name}</div>
              <div className="meta" style={{ color: NODE_COLORS[selected.type] }}>{selected.type}</div>
              <div className="insp-count">{rels.length} relationships</div>
              {rels.map((l, i) => {
                const otherId = (l.source.id ?? l.source) === selected.id ? (l.target.id ?? l.target) : (l.source.id ?? l.source);
                const on = data.nodes.find((n) => n.id === otherId);
                if (!on) return null;
                return (
                  <div className="insp-rel" key={i}>
                    <span className="insp-dot" style={{ background: EDGE_COLORS[l.edge_type] || "#666" }} />
                    <div><b>{on.name}</b><div className="insp-edge">{l.edge_type}</div></div>
                  </div>
                );
              })}
            </>
          ) : (
            <div className="meta">Click a node to inspect its relationships.</div>
          )}
        </div>
      </div>
    </div>
  );
}
