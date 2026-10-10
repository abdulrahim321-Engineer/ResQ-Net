import { requireRole } from "@/lib/auth";
import { getAssignment } from "@/lib/incidents";
import { ok, serverError } from "@/lib/http";

// Current assignment in crew view, or null.
export async function GET(req: Request) {
  const auth = await requireRole(req, ["ambulance"]);
  if (auth instanceof Response) return auth;
  try {
    return ok(await getAssignment(auth.user.id));
  } catch (err) {
    return serverError("GET ambulance/assignment", err);
  }
}
