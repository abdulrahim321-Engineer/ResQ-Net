import { requireRole } from "@/lib/auth";
import { fail, ok, parseBody, serverError } from "@/lib/http";
import { toAmbulance, type AmbulanceRow } from "@/lib/mappers";
import { getAdmin } from "@/lib/supabase";
import { ambulanceSetupSchema } from "@/lib/schemas";

export async function POST(req: Request) {
  const auth = await requireRole(req, ["ambulance"]);
  if (auth instanceof Response) return auth;
  const { user } = auth;

  const body = await parseBody(req, ambulanceSetupSchema);
  if ("response" in body) return body.response;
  const d = body.data;

  try {
    // One ambulance per account; check for existing.
    const { data: existing, error: existingErr } = await getAdmin()
      .from("ambulances")
      .select("id")
      .eq("owner_id", user.id)
      .maybeSingle();
    if (existingErr) throw new Error(existingErr.message);
    if (existing) return fail(409, "This account already has an ambulance");

    // Create the ambulance.
    const { data, error } = await getAdmin()
      .from("ambulances")
      .insert({
        owner_id: user.id,
        call_sign: d.call_sign,
        service_name: d.service_name,
        vehicle_type: d.vehicle_type,
        plate: d.plate ?? null,
        status: "offline",
      })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") return fail(409, "This account already has an ambulance");
      throw new Error(error.message);
    }

    return ok(toAmbulance(data as AmbulanceRow), 201);
  } catch (err) {
    return serverError("POST ambulance/setup", err);
  }
}
