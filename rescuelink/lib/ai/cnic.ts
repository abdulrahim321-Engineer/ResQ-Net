import "server-only";
import { Type } from "@google/genai";
import { generateJson } from "./gemini";

export type ExtractedCnic = {
  cnic: string | null;
  full_name: string | null;
  date_of_birth: string | null;
  gender: "male" | "female" | null;
  confidence: "high" | "medium" | "low";
};

const CNIC_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    cnic: { type: Type.STRING, nullable: true },
    full_name: { type: Type.STRING, nullable: true },
    date_of_birth: { type: Type.STRING, nullable: true },
    gender: { type: Type.STRING, enum: ["male", "female"], nullable: true },
    confidence: { type: Type.STRING, enum: ["high", "medium", "low"] },
  },
  required: ["cnic", "full_name", "date_of_birth", "gender", "confidence"],
} satisfies Parameters<typeof generateJson>[0]["schema"];

const SYSTEM_PROMPT =
  "You read the FRONT side of a Pakistani CNIC / Smart National Identity Card. Extract the Identity Number (format 12345-1234567-1), the English Name (not the father/husband name), the Date of Birth (as YYYY-MM-DD; cards print DD.MM.YYYY) and the Gender (M/F). Return null for anything not clearly readable. Never guess or complete digits. If the image is not a CNIC, return all nulls with confidence low.";

export async function extractCnic(base64: string, mime: string): Promise<ExtractedCnic> {
  return generateJson<ExtractedCnic>({
    system: SYSTEM_PROMPT,
    parts: [
      { text: "Extract the requested fields from this image." },
      { inlineData: { mimeType: mime, data: base64 } },
    ],
    schema: CNIC_SCHEMA,
  });
}
