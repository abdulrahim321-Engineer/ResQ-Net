# RescueLink API Contract (v3)

Base URL: `https://<your-app>.vercel.app` (local `http://localhost:3000`).
JSON everywhere. Errors: `{ "error": "message" }`. CORS open.
**Status:** every endpoint is real (no mocks, no `x-mock` header). Invalid ambulance status transitions return 409.
**Auth:** store `access_token` from signup/login, send `Authorization: Bearer <token>`. On 401 call `/api/auth/refresh`.
**Live updates:** poll every 3 s. No websockets.
**Images:** base64 WITHOUT the `data:...;base64,` prefix. Resize on the client to max 1280px, JPEG 0.85.
**GPS:** the ambulance app calls `POST /api/ambulance/location` every 5 s while online (`navigator.geolocation.watchPosition`, needs HTTPS).

---

## Types

```ts
type LatLng = { lat: number; lng: number };
type Role = "citizen" | "hospital" | "ambulance";
type Capability = "trauma" | "cardiac" | "neuro" | "burns" | "pediatric" | "obstetric" | "general";

type Session = {
  access_token: string; refresh_token: string; expires_at: number;
  account: { id: string; email: string; role: Role; display_name: string; phone: string | null };
};

type CitizenProfile = {
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

type ProfileLimited = {                // what the passerby / crew may see
  first_name: string;
  blood_group: string | null;
  critical_alerts: string[];           // "Allergic to penicillin", "Takes warfarin (blood thinner: bleeding risk)"
};

type Hospital = {
  id: string; name: string; address: string | null; location: LatLng; phone: string | null;
  source: "osm" | "registered";
  is_live: boolean;                    // claimed by a hospital account
  capabilities: Capability[];
  er_beds_available: number | null;    // null = unknown (unclaimed)
  accepting: boolean;
  updated_at: string | null;
};

type Ambulance = {
  id: string; call_sign: string; service_name: string; vehicle_type: "ALS" | "BLS"; plate: string | null;
  status: "offline" | "available" | "assigned" | "busy";
  position: LatLng | null;             // last GPS fix
  last_seen_at: string | null;
  current_incident_id: string | null;
};

type Triage = {
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

type Brief = {
  summary: string;
  atmist: { age: string; time: string; mechanism: string; injuries: string; signs: string; treatment: string };
  prep_checklist: string[];
};

type IncidentStatus = "assigned" | "en_route" | "at_scene" | "transporting" | "arrived" | "closed" | "no_ambulance";

type Incident = {
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

type Track = {                         // polled by caller, crew and hospital
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

type Notification = {
  id: string; incident_id: string;
  channel: "email" | "whatsapp_link" | "hospital_dashboard" | "ambulance_app" | "reporter";
  to: string; message: string; whatsapp_link: string | null;
  delivered: boolean; created_at: string;
};
```

**Who sees what** in `GET /api/incidents/:id`:
| Caller | identity.profile | brief | decisions |
|---|---|---|---|
| no token / reporter / citizen | ProfileLimited | ✗ | ✗ |
| ambulance assigned to it | ProfileLimited | ✓ | ✓ |
| hospital receiving it | full CitizenProfile | ✓ | ✓ |
| any other hospital/ambulance account | 403 | | |

`/track` is public (positions only, no personal data).

---

## Endpoints

