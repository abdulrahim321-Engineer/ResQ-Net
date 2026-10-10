import { requireRole } from "@/lib/auth";
import { fail, ok, parseBody, serverError } from "@/lib/http";
import { toAmbulance, type AmbulanceRow } from "@/lib/mappers";
import { getAdmin } from "@/lib/supabase";
import { ambulanceStatusSchema } from "@/lib/schemas";

export async function PUT(req: Request) {
  const auth = await requireRole(req, ["ambulance"]);
  if (auth instanceof Response) return auth;

  const body = await parseBody(req, ambulanceStatusSchema);
  if ("response" in body) return body.response;

  try {
    const admin = getAdmin();
    const { data: ambulance, error: lookupError } = await admin
      .from("ambulances")
      .select("*")
      .eq("owner_id", auth.user.id)
      .maybeSingle();
    if (lookupError) throw new Error(lookupError.message);
    if (!ambulance) return fail(404, "Set up your ambulance first");

    const row = ambulance as AmbulanceRow;
    if (body.data.status === "offline" && (row.status === "assigned" || row.status === "busy")) {
      return fail(409, "Cannot go offline while assigned or busy");
    }
    if (body.data.status === "available" && (row.lat === null || row.lng === null)) {
      return fail(400, "Set your location first");
    }

    const { data: updated, error: updateError } = await admin
      .from("ambulances")
      .update({ status: body.data.status })
      .eq("id", row.id)
      .eq("owner_id", auth.user.id)
      .select("*")
      .single();
    if (updateError) throw new Error(updateError.message);

    return ok(toAmbulance(updated as AmbulanceRow));
  } catch (err) {
    return serverError("PUT ambulance/status", err);
  }
}
