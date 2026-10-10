import type { User } from "@supabase/supabase-js";
import { fail } from "./http";
import { getAdmin } from "./supabase";
import type { AccountRow } from "./mappers";
import type { Role } from "./types";

export type AuthContext = { user: User; account: AccountRow };

// Loads the accounts row for a Supabase user id. Null if there is none.
export async function loadAccount(userId: string): Promise<AccountRow | null> {
  const { data, error } = await getAdmin().from("accounts").select("*").eq("id", userId).maybeSingle();
  if (error) throw new Error(`accounts lookup failed: ${error.message}`);
  return (data as AccountRow | null) ?? null;
}

// Reads "Authorization: Bearer <access_token>", verifies it with Supabase, and loads the
// account. Returns null for a missing, invalid, or expired token. Throws on DB errors.
export async function getUser(req: Request): Promise<AuthContext | null> {
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  if (!token) return null;

  const { data, error } = await getAdmin().auth.getUser(token);
  if (error || !data.user) return null;

  const account = await loadAccount(data.user.id);
  if (!account) return null;
  return { user: data.user, account };
}

// For endpoints that work with or without login. A bad token counts as anonymous.
export async function optionalUser(req: Request): Promise<AuthContext | null> {
  try {
    return await getUser(req);
  } catch (err) {
    console.error("optionalUser: auth lookup failed", errorMessage(err));
    return null;
  }
}

// Returns the context when the caller is logged in with one of the roles. Otherwise returns
// a 401 (no/invalid token), 403 (wrong role), or 500 (lookup failed) JSON Response.
export async function requireRole(req: Request, roles: Role[]): Promise<AuthContext | Response> {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return fail(401, "Missing bearer token");

  let ctx: AuthContext | null;
  try {
    ctx = await getUser(req);
  } catch (err) {
    console.error("requireRole: auth lookup failed", errorMessage(err));
    return fail(500, "Auth lookup failed");
  }
  if (!ctx) return fail(401, "Invalid or expired token");
  if (!roles.includes(ctx.account.role)) return fail(403, `Requires role: ${roles.join(" or ")}`);
  return ctx;
}

// Protects /api/admin/*: header x-admin-secret must match ADMIN_SECRET.
export function requireAdmin(req: Request): Response | null {
  const given = req.headers.get("x-admin-secret");
  const expected = process.env.ADMIN_SECRET;
  if (!expected) return fail(500, "ADMIN_SECRET is not configured");
  if (!given || given !== expected) return fail(401, "Invalid admin secret");
  return null;
}

// Logs the message only. Never log tokens or request bodies.
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
