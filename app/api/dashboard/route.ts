import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic"; // always fresh, never cached at build

export async function GET() {
  const sb = getSupabase();

  // Graceful fallback: no DB creds → demo state, never a 500.
  if (!sb) {
    return NextResponse.json({
      source: "demo",
      founder: { first_name: "Lester", email: "atokwales@gmail.com" },
      events: [], emails: [], risks: [], action_items: [], contacts: [], kpis: [],
      last_synced_at: null,
    });
  }

  try {
    const [founder, events, emails, risks, actions, contacts, kpis] = await Promise.all([
      sb.from("founder").select("first_name,email,role,morning_brief_time,debrief_time").limit(1).single(),
      sb.from("calendar_events").select("summary,description,starts_at,ends_at,is_external").order("starts_at"),
      sb.from("emails").select("sender,subject,category,requires_action,received_at").order("received_at", { ascending: false }),
      sb.from("risks").select("category,severity,text,status").order("severity"),
      sb.from("action_items").select("text,due,priority,status,owner").order("priority"),
      sb.from("contacts").select("name,title,company,tier,last_contact_date,notes").order("tier"),
      sb.from("kpis").select("label,value,source,is_connected"),
    ]);

    return NextResponse.json({
      source: "live",
      founder: founder.data ?? null,
      events: events.data ?? [],
      emails: emails.data ?? [],
      risks: risks.data ?? [],
      action_items: actions.data ?? [],
      contacts: contacts.data ?? [],
      kpis: kpis.data ?? [],
      last_synced_at: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { source: "error", detail: String(err?.message ?? err), events: [], emails: [], risks: [], action_items: [], contacts: [], kpis: [] },
      { status: 200 } // 200 so the UI degrades instead of breaking
    );
  }
}
