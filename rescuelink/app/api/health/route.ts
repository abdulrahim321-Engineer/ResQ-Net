import { connection, NextResponse } from "next/server";
import { CORS_HEADERS } from "@/lib/http";

// Real endpoint (not mocked): tells the team which integrations are configured.
export async function GET() {
  // Read env at request time, never at build time.
  await connection();
  return NextResponse.json(
    {
      ok: true,
      supabase: !!process.env.SUPABASE_URL,
      gemini: !!process.env.GEMINI_API_KEY,
      email: !!process.env.GMAIL_APP_PASSWORD,
    },
    { headers: CORS_HEADERS },
  );
}
