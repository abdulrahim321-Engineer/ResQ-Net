import "server-only";
import { GoogleGenAI, type Schema } from "@google/genai";

type JsonPart = {
  text?: string;
  inlineData?: { mimeType: string; data: string };
};

type GenerateJsonArgs = {
  system: string;
  parts: JsonPart[];
  schema: Schema;
  timeoutMs?: number;
};

let client: GoogleGenAI | undefined;

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

// Overloaded (503), rate-limited (429) or timed-out calls move on to the next model.
function isRetryable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /\b(503|429|500)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand|timed out/i.test(msg);
}

// Tries GEMINI_MODEL, then GEMINI_FALLBACK_MODEL (default gemini-2.5-flash), within one overall deadline.
export async function generateJson<T>(args: GenerateJsonArgs): Promise<T> {
  const primary = process.env.GEMINI_MODEL;
  if (!primary) throw new Error("GEMINI_MODEL is not configured");
  const models = [...new Set([primary, process.env.GEMINI_FALLBACK_MODEL || "gemini-2.5-flash"])];
  const deadline = Date.now() + (args.timeoutMs ?? 20_000);
  let lastErr: unknown;
  for (const [i, model] of models.entries()) {
    const remaining = deadline - Date.now();
    if (remaining < 3_000) break;
    // A slow primary model gets ~55% of the budget so the fallback model still has time.
    const budget = i < models.length - 1 ? Math.round(remaining * 0.55) : remaining;
    try {
      return await generateWithModel<T>(model, { ...args, timeoutMs: budget });
    } catch (err) {
      lastErr = err;
      console.error(`Gemini ${model} failed:`, err instanceof Error ? err.message.slice(0, 200) : String(err));
      if (!isRetryable(err)) throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Gemini request timed out");
}

async function generateWithModel<T>(
  model: string,
  { system, parts, schema, timeoutMs = 20_000 }: GenerateJsonArgs,
): Promise<T> {
  let parseError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await getClient().models.generateContent({
        model,
        contents: [{ role: "user", parts }],
        config: {
          systemInstruction: system,
          responseMimeType: "application/json",
          responseSchema: schema,
          temperature: 0.1,
          abortSignal: controller.signal,
        },
      });
      const text = response.text;
      if (!text) throw new Error("Gemini returned an empty response");
      try {
        return JSON.parse(text) as T;
      } catch (err) {
        parseError = err;
        continue;
      }
    } catch (err) {
      if (controller.signal.aborted) throw new Error("Gemini request timed out");
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(`Gemini returned invalid JSON: ${parseError instanceof Error ? parseError.message : "parse failed"}`);
}
