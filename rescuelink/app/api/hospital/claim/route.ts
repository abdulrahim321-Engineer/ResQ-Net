import { requireRole } from "@/lib/auth";
import { fail, ok, parseBody, serverError } from "@/lib/http";
import { claimHospital } from "@/lib/hospitals";
import { hospitalClaimSchema } from "@/lib/schemas";

// Claims an existing (OSM-imported) hospital for the logged-in hospital account.
export async function POST(req: Request) {
  const auth = await requireRole(req, ["hospital"]);
  if (auth instanceof Response) return auth;

  const body = await parseBody(req, hospitalClaimSchema);
  if ("response" in body) return body.response;

  try {
    const result = await claimHospital(auth.user.id, body.data.hospital_id);
    if (!result.ok) return fail(result.status, result.error);
    return ok(result.hospital);
  } catch (err) {
    return serverError("hospital claim", err);
  }
}
