// Copy of rescuelink/lib/types.ts (API_CONTRACT.md v3). Keep in sync with the backend.

export type LatLng = { lat: number; lng: number };
export type Role = "citizen" | "hospital" | "ambulance";
export type Capability = "trauma" | "cardiac" | "neuro" | "burns" | "pediatric" | "obstetric" | "general";

export type Session = {
  access_token: string; refresh_token: string; expires_at: number;
  account: { id: string; email: string; role: Role; display_name: string; phone: string | null };
};

export type CitizenProfile = {
  user_id: string;
  cnic: string;                        // "35202-1234567-1"
  cnic_source: "typed" | "scanned";
  full_name: string;
  date_of_birth: string | null;        // "1990-04-12"
  gender: "male" | "female" | "other" | null;
  blood_group: string | null;
  conditions: string[]; allergies: string[]; medications: string[];
  emergency_contact: { name: string; phone: string; email: string | null; relation: string };
  updated_at: string;
};

export type ProfileLimited = {         // what the passerby / crew may see
  first_name: string;
  blood_group: string | null;
  critical_alerts: string[];           // "Allergic to penicillin", "Takes warfarin (blood thinner: bleeding risk)"
};

export type Hospital = {
  id: string; name: string; address: string | null; location: LatLng; phone: string | null;
  source: "osm" | "registered";
  is_live: boolean;                    // claimed by a hospital account
  capabilities: Capability[];
  er_beds_available: number | null;    // null = unknown (unclaimed)
  accepting: boolean;
  updated_at: string | null;
};

export type Ambulance = {
  id: string; call_sign: string; service_name: string; vehicle_type: "ALS" | "BLS"; plate: string | null;
  status: "offline" | "available" | "assigned" | "busy";
  position: LatLng | null;             // last GPS fix
  last_seen_at: string | null;
  current_incident_id: string | null;
};

export type Triage = {
  severity: "critical" | "serious" | "moderate" | "minor";
  category: "trauma" | "cardiac" | "stroke" | "burns" | "respiratory" | "obstetric" | "pediatric" | "other";
  suspected_injuries: string[];
  required_capabilities: Capability[];
  vehicle_needed: "ALS" | "BLS";
  risk_flags: string[];
  first_aid_steps: string[];           // max 5, for an untrained bystander
  reasoning: string;
  source: "ai" | "fallback";
};

export type Brief = {
  summary: string;
  atmist: { age: string; time: string; mechanism: string; injuries: string; signs: string; treatment: string };
  prep_checklist: string[];
};

export type IncidentStatus = "assigned" | "en_route" | "at_scene" | "transporting" | "arrived" | "closed" | "no_ambulance";

export type Incident = {
  id: string; ref_code: string; status: IncidentStatus; created_at: string;
  location: LatLng & { address: string | null };   // the patient's pin
  description: string;
  reporter: { name: string | null; phone: string | null };
  identity: { status: "matched" | "name_mismatch" | "not_registered" | "unreadable" | "unknown";
              profile: ProfileLimited | CitizenProfile | null };   // full CitizenProfile only for the receiving hospital
  triage: Triage;
  ambulance: Pick<Ambulance, "id" | "call_sign" | "service_name" | "vehicle_type" | "plate"> | null;
  hospital: Pick<Hospital, "id" | "name" | "location" | "phone"> | null;
  dispatch_decision: {
    candidates: { ambulance_id: string; call_sign: string; vehicle_type: "ALS" | "BLS"; distance_km: number; eta_min: number; score: number }[];
    chosen_id: string | null; chosen_reason: string;
  } | null;
  hospital_decision: {
    candidates: { hospital_id: string; name: string; distance_km: number; capability_match: boolean; er_beds_available: number | null; accepting: boolean; eligible: boolean; skip_reason: string | null }[];
    chosen_id: string | null; chosen_reason: string;
  } | null;
  brief: Brief | null;                 // crew + receiving hospital only
  hospital_status: { readiness: "pending" | "preparing" | "ready"; acknowledged_at: string | null };
  timeline: { assigned_at: string | null; accepted_at: string | null; at_scene_at: string | null; picked_up_at: string | null; arrived_at: string | null };
};

export type Track = {                  // polled by caller, crew and hospital
  incident_id: string; status: IncidentStatus;
  patient_location: LatLng;
  ambulance_position: LatLng | null;
  ambulance_last_seen_at: string | null;
  hospital_location: LatLng | null;
  distance_to_patient_km: number | null;   // ambulance -> patient (null once at scene or later)
  distance_to_hospital_km: number | null;  // ambulance -> hospital (during transport)
  eta_min: number | null;                  // for the current leg
  eta_source: "estimate";
};

export type Notification = {
  id: string; incident_id: string;
  channel: "email" | "whatsapp_link" | "hospital_dashboard" | "ambulance_app" | "reporter";
  to: string; message: string; whatsapp_link: string | null;
  delivered: boolean; created_at: string;
};
