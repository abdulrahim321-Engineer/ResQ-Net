import "server-only";
import { analyzeWithFallback } from "./ai/triage";
import { getOwnAmbulanceRow, rankAmbulances, type DispatchDecision } from "./ambulances";
import type { AuthContext } from "./auth";
import { estimateEtaMin, haversineKm } from "./geo";
import { HttpError } from "./http";
import { getOwnHospitalRow, rankHospitals, type HospitalDecision } from "./hospitals";
import {
  toCitizenProfile, type AmbulanceRow, type CitizenProfileRow, type HospitalRow,
} from "./mappers";
import { record, sendEmail, whatsappLink } from "./notify";
import { maskCnic, normaliseCnic, toLimited } from "./profiles";
import { getAdmin } from "./supabase";
import type { Brief, CitizenProfile, Incident, IncidentStatus, LatLng, Track, Triage } from "./types";

export type IncidentRow = {
  id: string; ref_code: string; status: IncidentStatus; created_at: string;
  lat: number; lng: number; address: string | null; description: string;
  reporter_id: string | null; reporter_name: string | null; reporter_phone: string | null;
  patient_user_id: string | null; identity_status: Incident["identity"]["status"];
  triage: Triage | null; brief: Brief | null; relative_message: string | null;
  ambulance_id: string | null; hospital_id: string | null;
  dispatch_decision: DispatchDecision | null; hospital_decision: HospitalDecision | null;
  declined_ambulance_ids: string[];
  assigned_at: string | null; accepted_at: string | null; at_scene_at: string | null;
  picked_up_at: string | null; arrived_at: string | null;
  hospital_readiness: Incident["hospital_status"]["readiness"]; hospital_acknowledged_at: string | null;
};

const db = () => getAdmin();
const now = () => new Date().toISOString();

// ---------- loaders ----------

export async function getIncidentRow(id: string): Promise<IncidentRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await db().from("incidents").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`incident lookup failed: ${error.message}`);
  return (data as IncidentRow | null) ?? null;
}

async function getAmbulanceRow(id: string | null): Promise<AmbulanceRow | null> {
  if (!id) return null;
  const { data, error } = await db().from("ambulances").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`ambulance lookup failed: ${error.message}`);
  return (data as AmbulanceRow | null) ?? null;
}

async function getHospitalRow(id: string | null): Promise<HospitalRow | null> {
  if (!id) return null;
  const { data, error } = await db().from("hospitals").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`hospital lookup failed: ${error.message}`);
  return (data as HospitalRow | null) ?? null;
}

async function getProfileRow(userId: string | null): Promise<CitizenProfileRow | null> {
  if (!userId) return null;
  const { data, error } = await db().from("citizen_profiles").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`profile lookup failed: ${error.message}`);
  return (data as CitizenProfileRow | null) ?? null;
}

async function getProfileRowByCnic(cnic: string): Promise<CitizenProfileRow | null> {
  const { data, error } = await db().from("citizen_profiles").select("*").eq("cnic", cnic).maybeSingle();
  if (error) throw new Error(`profile lookup failed: ${error.message}`);
  return (data as CitizenProfileRow | null) ?? null;
}

// ---------- views ----------

export type ViewKind = "public" | "crew" | "hospital" | "forbidden";

// Applies the contract's "Who sees what" table.
export async function viewKind(row: IncidentRow, viewer: AuthContext | null): Promise<ViewKind> {
  if (!viewer || viewer.account.role === "citizen") return "public";
  if (viewer.account.role === "ambulance") {
    const own = await getOwnAmbulanceRow(viewer.user.id);
    return own && own.id === row.ambulance_id ? "crew" : "forbidden";
  }
  const own = await getOwnHospitalRow(viewer.user.id);
  return own && own.id === row.hospital_id ? "hospital" : "forbidden";
}

