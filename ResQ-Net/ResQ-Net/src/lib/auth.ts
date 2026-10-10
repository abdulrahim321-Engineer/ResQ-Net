// Session storage + role helpers. Network calls live in lib/api.ts.
import type { Role, Session } from './types';

export type { Role, Session };
export type Account = Session['account'];

const STORAGE_KEY = 'resqnet_session';
const NOTICE_KEY = 'resqnet_notice';

function isValidShape(s: unknown): s is Session {
  if (!s || typeof s !== 'object') return false;
  const o = s as Partial<Session>;
  return (
    typeof o.access_token === 'string' &&
    typeof o.refresh_token === 'string' &&
    typeof o.expires_at === 'number' &&
    // expires_at is UNIX SECONDS. Old demo sessions stored milliseconds: drop them.
    o.expires_at < 1e12 &&
    !o.access_token.startsWith('demo-') &&
    !!o.account && typeof o.account.role === 'string'
  );
}

export function saveSession(session: Session) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(session)); } catch { /* storage blocked */ }
}

export function getSession(): Session | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidShape(parsed)) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearSession() {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

/** True when the access token expires within the next 60 s. expires_at is in seconds. */
export function isTokenExpired(session: Session): boolean {
  return Date.now() / 1000 >= session.expires_at - 60;
}

// One-shot message shown on the login page (e.g. "session expired").
export function setNotice(message: string) {
  try { sessionStorage.setItem(NOTICE_KEY, message); } catch { /* ignore */ }
}
export function takeNotice(): string | null {
  try {
    const m = sessionStorage.getItem(NOTICE_KEY);
    if (m) sessionStorage.removeItem(NOTICE_KEY);
    return m;
  } catch {
    return null;
  }
}

export function getDashboardRoute(role: Role): string {
  switch (role) {
    case 'citizen':   return '/dashboard';
    case 'hospital':  return '/hospital';
    case 'ambulance': return '/ambulance';
    default:          return '/';
  }
}

export const ROLE_META: Record<Role, { label: string; description: string; color: string; icon: string }> = {
  citizen: {
    label: 'Citizen',
    description: 'Register your emergency profile and request ambulance services.',
    color: '#00F5D4',
    icon: '🙋',
  },
  hospital: {
    label: 'Hospital / ER',
    description: 'Manage incoming patients, ER capacity, and team readiness.',
    color: '#10B981',
    icon: '🏥',
  },
  ambulance: {
    label: 'Ambulance Crew',
    description: 'Receive assignments, share live GPS, and update incident status.',
    color: '#FFB703',
    icon: '🚑',
  },
};
