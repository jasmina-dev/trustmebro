import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

/** Browser client for read-only chart data (use anon key + RLS or RPC grants). */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url?.trim() || !anon?.trim()) {
    client = null;
    return null;
  }
  client = createClient(url.trim(), anon.trim());
  return client;
}

export function isSupabaseChartsConfigured(): boolean {
  return getSupabaseBrowserClient() != null;
}