export async function toIncident(row: IncidentRow, kind: Exclude<ViewKind, "forbidden">): Promise<Incident> {
  const [amb, hosp, profileRow] = await Promise.all([
    getAmbulanceRow(row.ambulance_id),
    getHospitalRow(row.hospital_id),
    getProfileRow(row.patient_user_id),
  ]);
  const privileged = kind !== "public";
  const profile = profileRow
    ? kind === "hospital" ? toCitizenProfile(profileRow) : toLimited(profileRow)
    : null;
  return {
    id: row.id,
    ref_code: row.ref_code,
    status: row.status,
    created_at: row.created_at,
    location: { lat: row.lat, lng: row.lng, address: row.address },
    description: row.description,
    reporter: { name: row.reporter_name, phone: privileged ? row.reporter_phone : null },
    identity: { status: row.identity_status, profile },
    triage: row.triage as Triage,
    ambulance: amb
      ? { id: amb.id, call_sign: amb.call_sign, service_name: amb.service_name, vehicle_type: amb.vehicle_type, plate: amb.plate }
      : null,
    hospital: hosp ? { id: hosp.id, name: hosp.name, location: { lat: hosp.lat, lng: hosp.lng }, phone: hosp.phone } : null,
    dispatch_decision: privileged ? row.dispatch_decision : null,
    hospital_decision: privileged ? row.hospital_decision : null,
    brief: privileged ? row.brief : null,
    hospital_status: { readiness: row.hospital_readiness, acknowledged_at: row.hospital_acknowledged_at },
    timeline: {
      assigned_at: row.assigned_at,
      accepted_at: row.accepted_at,
      at_scene_at: row.at_scene_at,
      picked_up_at: row.picked_up_at,
      arrived_at: row.arrived_at,
    },
  };
}

// Loads and renders an incident for a viewer. Throws HttpError 404/403.
export async function incidentForViewer(id: string, viewer: AuthContext | null): Promise<Incident> {
  const row = await getIncidentRow(id);
  if (!row) throw new HttpError(404, "Incident not found");
  const kind = await viewKind(row, viewer);
  if (kind === "forbidden") throw new HttpError(403, "This incident is not assigned to you");
  return toIncident(row, kind);
}

// ---------- create pipeline ----------

export type CreateIncidentInput = {
  lat: number; lng: number; address?: string | null; description: string;
  reporter_name?: string | null; reporter_phone?: string | null; for_self?: boolean | null;
  cnic?: string | null; scene_image_base64?: string | null; mime_type?: string | null;
};

function timer() {
  const start = Date.now();
  let last = start;
  return (step: string, extra = "") => {
    const t = Date.now();
    console.log(`[incident] ${step} ${t - last}ms${extra ? ` ${extra}` : ""}`);
    last = t;
  };
}

// Marks an ambulance assigned, only if it is still available (avoids double assignment).
async function claimAmbulance(ambulanceId: string, incidentId: string): Promise<boolean> {
  const { data, error } = await db()
    .from("ambulances")
    .update({ status: "assigned", current_incident_id: incidentId })
    .eq("id", ambulanceId)
    .eq("status", "available")
    .select("id");
  if (error) throw new Error(`ambulance claim failed: ${error.message}`);
  return (data ?? []).length > 0;
}

async function adjustBeds(hospitalId: string, delta: number) {
  const hosp = await getHospitalRow(hospitalId);
  if (!hosp || hosp.owner_id === null || hosp.er_beds_available === null) return;
  const beds = Math.max(0, hosp.er_beds_available + delta);
  const { error } = await db().from("hospitals").update({ er_beds_available: beds, updated_at: now() }).eq("id", hospitalId);
  if (error) console.error("bed update failed:", error.message);
}

function fill(template: string, values: Record<string, string>) {
  return template.replace(/\{(NAME|HOSPITAL|REF)\}/g, (_, k: string) => values[k] ?? "");
}

