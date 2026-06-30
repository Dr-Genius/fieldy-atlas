import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Node = { id: string; name: string; type: string; mention_count: number; last_seen_at: string | null; emails: string[] };
type Edge = { source: string; target: string; edge_type: string; weight: number; confidence: number };

const companyId = (c: string) => "company-" + c.toLowerCase().replace(/[^a-z0-9]+/g, "-");

function demoGraph() {
  return {
    source: "demo",
    last_synced_at: null,
    nodes: [
      { id: "d1", name: "You", type: "Person", mention_count: 9, last_seen_at: null, emails: [] },
      { id: "d2", name: "Acme Co", type: "Company", mention_count: 4, last_seen_at: null, emails: [] },
      { id: "d3", name: "Kickoff", type: "Event", mention_count: 1, last_seen_at: null, emails: [] },
      { id: "d4", name: "Intro email", type: "Email", mention_count: 1, last_seen_at: null, emails: [] },
    ] as Node[],
    edges: [
      { source: "d1", target: "d2", edge_type: "linked_to", weight: 2, confidence: 0.8 },
      { source: "d1", target: "d3", edge_type: "attended_with", weight: 1, confidence: 1 },
      { source: "d1", target: "d4", edge_type: "emailed_with", weight: 1, confidence: 0.8 },
    ] as Edge[],
  };
}

export async function GET() {
  const sb = getSupabase();
  if (!sb) return NextResponse.json(demoGraph());

  try {
    const [contacts, emails, events, commitments] = await Promise.all([
      sb.from("contacts").select("id,name,title,company,tier"),
      sb.from("emails").select("id,sender,subject,category"),
      sb.from("calendar_events").select("id,summary,is_external"),
      sb.from("commitments").select("id,direction,text,counterparty"),
    ]);

    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const seenCompany = new Set<string>();

    nodes.push({ id: "founder-lester", name: "Lester", type: "Person", mention_count: 99, last_seen_at: null, emails: ["atokwales@gmail.com"] });

    (contacts.data ?? []).forEach((c: any) => {
      nodes.push({ id: "person-" + c.id, name: c.name, type: "Person", mention_count: c.tier === 1 ? 10 : 3, last_seen_at: null, emails: [] });
      edges.push({ source: "founder-lester", target: "person-" + c.id, edge_type: "emailed_with", weight: 3, confidence: 0.7 });
      if (c.company && !seenCompany.has(c.company)) {
        seenCompany.add(c.company);
        nodes.push({ id: companyId(c.company), name: c.company, type: "Company", mention_count: 5, last_seen_at: null, emails: [] });
      }
      if (c.company) edges.push({ source: "person-" + c.id, target: companyId(c.company), edge_type: "linked_to", weight: 2, confidence: 0.9 });
    });

    (emails.data ?? []).forEach((e: any) => {
      nodes.push({ id: "email-" + e.id, name: (e.subject || "email").slice(0, 32), type: "Email", mention_count: 1, last_seen_at: null, emails: [e.sender] });
      edges.push({ source: "founder-lester", target: "email-" + e.id, edge_type: "emailed_with", weight: 1, confidence: 0.8 });
    });

    (events.data ?? []).forEach((ev: any) => {
      nodes.push({ id: "event-" + ev.id, name: (ev.summary || "event").slice(0, 28), type: "Event", mention_count: 1, last_seen_at: null, emails: [] });
      edges.push({ source: "founder-lester", target: "event-" + ev.id, edge_type: "attended_with", weight: 1, confidence: 1 });
    });

    // Commitments → Deal/edges when Fieldy data exists
    (commitments.data ?? []).forEach((cm: any) => {
      const id = "commit-" + cm.id;
      nodes.push({ id, name: (cm.text || "commitment").slice(0, 30), type: "Deal", mention_count: 1, last_seen_at: null, emails: [] });
      edges.push({ source: "founder-lester", target: id, edge_type: cm.direction === "made_by_founder" ? "committed_to" : "delegated_to", weight: 2, confidence: 0.8 });
    });

    // If only the founder node exists (empty DB), return demo so the graph still renders
    if (nodes.length <= 1) return NextResponse.json(demoGraph());

    return NextResponse.json({ source: "live", nodes, edges, last_synced_at: new Date().toISOString() });
  } catch (err: any) {
    return NextResponse.json({ ...demoGraph(), source: "error", detail: String(err?.message ?? err) });
  }
}
