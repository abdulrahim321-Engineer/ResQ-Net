import { requireRole } from "@/lib/auth";
import { listIncoming } from "@/lib/incidents";
import { ok, serverError } from "@/lib/http";

// This hospital's incidents that are not closed, hospital view, newest first.
export async function GET(req: Request) {
  const auth = await requireRole(req, ["hospital"]);
  if (auth instanceof Response) return auth;
  try {
    return ok(await listIncoming(auth.user.id));
  } catch (err) {
    return serverError("GET hospital/incoming", err);
  }
}
