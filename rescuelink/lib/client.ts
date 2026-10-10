// Browser-side helpers for the test UI. Safe to import from "use client" files.
import { useEffect, useRef, useSyncExternalStore } from "react";
import type { Session } from "@/lib/types";

const KEY = "rl_session";

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((l) => l());
}

export function saveSession(s: Session) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
  notify();
}

export function clearSession() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  notify();
}

let cachedRaw: string | null | undefined;
let cachedSession: Session | null = null;
function snapshot(): Session | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedSession = raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      cachedSession = null;
    }
  }
  return cachedSession;
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

/** undefined = not yet known (server render / hydration), null = logged out. */
export function useSession(): Session | null | undefined {
  return useSyncExternalStore(subscribe, snapshot, () => undefined);
}

type ApiOpts = { method?: string; body?: unknown; auth?: boolean };

async function rawFetch(path: string, opts: ApiOpts, token: string | null) {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetch(path, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });
}

async function parse(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { error: text.slice(0, 200) };
  }
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, opts: ApiOpts = {}): Promise<T> {
  const useAuth = opts.auth !== false;
  let session = useAuth ? getSession() : null;
  let res = await rawFetch(path, opts, session?.access_token ?? null);

  if (res.status === 401 && session?.refresh_token) {
    const r = await rawFetch("/api/auth/refresh", { method: "POST", body: { refresh_token: session.refresh_token } }, null);
    if (r.ok) {
      session = (await r.json()) as Session;
      saveSession(session);
      res = await rawFetch(path, opts, session.access_token);
    }
  }

  const json = await parse(res);
  if (!res.ok || (json && typeof json === "object" && "error" in json && (json as { error?: unknown }).error)) {
    const msg = (json as { error?: string } | null)?.error ?? `HTTP ${res.status}`;
    throw new ApiError(String(msg), res.status);
  }
  return json as T;
}

export function resizeImageToBase64(
  file: File,
  max = 1280,
  quality = 0.85,
): Promise<{ base64: string; mime_type: "image/jpeg" }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas not supported");
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        URL.revokeObjectURL(url);
        resolve({ base64: dataUrl.split(",")[1] ?? "", mime_type: "image/jpeg" });
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    img.src = url;
  });
}

let audioCtx: AudioContext | null = null;
export function beep(freq = 880, ms = 400) {
  try {
    const Ctx =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx ?? new Ctx();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    gain.gain.value = 0.15;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + ms / 1000);
  } catch {
    /* ignore */
  }
}

/** Calls fn immediately and every `ms` while mounted. Uses the latest fn each tick. */
export function usePoll(fn: () => void | Promise<void>, ms = 3000, deps: unknown[] = []) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    let stopped = false;
    const tick = () => {
      if (!stopped) void ref.current();
    };
    tick();
    const t = setInterval(tick, ms);
    return () => {
      stopped = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, ...deps]);
}

export const DEFAULT_POS = { lat: 33.6426, lng: 72.9905 };

export function getGps(): Promise<{ lat: number; lng: number; fallback: boolean }> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve({ ...DEFAULT_POS, fallback: true });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, fallback: false }),
      () => resolve({ ...DEFAULT_POS, fallback: true }),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 },
    );
  });
}

export function gmapsLink(lat: number, lng: number) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
