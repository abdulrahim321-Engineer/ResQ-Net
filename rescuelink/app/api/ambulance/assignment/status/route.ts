import { requireRole } from "@/lib/auth";
import { advanceStatus } from "@/lib/incidents";
import { ok, parseBody, serverError } from "@/lib/http";
import { assignmentStatusSchema } from "@/lib/schemas";

// en_route -> at_scene -> transporting -> arrived. Anything else is a 409.
export async function POST(req: Request) {
  const auth = await requireRole(req, ["ambulance"]);
  if (auth instanceof Response) return auth;
  const body = await parseBody(req, assignmentStatusSchema);
  if ("response" in body) return body.response;
  try {
    return ok(await advanceStatus(auth.user.id, body.data.status));
  } catch (err) {
    return serverError("POST ambulance/assignment/status", err);
  }
}
