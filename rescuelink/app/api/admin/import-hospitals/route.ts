import { requireAdmin } from "@/lib/auth";
import { ok, serverError } from "@/lib/http";
import { importFromOSM } from "@/lib/hospitals";

// Overpass can be slow, so allow up to 60 s (CLAUDE.md).
export const maxDuration = 60;

// One-time admin call: imports real hospitals from OpenStreetMap (Islamabad + Rawalpindi).
export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    return ok({ imported: await importFromOSM() });
  } catch (err) {
    return serverError("import-hospitals", err);
  }
}
