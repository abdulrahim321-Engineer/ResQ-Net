import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only. The secret key bypasses RLS, so this file must never reach client code.
const CLIENT_OPTIONS = {
  auth: { persistSession: false, autoRefreshToken: false },
} as const;

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set");
  return { url, key };
}

let admin: SupabaseClient | undefined;

// Shared admin client for DB reads/writes and auth.admin.* calls. It never signs in a user,
// so no user session is stored on it.
export function getAdmin(): SupabaseClient {
  if (!admin) {
    const { url, key } = config();
    admin = createClient(url, key, CLIENT_OPTIONS);
  }
  return admin;
}

// Fresh client per call, for signInWithPassword / refreshSession. A user session is stored
// only on this instance, so it can never leak into another request.
export function newAuthClient(): SupabaseClient {
  const { url, key } = config();
  return createClient(url, key, CLIENT_OPTIONS);
}
