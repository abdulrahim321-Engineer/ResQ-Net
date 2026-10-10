import type { LatLng } from "./types";

const EARTH_RADIUS_KM = 6371;

// Straight-line distance in km, rounded to 2 decimals.
export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h)) * 100) / 100;
}

// Simulated ETA: straight-line km x 1.3 / 30 km/h, in minutes rounded to 1 decimal.
export function estimateEtaMin(km: number): number {
  return Math.round(((km * 1.3) / 30) * 60 * 10) / 10;
}
