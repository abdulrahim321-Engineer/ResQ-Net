import type { CitizenProfile, ProfileLimited } from "./types";
import type { CitizenProfileRow } from "./mappers";

type Profile = CitizenProfile | CitizenProfileRow;

export function normaliseCnic(value: string): string | null {
  const digits = value.replace(/-/g, "");
  if (!/^\d{13}$/.test(digits)) return null;
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

export function maskCnic(value: string): string {
  const normalised = normaliseCnic(value);
  if (!normalised) return "***";
  return `${normalised.slice(0, 5)}-*****${normalised.slice(-4)}`; // 35202-*****01-1
}

export function toLimited(profile: Profile): ProfileLimited {
  const alerts = profile.allergies.map((allergy) => `Allergic to ${allergy}`);
  for (const medication of profile.medications) {
    const lower = medication.toLowerCase();
    if (["warfarin", "apixaban", "rivaroxaban", "clopidogrel", "aspirin"].some((name) => lower.includes(name))) {
      alerts.push(`Takes ${medication} (blood thinner: bleeding risk)`);
    } else if (lower.includes("insulin")) {
      alerts.push("Takes insulin (hypoglycaemia risk)");
    }
  }
  for (const condition of profile.conditions) {
    if (/pregnan|epilep|diabet|heart|cardiac|stent|asthma/i.test(condition)) alerts.push(condition);
  }
  return {
    first_name: profile.full_name.trim().split(/\s+/)[0] ?? profile.full_name,
    blood_group: profile.blood_group,
    critical_alerts: alerts,
  };
}

function nameTokens(value: string): string[] {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z]/g, ""))
    .filter((token) => token && !["muhammad", "mohammad", "md"].includes(token));
}

export function nameMatches(a: string, b: string): boolean {
  const left = nameTokens(a);
  const right = nameTokens(b);
  if (!left.length || !right.length) return false;
  const rightSet = new Set(right);
  const overlap = left.filter((token) => rightSet.has(token)).length;
  return overlap / Math.min(left.length, right.length) >= 0.5;
}
