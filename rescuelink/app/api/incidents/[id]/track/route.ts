import { trackIncident } from "@/lib/incidents";
import { ok, serverError } from "@/lib/http";

// Public: positions only, no personal data.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    return ok(await trackIncident(id));
  } catch (err) {
    return serverError("GET incidents/:id/track", err);
  }
}
