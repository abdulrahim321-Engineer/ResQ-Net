import { requireRole } from "@/lib/auth";
import { fail, ok, parseBody, serverError } from "@/lib/http";
import { getAdmin } from "@/lib/supabase";
import { ambulanceLocationSchema } from "@/lib/schemas";

// Called every 5 s while online.
export async function POST(req: Request) {
  const auth = await requireRole(req, ["ambulance"]);
  if (auth instanceof Response) return auth;

  const body = await parseBody(req, ambulanceLocationSchema);
  if ("response" in body) return body.response;

  try {
    const admin = getAdmin();
    const { data: ambulance, error: lookupError } = await admin
      .from("ambulances")
      .select("id")
      .eq("owner_id", auth.user.id)
      .maybeSingle();
    if (lookupError) throw new Error(lookupError.message);
    if (!ambulance) return fail(404, "Set up your ambulance first");

    const { error: updateError } = await admin
      .from("ambulances")
      .update({
        lat: body.data.lat,
        lng: body.data.lng,
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", ambulance.id)
      .eq("owner_id", auth.user.id);
    if (updateError) throw new Error(updateError.message);

    return ok({ ok: true });
  } catch (err) {
    return serverError("POST ambulance/location", err);
  }
}
