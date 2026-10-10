import { requireRole } from "@/lib/auth";
import { fail, ok, parseBody, serverError } from "@/lib/http";
import { toCitizenProfile, type CitizenProfileRow } from "@/lib/mappers";
import { normaliseCnic } from "@/lib/profiles";
import { getAdmin } from "@/lib/supabase";
import { citizenProfileSchema } from "@/lib/schemas";

export async function GET(req: Request) {
  const auth = await requireRole(req, ["citizen"]);
  if (auth instanceof Response) return auth;
  try {
    const { data, error } = await getAdmin()
      .from("citizen_profiles")
      .select("*")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return fail(404, "Citizen profile not found");
    return ok(toCitizenProfile(data as CitizenProfileRow));
  } catch (err) {
    return serverError("GET citizen/profile", err);
  }
}

export async function PUT(req: Request) {
  const auth = await requireRole(req, ["citizen"]);
  if (auth instanceof Response) return auth;
  const body = await parseBody(req, citizenProfileSchema);
  if ("response" in body) return body.response;

  const cnic = normaliseCnic(body.data.cnic);
  if (!cnic) return fail(400, "cnic must be 13 digits, with optional dashes");
  try {
    const { data, error } = await getAdmin()
      .from("citizen_profiles")
      .upsert({
        user_id: auth.user.id,
        cnic,
        cnic_source: body.data.cnic_source,
        full_name: body.data.full_name,
        date_of_birth: body.data.date_of_birth ?? null,
        gender: body.data.gender ?? null,
        blood_group: body.data.blood_group ?? null,
        conditions: body.data.conditions,
        allergies: body.data.allergies,
        medications: body.data.medications,
        emergency_contact_name: body.data.emergency_contact.name,
        emergency_contact_phone: body.data.emergency_contact.phone,
        emergency_contact_email: body.data.emergency_contact.email ?? null,
        emergency_contact_relation: body.data.emergency_contact.relation,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") return fail(409, "This CNIC belongs to another account");
      throw new Error(error.message);
    }
    return ok(toCitizenProfile(data as CitizenProfileRow));
  } catch (err) {
    return serverError("PUT citizen/profile", err);
  }
}