export async function createIncident(input: CreateIncidentInput, caller: AuthContext | null): Promise<Incident> {
  const mark = timer();

  // 1. Identity (never blocks the next steps).
  let profileRow: CitizenProfileRow | null = null;
  let identity: Incident["identity"]["status"] = "unknown";
  if (input.for_self && caller?.account.role === "citizen") {
    profileRow = await getProfileRow(caller.user.id);
    identity = profileRow ? "matched" : "unknown";
  } else if (input.cnic) {
    const cnic = normaliseCnic(input.cnic);
    if (cnic) {
      profileRow = await getProfileRowByCnic(cnic);
      identity = profileRow ? "matched" : "not_registered";
    }
  }
  const profile: CitizenProfile | null = profileRow ? toCitizenProfile(profileRow) : null;
  mark("identity", `${identity}${profileRow ? ` ${maskCnic(profileRow.cnic)}` : ""}`);

  // 2. AI triage (falls back to rules on any error).
  const sceneImage =
    input.scene_image_base64 && input.mime_type ? { base64: input.scene_image_base64, mime: input.mime_type } : undefined;
  const analysis = await analyzeWithFallback({ description: input.description, sceneImage, profile });
  mark("triage", `${analysis.triage.source} ${analysis.triage.severity} ${analysis.triage.category}`);

  const scene: LatLng = { lat: input.lat, lng: input.lng };
  const base = {
    lat: input.lat,
    lng: input.lng,
    address: input.address ?? null,
    description: input.description,
    reporter_id: caller?.user.id ?? null,
    reporter_name: input.reporter_name ?? (input.for_self ? caller?.account.display_name ?? null : null),
    reporter_phone: input.reporter_phone ?? (input.for_self ? caller?.account.phone ?? null : null),
    patient_user_id: profileRow?.user_id ?? null,
    identity_status: identity,
    triage: analysis.triage,
    brief: analysis.brief,
    relative_message: analysis.relative_message,
  };

  // 3. Dispatch.
  const ambulances = await rankAmbulances(scene, analysis.triage);
  mark("rank ambulances", `${ambulances.ranked.length} candidates`);

  // 4. Hospital.
  const hospitals = await rankHospitals(scene, analysis.triage);
  mark("rank hospitals", hospitals.chosen?.name ?? "none");

  if (ambulances.ranked.length === 0) {
    const { data, error } = await db()
      .from("incidents")
      .insert({ ...base, status: "no_ambulance", dispatch_decision: ambulances.decision, hospital_decision: hospitals.decision })
      .select("*")
      .single();
    if (error) throw new Error(`incident insert failed: ${error.message}`);
    const row = data as IncidentRow;
    await record(row.id, "reporter", input.reporter_phone ?? "reporter", `No ambulance available for ${row.ref_code}. Call 1122 now.`);
    mark("saved no_ambulance");
    return toIncident(row, "public");
  }

  // 5. Insert, then claim the best ambulance that is still available.
  const { data: inserted, error: insertErr } = await db()
    .from("incidents")
    .insert({
      ...base,
      status: "assigned",
      hospital_id: hospitals.chosen?.id ?? null,
      hospital_decision: hospitals.decision,
      dispatch_decision: ambulances.decision,
    })
    .select("*")
    .single();
  if (insertErr) throw new Error(`incident insert failed: ${insertErr.message}`);
  let row = inserted as IncidentRow;

  let chosen: AmbulanceRow | null = null;
  for (const { row: amb } of ambulances.ranked) {
    if (await claimAmbulance(amb.id, row.id)) {
      chosen = amb;
      break;
    }
  }
  const decision: DispatchDecision = chosen && chosen.id !== ambulances.decision.chosen_id
    ? { ...ambulances.decision, chosen_id: chosen.id, chosen_reason: `${chosen.call_sign} was the best unit still free when assigning.` }
    : ambulances.decision;
  const { data: updated, error: updErr } = await db()
    .from("incidents")
    .update(
      chosen
        ? { ambulance_id: chosen.id, assigned_at: now(), dispatch_decision: decision }
        : { status: "no_ambulance", dispatch_decision: { ...decision, chosen_id: null, chosen_reason: "All candidate ambulances were taken." } },
    )
    .eq("id", row.id)
    .select("*")
    .single();
  if (updErr) throw new Error(`incident update failed: ${updErr.message}`);
  row = updated as IncidentRow;
  if (hospitals.chosen && row.ambulance_id) await adjustBeds(hospitals.chosen.id, -1);
  mark("saved", `${row.ref_code} ${chosen?.call_sign ?? "no ambulance"}`);

  // 6. Notifications.
  if (chosen) await notifyAssignment(row, chosen, hospitals.chosen, profile);
  mark("notifications");

  // 7. Caller's view (a reporter always gets the public view).
  return toIncident(row, "public");
}

