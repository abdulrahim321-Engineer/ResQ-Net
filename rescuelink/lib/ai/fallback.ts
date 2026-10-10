import type { Brief, Capability, CitizenProfile, Triage } from "../types";

export type EmergencyAnalysis = {
  triage: Triage;
  brief: Brief;
  relative_message: string;
};

const BLOOD_THINNERS = ["warfarin", "apixaban", "rivaroxaban", "clopidogrel", "aspirin"];

function has(text: string, re: RegExp) {
  return re.test(text);
}

function ageFromProfile(profile: CitizenProfile | null): string {
  if (!profile?.date_of_birth) return "unknown";
  const born = Date.parse(profile.date_of_birth);
  if (Number.isNaN(born)) return "unknown";
  const years = Math.floor((Date.now() - born) / (365.25 * 24 * 60 * 60 * 1000));
  if (years < 0 || years > 120) return "unknown";
  return String(years);
}

function riskFlags(
  profile: CitizenProfile | null,
  suspected: { head: boolean; bleeding: boolean; chest: boolean; burn: boolean; unconscious: boolean; breath: boolean },
): string[] {
  if (!profile) return [];
  const flags: string[] = [];
  for (const medication of profile.medications) {
    const lower = medication.toLowerCase();
    if (BLOOD_THINNERS.some((name) => lower.includes(name))) {
      if (suspected.head || suspected.unconscious) {
        flags.push(`${medication} + head injury: high risk of intracranial bleeding`);
      } else if (suspected.bleeding) {
        flags.push(`${medication} + bleeding: high risk of uncontrolled haemorrhage`);
      }
    }
    if (lower.includes("insulin") && suspected.unconscious) {
      flags.push("Takes insulin + reduced consciousness: consider hypoglycaemia as well as trauma");
    }
  }
  for (const allergy of profile.allergies) {
    flags.push(`Allergic to ${allergy}: do not give this in pre-hospital or ER drugs`);
  }
  if (profile.blood_group && (suspected.bleeding || suspected.head)) {
    flags.push(`Blood group ${profile.blood_group} + bleeding: prepare type-specific transfusion`);
  }
  for (const condition of profile.conditions) {
    if (/pregnan/i.test(condition)) flags.push(`${condition}: obstetric capability required`);
    if (/asthma|epilep|diabet|heart|cardiac|stent/i.test(condition) && (suspected.chest || suspected.breath || suspected.unconscious)) {
      flags.push(`${condition} + this presentation: higher decompensation risk`);
    }
  }
  return flags;
}

function relativeMessage(): string {
  return [
    "{NAME} is being taken by ambulance to {HOSPITAL}. Please keep your phone on; the team will update you. Reference {REF}.",
    "{NAME} ko ambulance {HOSPITAL} le ja rahi hai. Phone on rakhein; team update karti rahegi. Reference {REF}.",
  ].join(" ");
}

