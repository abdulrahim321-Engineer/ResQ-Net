import { requireRole } from "@/lib/auth";
import { declineAssignment } from "@/lib/incidents";
import { ok, serverError } from "@/lib/http";

// Frees this ambulance and reassigns the incident to the next candidate.
export async function POST(req: Request) {
  const auth = await requireRole(req, ["ambulance"]);
  if (auth instanceof Response) return auth;
  try {
    return ok(await declineAssignment(auth.user.id));
  } catch (err) {
    return serverError("POST ambulance/assignment/decline", err);
  }
}
