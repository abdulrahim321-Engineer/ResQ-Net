import { connection } from "next/server";
import { ONLINE_WINDOW_MS } from "@/lib/ambulances";
import { ok, serverError } from "@/lib/http";
import type { IncidentRow } from "@/lib/incidents";
import { toAmbulance, toHospital, type AmbulanceRow, type HospitalRow } from "@/lib/mappers";
import { getAdmin } from "@/lib/supabase";
import type { Ambulance } from "@/lib/types";

const ACTIVE = ["assigned", "en_route", "at_scene", "transporting", "no_ambulance"];

// Public control-room feed, no personal data.
export async function GET() {
  await connection(); // timestamps must be fresh per request, not frozen at build
  try {
    const admin = getAdmin();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [ambRes, hospRes, incRes] = await Promise.all([
      admin.from("ambulances").select("*"),
      admin.from("hospitals").select("*").not("owner_id", "is", null),
      admin
        .from("incidents")
        .select("id, ref_code, status, lat, lng, triage, ambulance_id, hospital_id, created_at")
        .gt("created_at", since)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    for (const r of [ambRes, hospRes, incRes]) if (r.error) throw new Error(r.error.message);

    const cutoff = Date.now() - ONLINE_WINDOW_MS;
    const ambRows = (ambRes.data ?? []) as AmbulanceRow[];
    // A unit that has not reported GPS for 15 min is shown as offline unless it is on a job.
    const ambulances: Ambulance[] = ambRows.map((r) => {
      const a = toAmbulance(r);
      const fresh = r.last_seen_at !== null && Date.parse(r.last_seen_at) > cutoff;
      return a.status === "available" && !fresh ? { ...a, status: "offline" } : a;
    });
    const online = ambRows.filter(
      (r) => r.status !== "offline" && r.last_seen_at !== null && Date.parse(r.last_seen_at) > cutoff,
    );
    const hospitals = ((hospRes.data ?? []) as HospitalRow[]).map(toHospital);
    const callSign = new Map(ambRows.map((r) => [r.id, r.call_sign]));
    const hospitalName = new Map(hospitals.map((h) => [h.id, h.name]));
    const incRows = (incRes.data ?? []) as Pick<IncidentRow, "id" | "ref_code" | "status" | "lat" | "lng" | "triage" | "ambulance_id" | "hospital_id">[];
    const incidents = incRows
      .filter((r) => r.status !== "closed")
      .map((r) => ({
        id: r.id,
        ref_code: r.ref_code,
        status: r.status,
        severity: r.triage?.severity ?? null,
        category: r.triage?.category ?? null,
        location: { lat: r.lat, lng: r.lng },
        ambulance_call_sign: r.ambulance_id ? callSign.get(r.ambulance_id) ?? null : null,
        hospital_name: r.hospital_id ? hospitalName.get(r.hospital_id) ?? null : null,
      }));

    return ok({
      counts: {
        active_incidents: incRows.filter((r) => ACTIVE.includes(r.status)).length,
        ambulances_online: online.length,
        ambulances_available: online.filter((r) => r.status === "available").length,
        live_hospitals: hospitals.length,
      },
      ambulances,
      hospitals,
      incidents,
    });
  } catch (err) {
    return serverError("GET control/overview", err);
  }
}
