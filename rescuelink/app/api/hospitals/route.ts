import { fail, ok, serverError } from "@/lib/http";
import { listHospitals } from "@/lib/hospitals";
import type { LatLng } from "@/lib/types";
import { nearQuerySchema } from "@/lib/schemas";

// Public. ?near=lat,lng sorts by distance. ?q= filters by name (case-insensitive). Max 50.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const near = searchParams.get("near");
  const q = (searchParams.get("q") ?? "").trim();

  let origin: LatLng | undefined;
  if (near !== null) {
    if (!nearQuerySchema.safeParse(near).success) return fail(400, "near: must look like 33.6426,72.9905");
    const [lat, lng] = near.split(",").map(Number);
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return fail(400, "near: lat must be -90..90, lng -180..180");
    origin = { lat, lng };
  }

  try {
    return ok(await listHospitals({ origin, q: q || undefined }));
  } catch (err) {
    return serverError("hospitals list", err);
  }
}
