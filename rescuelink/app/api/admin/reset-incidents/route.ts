import { requireAdmin } from "@/lib/auth";
import { ok, serverError } from "@/lib/http";
import { getAdmin } from "@/lib/supabase";

// Deletes incidents and notifications, frees ambulances, keeps accounts.
export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const admin = getAdmin();
    const n = await admin.from("notifications").delete().not("id", "is", null);
    if (n.error) throw new Error(n.error.message);
    const i = await admin.from("incidents").delete().not("id", "is", null);
    if (i.error) throw new Error(i.error.message);
    const a = await admin
      .from("ambulances")
      .update({ status: "available", current_incident_id: null })
      .in("status", ["assigned", "busy"]);
    if (a.error) throw new Error(a.error.message);
    const c = await admin.from("ambulances").update({ current_incident_id: null }).not("current_incident_id", "is", null);
    if (c.error) throw new Error(c.error.message);
    return ok({ ok: true });
  } catch (err) {
    return serverError("POST admin/reset-incidents", err);
  }
}