async function notifyAssignment(row: IncidentRow, amb: AmbulanceRow, hosp: HospitalRow | null, profile: CitizenProfile | null) {
  const triage = row.triage as Triage;
  const km = amb.lat !== null && amb.lng !== null ? haversineKm({ lat: amb.lat, lng: amb.lng }, { lat: row.lat, lng: row.lng }) : null;
  const eta = km !== null ? estimateEtaMin(km) : null;
  const jobs: Promise<unknown>[] = [
    record(row.id, "ambulance_app", amb.call_sign, `New emergency ${row.ref_code}: ${triage.severity} ${triage.category}, ${km ?? "?"} km`),
    record(row.id, "reporter", row.reporter_phone ?? row.reporter_name ?? "reporter", `Ambulance ${amb.call_sign} assigned, ~${eta ?? "?"} min, ref ${row.ref_code}`),
  ];
  if (hosp) jobs.push(record(row.id, "hospital_dashboard", hosp.name, row.brief?.summary ?? `Incoming ${triage.severity} ${triage.category}`));

  const contact = profile?.emergency_contact;
  if (profile && contact && row.relative_message) {
    const firstName = profile.full_name.trim().split(/\s+/)[0] ?? profile.full_name;
    const hospitalName = hosp?.name ?? "the nearest hospital";
    const message = fill(row.relative_message, { NAME: firstName, HOSPITAL: hospitalName, REF: row.ref_code });
    if (contact.email) {
      jobs.push(
        sendEmail(contact.email, `RescueLink: ${firstName} is being taken to ${hospitalName}`, message).then((r) =>
          record(row.id, "email", contact.email as string, message, { delivered: r.delivered, error: r.error ?? null }),
        ),
      );
    }
    if (contact.phone) {
      jobs.push(record(row.id, "whatsapp_link", contact.phone, message, { whatsapp_link: whatsappLink(contact.phone, message) }));
    }
  }
  await Promise.all(jobs);
}

// ---------- tracking ----------

export async function trackIncident(id: string): Promise<Track> {
  const row = await getIncidentRow(id);
  if (!row) throw new HttpError(404, "Incident not found");
  const [amb, hosp] = await Promise.all([getAmbulanceRow(row.ambulance_id), getHospitalRow(row.hospital_id)]);
  const patient = { lat: row.lat, lng: row.lng };
  const ambPos = amb && amb.lat !== null && amb.lng !== null ? { lat: amb.lat, lng: amb.lng } : null;
  const hospPos = hosp ? { lat: hosp.lat, lng: hosp.lng } : null;
  const toScene = row.status === "assigned" || row.status === "en_route";
  const toHospital = row.status === "transporting";
  const dPatient = toScene && ambPos ? haversineKm(ambPos, patient) : null;
  const dHospital = toHospital && ambPos && hospPos ? haversineKm(ambPos, hospPos) : null;
  const leg = dPatient ?? dHospital;
  return {
    incident_id: row.id,
    status: row.status,
    patient_location: patient,
    ambulance_position: ambPos,
    ambulance_last_seen_at: amb?.last_seen_at ?? null,
    hospital_location: hospPos,
    distance_to_patient_km: dPatient,
    distance_to_hospital_km: dHospital,
    eta_min: leg !== null ? estimateEtaMin(leg) : null,
    eta_source: "estimate",
  };
}

// ---------- ambulance actions ----------

async function requireOwnAmbulance(userId: string): Promise<AmbulanceRow> {
  const amb = await getOwnAmbulanceRow(userId);
  if (!amb) throw new HttpError(404, "Set up your ambulance first");
  return amb;
}

async function currentAssignment(amb: AmbulanceRow): Promise<IncidentRow | null> {
  if (!amb.current_incident_id) return null;
  const row = await getIncidentRow(amb.current_incident_id);
  if (!row || row.ambulance_id !== amb.id || row.status === "closed" || row.status === "arrived") return null;
  return row;
}

