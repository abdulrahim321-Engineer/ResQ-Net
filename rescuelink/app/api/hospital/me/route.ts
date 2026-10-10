import { requireRole } from "@/lib/auth";
import { fail, ok, parseBody, serverError } from "@/lib/http";
import { updateOwnHospital } from "@/lib/hospitals";
import { hospitalUpdateSchema } from "@/lib/schemas";

// Updates the caller's hospital. Only the fields sent are changed.
export async function PUT(req: Request) {
  const auth = await requireRole(req, ["hospital"]);
  if (auth instanceof Response) return auth;

  const body = await parseBody(req, hospitalUpdateSchema);
  if ("response" in body) return body.response;

  try {
    const result = await updateOwnHospital(auth.user.id, body.data);
    if (!result.ok) return fail(result.status, result.error);
    return ok(result.hospital);
  } catch (err) {
    return serverError("hospital update", err);
  }
}
