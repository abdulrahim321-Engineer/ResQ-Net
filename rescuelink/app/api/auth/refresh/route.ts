import { fail, ok, parseBody, serverError } from "@/lib/http";
import { loadAccount } from "@/lib/auth";
import { toSession } from "@/lib/mappers";
import { refreshSchema } from "@/lib/schemas";
import { newAuthClient } from "@/lib/supabase";

export async function POST(req: Request) {
  const body = await parseBody(req, refreshSchema);
  if ("response" in body) return body.response;

  try {
    const { data, error } = await newAuthClient().auth.refreshSession({
      refresh_token: body.data.refresh_token,
    });
    if (error || !data.session || !data.user) return fail(401, "Invalid or expired refresh token");

    const account = await loadAccount(data.user.id);
    if (!account) return fail(403, "This login has no RescueLink account");

    return ok(toSession(data.session, account, data.user.email ?? ""));
  } catch (err) {
    return serverError("refresh", err);
  }
}