async function updateIncident(id: string, patch: Partial<IncidentRow>): Promise<IncidentRow> {
  const { data, error } = await db().from("incidents").update(patch).eq("id", id).select("*").single();
  if (error) throw new Error(`incident update failed: ${error.message}`);
  return data as IncidentRow;
}

async function setAmbulance(id: string, patch: Partial<AmbulanceRow>) {
  const { error } = await db().from("ambulances").update(patch).eq("id", id);
  if (error) throw new Error(`ambulance update failed: ${error.message}`);
}

export async function getAssignment(userId: string): Promise<Incident | null> {
  const amb = await requireOwnAmbulance(userId);
  const row = await currentAssignment(amb);
  return row ? toIncident(row, "crew") : null;
}

export async function acceptAssignment(userId: string): Promise<Incident> {
  const amb = await requireOwnAmbulance(userId);
  const row = await currentAssignment(amb);
  if (!row) throw new HttpError(404, "No current assignment");
  if (row.status !== "assigned") throw new HttpError(409, `Cannot accept: incident is ${row.status}`);
  const updated = await updateIncident(row.id, { status: "en_route", accepted_at: now() });
  await setAmbulance(amb.id, { status: "busy" });
  await record(row.id, "reporter", row.reporter_phone ?? row.reporter_name ?? "reporter", `Ambulance ${amb.call_sign} accepted and is on the way (ref ${row.ref_code})`);
  return toIncident(updated, "crew");
}

export async function declineAssignment(userId: string): Promise<{ ok: true }> {
  const amb = await requireOwnAmbulance(userId);
  const row = await currentAssignment(amb);
  if (!row) throw new HttpError(404, "No current assignment");
  if (row.status !== "assigned") throw new HttpError(409, `Cannot decline: incident is ${row.status}`);

  const declined = [...new Set([...(row.declined_ambulance_ids ?? []), amb.id])];
  await setAmbulance(amb.id, { status: "available", current_incident_id: null });

  const triage = row.triage as Triage;
  const ranking = await rankAmbulances({ lat: row.lat, lng: row.lng }, triage, declined);
  let next: AmbulanceRow | null = null;
  for (const { row: cand } of ranking.ranked) {
    if (await claimAmbulance(cand.id, row.id)) {
      next = cand;
      break;
    }
  }
  if (!next) {
    await updateIncident(row.id, {
      status: "no_ambulance",
      ambulance_id: null,
      declined_ambulance_ids: declined,
      dispatch_decision: { ...ranking.decision, chosen_id: null, chosen_reason: `${amb.call_sign} declined; no other ambulance is available.` },
    });
    await record(row.id, "reporter", row.reporter_phone ?? row.reporter_name ?? "reporter", `No ambulance available for ${row.ref_code}. Call 1122 now.`);
    return { ok: true };
  }
  const reason = ranking.decision.chosen_id === next.id ? ranking.decision.chosen_reason : `${next.call_sign} was the best unit still free.`;
  const updated = await updateIncident(row.id, {
    ambulance_id: next.id,
    declined_ambulance_ids: declined,
    assigned_at: now(),
    dispatch_decision: { ...ranking.decision, chosen_id: next.id, chosen_reason: `${amb.call_sign} declined. ${reason}` },
  });
  const km = next.lat !== null && next.lng !== null ? haversineKm({ lat: next.lat, lng: next.lng }, { lat: row.lat, lng: row.lng }) : null;
  await Promise.all([
    record(updated.id, "ambulance_app", next.call_sign, `New emergency ${updated.ref_code}: ${triage.severity} ${triage.category}, ${km ?? "?"} km (reassigned)`),
    record(updated.id, "reporter", updated.reporter_phone ?? updated.reporter_name ?? "reporter", `Ambulance ${next.call_sign} assigned, ~${km !== null ? estimateEtaMin(km) : "?"} min, ref ${updated.ref_code}`),
  ]);
  return { ok: true };
}

