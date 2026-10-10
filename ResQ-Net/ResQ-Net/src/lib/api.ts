// RescueLink API client. Every backend call in the app goes through here.
// - Bearer tokens only (no cookies), refreshed before expiry and once on 401.
// - Errors become ApiError with a human sentence; HTTP codes are never shown to users.
import { clearSession, getSession, isTokenExpired, saveSession, setNotice } from './auth';
import type {
  Ambulance, CitizenProfile, Hospital, Incident, LatLng, ProfileLimited, Role, Session, Track,
  Capability,
} from './types';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/+$/, '');

export class ApiError extends Error {
  /** HTTP status for program logic only (0 = network). Never render it. */
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error && e.message) return e.message;
  return 'Something went wrong. Please try again.';
}

type AuthMode = 'required' | 'optional' | 'none';
type Opts = { method?: 'GET' | 'POST' | 'PUT'; body?: unknown; auth?: AuthMode; timeoutMs?: number };

// Backend messages are plain sentences; zod ones look like "field: problem; other: problem".
function friendly(status: number, serverMsg: string | undefined): string {
  if (status >= 500) return 'The emergency server hit a problem. Please try again in a moment.';
  const msg = (serverMsg ?? '').trim();
  if (status === 400) {
    if (!msg) return 'Some details are missing or invalid. Please check and try again.';
    if (/^[a-z_.]+: /i.test(msg)) {
      const parts = msg.split('; ').map((p) => {
        const [field, ...rest] = p.split(': ');
        return `${field.replace(/[_.]/g, ' ')} ${rest.join(': ')}`.trim();
      });
      return `Please check: ${parts.join('; ')}.`;
    }
    return msg;
  }
  if (status === 401) return msg || 'Please sign in again.';
  if (status === 403) return msg || "You don't have access to this.";
  if (status === 404) return msg || 'Not found.';
  if (status === 409) return msg || 'This was already updated. Refreshing…';
  return msg || 'Something went wrong. Please try again.';
}

async function rawFetch(path: string, opts: Opts, token: string | null): Promise<Response> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20000);
  try {
    return await fetch(`${API_BASE}${path}`, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: 'no-store',
      signal: ctrl.signal,
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') {
      throw new ApiError('The server is taking too long to respond. Please try again.', 0);
    }
    throw new ApiError("Can't reach the ResQ Net server. Check your connection and try again.", 0);
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError('The server sent an unexpected response. Please try again.', res.status);
  }
}

// ── Session refresh (single flight) ───────────────────────────────────────────
let refreshing: Promise<Session | null> | null = null;

function expireSession() {
  clearSession();
  setNotice('Your session expired. Please sign in again.');
  if (typeof window !== 'undefined' && window.location.pathname !== '/') window.location.href = '/';
}

async function refreshSession(current: Session): Promise<Session | null> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await rawFetch('/api/auth/refresh', { method: 'POST', body: { refresh_token: current.refresh_token } }, null);
        if (!res.ok) return null;
        const s = (await readJson(res)) as Session;
        saveSession(s);
        return s;
      } catch {
        return null;
      } finally {
        setTimeout(() => { refreshing = null; }, 0);
      }
    })();
  }
  return refreshing;
}

async function validToken(mode: AuthMode): Promise<string | null> {
  if (mode === 'none') return null;
  let s = getSession();
  if (!s) {
    if (mode === 'required') {
      expireSession();
      throw new ApiError('Please sign in to continue.', 401);
    }
    return null;
  }
  if (isTokenExpired(s)) {
    const r = await refreshSession(s);
    if (!r) {
      if (mode === 'required') {
        expireSession();
        throw new ApiError('Your session expired. Please sign in again.', 401);
      }
      clearSession();
      return null;
    }
    s = r;
  }
  return s.access_token;
}

