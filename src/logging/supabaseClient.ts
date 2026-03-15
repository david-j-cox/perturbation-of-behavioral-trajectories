import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (client) return client;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.warn('Supabase credentials not configured. Running in offline mode.');
    return null;
  }

  client = createClient(url, key);
  return client;
}

export function isOnline(): boolean {
  return getSupabaseClient() !== null;
}
