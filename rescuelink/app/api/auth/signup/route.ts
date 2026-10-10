import { fail, ok, parseBody, serverError } from "@/lib/http";
import { toSession, type AccountRow } from "@/lib/mappers";
import { signupSchema } from "@/lib/schemas";
import { getAdmin, newAuthClient } from "@/lib/supabase";

export async function POST(req: Request) {
  const body = await parseBody(req, signupSchema);
  if ("response" in body) return body.response;
  const { email, password, role, display_name, phone } = body.data;

  try {
    const admin = getAdmin();

    // 1. Create the Supabase Auth user, already confirmed. The role goes into app_metadata too.
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role },
    });
    if (createErr) {
      if (createErr.code === "email_exists" || createErr.code === "user_already_exists") {
        return fail(409, "An account with this email already exists");
      }
      return serverError("signup createUser", createErr.message);
    }
    const userId = created.user.id;

    // 2. Create the profile row. If that fails, delete the auth user so the email can be reused.
    const row: AccountRow = {
      id: userId,
      role,
      display_name,
      phone: phone ?? null,
      created_at: new Date().toISOString(),
    };
    const { error: insertErr } = await admin.from("accounts").insert({
      id: row.id,
      role: row.role,
      display_name: row.display_name,
      phone: row.phone,
    });
    if (insertErr) {
      await admin.auth.admin.deleteUser(userId);
      return serverError("signup accounts insert", insertErr.message);
    }

    // 3. Sign in on a fresh client so the session is returned to the caller only.
    const { data: signin, error: signinErr } = await newAuthClient().auth.signInWithPassword({ email, password });
    if (signinErr || !signin.session) {
      return serverError("signup signIn", signinErr?.message ?? "no session");
    }

    return ok(toSession(signin.session, row, email), 201);
  } catch (err) {
    return serverError("signup", err);
  }
}
