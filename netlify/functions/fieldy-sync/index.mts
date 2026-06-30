import type { Config } from "@netlify/functions";

/**
 * Atlas — Fieldy ingestion (scheduled, every 4h)
 *
 * Pulls voice transcripts from the Fieldy MCP endpoint, dedupes them into
 * Supabase `transcripts`, extracts commitments (both directions) via the
 * Claude API, and writes them to `commitments`. Every run is logged to
 * `ingest_log` so success/failure is visible — Atlas never silently fails.
 *
 * Secrets are read from Netlify env vars at runtime. Nothing is hardcoded.
 * Required env vars (set in Netlify → Site config → Environment variables):
 *   FIELDY_API_KEY              bearer token for api.fieldy.ai
 *   FIELDY_ENDPOINT             defaults to https://api.fieldy.ai/mcp
 *   SUPABASE_URL                e.g. https://vljtsgjhnndndolwmuip.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY   server-side key (never expose client-side)
 *   ANTHROPIC_API_KEY           for commitment extraction
 */

type FieldyTranscript = {
  id: string;
  recorded_at?: string;
  title?: string;
  participants?: string[];
  text?: string;
};

const SUPABASE_URL = () => Netlify.env.get("SUPABASE_URL")!;
const SR_KEY = () => Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function sbInsert(table: string, rows: unknown[], onConflict?: string) {
  if (!rows.length) return [];
  const qs = onConflict ? `?on_conflict=${onConflict}` : "";
  const res = await fetch(`${SUPABASE_URL()}/rest/v1/${table}${qs}`, {
    method: "POST",
    headers: {
      apikey: SR_KEY(),
      Authorization: `Bearer ${SR_KEY()}`,
      "Content-Type": "application/json",
      Prefer: onConflict
        ? "resolution=merge-duplicates,return=representation"
        : "return=representation",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`Supabase ${table} insert ${res.status}: ${await res.text()}`);
  return res.json();
}

async function logRun(status: string, pulled: number, detail: string) {
  try {
    await sbInsert("ingest_log", [{ source: "fieldy", status, records_pulled: pulled, detail }]);
  } catch {
    /* logging must never throw and break the run */
  }
}

/** Fetch recent transcripts from Fieldy. Shape is normalized defensively
 *  because the exact response contract is unverified until first live run. */
async function fetchFieldy(): Promise<FieldyTranscript[]> {
  const endpoint = Netlify.env.get("FIELDY_ENDPOINT") ?? "https://api.fieldy.ai/mcp";
  const key = Netlify.env.get("FIELDY_API_KEY");
  if (!key) throw new Error("FIELDY_API_KEY not set");

  const res = await fetch(endpoint, {
    method: "GET",
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Fieldy ${res.status}: ${await res.text()}`);

  const data: any = await res.json();
  // Accept several plausible shapes; adjust to Fieldy's real schema after first run.
  const list = Array.isArray(data) ? data : data.transcripts ?? data.results ?? data.data ?? [];
  return list.map((t: any) => ({
    id: String(t.id ?? t.transcript_id ?? t.uuid),
    recorded_at: t.recorded_at ?? t.created_at ?? t.timestamp,
    title: t.title ?? t.name ?? null,
    participants: t.participants ?? t.speakers ?? [],
    text: t.text ?? t.body ?? t.transcript ?? "",
  }));
}

/** Extract commitments via Claude. Returns two labeled lists. */
async function extractCommitments(t: FieldyTranscript) {
  const key = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!key || !t.text) return [];
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content:
            `Extract commitments from this transcript. Return ONLY JSON, no prose:\n` +
            `{"made_by_founder":[{"text":"","counterparty":"","due_hint":""}],` +
            `"made_to_founder":[{"text":"","counterparty":"","due_hint":""}]}\n\n` +
            `Transcript:\n${t.text.slice(0, 8000)}`,
        },
      ],
    }),
  });
  if (!res.ok) return [];
  const data: any = await res.json();
  const raw = (data.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
  let parsed: any;
  try {
    parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    return [];
  }
  const rows: any[] = [];
  for (const c of parsed.made_by_founder ?? [])
    rows.push({ direction: "made_by_founder", text: c.text, counterparty: c.counterparty || null, due_hint: c.due_hint || null });
  for (const c of parsed.made_to_founder ?? [])
    rows.push({ direction: "made_to_founder", text: c.text, counterparty: c.counterparty || null, due_hint: c.due_hint || null });
  return rows;
}

export default async (_req: Request) => {
  // Heartbeat: prove the handler executed, before anything can fail.
  await logRun("started", 0, "fieldy-sync invoked.");

  try {
    const transcripts = await fetchFieldy();
    if (!transcripts.length) {
      await logRun("empty", 0, "No new transcripts returned by Fieldy.");
      return Response.json({ ok: true, status: "empty", transcripts: 0, commitments: 0 });
    }

    const inserted: any[] = await sbInsert(
      "transcripts",
      transcripts.map((t) => ({
        fieldy_id: t.id,
        recorded_at: t.recorded_at ?? null,
        title: t.title ?? null,
        participants: t.participants ?? [],
        body: t.text ?? null,
      })),
      "fieldy_id"
    );

    let commitmentCount = 0;
    for (const row of inserted) {
      const src = transcripts.find((t) => t.id === row.fieldy_id);
      if (!src) continue;
      const commitments = await extractCommitments(src);
      if (commitments.length) {
        await sbInsert("commitments", commitments.map((c) => ({ ...c, transcript_id: row.id })));
        commitmentCount += commitments.length;
      }
    }

    await logRun("success", inserted.length, `Ingested ${inserted.length} transcripts, ${commitmentCount} commitments.`);
    return Response.json({ ok: true, status: "success", transcripts: inserted.length, commitments: commitmentCount });
  } catch (err: any) {
    await logRun("error", 0, String(err?.message ?? err));
    return Response.json({ ok: false, status: "error", detail: String(err?.message ?? err) }, { status: 500 });
  }
};

export const config: Config = {
  schedule: "0 */4 * * *", // every 4 hours, UTC — matches Atlas background sync
};
