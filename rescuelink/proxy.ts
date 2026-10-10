import { NextResponse, type NextRequest } from "next/server";
import { CORS_HEADERS } from "./lib/http";

// CORS for every /api/* route (CLAUDE.md rule). OPTIONS preflight is answered here,
// so no route handler needs to implement it.
export function proxy(request: NextRequest) {
  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }
  const response = NextResponse.next();
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
