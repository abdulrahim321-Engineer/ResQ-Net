import { FALLBACK_EMERGENCY_CONTACT } from "./emergency";
import { toLimited } from "./profiles";
import type {
  Ambulance, CitizenProfile, Hospital, ProfileLimited, Role, Session,
} from "./types";

// DB row shapes (schema.sql). Supabase returns untyped JSON, so these are asserted in one place.
export type AccountRow = {
  id: string; role: Role; display_name: string; phone: string | null; created_at: string;
};

export type CitizenProfileRow = {
  user_id: string; cnic: string; cnic_source: "typed" | "scanned"; full_name: string;
  date_of_birth: string | null; gender: string | null; blood_group: string | null;
  conditions: string[]; allergies: string[]; medications: string[];
  emergency_contact_name: string | null; emergency_contact_phone: string | null;
  emergency_contact_email: string | null; emergency_contact_relation: string | null;
  updated_at: string;
};

export type HospitalRow = {
  id: string; owner_id: string | null; osm_id: string | null; source: "osm" | "registered";
  name: string; address: string | null; phone: string | null; lat: number; lng: number;
  capabilities: string[]; er_beds_available: number | null; accepting: boolean;
  updated_at: string | null;
};

export type AmbulanceRow = {
  id: string; owner_id: string; call_sign: string; service_name: string;
  vehicle_type: "ALS" | "BLS"; plate: string | null; status: Ambulance["status"];
  lat: number | null; lng: number | null; last_seen_at: string | null; current_incident_id: string | null;
};

export function toAccount(row: AccountRow, email: string): Session["account"] {
  return {
    id: row.id,
    email,
    role: row.role,
    display_name: row.display_name,
    phone: row.phone,
  };
}

export function toSession(
  session: { access_token: string; refresh_token: string; expires_at?: number; expires_in: number },
  row: AccountRow,
  email: string,
): Session {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at ?? Math.floor(Date.now() / 1000) + session.expires_in,
    account: toAccount(row, email),
  };
}

// The contract requires emergency_contact name, phone and relation. The schema allows nulls,
// so blanks are filled from FALLBACK_EMERGENCY_CONTACT.
export function toCitizenProfile(row: CitizenProfileRow): CitizenProfile {
  return {
    user_id: row.user_id,
    cnic: row.cnic,
    cnic_source: row.cnic_source,
    full_name: row.full_name,
    date_of_birth: row.date_of_birth,
    gender: (row.gender as CitizenProfile["gender"]) ?? null,
    blood_group: row.blood_group,
    conditions: row.conditions,
    allergies: row.allergies,
    medications: row.medications,
    emergency_contact: {
      name: row.emergency_contact_name || FALLBACK_EMERGENCY_CONTACT.name,
      phone: row.emergency_contact_phone || FALLBACK_EMERGENCY_CONTACT.phone,
      email: row.emergency_contact_email,
      relation: row.emergency_contact_relation || FALLBACK_EMERGENCY_CONTACT.relation,
    },
    updated_at: row.updated_at,
  };
}

// What passersby and crew may see (ProfileLimited).
export function toProfileLimited(row: CitizenProfileRow): ProfileLimited {
  return toLimited(row);
}

export function toHospital(row: HospitalRow): Hospital {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    location: { lat: row.lat, lng: row.lng },
    phone: row.phone,
    source: row.source,
    is_live: row.owner_id !== null,
    capabilities: row.capabilities as Hospital["capabilities"],
    er_beds_available: row.er_beds_available,
    accepting: row.accepting,
    updated_at: row.updated_at,
  };
}

export function toAmbulance(row: AmbulanceRow): Ambulance {
  return {
    id: row.id,
    call_sign: row.call_sign,
    service_name: row.service_name,
    vehicle_type: row.vehicle_type,
    plate: row.plate,
    status: row.status,
    position: row.lat !== null && row.lng !== null ? { lat: row.lat, lng: row.lng } : null,
    last_seen_at: row.last_seen_at,
    current_incident_id: row.current_incident_id,
  };
}
