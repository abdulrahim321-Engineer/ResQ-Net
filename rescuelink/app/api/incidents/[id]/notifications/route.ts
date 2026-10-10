import { requireRole } from "@/lib/auth";
import { getIncidentRow, viewKind } from "@/lib/incidents";
import { fail, ok, serverError } from "@/lib/http";
import { listNotifications } from "@/lib/notify";

// Assigned crew or receiving hospital only.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ["ambulance", "hospital"]);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  try {
    const row = await getIncidentRow(id);
    if (!row) return fail(404, "Incident not found");
    const kind = await viewKind(row, auth);
    if (kind !== "crew" && kind !== "hospital") return fail(403, "This incident is not assigned to you");
    return ok(await listNotifications(id));
  } catch (err) {
    return serverError("GET incidents/:id/notifications", err);
  }
}
