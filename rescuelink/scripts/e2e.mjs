#!/usr/bin/env node
// RescueLink end-to-end test against a running deployment (local or Vercel).
// Usage: node scripts/e2e.mjs <baseUrl> <adminSecret> [--reset]
//   --reset  calls POST /api/admin/reset-incidents at the end (deletes ALL incidents/notifications).
// Creates fresh accounts (e2e-<role>-<ts>@example.com), claims one real unclaimed hospital,
// runs the whole incident lifecycle and checks the privacy rules. Exit code 1 if any step fails.

import { randomInt, randomUUID } from "node:crypto";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const [baseArg, adminSecret] = args.filter((a) => !a.startsWith("--"));
if (!baseArg) {
  console.error("Usage: node scripts/e2e.mjs <baseUrl> <adminSecret> [--reset] [--scene=lat,lng]");
  process.exit(2);
}
const BASE = baseArg.replace(/\/+$/, "");
const RESET = flags.has("--reset");

// --scene=lat,lng moves the whole test (default NUST H-12) away from other online demo units.
const sceneArg = args.find((a) => a.startsWith("--scene="));
const [sLat, sLng] = sceneArg ? sceneArg.slice(8).split(",").map(Number) : [33.6426, 72.9905];
const SCENE = { lat: sLat, lng: sLng };
const AMB_START = { lat: +(sLat + 0.0174).toFixed(4), lng: +(sLng + 0.0195).toFixed(4) };
const NEAR_SCENE = { lat: +(sLat + 0.0004).toFixed(4), lng: +(sLng + 0.0005).toFixed(4) };
const TS = Date.now();
const RAND = randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
const PASSWORD = `E2e!${RAND}x${TS % 100000}Qz`;
const CNIC = `99999-${String(randomInt(0, 10_000_000)).padStart(7, "0")}-1`;

// ---------- helpers ----------

async function req(method, path, { token, body, headers = {} } = {}) {
  const t0 = performance.now();
  const h = { ...headers };
  if (body !== undefined) h["Content-Type"] = "application/json";
  if (token) h.Authorization = `Bearer ${token}`;
  let status = 0;
  let json = null;
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: h,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    status = res.status;
    const text = await res.text();
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { error: `non-JSON response: ${text.slice(0, 120)}` };
    }
  } catch (err) {
    json = { error: `network error: ${err instanceof Error ? err.message : String(err)}` };
  }
  return { status, json, ms: Math.round(performance.now() - t0) };
}

function expect(cond, message) {
  if (!cond) throw new Error(message);
}

function expectStatus(r, ...codes) {
  if (!codes.includes(r.status)) {
    const detail = r.json?.error ?? JSON.stringify(r.json)?.slice(0, 200);
    throw new Error(`HTTP ${r.status} (expected ${codes.join("/")}): ${detail}`);
  }
}

function maskCnic(cnic) {
  const m = /^(\d{5})-(\d{7})-(\d)$/.exec(cnic ?? "");
  return m ? `${m[1]}-*****${m[2].slice(5)}-${m[3]}` : "(invalid)";
}

function haversineKm(a, b) {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(x)) * 100) / 100;
}

const info = (line) => console.log(`         ${line}`);

const state = {};
const results = [];

