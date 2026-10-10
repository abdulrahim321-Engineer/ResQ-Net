import { NextResponse } from "next/server";
import type { z } from "zod";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Real responses: CORS only.
export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status, headers: CORS_HEADERS });
}

export function fail(status: number, message: string) {
  return NextResponse.json({ error: message }, { status, headers: CORS_HEADERS });
}

// Thrown by lib code for expected failures (404/403/409); serverError turns it into JSON.
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Logs a server-side failure and returns a JSON 500. The message is generic on purpose.
export function serverError(context: string, err: unknown) {
  if (err instanceof HttpError) return fail(err.status, err.message);
  console.error(`${context}:`, err instanceof Error ? err.message : String(err));
  return fail(500, "Server error, please try again");
}

// Parses and validates a JSON body. Returns either the typed data or a ready 400 response.
export async function parseBody<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<{ data: z.infer<S> } | { response: NextResponse }> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return { response: fail(400, "Invalid JSON body") };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
      .join("; ");
    return { response: fail(400, message) };
  }
  return { data: parsed.data };
}
