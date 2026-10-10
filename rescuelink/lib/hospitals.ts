import "server-only";
import { haversineKm } from "./geo";
import { toHospital, type HospitalRow } from "./mappers";
import { getAdmin } from "./supabase";
import type { Capability, Hospital, Incident, LatLng, Triage } from "./types";

// Islamabad + Rawalpindi bounding box (south, west, north, east).
const BBOX = "33.45,72.85,33.80,73.25";
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const OVERPASS_QUERY =
  `[out:json][timeout:25];(node["amenity"="hospital"](${BBOX});way["amenity"="hospital"](${BBOX}););out center tags;`;

const LIST_LIMIT = 50;
const UPSERT_CHUNK = 500;

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

type OsmRow = {
  osm_id: string;
  source: "osm";
  name: string;
  address: string | null;
  phone: string | null;
  lat: number;
  lng: number;
  capabilities: Capability[];
  er_beds_available: null;
};

function osmAddress(tags: Record<string, string>): string | null {
  if (tags["addr:full"]) return tags["addr:full"];
  const parts = [
    tags["addr:housenumber"],
    tags["addr:street"],
    tags["addr:suburb"] ?? tags["addr:neighbourhood"],
    tags["addr:city"],
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

// Maps one Overpass element to a hospitals row. Returns null when there is no usable name or position.
export function osmToRow(el: OverpassElement): OsmRow | null {
  const tags = el.tags ?? {};
  const name = (tags["name:en"] ?? tags.name ?? "").trim();
  const lat = el.type === "node" ? el.lat : el.center?.lat;
  const lng = el.type === "node" ? el.lon : el.center?.lon;
  if (!name || lat === undefined || lng === undefined) return null;
  return {
    osm_id: `${el.type}/${el.id}`,
    source: "osm",
    name,
    address: osmAddress(tags),
    phone: tags.phone ?? tags["contact:phone"] ?? null,
    lat,
    lng,
    capabilities: ["general"],
    er_beds_available: null,
  };
}

// Fetches hospitals from OpenStreetMap and upserts them. Rows that a hospital account has
// claimed (owner_id set) are never touched. Returns the number of rows written.
async function fetchOverpass(): Promise<{ elements?: OverpassElement[] }> {
  // Overpass rejects requests without a User-Agent (406). It also returns 504/429 under load, so retry once.
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "RescueLink/1.0 (AICON'26 hackathon)",
        Accept: "application/json",
      },
      body: new URLSearchParams({ data: OVERPASS_QUERY }),
      signal: AbortSignal.timeout(25_000),
    });
    if (res.ok) return (await res.json()) as { elements?: OverpassElement[] };
    if (attempt < 2 && (res.status === 504 || res.status === 429)) {
      await new Promise((r) => setTimeout(r, 3_000));
      continue;
    }
    throw new Error(`Overpass returned HTTP ${res.status}`);
  }
}

export async function importFromOSM(): Promise<number> {
  const json = await fetchOverpass();
  const byOsmId = new Map<string, OsmRow>();
  for (const el of json.elements ?? []) {
    const row = osmToRow(el);
    if (row) byOsmId.set(row.osm_id, row); // dedupe: upsert rejects repeated keys in one batch
  }
  const rows = [...byOsmId.values()];
  if (rows.length === 0) return 0;

  const admin = getAdmin();
  const { data: claimed, error: claimedErr } = await admin
    .from("hospitals")
    .select("osm_id")
    .in("osm_id", rows.map((r) => r.osm_id))
    .not("owner_id", "is", null);
  if (claimedErr) throw new Error(`claimed lookup failed: ${claimedErr.message}`);

  const claimedIds = new Set((claimed ?? []).map((r) => r.osm_id as string));
  const toWrite = rows.filter((r) => !claimedIds.has(r.osm_id));

  for (let i = 0; i < toWrite.length; i += UPSERT_CHUNK) {
    const chunk = toWrite.slice(i, i + UPSERT_CHUNK);
    const { error } = await admin.from("hospitals").upsert(chunk, { onConflict: "osm_id" });
    if (error) throw new Error(`hospital upsert failed: ${error.message}`);
  }
  return toWrite.length;
}

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// Public list. q is a case-insensitive name filter. With origin, results are sorted by
// straight-line distance. The list is capped at 50.
export async function listHospitals(opts: { origin?: LatLng; q?: string }): Promise<Hospital[]> {
  const filtered = getAdmin().from("hospitals").select("*");
  const byName = opts.q ? filtered.ilike("name", `%${escapeLike(opts.q)}%`) : filtered;

  // Sorting by distance needs every match, so fetch a generous window and sort in memory.
  const { data, error } = opts.origin
    ? await byName.limit(1000)
    : await byName.order("name").limit(LIST_LIMIT);
  if (error) throw new Error(`hospital list failed: ${error.message}`);
  let rows = (data ?? []) as HospitalRow[];

  if (opts.origin) {
    const origin = opts.origin;
    rows = rows
      .map((r) => ({ r, km: haversineKm(origin, { lat: r.lat, lng: r.lng }) }))
      .sort((a, b) => a.km - b.km)
      .map(({ r }) => r)
      .slice(0, LIST_LIMIT);
  }
  return rows.map(toHospital);
}

