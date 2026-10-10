import { optionalUser } from "@/lib/auth";
import { createIncident } from "@/lib/incidents";
import { fail, ok, parseBody, serverError } from "@/lib/http";
import { incidentCreateSchema } from "@/lib/schemas";

export const maxDuration = 60;

// Public: a passerby needs no account. for_self needs a citizen token.
export async function POST(req: Request) {
  const body = await parseBody(req, incidentCreateSchema);
  if ("response" in body) return body.response;

  const caller = await optionalUser(req);
  if (body.data.for_self && caller?.account.role !== "citizen") {
    return fail(401, "Reporting for yourself needs a citizen token");
  }
  if (body.data.scene_image_base64 && !body.data.mime_type) {
    return fail(400, "mime_type is required with scene_image_base64");
  }

  try {
    return ok(await createIncident(body.data, caller), 201);
  } catch (err) {
    return serverError("POST incidents", err);
  }
}