const NEXT_STATUS: Partial<Record<IncidentStatus, IncidentStatus>> = {
  en_route: "at_scene",
  at_scene: "transporting",
  transporting: "arrived",
};

export async function advanceStatus(userId: string, status: "at_scene" | "transporting" | "arrived"): Promise<Incident> {
  const amb = await requireOwnAmbulance(userId);
  const row = await currentAssignment(amb);
  if (!row) throw new HttpError(404, "No current assignment");
  if (NEXT_STATUS[row.status] !== status) {
    throw new HttpError(409, `Invalid transition ${row.status} -> ${status}`);
  }
  const patch: Partial<IncidentRow> = { status };
  if (status === "at_scene") patch.at_scene_at = now();
  if (status === "transporting") patch.picked_up_at = now();
  if (status === "arrived") patch.arrived_at = now();
  const updated = await updateIncident(row.id, patch);
  if (status === "arrived") await setAmbulance(amb.id, { status: "available", current_incident_id: null });
  await record(row.id, "reporter", row.reporter_phone ?? row.reporter_name ?? "reporter", `${amb.call_sign}: ${status.replace("_", " ")} (ref ${row.ref_code})`);
  return toIncident(updated, "crew");
}

// ---------- hospital actions ----------

async function requireOwnHospitalIncident(userId: string, incidentId: string): Promise<{ row: IncidentRow; hosp: HospitalRow }> {
  const hosp = await getOwnHospitalRow(userId);
  if (!hosp) throw new HttpError(404, "No hospital yet. Claim or create one first.");
  const row = await getIncidentRow(incidentId);
  if (!row) throw new HttpError(404, "Incident not found");
  if (row.hospital_id !== hosp.id) throw new HttpError(403, "This incident is not coming to your hospital");
  return { row, hosp };
}

export async function listIncoming(userId: string): Promise<Incident[]> {
  const hosp = await getOwnHospitalRow(userId);
  if (!hosp) throw new HttpError(404, "No hospital yet. Claim or create one first.");
  const { data, error } = await db()
    .from("incidents")
    .select("*")
    .eq("hospital_id", hosp.id)
    .neq("status", "closed")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(`incoming lookup failed: ${error.message}`);
  return Promise.all(((data ?? []) as IncidentRow[]).map((r) => toIncident(r, "hospital")));
}

export async function setReadiness(userId: string, incidentId: string, readiness: "preparing" | "ready"): Promise<Incident> {
  const { row, hosp } = await requireOwnHospitalIncident(userId, incidentId);
  if (row.status === "closed") throw new HttpError(409, "Incident is closed");
  const updated = await updateIncident(row.id, {
    hospital_readiness: readiness,
    hospital_acknowledged_at: row.hospital_acknowledged_at ?? now(),
  });
  const amb = await getAmbulanceRow(row.ambulance_id);
  await record(row.id, "ambulance_app", amb?.call_sign ?? hosp.name, `Hospital ${readiness}: ${hosp.name} (ref ${row.ref_code})`);
  return toIncident(updated, "hospital");
}

export async function closeIncident(userId: string, incidentId: string): Promise<Incident> {
  const { row, hosp } = await requireOwnHospitalIncident(userId, incidentId);
  if (row.status === "closed") throw new HttpError(409, "Incident is already closed");
  const updated = await updateIncident(row.id, { status: "closed" });
  await adjustBeds(hosp.id, +1);
  // Free the crew if the hospital closes before the ambulance tapped "arrived".
  const amb = await getAmbulanceRow(row.ambulance_id);
  if (amb && amb.current_incident_id === row.id) await setAmbulance(amb.id, { status: "available", current_incident_id: null });
  return toIncident(updated, "hospital");
}

// ---------- citizen ----------

export async function listCitizenIncidents(userId: string): Promise<Incident[]> {
  const { data, error } = await db()
    .from("incidents")
    .select("*")
    .or(`reporter_id.eq.${userId},patient_user_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(`citizen incidents lookup failed: ${error.message}`);
  return Promise.all(((data ?? []) as IncidentRow[]).map((r) => toIncident(r, "public")));
}
