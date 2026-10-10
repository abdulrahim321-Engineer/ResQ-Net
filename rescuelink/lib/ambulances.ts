import "server-only";
import { estimateEtaMin, haversineKm } from "./geo";
import { getAdmin } from "./supabase";
import type { AmbulanceRow } from "./mappers";
import type { Incident, LatLng, Triage } from "./types";

export const ONLINE_WINDOW_MS = 15 * 60 * 1000;

// Ambulances that can accept assignments: status 'available' AND position set AND seen in last 15 min.
export async function listDispatchable(): Promise<AmbulanceRow[]> {
  const fifteenMinutesAgo = new Date(Date.now() - ONLINE_WINDOW_MS).toISOString();
  const { data, error } = await getAdmin()
    .from("ambulances")
    .select("*")
    .eq("status", "available")
    .not("lat", "is", null)
    .not("lng", "is", null)
    .gt("last_seen_at", fifteenMinutesAgo);
  if (error) throw new Error(`listDispatchable failed: ${error.message}`);
  return (data ?? []) as AmbulanceRow[];
}

export async function getOwnAmbulanceRow(userId: string): Promise<AmbulanceRow | null> {
  const { data, error } = await getAdmin().from("ambulances").select("*").eq("owner_id", userId).maybeSingle();
  if (error) throw new Error(`own ambulance lookup failed: ${error.message}`);
  return (data as AmbulanceRow | null) ?? null;
}

export type DispatchDecision = NonNullable<Incident["dispatch_decision"]>;
type Candidate = DispatchDecision["candidates"][number];

export type AmbulanceRanking = { ranked: { row: AmbulanceRow; candidate: Candidate }[]; decision: DispatchDecision };

// Builds the human-readable reason for choosing `chosen` out of the ranked list.
export function dispatchReason(chosen: Candidate, all: Candidate[], vehicleNeeded: Triage["vehicle_needed"]): string {
  const closer = all.filter((c) => c.ambulance_id !== chosen.ambulance_id && c.distance_km < chosen.distance_km);
  const closerBls = closer.filter((c) => c.vehicle_type === "BLS");
  if (vehicleNeeded === "ALS" && chosen.vehicle_type === "ALS" && closerBls.length > 0) {
    const nearestBls = closerBls[0];
    return `${chosen.call_sign} is the nearest ALS unit (${chosen.distance_km} km, ~${chosen.eta_min} min); ${nearestBls.call_sign} is closer (${nearestBls.distance_km} km) but BLS and this case needs ALS.`;
  }
  if (vehicleNeeded === "ALS" && chosen.vehicle_type === "BLS") {
    const als = all.find((c) => c.vehicle_type === "ALS");
    return als
      ? `${chosen.call_sign} is the nearest available unit (${chosen.distance_km} km, ~${chosen.eta_min} min); the nearest ALS unit ${als.call_sign} is more than 5 min further away.`
      : `${chosen.call_sign} is the nearest available unit (${chosen.distance_km} km, ~${chosen.eta_min} min); no ALS unit is available.`;
  }
  return `${chosen.call_sign} is the nearest available unit (${chosen.distance_km} km, ~${chosen.eta_min} min).`;
}

// Ranks online available ambulances by estimated ETA; a BLS unit on an ALS case gets a 5-minute penalty.
export async function rankAmbulances(scene: LatLng, triage: Triage, excludeIds: string[] = []): Promise<AmbulanceRanking> {
  const exclude = new Set(excludeIds);
  const rows = (await listDispatchable()).filter((r) => !exclude.has(r.id));
  const ranked = rows
    .map((row) => {
      const distance_km = haversineKm({ lat: row.lat as number, lng: row.lng as number }, scene);
      const eta_min = estimateEtaMin(distance_km);
      const penalty = triage.vehicle_needed === "ALS" && row.vehicle_type === "BLS" ? 5 : 0;
      const score = Math.round((eta_min + penalty) * 10) / 10;
      return {
        row,
        candidate: { ambulance_id: row.id, call_sign: row.call_sign, vehicle_type: row.vehicle_type, distance_km, eta_min, score },
      };
    })
    .sort((a, b) => a.candidate.score - b.candidate.score);

  const candidates = ranked.map((r) => r.candidate);
  const chosen = candidates[0];
  return {
    ranked,
    decision: chosen
      ? { candidates, chosen_id: chosen.ambulance_id, chosen_reason: dispatchReason(chosen, candidates, triage.vehicle_needed) }
      : { candidates, chosen_id: null, chosen_reason: "No online ambulance is available right now." },
  };
}
