import { requireRole } from "@/lib/auth";
import { acceptAssignment } from "@/lib/incidents";
import { ok, serverError } from "@/lib/http";

// assigned -> en_route; the ambulance becomes busy.
export async function POST(req: Request) {
  const auth = await requireRole(req, ["ambulance"]);
  if (auth instanceof Response) return auth;
  try {
    return ok(await acceptAssignment(auth.user.id));
  } catch (err) {
    return serverError("POST ambulance/assignment/accept", err);
  }
}
