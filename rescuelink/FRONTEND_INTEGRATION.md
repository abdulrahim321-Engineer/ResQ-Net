# RescueLink: Frontend Integration

For the teammate building the real frontend. The API is **fully real now**: real Supabase accounts, real Gemini, real OSM hospitals. There is **no `x-mock` header** any more; remove it if your code still sends it.

- Source of truth for every shape: [`API_CONTRACT.md`](./API_CONTRACT.md). Types in this doc are names from that file.
- Base URL: `http://localhost:3000` locally, the Vercel URL in production. CORS is open (`*`), so the frontend can live on another origin.
- Errors are always `{ "error": "message" }` with 400/401/403/404/409/500. Show `error` to the user as-is.
- Auth: `Authorization: Bearer <access_token>`. Never talk to Supabase directly from the browser.
- Live updates: **poll every 3 s**. The ambulance app **posts GPS every 5 s**. No websockets.
- Images: base64 **without** the `data:...;base64,` prefix, plus `mime_type`. Resize first (max 1280 px, JPEG 0.85). The server rejects anything over 4 MB.
- GPS (`navigator.geolocation`) needs HTTPS (Vercel is fine; `localhost` is also allowed).

---

## 1. Shared snippets (paste these first)

### 1.1 `lib/api.ts`: fetch wrapper (session in localStorage `rl_session`, one refresh retry on 401)

```ts
// lib/api.ts
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

export type Role = "citizen" | "hospital" | "ambulance";
export type Session = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  account: { id: string; email: string; role: Role; display_name: string; phone: string | null };
};

const KEY = "rl_session";

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
export function setSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {}
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function refresh(): Promise<boolean> {
  const s = getSession();
  if (!s?.refresh_token) return false;
  const res = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: s.refresh_token }),
  });
  if (!res.ok) {
    setSession(null);
    return false;
  }
  setSession((await res.json()) as Session);
  return true;
}

export async function api<T>(
  path: string,
  opts: { method?: "GET" | "POST" | "PUT"; body?: unknown; auth?: boolean } = {},
  retried = false,
): Promise<T> {
  const { method = "GET", body, auth = true } = opts;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const s = auth ? getSession() : null;
  if (s) headers.Authorization = `Bearer ${s.access_token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 401 && s && !retried && (await refresh())) {
    return api<T>(path, opts, true);
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, json?.error ?? `HTTP ${res.status}`);
  return json as T;
}

// Convenience
export async function signup(body: { email: string; password: string; role: Role; display_name: string; phone?: string }) {
  const s = await api<Session>("/api/auth/signup", { method: "POST", body, auth: false });
  setSession(s);
  return s;
}
export async function login(email: string, password: string) {
  const s = await api<Session>("/api/auth/login", { method: "POST", body: { email, password }, auth: false });
  setSession(s);
  return s;
}
export const logout = () => setSession(null);
```

Use `auth: false` for the public reporter/track screens so a stale token from another role does not cause a 403.

### 1.2 `lib/image.ts`: resize a photo to base64 (canvas, max 1280 px, JPEG 0.85, no `data:` prefix)

```ts
// lib/image.ts
export async function fileToBase64Jpeg(
  file: File,
  maxSide = 1280,
  quality = 0.85,
): Promise<{ image_base64: string; mime_type: "image/jpeg" }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Could not read the image"));
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    const image_base64 = dataUrl.slice(dataUrl.indexOf(",") + 1); // strip "data:image/jpeg;base64,"
    if ((image_base64.length * 3) / 4 > 4 * 1024 * 1024) throw new Error("Image is larger than 4 MB");
    return { image_base64, mime_type: "image/jpeg" };
  } finally {
    URL.revokeObjectURL(url);
  }
}
```

Use `<input type="file" accept="image/*" capture="environment">` to open the phone camera. Keep the image in memory only; do not save CNIC photos to localStorage.

### 1.3 `lib/usePolling.ts`: poll every 3 s

```ts
// lib/usePolling.ts
"use client";
import { useEffect, useRef, useState } from "react";

