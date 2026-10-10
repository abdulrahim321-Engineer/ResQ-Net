// Backend contract -> what the screens display. Single source for labels, ETA and timeline.
import type { CitizenProfile, Incident, IncidentStatus, ProfileLimited, Triage } from './types';

// ── Incident status (exhaustive) ──────────────────────────────────────────────
type StatusInfo = { label: string; short: string; color: string; step: number };

export const INCIDENT_STATUS: Record<IncidentStatus, StatusInfo> = {
  assigned:     { label: 'Ambulance dispatched · awaiting crew', short: 'DISPATCHED',      color: '#FFB703', step: 1 },
  en_route:     { label: 'Ambulance en route to patient',        short: 'EN ROUTE',        color: '#00F5D4', step: 2 },
  at_scene:     { label: 'Crew at scene',                        short: 'AT SCENE',        color: '#00F5D4', step: 3 },
  transporting: { label: 'Patient on board · en route to ER',    short: 'TO HOSPITAL',     color: '#00F5D4', step: 4 },
  arrived:      { label: 'Arrived at hospital ER',               short: 'ARRIVED',         color: '#10B981', step: 5 },
  closed:       { label: 'Handover complete',                    short: 'CLOSED',          color: '#64748B', step: 6 },
  no_ambulance: { label: 'No ambulance available right now',     short: 'NO AMBULANCE',    color: '#FF2A5F', step: 0 },
};

export function statusInfo(status: string | null | undefined): StatusInfo {
  if (status && status in INCIDENT_STATUS) return INCIDENT_STATUS[status as IncidentStatus];
  return { label: `Unknown status${status ? ` (${status})` : ''}`, short: 'UNKNOWN', color: '#64748B', step: -1 };
}

/** Ambulance is moving toward the patient or the hospital. */
export function isActiveStatus(status: string): boolean {
  return status === 'assigned' || status === 'en_route' || status === 'at_scene' || status === 'transporting';
}

export const PROGRESS_STEPS: { key: IncidentStatus; label: string }[] = [
  { key: 'assigned', label: 'Dispatched' },
  { key: 'en_route', label: 'En route' },
  { key: 'at_scene', label: 'At scene' },
  { key: 'transporting', label: 'To ER' },
  { key: 'arrived', label: 'Arrived' },
];

// ── Hospital readiness ────────────────────────────────────────────────────────
type Readiness = Incident['hospital_status']['readiness'];
export const READINESS: Record<Readiness, { label: string; short: string; color: string }> = {
  pending:   { label: 'Alert received · standby', short: 'STANDBY',       color: '#94A3B8' },
  preparing: { label: 'Preparing trauma bay',      short: 'PREPARING BAY', color: '#FFB703' },
  ready:     { label: 'Trauma bay ready',          short: 'BAY READY',     color: '#10B981' },
};
export function readinessInfo(r: string | null | undefined) {
  if (r && r in READINESS) return READINESS[r as Readiness];
  return { label: 'Readiness unknown', short: 'UNKNOWN', color: '#64748B' };
}

// ── Severity / triage ─────────────────────────────────────────────────────────
export const SEVERITY: Record<Triage['severity'], { label: string; color: string }> = {
  critical: { label: 'CRITICAL', color: '#FF2A5F' },
  serious:  { label: 'SERIOUS',  color: '#FF7A00' },
  moderate: { label: 'MODERATE', color: '#FFB703' },
  minor:    { label: 'MINOR',    color: '#10B981' },
};
export function severityInfo(s: string | null | undefined) {
  if (s && s in SEVERITY) return SEVERITY[s as Triage['severity']];
  return { label: 'UNTRIAGED', color: '#64748B' };
}

export const IDENTITY: Record<Incident['identity']['status'], string> = {
  matched: 'Identity verified (CNIC match)',
  name_mismatch: 'Name did not match CNIC · verify on arrival',
  not_registered: 'CNIC not registered with ResQ Net',
  unreadable: 'CNIC could not be read',
  unknown: 'Identity unknown',
};
export function identityLabel(s: string | null | undefined) {
  return (s && (IDENTITY as Record<string, string>)[s]) || 'Identity unknown';
}