export async function api<T>(path: string, opts: Opts = {}): Promise<T> {
  const mode = opts.auth ?? 'required';
  const token = await validToken(mode);
  let res = await rawFetch(path, opts, token);

  if (res.status === 401 && token) {
    const s = getSession();
    const r = s ? await refreshSession(s) : null;
    if (r) {
      res = await rawFetch(path, opts, r.access_token);
    } else if (mode === 'required') {
      expireSession();
      throw new ApiError('Your session expired. Please sign in again.', 401);
    } else {
      clearSession();
      res = await rawFetch(path, opts, null);
    }
  }

  const json = await readJson(res);
  if (!res.ok) {
    const serverMsg = json && typeof json === 'object' ? (json as { error?: string }).error : undefined;
    throw new ApiError(friendly(res.status, serverMsg), res.status);
  }
  return json as T;
}

// ── Endpoints ─────────────────────────────────────────────────────────────────
export type Me = {
  account: Session['account'];
  citizen_profile: CitizenProfile | null;
  hospital: Hospital | null;
  ambulance: Ambulance | null;
};

export type CitizenProfileInput = Omit<CitizenProfile, 'user_id' | 'updated_at'>;

export type ScanResult = {
  extracted: { cnic: string | null; full_name: string | null; date_of_birth: string | null; gender: 'male' | 'female' | 'other' | null };
  confidence: 'high' | 'medium' | 'low';
  source: 'ai' | 'fallback';
  verification?: 'matched' | 'name_mismatch' | 'not_registered' | 'unreadable';
  profile?: ProfileLimited | null;
};

export type CreateIncidentInput = {
  lat: number; lng: number; address?: string | null; description: string;
  reporter_name?: string | null; reporter_phone?: string | null;
  for_self?: boolean; cnic?: string | null;
  scene_image_base64?: string | null; mime_type?: string | null;
};

export type Overview = {
  counts: {
    active_incidents: number; ambulances_online: number; ambulances_available: number;
    live_hospitals: number; hospitals_accepting: number; incidents_today: number;
  };
  ambulances: Ambulance[];
  fleet: Array<{ id: string; call_sign: string; type: string; status: string; position: { lat: number; lng: number } | null; last_seen: string | null }>;
  hospitals: Array<Hospital & { er_beds_available: number; accepting: boolean; capabilities: string[] }>;
  incidents: Array<{
    id: string; ref_code: string; status: string;
    severity: string | null; category: string | null;
    ambulance_call_sign: string | null; hospital_name: string | null;
    location: LatLng;
    triage?: { severity: string | null } | null;
    ambulance?: { call_sign: string } | null;
    hospital?: { name: string } | null;
    track?: { eta_min: number | null; distance_to_patient_km: number | null; distance_to_hospital_km: number | null } | null;
  }>;
};

export type AmbulanceAssignment = {
  incident_id: string;
  ref_code: string;
  status: string;
  triage_severity: string | null;
  patient_name: string | null;
  patient_blood_group: string | null;
  patient_critical_alerts: string[];
  patient_location: { lat: number; lng: number };
  hospital_name: string | null;
  hospital_phone: string | null;
  hospital_location: { lat: number; lng: number } | null;
  eta_min: number | null;
  distance_km: number | null;
  ambulance_position?: { lat: number; lng: number } | null;
};

export type HospitalIncoming = {
  incident_id: string;
  ref_code: string;
  status: string;
  triage_severity: string | null;
  patient_name: string | null;
  patient_blood_group: string | null;
  patient_critical_alerts: string[];
  patient_location: { lat: number; lng: number } | null;
  ambulance_call_sign: string | null;
  ambulance_position: { lat: number; lng: number } | null;
  ambulance_last_seen: string | null;
  hospital_phone: string | null;
  eta_min: number | null;
  distance_km: number | null;
  my_readiness: string | null;
  ai_brief: string | null;
  // full profile fields for hospital view
  full_profile?: import('./types').CitizenProfile | null;
};