export type HospitalResult =
  | { ok: true; hospital: Hospital }
  | { ok: false; status: 404 | 409; error: string };

// The hospital row owned by this account, if any.
export async function getOwnHospitalRow(userId: string): Promise<HospitalRow | null> {
  const { data, error } = await getAdmin().from("hospitals").select("*").eq("owner_id", userId).maybeSingle();
  if (error) throw new Error(`owned hospital lookup failed: ${error.message}`);
  return (data as HospitalRow | null) ?? null;
}

const UNIQUE_VIOLATION = "23505";

export async function claimHospital(userId: string, hospitalId: string): Promise<HospitalResult> {
  if (await getOwnHospitalRow(userId)) {
    return { ok: false, status: 409, error: "This account already has a hospital" };
  }
  const admin = getAdmin();
  const { data: target, error: findErr } = await admin.from("hospitals").select("*").eq("id", hospitalId).maybeSingle();
  if (findErr) throw new Error(`hospital lookup failed: ${findErr.message}`);
  if (!target) return { ok: false, status: 404, error: "Hospital not found" };
  if (target.owner_id) return { ok: false, status: 409, error: "This hospital is already claimed" };

  // Conditional update: only succeeds if the row is still unclaimed, so two claims can't race.
  const { data: claimed, error: claimErr } = await admin
    .from("hospitals")
    .update({ owner_id: userId, updated_at: new Date().toISOString() })
    .eq("id", hospitalId)
    .is("owner_id", null)
    .select("*")
    .maybeSingle();
  if (claimErr) {
    if (claimErr.code === UNIQUE_VIOLATION) return { ok: false, status: 409, error: "This account already has a hospital" };
    throw new Error(`claim failed: ${claimErr.message}`);
  }
  if (!claimed) return { ok: false, status: 409, error: "This hospital is already claimed" };
  return { ok: true, hospital: toHospital(claimed as HospitalRow) };
}

export type HospitalCreateInput = {
  name: string; lat: number; lng: number; address?: string | null; phone?: string | null;
};