// ── ETA / distance ────────────────────────────────────────────────────────────
/** Backend ETA is minutes (1 decimal, straight-line estimate). Only place it is formatted. */
export function formatEta(min: number | null | undefined): string {
  if (min === null || min === undefined || !Number.isFinite(min)) return '—';
  if (min < 1) return '< 1 min';
  return `${min.toFixed(1)} min`;
}
export function formatKm(km: number | null | undefined): string {
  if (km === null || km === undefined || !Number.isFinite(km)) return '—';
  return `${km.toFixed(2)} km`;
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
export function ago(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (!Number.isFinite(s)) return 'never';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

// ── Patient (role-dependent profile) ──────────────────────────────────────────
export function isFullProfile(p: ProfileLimited | CitizenProfile | null | undefined): p is CitizenProfile {
  return !!p && typeof p === 'object' && 'cnic' in p;
}

export type PatientView = {
  name: string;
  bloodGroup: string;
  alerts: string[];        // critical alerts (limited view) or allergies+conditions+meds (full view)
  full: CitizenProfile | null;
  identity: string;
  identityStatus: Incident['identity']['status'];
};

export function patientView(inc: Incident): PatientView {
  const p = inc.identity?.profile ?? null;
  const identityStatus = inc.identity?.status ?? 'unknown';
  if (isFullProfile(p)) {
    return {
      name: p.full_name,
      bloodGroup: p.blood_group || 'Unknown',
      alerts: [
        ...p.allergies.map((a) => `Allergy: ${a}`),
        ...p.conditions.map((c) => `Condition: ${c}`),
        ...p.medications.map((m) => `Takes: ${m}`),
      ],
      full: p,
      identity: identityLabel(identityStatus),
      identityStatus,
    };
  }
  if (p) {
    return {
      name: p.first_name,
      bloodGroup: p.blood_group || 'Unknown',
      alerts: p.critical_alerts ?? [],
      full: null,
      identity: identityLabel(identityStatus),
      identityStatus,
    };
  }
  return { name: 'Unidentified patient', bloodGroup: 'Unknown', alerts: [], full: null, identity: identityLabel(identityStatus), identityStatus };
}

/** "35202-1234567-1" -> "35202-*****67-1" (display only). */
export function maskCnic(cnic: string | null | undefined): string {
  if (!cnic) return '—';
  const d = cnic.replace(/\D/g, '');
  if (d.length !== 13) return '•••••-•••••••-•';
  return `${d.slice(0, 5)}-*****${d.slice(10, 12)}-${d.slice(12)}`;
}

export function ambulanceLabel(a: Incident['ambulance']): string {
  if (!a) return 'Awaiting unit';
  return `${a.call_sign} (${a.vehicle_type})`;
}

// ── Timeline: derived only from backend timestamps ────────────────────────────
export type TimelineEntry = { at: string | null; title: string; subtitle: string; color: string };

export function buildTimeline(inc: Incident): TimelineEntry[] {
  const t = inc.timeline ?? { assigned_at: null, accepted_at: null, at_scene_at: null, picked_up_at: null, arrived_at: null };
  const where = inc.location?.address || `${inc.location.lat.toFixed(4)}, ${inc.location.lng.toFixed(4)}`;
  const sev = severityInfo(inc.triage?.severity);
  const out: TimelineEntry[] = [
    {
      at: inc.created_at,
      title: 'Emergency reported',
      subtitle: `${where} · AI triage: ${sev.label}${inc.triage?.category ? ` ${inc.triage.category}` : ''}${inc.triage?.source === 'fallback' ? ' (rule-based)' : ''}`,
      color: '#FF2A5F',
    },
  ];
  if (inc.hospital) {
    out.push({ at: inc.created_at, title: `Hospital alerted · ${inc.hospital.name}`, subtitle: 'Patient profile and handover brief sent to ER', color: '#10B981' });
  }
  if (inc.status === 'no_ambulance') {
    out.push({ at: inc.created_at, title: 'No ambulance available', subtitle: 'All units busy or offline. Call 1122.', color: '#FF2A5F' });
  }
  if (t.assigned_at && inc.ambulance) {
    out.push({ at: t.assigned_at, title: `Ambulance assigned · ${inc.ambulance.call_sign}`, subtitle: `${inc.ambulance.service_name} · ${inc.ambulance.vehicle_type}`, color: '#FFB703' });
  }
  if (t.accepted_at) out.push({ at: t.accepted_at, title: 'Crew accepted · en route', subtitle: 'Live GPS tracking active', color: '#00F5D4' });
  if (inc.hospital_status?.acknowledged_at) {
    out.push({ at: inc.hospital_status.acknowledged_at, title: 'ER acknowledged', subtitle: readinessInfo(inc.hospital_status.readiness).label, color: '#10B981' });
  }
  if (t.at_scene_at) out.push({ at: t.at_scene_at, title: 'Crew at scene', subtitle: 'Paramedics with the patient', color: '#00F5D4' });
  if (t.picked_up_at) out.push({ at: t.picked_up_at, title: 'Patient on board', subtitle: `En route to ${inc.hospital?.name ?? 'hospital'}`, color: '#00F5D4' });
  if (t.arrived_at) out.push({ at: t.arrived_at, title: 'Arrived at ER', subtitle: inc.hospital?.name ?? '', color: '#10B981' });
  if (inc.status === 'closed') out.push({ at: null, title: 'Handover complete', subtitle: 'Incident closed by hospital', color: '#64748B' });

  return out
    .map((e, i) => ({ e, i }))
    .sort((a, b) => {
      if (a.e.at === null) return 1;
      if (b.e.at === null) return -1;
      return Date.parse(a.e.at) - Date.parse(b.e.at) || a.i - b.i;
    })
    .map(({ e }) => e);
}

export function gmapsDirections(to: { lat: number; lng: number }, from?: { lat: number; lng: number } | null): string {
  const dest = `${to.lat},${to.lng}`;
  const origin = from ? `&origin=${from.lat},${from.lng}` : '';
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}${origin}&travelmode=driving`;
}
