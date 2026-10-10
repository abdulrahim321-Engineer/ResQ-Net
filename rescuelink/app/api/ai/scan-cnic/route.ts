import { requireRole } from "@/lib/auth";
import { extractCnic } from "@/lib/ai/cnic";
import { ok, parseBody, serverError } from "@/lib/http";
import { toLimited, nameMatches, normaliseCnic } from "@/lib/profiles";
import { getAdmin } from "@/lib/supabase";
import type { CitizenProfileRow } from "@/lib/mappers";
import { scanCnicSchema } from "@/lib/schemas";

export const maxDuration = 60;

const emptyExtracted = {
  cnic: null,
  full_name: null,
  date_of_birth: null,
  gender: null,
} as const;

export async function POST(req: Request) {
  const body = await parseBody(req, scanCnicSchema);
  if ("response" in body) return body.response;
  const { image_base64, mime_type, purpose } = body.data;

  if (purpose === "register") {
    const auth = await requireRole(req, ["citizen"]);
    if (auth instanceof Response) return auth;
  }

  try {
    let extracted;
    try {
      extracted = await extractCnic(image_base64, mime_type);
    } catch {
      return ok({
        extracted: emptyExtracted,
        confidence: "low",
        source: "fallback",
        ...(purpose === "identify" ? { verification: "unreadable", profile: null } : {}),
      });
    }

    const normalised = extracted.cnic ? normaliseCnic(extracted.cnic) : null;
    const result = {
      extracted: {
        cnic: normalised,
        full_name: extracted.full_name ?? null,
        date_of_birth: extracted.date_of_birth ?? null,
        gender: extracted.gender ?? null,
      },
      confidence: extracted.confidence,
      source: "ai" as const,
    };
    if (purpose === "register") return ok(result);

    if (!normalised || !extracted.full_name) {
      return ok({ ...result, verification: "unreadable" as const, profile: null });
    }
    const { data: row, error } = await getAdmin()
      .from("citizen_profiles")
      .select("*")
      .eq("cnic", normalised)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return ok({ ...result, verification: "not_registered" as const, profile: null });

    const profile = row as CitizenProfileRow;
    if (!nameMatches(extracted.full_name, profile.full_name)) {
      return ok({ ...result, verification: "name_mismatch" as const, profile: null });
    }
    return ok({ ...result, verification: "matched" as const, profile: toLimited(profile) });
  } catch (err) {
    return serverError("POST ai/scan-cnic", err);
  }
}
