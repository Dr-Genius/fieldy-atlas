import { createClient } from "@supabase/supabase-js";

// Server-side Supabase client. Uses service-role key (server only — never shipped to client).
// Falls back gracefully: if env vars are missing, callers return demo data instead of crashing.
export function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export const hasSupabase = () =>
  Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
