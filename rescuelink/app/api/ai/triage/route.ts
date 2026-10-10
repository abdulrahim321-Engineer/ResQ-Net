import { analyzeWithFallback } from "@/lib/ai/triage";
import { fail, ok, parseBody, serverError } from "@/lib/http";
import { toCitizenProfile, type CitizenProfileRow } from "@/lib/mappers";
import { maskCnic, normaliseCnic } from "@/lib/profiles";
import { triageSchema } from "@/lib/schemas";
import { getAdmin } from "@/lib/supabase";

export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await parseBody(req, triageSchema);
  if ("response" in body) return body.response;
  const { description, scene_image_base64, mime_type, cnic } = body.data;

  try {
    let profile = null;
    if (cnic) {
      const normalised = normaliseCnic(cnic);
      if (!normalised) return fail(400, "cnic must be 13 digits, with optional dashes");
      const { data, error } = await getAdmin()
        .from("citizen_profiles")
        .select("*")
        .eq("cnic", normalised)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (data) profile = toCitizenProfile(data as CitizenProfileRow);
      else console.error("POST ai/triage: no profile for", maskCnic(normalised));
    }

    const sceneImage =
      scene_image_base64 && mime_type ? { base64: scene_image_base64, mime: mime_type } : undefined;

    const result = await analyzeWithFallback({ description, sceneImage, profile });
    return ok(result);
  } catch (err) {
    return serverError("POST ai/triage", err);
  }
}