async function step(name, fn, needs = []) {
  const missing = needs.filter((k) => state[k] === undefined || state[k] === null);
  if (missing.length) {
    results.push("SKIP");
    console.log(`SKIP  ${name} (needs ${missing.join(", ")} from an earlier step)`);
    return;
  }
  const t0 = performance.now();
  try {
    const out = (await fn()) ?? {};
    const ms = Math.round(performance.now() - t0);
    const status = out.warn ? "WARN" : "PASS";
    results.push(status);
    console.log(`${status}  ${name} (${ms} ms)${out.detail ? ` - ${out.detail}` : ""}${out.warn ? ` - WARN: ${out.warn}` : ""}`);
  } catch (err) {
    const ms = Math.round(performance.now() - t0);
    results.push("FAIL");
    console.log(`FAIL  ${name} (${ms} ms) - ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function signup(role) {
  const email = `e2e-${role}-${TS}@example.com`;
  const r = await req("POST", "/api/auth/signup", {
    body: { email, password: PASSWORD, role, display_name: `E2E ${role} ${RAND}`, phone: "03000000000" },
  });
  expectStatus(r, 201, 200);
  expect(r.json?.access_token, "no access_token in Session");
  expect(r.json?.account?.role === role, `account.role is ${r.json?.account?.role}, expected ${role}`);
  return { token: r.json.access_token, email };
}

// ---------- run ----------

console.log(`RescueLink e2e against ${BASE}  (run ${RAND}, test CNIC ${maskCnic(CNIC)})\n`);

// a. health
await step("a. GET /api/health", async () => {
  const r = await req("GET", "/api/health");
  expectStatus(r, 200);
  expect(r.json?.ok === true, `ok is ${r.json?.ok}`);
  const out = { detail: `supabase=${r.json.supabase} gemini=${r.json.gemini} email=${r.json.email}` };
  if (!r.json.gemini) out.warn = "gemini not configured: triage will use the rule-based fallback";
  return out;
});

// b. hospital
await step("b1. signup hospital", async () => {
  const s = await signup("hospital");
  state.hospitalToken = s.token;
  return { detail: s.email };
});

await step("b2. GET /api/hospitals?near=scene -> nearest unclaimed", async () => {
  const r = await req("GET", `/api/hospitals?near=${SCENE.lat},${SCENE.lng}`);
  expectStatus(r, 200);
  expect(Array.isArray(r.json), "response is not an array");
  expect(r.json.length > 0, "no hospitals at all - run POST /api/admin/import-hospitals first");
  const h = r.json.find((x) => x.is_live === false);
  expect(h, "every hospital is already claimed - unclaim one with the SQL printed at the end of a previous run");
  state.hospitalId = h.id;
  return { detail: `${h.name} (${haversineKm(SCENE, h.location)} km from scene, ${r.json.length} hospitals listed)` };
}, ["hospitalToken"]);

await step("b3. POST /api/hospital/claim", async () => {
  const r = await req("POST", "/api/hospital/claim", { token: state.hospitalToken, body: { hospital_id: state.hospitalId } });
  expectStatus(r, 200, 201);
  expect(r.json?.id === state.hospitalId, "claimed hospital id mismatch");
  expect(r.json?.is_live === true, `is_live is ${r.json?.is_live}`);
  return { detail: r.json.name };
}, ["hospitalToken", "hospitalId"]);

await step("b4. PUT /api/hospital/me (trauma, neuro, general; 3 beds; accepting)", async () => {
  const r = await req("PUT", "/api/hospital/me", {
    token: state.hospitalToken,
    body: { capabilities: ["trauma", "neuro", "general"], er_beds_available: 3, accepting: true },
  });
  expectStatus(r, 200);
  expect(["trauma", "neuro", "general"].every((c) => r.json?.capabilities?.includes(c)), `capabilities ${JSON.stringify(r.json?.capabilities)}`);
  expect(r.json?.er_beds_available === 3, `er_beds_available ${r.json?.er_beds_available}`);
  expect(r.json?.accepting === true, `accepting ${r.json?.accepting}`);
  state.hospitalReady = true;
}, ["hospitalToken", "hospitalId"]);

// c. ambulance
await step("c1. signup ambulance", async () => {
  const s = await signup("ambulance");
  state.ambulanceToken = s.token;
  return { detail: s.email };
});

await step("c2. POST /api/ambulance/setup (ALS)", async () => {
  const r = await req("POST", "/api/ambulance/setup", {
    token: state.ambulanceToken,
    body: { call_sign: `E2E-${RAND}`, service_name: "E2E EMS", vehicle_type: "ALS", plate: "E2E-1" },
  });
  expectStatus(r, 200, 201);
  expect(r.json?.id, "no ambulance id");
  state.ambulanceId = r.json.id;
  return { detail: `${r.json.call_sign} (${r.json.id})` };
}, ["ambulanceToken"]);

await step(`c3. POST /api/ambulance/location (${AMB_START.lat}, ${AMB_START.lng})`, async () => {
  const r = await req("POST", "/api/ambulance/location", { token: state.ambulanceToken, body: AMB_START });
  expectStatus(r, 200);
  expect(r.json?.ok === true, "ok is not true");
  return { detail: `${haversineKm(SCENE, AMB_START)} km from scene` };
}, ["ambulanceId"]);

await step("c4. PUT /api/ambulance/status available", async () => {
  const r = await req("PUT", "/api/ambulance/status", { token: state.ambulanceToken, body: { status: "available" } });
  expectStatus(r, 200);
  expect(r.json?.status === "available", `status ${r.json?.status}`);
}, ["ambulanceId"]);

// d. citizen
await step("d1. signup citizen", async () => {
  const s = await signup("citizen");
  state.citizenToken = s.token;
  return { detail: s.email };
});

await step("d2. PUT /api/citizen/profile (B+, penicillin allergy, warfarin)", async () => {
  const r = await req("PUT", "/api/citizen/profile", {
    token: state.citizenToken,
    body: {
      cnic: CNIC,
      cnic_source: "typed",
      full_name: "E2E Test Patient",
      date_of_birth: "1980-01-01",
      gender: "male",
      blood_group: "B+",
      conditions: [],
      allergies: ["Penicillin"],
      medications: ["Warfarin 5 mg"],
      emergency_contact: { name: "E2E Relative", phone: "03001234567", email: null, relation: "Brother" },
    },
  });
  expectStatus(r, 200, 201);
  expect(r.json?.full_name === "E2E Test Patient", "full_name not echoed");
  state.cnicRegistered = true;
  return { detail: `CNIC ${maskCnic(r.json.cnic)}` };
}, ["citizenToken"]);

// e. anonymous incident
await step("e. anonymous POST /api/incidents (matched CNIC, AI triage, dispatch)", async () => {
  const r = await req("POST", "/api/incidents", {
    body: {
      lat: SCENE.lat,
      lng: SCENE.lng,
      description: "Motorcycle accident, rider unconscious, bleeding from the head",
      reporter_name: "E2E Passerby",
      reporter_phone: "03000000000",
      cnic: CNIC,
    },
  });
  expectStatus(r, 201);
  const inc = r.json;
  expect(inc?.id, "no incident id");
  state.incidentId = inc.id;
  info(`incident ${inc.id}  ref ${inc.ref_code}  status ${inc.status}  (${r.ms} ms)`);
  info(`identity ${inc.identity?.status}; triage ${inc.triage?.severity}/${inc.triage?.category} vehicle ${inc.triage?.vehicle_needed} source ${inc.triage?.source}`);

  // The public view hides decisions; read them through the receiving hospital's view.
  let full = inc;
  if (!inc.dispatch_decision && state.hospitalToken) {
    const v = await req("GET", `/api/incidents/${inc.id}`, { token: state.hospitalToken });
    if (v.status === 200 && v.json) full = v.json;
  }
  info(`dispatch: ${full.dispatch_decision?.chosen_reason ?? "(not visible)"}`);
  info(`hospital: ${full.hospital_decision?.chosen_reason ?? "(not visible)"}`);
  info(`risk_flags: ${JSON.stringify(full.triage?.risk_flags ?? [])}`);

  const problems = [];
  if (inc.identity?.status !== "matched") problems.push(`identity.status is ${inc.identity?.status}, expected matched`);
  if (!inc.ambulance) problems.push(`no ambulance assigned (status ${inc.status})`);
  else if (inc.ambulance.id !== state.ambulanceId)
    problems.push(`assigned ambulance is ${inc.ambulance.call_sign}, not our E2E-${RAND} - another online ambulance is closer; set it offline and rerun`);
  if (!inc.hospital) problems.push("no hospital chosen");
  else if (inc.hospital.id !== state.hospitalId)
    problems.push(`chosen hospital is ${inc.hospital.name}, not the one we claimed - another live hospital is nearer/eligible`);
  if (problems.length) throw new Error(problems.join("; "));

  if (inc.triage?.source !== "ai") return { detail: inc.ref_code, warn: `triage.source is ${inc.triage?.source} (Gemini failed or timed out)` };
  return { detail: `${inc.ref_code} -> ${inc.ambulance.call_sign} -> ${inc.hospital.name}` };
}, ["cnicRegistered"]);

// f. ambulance lifecycle
await step("f1. GET /api/ambulance/assignment", async () => {
  const r = await req("GET", "/api/ambulance/assignment", { token: state.ambulanceToken });
  expectStatus(r, 200);
  expect(r.json, "assignment is null");
  expect(r.json.id === state.incidentId, `assignment id ${r.json.id} != incident ${state.incidentId}`);
  expect(!r.json.identity?.profile?.full_name, "crew view leaks the full profile (full_name present)");
  return { detail: `brief ${r.json.brief ? "present" : "MISSING"}, first_name ${r.json.identity?.profile?.first_name ?? "-"}` };
}, ["ambulanceToken", "incidentId"]);

await step("f2. POST /api/ambulance/assignment/accept -> en_route", async () => {
  const r = await req("POST", "/api/ambulance/assignment/accept", { token: state.ambulanceToken });
  expectStatus(r, 200);
  expect(r.json?.status === "en_route", `status ${r.json?.status}`);
}, ["ambulanceToken", "incidentId"]);

await step("f3. POST /api/ambulance/location next to the patient", async () => {
  const r = await req("POST", "/api/ambulance/location", { token: state.ambulanceToken, body: NEAR_SCENE });
  expectStatus(r, 200);
}, ["ambulanceToken", "incidentId"]);

await step("f4. GET /api/incidents/:id/track (distance small)", async () => {
  const r = await req("GET", `/api/incidents/${state.incidentId}/track`);
  expectStatus(r, 200);
  const d = r.json?.distance_to_patient_km;
  expect(typeof d === "number", `distance_to_patient_km is ${d}`);
  expect(d <= 0.5, `distance_to_patient_km ${d} > 0.5`);
  expect(r.json?.eta_source === "estimate", `eta_source ${r.json?.eta_source}`);
  return { detail: `${d} km, eta ${r.json.eta_min} min, status ${r.json.status}` };
}, ["incidentId"]);

for (const s of ["at_scene", "transporting", "arrived"]) {
  await step(`f. POST /api/ambulance/assignment/status ${s}`, async () => {
    const r = await req("POST", "/api/ambulance/assignment/status", { token: state.ambulanceToken, body: { status: s } });
    expectStatus(r, 200);
    expect(r.json?.status === s, `status ${r.json?.status}`);
  }, ["ambulanceToken", "incidentId"]);
}

// g. hospital side
await step("g1. GET /api/hospital/incoming (full profile)", async () => {
  const r = await req("GET", "/api/hospital/incoming", { token: state.hospitalToken });
  expectStatus(r, 200);
  expect(Array.isArray(r.json), "not an array");
  const inc = r.json.find((x) => x.id === state.incidentId);
  expect(inc, `incident not in incoming (${r.json.length} items)`);
  expect(inc.identity?.profile?.full_name, "identity.profile.full_name missing (hospital must get the full profile)");
  expect(inc.brief, "brief missing");
  return { detail: `${inc.identity.profile.full_name}, ${inc.identity.profile.blood_group}; brief: ${inc.brief.summary}` };
}, ["hospitalToken", "incidentId"]);

await step("g2. POST /api/hospital/incidents/:id/readiness ready", async () => {
  const r = await req("POST", `/api/hospital/incidents/${state.incidentId}/readiness`, {
    token: state.hospitalToken,
    body: { readiness: "ready" },
  });
  expectStatus(r, 200);
  expect(r.json?.hospital_status?.readiness === "ready", `readiness ${r.json?.hospital_status?.readiness}`);
}, ["hospitalToken", "incidentId"]);

await step("g3. POST /api/hospital/incidents/:id/close", async () => {
  const r = await req("POST", `/api/hospital/incidents/${state.incidentId}/close`, { token: state.hospitalToken });
  expectStatus(r, 200);
  expect(r.json?.status === "closed", `status ${r.json?.status}`);
}, ["hospitalToken", "incidentId"]);

await step("g4. GET /api/incidents/:id/notifications (hospital)", async () => {
  const r = await req("GET", `/api/incidents/${state.incidentId}/notifications`, { token: state.hospitalToken });
  expectStatus(r, 200);
  expect(Array.isArray(r.json), "not an array");
  const channels = r.json.map((n) => `${n.channel}${n.channel === "email" ? `(delivered=${n.delivered})` : ""}`);
  return { detail: channels.join(", ") || "(none)" };
}, ["hospitalToken", "incidentId"]);

// h. privacy
await step("h. anonymous GET /api/incidents/:id (privacy)", async () => {
  const r = await req("GET", `/api/incidents/${state.incidentId}`);
  expectStatus(r, 200);
  expect(r.json?.brief == null, "public view exposes the brief");
  const profile = r.json?.identity?.profile;
  expect(!profile || !("full_name" in profile), "public view exposes full_name");
  expect(!profile || !("cnic" in profile), "public view exposes the CNIC");
  return { detail: `profile keys: ${profile ? Object.keys(profile).join(", ") : "(null)"}` };
}, ["incidentId"]);

// i. cleanup
await step("i1. PUT /api/ambulance/status offline", async () => {
  const r = await req("PUT", "/api/ambulance/status", { token: state.ambulanceToken, body: { status: "offline" } });
  expectStatus(r, 200);
  expect(r.json?.status === "offline", `status ${r.json?.status}`);
}, ["ambulanceId"]);

if (RESET) {
  await step("i2. POST /api/admin/reset-incidents", async () => {
    expect(adminSecret, "adminSecret argument missing");
    const r = await req("POST", "/api/admin/reset-incidents", { headers: { "x-admin-secret": adminSecret } });
    expectStatus(r, 200);
  });
}

// ---------- summary ----------
const count = (s) => results.filter((x) => x === s).length;
console.log(`\n${count("PASS")} passed, ${count("WARN")} warned, ${count("FAIL")} failed, ${count("SKIP")} skipped`);
if (state.hospitalId) {
  console.log(`\nTest hospital id: ${state.hospitalId}`);
  console.log("To unclaim it (Supabase SQL editor):");
  console.log(`  update hospitals set owner_id = null, capabilities = '{general}', er_beds_available = null where id = '${state.hospitalId}';`);
}
process.exit(count("FAIL") + count("SKIP") > 0 ? 1 : 0);
