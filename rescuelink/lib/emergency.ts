// Fallbacks used when a citizen has not filled in their emergency contact.

// Emergency service numbers for Pakistan (sources: Lahore Police, Lahore government helplines).
// 112 is left out on purpose: it is not reliable in Pakistan.
export const EMERGENCY_NUMBERS = [
  { label: "Police", number: "15" },
  { label: "Ambulance (Rescue 1122)", number: "1122" },
  { label: "Ambulance (Edhi)", number: "115" },
  { label: "Fire", number: "16" },
] as const;

// Used for blank emergency_contact fields.
export const FALLBACK_EMERGENCY_CONTACT = {
  name: "Ahmad",
  phone: "03465709128",
  relation: "Emergency contact (fallback)",
} as const;
