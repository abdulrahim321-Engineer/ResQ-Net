# RescueLink — Smart Ambulance & Emergency Response (Build With AI, AICON'26)

Hackathon MVP, hard deadline tonight. Domain: Health Operations.
Goal: a REAL working system with real accounts, real CNIC reading, real hospitals, real phone GPS, real AI.
KEEP IT SIMPLE. No routing engine, no traffic, no simulation code.

## Three account types (Supabase Auth, email + password)
- **citizen**: registers an emergency profile by photographing their CNIC (Gemini auto-fills CNIC number, name, DOB, gender) + blood group, conditions, allergies, medications, emergency contact. Can request an ambulance for themselves.
- **hospital**: claims a real hospital (imported from OpenStreetMap) or creates one; maintains capabilities, ER beds available, accepting. Sees incoming patients with the FULL registered profile + AI handover brief; sets readiness.
- **ambulance**: registers a vehicle (call sign, ALS/BLS, plate), goes online, phone sends GPS. Receives assignments, accepts/declines, sees the patient's pin + "Open in Google Maps", taps At scene / Picked up / Arrived.
- **anyone, no login**: reports an accident and tracks the ambulance's live location. Emergency help must never require an account.

## End-to-end flow (the demo)
1. Passerby (no login) reports: GPS pin, description, optional scene photo, optional photo of the victim's CNIC.
2. Gemini vision reads the CNIC number -> lookup registered profile -> name cross-check -> "matched". Passerby sees first name, blood group, critical alerts only.
3. Gemini triage (description + photo + victim's medical profile) -> severity, category, required hospital capabilities, risk flags, first-aid steps, handover brief, relative message.
4. Dispatch: online ambulances ranked by straight-line distance, ALS preferred for critical/serious -> assigned.
5. Hospital: live hospitals with matching capabilities, beds > 0, accepting, nearest to the scene. Receives the full patient profile + brief instantly.
6. Notifications: hospital dashboard, ambulance app, reporter, relative (real email via Gmail + WhatsApp click-to-send link).
7. Live tracking: ambulance phone posts GPS every 5 s; caller sees the ambulance moving toward them; ambulance sees the patient's pin; hospital sees distance/ETA. Driver taps status buttons.
8. Hospital: preparing -> ready -> close (frees the bed).

## What is simulated (say it in the pitch)
- ETA = straight-line km x 1.3 / 30 km/h, labelled `eta_source: "estimate"`. Real navigation is handed to Google Maps.
- Identity: CNIC number read by AI + name cross-check against our registered profile (no NADRA access).
- Indoor demo: the driver can tap the map to set the ambulance position instead of driving.

## Stack
- Next.js (App Router, TypeScript, Tailwind). Backend = Route Handlers in `app/api/**/route.ts`.
- Supabase Postgres + Auth, SERVER-SIDE ONLY with the secret/service-role key. Frontends call our `/api/auth/*` and send `Authorization: Bearer <access_token>`. No client-side Supabase.
- Gemini via `@google/genai`, structured JSON (`responseMimeType: "application/json"` + `responseSchema`), model from env `GEMINI_MODEL`.
- Overpass API for importing real hospitals (one-time admin call).
- Email: `nodemailer` + Gmail SMTP app password (optional; skip silently if env missing).
- Test UI maps: Leaflet + react-leaflet + OSM tiles, `dynamic(..., { ssr: false })`.
- Deploy: Vercel. `export const maxDuration = 60` on routes that call Gemini/Overpass.
- Live updates: clients POLL every 3 s. No Supabase Realtime, no websockets.

## Folder layout
```
app/api/...            thin handlers: auth -> zod validate -> lib -> JSON
app/test/...           minimal test UI (a teammate builds the real frontend)
lib/supabase.ts        server admin client
lib/auth.ts            getUser(req), requireRole(req, roles[]), optionalUser(req)
lib/types.ts           mirrors API_CONTRACT.md exactly
lib/mappers.ts         DB row -> contract shapes
lib/geo.ts             haversineKm, estimateEtaMin
lib/ai/gemini.ts       generateJson helper (timeout + retry)
lib/ai/cnic.ts         CNIC image -> fields
lib/ai/triage.ts       triage + brief + relative message (ONE call)
lib/ai/fallback.ts     rule-based triage
lib/profiles.ts        normaliseCnic, maskCnic, toLimited, nameMatches
lib/hospitals.ts       Overpass import, claim, ranking
lib/ambulances.ts      dispatchable list, ranking
lib/incidents.ts       create pipeline, status machine, role views
lib/notify.ts          email + whatsapp link + notification rows
```

## Rules for every change
- API_CONTRACT.md is the source of truth. If a shape must change, update the contract in the same change and tell me exactly what changed (a teammate's frontend depends on it).
- JSON everywhere. Errors `{ "error": "message" }` with 400/401/403/404/409/500.
- CORS on all `/api/*`: origin `*`, methods GET/POST/PUT/OPTIONS, headers `Content-Type, Authorization`, answer OPTIONS.
- Gemini: 20 s timeout -> rule-based fallback (`source: "fallback"`). Email failure -> `delivered: false`, never fail the request. The demo must never crash.
- PRIVACY (real CNICs): never store CNIC images (memory only), never log base64 or full CNIC numbers (mask as `35202-*****01-1`). Full medical profile only to the hospital receiving that patient and the assigned crew's limited view. Public views get the limited profile only.
- Images: base64 without `data:` prefix + `mime_type`; reject > 4 MB.
- Distances in km (2 decimals), ETAs in minutes (1 decimal), timestamps ISO.
- After each module run `npm run build` and fix errors before saying done.
