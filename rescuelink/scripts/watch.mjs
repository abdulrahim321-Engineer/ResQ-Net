#!/usr/bin/env node
// Live-tracks an incident from the terminal.
// Usage: node scripts/watch.mjs <baseUrl> <incidentId>
// Polls GET /api/incidents/:id/track every 3 s; exits on arrived / closed / no_ambulance.

const [, , baseArg, incidentId] = process.argv;
if (!baseArg || !incidentId) {
  console.error("Usage: node scripts/watch.mjs <baseUrl> <incidentId>");
  process.exit(2);
}
const base = baseArg.replace(/\/+$/, "");
const TERMINAL = new Set(["arrived", "closed", "no_ambulance"]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fmtPos = (p) => (p ? `${p.lat.toFixed(5)},${p.lng.toFixed(5)}` : "-");
const fmtNum = (n, unit) => (n === null || n === undefined ? "-" : `${n}${unit}`);

console.log(`Watching ${incidentId} at ${base} (Ctrl+C to stop)`);
let failures = 0;

for (;;) {
  const time = new Date().toLocaleTimeString();
  try {
    const res = await fetch(`${base}/api/incidents/${encodeURIComponent(incidentId)}/track`);
    const json = await res.json().catch(() => null);
    if (!res.ok || !json) {
      failures += 1;
      console.log(`${time}  HTTP ${res.status}  ${json?.error ?? "no JSON body"}`);
      if (res.status === 404 || failures >= 10) process.exit(1);
    } else {
      failures = 0;
      const leg =
        json.distance_to_patient_km !== null && json.distance_to_patient_km !== undefined
          ? `to patient ${fmtNum(json.distance_to_patient_km, " km")}`
          : json.distance_to_hospital_km !== null && json.distance_to_hospital_km !== undefined
            ? `to hospital ${fmtNum(json.distance_to_hospital_km, " km")}`
            : "distance -";
      console.log(
        `${time}  ${String(json.status).padEnd(13)} ${leg.padEnd(24)} eta ${fmtNum(json.eta_min, " min").padEnd(9)} amb ${fmtPos(json.ambulance_position)}`,
      );
      if (TERMINAL.has(json.status)) {
        console.log(`Final status: ${json.status}`);
        process.exit(0);
      }
    }
  } catch (err) {
    failures += 1;
    console.log(`${time}  network error: ${err instanceof Error ? err.message : String(err)}`);
    if (failures >= 10) process.exit(1);
  }
  await sleep(3000);
}
