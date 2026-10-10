import { requireRole } from "@/lib/auth";
import { closeIncident } from "@/lib/incidents";
import { ok, serverError } from "@/lib/http";

// Closes the incident and frees the ER bed.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["hospital"]);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  try {
    return ok(await closeIncident(auth.user.id, id));
  } catch (err) {
    return serverError("POST hospital/incidents/:id/close", err);
  }
}