export function usePolling<T>(fetcher: (() => Promise<T>) | null, intervalMs = 3000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef(fetcher);
  ref.current = fetcher;

  useEffect(() => {
    if (!fetcher) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const d = await ref.current!();
        if (alive) {
          setData(d);
          setError(null);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
      if (alive) timer = setTimeout(tick, intervalMs); // schedule after the response: no overlapping requests
    };
    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher === null, intervalMs]);

  return { data, error };
}
```

Usage: `const { data: track } = usePolling(() => api<Track>(\`/api/incidents/${id}/track\`, { auth: false }));`

### 1.4 `lib/useGpsSender.ts`: ambulance GPS (watchPosition, post every 5 s)

```ts
// lib/useGpsSender.ts
"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "./api";

export function useGpsSender(enabled: boolean, intervalMs = 5000) {
  const latest = useRef<GeolocationPosition | null>(null);
  const [lastSent, setLastSent] = useState<{ lat: number; lng: number; at: Date } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !("geolocation" in navigator)) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        latest.current = pos;
        setError(null);
      },
      (err) => setError(err.message),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );
    const timer = setInterval(async () => {
      const pos = latest.current;
      if (!pos) return;
      const body = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy_m: pos.coords.accuracy };
      try {
        await api("/api/ambulance/location", { method: "POST", body });
        setLastSent({ lat: body.lat, lng: body.lng, at: new Date() });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }, intervalMs);
    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearInterval(timer);
    };
  }, [enabled, intervalMs]);

  return { lastSent, error };
}

// Indoor demo: the driver taps the map to set the position instead of driving.
export const sendManualPosition = (lat: number, lng: number) =>
  api("/api/ambulance/location", { method: "POST", body: { lat, lng } });
```

When using the manual tap mode, disable the GPS sender (`enabled=false`) or it will overwrite the tapped point 5 s later.

### 1.5 Maps

- Leaflet + react-leaflet + OSM tiles, always loaded with `dynamic(() => import("./Map"), { ssr: false })`.
- Navigation is handed to Google Maps: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`.
- ETAs are estimates (`eta_source: "estimate"`, straight-line km x 1.3 / 30 km/h). Label them "approx." in the UI.

---

## 2. Screens

### 2.1 Login / signup (`/login`)
1. `POST /api/auth/signup { email, password, role, display_name, phone? }` (201, `Session`) or `POST /api/auth/login { email, password }` -> `setSession(s)`.
2. `GET /api/me` -> `{ account, citizen_profile, hospital, ambulance }`. Route by `account.role`:
   - citizen: `citizen_profile` null -> profile setup, else citizen home.
   - hospital: `hospital` null -> claim/create, else hospital dashboard.
   - ambulance: `ambulance` null -> vehicle setup, else ambulance home.
3. On app load, call `GET /api/me`; the wrapper refreshes once on 401, and if that fails the session is cleared -> show login.

Put a big **"Report an emergency (no login)"** button on the login screen. Emergency help must never require an account.

### 2.2 Citizen (`/citizen`)
Registration:
1. Photograph the CNIC front -> `fileToBase64Jpeg` -> `POST /api/ai/scan-cnic { image_base64, mime_type, purpose: "register" }` -> pre-fill `extracted.cnic`, `full_name`, `date_of_birth`, `gender`. Show `confidence`; if `low` or any field null, ask the user to type it. If `source: "fallback"`, AI was unavailable: let them type everything.
2. User adds blood group, conditions, allergies, medications, emergency contact.
3. `PUT /api/citizen/profile { cnic, cnic_source: "scanned" | "typed", full_name, date_of_birth, gender, blood_group, conditions, allergies, medications, emergency_contact: { name, phone, email, relation } }`. 409 = CNIC already registered to another account.

Home:
- `GET /api/citizen/profile` (404 = not registered yet).
- "Request ambulance for me": get GPS once (`getCurrentPosition`), then `POST /api/incidents { lat, lng, description, for_self: true }` with the citizen token. Takes 5-15 s: show a spinner ("Analysing and dispatching..."). Then go to the track screen with `incident.id`.
- `GET /api/citizen/incidents` for history (public view).

### 2.3 Report (public, no login) (`/report`)
1. Get GPS: `navigator.geolocation.getCurrentPosition` (allow dragging the pin on the map to correct it).
2. Description text (English / Urdu / Roman Urdu all fine), optional scene photo, optional reporter name/phone.
3. Optional victim CNIC photo -> `POST /api/ai/scan-cnic { image_base64, mime_type, purpose: "identify" }` (no token). Response has `verification` (`matched` / `name_mismatch` / `not_registered` / `unreadable`) and `profile: ProfileLimited | null`. Show **first name, blood group, critical alerts only**. Keep `extracted.cnic` in memory to send with the incident.
4. `POST /api/incidents { lat, lng, address?, description, reporter_name?, reporter_phone?, cnic?, scene_image_base64?, mime_type? }` with `auth: false`. Wait 5-15 s (spinner). Response is `Incident` (public view).
5. Show immediately: `ref_code`, `triage.severity`, `triage.first_aid_steps` (big, numbered: this is what the passerby does while waiting), the ambulance call sign and hospital name, then route to `/track/<id>`. Save `incident.id` in localStorage (e.g. `rl_last_incident`) so the reporter can reopen tracking.
6. If `status === "no_ambulance"`: say so clearly and show "Call 1122" as a fallback.

### 2.4 Track (public) (`/track/[id]`)
- Poll `GET /api/incidents/:id/track` every 3 s (`auth: false`). Draw `patient_location`, `ambulance_position` (moving), `hospital_location`.
- Show the current leg: `distance_to_patient_km` (until at scene) or `distance_to_hospital_km` (during transport), `eta_min` labelled "approx.", and `ambulance_last_seen_at` ("updated 4 s ago").
- Optionally poll `GET /api/incidents/:id` every 3 s (or less often) for status text, ambulance/hospital names and first-aid steps. Public view: limited profile, no brief.
- Stop polling when `status` is `arrived`, `closed` or `no_ambulance`.

### 2.5 Ambulance (`/ambulance`)
Setup (once): `POST /api/ambulance/setup { call_sign, service_name, vehicle_type: "ALS" | "BLS", plate? }`.

Shift:
1. "Go online": `PUT /api/ambulance/status { status: "available" }` and start `useGpsSender(true)` (posts `POST /api/ambulance/location` every 5 s). Offer a "tap map to set position" toggle for indoor demos.
2. Poll `GET /api/ambulance/assignment` every 3 s. `null` = waiting. An `Incident` = new job (crew view: patient pin, limited profile, brief, hospital, decisions).
3. New job card: severity, category, `triage.risk_flags`, `brief.summary`, patient pin, hospital. Buttons:
   - Accept: `POST /api/ambulance/assignment/accept` -> status `en_route`.
   - Decline: `POST /api/ambulance/assignment/decline` -> `{ ok: true }` (reassigned to the next candidate).
4. En route: "Open in Google Maps" to the patient pin; poll `GET /api/incidents/:id/track` every 3 s for distance/ETA.
5. Status buttons, in order: `POST /api/ambulance/assignment/status { status: "at_scene" }` -> `{ status: "transporting" }` (picked up; then the Google Maps link points to the hospital) -> `{ status: "arrived" }`.
6. "Go offline": `PUT /api/ambulance/status { status: "offline" }` and stop the GPS sender.

### 2.6 Hospital (`/hospital`)
Setup (once):
1. `GET /api/hospitals?near=<lat>,<lng>&q=<search>` (public) -> list real OSM hospitals sorted by distance. `is_live: true` means already claimed.
2. `POST /api/hospital/claim { hospital_id }`, or if missing `POST /api/hospital/create { name, lat, lng, address?, phone? }`.

Dashboard:
- Capacity panel: `PUT /api/hospital/me { capabilities?, er_beds_available?, accepting?, phone? }` (capabilities from `trauma, cardiac, neuro, burns, pediatric, obstetric, general`). A hospital is only chosen if it is accepting, has beds > 0 and matches the required capabilities.
- Poll `GET /api/hospital/incoming` every 3 s -> `Incident[]` (not closed, newest first). Each has the **full** `CitizenProfile` in `identity.profile` (name, CNIC, DOB, allergies, medications, emergency contact) plus `brief` (summary, ATMIST, prep checklist). Play a sound / highlight when a new id appears.
- For each incoming patient poll `GET /api/incidents/:id/track` every 3 s to show ambulance distance/ETA to the hospital.
- Readiness: `POST /api/hospital/incidents/:id/readiness { readiness: "preparing" }` then `{ readiness: "ready" }`.
- After handover: `POST /api/hospital/incidents/:id/close` (status `closed`, frees the bed).
- `GET /api/incidents/:id/notifications` -> show what was sent (email `delivered`, WhatsApp click-to-send `whatsapp_link`, dashboard, ambulance app, reporter).

### 2.7 Control room (public) (`/control`)
- Poll `GET /api/control/overview` every 3 s: `counts`, `ambulances` (positions + status), live `hospitals`, active `incidents` (ref, status, severity, category, location, ambulance call sign, hospital name). No personal data.
- One map with all three layers, plus a table of active incidents.

---

## 3. Privacy rules the UI must respect
- Never store CNIC photos (keep the base64 in memory, drop it after the request).
- Do not print full CNICs on public screens. If you show one, mask it like `35202-*****01-1`.
- The public/report/track screens only ever get `ProfileLimited` (first name, blood group, critical alerts). Do not try to fetch more.
- The full profile is shown only on the receiving hospital's dashboard.

## 4. Polling cheat sheet
| Screen | Call | Interval |
|---|---|---|
| Track (public) | `GET /api/incidents/:id/track` | 3 s |
| Ambulance | `GET /api/ambulance/assignment` | 3 s |
| Ambulance (online) | `POST /api/ambulance/location` | 5 s |
| Ambulance (en route) | `GET /api/incidents/:id/track` | 3 s |
| Hospital | `GET /api/hospital/incoming` | 3 s |
| Hospital (per patient) | `GET /api/incidents/:id/track` | 3 s |
| Control | `GET /api/control/overview` | 3 s |

## 5. Testing without the UI
- `node scripts/e2e.mjs <baseUrl> <adminSecret>` runs the whole flow with fresh accounts.
- `node scripts/watch.mjs <baseUrl> <incidentId>` prints live tracking in the terminal.
