'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from './api';
import type { LatLng } from './types';

/**
 * Polls `fn` every `ms` while `enabled`. Never overlaps calls, backs off on errors
 * (doubling up to 30 s), stops on unmount. `trigger()` runs it now (or right after
 * the in-flight call finishes).
 */
export function usePoll(fn: () => Promise<void>, ms: number, enabled: boolean, key: unknown = null) {
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; });
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let inFlight = false;
    let again = false;
    let delay = ms;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const run = async () => {
      if (stopped) return;
      if (inFlight) { again = true; return; }
      inFlight = true;
      clearTimeout(timer);
      try {
        await fnRef.current();
        if (!stopped) { setError(null); delay = ms; }
      } catch (e) {
        if (!stopped) { setError(errorMessage(e)); delay = Math.min(delay * 2, 30000); }
      } finally {
        inFlight = false;
      }
      if (stopped) return;
      if (again) { again = false; void run(); return; }
      timer = setTimeout(run, delay);
    };
    triggerRef.current = () => { void run(); };
    timer = setTimeout(run, 0);
    return () => { stopped = true; clearTimeout(timer); triggerRef.current = () => {}; };
  }, [enabled, ms, key]);

  const trigger = useCallback(() => triggerRef.current(), []);
  return { error, trigger };
}

export const DEFAULT_POS: LatLng = { lat: 33.6844, lng: 73.0479 }; // Islamabad

/** One-shot GPS fix. Resolves null if unavailable/denied (caller decides fallback). */
export function getCurrentPosition(timeoutMs = 10000): Promise<{ lat: number; lng: number; accuracy_m: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy_m: Math.round(p.coords.accuracy) }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 10000 },
    );
  });
}

export function gpsErrorText(code: number): string {
  if (code === 1) return 'Location permission denied. Allow location access, or tap the map to set your position.';
  if (code === 2) return 'Location unavailable. Tap the map to set your position.';
  return 'Location timed out. Tap the map to set your position.';
}

let audioCtx: AudioContext | null = null;
/** Short alert tone for new assignments / incoming patients. */
export function beep(freq = 880, ms = 350) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx ?? new Ctx();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.value = 0.12;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + ms / 1000);
  } catch { /* audio blocked */ }
}

export function vibrate(pattern: number | number[]) {
  try { if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern); } catch { /* ignore */ }
}