export async function createHospital(userId: string, input: HospitalCreateInput): Promise<HospitalResult> {
  if (await getOwnHospitalRow(userId)) {
    return { ok: false, status: 409, error: "This account already has a hospital" };
  }
  const { data, error } = await getAdmin()
    .from("hospitals")
    .insert({
      owner_id: userId,
      source: "registered",
      name: input.name,
      address: input.address ?? null,
      phone: input.phone ?? null,
      lat: input.lat,
      lng: input.lng,
      capabilities: ["general"],
      er_beds_available: null,
      accepting: true,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { ok: false, status: 409, error: "This account already has a hospital" };
    throw new Error(`create failed: ${error.message}`);
  }
  return { ok: true, hospital: toHospital(data as HospitalRow) };
}

export type HospitalDecision = NonNullable<Incident["hospital_decision"]>;
export type HospitalRanking = { chosen: HospitalRow | null; decision: HospitalDecision };

const MAX_HOSPITAL_CANDIDATES = 8;

// Live hospitals (claimed) are filtered by capability, beds and accepting, then the nearest eligible
// one is chosen. With none eligible, the nearest OSM hospital is used (capacity unknown).
export async function rankHospitals(scene: LatLng, triage: Triage): Promise<HospitalRanking> {
  const { data, error } = await getAdmin().from("hospitals").select("*").limit(5000);
  if (error) throw new Error(`hospital ranking failed: ${error.message}`);
  const rows = (data ?? []) as HospitalRow[];
  const required = triage.required_capabilities.filter((c) => c !== "general");

  const withKm = rows
    .map((row) => ({ row, km: haversineKm(scene, { lat: row.lat, lng: row.lng }) }))
    .sort((a, b) => a.km - b.km);

  const live = withKm.filter(({ row }) => row.owner_id !== null);
  const evaluated = live.map(({ row, km }) => {
    const missing = required.filter((c) => !row.capabilities.includes(c));
    const capability_match = missing.length === 0;
    const beds = row.er_beds_available ?? 0;
    const skip_reason = !capability_match
      ? `no ${missing.join("/")} unit`
      : !row.accepting
        ? "not accepting"
        : beds <= 0
          ? "0 ER beds"
          : null;
    return {
      row,
      candidate: {
        hospital_id: row.id,
        name: row.name,
        distance_km: km,
        capability_match,
        er_beds_available: row.er_beds_available,
        accepting: row.accepting,
        eligible: skip_reason === null,
        skip_reason,
      },
    };
  });

  const chosenLive = evaluated.find((e) => e.candidate.eligible);
  const candidates = evaluated.slice(0, MAX_HOSPITAL_CANDIDATES).map((e) => e.candidate);
  if (chosenLive && !candidates.some((c) => c.hospital_id === chosenLive.row.id)) candidates.push(chosenLive.candidate);

  if (chosenLive) {
    const skipped = evaluated
      .filter((e) => e.candidate.distance_km < chosenLive.candidate.distance_km)
      .map((e) => `${e.row.name} (${e.candidate.distance_km} km, ${e.candidate.skip_reason})`);
    const needs = required.length ? required.join(", ") : "general care";
    const reason =
      `${chosenLive.row.name} (${chosenLive.candidate.distance_km} km) is the nearest live hospital with ${needs}, ER beds and accepting patients.` +
      (skipped.length ? ` Skipped closer: ${skipped.join("; ")}.` : "");
    return { chosen: chosenLive.row, decision: { candidates, chosen_id: chosenLive.row.id, chosen_reason: reason } };
  }

  const nearestOsm = withKm.find(({ row }) => row.owner_id === null);
  if (nearestOsm) {
    return {
      chosen: nearestOsm.row,
      decision: {
        candidates,
        chosen_id: nearestOsm.row.id,
        chosen_reason: `No live hospital with the required capability; nearest hospital ${nearestOsm.row.name} (${nearestOsm.km} km), capacity unknown.`,
      },
    };
  }
  return { chosen: null, decision: { candidates, chosen_id: null, chosen_reason: "No hospital found near the scene." } };
}

export type HospitalPatch = {
  capabilities?: Capability[];
  er_beds_available?: number | null;
  accepting?: boolean;
  phone?: string | null;
};

// Updates only the fields that were sent, and always sets updated_at.
export async function updateOwnHospital(userId: string, patch: HospitalPatch): Promise<HospitalResult> {
  const owned = await getOwnHospitalRow(userId);
  if (!owned) return { ok: false, status: 404, error: "No hospital yet. Claim or create one first." };

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.capabilities !== undefined) update.capabilities = patch.capabilities;
  if (patch.er_beds_available !== undefined) update.er_beds_available = patch.er_beds_available;
  if (patch.accepting !== undefined) update.accepting = patch.accepting;
  if (patch.phone !== undefined) update.phone = patch.phone;

  const { data, error } = await getAdmin()
    .from("hospitals")
    .update(update)
    .eq("id", owned.id)
    .select("*")
    .single();
  if (error) throw new Error(`hospital update failed: ${error.message}`);
  return { ok: true, hospital: toHospital(data as HospitalRow) };
}
