import { requireRole } from "@/lib/auth";
import { setReadiness } from "@/lib/incidents";
import { ok, parseBody, serverError } from "@/lib/http";
import { readinessSchema } from "@/lib/schemas";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["hospital"]);
  if (auth instanceof Response) return auth;
  const body = await parseBody(req, readinessSchema);
  if ("response" in body) return body.response;
  const { id } = await params;
  try {
    return ok(await setReadiness(auth.user.id, id, body.data.readiness));
  } catch (err) {
    return serverError("POST hospital/incidents/:id/readiness", err);
  }
}