export const Api = {
  // auth
  login: (email: string, password: string) =>
    api<Session>('/api/auth/login', { body: { email, password }, auth: 'none' }),
  signup: (email: string, password: string, role: Role, display_name: string, phone?: string) =>
    api<Session>('/api/auth/signup', { body: { email, password, role, display_name, ...(phone ? { phone } : {}) }, auth: 'none' }),
  me: () => api<Me>('/api/me'),

  // citizen
  saveProfile: (p: CitizenProfileInput) => api<CitizenProfile>('/api/citizen/profile', { method: 'PUT', body: p }),
  citizenIncidents: () => api<Incident[]>('/api/citizen/incidents'),

  // AI
  scanCnic: (image_base64: string, mime_type: string, purpose: 'register' | 'identify') =>
    api<ScanResult>('/api/ai/scan-cnic', {
      body: { image_base64, mime_type, purpose },
      auth: purpose === 'register' ? 'required' : 'none',
      timeoutMs: 45000,
    }),

  // incidents
  createIncident: (body: CreateIncidentInput) =>
    api<Incident>('/api/incidents', { body, auth: 'optional', timeoutMs: 60000 }),
  incident: (id: string, auth: AuthMode = 'optional') => api<Incident>(`/api/incidents/${encodeURIComponent(id)}`, { auth }),
  track: (id: string) => api<Track>(`/api/incidents/${encodeURIComponent(id)}/track`, { auth: 'none' }),

  // hospitals
  hospitals: (near?: LatLng | null, q?: string) => {
    const p = new URLSearchParams();
    if (near) p.set('near', `${near.lat.toFixed(5)},${near.lng.toFixed(5)}`);
    if (q && q.trim()) p.set('q', q.trim());
    const qs = p.toString();
    return api<Hospital[]>(`/api/hospitals${qs ? `?${qs}` : ''}`, { auth: 'none' });
  },
  claimHospital: (hospital_id: string) => api<Hospital>('/api/hospital/claim', { body: { hospital_id } }),
  createHospital: (b: { name: string; phone?: string | null; address?: string | null }) =>
    api<Hospital>('/api/hospital/create', { body: { name: b.name, lat: 33.6844, lng: 73.0479, address: b.address, phone: b.phone } }),
  updateHospital: (patch: { capabilities?: Capability[]; er_beds_available?: number; accepting?: boolean; phone?: string | null }) =>
    api<Hospital>('/api/hospital/me', { method: 'PUT', body: patch }),
  hospitalIncoming: () => api<HospitalIncoming[]>('/api/hospital/incoming'),
  setReadiness: (id: string, readiness: 'preparing' | 'ready') =>
    api<Incident>(`/api/hospital/incidents/${encodeURIComponent(id)}/readiness`, { body: { readiness } }),
  closeCase: (id: string) => api<{ ok: true }>(`/api/hospital/incidents/${encodeURIComponent(id)}/close`, { body: {} }),

  // ambulance
  setupAmbulance: (b: { call_sign: string; plate?: string; type?: 'ALS' | 'BLS' }) =>
    api<Ambulance>('/api/ambulance/setup', { body: { call_sign: b.call_sign, vehicle_type: b.type ?? 'BLS', service_name: b.call_sign, plate: b.plate } }),
  setAmbulanceOnline: (online: boolean) =>
    api<Ambulance>('/api/ambulance/status', { method: 'PUT', body: { status: online ? 'available' : 'offline' } }),
  postLocation: (lat: number, lng: number, accuracy_m?: number) =>
    api<{ ok: true }>('/api/ambulance/location', { body: { lat, lng, ...(accuracy_m != null ? { accuracy_m } : {}) } }),
  assignment: () => api<AmbulanceAssignment | null>('/api/ambulance/assignment'),
  respondAssignment: (_incidentId: string, accept: boolean) =>
    accept ? api<AmbulanceAssignment>('/api/ambulance/assignment/accept', { body: {} }) : api<{ ok: true }>('/api/ambulance/assignment/decline', { body: {} }),
  advanceStatus: (_incidentId: string, status: 'at_scene' | 'transporting' | 'arrived') =>
    api<AmbulanceAssignment>('/api/ambulance/assignment/status', { body: { status } }),

  // public control room
  overview: () => api<Overview>('/api/control/overview', { auth: 'none' }),
};
