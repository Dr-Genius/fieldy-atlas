import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Toggle an action item's status between 'open' and 'done'.
// Server-side only — the service-role key never reaches the browser.
export async function POST(req: Request) {
  const sb = getSupabase();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "No database connection" }, { status: 200 });
  }

  let body: { id?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  if (!body.id) {
    return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
  }

  const nextStatus = body.status === "done" ? "done" : "open";

  try {
    const { data, error } = await sb
      .from("action_items")
      .update({ status: nextStatus })
      .eq("id", body.id)
      .select("id,status")
      .single();

    if (error) throw error;
    return NextResponse.json({ ok: true, id: data.id, status: data.status });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message ?? err) }, { status: 200 });
  }
}
