import { requireRole } from "@/lib/auth";
import { ok, serverError } from "@/lib/http";
import {
  toAccount, toAmbulance, toCitizenProfile, toHospital,
  type AmbulanceRow, type CitizenProfileRow, type HospitalRow,
} from "@/lib/mappers";
import { getAdmin } from "@/lib/supabase";

// The logged-in account plus its role-specific record.
export async function GET(req: Request) {
  const auth = await requireRole(req, ["citizen", "hospital", "ambulance"]);
  if (auth instanceof Response) return auth;
  const { user, account } = auth;

  try {
    const admin = getAdmin();
    let citizen_profile = null;
    let hospital = null;
    let ambulance = null;

    if (account.role === "citizen") {
      const { data, error } = await admin.from("citizen_profiles").select("*").eq("user_id", user.id).maybeSingle();
      if (error) throw new Error(error.message);
      if (data) citizen_profile = toCitizenProfile(data as CitizenProfileRow);
    }
    if (account.role === "hospital") {
      const { data, error } = await admin.from("hospitals").select("*").eq("owner_id", user.id).maybeSingle();
      if (error) throw new Error(error.message);
      if (data) hospital = toHospital(data as HospitalRow);
    }
    if (account.role === "ambulance") {
      const { data, error } = await admin.from("ambulances").select("*").eq("owner_id", user.id).maybeSingle();
      if (error) throw new Error(error.message);
      if (data) ambulance = toAmbulance(data as AmbulanceRow);
    }

    return ok({
      account: toAccount(account, user.email ?? ""),
      citizen_profile,
      hospital,
      ambulance,
    });
  } catch (err) {
    return serverError("me", err);
  }
}