### Auth
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/auth/signup` | `{ email, password, role, display_name, phone? }` | `Session` (201) |
| POST | `/api/auth/login` | `{ email, password }` | `Session` |
| POST | `/api/auth/refresh` | `{ refresh_token }` | `Session` |
| GET | `/api/me` | – | `{ account, citizen_profile: CitizenProfile \| null, hospital: Hospital \| null, ambulance: Ambulance \| null }` |

### Citizen (role citizen)
| Method | Path | Body | Returns |
|---|---|---|---|
| PUT | `/api/citizen/profile` | CitizenProfile fields except `user_id`, `updated_at` | `CitizenProfile`. 409 if the CNIC belongs to another account |
| GET | `/api/citizen/profile` | – | `CitizenProfile` or 404 |
| GET | `/api/citizen/incidents` | – | `Incident[]` (public view) reported by or about them |

### AI
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/ai/scan-cnic` | `{ image_base64, mime_type, purpose: "register" \| "identify" }` | `{ extracted: { cnic, full_name, date_of_birth, gender }, confidence: "high"\|"medium"\|"low", source: "ai"\|"fallback", verification?: "matched"\|"name_mismatch"\|"not_registered"\|"unreadable", profile?: ProfileLimited \| null }`. `register` (citizen token) = autofill only. `identify` (no login) = also looks up + verifies |
| POST | `/api/ai/triage` | `{ description, scene_image_base64?, mime_type?, cnic? }` | `{ triage: Triage, brief: Brief, relative_message: string }` (preview only; nothing is saved). Optional `cnic` loads that citizen profile for risk flags / brief. |

### Incidents
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/incidents` | `{ lat, lng, address?, description, reporter_name?, reporter_phone?, for_self?: boolean, cnic?, scene_image_base64?, mime_type? }`. Token optional; `for_self` needs a citizen token | `Incident` (201, caller's view). Takes 5–15 s |
| GET | `/api/incidents/:id` | – | `Incident` (role view) |
| GET | `/api/incidents/:id/track` | – | `Track` (public) |
| GET | `/api/incidents/:id/notifications` | – | `Notification[]` (crew / receiving hospital only) |

### Hospital (role hospital)
| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/hospitals?near=lat,lng&q=` | public | `Hospital[]` sorted by distance when `near` given |
| POST | `/api/hospital/claim` | `{ hospital_id }` | `Hospital` |
| POST | `/api/hospital/create` | `{ name, lat, lng, address?, phone? }` | `Hospital` |
| PUT | `/api/hospital/me` | `{ capabilities?, er_beds_available?, accepting?, phone? }` | `Hospital` |
| GET | `/api/hospital/incoming` | – | `Incident[]` (hospital view, not closed, newest first) |
| POST | `/api/hospital/incidents/:id/readiness` | `{ readiness: "preparing" \| "ready" }` | `Incident` |
| POST | `/api/hospital/incidents/:id/close` | – | `Incident` (frees the bed) |

### Ambulance (role ambulance)
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/ambulance/setup` | `{ call_sign, service_name, vehicle_type, plate? }` | `Ambulance` |
| PUT | `/api/ambulance/status` | `{ status: "available" \| "offline" }` | `Ambulance` |
| POST | `/api/ambulance/location` | `{ lat, lng, accuracy_m? }` | `{ ok: true }` |
| GET | `/api/ambulance/assignment` | – | `Incident \| null` (crew view: patient pin, brief, limited profile, hospital) |
| POST | `/api/ambulance/assignment/accept` | – | `Incident` (status en_route) |
| POST | `/api/ambulance/assignment/decline` | – | `{ ok: true }` (reassigns to the next candidate) |
| POST | `/api/ambulance/assignment/status` | `{ status: "at_scene" \| "transporting" \| "arrived" }` | `Incident` |

### Control room (public, no personal data)
| Method | Path | Returns |
|---|---|---|
| GET | `/api/control/overview` | `{ counts: { active_incidents, ambulances_online, ambulances_available, live_hospitals }, ambulances: Ambulance[], hospitals: Hospital[] (live only), incidents: { id, ref_code, status, severity, category, location, ambulance_call_sign, hospital_name }[] }` |

### Admin (header `x-admin-secret: <ADMIN_SECRET>`)
| Method | Path | Returns |
|---|---|---|
| POST | `/api/admin/import-hospitals` | `{ imported: number }` (real hospitals from OpenStreetMap, Islamabad + Rawalpindi) |
| POST | `/api/admin/reset-incidents` | `{ ok: true }` (deletes incidents/notifications, frees ambulances, keeps accounts) |
| GET | `/api/health` | `{ ok, supabase, gemini, email }` (public) |
