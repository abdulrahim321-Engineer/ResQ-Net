import { writeFileSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";

const BASE = "http://localhost:3000";
const stamp = Date.now().toString();
const digits = stamp.padStart(13, "2").slice(-13);
const cnic = `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;

function curlJson(method, path, body, token) {
  const file = `_t6_body.json`;
  writeFileSync(file, JSON.stringify(body));
  const args = ["-sS", "-X", method, `${BASE}${path}`, "-H", "Content-Type: application/json", "--data-binary", `@${file}`];
  if (token) args.push("-H", `Authorization: Bearer ${token}`);
  const r = spawnSync("curl.exe", args, { encoding: "utf8" });
  try { unlinkSync(file); } catch {}
  if (r.status) throw new Error(r.stderr || `curl failed ${r.status}`);
  return JSON.parse(r.stdout);
}

const signup = curlJson("POST", "/api/auth/signup", {
  email: `triage-${stamp}@example.com`,
  password: `RL-Triage-Test-${stamp}-A9!`,
  role: "citizen",
  display_name: "Warfarin Test Patient",
  phone: "+923000000000",
});
if (!signup.access_token) {
  console.error("SIGNUP_FAILED", signup);
  process.exit(1);
}

const profile = curlJson("PUT", "/api/citizen/profile", {
  cnic,
  cnic_source: "typed",
  full_name: "Ahmed Khan",
  date_of_birth: "1988-03-15",
  gender: "male",
  blood_group: "B+",
  conditions: ["atrial fibrillation"],
  allergies: [],
  medications: ["warfarin"],
  emergency_contact: {
    name: "Emergency Contact",
    phone: "+923001111111",
    email: "relative@example.com",
    relation: "brother",
  },
}, signup.access_token);
if (!profile.user_id) {
  console.error("PROFILE_FAILED", profile);
  process.exit(1);
}

console.log("Registered warfarin profile for test A (CNIC masked in logs only).\n");

const tests = [
  ["A", { description: "motorcycle accident, unconscious, head bleeding", cnic }],
  ["B", { description: "chest pain, sweating, left arm pain" }],
  ["C", { description: "larki ka hath chai se jal gaya" }],
];

for (const [name, body] of tests) {
  console.log(`===== TEST ${name} =====`);
  const out = curlJson("POST", "/api/ai/triage", body);
  console.log(JSON.stringify(out, null, 2));
  console.log("");
}
