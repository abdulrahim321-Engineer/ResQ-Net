import { fail, ok, parseBody, serverError } from "@/lib/http";
import { loadAccount } from "@/lib/auth";
import { toSession } from "@/lib/mappers";
import { loginSchema } from "@/lib/schemas";
import { newAuthClient } from "@/lib/supabase";

export async function POST(req: Request) {
  const body = await parseBody(req, loginSchema);
  if ("response" in body) return body.response;
  const { email, password } = body.data;

  try {
    const { data, error } = await newAuthClient().auth.signInWithPassword({ email, password });
    if (error || !data.session || !data.user) return fail(401, "Invalid email or password");

    const account = await loadAccount(data.user.id);
    if (!account) return fail(403, "This login has no RescueLink account");

    return ok(toSession(data.session, account, data.user.email ?? email));
  } catch (err) {
    return serverError("login", err);
  }
}
