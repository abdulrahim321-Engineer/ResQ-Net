import { requireRole } from "@/lib/auth";
import { fail, ok, parseBody, serverError } from "@/lib/http";
import { createHospital } from "@/lib/hospitals";
import { hospitalCreateSchema } from "@/lib/schemas";

// Creates a hospital the account owns (source 'registered'). Fails if the account already has one.
export async function POST(req: Request) {
  const auth = await requireRole(req, ["hospital"]);
  if (auth instanceof Response) return auth;

  const body = await parseBody(req, hospitalCreateSchema);
  if ("response" in body) return body.response;

  try {
    const result = await createHospital(auth.user.id, body.data);
    if (!result.ok) return fail(result.status, result.error);
    return ok(result.hospital);
  } catch (err) {
    return serverError("hospital create", err);
  }
}
