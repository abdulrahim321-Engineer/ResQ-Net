import "server-only";
import { Type } from "@google/genai";
import type { Brief, Capability, CitizenProfile, Triage } from "../types";
import { generateJson } from "./gemini";
import { fallbackEmergency, type EmergencyAnalysis } from "./fallback";

export type { EmergencyAnalysis };

const SEVERITY = ["critical", "serious", "moderate", "minor"] as const;
const CATEGORY = ["trauma", "cardiac", "stroke", "burns", "respiratory", "obstetric", "pediatric", "other"] as const;
const CAPABILITY = ["trauma", "cardiac", "neuro", "burns", "pediatric", "obstetric", "general"] as const;
const VEHICLE = ["ALS", "BLS"] as const;

const STRING_ARRAY = { type: Type.ARRAY, items: { type: Type.STRING } };

const TRIAGE_RESULT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    triage: {
      type: Type.OBJECT,
      properties: {
        severity: { type: Type.STRING, enum: [...SEVERITY] },
        category: { type: Type.STRING, enum: [...CATEGORY] },
        suspected_injuries: STRING_ARRAY,
        required_capabilities: { type: Type.ARRAY, items: { type: Type.STRING, enum: [...CAPABILITY] } },
        vehicle_needed: { type: Type.STRING, enum: [...VEHICLE] },
        risk_flags: STRING_ARRAY,
        first_aid_steps: STRING_ARRAY,
        reasoning: { type: Type.STRING },
      },
      required: [
        "severity",
        "category",
        "suspected_injuries",
        "required_capabilities",
        "vehicle_needed",
        "risk_flags",
        "first_aid_steps",
        "reasoning",
      ],
    },
    brief: {
      type: Type.OBJECT,
      properties: {
        summary: { type: Type.STRING },
        atmist: {
          type: Type.OBJECT,
          properties: {
            age: { type: Type.STRING },
            time: { type: Type.STRING },
            mechanism: { type: Type.STRING },
            injuries: { type: Type.STRING },
            signs: { type: Type.STRING },
            treatment: { type: Type.STRING },
          },
          required: ["age", "time", "mechanism", "injuries", "signs", "treatment"],
        },
        prep_checklist: STRING_ARRAY,
      },
      required: ["summary", "atmist", "prep_checklist"],
    },
    relative_message: { type: Type.STRING },
  },
  required: ["triage", "brief", "relative_message"],
} satisfies Parameters<typeof generateJson>[0]["schema"];

const SYSTEM_PROMPT = `You support — never replace — emergency dispatchers and ambulance crews in Pakistan. You output structured triage, an ER handover brief, and a message for the patient's relative. You are a decision-support tool, not the clinician of record.

LANGUAGE
- Callers may write in English, Urdu, or Roman Urdu (e.g. "behosh", "khoon", "sar", "seena", "saans", "jal gaya", "hamla", "takkar"). Understand all three.
- Write triage fields, brief, first-aid and reasoning in clear clinical English.

FACTS ONLY — DO NOT INVENT
- Use only the given scene description, optional photo, and optional registered medical profile.
- Do not invent vitals, GCS, clock times, ages, drugs given, or injuries that are not supported by those facts.
- If a field is unknown, write "unknown" (especially in ATMIST). Never complete missing digits or guess a name.
- When two severities are plausible, escalate (choose the more severe). When a capability is uncertain, include it.

required_capabilities — use ONLY this enum: trauma, cardiac, neuro, burns, pediatric, obstetric, general.
- ALWAYS include "general".
- "neuro": head injury with reduced consciousness, OR stroke signs (face droop, limb weakness, speech).
- "cardiac": chest pain, suspected ACS, arrhythmia, or cardiac arrest.
- "burns": significant thermal, chemical or electrical burns.
- "obstetric": the patient is pregnant, or this is a labour / pregnancy emergency.
- "trauma": collision, fall, blunt/penetrating injury, or traumatic bleeding.
- "pediatric": the patient is clearly a child.

vehicle_needed
- "ALS" if severity is critical or serious, OR there is any airway, cardiac, stroke, or major-bleeding risk (including anticoagulant + head injury or bleeding).
- Otherwise "BLS".

risk_flags
- If no registered profile was provided, return an empty array.
- If a profile was provided, every flag MUST explicitly link a profile fact (medication, condition, allergy, or blood group) to the suspected injuries. Example: "Warfarin + head injury: high risk of intracranial bleeding".
- Do not dump the whole profile. Skip facts that do not change this scene.

first_aid_steps
- Maximum 5. Safe for an untrained bystander in Pakistan (no drugs, no procedures, no "recovery position" if a neck injury is possible).
- Typical: do not move the neck if head/spine injury is possible; firm pressure on bleeding; no food or water if consciousness is reduced; cool a burn under running water, never ice/toothpaste/ghee.

brief
- summary: one clinical sentence. If there is no profile, it MUST contain the words "Identity unknown".
- atmist: concise clinical shorthand for Age, Time, Mechanism, Injuries, Signs, Treatment. Unknown → "unknown".
- prep_checklist: concrete ER actions, not slogans. Examples: "Prepare anticoagulation reversal", "Cross-match B+ blood", "Alert neurosurgery", "ECG on arrival".

relative_message
- Calm, 2–3 sentences. English first, then the same meaning in Roman Urdu.
- No graphic detail (no blood, wounds, or dying).
- MUST contain these placeholders exactly, for later substitution: {NAME} {HOSPITAL} {REF}`;

