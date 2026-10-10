import { optionalUser } from "@/lib/auth";
import { incidentForViewer } from "@/lib/incidents";
import { ok, serverError } from "@/lib/http";

// Public route. The role comes from the optional token, and the response follows the contract's "Who sees what" table.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    return ok(await incidentForViewer(id, await optionalUser(req)));
  } catch (err) {
    return serverError("GET incidents/:id", err);
  }
}
