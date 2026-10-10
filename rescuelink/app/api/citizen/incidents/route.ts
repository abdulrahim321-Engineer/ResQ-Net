import { requireRole } from "@/lib/auth";
import { listCitizenIncidents } from "@/lib/incidents";
import { ok, serverError } from "@/lib/http";

// Incidents reported by or about this citizen, public view.
export async function GET(req: Request) {
  const auth = await requireRole(req, ["citizen"]);
  if (auth instanceof Response) return auth;
  try {
    return ok(await listCitizenIncidents(auth.user.id));
  } catch (err) {
    return serverError("GET citizen/incidents", err);
  }
}