type GeminiTriageResult = {
  triage: Omit<Triage, "source">;
  brief: Brief;
  relative_message: string;
};

const CAP_SET = new Set<string>(CAPABILITY);

function profileForModel(profile: CitizenProfile | null) {
  if (!profile) return null;
  return {
    full_name: profile.full_name,
    date_of_birth: profile.date_of_birth,
    gender: profile.gender,
    blood_group: profile.blood_group,
    conditions: profile.conditions,
    allergies: profile.allergies,
    medications: profile.medications,
  };
}

function ensurePlaceholders(message: string) {
  let out = message.trim();
  if (!out.includes("{NAME}")) out += " {NAME}";
  if (!out.includes("{HOSPITAL}")) out += " {HOSPITAL}";
  if (!out.includes("{REF}")) out += " {REF}";
  return out;
}

function finalise(raw: GeminiTriageResult, source: Triage["source"], profile: CitizenProfile | null): EmergencyAnalysis {
  const caps = raw.triage.required_capabilities.filter((c): c is Capability => CAP_SET.has(c));
  if (!caps.includes("general")) caps.push("general");
  let summary = raw.brief.summary;
  if (!profile && !/identity unknown/i.test(summary)) {
    summary = `Identity unknown. ${summary}`;
  }
  return {
    triage: {
      severity: raw.triage.severity,
      category: raw.triage.category,
      suspected_injuries: raw.triage.suspected_injuries,
      required_capabilities: [...new Set(caps)],
      vehicle_needed: raw.triage.vehicle_needed,
      risk_flags: profile ? raw.triage.risk_flags : [],
      first_aid_steps: raw.triage.first_aid_steps.slice(0, 5),
      reasoning: raw.triage.reasoning,
      source,
    },
    brief: {
      summary,
      atmist: raw.brief.atmist,
      prep_checklist: raw.brief.prep_checklist,
    },
    relative_message: ensurePlaceholders(raw.relative_message),
  };
}

export async function analyzeEmergency({
  description,
  sceneImage,
  profile,
}: {
  description: string;
  sceneImage?: { base64: string; mime: string };
  profile: CitizenProfile | null;
}): Promise<EmergencyAnalysis> {
  const facts = {
    description,
    registered_profile: profileForModel(profile),
    identity: profile ? "registered" : "Identity unknown",
  };
  const parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] = [
    { text: `Triage this emergency from the facts below. Do not use any other knowledge of the patient.\n${JSON.stringify(facts)}` },
  ];
  if (sceneImage) {
    parts.push({ inlineData: { mimeType: sceneImage.mime, data: sceneImage.base64 } });
  }
  const raw = await generateJson<GeminiTriageResult>({
    system: SYSTEM_PROMPT,
    parts,
    schema: TRIAGE_RESULT_SCHEMA,
    timeoutMs: 40_000, // shared across the primary + fallback model; route maxDuration is 60 s
  });
  return finalise(raw, "ai", profile);
}

export async function analyzeWithFallback(args: {
  description: string;
  sceneImage?: { base64: string; mime: string };
  profile: CitizenProfile | null;
}): Promise<EmergencyAnalysis> {
  try {
    return await analyzeEmergency(args);
  } catch (err) {
    console.error("Gemini triage failed:", err instanceof Error ? err.message : String(err));
    return fallbackEmergency(args.description, args.profile);
  }
}