export function fallbackEmergency(description: string, profile: CitizenProfile | null): EmergencyAnalysis {
  const t = description.toLowerCase();
  const unconscious = has(t, /unconscious|unresponsive|behosh|behoosh|behosh gi|kooma|coma/);
  const bleeding = has(t, /bleed|bleeding|khoon|khoon nikal|haemorrh|hemorrh/);
  const head = has(t, /\bhead\b|\bsar\b|skull|scalp|dimagh/);
  const chest = has(t, /chest|seena|\bdil\b|left arm|bayein bah/);
  const sweat = has(t, /sweat|sweating|pasina/);
  const breath = has(t, /breath|saans|sans\b|dyspnea|wheez|airway/);
  const burn = has(t, /burn|burns|jal |jala|jal gaya|scald|chai se jal/);
  const pregnant = has(t, /pregnan|hamla|labour|labor|wiladat/);
  const accident = has(t, /accident|takkar|bike|motorcycle|motorbike|collision|crash|sarak/);
  const stroke = has(t, /stroke|falij|face droop|slurred|speech/);
  const child = has(t, /\bchild\b|bacha|bachi|infant|baby|pediatric|paeds/);
  const handBurn = has(t, /hath|hand|ungli|finger/) && burn;

  let category: Triage["category"] = "other";
  if (chest && (sweat || /arm|pain|takleef/.test(t))) category = "cardiac";
  else if (stroke) category = "stroke";
  else if (burn) category = "burns";
  else if (pregnant) category = "obstetric";
  else if (breath && !accident) category = "respiratory";
  else if (accident || head || bleeding || unconscious) category = "trauma";
  else if (child) category = "pediatric";

  let severity: Triage["severity"] = "moderate";
  if (unconscious || stroke || (chest && (sweat || /arm/.test(t))) || (breath && /not breathing|saans nahi/.test(t))) {
    severity = "critical";
  } else if ((accident && (bleeding || head)) || (pregnant && /bleed|pain|takleef/.test(t)) || (burn && !handBurn)) {
    severity = "serious";
  } else if (handBurn) {
    severity = "moderate";
  } else if (accident || bleeding) {
    severity = "serious";
  } else if (burn) {
    severity = "moderate";
  } else {
    severity = "minor";
  }

  const required = new Set<Capability>(["general"]);
  if (category === "trauma" || accident) required.add("trauma");
  if ((head && (unconscious || bleeding)) || stroke || category === "stroke") required.add("neuro");
  if (category === "cardiac" || (chest && category !== "burns")) required.add("cardiac");
  if (category === "burns" || burn) required.add("burns");
  if (pregnant || category === "obstetric") required.add("obstetric");
  if (child || category === "pediatric") required.add("pediatric");

  const majorBleed = bleeding && (head || unconscious || accident);
  const vehicle_needed: Triage["vehicle_needed"] =
    severity === "critical" || severity === "serious" || category === "cardiac" || category === "stroke" || majorBleed || unconscious || breath
      ? "ALS"
      : "BLS";

  const suspected_injuries: string[] = [];
  if (accident && /bike|motorcycle|motorbike/.test(t)) suspected_injuries.push("Motorcycle collision injuries");
  else if (accident) suspected_injuries.push("Road traffic injuries");
  if (head) suspected_injuries.push(unconscious ? "Head injury with reduced consciousness" : "Head injury");
  if (bleeding && head) suspected_injuries.push("Scalp / head bleeding");
  else if (bleeding) suspected_injuries.push("Active bleeding");
  if (unconscious) suspected_injuries.push("Unconsciousness — protect airway");
  if (category === "cardiac") suspected_injuries.push("Suspected acute coronary syndrome");
  if (burn && handBurn) suspected_injuries.push("Thermal burn to the hand (hot liquid)");
  else if (burn) suspected_injuries.push("Thermal burns");
  if (pregnant) suspected_injuries.push("Pregnancy-related emergency");
  if (!suspected_injuries.length) suspected_injuries.push("Undifferentiated emergency from caller description");

  const risk_flags = riskFlags(profile, { head, bleeding, chest, burn, unconscious, breath });
  const age = ageFromProfile(profile);
  const identityLine = profile ? `${profile.full_name.split(/\s+/)[0]}, ${age}` : "Identity unknown";

  let first_aid_steps: string[];
  let prep_checklist: string[];
  let summary: string;
  let atmist: Brief["atmist"];
  let reasoning: string;

  if (category === "cardiac") {
    first_aid_steps = [
      "Help the person sit upright and stay still. Loosen tight clothing.",
      "If they become unresponsive and are not breathing normally, start chest compressions and send someone for help.",
      "Do not give food, water, or any medicine unless a dispatcher tells you to.",
      "Note the time symptoms started.",
      "Keep them calm until the ambulance arrives.",
    ];
    prep_checklist = [
      "Activate chest-pain / ACS pathway",
      "ECG on arrival, defibrillator and ALS bay ready",
      "Prepare aspirin only after allergy check",
      ...(profile?.blood_group ? [`Cross-match ${profile.blood_group} blood if needed`] : []),
    ];
    summary = `${identityLine}. Chest pain with sweating and arm pain — treat as ACS until proven otherwise.`;
    atmist = {
      age,
      time: "unknown — caller reports acute chest pain",
      mechanism: "Medical: suspected cardiac ischaemia",
      injuries: "None traumatic; suspected ACS",
      signs: "Chest pain, sweating, left arm pain; vitals unknown",
      treatment: "None given at scene (bystander)",
    };
    reasoning = "Classic ACS cluster (chest pain, sweating, arm pain). Escalate to critical and send ALS.";
  } else if (category === "burns") {
    first_aid_steps = [
      "Move away from the heat. Cool the burn under cool running water for 20 minutes.",
      "Do not apply ice, toothpaste, ghee, or ointments.",
      "Remove tight jewellery or watches near the burn if it is easy and not stuck.",
      "Cover loosely with a clean, dry cloth.",
      "Do not burst blisters. Keep the person warm.",
    ];
    prep_checklist = [
      "Burns assessment and analgesia ready",
      "Tetanus status check",
      "If the face, airway or large area is involved, alert burns / ICU",
      ...(child ? ["Paediatric burns pathway"] : []),
    ];
    summary = `${identityLine}. Hot-liquid burn, ${handBurn ? "hand" : "skin"} — cool, cover, and assess depth in ER.`;
    atmist = {
      age,
      time: "unknown",
      mechanism: "Thermal: hot liquid (tea/chai or similar)",
      injuries: handBurn ? "Hand burn" : "Thermal burn",
      signs: "unknown",
      treatment: "Advise cool running water; no home remedies",
    };
    reasoning = "Roman-Urdu burn report. Isolated hand scald is moderate; ALS not required unless airway or large-area burns.";
  } else {
    first_aid_steps = [
      "Do not move the head or neck unless there is fire or traffic danger.",
      "If bleeding, press firmly with a clean cloth. Do not remove the cloth if it soaks through — add another on top.",
      "If unconscious, open the mouth, check breathing, and keep the airway clear. Do not give food or water.",
      "Keep the person warm and talking if they can.",
      "Stay until the ambulance arrives.",
    ];
    prep_checklist = [
      "Trauma bay ready",
      ...(head || unconscious ? ["Alert neurosurgery", "CT head on standby"] : []),
      ...(risk_flags.some((f) => /warfarin|apixaban|rivaroxaban|clopidogrel|aspirin/i.test(f))
        ? ["Prepare anticoagulation reversal"]
        : []),
      ...(profile?.blood_group ? [`Cross-match ${profile.blood_group} blood`] : ["Prepare unmatched emergency blood if bleeding continues"]),
    ];
    summary = `${identityLine}. ${accident ? "Road traffic collision" : "Trauma"}${unconscious ? ", unconscious" : ""}${head ? ", head injury" : ""}${bleeding ? ", bleeding" : ""}.`;
    atmist = {
      age,
      time: "unknown",
      mechanism: accident ? (has(t, /bike|motorcycle|motorbike/) ? "Motorcycle collision" : "Road traffic collision") : "Trauma, mechanism unclear",
      injuries: suspected_injuries.join("; "),
      signs: unconscious ? "Unconscious at scene; vitals unknown" : "Vitals unknown",
      treatment: "Bystander first aid only",
    };
    reasoning = "Keyword triage (English / Roman Urdu). Unconsciousness or head bleeding is treated as critical trauma until a clinician says otherwise.";
  }

  return {
    triage: {
      severity,
      category,
      suspected_injuries,
      required_capabilities: [...required],
      vehicle_needed,
      risk_flags,
      first_aid_steps: first_aid_steps.slice(0, 5),
      reasoning,
      source: "fallback",
    },
    brief: { summary, atmist, prep_checklist },
    relative_message: relativeMessage(),
  };
}
